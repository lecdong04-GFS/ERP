import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';
import {
  generateRiceWorkOrder,
  normalizeBaseProductName,
  type BomMaterialInput,
  type RawOrderInput,
} from '@/lib/production/riceScheduleEngine';

async function loadBomByNormName(): Promise<Map<string, BomMaterialInput[]>> {
  const headers = await prisma.bomHeader.findMany({
    where: { isUsed: true },
    include: {
      parentProduct: { select: { id: true, name: true } },
      details: {
        include: {
          childProduct: { select: { id: true, name: true, unit: true, warehouse: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const headerByParentId = new Map<number, (typeof headers)[number]>();
  for (const h of headers) {
    if (h.parentProductId && !headerByParentId.has(h.parentProductId)) {
      headerByParentId.set(h.parentProductId, h);
    }
  }

  const expandDetails = (
    details: (typeof headers)[number]['details'],
    parentFactor: number,
    visited: Set<number>
  ): BomMaterialInput[] => {
    const out: BomMaterialInput[] = [];
    for (const d of details) {
      if (!d.childProduct?.name) continue;
      const yf = 100 / Math.max(1, Number(d.yieldRate) || 100);
      const subHeader = d.childProductId ? headerByParentId.get(d.childProductId) : undefined;
      if (subHeader && !visited.has(d.childProductId) && subHeader.details.length > 0) {
        const nextVisited = new Set(visited);
        nextVisited.add(d.childProductId);
        // 반제품 1단위당 하위 원물 전개 (unitQty * yieldFactor 누적)
        const childFactor = parentFactor * (Number(d.unitQty) || 1) * yf;
        out.push(...expandDetails(subHeader.details, childFactor, nextVisited));
      } else {
        out.push({
          materialName: d.childProduct.name,
          unitQty: (Number(d.unitQty) || 0) * parentFactor,
          unit: d.unit || d.childProduct.unit || 'g',
          yieldRate: Number(d.yieldRate) || 100,
          warehouse: d.childProduct.warehouse || '',
          nextProcess: d.nextProcess || '',
        });
      }
    }
    return out;
  };

  const map = new Map<string, BomMaterialInput[]>();
  for (const h of headers) {
    const parentNorm = normalizeBaseProductName(h.parentProduct?.name || '').replace(/\s+/g, '');
    if (!parentNorm) continue;
    const mats = expandDetails(h.details, 1, new Set([h.parentProductId]));
    if (!map.has(parentNorm) || mats.length > (map.get(parentNorm)?.length || 0)) {
      map.set(parentNorm, mats);
    }
  }
  return map;
}

async function loadSalesOrdersForDate(orderDate: string): Promise<RawOrderInput[]> {
  if (!orderDate) return [];
  const orders = await prisma.salesOrder.findMany({
    where: { orderDate, status: { not: '취소' } },
    include: {
      details: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });

  const rows: RawOrderInput[] = [];
  for (const so of orders) {
    for (const d of so.details) {
      const name = d.product?.name || '';
      if (!name) continue;
      if ((d.orderQty2 || 0) > 0) {
        rows.push({ productName: name, shiftType: '2편', eaQty: d.orderQty2 });
      }
      if ((d.orderQty1 || 0) > 0) {
        rows.push({ productName: name, shiftType: '1편', eaQty: d.orderQty1 });
      }
      if ((d.orderQty2 || 0) === 0 && (d.orderQty1 || 0) === 0 && (d.totalQty || 0) > 0) {
        rows.push({
          productName: name,
          shiftType: so.shift === '1편' ? '1편' : '2편',
          eaQty: d.totalQty,
        });
      }
    }
  }
  return rows;
}

async function findBaselineOrderDate(workDate: string): Promise<string> {
  const latest = await prisma.salesOrder.findFirst({
    where: { orderDate: { lt: workDate }, status: { not: '취소' } },
    orderBy: { orderDate: 'desc' },
    select: { orderDate: true },
  });
  return latest?.orderDate || '';
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const workDate = searchParams.get('date') || kstToday();

    const [bomByNormName, confirmedOrders, baselineDate] = await Promise.all([
      loadBomByNormName(),
      loadSalesOrdersForDate(workDate),
      findBaselineOrderDate(workDate),
    ]);

    const baselineOrders = baselineDate ? await loadSalesOrdersForDate(baselineDate) : [];

    const pre10 = generateRiceWorkOrder({
      mode: 'pre10',
      workDate,
      orders: baselineOrders.length > 0 ? baselineOrders : confirmedOrders,
      bomByNormName,
    });

    const post10 = generateRiceWorkOrder({
      mode: 'post10',
      workDate,
      orders: confirmedOrders,
      pre10BaselineOrders: baselineOrders,
      bomByNormName,
    });

    return NextResponse.json({
      success: true,
      data: {
        workDate,
        baselineDate,
        hasConfirmedOrders: confirmedOrders.length > 0,
        pre10,
        post10,
      },
    });
  } catch (error: any) {
    console.error('[GET /api/production/rice-work-order]', error);
    return NextResponse.json(
      { success: false, error: error?.message || '작업지시서 자동 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const workDate = String(body?.date || kstToday());
    const ordviewRows: RawOrderInput[] = Array.isArray(body?.ordviewRows) ? body.ordviewRows : [];

    const [bomByNormName, baselineDate] = await Promise.all([
      loadBomByNormName(),
      findBaselineOrderDate(workDate),
    ]);
    const baselineOrders = baselineDate ? await loadSalesOrdersForDate(baselineDate) : [];

    const pre10 = generateRiceWorkOrder({
      mode: 'pre10',
      workDate,
      orders: baselineOrders.length > 0 ? baselineOrders : ordviewRows,
      bomByNormName,
    });

    const post10 = generateRiceWorkOrder({
      mode: 'post10',
      workDate,
      orders: ordviewRows,
      pre10BaselineOrders: baselineOrders,
      bomByNormName,
    });

    return NextResponse.json({
      success: true,
      data: {
        workDate,
        baselineDate,
        hasConfirmedOrders: ordviewRows.length > 0,
        source: 'ordview-excel',
        pre10,
        post10,
      },
    });
  } catch (error: any) {
    console.error('[POST /api/production/rice-work-order]', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'ordview 엑셀 기반 작업지시서 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

