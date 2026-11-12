import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';
import { MichulItem } from '@/lib/gfs/michulIntake';

export const dynamic = 'force-dynamic';

// POST /api/sales/undelivered/intake
// 미출(미납) 엑셀 파싱 데이터 DB 일괄 저장 및 확정매출 동기화
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'sales', action: 'write' });
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const tradeDate: string = body.tradeDate || kstToday();
    const items: MichulItem[] = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ success: false, error: '저장할 미출 내역이 없습니다.' }, { status: 400 });
    }

    const userName = auth.user.name || auth.user.loginId || '관리자';

    // 1. 센터별로 그룹화
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
      const centerKey = it.storeName || it.storeCode || 'GSR';
      let grp = byCenter.get(centerKey);
      if (!grp) {
        grp = {
          storeCode: it.storeCode || '',
          storeName: it.storeName || '미지정 센터',
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
    const batchTag = Date.now().toString().slice(-4);

    // 2. 대량 데이터 일괄 처리를 위해 트랜잭션 타임아웃 60초 확보 및 createMany 일괄 삽입 적용
    await prisma.$transaction(
      async (tx) => {
        // (1) 기존 해당 일자 미출분 납품/가매출 레코드 삭제(덮어쓰기 정합성 유지)
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

        // (2) 센터별 납품 및 납품 상세, 가매출 일괄 등록
        const provStatusList: Array<{
          statusDate: string;
          provisionalSales: number;
          undeliveredAmount: number;
          confirmedAmount: number;
          remark: string;
        }> = [];

        let seq = 1;
        for (const [centerKey, grp] of byCenter.entries()) {
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
              createdBy: userName,
            },
          });

          // 납품 상세 createMany 일괄 삽입 (500개씩 청킹하여 파라미터 한도 및 트랜잭션 타임아웃 100% 방지)
          if (grp.items.length > 0) {
            const detailData = grp.items.map((it) => {
              const productCode = String(it.productCode || 'ITEM-UNKNOWN').trim();
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
                remark: undelivQty > 0 ? `미출 ${undelivQty}개 (${undelivAmt.toLocaleString()}원)` : '정상납품',
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

    const totalUndelivQty = items.reduce((s, it) => s + (Number(it.undelivQty) || 0), 0);
    const totalUndelivAmt = items.reduce((s, it) => s + (Number(it.undelivAmt) || 0), 0);
    const totalDelivQty = items.reduce((s, it) => s + (Number(it.delivQty) || 0), 0);
    const totalDelivAmt = items.reduce((s, it) => s + (Number(it.delivAmt) || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        tradeDate,
        storeCount: byCenter.size,
        itemCount: items.length,
        totalDelivQty,
        totalDelivAmt,
        totalUndelivQty,
        totalUndelivAmt,
      },
    });
  } catch (error: any) {
    console.error('Failed to intake michul data:', error);
    return NextResponse.json(
      { success: false, error: error?.message || '미출 데이터 등록 실패' },
      { status: 500 }
    );
  }
}
