import { nextCutoff } from './cutoff';
import prisma from '@/lib/prisma';
import {
  ActionItem,
  ChartPoint,
  ChartSeries,
  DashboardStats,
  DemandTrendItem,
  DemandTrendStats,
  FefoRow,
  StockDayRow,
  WarehouseStockRow,
  emptyYear,
} from '@/components/dashboard/dashboardData';

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

export async function computeDashboardStats(): Promise<DashboardStats> {

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
      todayPurchaseOrders,
      todayReceivingRows,
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
        orderBy: { expiryDate: 'asc' },
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
      prisma.purchaseOrder.findMany({
        where: { orderDate: today, status: { not: '취소' } },
        include: {
          details: {
            include: {
              product: {
                include: {
                  prices: { take: 1, orderBy: { effectiveDate: 'desc' } },
                },
              },
            },
          },
        },
      }),
      prisma.receiving.findMany({
        where: { receivingDate: today, status: { not: '취소' } },
        select: { id: true, totalAmount: true, status: true, partnerName: true },
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

    // ── 3. FEFO 임박 (품목+창고 기준 1행으로 합산 → 같은 이름 중복 표시 방지) ──
    const fefoGroups = new Map<string, FefoRow>();
    for (const r of expiryCandidates) {
      const daysLeft = expiryInDays(r.expiryDate, today);
      if (daysLeft === null) continue;
      const code = (r.productCode || '').trim();
      const warehouse = (r.warehouse || '').trim();
      const key = `${code}｜${warehouse}`;
      const qty = Number(r.currentQty) || 0;
      const cur = fefoGroups.get(key);
      if (!cur) {
        fefoGroups.set(key, {
          code,
          name: r.productName,
          warehouse,
          qty,
          unit: r.unit,
          daysLeft,
        });
      } else {
        cur.qty += qty;
        // 가장 임박한 LOT 기준으로 표시
        if (daysLeft < cur.daysLeft) {
          cur.daysLeft = daysLeft;
          if (r.productName) cur.name = r.productName;
        }
      }
    }
    const fefoTop: FefoRow[] = [...fefoGroups.values()]
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

    const todayPurchasePartnerCount = new Set(todayPurchaseOrders.map((p) => p.partnerName)).size;
    let todayPurchaseItemCount = 0;
    let todayPurchaseAmount = 0;
    for (const po of todayPurchaseOrders) {
      todayPurchaseItemCount += po.details.length;
      for (const d of po.details) {
        const p = d.unitPrice || d.product?.prices?.[0]?.purchasePrice || 0;
        todayPurchaseAmount += (d.orderQty || 1) * p;
      }
    }

    const deliveryTotalCount = todayDeliveries.length;
    const deliveryDoneCount = todayDeliveries.filter((d) => d.status === '완료').length;
    const deliveryRate =
      deliveryTotalCount > 0 ? Math.round((deliveryDoneCount / deliveryTotalCount) * 1000) / 10 : 0;

    // ── 5.5. 금일 입고 현황 ────────────────────────────────
    const todayReceivingTotal = todayReceivingRows.length;
    const todayReceivingDone = todayReceivingRows.filter(
      (r) => r.status === '검수완료' || r.status === '입고'
    ).length;
    const todayReceivingAmount = todayReceivingRows.reduce((s, r) => s + (r.totalAmount || 0), 0);
    const todayReceivingPending = todayReceivingRows.filter(
      (r) => r.status === '대기' || r.status === '검수대기'
    ).length;

    // ── 6. 창고별 재고금액 ─────────────────────────────────
    const whMap = new Map<string, { items: number; amount: number }>();
    for (const r of warehouseRows) {
      const key = (r.warehouse || '').trim() || '창고미지정';
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
        menuId: 'pur-mat-order-day',
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

    // ── 7.5. 수주 트렌드 & 품목 모멘텀 인텔리전스 (실데이터 기반) ──
    const recentBonOrders = await prisma.salesOrder.findMany({
      where: {
        status: { not: '취소' },
        uploadMethod: { contains: '본발주' },
      },
      include: {
        details: {
          select: {
            totalQty: true,
            orderQty1: true,
            orderQty2: true,
            amount: true,
            product: { select: { productCode: true, name: true, category: true, kind: true } },
          },
        },
      },
      orderBy: { orderDate: 'desc' },
      take: 35,
    });

    const dateMap = new Map<string, typeof recentBonOrders>();
    for (const o of recentBonOrders) {
      if (!dateMap.has(o.orderDate)) dateMap.set(o.orderDate, []);
      dateMap.get(o.orderDate)!.push(o);
    }

    const allDates = Array.from(dateMap.keys()).sort();
    const baseDate = allDates[allDates.length - 1] || today;
    const last14Dates = allDates.slice(-14);
    const last7Dates = allDates.slice(-7);
    const prev7Dates = allDates.slice(-14, -7);

    const prodMap = new Map<
      string,
      { code: string; name: string; category: string; daily: Record<string, number>; s1: number; s2: number }
    >();
    let totShift1 = 0;
    let totShift2 = 0;

    for (const d of last14Dates) {
      const ords = dateMap.get(d) || [];
      for (const o of ords) {
        for (const dt of o.details) {
          const code = dt.product?.productCode || 'UNKNOWN';
          const name = dt.product?.name || '알 수 없음';
          const cat = dt.product?.kind || dt.product?.category || '완성품';
          if (!prodMap.has(code)) {
            prodMap.set(code, { code, name, category: cat, daily: {}, s1: 0, s2: 0 });
          }
          const p = prodMap.get(code)!;
          p.daily[d] = (p.daily[d] || 0) + (dt.totalQty || 0);
          if (last7Dates.includes(d)) {
            p.s1 += dt.orderQty1 || 0;
            p.s2 += dt.orderQty2 || 0;
            totShift1 += dt.orderQty1 || 0;
            totShift2 += dt.orderQty2 || 0;
          }
        }
      }
    }

    const trendItems: DemandTrendItem[] = [];
    for (const p of prodMap.values()) {
      const sumLast7 = last7Dates.reduce((s, d) => s + (p.daily[d] || 0), 0);
      const sumPrev7 = prev7Dates.reduce((s, d) => s + (p.daily[d] || 0), 0);
      const diff = sumLast7 - sumPrev7;
      const pct = sumPrev7 > 0 ? (diff / sumPrev7) * 100 : (sumLast7 > 0 ? 100 : 0);
      const spark14 = last14Dates.map((d) => p.daily[d] || 0);

      trendItems.push({
        code: p.code,
        name: p.name,
        category: p.category,
        avgDailyQty: Math.round(sumLast7 / Math.max(1, last7Dates.length)),
        sumLast7,
        sumPrev7,
        pct: Math.round(pct * 10) / 10,
        spark14,
        recommendation: '모니터링',
      });
    }

    const surge: DemandTrendItem[] = trendItems
      .filter((it) => it.sumPrev7 >= 50 || it.sumLast7 >= 100)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5)
      .map((it) => ({ ...it, recommendation: '자재 안전확보' }));

    const drop: DemandTrendItem[] = trendItems
      .filter((it) => it.sumPrev7 >= 50)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 5)
      .map((it) => ({ ...it, recommendation: '포장재 발주동결' }));

    const volume: DemandTrendItem[] = [...trendItems]
      .sort((a, b) => b.sumLast7 - a.sumLast7)
      .slice(0, 5)
      .map((it) => ({ ...it, recommendation: '안정 연속생산' }));

    const totShift = totShift1 + totShift2;
    const shiftRatio = {
      shift1Pct: totShift > 0 ? Math.round((totShift1 / totShift) * 1000) / 10 : 50,
      shift2Pct: totShift > 0 ? Math.round((totShift2 / totShift) * 1000) / 10 : 50,
    };

    const demandTrend: DemandTrendStats = {
      surge,
      drop,
      volume,
      shiftRatio,
      baseDate,
      dates14: last14Dates,
    };

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
        totalInventoryItems: warehouseRows.length,
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
        todayPurchaseItemCount,
        todayPurchaseAmount: Math.round(todayPurchaseAmount),
        todayPurchasePartnerCount,
        todayReceivingTotal,
        todayReceivingDone,
        todayReceivingAmount: Math.round(todayReceivingAmount),
        todayReceivingPending,
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
      demandTrend,
      fetchedAt: new Date().toISOString(),
    };

    return data;
}
