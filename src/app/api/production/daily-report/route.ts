import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';
import {
  INITIAL_DAILY_PRODUCTION_REPORT,
  calculateReportTotals,
  DailyProductionItem,
} from '@/components/production/data/dailyProductionReportData';

// GET /api/production/daily-report?date=2026-11-08
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || '2026-11-08';

    // 1. Check if DB has custom saved results for this date
    const dbResults = await prisma.productionResult.findMany({
      where: { resultDate: date },
      orderBy: { id: 'asc' },
    });

    // 2. Base dataset is the 39 canonical products
    let items: DailyProductionItem[] = JSON.parse(JSON.stringify(INITIAL_DAILY_PRODUCTION_REPORT));

    // If DB results exist, merge customized prodQty / shift info
    if (dbResults && dbResults.length > 0) {
      const dbMap = new Map<string, any>();
      dbResults.forEach((r) => {
        dbMap.set(r.productName, r);
      });

      items = items.map((item) => {
        const found = dbMap.get(item.productName);
        if (found) {
          const newQty = Number(found.prodQty) || item.totalQty;
          const ratio = item.totalQty > 0 ? newQty / item.totalQty : 1;
          return {
            ...item,
            totalQty: newQty,
            totalAmount: Math.round(newQty * item.deliveryPrice),
            shift1Qty: Math.round(item.shift1Qty * ratio),
            shift1Amount: Math.round(item.shift1Qty * ratio * item.deliveryPrice),
            shift2Qty: Math.round(item.shift2Qty * ratio),
            shift2Amount: Math.round(item.shift2Qty * ratio * item.deliveryPrice),
            remark: found.remark || item.remark || '',
          };
        }
        return item;
      });
    }

    const totals = calculateReportTotals(items);

    return NextResponse.json({
      success: true,
      date,
      issueMemo: '정규 수주 59,676개 전량 생산 완료. 미출·결품 0건 정상 출하.',
      extraOrderInfo: '특이 추가발주 없음 (정상 수주 출하 완료)',
      items,
      totals,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '생산일보 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/production/daily-report
// 생산일보 실적 일괄 저장 및 ProductionResult 테이블 원자적 동기화
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, issueMemo, items = [], createdBy = '관리자' } = body;
    const targetDate = date || kstToday();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '저장할 생산일보 품목 데이터가 없습니다.' },
        { status: 400 }
      );
    }

    // Prisma $transaction으로 기존 해당 일자의 실적 갱신/저장
    await prisma.$transaction(async (tx) => {
      // 1. 기존 해당 날짜의 ProductionResult 조회
      const existing = await tx.productionResult.findMany({
        where: { resultDate: targetDate },
        select: { id: true, productName: true },
      });
      const existMap = new Map(existing.map((e) => [e.productName, e.id]));

      for (const item of items) {
        const existId = existMap.get(item.productName);

        if (existId) {
          await tx.productionResult.update({
            where: { id: existId },
            data: {
              orderQty: item.totalQty,
              prodQty: item.totalQty,
              defectQty: 0,
              yieldRate: 100,
              remark: item.remark || issueMemo || '',
              createdBy,
            },
          });
        } else {
          // Find product if exists
          const prod = await tx.product.findFirst({
            where: { name: { contains: item.productName } },
            select: { id: true, productCode: true },
          });

          await tx.productionResult.create({
            data: {
              resultDate: targetDate,
              shift: '1편/2편',
              gyeName: item.category === '삼각' ? '성형장(삼각김밥)' : item.category === '줄김밥' ? '성형장(김밥)' : item.category === '도시락' ? '성형장(도시락)' : '성형장(샌드위치)',
              productId: prod ? prod.id : 1,
              productCode: prod ? prod.productCode : `GFS-${item.no}`,
              productName: item.productName,
              orderQty: item.totalQty,
              prodQty: item.totalQty,
              defectQty: 0,
              yieldRate: 100,
              remark: item.remark || issueMemo || '',
              createdBy,
            },
          });
        }
      }
    });

    await touchDashboardSnapshot();

    return NextResponse.json({
      success: true,
      message: `${targetDate} 생산일보 실적 총 ${items.length}건이 성공적으로 저장되었습니다.`,
      date: targetDate,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '생산일보 저장 실패' },
      { status: 500 }
    );
  }
}
