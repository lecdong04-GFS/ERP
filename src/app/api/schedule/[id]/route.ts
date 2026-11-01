import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CATEGORIES = ['생산', '회의', '휴무', '검사', '납품', '교육', '기타'] as const;

function isAdmin(session: any): boolean {
  return (session?.user as any)?.role === '관리자';
}

async function loadSchedule(id: number) {
  return prisma.schedule.findFirst({ where: { id, deletedAt: null } });
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { id } = await context.params;
    const item = await loadSchedule(Number(id));
    if (!item) return NextResponse.json({ success: false, error: '일정을 찾을 수 없습니다.' }, { status: 404 });
    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '조회 실패' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const { id } = await context.params;
    const scheduleId = Number(id);
    const schedule = await loadSchedule(scheduleId);
    if (!schedule) return NextResponse.json({ success: false, error: '일정을 찾을 수 없습니다.' }, { status: 404 });

    const isOwner = schedule.authorId === Number(me.id);
    if (!isAdmin(session) && !isOwner) {
      return NextResponse.json({ success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = String(body.title).trim();
    if (body.content !== undefined) updateData.content = String(body.content).trim();
    if (body.scheduleDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.scheduleDate)) updateData.scheduleDate = body.scheduleDate;
    if (body.startTime !== undefined) updateData.startTime = String(body.startTime);
    if (body.endTime !== undefined) updateData.endTime = String(body.endTime);
    if (body.category !== undefined && (CATEGORIES as readonly string[]).includes(body.category)) updateData.category = body.category;
    if (body.allDay !== undefined) updateData.allDay = body.allDay === true;
    if (body.department !== undefined) updateData.department = String(body.department).trim();

    if (updateData.title !== undefined && (updateData.title.length < 1 || updateData.title.length > 200)) {
      return NextResponse.json({ success: false, error: '제목은 1~200자로 입력하세요.' }, { status: 400 });
    }

    const updated = await prisma.schedule.update({ where: { id: scheduleId }, data: updateData });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '일정수정',
          menuId: 'work-schedule',
          menuName: '일정관리',
          detail: `${me.name || me.loginId} 일정 수정: ${updated.title} (${updated.scheduleDate})`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '일정 수정 실패' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const { id } = await context.params;
    const scheduleId = Number(id);
    const schedule = await loadSchedule(scheduleId);
    if (!schedule) return NextResponse.json({ success: false, error: '일정을 찾을 수 없습니다.' }, { status: 404 });

    const isOwner = schedule.authorId === Number(me.id);
    if (!isAdmin(session) && !isOwner) {
      return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    await prisma.schedule.update({ where: { id: scheduleId }, data: { deletedAt: new Date() } });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '일정삭제',
          menuId: 'work-schedule',
          menuName: '일정관리',
          detail: `${me.name || me.loginId} 일정 삭제: ${schedule.title} (${schedule.scheduleDate})`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '일정 삭제 실패' }, { status: 500 });
  }
}
