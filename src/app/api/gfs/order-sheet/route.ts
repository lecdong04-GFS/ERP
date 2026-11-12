import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/apiAuth';
import { buildOrderSheet } from '@/lib/gfs/orderSheetBuilder';

// GET /api/gfs/order-sheet — 100% PostgreSQL DB 기반 정본, 실시간 BOM 일사용량 및 기발주 미입고(Pending PO) 실시간 연동
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const rawDate = searchParams.get('date') || '';
    const rawDormant = searchParams.get('dormantDays');
    const dormantDays = rawDormant !== null && rawDormant !== '' ? Number(rawDormant) : 14;

    const data = await buildOrderSheet({
      targetDate: rawDate,
      dormantDays,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'order-sheet DB 조회 실패' },
      { status: 500 }
    );
  }
}
