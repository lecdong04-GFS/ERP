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
      parentProduct: { select: { name: true } },
      details: {
        include: {
          childProduct: { select: { name: true, unit: true, warehouse: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const map = new Map<string, BomMaterialInput[]>();
  for (const h of headers) {
    const parentNorm = normalizeBaseProductName(h.parentProduct?.name || '').replace(/\s+/g, '');
    if (!parentNorm) continue;
    const mats: BomMaterialInput[] = h.details
      .filter((d) => d.childProduct?.name)
      .map((d) => ({
        materialName: d.childProduct.name,
        unitQty: Number(d.unitQty) || 0,
        unit: d.unit || d.childProduct.unit || 'g',
        warehouse: d.childProduct.warehouse || '',
        nextProcess: d.nextProcess || '',
      }));
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

