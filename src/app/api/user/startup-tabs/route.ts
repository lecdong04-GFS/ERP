import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

// GET /api/user/startup-tabs (사용자별 시작화면 탭 목록 조회)
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const loginId = auth.user.loginId;

    const user = await prisma.user.findUnique({
      where: { loginId },
      select: { remark: true },
    });

    let startupTabs: string[] = [];
    if (user?.remark) {
      try {
        const parsed = JSON.parse(user.remark);
        if (Array.isArray(parsed.startupTabs)) {
          startupTabs = parsed.startupTabs;
        }
      } catch {
        // remark is non-json string
      }
    }

    return NextResponse.json({ success: true, startupTabs, loginId });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch startup tabs' },
      { status: 500 }
    );
  }
}

// POST /api/user/startup-tabs (사용자별 시작화면 탭 목록 저장)
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const loginId = auth.user.loginId;
    const body = await req.json();
    const { startupTabs } = body;

    if (!Array.isArray(startupTabs)) {
      return NextResponse.json(
        { success: false, error: 'startupTabs must be an array' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { loginId },
      select: { remark: true },
    });

    let prefs: any = {};
    if (user?.remark) {
      try {
        prefs = JSON.parse(user.remark);
      } catch {
        prefs = { originalRemark: user.remark };
      }
    }
    prefs.startupTabs = startupTabs;

    await prisma.user.update({
      where: { loginId },
      data: { remark: JSON.stringify(prefs) },
    });

    return NextResponse.json({ success: true, startupTabs });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save startup tabs' },
      { status: 500 }
    );
  }
}

