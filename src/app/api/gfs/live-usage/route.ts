import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';
import { CANONICAL_DAILY_REPORTS } from '@/components/production/data/dailyProductionReportData';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';
import { isTerminalProductStatus } from '@/lib/gfs/productStatus';
import {
  calcDailyUsageFromParams,
  dedupSalesOrders,
  isDummyBomDetail,
  matchBomHeader,
  menuKey,
  normalizeForBom,
} from '@/lib/gfs/bomMatch';

// GET /api/gfs/live-usage?date=YYYY-MM-DD
// ERP 자체 계산: 금일 완제품 수주량 x 정본 BOM = 자재별 live 일사용량 (PostgreSQL 단일 진실 공급원)
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const reqDate = searchParams.get('date') || '';
    const exclusionDate = reqDate || kstToday();

    const resolveLatestOrderDate = async (lteDate?: string) => {
      if (lteDate) {
        const prior = await prisma.salesOrder.findFirst({
          where: { orderDate: { lte: lteDate }, status: { not: '취소' } },
          orderBy: { orderDate: 'desc' },
          select: { orderDate: true },
        });
        if (prior?.orderDate) return prior.orderDate;
      }
      const latest = await prisma.salesOrder.findFirst({
        where: { status: { not: '취소' } },
        orderBy: { orderDate: 'desc' },
        select: { orderDate: true },
      });
      return latest?.orderDate || '';
    };

    const loadOrderItemsForDate = async (d: string) => {
      const orders = await prisma.salesOrder.findMany({
        where: { orderDate: d, status: { not: '취소' } },
        include: {
          details: {
            include: { product: true },
          },
        },
      });

      const uniqueOrders = dedupSalesOrders(orders);
      const orderItems: Array<{ productId: number; code: string; name: string; qty: number }> = [];
      const byPid = new Map<number, { productId: number; code: string; name: string; qty: number }>();

      for (const o of uniqueOrders) {
        for (const det of o.details as any[]) {
          const pid = Number(det.productId) || 0;
          const qty = Number(det.totalQty) || 0;
          if (qty <= 0) continue;
          const name = det.product?.name || det.productName || '';
          const code = String(det.productCode || det.product?.productCode || '');
          if (pid > 0) {
            const cur = byPid.get(pid) || { productId: pid, code, name, qty: 0 };
            cur.qty += qty;
            byPid.set(pid, cur);
          } else if (name) {
            orderItems.push({ productId: 0, code, name, qty });
          }
        }
      }
      for (const v of byPid.values()) orderItems.push(v);

      // 수주 전표가 없는 날짜 폴백: 생산일보 / 생산실적
      if (orderItems.length === 0 && CANONICAL_DAILY_REPORTS[d]) {
        for (const item of CANONICAL_DAILY_REPORTS[d].items) {
          if (item.totalQty > 0) {
            orderItems.push({ productId: 0, code: '', name: item.productName, qty: item.totalQty });
          }
        }
      }
      if (orderItems.length === 0) {
        const prodResults = await prisma.productionResult.findMany({ where: { resultDate: d } });
        for (const pr of prodResults) {
          const qty = Number(pr.prodQty) || 0;
          if (qty > 0) {
            orderItems.push({ productId: 0, code: pr.productCode || '', name: pr.productName, qty });
          }
        }
      }

      return { uniqueOrders, orderItems };
    };

    let date = reqDate || (await resolveLatestOrderDate()) || exclusionDate;
    let { uniqueOrders, orderItems } = await loadOrderItemsForDate(date);

    // 당일/미래일 수주 미등록 시 기준일 이하 최근 수주로 자동 폴백
    if (orderItems.length === 0) {
      const fallbackDate = await resolveLatestOrderDate(reqDate || undefined);
      if (fallbackDate && fallbackDate !== date) {
        date = fallbackDate;
        ({ uniqueOrders, orderItems } = await loadOrderItemsForDate(date));
      }
    }

    if (orderItems.length === 0) {
      return NextResponse.json({
        success: true,
        data: { asOf: date, orderCount: 0, rows: [], message: '해당 일자 수주 없음' },
      });
    }

    // 2) 대표품목(ReprProduct) 및 정본 BOM 헤더 1:1 매핑
    const reprRows = await prisma.reprProduct.findMany({ where: { isUsed: true } });
    const reprByOrderPid = new Map<number, number>();
    for (const r of reprRows) reprByOrderPid.set(r.orderProductId, r.reprProductId);

    const headers = await prisma.bomHeader.findMany({
      where: { isUsed: true },
      include: {
        parentProduct: true,
        details: { include: { childProduct: true } },
      },
      orderBy: { id: 'asc' },
    });

    const usableHeaders = headers.filter((h) =>
      h.details.some(
        (d) =>
          !isDummyBomDetail(d.unit, d.unitQty) &&
          d.childProduct &&
          d.childProduct.category !== '반제품' &&
          d.childProduct.category !== '완성품',
      ),
    );
    const pool = usableHeaders.length > 0 ? usableHeaders : headers;

    const headerByParentId = new Map<number, (typeof pool)[number]>();
    const headerByMenuKey = new Map<string, (typeof pool)[number]>();
    const headerCandidates: Array<{ id: number; parentProductId: number; parentProduct?: { name?: string | null; category?: string | null } | null }> = [];

    for (const h of pool) {
      if (!headerByParentId.has(h.parentProductId)) {
        headerByParentId.set(h.parentProductId, h);
        headerCandidates.push({
          id: h.id,
          parentProductId: h.parentProductId,
          parentProduct: h.parentProduct,
        });
      }
      const mk = menuKey(h.parentProduct?.name || '');
      if (mk && !headerByMenuKey.has(mk)) headerByMenuKey.set(mk, h);
    }

    const headerQtyMap = new Map<
      number,
      { header: (typeof pool)[number]; qty: number; code: string; name: string }
    >();

    for (const item of orderItems) {
      let matchedHeader: (typeof pool)[number] | undefined;
      if (item.productId > 0) {
        const reprPid = reprByOrderPid.get(item.productId);
        if (reprPid && headerByParentId.has(reprPid)) {
          matchedHeader = headerByParentId.get(reprPid);
        }
      }
      if (!matchedHeader && item.productId > 0 && headerByParentId.has(item.productId)) {
        matchedHeader = headerByParentId.get(item.productId);
      }
      if (!matchedHeader && item.name) {
        const mk = menuKey(item.name);
        if (mk && headerByMenuKey.has(mk)) {
          matchedHeader = headerByMenuKey.get(mk);
        } else {
          const hit = matchBomHeader(item.name, item.productId || null, headerCandidates);
          if (hit) matchedHeader = headerByParentId.get(hit.parentProductId);
        }
      }
      if (!matchedHeader) continue;

      const cur = headerQtyMap.get(matchedHeader.id) || {
        header: matchedHeader,
        qty: 0,
        code: item.code || matchedHeader.parentProduct?.productCode || '',
        name: matchedHeader.parentProduct?.name || item.name,
      };
      cur.qty += item.qty;
      headerQtyMap.set(matchedHeader.id, cur);
    }

    // 3) 자재별 live 일사용량 계산 (Product별 bomDivisor/bomMultiplier/bomRoundDigits & BomDetail.orderBuffer 적용)
    const acc = new Map<
      number,
      {
        child: any;
        rawTotalBuffered: number;
        menus: { code: string; name: string; qty: number; unitQty: number }[];
      }
    >();

    for (const { header, qty, code, name } of headerQtyMap.values()) {
      if (!(qty > 0)) continue;
      for (const d of header.details) {
        const cp = d.childProduct as any;
        if (!cp || !cp.isUsed) continue;
        if (cp.category === '완성품' || cp.category === '반제품') continue;
        if (isTerminalProductStatus(cp.status)) continue;
        if (isExcludedFromOrder(cp.name, exclusionDate)) continue;
        if (cp.discontinuedDate && exclusionDate >= cp.discontinuedDate) continue;

        let unitQty = Number(d.unitQty) || 0;
        if (!(unitQty > 0)) continue;
        if (isDummyBomDetail(d.unit, unitQty)) continue;

        const u = (d.unit || '').trim().toLowerCase();
        const div = Number(cp.bomDivisor) > 0 ? Number(cp.bomDivisor) : 1000;
        if (u === 'kg' && div >= 100) {
          unitQty = unitQty * 1000;
        }

        const orderBuffer = Number((d as any).orderBuffer) > 0 ? Number((d as any).orderBuffer) : 1;
        const menuRaw = qty * unitQty * orderBuffer;

        const e = acc.get(cp.id) || { child: cp, rawTotalBuffered: 0, menus: [] };
        e.rawTotalBuffered += menuRaw;
        e.menus.push({ code, name, qty, unitQty });
        acc.set(cp.id, e);
      }
    }

    // 4) 현재고 합산 (창고 전체)
    const invSums = await prisma.inventory.groupBy({
      by: ['productId'],
      _sum: { currentQty: true },
    });
    const invMap = new Map(invSums.map((r) => [r.productId, Number(r._sum.currentQty) || 0]));

    const rows: any[] = [];
    for (const [pid, v] of acc.entries()) {
      const p = v.child;
      const div = Number(p.bomDivisor) > 0 ? Number(p.bomDivisor) : 1000;
      const mult = Number(p.bomMultiplier) > 0 ? Number(p.bomMultiplier) : 1;
      const digits = Number.isFinite(Number(p.bomRoundDigits)) ? Number(p.bomRoundDigits) : 1;
      const daily = calcDailyUsageFromParams(v.rawTotalBuffered, div, mult, 1, digits);
      const total = invMap.get(pid) || 0;
      const nm = p.name || '';
      if (nm) {
        rows.push({
          productId: pid,
          productCode: p.productCode || '',
          productName: nm,
          warehouse: p.warehouse || '',
          liveDaily: daily,
          liveTotal: total,
          liveDays: daily > 0 ? total / daily : null,
          menuCount: v.menus.length,
          menus: v.menus.slice(0, 5),
          source: 'DB_BOM',
        });
      }
    }

    const distinctMenuKeys = new Set(orderItems.map((it) => normalizeForBom(it.name)).filter(Boolean));

    return NextResponse.json({
      success: true,
      data: {
        asOf: date,
        orderCount: uniqueOrders.length,
        menuCount: distinctMenuKeys.size,
        rowCount: rows.length,
        rows,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'live-usage 계산 실패' },
      { status: 500 },
    );
  }
}