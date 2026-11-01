import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CATEGORIES = ['공지', '긴급', '일반'] as const;

function isAdmin(session: any): boolean {
  return (session?.user as any)?.role === '관리자';
}

function normalizeCategory(value: unknown): string {
  const v = String(value ?? '').trim();
  return (CATEGORIES as readonly string[]).includes(v) ? v : '공지';
}

// GET /api/notice?search=&category=&page=1&pageSize=20
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const admin = isAdmin(session);
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim();
    const category = searchParams.get('category') || '전체';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize')) || 20));

    const where: any = { deletedAt: null };
    if (!admin) where.isPublished = true;
    if (category !== '전체' && category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.notice.count({ where }),
      prisma.notice.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          category: true,
          isPinned: true,
          isPublished: true,
          authorName: true,
          authorLoginId: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { items, total, page, pageSize, isAdmin: admin },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '공지사항 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/notice — 공지 등록 (관리자)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }
    const me = session.user as any;
    const body = await req.json();
    const title = String(body.title ?? '').trim();
    const content = String(body.content ?? '').trim();
    const category = normalizeCategory(body.category);
    const isPinned = body.isPinned === true;
    const isPublished = body.isPublished !== false;

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

    const created = await prisma.notice.create({
      data: {
        title,
        content,
        category,
        isPinned,
        isPublished,
        authorId: Number(me.id) || null,
        authorLoginId: String(me.loginId || ''),
        authorName: String(me.name || ''),
      },
    });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '공지등록',
          menuId: 'work-notice',
          menuName: '공지사항',
          detail: `${me.name || me.loginId} 공지 등록: ${title}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '공지 등록 실패' },
      { status: 500 }
    );
  }
}
