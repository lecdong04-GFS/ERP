import { NextRequest, NextResponse, after } from 'next/server';
import { EMPTY_STATS } from '@/components/dashboard/dashboardData';
import { requireSession } from '@/lib/apiAuth';
import {
  getDashboardStats,
  refreshSnapshot,
} from '@/lib/dashboard/snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireSession({ verifyDb: true });
  if ('error' in auth) return auth.error;

  const force = req.nextUrl.searchParams.get('fresh') === '1';

  try {
    const { data, source, stale } = await getDashboardStats({ force });

    if (stale) {
      // 응답은 즉시(스냅샷), 갱신은 백그라운드
      after(async () => {
        try {
          await refreshSnapshot();
        } catch (error: any) {
          console.error('[dashboard] background refresh failed:', error?.message || error);
        }
      });
    }

    return NextResponse.json({
      success: true,
      data,
      meta: { source, stale, generatedAt: data.fetchedAt },
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);

    // 스냅샷/pg 장애 시 기존 Prisma 계산으로 폴백
    try {
      const { computeDashboardStats } = await import('@/lib/dashboard/compute');
      const data = await computeDashboardStats();
      return NextResponse.json({
        success: true,
        data,
        meta: { source: 'fallback', stale: true, generatedAt: data.fetchedAt },
      });
    } catch (fallbackError: any) {
      console.error('Dashboard fallback error:', fallbackError);
      return NextResponse.json(
        {
          success: false,
          error: error.message || '대시보드 조회 실패',
          data: { ...EMPTY_STATS, fetchedAt: new Date().toISOString() },
        },
        { status: 200 }
      );
    }
  }
}
