import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CATEGORIES = ['신제품', '원가절감', '매출확대', '업무개선', '기타'] as const;
const STATUSES = ['제안', '검토중', '채택', '보류', '완료'] as const;

function isAdmin(session: any): boolean {
  return (session?.user as any)?.role === '관리자';
}

async function loadIdea(id: number) {
  return prisma.growthIdea.findFirst({ where: { id, deletedAt: null } });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const { id } = await context.params;
    const ideaId = Number(id);
    if (!Number.isInteger(ideaId) || ideaId <= 0) {
      return NextResponse.json({ success: false, error: '잘못된 ID입니다.' }, { status: 400 });
    }
    const idea = await loadIdea(ideaId);
    if (!idea) return NextResponse.json({ success: false, error: '찾을 수 없습니다.' }, { status: 404 });

    const isOwner = idea.authorId === Number(me.id);
    if (!isAdmin(session) && !isOwner) {
      return NextResponse.json({ success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = String(body.title).trim();
    if (body.content !== undefined) updateData.content = String(body.content).trim();
    if (body.expectedEffect !== undefined) updateData.expectedEffect = String(body.expectedEffect).trim();
    if (body.category !== undefined && (CATEGORIES as readonly string[]).includes(body.category)) updateData.category = body.category;
    if (body.status !== undefined && (STATUSES as readonly string[]).includes(body.status)) updateData.status = body.status;
    if (body.ideaDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.ideaDate)) updateData.ideaDate = body.ideaDate;

    if (updateData.title !== undefined && (updateData.title.length < 2 || updateData.title.length > 200)) {
      return NextResponse.json({ success: false, error: '제목은 2~200자로 입력하세요.' }, { status: 400 });
    }

    const updated = await prisma.growthIdea.update({ where: { id: ideaId }, data: updateData });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '성장전략 아이디어 수정 실패' },
      { status: 500 }
    );
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
    const ideaId = Number(id);
    if (!Number.isInteger(ideaId) || ideaId <= 0) {
      return NextResponse.json({ success: false, error: '잘못된 ID입니다.' }, { status: 400 });
    }
    const idea = await loadIdea(ideaId);
    if (!idea) return NextResponse.json({ success: false, error: '찾을 수 없습니다.' }, { status: 404 });

    const isOwner = idea.authorId === Number(me.id);
    if (!isAdmin(session) && !isOwner) {
      return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    await prisma.growthIdea.update({ where: { id: ideaId }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '성장전략 아이디어 삭제 실패' },
      { status: 500 }
    );
  }
}
