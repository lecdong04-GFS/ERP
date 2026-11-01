import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  ActionItem,
  ChartPoint,
  ChartSeries,
  DashboardStats,
  FefoRow,
  StockDayRow,
  WarehouseStockRow,
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

/** 최근 30일 일별 차트 (MM/DD 라벨) */
function buildRolling30(rows: { date: string; amount: number }[], endDate: string): ChartPoint[] {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    map[r.date] = (map[r.date] || 0) + (r.amount || 0);
  });
  return Array.from({ length: 30 }, (_, i) => {
    const d = kstDate(i - 29);
    return {
      label: `${d.slice(5, 7)}/${d.slice(8, 10)}`,
      value: Math.round((map[d] || 0) / 1000000),
    };
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

const CACHE_TTL_MS = 15_000;
let statsCache: { at: number; data: DashboardStats } | null = null;

export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';
  if (!fresh && statsCache && Date.now() - statsCache.at < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, data: statsCache.data });
  }
  try {
    const today = kstDate(0);
    const yesterday = kstDate(-1);
    const weekAgo = kstDate(-6);
    const monthAgo = kstDate(-29);
    const thisYear = today.slice(0, 4);

    // ── 1. 병렬 조회 (연도 1회 조회 후 30일/7일 파생) ───────
    const [
      yearSalesRows,
      yearPurchaseRows,
      yearWorkRows,
      undeliveredOrders,
      todayDeliveries,
      pendingChanges,
      shortageCount,
      safetyShortageCount,
      expiryCandidates,
      warehouseRows,
      stockDaysRows,
      gyeRows,
    ] = await Promise.all([
      prisma.salesOrder.findMany({
        where: { orderDate: { startsWith: thisYear }, status: { not: '취소' } },
        select: { orderDate: true, totalAmount: true, totalQty: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { orderDate: { startsWith: thisYear } },
        select: { orderDate: true, totalAmount: true },
      }),
      prisma.workOrder.findMany({
        where: { workDate: { startsWith: thisYear } },
        select: { workDate: true, gyeId: true, prodQty: true, orderQty: true, defectQty: true, status: true },
      }),
      prisma.salesOrder.findMany({
        where: { status: '미출' },
        select: { orderDate: true, totalAmount: true },
      }),
      prisma.delivery.findMany({
        where: { deliveryDate: today, status: { not: '취소' } },
        select: { status: true },
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
      prisma.inventory.findMany({
        select: { warehouse: true, currentQty: true, unitPrice: true, stockAmount: true },
      }),
      prisma.gfsSnapshot.findMany({
        where: { stockDays: { gt: 0 } },
        select: { productCode: true, productName: true, warehouse: true, stockDays: true },
        orderBy: { stockDays: 'asc' },
        take: 5,
      }),
      prisma.gyeMaster.findMany({
        where: { isUsed: true },
        select: { id: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const inMonth = (date: string) => date >= monthAgo && date <= today;
    const todayOrders = yearSalesRows.filter((o) => o.orderDate === today);
    const yesterdayOrders = yearSalesRows.filter((o) => o.orderDate === yesterday);
    const weekSales = yearSalesRows.filter((o) => o.orderDate >= weekAgo && o.orderDate <= today);
    const weekPurchase = yearPurchaseRows.filter((o) => o.orderDate >= weekAgo && o.orderDate <= today);
    const weekWork = yearWorkRows.filter((w) => w.workDate >= weekAgo && w.workDate <= today);
    const todayWorkOrders = yearWorkRows.filter((w) => w.workDate === today);

    const salesRows = yearSalesRows
      .filter((o) => inMonth(o.orderDate))
      .map((o) => ({ date: o.orderDate, amount: o.totalAmount }));
    const purchaseRows = yearPurchaseRows
      .filter((o) => inMonth(o.orderDate))
      .map((o) => ({ date: o.orderDate, amount: o.totalAmount }));
    const prodAmount = (w: { prodQty: number; orderQty: number }) =>
      (w.prodQty || w.orderQty || 0) * 2000;
    const prodRows = yearWorkRows
      .filter((w) => inMonth(w.workDate))
      .map((w) => ({ date: w.workDate, amount: prodAmount(w) }));

    // ── 2. 차트 시리즈 ──────────────────────────────────────
    const sales: ChartSeries = {
      monthly: buildRolling30(salesRows, today),
      yearly: buildYearly(
        yearSalesRows.map((o) => ({ date: o.orderDate, amount: o.totalAmount })),
        thisYear
      ),
    };
    const purchase: ChartSeries = {
      monthly: buildRolling30(purchaseRows, today),
      yearly: buildYearly(
        yearPurchaseRows.map((o) => ({ date: o.orderDate, amount: o.totalAmount })),
        thisYear
      ),
    };
    const production: ChartSeries = {
      monthly: buildRolling30(prodRows, today),
      yearly: buildYearly(
        yearWorkRows.map((w) => ({ date: w.workDate, amount: prodAmount(w) })),
        thisYear
      ),
    };
    const undelivered: ChartSeries = {
      monthly: buildRolling30(
        undeliveredOrders.map((o) => ({ date: o.orderDate, amount: o.totalAmount })),
        today
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
        weekWork.map((w) => ({ date: w.workDate, amount: prodAmount(w) })),
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

    const gyeNameMap = new Map(gyeRows.map((g) => [g.id, g.name]));
    const lineMap = new Map<
      string,
      { orderQty: number; prodQty: number; defectQty: number; statuses: Set<string> }
    >();
    todayWorkOrders.forEach((w) => {
      const cur = lineMap.get(w.gyeId) || {
        orderQty: 0,
        prodQty: 0,
        defectQty: 0,
        statuses: new Set<string>(),
      };
      cur.orderQty += w.orderQty || 0;
      cur.prodQty += w.prodQty || 0;
      cur.defectQty += w.defectQty || 0;
      cur.statuses.add(w.status || '대기');
      lineMap.set(w.gyeId, cur);
    });
    const productionLines = [...lineMap.entries()]
      .map(([gyeId, v]) => {
        const pct = v.orderQty > 0 ? Math.min(100, Math.round((v.prodQty / v.orderQty) * 100)) : 100;
        const status: '완료' | '진행중' | '대기' =
          v.statuses.size === 1
            ? (([...v.statuses][0] as '완료' | '진행중' | '대기') || '대기')
            : v.prodQty >= v.orderQty
              ? '완료'
              : v.prodQty > 0
                ? '진행중'
                : '대기';
        return {
          gyeId,
          name: gyeNameMap.get(gyeId) || gyeId,
          orderQty: v.orderQty,
          prodQty: v.prodQty,
          pct,
          status,
        };
      })
      .sort((a, b) => b.orderQty - a.orderQty);

    const doneLines = productionLines.filter((l) => l.status === '완료').length;
    const activeLines = productionLines.filter((l) => l.status === '진행중').length;
    const waitingLines = productionLines.filter((l) => l.status === '대기').length;
    const totalDefect = todayWorkOrders.reduce((s2, w) => s2 + (w.defectQty || 0), 0);
    const defectRate = prodDone > 0 ? Math.round((totalDefect / prodDone) * 1000) / 10 : 0;

    const todayOrderQty = todayOrders.reduce((s, o) => s + (o.totalQty || 0), 0);
    const todaySalesAmount = todayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const yesterdaySalesAmount = yesterdayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);

    const deliveryTotalCount = todayDeliveries.length;
    const deliveryDoneCount = todayDeliveries.filter((d) => d.status === '완료').length;
    const deliveryRate =
      deliveryTotalCount > 0 ? Math.round((deliveryDoneCount / deliveryTotalCount) * 1000) / 10 : 0;

    // ── 6. 창고별 재고금액 ─────────────────────────────────
    const whMap = new Map<string, { items: number; amount: number }>();
    for (const r of warehouseRows) {
      const key = r.warehouse || '창고미지정';
      const amount =
        Number(r.stockAmount) || (Number(r.currentQty) || 0) * (Number(r.unitPrice) || 0);
      const cur = whMap.get(key) || { items: 0, amount: 0 };
      cur.items += 1;
      cur.amount += amount;
      whMap.set(key, cur);
    }
    const warehouseStock: WarehouseStockRow[] = [...whMap.entries()]
      .map(([warehouse, v]) => ({ warehouse, items: v.items, amount: Math.round(v.amount) }))
      .sort((a, b) => b.amount - a.amount);
    const warehouseStockTotal = warehouseStock.reduce((s, w) => s + w.amount, 0);

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
        sales: salesRows.length > 0,
        purchase: purchaseRows.length > 0,
        production: prodRows.length > 0,
        undelivered: undeliveredOrders.length > 0,
      },
      kpiSummary: {
        totalProducts: 0,
        totalPartners: 0,
        totalInventoryItems: 0,
        salesTotalMonth: Math.round(
          salesRows.reduce((s, o) => s + (o.amount || 0), 0) / 10000
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
      productionWork: {
        doneLines,
        activeLines,
        waitingLines,
        defectRate,
        lines: productionLines.slice(0, 8),
      },
      actionQueue,
      fefoTop,
      stockDaysTop,
      warehouseStock,
      warehouseStockTotal,
      spark,
      fetchedAt: new Date().toISOString(),
    };

    statsCache = { at: Date.now(), data };
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
