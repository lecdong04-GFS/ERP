/**
 * 최신 발주서양식통합(26년도/11월) 마스터 동기화 스크립트
 * 1) 기존 내장 단가 + 11월 02일 재고조사표 단가를 최신 발주서(442품목, 1369행) Q열에 무손실(JSZip) 병합
 * 2) public/gfs/gfs_embedded.js 및 DB DashboardSnapshot(gfs_master_workbook) 영구 업데이트
 * 3) ERP DB(Partner, Product, ProductPrice, BomHeader, BomDetail)에 신메뉴(더큰)찜닭에당면, 이달의도시락11월) 및 신규 원부자재 16종·BOM·거래처 주기 반영
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import prisma from '../src/lib/prisma';
import {
  getOrderSheetFilePath,
  getAuditFilePath,
  buildAuditMap,
  parseOrderSheetBom,
  inferBomUnit,
  inferMenuKind,
} from '../src/lib/gfs/canonical';
import { canonNormName } from '../src/lib/gfs/norm';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('../public/gfs/jszip.min.js');

async function main() {
  const newOrderPath = getOrderSheetFilePath();
  const auditPath = getAuditFilePath();
  if (!newOrderPath) throw new Error('최신 발주서양식통합 파일을 찾을 수 없습니다.');
  console.log('📦 최신 발주서 경로:', newOrderPath);
  console.log('📋 최신 재고조사표 경로:', auditPath);

  // 1. 기존 gfs_embedded.js에서 단가 사전 추출
  const priceMap = new Map<string, number>();
  const embPath = path.join(process.cwd(), 'public', 'gfs', 'gfs_embedded.js');
  if (fs.existsSync(embPath)) {
    const embText = fs.readFileSync(embPath, 'utf8');
    const m = embText.match(/"([A-Za-z0-9+/=]{100,})"/);
    if (m) {
      const oldWb = XLSX.read(Buffer.from(m[1], 'base64'), { type: 'buffer' });
      const oldWs = oldWb.Sheets['발주시트'];
      if (oldWs) {
        const oldRows: any[][] = XLSX.utils.sheet_to_json(oldWs, { header: 1, defval: '' });
        for (let r = 1; r < oldRows.length; r++) {
          const name = String(oldRows[r][2] || '').trim();
          const price = Number(oldRows[r][16]) || 0;
          if (name && price > 0) {
            priceMap.set(canonNormName(name), price);
          }
        }
      }
    }
  }
  console.log(`기존 내장 발주서 단가 로드: ${priceMap.size}건`);

  // 2. 최신 재고조사표(11월 02일)에서 단가 및 실사 현재고 추출
  let auditMap = new Map<string, any>();
  if (auditPath && fs.existsSync(auditPath)) {
    const auditWb = XLSX.read(fs.readFileSync(auditPath), { type: 'buffer' });
    auditMap = buildAuditMap(auditWb);
    for (const [norm, entry] of auditMap.entries()) {
      if (entry.bagPrice > 0) {
        priceMap.set(norm, entry.bagPrice);
      }
    }
  }
  console.log(`재고조사표 병합 후 총 단가 사전: ${priceMap.size}건`);

  // 3. 최신 발주서 파싱 및 행별 Q열(단가) 업데이트 맵 구성
  const newBuf = fs.readFileSync(newOrderPath);
  const wbNew = XLSX.read(newBuf, { type: 'buffer', cellFormula: true });
  const wsNew = wbNew.Sheets['발주시트'];
  const rowsNew: any[][] = XLSX.utils.sheet_to_json(wsNew, { header: 1, defval: '' });

  const cellUpdates: Record<string, number> = {};
  let injectedPrices = 0;
  let itemRowsCount = 0;

  for (let r = 1; r < rowsNew.length; r++) {
    const row = rowsNew[r];
    const colA = String(row[0] || '').trim();
    const colC = String(row[2] || '').trim();
    if (!colC || colA !== '') continue;
    if (!/^\[/.test(colC) && row[4] === '') continue;

    itemRowsCount++;
    const excelRowNum = r + 1;
    const norm = canonNormName(colC);
    const existingPrice = Number(row[16]) || 0;
    const bestPrice = existingPrice > 0 ? existingPrice : priceMap.get(norm) || 0;
    if (bestPrice > 0) {
      cellUpdates[`Q${excelRowNum}`] = bestPrice;
      injectedPrices++;
    }
  }
  console.log(`발주시트 원부자재 ${itemRowsCount}개 중 단가 주입: ${injectedPrices}개`);

  // 4. JSZip으로 원본 서식·수식·시트 100% 보존한 채 Q열 단가만 무손실 주입
  const zip = await JSZip.loadAsync(newBuf);
  const sheetXmlPath = 'xl/worksheets/sheet5.xml';
  if (zip.file(sheetXmlPath)) {
    let xml = await zip.file(sheetXmlPath).async('string');
    const existingRefs = new Set<string>();
    const cellRegex = /<c\s+([^>]*?r="([A-Z]+)(\d+)"[^>]*?)(?:>([\s\S]*?)<\/c>|\/>)/g;
    xml = xml.replace(cellRegex, (match: string, attrs: string, col: string, row: string) => {
      const ref = col + row;
      if (Object.prototype.hasOwnProperty.call(cellUpdates, ref)) {
        existingRefs.add(ref);
        const val = cellUpdates[ref];
        const sMatch = attrs.match(/s="([^"]+)"/);
        const sAttr = sMatch ? ` s="${sMatch[1]}"` : '';
        return `<c r="${ref}"${sAttr}><v>${val}</v></c>`;
      }
      return match;
    });

    // 만약 Q열 셀 자체가 비어있던 행이 있으면 <row r="N"> 닫기 직전에 <c r="QN"><v>price</v></c> 삽입
    const rowRegex = /<row\s+[^>]*?r="(\d+)"[^>]*?>([\s\S]*?)<\/row>/g;
    xml = xml.replace(rowRegex, (match: string, rNum: string, inner: string) => {
      const ref = `Q${rNum}`;
      if (Object.prototype.hasOwnProperty.call(cellUpdates, ref) && !existingRefs.has(ref)) {
        const val = cellUpdates[ref];
        return match.replace(/<\/row>$/, `<c r="${ref}"><v>${val}</v></c></row>`);
      }
      return match;
    });

    zip.file(sheetXmlPath, xml);
  }

  const enrichedBuf: Buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  const base64 = enrichedBuf.toString('base64');

  // 5. public/gfs/gfs_embedded.js 업데이트
  const newEmbContent = `// Auto-generated embedded GFS.xlsx (26년도 11월 최신 발주서양식통합 + 단가 병합본)\nvar EMBEDDED_GFS_BASE64 = "${base64}";\nif (typeof window !== 'undefined') { window.EMBEDDED_GFS_BASE64 = EMBEDDED_GFS_BASE64; }\n`;
  fs.writeFileSync(embPath, newEmbContent, 'utf8');
  console.log(`✅ public/gfs/gfs_embedded.js 업데이트 완료 (${(base64.length / 1024).toFixed(1)} KB)`);

  // 6. DB DashboardSnapshot(gfs_master_workbook) 영구 저장
  const masterFileName = '★★발주서양식통합★★(정준오)(11월최신본).xlsx';
  const asOf = '2026-11-02';
  await prisma.dashboardSnapshot.upsert({
    where: { key: 'gfs_master_workbook' },
    update: {
      asOf,
      payload: {
        fileName: masterFileName,
        base64,
        asOf,
        uploadedBy: '시스템 동기화',
        itemCount: itemRowsCount,
        updatedAt: new Date().toISOString(),
      },
    },
    create: {
      key: 'gfs_master_workbook',
      asOf,
      payload: {
        fileName: masterFileName,
        base64,
        asOf,
        uploadedBy: '시스템 동기화',
        itemCount: itemRowsCount,
        updatedAt: new Date().toISOString(),
      },
    },
  });
  console.log(`✅ PostgreSQL DashboardSnapshot(gfs_master_workbook) 영구 저장 완료`);

  // 7. ERP DB (Partner / Product / ProductPrice / BomHeader / BomDetail) 동기화
  const bomMaterials = parseOrderSheetBom(wbNew);
  console.log(`🔍 발주시트 BOM 자재 파싱: ${bomMaterials.length}개`);

  const allPartners = await prisma.partner.findMany();
  const partnerByName = new Map(allPartners.map((p) => [p.name.replace(/\s+/g, ''), p]));

  const allProducts = await prisma.product.findMany();
  const existingCodes = new Set(allProducts.map((p) => p.productCode));
  const productByNorm = new Map<string, (typeof allProducts)[number]>();
  for (const p of allProducts) {
    productByNorm.set(canonNormName(p.name), p);
    productByNorm.set(p.name.replace(/\s+/g, ''), p);
  }

  let nextProdSeq = allProducts.length + 500;
  const allocCode = (prefix: string): string => {
    while (true) {
      nextProdSeq++;
      const c = `${prefix}-${String(nextProdSeq).padStart(4, '0')}`;
      if (!existingCodes.has(c)) {
        existingCodes.add(c);
        return c;
      }
    }
  };
  let createdFinishedCount = 0;
  let createdMaterialCount = 0;
  let updatedMaterialCount = 0;

  // 7-A. 신메뉴(완성품) 자동 등록 (더큰)찜닭에당면, 이달의도시락11월 등)
  const menuNames = new Set<string>();
  for (const bm of bomMaterials) {
    for (const m of bm.menus) {
      if (
        m.menu &&
        m.menu.length >= 2 &&
        !/취반실|튀김실|공통|일사용량|데침|염수|\(D-[12]\)|계산기|전체물량|시트|참고|이용|소진시|삭제|반숙란|단무지|참치/.test(
          m.menu
        )
      ) {
        menuNames.add(m.menu.replace(/\s*\d+\/\d+삭제.*$/, '').trim());
      }
    }
  }

  for (const menuName of menuNames) {
    if (!menuName) continue;
    const norm = canonNormName(menuName);
    const stripped = menuName.replace(/\s+/g, '');
    let prod = productByNorm.get(norm) || productByNorm.get(stripped);
    if (!prod) {
      const code = allocCode('FG-2611');
      prod = await prisma.product.create({
        data: {
          productCode: code,
          name: menuName,
          category: '완성품',
          kind: inferMenuKind(menuName) || '도시락',
          unit: 'ea',
          boxQty: 1,
          status: '정상',
          remark: '11월 최신 발주서 BOM 신메뉴 자동 등록',
        },
      });
      productByNorm.set(norm, prod);
      productByNorm.set(stripped, prod);
      createdFinishedCount++;
      console.log(`  🍱 신메뉴 완성품 등록: [${code}] ${menuName}`);
    }
  }

  // 7-B. 원부자재 등록/업데이트 및 BOM 연결
  let bomLinksCreated = 0;
  for (const bm of bomMaterials) {
    if (!bm.name || bm.name.length < 2 || /^\d+$/.test(bm.name)) continue;
    const norm = canonNormName(bm.name);
    const stripped = bm.name.replace(/\s+/g, '');
    const auditEntry = auditMap.get(norm);
    const bestPrice = bm.bagPrice > 0 ? bm.bagPrice : priceMap.get(norm) || 0;
    const packUnit = bm.packUnit > 0 ? Math.round(bm.packUnit) : auditEntry?.packUnit || 1;

    // 창고 추론
    let wh = auditEntry?.warehouse || '';
    if (!wh) {
      const mWh = bm.name.match(/^\[(냉장1?|냉장2?|냉동|상온|부자재)\]/);
      if (mWh) wh = mWh[1] === '냉장' ? '냉장1' : mWh[1];
      else wh = '부자재';
    }
    const category = wh === '부자재' ? '부자재' : '원재료';

    // 거래처 헤더에서 거래처명·리드타임(D-1/D-2)·발주요일 파싱
    let partnerId: string | null = null;
    if (bm.supplierHeader) {
      const supName = bm.supplierHeader
        .replace(/\(D-[12]\)/gi, '')
        .replace(/월|화|수|목|금|토|일/g, '')
        .trim()
        .replace(/\s+/g, '');
      const foundPartner = partnerByName.get(supName);
      if (foundPartner) {
        partnerId = foundPartner.id;
      }
    }

    let matProd = productByNorm.get(norm) || productByNorm.get(stripped);
    if (!matProd) {
      const code = allocCode('RM-2611');
      matProd = await prisma.product.create({
        data: {
          productCode: code,
          name: bm.name,
          category,
          unit: wh === '부자재' ? '매' : '봉',
          boxQty: packUnit,
          warehouse: wh,
          partnerId,
          status: '정상',
          remark: bm.supplierHeader || '11월 최신 발주서 신규 등록',
        },
      });
      if (bestPrice > 0) {
        await prisma.productPrice.create({
          data: {
            productId: matProd.id,
            purchasePrice: bestPrice,
            effectiveDate: '2026-11-02',
            remark: '11월 발주서 기준 단가',
          },
        });
      }
      productByNorm.set(norm, matProd);
      productByNorm.set(stripped, matProd);
      createdMaterialCount++;
      console.log(`  📦 신규 원부자재 등록: [${code}] ${bm.name} (입수: ${packUnit}, 창고: ${wh})`);
    } else {
      // 입수량 또는 창고가 비어있으면 최신 발주서 기준으로 보강
      if ((packUnit > 1 && matProd.boxQty <= 1) || (!matProd.warehouse && wh)) {
        await prisma.product.update({
          where: { id: matProd.id },
          data: {
            boxQty: packUnit > 1 ? packUnit : matProd.boxQty,
            warehouse: matProd.warehouse || wh,
            partnerId: matProd.partnerId || partnerId,
          },
        });
        updatedMaterialCount++;
      }
    }

    // 신메뉴(더큰)찜닭에당면, 이달의도시락11월) 및 신규 자재에 대한 BOM 연결 보강
    for (const m of bm.menus) {
      const cleanMenuName = m.menu.replace(/\s*\d+\/\d+삭제.*$/, '').trim();
      if (!cleanMenuName || !(m.perUnit > 0)) continue;
      if (!/찜닭에당면|이달의도시락11월/.test(cleanMenuName) && createdMaterialCount === 0) continue;

      const parentProd =
        productByNorm.get(canonNormName(cleanMenuName)) ||
        productByNorm.get(cleanMenuName.replace(/\s+/g, ''));
      if (!parentProd) continue;

      let header = await prisma.bomHeader.findFirst({
        where: { parentProductId: parentProd.id },
      });
      if (!header) {
        header = await prisma.bomHeader.create({
          data: {
            parentProductId: parentProd.id,
            version: '26.11',
            effectiveDate: '2026-11-02',
            remark: '11월 최신 발주서 BOM 동기화',
          },
        });
      }

      const existingDetail = await prisma.bomDetail.findFirst({
        where: {
          bomHeaderId: header.id,
          childProductId: matProd.id,
        },
      });
      if (!existingDetail) {
        await prisma.bomDetail.create({
          data: {
            bomHeaderId: header.id,
            childProductId: matProd.id,
            level: 3,
            unitQty: m.perUnit,
            unit: inferBomUnit(bm.name),
            yieldRate: 100,
            remark: '11월 발주서 BOM',
          },
        });
        bomLinksCreated++;
      }
    }
  }

  console.log(
    `🎉 동기화 완료: 신메뉴 완성품 +${createdFinishedCount}종, 신규 원부자재 +${createdMaterialCount}종, 기존 자재 보강 ${updatedMaterialCount}종, 신규 BOM 연결 +${bomLinksCreated}건`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

