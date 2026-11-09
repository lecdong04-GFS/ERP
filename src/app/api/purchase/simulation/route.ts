import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';

export const dynamic = 'force-dynamic';

// GET /api/purchase/simulation?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || kstToday();

    // 1. 활성 BOM 헤더 및 하위 자재 명세 로드
    const bomHeaders = await prisma.bomHeader.findMany({
      where: { isUsed: true },
      include: {
        parentProduct: {
          include: { partner: true },
        },
        details: {
          include: {
            childProduct: {
              include: { partner: true },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    // 2. 완제품별 GS25 과거 수주 통계 집계 (실제 2,500+건 수주 실적 기반)
    const allOrderDetails = await prisma.salesOrderDetail.findMany({
      where: {
        salesOrder: {
          status: { not: '취소' },
        },
      },
      select: {
        totalQty: true,
        product: { select: { productCode: true } },
      },
    });

    const statMap = new Map<string, { count: number; totalQty: number; avgQty: number }>();
    for (const od of allOrderDetails) {
      const code = od.product?.productCode;
      if (!code) continue;
      const cur = statMap.get(code) || { count: 0, totalQty: 0, avgQty: 0 };
      cur.count += 1;
      cur.totalQty += Number(od.totalQty) || 0;
      statMap.set(code, cur);
    }
    statMap.forEach((v) => {
      v.avgQty = v.count > 0 ? Math.round(v.totalQty / v.count) : 0;
    });

    // 2-1. 최근 수주량 조회 (기준일자 이전 가장 최근 수주)
    const recentOrders = await prisma.salesOrderDetail.findMany({
      where: {
        salesOrder: {
          status: { not: '취소' },
          orderDate: { lte: date },
        },
      },
      include: { product: true },
      orderBy: { id: 'desc' },
      take: 500,
    });

    const recentOrderQtyMap = new Map<string, number>();
    for (const od of recentOrders) {
      const code = od.product?.productCode;
      if (code && !recentOrderQtyMap.has(code)) {
        recentOrderQtyMap.set(code, Number(od.totalQty) || 0);
      }
    }

    // 2-2. 35일간 실데이터(188만 개) 전수 통계 기반 요일별 수요 가중치 계수 산출
    const targetDt = new Date(date + 'T00:00:00Z');
    const dow = targetDt.getUTCDay(); // 0(일) ~ 6(토)
    const SEASONALITY_BY_DOW: Record<
      number,
      { day: string; factor: number; pctStr: string; note: string; tone: 'peak' | 'normal' | 'low' }
    > = {
      0: { day: '일요일', factor: 1.04, pctStr: '+4%', note: '주초 출근길 대비 급반등 (+4%)', tone: 'normal' },
      1: { day: '월요일', factor: 1.08, pctStr: '+8%', note: '주초 직장인/학생 수요 집중 (+8%)', tone: 'peak' },
      2: { day: '화요일', factor: 1.09, pctStr: '+9%', note: '주간 최고 피크 요일 (+9%)', tone: 'peak' },
      3: { day: '수요일', factor: 1.05, pctStr: '+5%', note: '주중 안정적 수요 (+5%)', tone: 'normal' },
      4: { day: '목요일', factor: 0.96, pctStr: '-4%', note: '주 후반 완만한 감소 (-4%)', tone: 'normal' },
      5: { day: '금요일', factor: 0.88, pctStr: '-12%', note: '주말 폐기방지 안전 감량 발주 (-12%)', tone: 'low' },
      6: { day: '토요일', factor: 0.90, pctStr: '-10%', note: '주말 저녁/2편 중심 수요 (-10%)', tone: 'low' },
    };
    const currentSeasonality = SEASONALITY_BY_DOW[dow] || SEASONALITY_BY_DOW[1];

    // 3. 완제품 목록 및 BOM 맵 구성
    const finishedProducts = bomHeaders
      .filter((bh) => bh.parentProduct)
      .map((bh) => {
        const p = bh.parentProduct!;
        const stat = statMap.get(p.productCode);
        const avgQty = stat?.avgQty && stat.avgQty > 0 ? stat.avgQty : 0;
        const recentQty = recentOrderQtyMap.get(p.productCode) || 0;
        // 시스템 추천 기준수량: 과거 통계 평균 > 최근 수주량 > 기본 1,000
        const rawBase = avgQty > 0 ? avgQty : recentQty > 0 ? recentQty : 1000;
        // 요일별 가중치 계수를 자동 곱하여 피크 대비 및 폐기 방지
        const baseQty = Math.round(rawBase * currentSeasonality.factor);

        return {
          id: p.id,
          bomId: bh.id,
          code: p.productCode,
          name: p.name,
          category: p.category || '완성품',
          spec: p.spec || '',
          unit: p.unit || 'ea',
          statAvgQty: avgQty,
          statOrderCount: stat?.count || 0,
          recentQty,
          rawBaseQty: rawBase,
          baseQty,
          simulQty: baseQty,
          seasonalityFactor: currentSeasonality.factor,
          seasonalityNote: currentSeasonality.note,
          ingredients: bh.details
            .filter((d) => {
              const cp = d.childProduct;
              const name = cp?.name || '';
              if (isExcludedFromOrder(name) || (cp && !cp.isUsed)) {
                return false;
              }
              return true;
            })
            .map((d) => {
            const cp = d.childProduct;
            const yieldRate = d.yieldRate > 0 ? d.yieldRate : 100;
            const unitQty = d.unitQty || 0;
            const realFactor = unitQty / (yieldRate / 100);
            return {
              childId: cp?.id || d.childProductId,
              childCode: cp?.productCode || '',
              childName: cp?.name || '자재',
              category: cp?.category || '원재료',
              spec: cp?.spec || '',
              unit: cp?.unit || d.unit || 'g',
              unitQty,
              yieldRate,
              realFactor,
            };
          }),
        };
      });

    // 4. 모든 원부자재 목록 및 재고/단가/협력사 로드
    const materials = await prisma.product.findMany({
      where: {
        category: { in: ['원재료', '부자재', '포장재'] },
        isUsed: true,
      },
      include: {
        partner: true,
        inventories: true,
      },
      orderBy: { productCode: 'asc' },
    });

    // 5. 입고예정량 (PurchaseOrderDetail 미입고 잔량)
    const pendingOrders = await prisma.purchaseOrderDetail.findMany({
      where: {
        purchaseOrder: {
          status: { in: ['발주', '부분입고'] },
        },
      },
      select: {
        productId: true,
        productCode: true,
        remainQty: true,
      },
    });

    const pendingMap = new Map<string, number>();
    for (const po of pendingOrders) {
      pendingMap.set(po.productCode, (pendingMap.get(po.productCode) || 0) + (Number(po.remainQty) || 0));
    }

    // 6. 자재 메타데이터 맵 빌드
    const materialMap: Record<string, any> = {};
    for (const m of materials) {
      const invStock = m.inventories.reduce((acc, inv) => acc + (Number(inv.currentQty) || 0), 0);
      const invPrice = m.inventories.find((inv) => (Number(inv.unitPrice) || 0) > 0)?.unitPrice || 0;
      const invUsage = m.inventories.find((inv) => (Number(inv.dailyUsage) || 0) > 0)?.dailyUsage || 0;
      const pendingIncoming = pendingMap.get(m.productCode) || 0;

      materialMap[m.productCode] = {
        id: m.id,
        code: m.productCode,
        name: m.name,
        category: m.category || '원재료',
        spec: m.spec || '',
        unit: m.unit || 'ea',
        supplier: m.partner?.name || '협력사',
        partnerId: m.partnerId || '',
        leadTime: m.partner?.leadTime || 1,
        boxQty: m.boxQty > 0 ? m.boxQty : 1,
        minOrderQty: m.minOrderQty || 1,
        orderUnitQty: m.orderUnitQty || 1,
        safetyStock: m.safetyStockQty || 50,
        currentStock: Number(invStock.toFixed(2)),
        pendingIncoming: Number(pendingIncoming.toFixed(2)),
        unitPrice: Number(invPrice) || 1000,
        dailyUsage: Number(invUsage) || 0,
      };
    }

    return NextResponse.json({
      success: true,
      queryDate: date,
      seasonality: currentSeasonality,
      totalFinishedCount: finishedProducts.length,
      totalMaterialCount: materials.length,
      finishedProducts,
      materials: materialMap,
    });
  } catch (error: any) {
    console.error('Simulation API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '시뮬레이션 데이터 로드 실패' },
      { status: 500 }
    );
  }
}
