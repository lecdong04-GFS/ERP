import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { getEstimatedDailyUsageWithDb, getRollingUsageWindowWithDb } from '@/lib/gfs/estimatedUsage';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession({ verifyDb: true });
    if ('error' in auth) return auth.error;

    const force = req.nextUrl.searchParams.get('refresh') === '1';
    const days = req.nextUrl.searchParams.get('days');
    const targetDate = req.nextUrl.searchParams.get('targetDate') || undefined;

    if (days) {
      const windowDays = parseInt(days, 10) || 20;
      const data = await getRollingUsageWindowWithDb(prisma, targetDate, windowDays, force);
      return NextResponse.json({ success: true, data });
    }

    const data = await getEstimatedDailyUsageWithDb(prisma, force);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || '추정 일사용량 계산 실패' },
      { status: 500 },
    );
  }
}

