import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const DIR_PATH = '/Users/bunker/GFS-ERP/제작관련 데이터/누락된 bom';

function cleanGyeName(raw: string): string {
  if (!raw) return '';
  const parts = raw.split(':');
  const name = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
  return name.trim();
}

async function main() {
  console.log('=== 11월 신메뉴 누락 BOM 전산 일괄 동기화 시작 ===');

  if (!fs.existsSync(DIR_PATH)) {
    throw new Error(`Directory not found: ${DIR_PATH}`);
  }

  const files = fs.readdirSync(DIR_PATH).filter(f => f.endsWith('.xls') || f.endsWith('.xlsx'));
  console.log(`발견된 BOM 엑셀 파일: ${files.length}개\n`);

  // 1. 공정(계) 마스터 맵 로드
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

  let totalHeadersCreated = 0;
  let totalDetailsCreated = 0;
  let totalProductsCreated = 0;

  for (const f of files) {
    const filePath = path.join(DIR_PATH, f);
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any[]>(ws, { header: 1 });

    if (rows.length < 4) {
      console.warn(`[SKIP] 파일 데이터 부족: ${f}`);
      continue;
    }

    const row3 = rows[3] || [];
    const parentCode = String(row3[11] || '').trim();
    const parentName = String(row3[12] || '').trim();
    const parentType = String(row3[15] || '완성품').trim();

    console.log(`\n▶ [${f}] 처리 중...`);
    console.log(`   - 완성품명: ${parentName} (코드: ${parentCode})`);

    // 1) 자재(원부자재 및 반제품) 목록 파싱
    interface ParsedChild {
      childCode: string;
      childName: string;
      childGye: string;
      childType: string;
      level: number;
      unitQty: number;
      unit: string;
      yieldRate: number;
    }

    const childList: ParsedChild[] = [];
    for (let i = 4; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const code = String(r[11] || '').trim();
      const name = String(r[12] || '').trim();
      if (!name || name === 'null') continue;

      const level = Number(r[0]) || 3;
      const gye = String(r[14] || '').trim();
      const type = String(r[15] || '원재료').trim();
      const unitQty = Number(r[17]) || 0;
      const unit = String(r[18] || 'g').trim();
      const yieldRate = Number(r[20]) || 100;

      childList.push({
        childCode: code,
        childName: name,
        childGye: gye,
        childType: type,
        level,
        unitQty,
        unit,
        yieldRate,
      });
    }

    console.log(`   - 파싱된 하위 자재/반제품 수: ${childList.length}개`);

    // 2) 각 자재 Product DB 조회 및 없으면 생성
    const resolvedChildren: Array<{
      productId: number;
      level: number;
      unitQty: number;
      unit: string;
      yieldRate: number;
      gyeId: string | null;
      remark: string;
      sortOrder: number;
    }> = [];

    for (let idx = 0; idx < childList.length; idx++) {
      const ch = childList[idx];
      let p = await prisma.product.findFirst({
        where: {
          OR: [
            ...(ch.childCode ? [{ productCode: ch.childCode }] : []),
            { name: ch.childName },
          ],
        },
      });

      if (!p) {
        p = await prisma.product.create({
          data: {
            productCode: ch.childCode || `MAT-${Date.now()}-${idx}`,
            name: ch.childName,
            category: ch.childType === '반제품' ? '반제품' : '원재료',
            unit: ch.unit || 'g',
            status: '정상',
            isUsed: true,
            remark: `신메뉴 BOM 자재 자동등록 (${f})`,
          },
        });
        totalProductsCreated++;
      }

      resolvedChildren.push({
        productId: p.id,
        level: ch.level,
        unitQty: ch.unitQty,
        unit: ch.unit,
        yieldRate: ch.yieldRate,
        gyeId: findGyeId(ch.childGye),
        remark: ch.childGye,
        sortOrder: idx + 1,
      });
    }

    // 3) 이 완제품에 매핑되어야 할 모든 Product ID 수집
    //    - 마스터 대표 완제품 (없으면 생성)
    //    - 수주에 들어오는 1편, 2편, (주문) 변형 상품들
    const targetProductIds = new Set<number>();

    // 3-1) 마스터 상품
    let masterProd = await prisma.product.findFirst({
      where: {
        OR: [
          ...(parentCode ? [{ productCode: parentCode }] : []),
          { name: parentName },
        ],
      },
    });

    if (!masterProd) {
      masterProd = await prisma.product.create({
        data: {
          productCode: parentCode || `FG-${Date.now()}`,
          name: parentName,
          category: '완성품',
          unit: 'ea',
          status: '정상',
          isUsed: true,
          remark: `11월 신메뉴 레시피 정본 (${f})`,
        },
      });
      totalProductsCreated++;
    }
    targetProductIds.add(masterProd.id);

    // 3-2) 1편, 2편, (주문) 관련 수주 상품들 검색 및 추가
    const variants = await prisma.product.findMany({
      where: {
        name: { contains: parentName },
      },
    });
    for (const v of variants) {
      targetProductIds.add(v.id);
    }

    console.log(`   - BOM을 연동할 상품 대상: ${targetProductIds.size}개 (${parentName} 및 1편/2편/(주문) 포함)`);

    // 4) 각 대상 Product에 대해 BomHeader & BomDetail 동기화
    for (const prodId of targetProductIds) {
      // 기존 BOM이 있으면 삭제 후 재생성 (클린 동기화)
      const existingHeaders = await prisma.bomHeader.findMany({
        where: { parentProductId: prodId },
        select: { id: true },
      });

      if (existingHeaders.length > 0) {
        await prisma.bomDetail.deleteMany({
          where: { bomHeaderId: { in: existingHeaders.map(h => h.id) } },
        });
        await prisma.bomHeader.deleteMany({
          where: { id: { in: existingHeaders.map(h => h.id) } },
        });
      }

      // 새 BomHeader 생성
      const header = await prisma.bomHeader.create({
        data: {
          parentProductId: prodId,
          version: '26.11',
          effectiveDate: '2026-11-05',
          remark: `11월 신메뉴 레시피 동기화 (${f})`,
          isUsed: true,
        },
      });
      totalHeadersCreated++;

      // BomDetail 일괄 생성
      await prisma.bomDetail.createMany({
        data: resolvedChildren.map(c => ({
          bomHeaderId: header.id,
          childProductId: c.productId,
          level: c.level,
          unitQty: c.unitQty,
          unit: c.unit,
          yieldRate: c.yieldRate,
          gyeId: c.gyeId,
          remark: c.remark,
          sortOrder: c.sortOrder,
        })),
      });
      totalDetailsCreated += resolvedChildren.length;
    }
  }

  console.log('\n=============================================');
  console.log('🎉 9대 신메뉴 BOM 전산 일괄 동기화 완료!');
  console.log(`- 생성/동기화된 BOM Header 수: ${totalHeadersCreated}개`);
  console.log(`- 등록된 레시피 원부자재 Detail 수: ${totalDetailsCreated}개`);
  console.log(`- 신규 등록된 Product 수: ${totalProductsCreated}개`);
  console.log('=============================================\n');
}

main()
  .catch((e) => {
    console.error('BOM Import Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

