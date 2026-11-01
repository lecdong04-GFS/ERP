import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CATEGORIES = ['생산', '회의', '휴무', '검사', '납품', '교육', '기타'] as const;

// GET /api/schedule?month=YYYY-MM&category=
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || '';
    const category = searchParams.get('category') || '전체';

    const where: any = { deletedAt: null };
    if (month) where.scheduleDate = { startsWith: month };
    if (category !== '전체' && category) where.category = category;

    const items = await prisma.schedule.findMany({
      where,
      orderBy: [{ scheduleDate: 'asc' }, { startTime: 'asc' }],
      select: {
        id: true, title: true, content: true, scheduleDate: true,
        startTime: true, endTime: true, category: true, allDay: true,
        department: true, authorName: true, authorLoginId: true,
      },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '일정 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/schedule
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const body = await req.json();
    const title = String(body.title ?? '').trim();
    const scheduleDate = String(body.scheduleDate ?? '').trim();
    const category = (CATEGORIES as readonly string[]).includes(body.category) ? body.category : '기타';

    if (title.length < 1 || title.length > 200) {
      return NextResponse.json({ success: false, error: '제목은 1~200자로 입력하세요.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
      return NextResponse.json({ success: false, error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const created = await prisma.schedule.create({
      data: {
        title,
        content: String(body.content ?? '').trim(),
        scheduleDate,
        startTime: String(body.startTime ?? ''),
        endTime: String(body.endTime ?? ''),
        category,
        allDay: body.allDay !== false,
        department: String(body.department ?? '').trim(),
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
          action: '일정등록',
          menuId: 'work-schedule',
          menuName: '일정관리',
          detail: `${me.name || me.loginId} 일정 등록: ${title} (${scheduleDate})`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '일정 등록 실패' },
      { status: 500 }
    );
  }
}
