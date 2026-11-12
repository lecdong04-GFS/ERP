import prisma from '@/lib/prisma';
import { normName } from '@/lib/gfs/canonical';
import { normalizeDateYmd } from '@/lib/gfs/orderCalc';
import {
  dedupSalesOrders,
  isDummyBomDetail,
  matchBomHeader,
} from '@/lib/gfs/bomMatch';

export type DormantTier = 'active' | 'dormant' | 'unlinked_dormant';

export interface MaterialActivityInfo {
  activeBomCount: number;
  lastBomOrderDate: string;
  lastSnapDecreaseDate: string;
  lastSnapDate: string;
  snapObsCount: number;
  hasRecentOrderBom: boolean;
  hasRecentSnapDecrease: boolean;
  isDormant: boolean;
  dormantTier: DormantTier;
}

export interface DormantAnalysisResult {
  dormantDays: number;
  latestOrderDate: string;
  orderCutoffDate: string;
  latestSnapDate: string;
  snapCutoffDate: string;
  snapDatesCount: number;
  getInfo: (productId: number, productName: string) => MaterialActivityInfo;
}

function subtractDaysYmd(ymd: string, days: number): string {
  const norm = normalizeDateYmd(ymd);
  if (!norm) return '';
  const d = new Date(`${norm}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * 최근 N일간 (1) 완제품 수주 × BOM 소요 실적과 (2) 일일 재고조사표(InventorySnapshot) 수량 감소 이력을
 * 교차 분석해 현재 수주와 무관하게 멈춰 있는 휴면/불용 의심 원·부자재를 판별한다.
 */
export async function analyzeDormantMaterials(
  refDateYmd: string,
  dormantDaysInput = 14
): Promise<DormantAnalysisResult> {
  const refDate = normalizeDateYmd(refDateYmd) || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dormantDays = Number.isFinite(dormantDaysInput)
    ? Math.max(0, Math.min(90, Math.round(dormantDaysInput)))
    : 14;

  // 조회 범위가 너무 크지 않도록 최소 45일(또는 지정일수+15일) 이내 이력만 조회
  const lookbackDays = Math.max(dormantDays + 15, 45);
  const lookbackStart = subtractDaysYmd(refDate, lookbackDays);

  const [reprMappings, headers, recentOrders, snapshotRows] = await Promise.all([
    prisma.reprProduct.findMany({
      where: { isUsed: true },
      select: { orderProductId: true, reprProductId: true },
    }),
    prisma.bomHeader.findMany({
      where: { isUsed: true },
      include: {
        parentProduct: true,
        details: { include: { childProduct: true } },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.salesOrder.findMany({
      where: {
        status: { not: '취소' },
        orderDate: { gte: lookbackStart, lte: refDate },
      },
      include: {
        details: {
          include: { product: true },
        },
      },
      orderBy: { orderDate: 'desc' },
    }),
    prisma.inventorySnapshot.findMany({
      where: {
        snapshotDate: { gte: lookbackStart, lte: refDate },
      },
      select: {
        snapshotDate: true,
        productId: true,
        productName: true,
        currentQty: true,
      },
      orderBy: { snapshotDate: 'asc' },
    }),
  ]);

  // 1) 정본 BOM 헤더 정렬 (liveUsage.ts와 동일 우선순위)
  const seenParent = new Set<number>();
  const uniqueHeaders = headers.filter((h) => {
    if (seenParent.has(h.parentProductId)) return false;
    if (!h.details || h.details.length === 0) return false;
    seenParent.add(h.parentProductId);
    return true;
  });
  uniqueHeaders.sort((a, b) => {
    const aHasRawBag = a.details.some((d) => isDummyBomDetail(d.unit, d.unitQty));
    const bHasRawBag = b.details.some((d) => isDummyBomDetail(d.unit, d.unitQty));
    if (aHasRawBag !== bHasRawBag) return aHasRawBag ? 1 : -1;
    const aCat = a.parentProduct?.category === '완성품' ? 0 : 1;
    const bCat = b.parentProduct?.category === '완성품' ? 0 : 1;
    if (aCat !== bCat) return aCat - bCat;
    return a.id - b.id;
  });

  const headerByParentId = new Map<number, (typeof uniqueHeaders)[number]>();
  for (const h of uniqueHeaders) headerByParentId.set(h.parentProductId, h);

  const reprByOrderId = new Map<number, number>();
  for (const r of reprMappings) reprByOrderId.set(r.orderProductId, r.reprProductId);

  // 활성 BOM에 실제로 연결된 완제품/반제품 수 집계
  const activeBomParentsCount = new Map<number, number>();
  for (const h of uniqueHeaders) {
    for (const d of h.details) {
      if (!(Number(d.unitQty) > 0) || isDummyBomDetail(d.unit, Number(d.unitQty))) continue;
      if (d.childProductId === h.parentProductId) continue;
      activeBomParentsCount.set(d.childProductId, (activeBomParentsCount.get(d.childProductId) || 0) + 1);
    }
  }

  // 2) 최근 수주 × BOM 전개로 자재별 마지막 수주일 집계
  const lastBomOrderDateByMatId = new Map<number, string>();
  const uniqueOrders = dedupSalesOrders(recentOrders);
  let latestOrderDate = '';

  for (const o of uniqueOrders) {
    const oDate = normalizeDateYmd(o.orderDate);
    if (!oDate) continue;
    if (!latestOrderDate || oDate > latestOrderDate) latestOrderDate = oDate;

    for (const det of o.details as any[]) {
      const pid = Number(det.productId) || null;
      const qty = Number(det.totalQty) || 0;
      if (qty <= 0) continue;
      const pName = det.product?.name || det.productName || '';

      let matchedHeader: (typeof uniqueHeaders)[number] | null = null;
      if (pid && reprByOrderId.has(pid)) {
        matchedHeader = headerByParentId.get(reprByOrderId.get(pid)!) || null;
      }
      if (!matchedHeader && pid && headerByParentId.has(pid)) {
        const direct = headerByParentId.get(pid)!;
        if (!direct.details.some((d) => isDummyBomDetail(d.unit, d.unitQty))) matchedHeader = direct;
      }
      if (!matchedHeader) {
        matchedHeader = matchBomHeader(pName, pid, uniqueHeaders);
      }
      if (!matchedHeader) continue;

      for (const d of matchedHeader.details) {
        if (!(Number(d.unitQty) > 0) || isDummyBomDetail(d.unit, Number(d.unitQty))) continue;
        if (d.childProductId === matchedHeader.parentProductId) continue;
        const prev = lastBomOrderDateByMatId.get(d.childProductId) || '';
        if (oDate > prev) lastBomOrderDateByMatId.set(d.childProductId, oDate);
      }
    }
  }

  // 3) 재고조사표 일별 합계 시계열 구축 및 마지막 수량 감소일 계산
  const snapDatesSet = new Set<string>();
  const snapByPid = new Map<number, Map<string, number>>();
  const snapByNorm = new Map<string, Map<string, number>>();

  for (const r of snapshotRows) {
    const sDate = normalizeDateYmd(r.snapshotDate);
    if (!sDate) continue;
    snapDatesSet.add(sDate);
    const qty = Number(r.currentQty) || 0;
    if (r.productId) {
      if (!snapByPid.has(r.productId)) snapByPid.set(r.productId, new Map());
      const m = snapByPid.get(r.productId)!;
      m.set(sDate, (m.get(sDate) || 0) + qty);
    }
    const nk = normName(r.productName || '');
    if (nk) {
      if (!snapByNorm.has(nk)) snapByNorm.set(nk, new Map());
      const m = snapByNorm.get(nk)!;
      m.set(sDate, (m.get(sDate) || 0) + qty);
    }
  }

  const snapDates = Array.from(snapDatesSet).sort();
  const latestSnapDate = snapDates[snapDates.length - 1] || '';

  const anchorOrderDate = latestOrderDate || refDate;
  const anchorSnapDate = latestSnapDate || refDate;
  const orderCutoffDate = dormantDays > 0 ? subtractDaysYmd(anchorOrderDate, dormantDays) : '';
  const snapCutoffDate = dormantDays > 0 ? subtractDaysYmd(anchorSnapDate, dormantDays) : '';
  const windowSnapDatesCount =
    dormantDays > 0 ? snapDates.filter((d) => d >= snapCutoffDate).length : snapDates.length;

  const extractSnapStats = (dateQtyMap?: Map<string, number>) => {
    if (!dateQtyMap || dateQtyMap.size === 0) {
      return { lastDecreaseDate: '', lastSnapDate: '', obsCount: 0 };
    }
    const pts = Array.from(dateQtyMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let lastDecreaseDate = '';
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][1] < pts[i - 1][1]) {
        lastDecreaseDate = pts[i][0];
      }
    }
    return {
      lastDecreaseDate,
      lastSnapDate: pts[pts.length - 1][0],
      obsCount: pts.length,
    };
  };

  const getInfo = (productId: number, productName: string): MaterialActivityInfo => {
    const activeBomCount = activeBomParentsCount.get(productId) || 0;
    const lastBomOrderDate = lastBomOrderDateByMatId.get(productId) || '';
    const nk = normName(productName || '');
    const snapStats = extractSnapStats(snapByPid.get(productId) || (nk ? snapByNorm.get(nk) : undefined));

    // dormantDays === 0 이면 비수주 자동제외 비활성
    if (dormantDays <= 0) {
      return {
        activeBomCount,
        lastBomOrderDate,
        lastSnapDecreaseDate: snapStats.lastDecreaseDate,
        lastSnapDate: snapStats.lastSnapDate,
        snapObsCount: snapStats.obsCount,
        hasRecentOrderBom: true,
        hasRecentSnapDecrease: true,
        isDormant: false,
        dormantTier: 'active',
      };
    }

    const hasRecentOrderBom = Boolean(lastBomOrderDate && orderCutoffDate && lastBomOrderDate >= orderCutoffDate);
    // 스냅샷이 2일 미만이면 스냅샷 근거 부족으로 수주 기준으로만 판단하지 않고 안전하게 보호할지, 혹은 수주가 없을 때만 체크할지:
    // 스냅샷 비교 구간이 2회 이상 있을 때 감소 여부 판정; 스냅샷 자체가 거의 없는 신규/미조사 품목이면서 수주도 없다면 inactive
    const hasRecentSnapDecrease =
      windowSnapDatesCount >= 2
        ? Boolean(snapStats.lastDecreaseDate && snapCutoffDate && snapStats.lastDecreaseDate >= snapCutoffDate)
        : false;

    const isDormant = !hasRecentOrderBom && !hasRecentSnapDecrease;
    const dormantTier: DormantTier = !isDormant
      ? 'active'
      : activeBomCount === 0
      ? 'unlinked_dormant'
      : 'dormant';

    return {
      activeBomCount,
      lastBomOrderDate,
      lastSnapDecreaseDate: snapStats.lastDecreaseDate,
      lastSnapDate: snapStats.lastSnapDate,
      snapObsCount: snapStats.obsCount,
      hasRecentOrderBom,
      hasRecentSnapDecrease,
      isDormant,
      dormantTier,
    };
  };

  return {
    dormantDays,
    latestOrderDate,
    orderCutoffDate,
    latestSnapDate,
    snapCutoffDate,
    snapDatesCount: snapDates.length,
    getInfo,
  };
}
