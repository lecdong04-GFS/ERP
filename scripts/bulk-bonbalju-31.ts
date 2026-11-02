// @ts-nocheck
// 31개 본발주 일괄 등록 (서버 스크립트, intake/route.ts와 동일 로직)
// 실행: node --experimental-strip-types scripts/bulk-bonbalju-31.ts
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import prisma from '../src/lib/prisma.ts';
import { normName } from '../src/lib/gfs/canonical.ts';
import { parseBonbaljuRows } from '../src/lib/gfs/bonbaljuIntake.ts';
import { makeDocNo } from '../src/lib/kst.ts';

const BASE = '제작관련 데이터/2026년 10월 ERP/본발주';
const CENTER = 'GSR-001';
const UPLOAD = '엑셀(본발주)';
const CREATED_BY = 'BULK-31(본발주)';

async function main() {
  const files = fs.readdirSync(BASE).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~')).sort();
  console.log(`대상 ${files.length}개`);
  const report: any[] = [];
  let totalQtyAll = 0;

  // 제품 캐시 (code -> product, name -> product)
  const prodByCode = new Map<string, any>();
  const prodByName = new Map<string, any>();
  const allProds = await prisma.product.findMany({ select: { id: true, productCode: true, name: true } });
  for (const p of allProds) {
    prodByCode.set(p.productCode, p);
    if (!prodByName.has(p.name)) prodByName.set(p.name, p);
  }
  const candNorm = new Map<string, any>();
  for (const p of allProds) candNorm.set(normName(p.name), p);

  for (const f of files) {
    try {
      const wb = XLSX.readFile(path.join(BASE, f));
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const parsed = parseBonbaljuRows(rows);
      if (!parsed) {
        report.push({ file: f, status: 'FAIL', reason: '파싱 실패' });
        console.log(`FAIL ${f} 파싱실패`);
        continue;
      }
      const { orderDate, items, totalQty, totalAmount } = parsed;

      // 멱등: 같은 날짜+센터+본발주 삭제 후 재생성 (Delivery 연결 시 차단)
      const linked = await prisma.salesOrder.findMany({
        where: { orderDate, centerCode: CENTER, uploadMethod: { contains: '본발주' } },
        select: { id: true, orderNo: true, _count: { select: { deliveries: true } } },
      });
      const blocked = linked.filter((o) => o._count.deliveries > 0);
      if (blocked.length > 0) {
        report.push({ file: f, orderDate, status: 'SKIP', reason: `납품연결 ${blocked.length}건` });
        console.log(`SKIP ${f} ${orderDate} 납품연결`);
        continue;
      }
      if (linked.length > 0) {
        await prisma.salesOrder.deleteMany({ where: { orderDate, centerCode: CENTER, uploadMethod: { contains: '본발주' } } });
      }

      let matched = 0;
      let created = 0;
      const detailInputs: { productId: number; qty1: number; qty2: number; total: number; unitPrice: number }[] = [];
      for (const it of items) {
        let prod = (it.productCode && prodByCode.get(it.productCode)) || prodByName.get(it.menuName) || candNorm.get(normName(it.menuName));
        if (prod) {
          prod = await prisma.product.findUnique({ where: { id: prod.id } });
          matched++;
        } else {
          const code = it.productCode || `FG-${orderDate.replace(/-/g, '').slice(2)}-${Date.now().toString().slice(-4)}`;
          prod = await prisma.product.create({
            data: { productCode: code, name: it.menuName, spec: '', unit: 'ea', category: '완성품', kind: '', boxQty: 1, remark: '본발주 bulk 자동생성' },
          });
          prodByCode.set(prod.productCode, prod);
          prodByName.set(prod.name, prod);
          candNorm.set(normName(prod.name), prod);
          created++;
        }
        detailInputs.push({ productId: prod.id, qty1: it.qty1, qty2: it.qty2, total: it.total, unitPrice: it.unitPrice || 0 });
      }

      const orderNo = makeDocNo('SO', orderDate);
      let sumQty = 0;
      let sumAmt = 0;
      const details = detailInputs.map((d) => {
        sumQty += d.total;
        const amt = Math.round(d.total * d.unitPrice);
        sumAmt += amt;
        return { productId: d.productId, orderQty1: d.qty1, orderQty2: d.qty2, totalQty: d.total, unitPrice: d.unitPrice, amount: amt };
      });

      await prisma.salesOrder.create({
        data: { orderNo, orderDate, centerCode: CENTER, shift: '전체', orderType: '정규', uploadMethod: UPLOAD, status: '접수', totalAmount: sumAmt, totalQty: sumQty, createdBy: CREATED_BY, details: { create: details } },
      });
      await prisma.systemLog.create({
        data: { logDate: new Date().toISOString(), loginId: 'bulk', userName: 'BULK-31', action: '수주일괄등록', menuId: 'sales-order-upload', menuName: '주문등록GSR(upload)', detail: `본발주 bulk ${orderDate} ${detailInputs.length}건 (${orderNo}, 매칭 ${matched}, 신규 ${created}) ← ${f}` },
      }).catch(() => {});

      totalQtyAll += sumQty;
      report.push({ file: f, orderDate, status: 'OK', items: detailInputs.length, matched, created, qty: sumQty, amt: sumAmt });
      console.log(`OK ${f} → ${orderDate} ${detailInputs.length}품목/${sumQty}EA (매칭${matched}/신규${created})`);
    } catch (e: any) {
      report.push({ file: f, status: 'FAIL', reason: e.message });
      console.log(`FAIL ${f} ${e.message}`);
    }
  }

  console.log(`\n완료: OK ${report.filter((r) => r.status === 'OK').length}/${report.length}, 총수량 ${totalQtyAll}EA`);
  const okDates = report.filter((r) => r.status === 'OK').map((r) => r.orderDate).sort();
  console.log('일자:', okDates.join(','));
  await prisma.$disconnect();
  const fails = report.filter((r) => r.status !== 'OK');
  if (fails.length > 0) {
    console.log('실패/스킵:', JSON.stringify(fails, null, 1));
    process.exitCode = 1;
  }
}

main();
