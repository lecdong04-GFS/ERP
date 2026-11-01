import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const STATUSES = ['완료', '진행중', '보류'] as const;

function isAdmin(session: any): boolean {
  return (session?.user as any)?.role === '관리자';
}

async function loadExec(id: number) {
  return prisma.workExecution.findFirst({ where: { id, deletedAt: null } });
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { id } = await context.params;
    const item = await loadExec(Number(id));
    if (!item) return NextResponse.json({ success: false, error: '찾을 수 없습니다.' }, { status: 404 });
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
    const execId = Number(id);
    const exec = await loadExec(execId);
    if (!exec) return NextResponse.json({ success: false, error: '찾을 수 없습니다.' }, { status: 404 });

    const isOwner = exec.authorId === Number(me.id);
    if (!isAdmin(session) && !isOwner) {
      return NextResponse.json({ success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = String(body.title).trim();
    if (body.content !== undefined) updateData.content = String(body.content).trim();
    if (body.execType !== undefined && ['정기업무','임시업무','개선업무','고장처리','교육'].includes(body.execType)) updateData.execType = body.execType;
    if (body.status !== undefined && (STATUSES as readonly string[]).includes(body.status)) updateData.status = body.status;
    if (body.hours !== undefined) updateData.hours = Math.max(0, Math.min(24, Number(body.hours) || 0));
    if (body.execDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.execDate)) updateData.execDate = body.execDate;

    if (updateData.title !== undefined && (updateData.title.length < 2 || updateData.title.length > 200)) {
      return NextResponse.json({ success: false, error: '제목은 2~200자로 입력하세요.' }, { status: 400 });
    }

    const updated = await prisma.workExecution.update({ where: { id: execId }, data: updateData });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '업무실행수정',
          menuId: 'work-exec-reg',
          menuName: '업무실행등록',
          detail: `${me.name || me.loginId} 업무실행 수정: ${updated.title} (${updated.execDate})`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '업무실행 수정 실패' }, { status: 500 });
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
    const execId = Number(id);
    const exec = await loadExec(execId);
    if (!exec) return NextResponse.json({ success: false, error: '찾을 수 없습니다.' }, { status: 404 });

    const isOwner = exec.authorId === Number(me.id);
    if (!isAdmin(session) && !isOwner) {
      return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    await prisma.workExecution.update({ where: { id: execId }, data: { deletedAt: new Date() } });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '업무실행삭제',
          menuId: 'work-exec-reg',
          menuName: '업무실행등록',
          detail: `${me.name || me.loginId} 업무실행 삭제: ${exec.title} (${exec.execDate})`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '업무실행 삭제 실패' }, { status: 500 });
  }
}
