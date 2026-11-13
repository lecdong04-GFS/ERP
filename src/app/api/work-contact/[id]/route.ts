import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const STATUSES = ['접수', '진행중', '완료'] as const;

function isAdmin(session: any): boolean {
  return (session?.user as any)?.role === '관리자';
}

async function loadContact(id: number) {
  return prisma.workContact.findFirst({ where: { id, deletedAt: null } });
}

// GET /api/work-contact/[id]
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { id } = await context.params;
    const contactId = Number(id);
    if (!Number.isInteger(contactId) || contactId <= 0) {
      return NextResponse.json({ success: false, error: '잘못된 업무연락 ID입니다.' }, { status: 400 });
    }
    const contact = await loadContact(contactId);
    if (!contact) {
      return NextResponse.json({ success: false, error: '업무연락을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: contact });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무연락 조회 실패' },
      { status: 500 }
    );
  }
}

// PUT /api/work-contact/[id] — 수정(작성자/관리자) + 처리(관리자)
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const admin = isAdmin(session);
    const { id } = await context.params;
    const contactId = Number(id);
    if (!Number.isInteger(contactId) || contactId <= 0) {
      return NextResponse.json({ success: false, error: '잘못된 업무연락 ID입니다.' }, { status: 400 });
    }
    const contact = await loadContact(contactId);
    if (!contact) {
      return NextResponse.json({ success: false, error: '업무연락을 찾을 수 없습니다.' }, { status: 404 });
    }

    const isOwner = contact.senderId === Number(me.id);
    if (!admin && !isOwner) {
      return NextResponse.json({ success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const updateData: any = {};

    // 본문 수정 (작성자 또는 관리자)
    if (body.title !== undefined) updateData.title = String(body.title).trim();
    if (body.content !== undefined) updateData.content = String(body.content).trim();
    if (body.contactType !== undefined) {
      const t = String(body.contactType).trim();
      if (['요청', '보고', '문의', '전달'].includes(t)) updateData.contactType = t;
    }
    if (body.receiverName !== undefined) updateData.receiverName = String(body.receiverName).trim();

    if (updateData.title !== undefined && (updateData.title.length < 2 || updateData.title.length > 200)) {
      return NextResponse.json({ success: false, error: '제목은 2~200자로 입력하세요.' }, { status: 400 });
    }
    if (updateData.content !== undefined && (updateData.content.length < 1 || updateData.content.length > 20000)) {
      return NextResponse.json({ success: false, error: '내용은 1~20,000자로 입력하세요.' }, { status: 400 });
    }

    // 처리 (관리자만)
    if (admin && body.response !== undefined) {
      updateData.response = String(body.response).trim();
      updateData.respondedAt = new Date().toISOString();
      updateData.status = (STATUSES as readonly string[]).includes(body.status) ? body.status : '진행중';
    } else if (admin && body.status !== undefined && (STATUSES as readonly string[]).includes(body.status)) {
      updateData.status = body.status;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: '변경할 내용이 없습니다.' }, { status: 400 });
    }

    const updated = await prisma.workContact.update({
      where: { id: contactId },
      data: updateData,
    });

    const action = body.response !== undefined ? '업무연락처리' : '업무연락수정';
    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action,
          menuId: 'work-contact',
          menuName: '업무연락',
          detail: `${me.name || me.loginId} ${action}: ${updated.title}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무연락 수정 실패' },
      { status: 500 }
    );
  }
}

// DELETE /api/work-contact/[id] — 소프트 삭제 (작성자/관리자)
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const admin = isAdmin(session);
    const { id } = await context.params;
    const contactId = Number(id);
    if (!Number.isInteger(contactId) || contactId <= 0) {
      return NextResponse.json({ success: false, error: '잘못된 업무연락 ID입니다.' }, { status: 400 });
    }
    const contact = await loadContact(contactId);
    if (!contact) {
      return NextResponse.json({ success: false, error: '업무연락을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!admin && contact.senderId !== Number(me.id)) {
      return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    await prisma.workContact.update({
      where: { id: contactId },
      data: { deletedAt: new Date() },
    });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '업무연락삭제',
          menuId: 'work-contact',
          menuName: '업무연락',
          detail: `${me.name || me.loginId} 업무연락 삭제: ${contact.title}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무연락 삭제 실패' },
      { status: 500 }
    );
  }
}
