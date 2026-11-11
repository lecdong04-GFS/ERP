import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIp, requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  const auth = await requireSession({ adminOnly: true });
  if (auth.error) return auth.error;

  try {
    const list = await prisma.systemLog.findMany({
      take: 100,
      orderBy: { id: 'desc' },
      include: {
        user: {
          select: { id: true, loginId: true, name: true, role: true, department: true },
        },
      },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const created = await prisma.systemLog.create({
      data: {
        logDate: new Date().toISOString().replace('T', ' ').slice(0, 19),
        userId: auth.user.id,
        loginId: auth.user.loginId,
        userName: auth.user.name,
        action: String(body.action || '조회').slice(0, 40),
        menuId: String(body.menuId || '').slice(0, 80),
        menuName: String(body.menuName || '').slice(0, 80),
        detail: String(body.detail || '').slice(0, 500),
        ipAddress: getClientIp(req),
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
