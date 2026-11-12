import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';

// GET /api/sales/trend?period=monthly&year=2026
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'sales', action: 'read' });
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') || kstToday().slice(0, 4);

    // 1. 전체 수주 내역 조회
    const orders = await prisma.salesOrder.findMany({
      where: {
        orderDate: { startsWith: year },
      },
      include: {
        details: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { orderDate: 'asc' },
    });

    // 2. 월별 수주 추세 (1월 ~ 12월)
    const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
      const monthStr = String(i + 1).padStart(2, '0');
      return {
        month: `${year}-${monthStr}`,
        label: `${i + 1}월`,
        orderCount: 0,
        totalQty: 0,
        shift1Qty: 0,
        shift2Qty: 0,
        totalAmount: 0,
      };
    });

    // 3. 품목군별(김밥, 도시락, 샌드위치 등) 수주량 점유율
    const categoryQtyMap: Record<string, { category: string; qty: number; amount: number }> = {};

    // 4. 베스트셀러 TOP 10 품목 추세
    const topItemMap: Record<string, { productCode: string; productName: string; qty: number; amount: number }> = {};

    // 5. 최근 30일 일별 수주 추세
    const recent30DaysMap: Record<string, { date: string; qty: number; amount: number; shift1: number; shift2: number }> = {};

    for (const order of orders) {
      const mIdx = parseInt(order.orderDate.slice(5, 7)) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        monthlyTrend[mIdx].orderCount += 1;
        monthlyTrend[mIdx].totalQty += order.totalQty;
        monthlyTrend[mIdx].totalAmount += order.totalAmount;
        if (order.shift === '1편') {
          monthlyTrend[mIdx].shift1Qty += order.totalQty;
        } else {
          monthlyTrend[mIdx].shift2Qty += order.totalQty;
        }
      }

      // 최근 30일
      const dKey = order.orderDate;
      if (!recent30DaysMap[dKey]) {
        recent30DaysMap[dKey] = { date: dKey, qty: 0, amount: 0, shift1: 0, shift2: 0 };
      }
      recent30DaysMap[dKey].qty += order.totalQty;
      recent30DaysMap[dKey].amount += order.totalAmount;
      if (order.shift === '1편') recent30DaysMap[dKey].shift1 += order.totalQty;
      else recent30DaysMap[dKey].shift2 += order.totalQty;

      // 품목별 집계
      for (const d of order.details) {
        const cat = d.product.kind || d.product.category || '기타';
        if (!categoryQtyMap[cat]) {
          categoryQtyMap[cat] = { category: cat, qty: 0, amount: 0 };
        }
        categoryQtyMap[cat].qty += d.totalQty;
        categoryQtyMap[cat].amount += d.amount;

        const pCode = d.product.productCode;
        if (!topItemMap[pCode]) {
          topItemMap[pCode] = {
            productCode: pCode,
            productName: d.product.name,
            qty: 0,
            amount: 0,
          };
        }
        topItemMap[pCode].qty += d.totalQty;
        topItemMap[pCode].amount += d.amount;
      }
    }

    const topItems = Object.values(topItemMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    const categoryShares = Object.values(categoryQtyMap).sort((a, b) => b.qty - a.qty);

    const dailyTrend = Object.values(recent30DaysMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // 수주 성장률 분석
    const totalYearQty = monthlyTrend.reduce((acc, m) => acc + m.totalQty, 0);
    const totalYearAmount = monthlyTrend.reduce((acc, m) => acc + m.totalAmount, 0);

    return NextResponse.json({
      success: true,
      year,
      summary: {
        totalOrdersCount: orders.length,
        totalYearQty,
        totalYearAmount,
        avgDailyQty: orders.length > 0 ? Math.round(totalYearQty / Math.max(1, Object.keys(recent30DaysMap).length)) : 0,
      },
      monthlyTrend,
      dailyTrend,
      topItems,
      categoryShares,
    });
  } catch (error: any) {
    console.error('Sales trend error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch sales trend' },
      { status: 500 }
    );
  }
}

