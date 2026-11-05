import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();
    const kstHour = (now.getUTCHours() + 9) % 24;
    const today = kstToday();

    // 병렬로 실제 DB 데이터 실시간 쿼리
    const [
      lowestStock,
      fefoItem,
      latestSales,
      masterSnap,
      todayDeliveries,
      safetyShortageCount,
    ] = await Promise.all([
      // 1. 실제 재고 최소 품목 (소진 임박)
      prisma.inventory.findFirst({
        where: { currentQty: { gt: 0 } },
        orderBy: { currentQty: 'asc' },
        select: { productName: true, currentQty: true, unit: true, warehouse: true },
      }),

      // 2. 실제 FEFO 유통기한 임박 품목 (선입선출)
      prisma.inventory.findFirst({
        where: {
          expiryDate: { not: '', gte: '2026-10-01' },
          currentQty: { gt: 0 },
        },
        orderBy: { expiryDate: 'asc' },
        select: { productName: true, expiryDate: true, currentQty: true, unit: true },
      }),

      // 3. 실제 최신 완제품 수주 데이터
      prisma.salesOrder.findFirst({
        orderBy: { orderDate: 'desc' },
        select: { orderDate: true, totalQty: true, totalAmount: true },
      }),

      // 4. 실제 최신 업로드된 발주서 마스터 스냅샷
      prisma.dashboardSnapshot.findUnique({
        where: { key: 'gfs_master_workbook' },
      }),

      // 5. 오늘 실제 출하 현황 (Delivery)
      prisma.delivery.findMany({
        where: { deliveryDate: today, status: { not: '취소' } },
        select: { id: true, centerCode: true, totalQty: true, status: true },
        take: 3,
      }),

      // 6. 실제 안전재고 부족 품목 수
      prisma.safetyStock.count({
        where: { shortageQty: { gt: 0 } },
      }),
    ]);

    // 실시간 발주 마감 시간 계산 (실제 KST 시간 기준)
    let deadlineText = '';
    let deadlineType: 'danger' | 'warning' | 'info' | 'primary' = 'primary';
    if (kstHour < 11) {
      deadlineText = `🔥 [발주 마감 임박] CJ저온 11:00 마감 집중 — 잔여 발주건 즉시 전송 요망 (현재 ${kstHour}시)`;
      deadlineType = 'danger';
    } else if (kstHour < 12) {
      deadlineText = `⏰ [발주 마감 진행] CJ상온 12:00 마감 — 엠디에스·협력사 전산 검토 중 (현재 ${kstHour}시)`;
      deadlineType = 'warning';
    } else if (kstHour < 13) {
      deadlineText = `⏰ [발주 최종 마감] 전산 전체(발주고·진주·삼립) 13:00 마감 최종 카운트다운 (현재 ${kstHour}시)`;
      deadlineType = 'warning';
    } else {
      deadlineText = `✅ [발주 마감 현황] 오늘 정규 전산 발주(13:00) 마감 완료 — 오후 긴급·카톡 직발주 가동 중 (현재 ${kstHour}시)`;
      deadlineType = 'info';
    }

    const messages = [];

    // 1) 발주 마감 상태 (진짜 현재 시각 기반)
    messages.push({
      type: deadlineType,
      text: deadlineText,
    });

    // 2) 실제 재고 소진 임박 품목 (진짜 DB)
    if (lowestStock) {
      messages.push({
        type: 'danger' as const,
        text: `[실시간 재고 경고] ${lowestStock.productName} 현재고 ${lowestStock.currentQty}${lowestStock.unit || '개'} (${lowestStock.warehouse || '공장'}창고 잔여 소진 임박 — 긴급 발주 권장)`,
      });
    }

    // 3) 실제 FEFO 유통기한 D-Day 품목 (진짜 DB)
    if (fefoItem) {
      messages.push({
        type: 'warning' as const,
        text: `[실시간 FEFO 주의] ${fefoItem.productName} 유통기한 ${fefoItem.expiryDate} (잔여 ${fefoItem.currentQty}${fefoItem.unit || '개'} 선입선출 우선 출고 요망)`,
      });
    }

    // 4) 실제 수주 연동 실적 (진짜 DB)
    if (latestSales) {
      messages.push({
        type: 'info' as const,
        text: `[실제 수주 연동] ${latestSales.orderDate} 수주 완제품 총 ${(latestSales.totalQty || 0).toLocaleString()}개 (₩${(latestSales.totalAmount || 0).toLocaleString()}) 생산 소진량 자동 연계`,
      });
    }


    // 6) 오늘 실제 출하 현황 (출하 건이 있을 경우)
    if (todayDeliveries && todayDeliveries.length > 0) {
      const destNames = todayDeliveries.map((d) => d.centerCode).filter(Boolean).slice(0, 2).join('·');
      const sumQty = todayDeliveries.reduce((acc, cur) => acc + (cur.totalQty || 0), 0);
      messages.push({
        type: 'info' as const,
        text: `[실시간 출하 현황] 오늘 GS25 물류센터(${destNames || '센터'}) 총 ${sumQty.toLocaleString()}개 출하지시 정상 진행`,
      });
    } else if (safetyShortageCount > 0) {
      messages.push({
        type: 'danger' as const,
        text: `[안전재고 주의] ERP 등록 품목 중 ${safetyShortageCount}건 안전재고 미달 감지 — 자재 수급 점검 요망`,
      });
    }

    return NextResponse.json({
      success: true,
      data: messages,
      meta: {
        generatedAt: now.toISOString(),
        kstHour,
      },
    });
  } catch (error: any) {
    console.error('live-ticker API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        data: [
          {
            type: 'info',
            text: '[시스템 관제] (주)GFS 엔터프라이즈 ERP 정상 가동 중',
          },
        ],
      },
      { status: 500 }
    );
  }
}
