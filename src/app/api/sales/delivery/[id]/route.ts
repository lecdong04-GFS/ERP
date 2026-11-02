import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const STATUSES = ['대기', '출하', '완료', '취소'] as const;

// PUT /api/sales/delivery/[id] — 납품 상태 변경 (대기/출하/완료/취소)
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const { id } = await context.params;
    const deliveryId = Number(id);
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) return NextResponse.json({ success: false, error: '납품을 찾을 수 없습니다.' }, { status: 404 });

    const body = await req.json();
    const status = String(body.status ?? '');
    if (!(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ success: false, error: '상태값이 올바르지 않습니다. (대기/출하/완료/취소)' }, { status: 400 });
    }

    const updated = await prisma.delivery.update({ where: { id: deliveryId }, data: { status } });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '납품상태변경',
          menuId: 'sales-delivery-status-edit',
          menuName: '납품현황/수정',
          detail: `${me.name || me.loginId} 납품 ${delivery.deliveryNo} → ${status}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '납품 상태 변경 실패' },
      { status: 500 }
    );
  }
}
