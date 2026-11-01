import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

function isAdmin(session: any): boolean {
  return (session?.user as any)?.role === '관리자';
}

async function loadNotice(id: number) {
  return prisma.notice.findFirst({ where: { id, deletedAt: null } });
}

// GET /api/notice/[id] — 상세 + 조회수 증가
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { id } = await context.params;
    const noticeId = Number(id);
    if (!Number.isInteger(noticeId)) {
      return NextResponse.json({ success: false, error: '잘못된 공지 ID입니다.' }, { status: 400 });
    }

    const notice = await loadNotice(noticeId);
    if (!notice) {
      return NextResponse.json({ success: false, error: '공지를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!notice.isPublished && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: '공지를 찾을 수 없습니다.' }, { status: 404 });
    }

    const updated = await prisma.notice.update({
      where: { id: noticeId },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '공지 조회 실패' },
      { status: 500 }
    );
  }
}

// PUT /api/notice/[id] — 수정 (관리자)
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }
    const me = session.user as any;
    const { id } = await context.params;
    const noticeId = Number(id);
    const notice = await loadNotice(noticeId);
    if (!notice) {
      return NextResponse.json({ success: false, error: '공지를 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await req.json();
    const title = body.title !== undefined ? String(body.title).trim() : notice.title;
    const content = body.content !== undefined ? String(body.content).trim() : notice.content;
    const rawCategory = body.category !== undefined ? String(body.category) : notice.category;
    const category = ['공지', '긴급', '일반'].includes(rawCategory) ? rawCategory : notice.category;
    const isPinned = body.isPinned !== undefined ? body.isPinned === true : notice.isPinned;
    const isPublished =
      body.isPublished !== undefined ? body.isPublished !== false : notice.isPublished;

    if (title.length < 2 || title.length > 200) {
      return NextResponse.json(
        { success: false, error: '제목은 2~200자로 입력하세요.' },
        { status: 400 }
      );
    }
    if (content.length < 1 || content.length > 20000) {
      return NextResponse.json(
        { success: false, error: '본문은 1~20,000자로 입력하세요.' },
        { status: 400 }
      );
    }

    const updated = await prisma.notice.update({
      where: { id: noticeId },
      data: { title, content, category, isPinned, isPublished },
    });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '공지수정',
          menuId: 'work-notice',
          menuName: '공지사항',
          detail: `${me.name || me.loginId} 공지 수정: ${title}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '공지 수정 실패' },
      { status: 500 }
    );
  }
}

// DELETE /api/notice/[id] — 소프트 삭제 (관리자)
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }
    const me = session.user as any;
    const { id } = await context.params;
    const noticeId = Number(id);
    const notice = await loadNotice(noticeId);
    if (!notice) {
      return NextResponse.json({ success: false, error: '공지를 찾을 수 없습니다.' }, { status: 404 });
    }

    await prisma.notice.update({
      where: { id: noticeId },
      data: { deletedAt: new Date() },
    });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '공지삭제',
          menuId: 'work-notice',
          menuName: '공지사항',
          detail: `${me.name || me.loginId} 공지 삭제: ${notice.title}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '공지 삭제 실패' },
      { status: 500 }
    );
  }
}
