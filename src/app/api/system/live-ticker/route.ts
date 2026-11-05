import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();
    const kstHour = (now.getUTCHours() + 9) % 24;
    const kstMinute = now.getUTCMinutes();
    const today = kstToday();

    // 병렬로 실제 DB 데이터 실시간 쿼리
    const [
      lowestStocks,
      fefoItems,
      latestSales,
      todayDeliveries,
      safetyShortageCount,
      notices,
      pendingReceivings,
      workOrderCount,
    ] = await Promise.all([
      // 1. 실제 재고 최소 품목 상위 2개 (소진 임박 감지)
      prisma.inventory.findMany({
        where: { currentQty: { gt: 0 } },
        orderBy: { currentQty: 'asc' },
        take: 2,
        select: { productName: true, currentQty: true, unit: true, warehouse: true },
      }),

      // 2. 실제 FEFO 유통기한 임박 품목 상위 2개 (선입선출)
      prisma.inventory.findMany({
        where: {
          expiryDate: { not: '', gte: today },
          currentQty: { gt: 0 },
        },
        orderBy: { expiryDate: 'asc' },
        take: 2,
        select: { productName: true, expiryDate: true, currentQty: true, unit: true },
      }),

      // 3. 실제 최신 완제품 수주 데이터
      prisma.salesOrder.findFirst({
        orderBy: { orderDate: 'desc' },
        select: { orderDate: true, totalQty: true, totalAmount: true },
      }),

      // 4. 오늘 실제 출하 현황 (Delivery)
      prisma.delivery.findMany({
        where: { deliveryDate: today, status: { not: '취소' } },
        select: { id: true, centerCode: true, totalQty: true, status: true },
        take: 3,
      }),

      // 5. 실제 안전재고 부족 품목 수
      prisma.safetyStock.count({
        where: { shortageQty: { gt: 0 } },
      }),

      // 6. 사내 공지사항 (최신 고정 또는 일반 공지)
      prisma.notice.findMany({
        where: { isPublished: true, deletedAt: null },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        take: 2,
        select: { id: true, title: true, category: true, isPinned: true },
      }),

      // 7. 오늘 입고 예정/진행 자재 건수
      prisma.receiving.count({
        where: { receivingDate: today },
      }),

      // 8. 오늘 생산 작업지시 건수
      prisma.workOrder.count({
        where: { workDate: today },
      }),
    ]);

    const messages: Array<{
      type: 'danger' | 'warning' | 'info' | 'success' | 'primary';
      text: string;
    }> = [];

    // ─────────────────────────────────────────────────────────────
    // 1) 공장 시간대별 맞춤 운영 루틴 알림
    // ─────────────────────────────────────────────────────────────
    if (kstHour >= 8 && kstHour < 10) {
      messages.push({
        type: 'primary',
        text: `☀️ [아침 위생 점검] 작업장 에어샤워 및 개인 위생·HACCP 위생복 점검 시간입니다 (현재 ${kstHour}시 ${kstMinute}분)`,
      });
    } else if (kstHour >= 16 && kstHour < 18) {
      messages.push({
        type: 'warning',
        text: `📋 [오후 5시 재고 실사] 전 창고(원자재/부자재/완제품) 실사표 전산 입력 시간입니다 (누락 주의)`,
      });
    } else if (kstHour >= 18 && kstHour < 21) {
      messages.push({
        type: 'info',
        text: `🚚 [야간 배송 상차] GS25 납품 배송차량 냉장 탑차(0~5℃) 온도 기록부 확인 및 상차 진행 요망`,
      });
    } else if (kstHour >= 21 || kstHour < 7) {
      messages.push({
        type: 'primary',
        text: `🌙 [야간 관제] 완제품 및 원부자재 냉장·냉동창고 온도 모니터링 정상 가동 중`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2) 실시간 발주 마감 알림 (한국 시간 기준)
    // ─────────────────────────────────────────────────────────────
    if (kstHour < 11) {
      messages.push({
        type: 'danger',
        text: `🔥 [발주 마감 임박] CJ저온 11:00 마감 집중 — 잔여 발주건 즉시 전송 요망 (현재 ${kstHour}시)`,
      });
    } else if (kstHour < 12) {
      messages.push({
        type: 'warning',
        text: `⏰ [발주 마감 진행] CJ상온 12:00 마감 — 엠디에스·협력사 전산 검토 중 (현재 ${kstHour}시)`,
      });
    } else if (kstHour < 13) {
      messages.push({
        type: 'warning',
        text: `⏰ [발주 최종 마감] 전산 전체(발주고·진주·삼립) 13:00 마감 최종 카운트다운 (현재 ${kstHour}시)`,
      });
    } else {
      messages.push({
        type: 'info',
        text: `✅ [발주 마감 현황] 오늘 정규 전산 발주(13:00) 마감 완료 — 오후 긴급·카톡 직발주 대응 중`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3) 사내 공지사항 연동 (관리자가 등록한 공지 노출)
    // ─────────────────────────────────────────────────────────────
    if (notices && notices.length > 0) {
      notices.forEach((n) => {
        messages.push({
          type: n.isPinned ? 'danger' : 'info',
          text: `📢 [사내 ${n.category || '공지'}] ${n.title}`,
        });
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4) 실제 재고 소진 임박 품목 (상위 1위, 2위 복수 노출)
    // ─────────────────────────────────────────────────────────────
    if (lowestStocks && lowestStocks.length > 0) {
      lowestStocks.forEach((item, idx) => {
        messages.push({
          type: 'danger',
          text: `🚨 [실시간 재고 경고 ${idx + 1}] ${item.productName} 현재고 ${item.currentQty}${item.unit || '개'} (${item.warehouse || '공장'}창고 잔여 소진 임박 — 긴급 발주 요망)`,
        });
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 5) 실제 FEFO 유통기한 D-Day 품목 (상위 1위, 2위)
    // ─────────────────────────────────────────────────────────────
    if (fefoItems && fefoItems.length > 0) {
      fefoItems.forEach((item) => {
        messages.push({
          type: 'warning',
          text: `⚠️ [FEFO 선입선출 주의] ${item.productName} 유통기한 ${item.expiryDate} (잔여 ${item.currentQty}${item.unit || '개'} 우선 출고 요망)`,
        });
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 6) 실제 최신 GS25 수주 실적 (진짜 DB)
    // ─────────────────────────────────────────────────────────────
    if (latestSales) {
      messages.push({
        type: 'info',
        text: `📦 [실제 수주 연동] ${latestSales.orderDate} 수주 완제품 총 ${(latestSales.totalQty || 0).toLocaleString()}개 (₩${(latestSales.totalAmount || 0).toLocaleString()}) 생산 소진량 자동 연계`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 7) 오늘 생산 및 자재 입고 현황
    // ─────────────────────────────────────────────────────────────
    if (workOrderCount > 0 || pendingReceivings > 0) {
      messages.push({
        type: 'primary',
        text: `⚙️ [당일 공정 현황] 오늘 생산 작업지시 ${workOrderCount}건 가동 중 / 자재 입고 검수 ${pendingReceivings}건 진행`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 8) 오늘 실제 출하 현황 또는 안전재고 경고
    // ─────────────────────────────────────────────────────────────
    if (todayDeliveries && todayDeliveries.length > 0) {
      const destNames = todayDeliveries.map((d) => d.centerCode).filter(Boolean).slice(0, 2).join('·');
      const sumQty = todayDeliveries.reduce((acc, cur) => acc + (cur.totalQty || 0), 0);
      messages.push({
        type: 'success',
        text: `🚚 [실시간 출하 현황] 오늘 GS25 물류센터(${destNames || '센터'}) 총 ${sumQty.toLocaleString()}개 출하지시 정상 진행`,
      });
    }

    if (safetyShortageCount > 0) {
      messages.push({
        type: 'danger',
        text: `🛡️ [안전재고 주의] ERP 등록 품목 중 ${safetyShortageCount}건 안전재고 미달 감지 — 자재 수급 점검 요망`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 9) 식품 안전 및 HACCP 수칙 리마인더
    // ─────────────────────────────────────────────────────────────
    messages.push({
      type: 'success',
      text: `💡 [HACCP 품질 관리] 완제품 냉장 보관실 온도(0~5℃) 준수 및 금속검출기 공정 점검 필수`,
    });

    return NextResponse.json({
      success: true,
      data: messages,
      meta: {
        generatedAt: now.toISOString(),
        totalCount: messages.length,
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
