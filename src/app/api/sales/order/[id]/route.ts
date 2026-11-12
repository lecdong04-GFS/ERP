import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';

const STATUSES = ['접수', '확정', '취소'] as const;

// PUT /api/sales/order/[id] — 수주 상태 변경 (접수/확정/취소)
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession({ categoryId: 'sales', action: 'write' });
    if ('error' in auth) return auth.error;
    const me = auth.user;
    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ success: false, error: '유효하지 않은 수주 ID입니다.' }, { status: 400 });
    }
    const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
    if (!order) return NextResponse.json({ success: false, error: '수주를 찾을 수 없습니다.' }, { status: 404 });

    const body = await req.json();
    const status = String(body.status ?? '');
    if (!(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ success: false, error: '상태값이 올바르지 않습니다. (접수/확정/취소)' }, { status: 400 });
    }

    const updated = await prisma.salesOrder.update({
      where: { id: orderId },
      data: {
        status,
        cancelReason: status === '취소' ? String(body.cancelReason ?? '') : '',
        cancelDate: status === '취소' ? kstToday() : null,
      },
    });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: status === '취소' ? '수주취소' : '수주상태변경',
          menuId: 'sales-order-status-cancel',
          menuName: '주문현황/취소',
          detail: `${me.name || me.loginId} 수주 ${order.orderNo} → ${status}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '수주 상태 변경 실패' },
      { status: 500 }
    );
  }
}
