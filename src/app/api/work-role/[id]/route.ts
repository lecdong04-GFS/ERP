import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CATEGORIES = ['생산', '매입', '매출', '재고', '경영', '관리', '기타'] as const;
const CYCLES = ['매일', '주간', '월간', '수시'] as const;

function isAdmin(session: any): boolean {
  return (session?.user as any)?.role === '관리자';
}

async function loadRole(id: number) {
  return prisma.workRole.findFirst({ where: { id, deletedAt: null } });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const { id } = await context.params;
    const roleId = Number(id);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return NextResponse.json({ success: false, error: '잘못된 ID입니다.' }, { status: 400 });
    }
    const role = await loadRole(roleId);
    if (!role) return NextResponse.json({ success: false, error: '찾을 수 없습니다.' }, { status: 404 });

    const isOwner = role.authorId === Number(me.id);
    if (!isAdmin(session) && !isOwner) {
      return NextResponse.json({ success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const updateData: any = {};
    if (body.dutyName !== undefined) updateData.dutyName = String(body.dutyName).trim();
    if (body.category !== undefined && (CATEGORIES as readonly string[]).includes(body.category)) updateData.category = body.category;
    if (body.department !== undefined) updateData.department = String(body.department).trim();
    if (body.managerName !== undefined) updateData.managerName = String(body.managerName).trim();
    if (body.subManagerName !== undefined) updateData.subManagerName = String(body.subManagerName).trim();
    if (body.cycle !== undefined && (CYCLES as readonly string[]).includes(body.cycle)) updateData.cycle = body.cycle;
    if (body.remark !== undefined) updateData.remark = String(body.remark).trim();
    if (body.isUsed !== undefined) updateData.isUsed = body.isUsed === true;

    if (updateData.dutyName !== undefined && (updateData.dutyName.length < 2 || updateData.dutyName.length > 200)) {
      return NextResponse.json({ success: false, error: '업무명은 2~200자로 입력하세요.' }, { status: 400 });
    }

    const updated = await prisma.workRole.update({ where: { id: roleId }, data: updateData });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무분장 수정 실패' },
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
    const roleId = Number(id);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return NextResponse.json({ success: false, error: '잘못된 ID입니다.' }, { status: 400 });
    }
    const role = await loadRole(roleId);
    if (!role) return NextResponse.json({ success: false, error: '찾을 수 없습니다.' }, { status: 404 });

    const isOwner = role.authorId === Number(me.id);
    if (!isAdmin(session) && !isOwner) {
      return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    await prisma.workRole.update({ where: { id: roleId }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '업무분장 삭제 실패' },
      { status: 500 }
    );
  }
}
