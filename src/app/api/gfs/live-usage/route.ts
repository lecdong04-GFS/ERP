import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

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

    // 1) 당일 완제품 수주량 합산 (productId 기준)
    const orders = await prisma.salesOrder.findMany({
      where: { orderDate: date },
      include: { details: true },
    });
    const menuQty = new Map<number, { qty: number; code: string; name: string }>();
    for (const o of orders) {
      for (const d of o.details as any[]) {
        const pid = Number(d.productId);
        if (!pid || !(Number(d.totalQty) > 0)) continue;
        const cur = menuQty.get(pid) || { qty: 0, code: String(d.productCode || ''), name: String(d.productName || '') };
        cur.qty += Number(d.totalQty);
        menuQty.set(pid, cur);
      }
    }
    if (menuQty.size === 0) {
      return NextResponse.json({
        success: true,
        data: { asOf: date, orderCount: 0, rows: [], message: '해당 일자 수주 없음' },
      });
    }

    // 2) BOM 전개 (부모별 최신 헤더 1개)
    const headers = await prisma.bomHeader.findMany({
      include: {
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
      const mq = menuQty.get(h.parentProductId);
      if (!mq || !(mq.qty > 0)) continue;
      for (const d of h.details) {
        const unitQty = Number(d.unitQty) || 0;
        if (!(unitQty > 0)) continue;
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

    const rows = [...acc.entries()].map(([pid, v]) => {
      const p = childMap.get(pid);
      const daily = Math.ceil(v.daily * 10) / 10; // ROUNDUP 1자리 (엑셀과 동일)
      const total = invMap.get(pid) || 0;
      return {
        productId: pid,
        productCode: p?.productCode || '',
        productName: p?.name || '',
        warehouse: p?.warehouse || '',
        liveDaily: daily,
        liveTotal: total,
        liveDays: daily > 0 ? total / daily : null,
        menuCount: v.menus.length,
        menus: v.menus.slice(0, 5),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        asOf: date,
        orderCount: orders.length,
        menuCount: menuQty.size,
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