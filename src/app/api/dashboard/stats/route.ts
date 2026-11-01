import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  ActionItem,
  ChartPoint,
  ChartSeries,
  DashboardStats,
  FefoRow,
  LineRow,
  StockDayRow,
  emptyMonth,
  emptyYear,
} from '@/components/dashboard/dashboardData';

const CUTOFF_TIMES = ['11:00', '13:00'];

/** KST 기준 날짜 (offsetDays: 과거 음수) */
function kstDate(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

/** 유통기한 D-day (YYYY-MM-DD만 판정, 파싱불가 null) */
function expiryInDays(expiry: string, base: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((expiry || '').trim());
  if (!m) return null;
  const t = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).getTime();
  const b = new Date(`${base}T00:00:00`).getTime();
  if (isNaN(t) || isNaN(b)) return null;
  return Math.floor((t - b) / 86400000);
}

/** 다음 마감 시각(HH:mm) */
function nextCutoff(): string | null {
  const now = new Date();
  const kstMinutes = (now.getUTCHours() + 9) % 24 * 60 + now.getUTCMinutes();
  for (const t of CUTOFF_TIMES) {
    const [h, m] = t.split(':').map(Number);
    if (h * 60 + m > kstMinutes) return t;
  }
  return CUTOFF_TIMES[0];
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** 일자별 합계 → 백만원 차트 (해당 월 일수만큼 축 생성) */
function buildMonthly(
  rows: { date: string; amount: number }[],
  month: string
): ChartPoint[] {
  const days = daysInMonth(month);
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    if (r.date.startsWith(month)) {
      const d = r.date.slice(8, 10);
      map[d] = (map[d] || 0) + (r.amount || 0);
    }
  });
  return Array.from({ length: days }, (_, i) => {
    const label = String(i + 1).padStart(2, '0');
    return { label, value: Math.round((map[label] || 0) / 1000000) };
  });
}

function buildYearly(rows: { date: string; amount: number }[], year: string): ChartPoint[] {
  const out = emptyYear();
  rows.forEach((r) => {
    if (!r.date.startsWith(year)) return;
    const m = parseInt(r.date.slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) out[m].value += Math.round((r.amount || 0) / 1000000);
  });
  return out;
}

/** 최근 7일 일별 합계(백만원) */
function buildSpark(rows: { date: string; amount: number }[], today: string): number[] {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    map[r.date] = (map[r.date] || 0) + (r.amount || 0);
  });
  return Array.from({ length: 7 }, (_, i) => {
    const d = kstDate(i - 6);
    return Math.round((map[d] || 0) / 1000000);
  });
}

export async function GET(req: NextRequest) {
  try {
    const today = kstDate(0);
    const yesterday = kstDate(-1);
    const weekAgo = kstDate(-6);
    const thisMonth = today.slice(0, 7);
    const thisYear = today.slice(0, 4);

    // ── 1. 병렬 조회 ────────────────────────────────────────
    const [
      monthSales,
      monthPurchase,
      monthWork,
      undeliveredOrders,
      yearSales,
      yearPurchase,
      yearWork,
      todayOrders,
      yesterdayOrders,
      weekSales,
      weekPurchase,
      weekWork,
      todayDeliveries,
      todayWorkOrders,
      pendingChanges,
      shortageCount,
      safetyShortageCount,
      expiryCandidates,
      productsCount,
      partnersCount,
      inventoryCount,
      gyeList,
      stockDaysRows,
    ] = await Promise.all([
      prisma.salesOrder.findMany({
        where: { orderDate: { startsWith: thisMonth }, status: { not: '취소' } },
        select: { orderDate: true, totalAmount: true, totalQty: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { orderDate: { startsWith: thisMonth } },
        select: { orderDate: true, totalAmount: true },
      }),
      prisma.workOrder.findMany({
        where: { workDate: { startsWith: thisMonth } },
        select: { workDate: true, prodQty: true, orderQty: true },
      }),
      prisma.salesOrder.findMany({
        where: { status: '미출' },
        select: { orderDate: true, totalAmount: true },
      }),
      prisma.salesOrder.findMany({
        where: { orderDate: { startsWith: thisYear }, status: { not: '취소' } },
        select: { orderDate: true, totalAmount: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { orderDate: { startsWith: thisYear } },
        select: { orderDate: true, totalAmount: true },
      }),
      prisma.workOrder.findMany({
        where: { workDate: { startsWith: thisYear } },
        select: { workDate: true, prodQty: true, orderQty: true },
      }),
      prisma.salesOrder.findMany({
        where: { orderDate: today, status: { not: '취소' } },
        select: { totalAmount: true, totalQty: true },
      }),
      prisma.salesOrder.findMany({
        where: { orderDate: yesterday, status: { not: '취소' } },
        select: { totalAmount: true, totalQty: true },
      }),
      prisma.salesOrder.findMany({
        where: { orderDate: { gte: weekAgo, lte: today }, status: { not: '취소' } },
        select: { orderDate: true, totalAmount: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { orderDate: { gte: weekAgo, lte: today } },
        select: { orderDate: true, totalAmount: true },
      }),
      prisma.workOrder.findMany({
        where: { workDate: { gte: weekAgo, lte: today } },
        select: { workDate: true, prodQty: true, orderQty: true },
      }),
      prisma.delivery.findMany({
        where: { deliveryDate: today, status: { not: '취소' } },
        select: { status: true },
      }),
      prisma.workOrder.findMany({
        where: { workDate: today },
        select: { gyeId: true, status: true, orderQty: true, prodQty: true, defectQty: true },
      }),
      prisma.changeRequest.count({ where: { status: { in: ['접수', '접수대기'] } } }),
      prisma.materialRequirement.count({
        where: { status: '미확정', shortageQty: { gt: 0 } },
      }),
      prisma.safetyStock.count({ where: { shortageQty: { gt: 0 } } }),
      prisma.inventory.findMany({
        where: {
          currentQty: { gt: 0 },
          expiryDate: { not: '' },
          AND: [{ expiryDate: { gte: kstDate(-30) } }, { expiryDate: { lte: kstDate(7) } }],
        },
        select: {
          productCode: true,
          productName: true,
          warehouse: true,
          currentQty: true,
          unit: true,
          expiryDate: true,
        },
        take: 300,
      }),
      prisma.product.count({ where: { isUsed: true, category: '완성품' } }),
      prisma.partner.count({ where: { isUsed: true } }),
      prisma.inventory.count(),
      prisma.gyeMaster.findMany({
        where: { isUsed: true },
        select: { id: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.gfsSnapshot.findMany({
        where: { stockDays: { not: null } },
        select: { productCode: true, productName: true, warehouse: true, stockDays: true },
        orderBy: { stockDays: 'asc' },
        take: 5,
      }),
    ]);

    // ── 2. 차트 시리즈 ──────────────────────────────────────
    const salesRows = monthSales.map((o) => ({ date: o.orderDate, amount: o.totalAmount }));
    const purchaseRows = monthPurchase.map((o) => ({ date: o.orderDate, amount: o.totalAmount }));
    const prodRows = monthWork.map((w) => ({
      date: w.workDate,
      amount: (w.prodQty || w.orderQty || 0) * 2000,
    }));

    const sales: ChartSeries = {
      monthly: buildMonthly(salesRows, thisMonth),
      yearly: buildYearly(yearSales.map((o) => ({ date: o.orderDate, amount: o.totalAmount })), thisYear),
    };
    const purchase: ChartSeries = {
      monthly: buildMonthly(purchaseRows, thisMonth),
      yearly: buildYearly(yearPurchase.map((o) => ({ date: o.orderDate, amount: o.totalAmount })), thisYear),
    };
    const production: ChartSeries = {
      monthly: buildMonthly(prodRows, thisMonth),
      yearly: buildYearly(
        yearWork.map((w) => ({ date: w.workDate, amount: (w.prodQty || w.orderQty || 0) * 2000 })),
        thisYear
      ),
    };
    const undelivered: ChartSeries = {
      monthly: buildMonthly(
        undeliveredOrders.map((o) => ({ date: o.orderDate, amount: o.totalAmount })),
        thisMonth
      ),
      yearly: buildYearly(
        undeliveredOrders.map((o) => ({ date: o.orderDate, amount: o.totalAmount })),
        thisYear
      ),
    };

    const spark = {
      sales: buildSpark(
        weekSales.map((o) => ({ date: o.orderDate, amount: o.totalAmount })),
        today
      ),
      purchase: buildSpark(
        weekPurchase.map((o) => ({ date: o.orderDate, amount: o.totalAmount })),
        today
      ),
      production: buildSpark(
        weekWork.map((w) => ({ date: w.workDate, amount: (w.prodQty || w.orderQty || 0) * 2000 })),
        today
      ),
    };

    // ── 3. FEFO 임박 ───────────────────────────────────────
    const fefoTop: FefoRow[] = expiryCandidates
      .map((r) => ({
        code: r.productCode,
        name: r.productName,
        warehouse: r.warehouse,
        qty: Number(r.currentQty) || 0,
        unit: r.unit,
        daysLeft: expiryInDays(r.expiryDate, today),
      }))
      .filter((r): r is FefoRow => r.daysLeft !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);

    const expiryUrgentCount = expiryCandidates.filter((r) => {
      const d = expiryInDays(r.expiryDate, today);
      return d !== null && d <= 3;
    }).length;

    // ── 4. 재고 유지일 TOP5 ────────────────────────────────
    const stockDaysTop: StockDayRow[] = stockDaysRows.map((r) => ({
      code: r.productCode,
      name: r.productName,
      warehouse: r.warehouse,
      stockDays: Number(r.stockDays) || 0,
    }));

    // ── 5. 생산 파이프라인 ─────────────────────────────────
    const prodTarget = todayWorkOrders.reduce((s, w) => s + (w.orderQty || 0), 0);
    const prodDone = todayWorkOrders.reduce((s, w) => s + (w.prodQty || 0), 0);
    const prodPct = prodTarget > 0 ? Math.min(100, Math.round((prodDone / prodTarget) * 100)) : 0;

    const todayOrderQty = todayOrders.reduce((s, o) => s + (o.totalQty || 0), 0);
    const todaySalesAmount = todayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const yesterdaySalesAmount = yesterdayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);

    const deliveryTotalCount = todayDeliveries.length;
    const deliveryDoneCount = todayDeliveries.filter((d) => d.status === '완료').length;
    const deliveryRate =
      deliveryTotalCount > 0 ? Math.round((deliveryDoneCount / deliveryTotalCount) * 1000) / 10 : 0;

    // ── 6. 라인 미니맵 ─────────────────────────────────────
    const lineMap: LineRow[] = gyeList.map((g) => {
      const wos = todayWorkOrders.filter((w) => w.gyeId === g.id);
      const abnormal = wos.some(
        (w) =>
          !['대기', '진행중', '완료'].includes(w.status) ||
          (w.orderQty > 0 && (w.defectQty || 0) / w.orderQty > 0.05)
      );
      const status: LineRow['status'] = abnormal ? '이상' : wos.length > 0 ? '가동' : '대기';
      return { gyeId: g.id, name: g.name, status };
    });

    // ── 7. 액션 큐 ─────────────────────────────────────────
    const actionQueue: ActionItem[] = [];
    if (expiryUrgentCount > 0) {
      actionQueue.push({
        id: 'expiry',
        kind: 'act',
        label: '유통기한 임박 (D-3 이내)',
        count: expiryUrgentCount,
        unit: 'LOT',
        menuId: 'inv-expiry-discard-mgmt',
      });
    }
    if (safetyShortageCount > 0) {
      actionQueue.push({
        id: 'safety',
        kind: 'warn',
        label: '안전재고 미달',
        count: safetyShortageCount,
        unit: '품목',
        menuId: 'inv-safety-stock-mgmt',
      });
    }
    if (shortageCount > 0) {
      actionQueue.push({
        id: 'shortage',
        kind: 'warn',
        label: '자재 소요 부족',
        count: shortageCount,
        unit: '건',
        menuId: 'pur-mat-order-normal',
      });
    }
    if (undeliveredOrders.length > 0) {
      actionQueue.push({
        id: 'undelivered',
        kind: 'info',
        label: '미출 처리 대기',
        count: undeliveredOrders.length,
        unit: '건',
        menuId: 'sales-undelivered-status',
      });
    }
    if (pendingChanges > 0) {
      actionQueue.push({
        id: 'change',
        kind: 'info',
        label: '미처리 변경요청',
        count: pendingChanges,
        unit: '건',
        menuId: 'admin-request-edit',
      });
    }

    // ── 8. 알림 문구 (실데이터) ────────────────────────────
    const notifications: string[] = [];
    if (expiryUrgentCount > 0) notifications.push(`유통기한 D-3 이내 ${expiryUrgentCount}건 — FEFO 선출고 필요`);
    if (safetyShortageCount > 0) notifications.push(`안전재고 미달 ${safetyShortageCount}품목 — 발주 검토`);
    if (shortageCount > 0) notifications.push(`자재 소요 부족 ${shortageCount}건 — 발주 검토`);
    if (undeliveredOrders.length > 0) notifications.push(`미출 ${undeliveredOrders.length}건 — 출하 처리 필요`);
    if (notifications.length === 0) notifications.push('조치가 필요한 항목이 없습니다.');

    const data: DashboardStats = {
      sales,
      purchase,
      production,
      undelivered,
      notifications,
      hasData: {
        sales: monthSales.length > 0,
        purchase: monthPurchase.length > 0,
        production: monthWork.length > 0,
        undelivered: undeliveredOrders.length > 0,
      },
      kpiSummary: {
        totalProducts: productsCount,
        totalPartners: partnersCount,
        totalInventoryItems: inventoryCount,
        salesTotalMonth: Math.round(
          monthSales.reduce((s, o) => s + (o.totalAmount || 0), 0) / 10000
        ),
        shortageCount,
        todaySalesAmount,
        yesterdaySalesAmount,
        todayOrderQty,
        deliveryRate,
        deliveryDoneCount,
        deliveryTotalCount,
        productionRate: prodPct,
        expiryUrgentCount,
        safetyShortageCount,
      },
      pipeline: {
        orderQty: todayOrderQty,
        prodDone,
        prodTarget,
        prodPct,
        undeliveredCount: undeliveredOrders.length,
        cutoffAt: nextCutoff(),
      },
      actionQueue,
      fefoTop,
      stockDaysTop,
      lineMap,
      spark,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        data: {
          sales: { monthly: emptyMonth(), yearly: emptyYear() },
          purchase: { monthly: emptyMonth(), yearly: emptyYear() },
          production: { monthly: emptyMonth(), yearly: emptyYear() },
          undelivered: { monthly: emptyMonth(), yearly: emptyYear() },
          notifications: [],
          hasData: { sales: false, purchase: false, production: false, undelivered: false },
        },
      },
      { status: 200 }
    );
  }
}
