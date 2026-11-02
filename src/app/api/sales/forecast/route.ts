import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekday(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getDay();
}

// GET /api/sales/forecast?from=2026-10-01&to=2026-10-30&targets=2026-11-03,2026-11-04
// 수주 히스토리(SalesOrderDetail) 기반 같은 요일 평균 수요예측
// body 없음. from/to 미지정 시 최근 28일, targets 미지정 시 내일+모레(KST)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const today = kstToday();
    const to = searchParams.get('to') || today;
    const from = searchParams.get('from') || addDays(to, -27);
    const targetsParam = searchParams.get('targets');
    const targets = targetsParam
      ? targetsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : [addDays(today, 1), addDays(today, 2)];

    const orders = await prisma.salesOrder.findMany({
      where: {
        orderDate: { gte: from, lte: to },
        status: { not: '취소' },
      },
      select: {
        orderDate: true,
        details: {
          select: {
            productId: true,
            totalQty: true,
            product: { select: { productCode: true, name: true, unit: true } },
          },
        },
      },
    });

    const orderDays = [...new Set(orders.map((o) => o.orderDate))].sort();
    const byDateWeekday = new Map<string, number>();
    orderDays.forEach((d) => byDateWeekday.set(d, weekday(d)));

    interface ProdAgg {
      productId: number;
      productCode: string;
      productName: string;
      unit: string;
      byDate: Map<string, number>;
    }
    const prodMap = new Map<number, ProdAgg>();
    for (const o of orders) {
      for (const dt of o.details) {
        let agg = prodMap.get(dt.productId);
        if (!agg) {
          agg = {
            productId: dt.productId,
            productCode: dt.product?.productCode || '',
            productName: dt.product?.name || '',
            unit: dt.product?.unit || 'ea',
            byDate: new Map(),
          };
          prodMap.set(dt.productId, agg);
        }
        agg.byDate.set(o.orderDate, (agg.byDate.get(o.orderDate) || 0) + (dt.totalQty || 0));
      }
    }

    const items = [...prodMap.values()].map((agg) => {
      const predictions = targets.map((t) => {
        const w = weekday(t);
        const samples: number[] = [];
        for (const d of orderDays) {
          if (byDateWeekday.get(d) === w) samples.push(agg.byDate.get(d) || 0);
        }
        let qty: number;
        let method: string;
        if (samples.length > 0) {
          qty = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
          method = 'weekday';
        } else {
          // 같은 요일 표본이 없으면 전체 일평균으로 폴백
          const all = orderDays.map((d) => agg.byDate.get(d) || 0);
          qty = all.length > 0 ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
          method = 'overall';
        }
        return { date: t, weekday: w, qty, samples: samples.length, method };
      });
      const totalPredicted = predictions.reduce((s, p) => s + p.qty, 0);
      return {
        productId: agg.productId,
        productCode: agg.productCode,
        productName: agg.productName,
        unit: agg.unit,
        activeDays: [...agg.byDate.values()].filter((v) => v > 0).length,
        predictions,
        totalPredicted,
      };
    });
    items.sort((a, b) => b.totalPredicted - a.totalPredicted);

    return NextResponse.json({
      success: true,
      data: { from, to, orderDays, orderDayCount: orderDays.length, targets, items, itemCount: items.length },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '수요예측 집계 실패' },
      { status: 500 }
    );
  }
}
