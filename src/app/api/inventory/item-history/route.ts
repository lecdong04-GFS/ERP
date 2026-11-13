import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

/**
 * GET /api/inventory/item-history?productId=123&name=...&refDate=YYYY-MM-DD&days=7
 * 요일별 자재발주 화면에서 품목 클릭 시:
 * 1) 최근 7~10일간 일자별 재고 스냅샷 변화 (InventorySnapshot)
 * 2) 최근 발주/미입고 전표 내역 (PurchaseOrderDetail + PurchaseOrder)
 * 3) 최근 입출고 수불 내역 (MaterialLedger)
 * 을 통합 조회하여 발주 의사결정에 필요한 데이터를 반환합니다.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const productIdRaw = Number(searchParams.get('productId') || 0);
    const productName = (searchParams.get('name') || '').trim();
    const refDate = searchParams.get('refDate') || kstToday();
    const days = Math.min(Math.max(Number(searchParams.get('days') || 7), 5), 30);

    if (!productIdRaw && !productName) {
      return NextResponse.json(
        { success: false, error: 'productId 또는 name 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    // 여유 있게 최근 (days + 7)일 전부터 조회하여 전일대비 증감/실소진량 역산이 끊기지 않게 함
    const fetchFromDate = shiftYmd(refDate, -(days + 7));
    const displayFromDate = shiftYmd(refDate, -(days - 1));

    // 1. 스냅샷 조회 조건 (productId 우선, 미매칭 스냅샷 대비 productName 보조 매칭)
    const snapOr: any[] = [];
    if (productIdRaw > 0) snapOr.push({ productId: productIdRaw });
    if (productName) snapOr.push({ productName });

    const [snapshots, poDetails, ledgers, productMeta] = await Promise.all([
      prisma.inventorySnapshot.findMany({
        where: {
          snapshotDate: { gte: fetchFromDate, lte: refDate },
          OR: snapOr,
        },
        orderBy: [{ snapshotDate: 'asc' }, { id: 'asc' }],
      }),
      productIdRaw > 0
        ? prisma.purchaseOrderDetail.findMany({
            where: {
              productId: productIdRaw,
              purchaseOrder: {
                orderDate: { gte: fetchFromDate },
                status: { not: '취소' },
              },
            },
            include: {
              purchaseOrder: {
                select: {
                  id: true,
                  orderNo: true,
                  orderDate: true,
                  deliveryDate: true,
                  status: true,
                  orderType: true,
                  partnerName: true,
                },
              },
            },
            orderBy: { id: 'desc' },
          })
        : Promise.resolve([]),
      productIdRaw > 0
        ? prisma.materialLedger.findMany({
            where: {
              productId: productIdRaw,
              ledgerDate: { gte: fetchFromDate, lte: refDate },
            },
            orderBy: [{ ledgerDate: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      productIdRaw > 0
        ? prisma.product.findUnique({
            where: { id: productIdRaw },
            select: {
              id: true,
              productCode: true,
              name: true,
              spec: true,
              unit: true,
              status: true,
            },
          })
        : Promise.resolve(null),
    ]);

    // 2. 날짜별 스냅샷 집계 (동일 일자에 창고/로트별 다건 존재 시 합산)
    const snapByDate = new Map<
      string,
      {
        qty: number;
        boxQty: number;
        dailyUsage: number;
        safetyStock: number;
        expiryDates: string[];
        warehouse: string;
        stockAmount: number;
      }
    >();

    for (const s of snapshots) {
      const d = s.snapshotDate;
      const prev = snapByDate.get(d) || {
        qty: 0,
        boxQty: 0,
        dailyUsage: 0,
        safetyStock: 0,
        expiryDates: [],
        warehouse: s.warehouse || '',
        stockAmount: 0,
      };
      prev.qty += Number(s.currentQty) || 0;
      prev.boxQty += Number(s.boxQty) || 0;
      prev.dailyUsage = Math.max(prev.dailyUsage, Number(s.dailyUsage) || 0);
      prev.safetyStock = Math.max(prev.safetyStock, Number(s.safetyStock) || 0);
      prev.stockAmount += Number(s.stockAmount) || 0;
      if (s.expiryDate && !prev.expiryDates.includes(s.expiryDate)) {
        prev.expiryDates.push(s.expiryDate);
      }
      if (!prev.warehouse && s.warehouse) prev.warehouse = s.warehouse;
      snapByDate.set(d, prev);
    }

    // 3. 날짜별 발주량 및 입출고량 집계
    const poByOrderDate = new Map<string, { orderQty: number; receivedQty: number; orderNos: string[] }>();
    for (const d of poDetails) {
      const dt = d.purchaseOrder?.orderDate;
      if (!dt) continue;
      const prev = poByOrderDate.get(dt) || { orderQty: 0, receivedQty: 0, orderNos: [] };
      prev.orderQty += Number(d.orderQty) || 0;
      prev.receivedQty += Number(d.receivedQty) || 0;
      if (d.purchaseOrder?.orderNo && !prev.orderNos.includes(d.purchaseOrder.orderNo)) {
        prev.orderNos.push(d.purchaseOrder.orderNo);
      }
      poByOrderDate.set(dt, prev);
    }

    const ledgerByDate = new Map<string, { inQty: number; outQty: number; adjustQty: number }>();
    for (const l of ledgers) {
      const dt = l.ledgerDate;
      const prev = ledgerByDate.get(dt) || { inQty: 0, outQty: 0, adjustQty: 0 };
      prev.inQty += Number(l.inQty) || 0;
      prev.outQty += Number(l.outQty) || 0;
      prev.adjustQty += Number(l.adjustQty) || 0;
      ledgerByDate.set(dt, prev);
    }

    // 4. fetchFromDate ~ refDate 전체 날짜 순회하며 전일 대비 증감 계산
    const allDates: string[] = [];
    for (let i = -(days + 7); i <= 0; i++) {
      allDates.push(shiftYmd(refDate, i));
    }

    let lastKnownQty: number | null = null;
    const fullTimeline = allDates.map((date) => {
      const snap = snapByDate.get(date);
      const po = poByOrderDate.get(date);
      const led = ledgerByDate.get(date);

      const qty = snap ? snap.qty : null;
      const diffFromPrev =
        qty !== null && lastKnownQty !== null ? qty - lastKnownQty : null;

      // 스냅샷 기반 추정 실소진량: 전일재고 + 당일입고 - 금일재고 (입고 없는 날 순감소분)
      const inQty = led?.inQty || 0;
      let estimatedUsage: number | null = null;
      if (led && led.outQty > 0) {
        estimatedUsage = led.outQty;
      } else if (diffFromPrev !== null) {
        const netDecrease = -diffFromPrev + inQty;
        if (netDecrease >= 0) {
          estimatedUsage = netDecrease;
        }
      }

      if (qty !== null) {
        lastKnownQty = qty;
      }

      return {
        date,
        hasSnapshot: Boolean(snap),
        qty,
        boxQty: snap ? snap.boxQty : null,
        diffFromPrev,
        inQty,
        outQty: led?.outQty || 0,
        estimatedUsage,
        orderedBoxes: po?.orderQty || 0,
        receivedBoxes: po?.receivedQty || 0,
        orderNos: po?.orderNos || [],
        expiryDates: snap?.expiryDates || [],
      };
    });

    // 화면 표시용 최근 N일 슬라이스
    const timeline = fullTimeline.filter((t) => t.date >= displayFromDate);

    // 5. 최근 7일 실측 일평균 소진량 추정 (음수 제외, 이상치 방지)
    const usageSamples = timeline
      .map((t) => t.estimatedUsage)
      .filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);
    const recentAvgUsage =
      usageSamples.length > 0
        ? Math.round(usageSamples.reduce((a, b) => a + b, 0) / usageSamples.length)
        : null;

    // 6. 최근 발주 전표 요약 리스트 (최신순 최대 8건)
    const recentOrders = poDetails.slice(0, 8).map((d) => ({
      orderNo: d.purchaseOrder.orderNo,
      orderDate: d.purchaseOrder.orderDate,
      deliveryDate: d.purchaseOrder.deliveryDate,
      status: d.purchaseOrder.status,
      orderType: d.purchaseOrder.orderType,
      orderQty: Number(d.orderQty) || 0,
      receivedQty: Number(d.receivedQty) || 0,
      remainQty: Number(d.remainQty) || 0,
      amount: Number(d.amount) || 0,
    }));

    // 최신 스냅샷 유통기한 수집
    const latestSnapWithExpiry = [...snapshots]
      .reverse()
      .find((s) => s.expiryDate && s.expiryDate.trim() !== '');

    return NextResponse.json({
      success: true,
      data: {
        refDate,
        productMeta,
        latestExpiryDate: latestSnapWithExpiry?.expiryDate || '',
        recentAvgUsage,
        usageSampleDays: usageSamples.length,
        timeline,
        recentOrders,
      },
    });
  } catch (error: any) {
    console.error('[GET /api/inventory/item-history]', error);
    return NextResponse.json(
      { success: false, error: error.message || '품목 재고 이력 조회 중 오류 발생' },
      { status: 500 }
    );
  }
}
