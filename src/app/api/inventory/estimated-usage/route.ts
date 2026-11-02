import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getEstimatedDailyUsageWithDb } from '@/lib/gfs/estimatedUsage';

export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get('refresh') === '1';
    const data = await getEstimatedDailyUsageWithDb(prisma, force);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || '추정 일사용량 계산 실패' },
      { status: 500 },
    );
  }
}

