import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';
import { requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const resultDate = searchParams.get('resultDate');
    const gyeId = searchParams.get('gyeId');
    const workOrderId = searchParams.get('workOrderId');

    const where: any = {};
    if (resultDate) where.resultDate = resultDate;
    if (gyeId && gyeId !== 'ALL') where.gyeId = gyeId;
    if (workOrderId) where.workOrderId = Number(workOrderId);

    const list = await prisma.productionResult.findMany({
      where,
      include: {
        product: true,
        workOrder: true,
      },
      orderBy: { id: 'desc' },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'production', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const { action, id, ...data } = body;

    const created = await prisma.productionResult.create({
      data: {
        resultDate: data.resultDate || kstToday(),
        workOrderId: data.workOrderId ? Number(data.workOrderId) : null,
        shift: data.shift || '1편',
        gyeId: data.gyeId || '',
        gyeName: data.gyeName || '',
        productId: Number(data.productId) || 1,
        productCode: data.productCode || '',
        productName: data.productName || '',
        orderQty: Number(data.orderQty) || 0,
        prodQty: Number(data.prodQty) || 0,
        defectQty: Number(data.defectQty) || 0,
        yieldRate: Number(data.yieldRate) || 100,
        remark: data.remark || '',
        createdBy: data.createdBy || auth.user.name || auth.user.loginId,
      },
    });
    await touchDashboardSnapshot();
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
