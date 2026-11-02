import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CATEGORIES = ['생산', '매입', '매출', '재고', '경영', '관리', '기타'] as const;
const CYCLES = ['매일', '주간', '월간', '수시'] as const;

// GET /api/work-role?category=&department=&keyword=&usedOnly=&page=&pageSize=
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || '전체';
    const department = searchParams.get('department') || '';
    const keyword = searchParams.get('keyword') || '';
    const usedOnly = searchParams.get('usedOnly') === '1';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize')) || 50));

    const where: any = { deletedAt: null };
    if (category !== '전체' && category) where.category = category;
    if (department.trim()) where.department = department.trim();
    if (usedOnly) where.isUsed = true;
    if (keyword.trim()) {
      const kw = keyword.trim();
      where.OR = [
        { dutyName: { contains: kw, mode: 'insensitive' } },
        { managerName: { contains: kw, mode: 'insensitive' } },
        { subManagerName: { contains: kw, mode: 'insensitive' } },
        { remark: { contains: kw, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.workRole.count({ where }),
      prisma.workRole.findMany({
        where,
        orderBy: [{ category: 'asc' }, { department: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ success: true, data: { items, total, page, pageSize } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무분장 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/work-role
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const body = await req.json();
    const dutyName = String(body.dutyName ?? '').trim();
    const category = (CATEGORIES as readonly string[]).includes(body.category) ? body.category : '생산';
    const cycle = (CYCLES as readonly string[]).includes(body.cycle) ? body.cycle : '매일';
    if (dutyName.length < 2 || dutyName.length > 200) {
      return NextResponse.json({ success: false, error: '업무명은 2~200자로 입력하세요.' }, { status: 400 });
    }

    const created = await prisma.workRole.create({
      data: {
        dutyName,
        category,
        department: String(body.department ?? '').trim(),
        managerName: String(body.managerName ?? '').trim(),
        subManagerName: String(body.subManagerName ?? '').trim(),
        cycle,
        remark: String(body.remark ?? '').trim(),
        isUsed: body.isUsed !== false,
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
          action: '업무분장등록',
          menuId: 'work-role-mgmt',
          menuName: '업무분장관리',
          detail: `${me.name || me.loginId} 업무분장 등록: ${created.dutyName} (${created.managerName})`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무분장 등록 실패' },
      { status: 500 }
    );
  }
}
