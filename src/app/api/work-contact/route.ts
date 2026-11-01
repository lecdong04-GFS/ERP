import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const TYPES = ['요청', '보고', '문의', '전달'] as const;
const STATUSES = ['접수', '진행중', '완료'] as const;

// GET /api/work-contact?search=&type=&status=&page=&pageSize=
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim();
    const type = searchParams.get('type') || '전체';
    const status = searchParams.get('status') || '전체';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize')) || 20));

    const where: any = { deletedAt: null };
    if (type !== '전체' && type) where.contactType = type;
    if (status !== '전체' && status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { receiverName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.workContact.count({ where }),
      prisma.workContact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          contactType: true,
          receiverName: true,
          status: true,
          senderName: true,
          senderLoginId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { items, total, page, pageSize },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무연락 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/work-contact — 업무연락 등록 (로그인 사용자)
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
    const contactType = (TYPES as readonly string[]).includes(body.contactType) ? body.contactType : '요청';
    const receiverName = String(body.receiverName ?? '').trim();

    if (title.length < 2 || title.length > 200) {
      return NextResponse.json({ success: false, error: '제목은 2~200자로 입력하세요.' }, { status: 400 });
    }
    if (content.length < 1 || content.length > 20000) {
      return NextResponse.json({ success: false, error: '내용은 1~20,000자로 입력하세요.' }, { status: 400 });
    }

    const created = await prisma.workContact.create({
      data: {
        title,
        content,
        contactType,
        receiverName,
        status: '접수',
        senderId: Number(me.id) || null,
        senderLoginId: String(me.loginId || ''),
        senderName: String(me.name || ''),
      },
    });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '업무연락등록',
          menuId: 'work-contact',
          menuName: '업무연락',
          detail: `${me.name || me.loginId} 업무연락 등록: ${title} → ${receiverName}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무연락 등록 실패' },
      { status: 500 }
    );
  }
}
