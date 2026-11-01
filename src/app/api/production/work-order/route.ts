import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';

// GET /api/production/work-order?workDate=2026-10-30&shift=1편&gyeId=GFS005
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workDate = searchParams.get('workDate');
    const shift = searchParams.get('shift');
    const gyeId = searchParams.get('gyeId');
    const status = searchParams.get('status');

    const where: any = {};
    if (workDate) where.workDate = workDate;
    if (shift) where.shift = shift;
    if (gyeId) where.gyeId = gyeId;
    if (status) where.status = status;

    const workOrders = await prisma.workOrder.findMany({
      where,
      include: {
        gye: true,
        product: true,
      },
      orderBy: [{ gyeId: 'asc' }, { workSeq: 'asc' }],
    });

    return NextResponse.json({ success: true, data: workOrders });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch work orders' },
      { status: 500 }
    );
  }
}

// POST /api/production/work-order (작업지시 생성 또는 상태 변경)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, workDate, shift, gyeId, productId, orderQty, workSeq, nextProcess, createdBy = 'admin' } = body;

    // 상태 업데이트 (진행중, 완료 등)
    if (action === 'update_status' && id) {
      const updated = await prisma.workOrder.update({
        where: { id: Number(id) },
        data: {
          status: body.status,
          prodQty: body.prodQty !== undefined ? Number(body.prodQty) : undefined,
          defectQty: body.defectQty !== undefined ? Number(body.defectQty) : undefined,
          completeTime: body.status === '완료' ? new Date().toLocaleTimeString('ko-KR') : undefined,
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (!workDate || !gyeId || !productId) {
      return NextResponse.json(
        { success: false, error: 'workDate, gyeId, and productId are required' },
        { status: 400 }
      );
    }

    const gye = await prisma.gyeMaster.findUnique({ where: { id: gyeId } });
    const product = await prisma.product.findUnique({ where: { id: Number(productId) } });
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const workOrderNo = `${makeDocNo('WO', workDate)}-${gyeId}`;

    const wo = await prisma.workOrder.create({
      data: {
        workOrderNo,
        workDate,
        shift: shift || '1편',
        gyeId,
        gyeName: gye?.name || '',
        productId: product.id,
        productCode: product.productCode,
        productName: product.name,
        spec: product.spec,
        unit: product.unit,
        orderQty: Number(orderQty || 0),
        workSeq: Number(workSeq || 1),
        nextProcess: nextProcess || '',
        status: '대기',
        createdBy,
      },
    });

    return NextResponse.json({ success: true, data: wo });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save work order' },
      { status: 500 }
    );
  }
}
