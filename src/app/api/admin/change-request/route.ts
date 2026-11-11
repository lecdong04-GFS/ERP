import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  const auth = await requireSession({ adminOnly: true });
  if (auth.error) return auth.error;

  try {
    const list = await prisma.changeRequest.findMany({
      orderBy: { id: 'desc' },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession({ adminOnly: true });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'update' && id) {
      const updated = await prisma.changeRequest.update({
        where: { id: Number(id) },
        data: {
          status: data.status,
          assignee: data.assignee,
          completeDate: data.completeDate,
          remark: data.remark,
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    const count = await prisma.changeRequest.count();
    const requestNo = `CR-${kstToday().replace(/-/g, '')}-${String(count + 1).padStart(3, '0')}`;

    const created = await prisma.changeRequest.create({
      data: {
        requestNo,
        requestDate: data.requestDate || kstToday(),
        requester: data.requester || auth.user.name,
        menuId: data.menuId || '',
        title: data.title || '기능 개선 요청',
        description: data.description || '',
        priority: data.priority || '보통',
        status: data.status || '접수',
        assignee: data.assignee || '',
        remark: data.remark || '',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}