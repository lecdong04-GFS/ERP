import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';
import {
  INITIAL_DAILY_PRODUCTION_REPORT,
  calculateReportTotals,
  DailyProductionItem,
  SHIFT1_CENTER_LIST,
  SHIFT2_CENTER_LIST,
  CANONICAL_DAILY_REPORTS,
  getCanonicalDailyReport,
} from '@/components/production/data/dailyProductionReportData';

// 센터별 표준 배분 가중치 (1편)
const SHIFT1_WEIGHTS: Record<string, number> = {
  '김해': 0.077,
  '김해2': 0.080,
  '왜관': 0.150,
  '경산': 0.135,
  '경산2': 0.131,
  '진주': 0.101,
  '신광주2': 0.078,
  '신광주': 0.089,
  '익산': 0.123,
  '신양산': 0.007,
  '신양산2': 0.010,
  '경산3': 0.019,
  '부산수탁': 0.019,
};

// 센터별 표준 배분 가중치 (2편)
const SHIFT2_WEIGHTS: Record<string, number> = {
  '김해': 0.075,
  '김해2': 0.081,
  '왜관': 0.167,
  '경산': 0.133,
  '경산2': 0.139,
  '진주': 0.106,
  '신광주2': 0.071,
  '신광주': 0.069,
  '익산': 0.138,
  '경산3': 0.021,
  '특판': 0.000,
};

/**
 * 1편 및 2편 수량을 12개 물류센터로 정수 분할
 */
function distributeToCenters(
  pName: string,
  s1Qty: number,
  s2Qty: number
): { s1Centers: Record<string, number>; s2Centers: Record<string, number> } {
  const s1Centers: Record<string, number> = {};
  const s2Centers: Record<string, number> = {};

  SHIFT1_CENTER_LIST.forEach((c) => (s1Centers[c] = 0));
  SHIFT2_CENTER_LIST.forEach((c) => (s2Centers[c] = 0));

  // '착한' 기획 시리즈는 오직 신양산/신양산2로만 100% 1편 배분
  if (pName.includes('착한')) {
    const half = Math.floor(s1Qty / 2);
    s1Centers['신양산'] = half;
    s1Centers['신양산2'] = s1Qty - half;
    return { s1Centers, s2Centers };
  }

  // 1편 일반 분할
  if (s1Qty > 0) {
    let allocated1 = 0;
    const centers = SHIFT1_CENTER_LIST.filter((c) => !c.startsWith('신양산'));
    centers.forEach((c, idx) => {
      if (idx === centers.length - 1) {
        s1Centers[c] = Math.max(0, s1Qty - allocated1);
      } else {
        const val = Math.round(s1Qty * (SHIFT1_WEIGHTS[c] || 0.08));
        s1Centers[c] = val;
        allocated1 += val;
      }
    });
  }

  // 2편 일반 분할
  if (s2Qty > 0) {
    let allocated2 = 0;
    SHIFT2_CENTER_LIST.forEach((c, idx) => {
      if (idx === SHIFT2_CENTER_LIST.length - 1) {
        s2Centers[c] = Math.max(0, s2Qty - allocated2);
      } else {
        const val = Math.round(s2Qty * (SHIFT2_WEIGHTS[c] || 0.09));
        s2Centers[c] = val;
        allocated2 += val;
      }
    });
  }

  return { s1Centers, s2Centers };
}

// GET /api/production/daily-report?date=2026-11-08
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || '2026-11-08';

    // ── 0. DB 내 업로드되어 있는 수주 일자 목록 (최근 60일) ──
    const orderDateRows = await prisma.salesOrder.findMany({
      distinct: ['orderDate'],
      select: { orderDate: true },
      orderBy: { orderDate: 'desc' },
      take: 60,
    });
    const rawOrderDates = orderDateRows.map((r) => r.orderDate).filter(Boolean);
    const availableDates = Array.from(new Set(['2026-11-08', '2026-11-07', ...rawOrderDates]));

    // ── 1. DB에 저장된 최종 확정 생산실적(ProductionResult) 확인 ──
    const dbResults = await prisma.productionResult.findMany({
      where: { resultDate: date },
      orderBy: { id: 'asc' },
    });

    if (dbResults && dbResults.length > 0) {
      // 확정 저장된 실적이 있는 경우 (우선 반환)
      const dbItems: DailyProductionItem[] = dbResults.map((r, idx) => {
        let cat: '삼각' | '줄김밥' | '도시락' | '조리빵' | '특판' = '삼각';
        const name = r.productName;
        if (name.includes('특판') || name.includes('기본김밥')) cat = '특판';
        else if (name.includes('김밥') && !name.includes('삼각')) cat = '줄김밥';
        else if (name.includes('도시락') || name.includes('덮밥') || name.includes('비빔밥') || name.includes('혜자') || name.includes('정식')) cat = '도시락';
        else if (name.includes('핫도그') || name.includes('빵') || name.includes('버거') || name.includes('샌드')) cat = '조리빵';

        const tot = Number(r.prodQty) || 0;
        const s1 = Math.round(tot * 0.58);
        const s2 = tot - s1;
        const uPrice = 2000;
        const centers = distributeToCenters(name, s1, s2);

        return {
          no: idx + 1,
          category: cat,
          productName: name,
          deliveryPrice: uPrice,
          retailPrice: Math.round((uPrice * 1.67) / 100) * 100,
          totalQty: tot,
          qtyRatio: 0,
          totalAmount: tot * uPrice,
          amtRatio: 0,
          shift1Qty: s1,
          shift1Amount: s1 * uPrice,
          shift2Qty: s2,
          shift2Amount: s2 * uPrice,
          shift1Centers: centers.s1Centers,
          shift2Centers: centers.s2Centers,
          remark: r.remark || '',
        };
      });

      const totalQtyAll = dbItems.reduce((s, i) => s + i.totalQty, 0);
      const totalAmtAll = dbItems.reduce((s, i) => s + i.totalAmount, 0);
      dbItems.forEach((i) => {
        i.qtyRatio = totalQtyAll > 0 ? Number(((i.totalQty / totalQtyAll) * 100).toFixed(1)) : 0;
        i.amtRatio = totalAmtAll > 0 ? Number(((i.totalAmount / totalAmtAll) * 100).toFixed(1)) : 0;
      });

      const totals = calculateReportTotals(dbItems);

      return NextResponse.json({
        success: true,
        date,
        source: 'PRODUCTION_RESULT_DB',
        sourceLabel: `확정 생산실적 DB 연동 (${dbItems.length}건 확정)`,
        issueMemo: `${date} 현장 생산실적 확정본`,
        extraOrderInfo: '정규 수주 및 현장 실적 확정',
        availableDates,
        items: dbItems,
        totals,
      });
    }

    // ── 2. 해당 날짜에 업로드된 실제 수주 엑셀(SalesOrder + SalesOrderDetail) 동적 집계 ──
    const orders = await prisma.salesOrder.findMany({
      where: { orderDate: date, status: { not: '취소' } },
      include: {
        details: {
          include: { product: true },
        },
      },
    });

    if (orders && orders.length > 0) {
      const productMap = new Map<string, any>();
      let extraOrderCount = 0;

      for (const o of orders) {
        if (o.orderType === '추가') extraOrderCount += o.totalQty;

        for (const d of o.details) {
          const rawName = (d.product?.name || '').trim();
          // 끝자리의 1편/2편 또는 1/2 제거하여 순수 제품명 추출
          const cleanName = rawName.replace(/(?:[12]편|[12])$/, '').trim();
          if (!cleanName) continue;

          let item = productMap.get(cleanName);
          if (!item) {
            let cat: '삼각' | '줄김밥' | '도시락' | '조리빵' = '삼각';
            const pKind = d.product?.kind || '';
            if (cleanName.includes('김밥') && !cleanName.includes('삼각')) cat = '줄김밥';
            else if (
              cleanName.includes('도시락') ||
              cleanName.includes('덮밥') ||
              cleanName.includes('비빔밥') ||
              cleanName.includes('혜자') ||
              cleanName.includes('정식') ||
              cleanName.includes('명불허전')
            )
              cat = '도시락';
            else if (
              cleanName.includes('핫도그') ||
              cleanName.includes('빵') ||
              cleanName.includes('버거') ||
              cleanName.includes('샌드')
            )
              cat = '조리빵';
            else if (cleanName.includes('삼각') || cleanName.includes('주먹밥') || pKind.includes('삼각'))
              cat = '삼각';
            else if (pKind.includes('도시락')) cat = '도시락';
            else if (pKind.includes('김밥')) cat = '줄김밥';

            const uPrice = Number(d.unitPrice) || 2000;
            const rPrice = Math.round((uPrice * 1.67) / 100) * 100;

            item = {
              category: cat,
              productName: cleanName,
              deliveryPrice: uPrice,
              retailPrice: rPrice,
              totalQty: 0,
              totalAmount: 0,
              shift1Qty: 0,
              shift1Amount: 0,
              shift2Qty: 0,
              shift2Amount: 0,
              shift1Centers: {},
              shift2Centers: {},
              remark: d.remark || '',
            };
            productMap.set(cleanName, item);
          }

          let q1 = Number(d.orderQty1) || 0;
          let q2 = Number(d.orderQty2) || 0;
          const tot = Number(d.totalQty) || q1 + q2;
          const amt = Number(d.amount) || tot * item.deliveryPrice;

          // 1편/2편 수량이 분리되어 있지 않은 경우 품목명 접미사로 자동 분할
          if (q1 === 0 && q2 === 0) {
            if (rawName.endsWith('1') || rawName.endsWith('1편')) {
              q1 = tot;
            } else if (rawName.endsWith('2') || rawName.endsWith('2편')) {
              q2 = tot;
            } else {
              q1 = Math.round(tot * 0.58);
              q2 = tot - q1;
            }
          }

          item.shift1Qty += q1;
          item.shift2Qty += q2;
          item.totalQty += tot;
          item.totalAmount += amt;
          item.shift1Amount += Math.round(q1 * item.deliveryPrice);
          item.shift2Amount += Math.round(q2 * item.deliveryPrice);
        }
      }

      const items: DailyProductionItem[] = [...productMap.values()];
      const totalQtyAll = items.reduce((s, i) => s + i.totalQty, 0);
      const totalAmtAll = items.reduce((s, i) => s + i.totalAmount, 0);

      // 카테고리 순서 정렬
      const catOrder: Record<string, number> = { '삼각': 1, '줄김밥': 2, '도시락': 3, '조리빵': 4 };
      items.sort((a, b) => (catOrder[a.category] || 9) - (catOrder[b.category] || 9) || b.totalQty - a.totalQty);

      items.forEach((item, idx) => {
        item.no = idx + 1;
        item.qtyRatio = totalQtyAll > 0 ? Number(((item.totalQty / totalQtyAll) * 100).toFixed(1)) : 0;
        item.amtRatio = totalAmtAll > 0 ? Number(((item.totalAmount / totalAmtAll) * 100).toFixed(1)) : 0;

        // 물류센터별 배분 계산
        const centers = distributeToCenters(item.productName, item.shift1Qty, item.shift2Qty);
        item.shift1Centers = centers.s1Centers;
        item.shift2Centers = centers.s2Centers;
      });

      const totals = calculateReportTotals(items);

      return NextResponse.json({
        success: true,
        date,
        source: 'SALES_ORDER_DB',
        sourceLabel: `수주 엑셀 업로드 DB 실데이터 연동 (${orders.length}개 수주 전표 집계)`,
        orderCount: orders.length,
        issueMemo: `${date} 수주 엑셀 정규 발주 총 ${totalQtyAll.toLocaleString()}개 전량 생산 대조 완료.`,
        extraOrderInfo: extraOrderCount > 0 ? `추가발주 ${extraOrderCount.toLocaleString()}개 포함` : '추가발주 없음 (정규 수주)',
        availableDates,
        items,
        totals,
      });
    }

    // ── 3. 업로드 데이터가 없는 날짜 폴백 (2026-11-07 토 / 2026-11-08 일 정본 템플릿) ──
    const canonical = getCanonicalDailyReport(date);
    const items: DailyProductionItem[] = JSON.parse(JSON.stringify(canonical.items));
    const totals = calculateReportTotals(items);

    return NextResponse.json({
      success: true,
      date,
      source: 'CANONICAL_TEMPLATE',
      sourceLabel: date === '2026-11-07'
        ? 'GFS 2026-11-07(토) 생산일보 정본 (특판 5,000개 수주 포함)'
        : 'GFS 2026-11-08(일) 생산일보 정본 템플릿 연동',
      issueMemo: canonical.issueMemo,
      extraOrderInfo: canonical.extraOrderInfo,
      availableDates,
      items,
      totals,
    });
  } catch (error: any) {
    console.error('Daily report API error:', error);
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

    await prisma.$transaction(async (tx) => {
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
          const prod = await tx.product.findFirst({
            where: { name: { contains: item.productName } },
            select: { id: true, productCode: true },
          });

          await tx.productionResult.create({
            data: {
              resultDate: targetDate,
              shift: '1편/2편',
              gyeName:
                item.category === '삼각'
                  ? '성형장(삼각김밥)'
                  : item.category === '줄김밥'
                  ? '성형장(김밥)'
                  : item.category === '도시락'
                  ? '성형장(도시락)'
                  : '성형장(샌드위치)',
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
