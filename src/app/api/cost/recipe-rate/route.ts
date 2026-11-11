import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import {
  calcBomEffectiveUnitCost,
  isDummyBomDetail,
  pickLatestDeliveryPrice,
  pickLatestValidPrice,
} from '@/lib/gfs/bomMatch';

function detectVariety(kind?: string | null, name?: string): string {
  if (kind && kind.trim() && kind !== 'N/A' && kind !== '기타' && kind !== '(미분류)') {
    return kind.trim();
  }
  const n = name || '';
  if (n.includes('도시락')) return '도시락';
  if (n.includes('김밥')) return '김밥';
  if (n.includes('주먹밥') || n.includes('삼각')) return '주먹밥';
  if (n.includes('무스비')) return '무스비';
  if (n.includes('면') || n.includes('스파게티') || n.includes('우동') || n.includes('국수')) return '조리면';
  if (n.includes('샌드') || n.includes('버거') || n.includes('토스트')) return '샌드위치/버거';
  return '일반/기타';
}

// GET /api/cost/recipe-rate?calcMonth=2026-11&recalc=false
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const calcMonth = searchParams.get('calcMonth') || kstToday().slice(0, 7);
    const recalc = searchParams.get('recalc') === 'true';
    void recalc;

    // 1. DB의 활성 정본 BOM 및 원부자재 단가 조회
    const boms = await prisma.bomHeader.findMany({
      where: { isUsed: true },
      include: {
        parentProduct: {
          include: {
            prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
            gye: true,
          },
        },
        details: {
          include: {
            childProduct: {
              include: {
                prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
                partner: true,
              },
            },
            gye: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { parentProductId: 'asc' },
    });

    // 2. 단가 보정용 최근 수주 및 배송 단가 사전 맵핑 (N+1 방지)
    const [salesOrderPrices, deliveryPrices, savedRecords] = await Promise.all([
      prisma.salesOrderDetail.findMany({
        where: { unitPrice: { gt: 0 } },
        select: { productId: true, unitPrice: true },
        distinct: ['productId'],
        orderBy: { id: 'desc' },
      }),
      prisma.deliveryDetail.findMany({
        where: { unitPrice: { gt: 0 } },
        select: { productCode: true, unitPrice: true },
        distinct: ['productCode'],
        orderBy: { id: 'desc' },
      }),
      prisma.recipeCostRate.findMany({
        where: { calcMonth },
      }),
    ]);

    const soPriceMap = new Map(salesOrderPrices.map((s) => [s.productId, s.unitPrice]));
    const delivPriceMap = new Map(deliveryPrices.map((d) => [d.productCode, d.unitPrice]));
    const savedMap = new Map(savedRecords.map((r) => [r.productId, r]));

    // 3. 정본 BOM에 대해 실시간 레시피원가 및 원가율 계산
    const list = boms
      .map((b) => {
        const p = b.parentProduct;
        if (!p) return null;

        // 저장된 단가 우선 -> 품목 마스터 단가 -> 수주 단가 -> 배송 단가
        const saved = savedMap.get(p.id);
        const masterDeliv = Number(pickLatestDeliveryPrice(p.prices as any)?.deliveryPrice) || 0;
        const deliveryPrice =
          saved?.deliveryPrice ||
          masterDeliv ||
          soPriceMap.get(p.id) ||
          delivPriceMap.get(p.productCode) ||
          0;

        // 소요 원부자재 투입원가 합산
        let totalRecipeCost = 0;
        const validDetails = (b.details || []).filter((d) => !isDummyBomDetail(d.unit, d.unitQty));
        const details = validDetails.map((d) => {
          const cp = d.childProduct as any;
          const purchasePrice = Number(pickLatestValidPrice(cp?.prices)?.purchasePrice) || 0;
          const unit = d.unit || cp?.unit || 'g';
          const yieldRate = d.yieldRate || 100;
          const inQty = Number(d.unitQty) || 0;
          const actQty = Math.round((inQty / (yieldRate / 100)) * 1000) / 1000;
          const div = Number(cp?.bomDivisor) > 0
            ? Number(cp.bomDivisor)
            : (unit.toLowerCase() === 'g' || unit.toLowerCase() === 'ml' ? 1000 : 1);
          const effQty = unit.toLowerCase() === 'kg' && div >= 100 ? actQty * 1000 : actQty;
          const mult = Number(cp?.bomMultiplier) > 0 ? Number(cp.bomMultiplier) : 1;
          const unitCost =
            Math.round(calcBomEffectiveUnitCost(effQty, purchasePrice, div, mult) * 10) / 10;
          totalRecipeCost += unitCost;

          return {
            id: d.id,
            childProductId: d.childProductId,
            partId: cp?.productCode || '',
            partName: cp?.name || '',
            category: cp?.category || '원재료',
            spec: cp?.spec || '',
            unit,
            purchasePrice,
            recipeYield: yieldRate,
            unitQty: inQty,
            actualQty: actQty,
            unitCost,
            costShare: 0, // 하단에서 산출
            partnerName: cp?.partner?.name || '',
            gyeName: d.gye?.name || '',
            remark: d.remark || '',
          };
        });

      totalRecipeCost = Math.round(totalRecipeCost * 10) / 10;

      // 원가비중 산출
      const detailsWithShare = details.map((dt) => ({
        ...dt,
        costShare: totalRecipeCost > 0 ? Math.round((dt.unitCost / totalRecipeCost) * 1000) / 10 : 0,
      }));

      const diff = deliveryPrice > 0 ? Math.round((deliveryPrice - totalRecipeCost) * 10) / 10 : 0;
      const costRate = deliveryPrice > 0 ? Math.round((totalRecipeCost / deliveryPrice) * 1000) / 10 : 0;
      const variety = detectVariety(p.kind, p.name);

      return {
        id: b.id,
        productId: p.id,
        productCode: p.productCode || '',
        productName: p.name || '',
        category: p.category || '완성품',
        kind: variety,
        spec: p.spec || '',
        unit: p.unit || 'ea',
        packType: p.packType || '개별포장',
        gyeName: p.gye?.name || '성형장',
        recipeCost: totalRecipeCost,
        deliveryPrice,
        diff,
        costRate,
        isLoss: deliveryPrice > 0 && diff < 0,
        isUnregisteredPrice: deliveryPrice <= 0,
        materialCount: detailsWithShare.length,
        version: b.version || '1.0',
        remark: saved?.remark || b.remark || '',
        details: detailsWithShare,
      };
    }).filter(Boolean);

    // 4. 통계 지표 산출
    const validPrices = list.filter((r: any) => r.deliveryPrice > 0);
    const sumRecipeCost = validPrices.reduce((s: number, r: any) => s + r.recipeCost, 0);
    const sumDeliveryPrice = validPrices.reduce((s: number, r: any) => s + r.deliveryPrice, 0);
    const avgCostRate = sumDeliveryPrice > 0 ? Math.round((sumRecipeCost / sumDeliveryPrice) * 1000) / 10 : 0;
    const lossCount = list.filter((r: any) => r.isLoss).length;
    const unregisteredCount = list.filter((r: any) => r.isUnregisteredPrice).length;
    const highCostCount = list.filter((r: any) => r.deliveryPrice > 0 && r.costRate > 60).length;

    return NextResponse.json({
      success: true,
      calcMonth,
      data: list,
      summary: {
        totalProducts: list.length,
        pricedProducts: validPrices.length,
        avgCostRate,
        lossCount,
        unregisteredCount,
        highCostCount,
        sumRecipeCost,
        sumDeliveryPrice,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/cost/recipe-rate (납품단가 또는 비고 일괄/단건 저장)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body) ? body : body.rows || [body];

    const results = [];
    for (const r of rows) {
      if (!r.productId) continue;
      const upserted = await prisma.recipeCostRate.upsert({
        where: {
          calcMonth_productId: {
            calcMonth: r.calcMonth || new Date().toISOString().slice(0, 7),
            productId: Number(r.productId),
          },
        },
        update: {
          recipeCost: Number(r.recipeCost) || 0,
          deliveryPrice: Number(r.deliveryPrice) || 0,
          diff: Number(r.diff) || 0,
          costRate: Number(r.costRate) || 0,
          remark: r.remark || '',
        },
        create: {
          calcMonth: r.calcMonth || new Date().toISOString().slice(0, 7),
          productId: Number(r.productId),
          productCode: r.productCode || '',
          productName: r.productName || '',
          category: r.category || '완성품',
          kind: r.kind || '',
          spec: r.spec || '',
          unit: r.unit || 'ea',
          packType: r.packType || '',
          gyeName: r.gyeName || '',
          recipeCost: Number(r.recipeCost) || 0,
          deliveryPrice: Number(r.deliveryPrice) || 0,
          diff: Number(r.diff) || 0,
          costRate: Number(r.costRate) || 0,
          remark: r.remark || '',
        },
      });

      // 만약 납품단가가 수정되었으면 ProductPrice 테이블도 동기화
      if (r.deliveryPrice && Number(r.deliveryPrice) > 0) {
        const existingPrice = await prisma.productPrice.findFirst({
          where: { productId: Number(r.productId) },
          orderBy: { effectiveDate: 'desc' },
        });

        if (existingPrice) {
          await prisma.productPrice.update({
            where: { id: existingPrice.id },
            data: { deliveryPrice: Number(r.deliveryPrice) },
          });
        } else {
          await prisma.productPrice.create({
            data: {
              productId: Number(r.productId),
              deliveryPrice: Number(r.deliveryPrice),
              effectiveDate: kstToday(),
              remark: '원가율 화면에서 납품단가 등록',
            },
          });
        }
      }

      results.push(upserted);
    }

    return NextResponse.json({
      success: true,
      message: `${results.length}건의 레시피 원가율 정보가 저장되었습니다.`,
      data: results,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
