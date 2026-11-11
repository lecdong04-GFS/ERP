import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';
import { isDummyBomDetail, matchBomHeader } from '@/lib/gfs/bomMatch';
import { getLiveBomUsageMap } from '@/lib/gfs/liveUsage';
import { isTerminalProductStatus } from '@/lib/gfs/productStatus';
import {
  normalizePackUnit,
  pickLatestValidPurchasePrice,
  resolveBagPrice,
  calcBoxPrice,
  toBagQty,
} from '@/lib/gfs/pricing';

export const dynamic = 'force-dynamic';

// GET /api/purchase/simulation?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const todayKst = kstToday();
    const date = searchParams.get('date') || todayKst;

    // 1. 활성 BOM 헤더, ReprProduct 매핑, 실시간 BOM 일사용량 병렬 로드
    const [rawBomHeaders, reprRows, liveBomUsage] = await Promise.all([
      prisma.bomHeader.findMany({
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
      }),
      prisma.reprProduct.findMany({
        where: { isUsed: true },
        select: {
          orderProductId: true,
          reprProductId: true,
        },
      }),
      getLiveBomUsageMap(date).catch(() => null),
    ]);

    const bomHeaders = rawBomHeaders.filter(
      (bh) =>
        bh.parentProduct &&
        bh.details.some((d) => !isDummyBomDetail(d.unit, d.unitQty) && Number(d.unitQty) > 0),
    );
    bomHeaders.sort((a, b) => {
      const aDummy = a.details.some((d) => isDummyBomDetail(d.unit, d.unitQty));
      const bDummy = b.details.some((d) => isDummyBomDetail(d.unit, d.unitQty));
      if (aDummy !== bDummy) return aDummy ? 1 : -1;
      const aCat = a.parentProduct?.category === '완성품' ? 0 : 1;
      const bCat = b.parentProduct?.category === '완성품' ? 0 : 1;
      if (aCat !== bCat) return aCat - bCat;
      return a.id - b.id;
    });

    const reprByOrderId = new Map<number, number>();
    for (const r of reprRows) {
      reprByOrderId.set(r.orderProductId, r.reprProductId);
    }
    const headerByParentId = new Map<number, (typeof bomHeaders)[number]>();
    for (const bh of bomHeaders) {
      if (!headerByParentId.has(bh.parentProductId)) {
        headerByParentId.set(bh.parentProductId, bh);
      }
    }
    const resolveCanonicalProductCode = (
      productId: number | null | undefined,
      productCode: string | null | undefined,
      productName: string | null | undefined,
    ): string => {
      if (productId && reprByOrderId.has(productId)) {
        const mapped = headerByParentId.get(reprByOrderId.get(productId)!);
        if (mapped?.parentProduct?.productCode) return mapped.parentProduct.productCode;
      }
      if (productId && headerByParentId.has(productId)) {
        const direct = headerByParentId.get(productId)!;
        if (!direct.details.some((d) => isDummyBomDetail(d.unit, d.unitQty))) {
          if (direct.parentProduct?.productCode) return direct.parentProduct.productCode;
        }
      }
      if (productName) {
        const matched = matchBomHeader(productName, productId ?? null, bomHeaders);
        if (matched?.parentProduct?.productCode) return matched.parentProduct.productCode;
      }
      return productCode || '';
    };

    // 2. 완제품별 GS25 과거 수주 통계 집계 (ReprProduct + BOM 매핑 통합 일일 평균)
    const allOrderDetails = await prisma.salesOrderDetail.findMany({
      where: {
        salesOrder: {
          status: { not: '취소' },
        },
      },
      select: {
        totalQty: true,
        salesOrder: { select: { orderDate: true } },
        product: { select: { id: true, productCode: true, name: true } },
      },
    });

    const statMap = new Map<
      string,
      { count: number; totalQty: number; avgQty: number; dates: Set<string> }
    >();
    for (const od of allOrderDetails) {
      const targetCode = resolveCanonicalProductCode(
        od.product?.id,
        od.product?.productCode,
        od.product?.name,
      );
      if (!targetCode) continue;
      const cur = statMap.get(targetCode) || {
        count: 0,
        totalQty: 0,
        avgQty: 0,
        dates: new Set<string>(),
      };
      cur.count += 1;
      cur.totalQty += Number(od.totalQty) || 0;
      if (od.salesOrder?.orderDate) cur.dates.add(od.salesOrder.orderDate);
      statMap.set(targetCode, cur);
    }
    statMap.forEach((v) => {
      const denom = v.dates.size > 0 ? v.dates.size : v.count;
      v.avgQty = denom > 0 ? Math.round(v.totalQty / denom) : 0;
    });

    // 2-1. 최근 수주량 조회 (기준일자 이전 가장 최근 수주일 합계)
    const recentOrders = await prisma.salesOrderDetail.findMany({
      where: {
        salesOrder: {
          status: { not: '취소' },
          orderDate: { lte: date },
        },
      },
      include: {
        product: true,
        salesOrder: { select: { orderDate: true } },
      },
      orderBy: [{ salesOrder: { orderDate: 'desc' } }, { id: 'desc' }],
      take: 2000,
    });

    const recentOrderQtyMap = new Map<string, number>();
    const recentOrderDateMap = new Map<string, string>();
    for (const od of recentOrders) {
      const targetCode = resolveCanonicalProductCode(
        od.product?.id,
        od.product?.productCode,
        od.product?.name,
      );
      const orderDate = od.salesOrder?.orderDate || '';
      if (!targetCode || !orderDate) continue;
      const latestDate = recentOrderDateMap.get(targetCode);
      if (!latestDate) {
        recentOrderDateMap.set(targetCode, orderDate);
        recentOrderQtyMap.set(targetCode, Number(od.totalQty) || 0);
      } else if (latestDate === orderDate) {
        recentOrderQtyMap.set(
          targetCode,
          (recentOrderQtyMap.get(targetCode) || 0) + (Number(od.totalQty) || 0),
        );
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
              if (isDummyBomDetail(d.unit, d.unitQty)) return false;
              if (!(Number(d.unitQty) > 0)) return false;
              if (d.childProductId === bh.parentProductId) return false;
              const cp = d.childProduct;
              if (cp && (cp.category === '완성품' || cp.category === '반제품')) return false;
              const name = cp?.name || '';
              const disc = cp?.discontinuedDate;
              if (
                isExcludedFromOrder(name, date) ||
                (cp && (!cp.isUsed || isTerminalProductStatus(cp.status) || (disc && date >= disc)))
              ) {
                return false;
              }
              return true;
            })
            .map((d) => {
            const cp = d.childProduct;
            const yieldRate = d.yieldRate > 0 ? d.yieldRate : 100;
            const divisor = Number(cp?.bomDivisor) > 0 ? Number(cp.bomDivisor) : 1000;
            const mult = Number(cp?.bomMultiplier) > 0 ? Number(cp.bomMultiplier) : 1;
            const buffer = Number((d as any).orderBuffer) > 0 ? Number((d as any).orderBuffer) : 1;
            const u = String(d.unit || '').trim().toLowerCase();
            const rawUnitQty = Number(d.unitQty) || 0;
            const unitQty = u === 'kg' && divisor >= 100 ? rawUnitQty * 1000 : rawUnitQty;
            const realFactor = (((unitQty * buffer) / (yieldRate / 100)) / (divisor > 1 ? divisor : 1)) * mult;
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
        prices: {
          orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
          take: 10,
        },
        inventories: true,
      },
      orderBy: { productCode: 'asc' },
    });

    // 5. 입고예정량 (PurchaseOrderDetail 미입고 잔량 — 봉/기본단위 환산)
    const pendingOrders = await prisma.purchaseOrderDetail.findMany({
      where: {
        purchaseOrder: {
          status: { in: ['발주', '부분입고'] },
        },
      },
      select: {
        productId: true,
        productCode: true,
        unit: true,
        remainQty: true,
        product: { select: { boxQty: true } },
      },
    });

    const pendingMap = new Map<string, number>();
    for (const po of pendingOrders) {
      const bags = toBagQty(Number(po.remainQty) || 0, po.unit || 'box', po.product?.boxQty);
      pendingMap.set(po.productCode, (pendingMap.get(po.productCode) || 0) + bags);
    }

    // 6. 자재 메타데이터 맵 빌드 (발주 제외 및 삭제예정일 도래 품목 제외 — date 기준 동적 비교)
    const activeMaterials = materials.filter((m) => {
      if (isTerminalProductStatus(m.status)) return false;
      if (isExcludedFromOrder(m.name, date)) return false;
      if (m.discontinuedDate && date >= m.discontinuedDate) return false;
      return true;
    });

    const materialMap: Record<string, any> = {};
    for (const m of activeMaterials) {
      const invStock = m.inventories.reduce((acc, inv) => acc + (Number(inv.currentQty) || 0), 0);
      const invPrice = m.inventories.find((inv) => (Number(inv.unitPrice) || 0) > 0)?.unitPrice || 0;
      const invUsage = m.inventories.find((inv) => (Number(inv.dailyUsage) || 0) > 0)?.dailyUsage || 0;
      const masterDailyUsage = Number(invUsage) || 0;
      const liveDailyUsage = Math.round(
        (liveBomUsage?.byProductId.get(m.id) ??
          liveBomUsage?.byProductCode.get(m.productCode) ??
          0) * 100,
      ) / 100;
      const dailyUsage = liveDailyUsage > 0 ? liveDailyUsage : masterDailyUsage;
      const pendingIncoming = pendingMap.get(m.productCode) || 0;
      const targetDays = Number((m as any).targetOrderDays) > 0 ? Number((m as any).targetOrderDays) : (m.partner?.leadTime || 1);
      const packUnit = normalizePackUnit(m.boxQty);
      const bagPrice = resolveBagPrice({
        masterBagPrice: pickLatestValidPurchasePrice(m.prices as any),
        invUnitPrice: invPrice,
      });
      const boxPrice = calcBoxPrice(bagPrice, packUnit);

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
        targetOrderDays: targetDays,
        boxQty: packUnit,
        minOrderQty: m.minOrderQty || 1,
        orderUnitQty: m.orderUnitQty || 1,
        safetyStock: m.safetyStockQty || 50,
        currentStock: Number(invStock.toFixed(2)),
        pendingIncoming: Number(pendingIncoming.toFixed(2)),
        unitPrice: bagPrice,
        bagPrice,
        boxPrice,
        dailyUsage,
        liveDailyUsage,
        masterDailyUsage,
      };
    }

    return NextResponse.json({
      success: true,
      queryDate: date,
      seasonality: currentSeasonality,
      totalFinishedCount: finishedProducts.length,
      totalMaterialCount: activeMaterials.length,
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
