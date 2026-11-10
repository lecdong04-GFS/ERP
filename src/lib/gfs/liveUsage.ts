import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { CANONICAL_DAILY_REPORTS } from '@/components/production/data/dailyProductionReportData';
import { normName } from '@/lib/gfs/canonical';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';

export function normalizeForBom(name: string): string {
  let s = (name || '').trim();
  s = s.replace(/^\(주문\)\s*/, '');
  s = s.replace(/\s*[12]편$/, '');
  s = s.replace(/[12]$/, '');
  s = s.replace(/\s+/g, '');
  return s;
}

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
 * GFS 정본 엑셀 공식: ROUNDUP(SUMPRODUCT(완제품수주수량, 단위소요량)/1000, 1)
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

  const seenOrderKeys = new Set<string>();
  const uniqueOrders = orders.filter((o) => {
    const docKey =
      o.remark && o.remark.startsWith('DOC:')
        ? o.remark
        : `${o.orderDate}_${o.totalQty}_${o.totalAmount}`;
    if (seenOrderKeys.has(docKey)) return false;
    seenOrderKeys.add(docKey);
    return true;
  });

  const menuQty = new Map<number, { qty: number; code: string; name: string }>();
  const menuQtyByNorm = new Map<string, { qty: number; code: string; name: string }>();

  for (const o of uniqueOrders) {
    for (const d of o.details as any[]) {
      const pid = Number(d.productId);
      const qty = Number(d.totalQty) || 0;
      if (!pid || qty <= 0) continue;
      const pName = d.product?.name || d.productName || '';
      const code = String(d.productCode || d.product?.productCode || '');
      const cur = menuQty.get(pid) || { qty: 0, code, name: pName };
      cur.qty += qty;
      menuQty.set(pid, cur);

      const norm = normalizeForBom(pName);
      if (norm) {
        const normCur = menuQtyByNorm.get(norm) || { qty: 0, code, name: pName };
        normCur.qty += qty;
        menuQtyByNorm.set(norm, normCur);
      }
    }
  }

  // 1-1) 수주 전표 부재 시 생산일보 폴백
  if (menuQtyByNorm.size === 0 && CANONICAL_DAILY_REPORTS[date]) {
    const canonical = CANONICAL_DAILY_REPORTS[date];
    for (const item of canonical.items) {
      if (item.totalQty > 0) {
        const norm = normalizeForBom(item.productName);
        if (norm) {
          menuQtyByNorm.set(norm, { qty: item.totalQty, code: '', name: item.productName });
        }
      }
    }
  }

  if (menuQtyByNorm.size === 0) {
    const prodResults = await prisma.productionResult.findMany({
      where: { resultDate: date },
    });
    for (const pr of prodResults) {
      const qty = Number(pr.prodQty) || 0;
      if (qty > 0) {
        const norm = normalizeForBom(pr.productName);
        if (norm) {
          menuQtyByNorm.set(norm, { qty, code: pr.productCode || '', name: pr.productName });
        }
      }
    }
  }

  const byProductId = new Map<number, number>();
  const byProductCode = new Map<string, number>();
  const byNormName = new Map<string, number>();

  if (menuQtyByNorm.size === 0) {
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

  // 2) 최신 BOM 전개
  const headers = await prisma.bomHeader.findMany({
    where: { isUsed: true },
    include: {
      parentProduct: true,
      details: {
        include: { childProduct: true },
      },
    },
    orderBy: { id: 'desc' },
  });

  const seenParent = new Set<number>();
  const latestHeaders = headers.filter((h) => {
    if (seenParent.has(h.parentProductId)) return false;
    seenParent.add(h.parentProductId);
    return true;
  });

  // 3) 자재별 일사용량 집계 = SUM(메뉴수량 x 단위소요량) / 1000
  const todayKst = kstToday();
  const acc = new Map<number, { daily: number; productCode: string; productName: string }>();

  for (const h of latestHeaders) {
    let mq = menuQty.get(h.parentProductId);
    if (!mq && h.parentProduct?.name) {
      mq = menuQtyByNorm.get(normalizeForBom(h.parentProduct.name));
    }
    if (!mq || !(mq.qty > 0)) continue;

    for (const d of h.details) {
      const unitQty = Number(d.unitQty) || 0;
      if (!(unitQty > 0)) continue;
      const u = (d.unit || '').trim();
      // 다단계 배치 개봉용 더미 행(1통, 1box, 1캔 등) 필터링
      if (unitQty === 1 && (u === '통' || u === 'box' || u === '박스' || u === '캔')) continue;

      const cp = d.childProduct;
      if (!cp || !cp.isUsed) continue;
      if (isExcludedFromOrder(cp.name, date)) continue;
      if (cp.discontinuedDate && (todayKst >= cp.discontinuedDate || date >= cp.discontinuedDate)) continue;

      const childId = d.childProductId;
      const code = cp.productCode || '';
      const name = cp.name || '';
      const e = acc.get(childId) || { daily: 0, productCode: code, productName: name };
      e.daily += (mq.qty * unitQty) / 1000;
      if (code) e.productCode = code;
      if (name) e.productName = name;
      acc.set(childId, e);
    }
  }

  acc.forEach((v, pid) => {
    // 엑셀 공식과 동일하게 1자리 ROUNDUP
    const daily = Math.ceil(v.daily * 10) / 10;
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
    menuCount: menuQtyByNorm.size,
  };
}
