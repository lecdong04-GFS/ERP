import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { isDummyBomDetail, menuKey } from '../src/lib/gfs/bomMatch';

const prisma = new PrismaClient();

const DIR_PATH = '/Users/bunker/GFS-ERP/제작관련 데이터/누락된 bom';

// 단종/중복 자재 코드 -> 정본 자재 Product ID 매핑
const CANONICAL_CHILD_ID_BY_CODE: Record<string, number> = {
  '20001846': 53, // [냉동] 당근채(10kg/box) -> [냉장] 당근채(4kg*3봉 - 1박스)
  '20193250': 309, // 신슈단무지(꼬들단무지) 중복 -> 정본 pid=309
  '30002556': 337, // [상온] 오이피클랠리쉬 -> [상온] 늘푸른피클랠리쉬
};

function cleanGyeName(raw: string): string {
  if (!raw) return '';
  const parts = raw.split(':');
  const name = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
  return name.trim();
}

async function main() {
  console.log('=== 11월 신메뉴 BOM 평탄화(1개당 g/매/장) 동기화 시작 ===');

  if (!fs.existsSync(DIR_PATH)) {
    throw new Error(`Directory not found: ${DIR_PATH}`);
  }

  const files = fs.readdirSync(DIR_PATH).filter((f) => f.endsWith('.xls') || f.endsWith('.xlsx'));
  console.log(`발견된 BOM 엑셀 파일: ${files.length}개\n`);

  const gyes = await prisma.gyeMaster.findMany();
  const gyeMap = new Map<string, string>();
  for (const g of gyes) {
    gyeMap.set(g.name.replace(/\s+/g, ''), g.id);
  }

  const findGyeId = (rawGye: string): string | null => {
    if (!rawGye) return null;
    const cleaned = cleanGyeName(rawGye).replace(/\s+/g, '');
    if (gyeMap.has(cleaned)) return gyeMap.get(cleaned)!;
    for (const [name, id] of gyeMap.entries()) {
      if (cleaned.includes(name) || name.includes(cleaned)) return id;
    }
    return null;
  };

  // 이미 정본 BOM(BH#1..75)이 존재하는 메뉴는 중복 헤더 생성 방지
  const existingHeaders = await prisma.bomHeader.findMany({
    where: { isUsed: true },
    include: { parentProduct: true },
    orderBy: { id: 'asc' },
  });
  const headerByMenuKey = new Map<string, (typeof existingHeaders)[number]>();
  for (const h of existingHeaders) {
    const mk = menuKey(h.parentProduct?.name || '');
    if (mk && !headerByMenuKey.has(mk)) headerByMenuKey.set(mk, h);
  }

  let totalHeadersUpdated = 0;
  let totalDetailsCreated = 0;

  for (const f of files) {
    const filePath = path.join(DIR_PATH, f);
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any[]>(ws, { header: 1 });

    if (rows.length < 4) continue;

    const row3 = rows[3] || [];
    const parentCode = String(row3[11] || '').trim();
    const parentName = String(row3[12] || '').trim();
    const mk = menuKey(parentName);

    const existingCanon = headerByMenuKey.get(mk);
    if (existingCanon && existingCanon.id <= 75) {
      console.log(`▶ [${f}] 정본 BOM 헤더(BH#${existingCanon.id} ${existingCanon.parentProduct.name}) 이미 존재 -> 중복 생성 건너뜀`);
      continue;
    }

    // 다단계 트리 평탄화: 각 레벨의 (투입량 / 생산기준량 / (레시피수율/100)) 누적 곱셈 후 원부자재(leaf)만 추출
    interface StackNode {
      level: number;
      factorPerFg: number;
    }
    const stack: StackNode[] = [{ level: 0, factorPerFg: 1 }];
    const leafMap = new Map<
      number,
      { productId: number; unitQty: number; unit: string; yieldRate: number; gyeId: string | null; remark: string }
    >();

    for (let i = 4; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const code = String(r[11] || '').trim();
      const name = String(r[12] || '').trim();
      if (!name || name === 'null') continue;

      const level = Number(r[0]) || 1;
      const gye = String(r[14] || '').trim();
      const type = String(r[15] || '원재료').trim();
      const baseQty = Number(r[16]) || 1;
      const rawUnitQty = Number(r[17]) || 0;
      const rawUnit = String(r[18] || 'g').trim();
      const itemYield = Number(r[20]) || 100;
      const recipeYield = Number(r[21]) || 100;

      // 개봉 더미행(1봉(팩), 1통 등) 제외
      if (isDummyBomDetail(rawUnit, rawUnitQty)) continue;

      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      const parentFactor = stack[stack.length - 1].factorPerFg;

      if (type === '반제품') {
        const subFactor =
          baseQty > 0 ? (parentFactor * rawUnitQty) / (baseQty * (recipeYield > 0 ? recipeYield / 100 : 1)) : 0;
        stack.push({ level, factorPerFg: subFactor });
        continue;
      }

      // 원재료/부자재 leaf: 완성품 1개당 소요량(g/매/장)으로 환산
      let unit = rawUnit;
      let qtyInBase = rawUnitQty;
      if (unit.toLowerCase() === 'kg') {
        qtyInBase = rawUnitQty * 1000;
        unit = 'g';
      }
      const perFgQty =
        baseQty > 0
          ? (parentFactor * qtyInBase) / (baseQty * (itemYield > 0 ? itemYield / 100 : 1))
          : 0;
      if (!(perFgQty > 0)) continue;

      let pId = CANONICAL_CHILD_ID_BY_CODE[code] || 0;
      if (!pId) {
        const p = await prisma.product.findFirst({
          where: {
            isUsed: true,
            category: { notIn: ['완성품', '반제품'] },
            OR: [...(code ? [{ productCode: code }] : []), { name }],
          },
        });
        if (!p) continue;
        pId = p.id;
      }

      const cur = leafMap.get(pId);
      if (cur) {
        cur.unitQty = Math.round((cur.unitQty + perFgQty) * 1000) / 1000;
      } else {
        leafMap.set(pId, {
          productId: pId,
          unitQty: Math.round(perFgQty * 1000) / 1000,
          unit,
          yieldRate: 100,
          gyeId: findGyeId(gye),
          remark: gye,
        });
      }
    }

    let masterProd = await prisma.product.findFirst({
      where: {
        category: '완성품',
        OR: [...(parentCode ? [{ productCode: parentCode }] : []), { name: parentName }],
      },
    });
    if (!masterProd) continue;

    const header =
      existingCanon ||
      (await prisma.bomHeader.create({
        data: {
          parentProductId: masterProd.id,
          version: '26.11',
          effectiveDate: '2026-11-05',
          remark: `11월 신메뉴 평탄화 레시피 (${f})`,
          isUsed: true,
        },
        include: { parentProduct: true },
      }));

    await prisma.bomDetail.deleteMany({ where: { bomHeaderId: header.id } });
    let sortOrder = 0;
    for (const c of leafMap.values()) {
      await prisma.bomDetail.create({
        data: {
          bomHeaderId: header.id,
          childProductId: c.productId,
          level: 3,
          unitQty: c.unitQty,
          unit: c.unit,
          yieldRate: c.yieldRate,
          gyeId: c.gyeId,
          remark: c.remark,
          sortOrder: ++sortOrder,
        },
      });
      totalDetailsCreated++;
    }
    totalHeadersUpdated++;
  }

  console.log(`완료: 헤더 ${totalHeadersUpdated}개, 상세 ${totalDetailsCreated}건`);
}

main()
  .catch((e) => {
    console.error('BOM Import Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

