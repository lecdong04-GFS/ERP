// @ts-nocheck
// =============================================================================
// 2026년 10월 미출(미납) 엑셀 31개 파일 일괄 업로드 스크립트
// 대상 폴더: 2026년 10월 ERP/미출 (미출1001.xlsx ~ 미출1031.xlsx)
// 실행: node --experimental-strip-types scripts/batch-upload-michul-october.ts
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import prisma from '../src/lib/prisma.ts';
import { parseMichulRows } from '../src/lib/gfs/michulIntake.ts';
type MichulItem = any;

const DIR = '2026년 10월 ERP/미출';

const CENTER_NAME_MAP: Record<string, string> = {
  'C60810': '양산조리센터',
  'C68110': '부산조리센터',
  'CVV20': '(주)지에스리테일 해인CVS',
  'CVV25': '(주)지에스리테일 진주일배',
  'CVV57': '(주)지에스리테일 김해일배',
  'CVV58': '(주)지에스리테일 김해2일배',
  'CVV65': '㈜지에스리테일 익산일배',
  'CVV83': '지에스리테일 경산저온',
  'CVV84': '㈜지에스리테일 경산2저온',
  'CVV95': '(주)지에스리테일 신광주저온',
  'CVV96': '(주)지에스리테일 신광주2저온',
  'CVV97': '(주)지에스리테일 경산3저온',
};

async function main() {
  console.log('🚀 [2026년 10월 미출 데이터 일괄 업로드 시작]');
  console.log(`📂 대상 경로: ${DIR}`);

  if (!fs.existsSync(DIR)) {
    console.error(`❌ 폴더를 찾을 수 없습니다: ${DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.xlsx') && !f.startsWith('~') && !f.startsWith('.'))
    .sort();

  console.log(`총 ${files.length}개 엑셀 파일 발견.`);

  let totalUploadedFiles = 0;
  let totalUploadedStores = 0;
  let totalUploadedItems = 0;
  let grandTotalOrderQty = 0;
  let grandTotalDelivQty = 0;
  let grandTotalUndelivQty = 0;
  let grandTotalOrderAmt = 0;
  let grandTotalDelivAmt = 0;
  let grandTotalUndelivAmt = 0;

  const dateSummaryList: Array<{
    file: string;
    tradeDate: string;
    stores: number;
    items: number;
    undelivQty: number;
    undelivAmt: number;
  }> = [];

  for (const file of files) {
    const filePath = path.join(DIR, file);
    try {
      const wb = XLSX.readFile(filePath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      const parsed = parseMichulRows(rows, file);
      if (!parsed || parsed.items.length === 0) {
        console.warn(`⚠️ [${file}] 파싱 가능한 미출 데이터가 없습니다.`);
        continue;
      }

      const { tradeDate, items } = parsed;

      // 센터별 그룹화
      const byCenter = new Map<
        string,
        {
          storeCode: string;
          storeName: string;
          provQty: number;
          provAmt: number;
          delivQty: number;
          delivAmt: number;
          undelivQty: number;
          undelivAmt: number;
          items: MichulItem[];
        }
      >();

      for (const it of items) {
        const rawCode = String(it.storeCode || '').trim().replace(/\u00a0/g, '').replace(/\s+/g, '');
        const cleanStoreCode = rawCode || 'GSR-001';
        const cleanStoreName =
          CENTER_NAME_MAP[cleanStoreCode] ||
          String(it.storeName || '').trim().replace(/\u00a0/g, ' ') ||
          cleanStoreCode;

        const centerKey = cleanStoreCode;
        let grp = byCenter.get(centerKey);
        if (!grp) {
          grp = {
            storeCode: cleanStoreCode,
            storeName: cleanStoreName,
            provQty: 0,
            provAmt: 0,
            delivQty: 0,
            delivAmt: 0,
            undelivQty: 0,
            undelivAmt: 0,
            items: [],
          };
          byCenter.set(centerKey, grp);
        }
        grp.provQty += Math.max(0, Number(it.orderQty) || 0);
        grp.provAmt += Math.max(0, Number(it.orderAmt) || 0);
        grp.delivQty += Math.max(0, Number(it.delivQty) || 0);
        grp.delivAmt += Math.max(0, Number(it.delivAmt) || 0);
        grp.undelivQty += Math.max(0, Number(it.undelivQty) || 0);
        grp.undelivAmt += Math.max(0, Number(it.undelivAmt) || 0);
        grp.items.push(it);
      }

      const dateKey = tradeDate.replace(/-/g, '');
      const batchTag = 'OCT';

      // DB 트랜잭션 저장 (정합성 보장)
      await prisma.$transaction(
        async (tx) => {
          // 1. 기존 해당 일자 미출분 납품/가매출 레코드 삭제(멱등성 보장)
          const oldDeliveries = await tx.delivery.findMany({
            where: {
              OR: [
                { deliveryDate: tradeDate, remark: { startsWith: '[미출엑셀]' } },
                { deliveryNo: { startsWith: `DELIV-MICHUL-${dateKey}` } },
              ],
            },
            select: { id: true },
          });
          if (oldDeliveries.length > 0) {
            const oldIds = oldDeliveries.map((d) => d.id);
            await tx.deliveryDetail.deleteMany({ where: { deliveryId: { in: oldIds } } });
            await tx.delivery.deleteMany({ where: { id: { in: oldIds } } });
          }

          await tx.provisionalSalesStatus.deleteMany({
            where: { statusDate: tradeDate },
          });

          // 2. 센터별 납품 및 납품 상세, 가매출 일괄 등록
          const provStatusList: Array<{
            statusDate: string;
            provisionalSales: number;
            undeliveredAmount: number;
            confirmedAmount: number;
            remark: string;
          }> = [];

          let seq = 1;
          for (const [_, grp] of byCenter.entries()) {
            const deliveryNo = `DELIV-MICHUL-${dateKey}-${batchTag}-${String(seq).padStart(3, '0')}`;
            seq++;

            const delivery = await tx.delivery.create({
              data: {
                deliveryNo,
                deliveryDate: tradeDate,
                centerCode: grp.storeCode || 'GSR-001',
                shift: '1편',
                status: '완료',
                totalQty: Math.round(grp.delivQty),
                totalAmount: Math.round(grp.delivAmt),
                remark: `[미출엑셀] ${grp.storeName} (미출 ${grp.undelivQty}개)`,
                createdBy: '엑셀일괄(미출)',
              },
            });

            if (grp.items.length > 0) {
              const detailData = grp.items.map((it) => {
                const productCode = String(it.productCode || 'ITEM-UNKNOWN').trim().replace(/\u00a0/g, '');
                const productName = String(it.productName || it.productCode || '품목명 없음').trim();
                const delivQty = Math.max(0, Math.round(Number(it.delivQty) || 0));
                const orderQty = Math.max(0, Math.round(Number(it.orderQty) || 0));
                const orderAmt = Math.max(0, Math.round(Number(it.orderAmt) || 0));
                const delivAmt = Math.max(0, Math.round(Number(it.delivAmt) || 0));
                const undelivQty = Math.max(0, Math.round(Number(it.undelivQty) || 0));
                const undelivAmt = Math.max(0, Math.round(Number(it.undelivAmt) || 0));
                const unitPrice = orderQty > 0 ? Math.round(orderAmt / orderQty) : 0;

                return {
                  deliveryId: delivery.id,
                  productCode,
                  productName,
                  deliveryQty: delivQty,
                  unitPrice,
                  amount: delivAmt,
                  boxQty: Math.ceil(delivQty / 10),
                  remark:
                    undelivQty > 0
                      ? `미출 ${undelivQty}개 (${undelivAmt.toLocaleString()}원)`
                      : '정상납품',
                };
              });

              for (let i = 0; i < detailData.length; i += 500) {
                const chunk = detailData.slice(i, i + 500);
                await tx.deliveryDetail.createMany({
                  data: chunk,
                });
              }
            }

            provStatusList.push({
              statusDate: tradeDate,
              provisionalSales: Math.round(grp.provAmt),
              undeliveredAmount: Math.round(grp.undelivAmt),
              confirmedAmount: Math.round(grp.delivAmt),
              remark: grp.storeName,
            });
          }

          if (provStatusList.length > 0) {
            for (let i = 0; i < provStatusList.length; i += 500) {
              const chunk = provStatusList.slice(i, i + 500);
              await tx.provisionalSalesStatus.createMany({
                data: chunk,
              });
            }
          }
        },
        {
          maxWait: 20000,
          timeout: 90000,
        }
      );

      totalUploadedFiles++;
      totalUploadedStores += byCenter.size;
      totalUploadedItems += items.length;
      grandTotalOrderQty += parsed.totalOrderQty;
      grandTotalDelivQty += parsed.totalDelivQty;
      grandTotalUndelivQty += parsed.totalUndelivQty;
      grandTotalOrderAmt += parsed.totalOrderAmt;
      grandTotalDelivAmt += parsed.totalDelivAmt;
      grandTotalUndelivAmt += parsed.totalUndelivAmt;

      dateSummaryList.push({
        file,
        tradeDate,
        stores: byCenter.size,
        items: items.length,
        undelivQty: parsed.totalUndelivQty,
        undelivAmt: parsed.totalUndelivAmt,
      });

      console.log(
        `✅ [${file}] 일자: ${tradeDate} | 센터: ${String(byCenter.size).padStart(2)}개 | 품목: ${String(items.length).padStart(3)}건 | 미출: ${String(parsed.totalUndelivQty).padStart(4)}개 (${parsed.totalUndelivAmt.toLocaleString().padStart(10)}원)`
      );
    } catch (err: any) {
      console.error(`❌ [${file}] 업로드 실패:`, err.message || err);
    }
  }

  console.log('\n=============================================================================');
  console.log('🎉 [2026년 10월 미출 데이터 전체 일괄 업로드 완료]');
  console.log('=============================================================================');
  console.log(`- 처리 파일 수     : ${totalUploadedFiles}개 (전체 31개 파일 중 성공)`);
  console.log(`- 총 처리 센터 수  : ${totalUploadedStores}개`);
  console.log(`- 총 처리 품목 건수: ${totalUploadedItems.toLocaleString()}건`);
  console.log(`- 총 발주 수량     : ${grandTotalOrderQty.toLocaleString()}개`);
  console.log(`- 총 납품 수량     : ${grandTotalDelivQty.toLocaleString()}개`);
  console.log(`- 총 미출 수량     : ${grandTotalUndelivQty.toLocaleString()}개`);
  console.log(`- 총 발주 금액     : ${grandTotalOrderAmt.toLocaleString()}원`);
  console.log(`- 총 납품(확정)금액: ${grandTotalDelivAmt.toLocaleString()}원`);
  console.log(`- 총 미출 금액     : ${grandTotalUndelivAmt.toLocaleString()}원`);
  console.log('=============================================================================\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal error in batch upload:', e);
  process.exit(1);
});
