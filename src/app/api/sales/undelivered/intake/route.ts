import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { MichulItem } from '@/lib/gfs/michulIntake';

// POST /api/sales/undelivered/intake
// 미출(미납) 엑셀 파싱 데이터 DB 일괄 저장 및 확정매출 동기화
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const tradeDate: string = body.tradeDate || new Date().toISOString().slice(0, 10);
    const items: MichulItem[] = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ success: false, error: '저장할 미출 내역이 없습니다.' }, { status: 400 });
    }

    const userName = (session.user as any)?.name || '관리자';

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
          storeCode: it.storeCode,
          storeName: it.storeName,
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
      grp.provQty += it.orderQty;
      grp.provAmt += it.orderAmt;
      grp.delivQty += it.delivQty;
      grp.delivAmt += it.delivAmt;
      grp.undelivQty += it.undelivQty;
      grp.undelivAmt += it.undelivAmt;
      grp.items.push(it);
    }

    // 2. 트랜잭션으로 Delivery 및 ProvisionalSalesStatus 동기화 저장
    await prisma.$transaction(async (tx) => {
      // (1) 기존 해당 일자 미출분 납품/가매출 레코드 삭제(덮어쓰기 정합성 유지)
      const oldDeliveries = await tx.delivery.findMany({
        where: {
          deliveryDate: tradeDate,
          remark: { startsWith: '[미출엑셀]' },
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

      // (2) 센터별 납품 및 가매출 확정 등록
      let seq = 1;
      for (const [centerKey, grp] of byCenter.entries()) {
        const deliveryNo = `DELIV-MICHUL-${tradeDate.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`;
        seq++;

        const delivery = await tx.delivery.create({
          data: {
            deliveryNo,
            deliveryDate: tradeDate,
            centerCode: grp.storeCode || 'GSR-001',
            shift: '1편',
            status: '완료',
            totalQty: grp.delivQty,
            totalAmount: grp.delivAmt,
            remark: `[미출엑셀] ${grp.storeName} (미출 ${grp.undelivQty}개)`,
            createdBy: userName,
          },
        });

        // 납품 상세 등록
        for (const it of grp.items) {
          const unitPrice = it.orderQty > 0 ? Math.round(it.orderAmt / it.orderQty) : 0;
          await tx.deliveryDetail.create({
            data: {
              deliveryId: delivery.id,
              productCode: it.productCode,
              productName: it.productName,
              deliveryQty: it.delivQty,
              unitPrice,
              amount: it.delivAmt,
              boxQty: Math.ceil(it.delivQty / 10),
              remark: it.undelivQty > 0 ? `미출 ${it.undelivQty}개 (${it.undelivAmt.toLocaleString()}원)` : '정상납품',
            },
          });
        }

        // 가매출/미출/확정금액 현황 레코드 등록
        await tx.provisionalSalesStatus.create({
          data: {
            statusDate: tradeDate,
            provisionalSales: grp.provAmt,
            undeliveredAmount: grp.undelivAmt,
            confirmedAmount: grp.delivAmt,
            remark: grp.storeName,
          },
        });
      }
    });

    const totalUndelivQty = items.reduce((s, it) => s + it.undelivQty, 0);
    const totalUndelivAmt = items.reduce((s, it) => s + it.undelivAmt, 0);
    const totalDelivQty = items.reduce((s, it) => s + it.delivQty, 0);
    const totalDelivAmt = items.reduce((s, it) => s + it.delivAmt, 0);

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
      { success: false, error: error.message || '미출 데이터 등록 실패' },
      { status: 500 }
    );
  }
}

