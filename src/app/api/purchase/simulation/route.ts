import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

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

    // 2. 완제품별 최근 수주량 조회 (salesOrder)
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
        recentOrderQtyMap.set(code, Number(od.totalQty) || 1000);
      }
    }

    // 3. 완제품 목록 및 BOM 맵 구성
    const finishedProducts = bomHeaders
      .filter((bh) => bh.parentProduct)
      .map((bh) => {
        const p = bh.parentProduct!;
        const baseQty = recentOrderQtyMap.get(p.productCode) || 1000;
        return {
          id: p.id,
          bomId: bh.id,
          code: p.productCode,
          name: p.name,
          category: p.category || '완성품',
          spec: p.spec || '',
          unit: p.unit || 'ea',
          baseQty,
          simulQty: baseQty,
          ingredients: bh.details.map((d) => {
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
