import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

const CATEGORIES = ['신제품', '원가절감', '매출확대', '업무개선', '기타'] as const;
const STATUSES = ['제안', '검토중', '채택', '보류', '완료'] as const;

// GET /api/growth-idea?category=&status=&keyword=&page=&pageSize=
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || '전체';
    const status = searchParams.get('status') || '전체';
    const keyword = searchParams.get('keyword') || '';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize')) || 30));

    const where: any = { deletedAt: null };
    if (category !== '전체' && category) where.category = category;
    if (status !== '전체' && status) where.status = status;
    if (keyword.trim()) {
      const kw = keyword.trim();
      where.OR = [
        { title: { contains: kw, mode: 'insensitive' } },
        { content: { contains: kw, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.growthIdea.count({ where }),
      prisma.growthIdea.findMany({
        where,
        orderBy: [{ ideaDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ success: true, data: { items, total, page, pageSize } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '성장전략 아이디어 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/growth-idea
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const body = await req.json();
    const title = String(body.title ?? '').trim();
    const content = String(body.content ?? '').trim();
    const expectedEffect = String(body.expectedEffect ?? '').trim();
    const ideaDate = String(body.ideaDate ?? kstToday()).trim();
    const category = (CATEGORIES as readonly string[]).includes(body.category) ? body.category : '업무개선';
    const status = (STATUSES as readonly string[]).includes(body.status) ? body.status : '제안';

    if (title.length < 2 || title.length > 200) {
      return NextResponse.json({ success: false, error: '제목은 2~200자로 입력하세요.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ideaDate)) {
      return NextResponse.json({ success: false, error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const created = await prisma.growthIdea.create({
      data: {
        ideaDate, category, title, content, expectedEffect, status,
        department: String(body.department ?? me.department ?? '').trim(),
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
          action: '성장전략아이디어등록',
          menuId: 'work-growth-idea',
          menuName: '성장전략idea',
          detail: `${me.name || me.loginId} 아이디어 등록: ${created.title}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '성장전략 아이디어 등록 실패' },
      { status: 500 }
    );
  }
}
