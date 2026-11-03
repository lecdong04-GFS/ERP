import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

// GET /api/purchase/order?orderDate=2026-10-30&status=미입고
// GET /api/purchase/order?startDate=2026-10-01&endDate=2026-10-31 (기간 조회)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderDate = searchParams.get('orderDate');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: any = {};
    if (orderDate) {
      where.orderDate = orderDate;
    } else if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) where.orderDate.gte = startDate;
      if (endDate) where.orderDate.lte = endDate;
    }
    if (status && status !== '전체') where.status = status;
    if (search) {
      where.OR = [
        { orderNo: { contains: search } },
        { partnerName: { contains: search } },
      ];
    }

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        partner: true,
        details: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: orders });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch purchase orders' },
      { status: 500 }
    );
  }
}

// POST /api/purchase/order (발주 상태 변경 또는 취소)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, orderNo, status, cancelReason } = body;

    if (action === 'cancel' && (id || orderNo)) {
      const updated = await prisma.purchaseOrder.update({
        where: id ? { id: Number(id) } : { orderNo },
        data: {
          status: '발주취소',
          cancelReason: cancelReason || '사용자 요청에 의한 발주 취소',
          cancelDate: kstToday(),
        },
      });
      return NextResponse.json({ success: true, message: '발주가 성공적으로 취소되었습니다.', data: updated });
    }

    if (action === 'update_status' && id) {
      const updated = await prisma.purchaseOrder.update({
        where: { id: Number(id) },
        data: { status },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'update_order') {
      const { orderId, orderNo, details = [], remark, deliveryDate } = body;
      const targetId = orderId ? Number(orderId) : undefined;
      const po = await prisma.purchaseOrder.findFirst({
        where: targetId ? { id: targetId } : { orderNo },
        include: { details: true },
      });

      if (!po) {
        return NextResponse.json({ success: false, error: '발주서를 찾을 수 없습니다.' }, { status: 404 });
      }

      let newTotalAmount = 0;

      await prisma.$transaction(async (tx) => {
        for (const dt of details) {
          const detailId = Number(dt.id);
          const orderQty = Math.max(0, Number(dt.orderQty) || 0);
          const unitPrice = Math.max(0, Number(dt.unitPrice) || 0);
          const amount = orderQty * unitPrice;
          newTotalAmount += amount;

          const existingDetail = po.details.find((d) => d.id === detailId);
          const receivedQty = existingDetail?.receivedQty || 0;
          const remainQty = Math.max(0, orderQty - receivedQty);

          if (existingDetail) {
            await tx.purchaseOrderDetail.update({
              where: { id: detailId },
              data: {
                orderQty,
                unitPrice,
                amount,
                remainQty,
                remark: dt.remark !== undefined ? dt.remark : existingDetail.remark,
              },
            });
          }
        }

        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: {
            totalAmount: newTotalAmount,
            ...(remark !== undefined ? { remark } : {}),
            ...(deliveryDate !== undefined ? { deliveryDate } : {}),
          },
        });
      });

      const refreshed = await prisma.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { details: true, partner: true },
      });

      return NextResponse.json({
        success: true,
        message: '발주서가 성공적으로 수정되었습니다.',
        data: refreshed,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update purchase order' },
      { status: 500 }
    );
  }
}
