import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { CANONICAL_DAILY_REPORTS } from '@/components/production/data/dailyProductionReportData';
import { normName } from '@/lib/gfs/canonical';

function normalizeForBom(name: string): string {
  let s = (name || '').trim();
  s = s.replace(/^\(주문\)\s*/, '');
  s = s.replace(/\s*[12]편$/, '');
  s = s.replace(/[12]$/, '');
  s = s.replace(/\s+/g, '');
  return s;
}

// GET /api/gfs/live-usage?date=YYYY-MM-DD
// ERP 자체 계산: 금일 완제품 수주량 x BOM = 자재별 live 일사용량 (GFS H열과 동일식)
// GFS를 열지 않아도 버팀일을 살아있게 만드는 엔진
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let date = searchParams.get('date') || '';

    if (!date) {
      const latest = await prisma.salesOrder.findFirst({
        orderBy: { orderDate: 'desc' },
        select: { orderDate: true },
      });
      date = latest?.orderDate || kstToday();
    }

    // 1) 당일 완제품 수주량 합산 (productId 및 품목명 기준)
    const orders = await prisma.salesOrder.findMany({
      where: { orderDate: date },
      include: {
        details: {
          include: { product: true },
        },
      },
    });

    // 동일 일자 중복 업로드 전표(DOC 해시 동일 또는 총량 동일 전표) 중복 합산 방어
    const seenOrderKeys = new Set<string>();
    const uniqueOrders = orders.filter((o) => {
      const docKey = o.remark && o.remark.startsWith('DOC:') ? o.remark : `${o.orderDate}_${o.totalQty}_${o.totalAmount}`;
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
        const cur = menuQty.get(pid) || { qty: 0, code: String(d.productCode || d.product?.productCode || ''), name: pName };
        cur.qty += qty;
        menuQty.set(pid, cur);

        const norm = normalizeForBom(pName);
        if (norm) {
          const normCur = menuQtyByNorm.get(norm) || { qty: 0, code: cur.code, name: pName };
          normCur.qty += qty;
          menuQtyByNorm.set(norm, normCur);
        }
      }
    }

    // 1-1) 수주 DB 전표가 없는 날짜 폴백: 정본 생산일보(CANONICAL_DAILY_REPORTS) 또는 생산실적 DB 연동
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

    if (menuQtyByNorm.size === 0) {
      return NextResponse.json({
        success: true,
        data: { asOf: date, orderCount: 0, rows: [], message: '해당 일자 수주 없음' },
      });
    }

    // 2) BOM 전개 (1: DB bomHeader 기반)
    const headers = await prisma.bomHeader.findMany({
      include: {
        parentProduct: true,
        details: true,
      },
      orderBy: { id: 'desc' },
    });
    const seenParent = new Set<number>();
    const latestHeaders = headers.filter((h) => {
      if (seenParent.has(h.parentProductId)) return false;
      seenParent.add(h.parentProductId);
      return true;
    });

    // 자재 id -> productCode/name 조회용
    const childIds = [...new Set(latestHeaders.flatMap((h) => h.details.map((d) => d.childProductId)))];
    const childProducts = await prisma.product.findMany({
      where: { id: { in: childIds } },
      select: { id: true, productCode: true, name: true, category: true, warehouse: true },
    });
    const childMap = new Map(childProducts.map((p) => [p.id, p]));

    // 3) 자재별 live 일사용량 = SUM(메뉴수량 x 단위소요량) / 1000 (엑셀 H열과 동일식)
    const acc = new Map<number, { daily: number; menus: { code: string; name: string; qty: number; unitQty: number }[] }>();
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
        const e = acc.get(d.childProductId) || { daily: 0, menus: [] };
        e.daily += (mq.qty * unitQty) / 1000;
        e.menus.push({ code: mq.code, name: mq.name, qty: mq.qty, unitQty });
        acc.set(d.childProductId, e);
      }
    }

    // 4) 현재고 합산 (창고 전체)
    const invSums = await prisma.inventory.groupBy({
      by: ['productId'],
      _sum: { currentQty: true },
    });
    const invMap = new Map(invSums.map((r) => [r.productId, Number(r._sum.currentQty) || 0]));

    // 전체 Product 품목 맵 (정본 BOM 매칭 및 productCode/재고 연결용)
    const allProducts = await prisma.product.findMany({
      select: { id: true, productCode: true, name: true, category: true, warehouse: true },
    });
    const prodByNorm = new Map(allProducts.map((p) => [normName(p.name), p]));

    const rowsByNorm = new Map<string, any>();

    [...acc.entries()].forEach(([pid, v]) => {
      const p = childMap.get(pid);
      const daily = Math.ceil(v.daily * 10) / 10; // ROUNDUP 1자리 (엑셀과 동일)
      const total = invMap.get(pid) || 0;
      const nm = p?.name || '';
      const k = normName(nm);
      if (k) {
        rowsByNorm.set(k, {
          productId: pid,
          productCode: p?.productCode || '',
          productName: nm,
          warehouse: p?.warehouse || '',
          liveDaily: daily,
          liveTotal: total,
          liveDays: daily > 0 ? total / daily : null,
          menuCount: v.menus.length,
          menus: v.menus.slice(0, 5),
          source: 'DB_BOM',
        });
      }
    });

    const rows = Array.from(rowsByNorm.values());

    return NextResponse.json({
      success: true,
      data: {
        asOf: date,
        orderCount: orders.length,
        menuCount: menuQtyByNorm.size,
        rowCount: rows.length,
        rows,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'live-usage 계산 실패' },
      { status: 500 }
    );
  }
}