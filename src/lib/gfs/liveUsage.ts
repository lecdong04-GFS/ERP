import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { CANONICAL_DAILY_REPORTS } from '@/components/production/data/dailyProductionReportData';
import { normName } from '@/lib/gfs/canonical';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';
import {
  normalizeForBom,
  menuKey,
  matchBomHeader,
  dedupSalesOrders,
  isDummyBomDetail,
  calcDailyUsageFromParams,
} from '@/lib/gfs/bomMatch';

export { normalizeForBom };

export interface LiveBomUsageMap {
  asOfDate: string;
  byProductId: Map<number, number>;
  byProductCode: Map<string, number>;
  byNormName: Map<string, number>;
  rowCount: number;
  orderCount: number;
  menuCount: number;
}

/**
 * 당일 완제품 수주량 x BOM 레시피 전개 실시간 일사용량 산출 엔진
 * GFS 정본 엑셀 공식: ROUNDUP(SUMPRODUCT(완제품수주수량, 단위소요량 * orderBuffer) / bomDivisor, bomRoundDigits) * bomMultiplier
 * - 각 수주 메뉴(품목)는 ReprProduct → menuKey → matchBomHeader 우선순위로 **정확히 1개의 대표 BOM 헤더**에만 매칭 (중복 곱셈 차단)
 */
export async function getLiveBomUsageMap(targetDate?: string): Promise<LiveBomUsageMap> {
  let date = targetDate || '';
  if (!date) {
    const latest = await prisma.salesOrder.findFirst({
      orderBy: { orderDate: 'desc' },
      select: { orderDate: true },
    });
    date = latest?.orderDate || kstToday();
  }

  // 1) 당일 완제품 수주량 합산
  const orders = await prisma.salesOrder.findMany({
    where: { orderDate: date },
    include: {
      details: {
        include: { product: true },
      },
    },
  });

  const uniqueOrders = dedupSalesOrders(orders);

  interface MenuDemand {
    productId: number | null;
    name: string;
    code: string;
    qty: number;
  }
  const demandByKey = new Map<string, MenuDemand>();

  for (const o of uniqueOrders) {
    for (const d of o.details as any[]) {
      const pid = Number(d.productId) || null;
      const qty = Number(d.totalQty) || 0;
      if (qty <= 0) continue;
      const pName = d.product?.name || d.productName || '';
      const code = String(d.productCode || d.product?.productCode || '');
      const key = pid ? `PID:${pid}` : `NAME:${normalizeForBom(pName)}`;
      const cur = demandByKey.get(key) || { productId: pid, name: pName, code, qty: 0 };
      cur.qty += qty;
      demandByKey.set(key, cur);
    }
  }

  // 1-1) 수주 전표 부재 시 생산일보 폴백
  if (demandByKey.size === 0 && CANONICAL_DAILY_REPORTS[date]) {
    const canonical = CANONICAL_DAILY_REPORTS[date];
    for (const item of canonical.items) {
      if (item.totalQty > 0) {
        const key = `NAME:${normalizeForBom(item.productName)}`;
        const cur = demandByKey.get(key) || { productId: null, name: item.productName, code: '', qty: 0 };
        cur.qty += item.totalQty;
        demandByKey.set(key, cur);
      }
    }
  }

  if (demandByKey.size === 0) {
    const prodResults = await prisma.productionResult.findMany({
      where: { resultDate: date },
    });
    for (const pr of prodResults) {
      const qty = Number(pr.prodQty) || 0;
      if (qty > 0) {
        const key = pr.productId ? `PID:${pr.productId}` : `NAME:${normalizeForBom(pr.productName)}`;
        const cur = demandByKey.get(key) || {
          productId: pr.productId || null,
          name: pr.productName,
          code: pr.productCode || '',
          qty: 0,
        };
        cur.qty += qty;
        demandByKey.set(key, cur);
      }
    }
  }

  const byProductId = new Map<number, number>();
  const byProductCode = new Map<string, number>();
  const byNormName = new Map<string, number>();

  if (demandByKey.size === 0) {
    return {
      asOfDate: date,
      byProductId,
      byProductCode,
      byNormName,
      rowCount: 0,
      orderCount: 0,
      menuCount: 0,
    };
  }

  // 2) ReprProduct 매핑 + 활성 BOM 헤더 조회
  const [reprMappings, headers] = await Promise.all([
    prisma.reprProduct.findMany({
      where: { isUsed: true },
      select: { orderProductId: true, reprProductId: true },
    }),
    prisma.bomHeader.findMany({
      where: { isUsed: true },
      include: {
        parentProduct: true,
        details: {
          include: { childProduct: true },
        },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const reprByOrderId = new Map<number, number>();
  for (const r of reprMappings) {
    reprByOrderId.set(r.orderProductId, r.reprProductId);
  }

  // parentProductId별 1개 헤더 + 정본 단위(g/매/장) 헤더 우선 정렬
  const seenParent = new Set<number>();
  const uniqueHeaders = headers.filter((h) => {
    if (seenParent.has(h.parentProductId)) return false;
    // 빈 BOM 제외
    if (!h.details || h.details.length === 0) return false;
    seenParent.add(h.parentProductId);
    return true;
  });

  // g/매/장 정본 BOM 헤더를 .xls 다단계 미평탄화 헤더보다 우선 배치
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
  for (const h of uniqueHeaders) {
    headerByParentId.set(h.parentProductId, h);
  }

  // 2-1) 각 수주 품목을 정확히 1개의 대표 BOM 헤더에 매칭하여 헤더별 총 생산수량 집계
  const headerQtyMap = new Map<number, { header: (typeof uniqueHeaders)[number]; qty: number }>();
  const distinctMenus = new Set<string>();

  for (const dem of demandByKey.values()) {
    const mk = menuKey(dem.name);
    if (mk) distinctMenus.add(mk);

    let matchedHeader: (typeof uniqueHeaders)[number] | null = null;

    // (a) ReprProduct 매핑 우선
    if (dem.productId && reprByOrderId.has(dem.productId)) {
      const reprId = reprByOrderId.get(dem.productId)!;
      matchedHeader = headerByParentId.get(reprId) || null;
    }
    // (b) 직접 parentProductId 매칭 (단, 정본 g/매/장 헤더가 별도로 있으면 menuKey 정본 우선)
    if (!matchedHeader && dem.productId && headerByParentId.has(dem.productId)) {
      const direct = headerByParentId.get(dem.productId)!;
      const directHasDummy = direct.details.some((d) => isDummyBomDetail(d.unit, d.unitQty));
      if (!directHasDummy) {
        matchedHeader = direct;
      }
    }
    // (c) menuKey / normalizeForBom / CUSTOM_BOM_ALIAS 매칭 (uniqueHeaders가 정본 우선 정렬되어 있음)
    if (!matchedHeader) {
      matchedHeader = matchBomHeader(dem.name, dem.productId, uniqueHeaders);
    }

    if (!matchedHeader) continue;

    const cur = headerQtyMap.get(matchedHeader.id) || { header: matchedHeader, qty: 0 };
    cur.qty += dem.qty;
    headerQtyMap.set(matchedHeader.id, cur);
  }

  // 3) 자재별 일사용량 집계 = ROUNDUP(SUM(메뉴수량 x 단위소요량 x 발주여유계수) / bomDivisor, bomRoundDigits) x bomMultiplier
  const acc = new Map<
    number,
    { sum: number; productCode: string; productName: string; divisor: number; multiplier: number; digits: number }
  >();

  for (const { header: h, qty: totalMenuQty } of headerQtyMap.values()) {
    if (!(totalMenuQty > 0)) continue;

    for (const d of h.details) {
      let unitQty = Number(d.unitQty) || 0;
      if (!(unitQty > 0)) continue;
      // 다단계 배치 개봉용 더미 행(1통, 1box, 1캔, 1봉(팩) 등) 필터링
      if (isDummyBomDetail(d.unit, unitQty)) continue;
      if (d.childProductId === h.parentProductId) continue;

      const cp = d.childProduct as any;
      if (!cp || !cp.isUsed) continue;
      if (cp.category === '완성품' || cp.category === '반제품') continue;
      if (isExcludedFromOrder(cp.name, date)) continue;
      // 동적 기준일: 조회 대상일(date) 기준으로만 단종 판정
      if (cp.discontinuedDate && date >= cp.discontinuedDate) continue;

      // 단위 정규화: 만약 단위가 'Kg' / 'kg' 이고 bomDivisor >= 100 이면 g으로 환산
      const u = (d.unit || '').trim().toLowerCase();
      const div = Number(cp.bomDivisor) > 0 ? Number(cp.bomDivisor) : 1000;
      if (u === 'kg' && div >= 100) {
        unitQty = unitQty * 1000;
      }

      const childId = d.childProductId;
      const code = cp.productCode || '';
      const name = cp.name || '';
      const e = acc.get(childId) || {
        sum: 0,
        productCode: code,
        productName: name,
        divisor: div,
        multiplier: Number(cp.bomMultiplier) > 0 ? Number(cp.bomMultiplier) : 1,
        digits: Number.isFinite(Number(cp.bomRoundDigits)) ? Number(cp.bomRoundDigits) : 1,
      };
      const buffer = Number((d as any).orderBuffer) > 0 ? Number((d as any).orderBuffer) : 1;
      e.sum += totalMenuQty * unitQty * buffer;
      acc.set(childId, e);
    }
  }

  acc.forEach((v, pid) => {
    // 엑셀 H열 공식과 동일: ROUNDUP(SUMPRODUCT/분모, 자릿수) x 계수
    const daily = calcDailyUsageFromParams(v.sum, v.divisor, v.multiplier, 1, v.digits);
    if (daily > 0) {
      byProductId.set(pid, daily);
      if (v.productCode) byProductCode.set(v.productCode, daily);
      if (v.productName) {
        const n = normName(v.productName);
        if (n) byNormName.set(n, daily);
      }
    }
  });

  return {
    asOfDate: date,
    byProductId,
    byProductCode,
    byNormName,
    rowCount: byProductId.size,
    orderCount: uniqueOrders.length,
    menuCount: distinctMenus.size || demandByKey.size,
  };
}
