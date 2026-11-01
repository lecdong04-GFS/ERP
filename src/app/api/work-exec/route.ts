import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

const TYPES = ['정기업무', '임시업무', '개선업무', '고장처리', '교육'] as const;
const STATUSES = ['완료', '진행중', '보류'] as const;

// GET /api/work-exec?date=&type=&status=&page=&pageSize=
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || '';
    const type = searchParams.get('type') || '전체';
    const status = searchParams.get('status') || '전체';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize')) || 30));

    const where: any = { deletedAt: null };
    if (date) where.execDate = date;
    if (type !== '전체' && type) where.execType = type;
    if (status !== '전체' && status) where.status = status;

    const [total, items] = await Promise.all([
      prisma.workExecution.count({ where }),
      prisma.workExecution.findMany({
        where,
        orderBy: [{ execDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, execDate: true, execType: true, title: true, content: true,
          hours: true, status: true, department: true,
          authorId: true, authorName: true, authorLoginId: true,
          createdAt: true, updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({ success: true, data: { items, total, page, pageSize } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무실행 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/work-exec
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
    const execDate = String(body.execDate ?? kstToday()).trim();
    const execType = (TYPES as readonly string[]).includes(body.execType) ? body.execType : '정기업무';
    const status = (STATUSES as readonly string[]).includes(body.status) ? body.status : '완료';
    const hours = Math.max(0, Math.min(24, Number(body.hours) || 0));

    if (title.length < 2 || title.length > 200) {
      return NextResponse.json({ success: false, error: '제목은 2~200자로 입력하세요.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(execDate)) {
      return NextResponse.json({ success: false, error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const created = await prisma.workExecution.create({
      data: {
        execDate, execType, title, content, hours, status,
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
          action: '업무실행등록',
          menuId: 'work-exec-reg',
          menuName: '업무실행등록',
          detail: `${me.name || me.loginId} 업무실행 등록: ${title} (${execDate})`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무실행 등록 실패' },
      { status: 500 }
    );
  }
}
