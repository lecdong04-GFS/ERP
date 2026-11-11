import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { isDummyBomDetail } from '@/lib/gfs/bomMatch';
import {
  calcBagPriceFromBox,
  calcBoxPrice,
  normalizePackUnit,
  pickLatestValidDeliveryPrice,
  pickLatestValidPurchasePrice,
} from '@/lib/gfs/pricing';

// GET /api/master/product?category=완성품&search=김밥
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const kind = searchParams.get('kind');
    const search = searchParams.get('search');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const where: any = includeInactive ? {} : { isUsed: true };
    if (category) where.category = category;
    if (kind) where.kind = kind;
    if (search) {
      where.OR = [
        { productCode: { contains: search } },
        { name: { contains: search } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        prices: {
          orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
          take: 10,
        },
        partner: true,
        gye: true,
      },
      orderBy: { productCode: 'asc' },
    });

    // BOM 구성품 수 (활성 정본 헤더의 비더미 상세 기준)
    const headers = await prisma.bomHeader.findMany({
      where: { isUsed: true, parentProductId: { in: products.map((p) => p.id) } },
      select: {
        parentProductId: true,
        version: true,
        details: { select: { unit: true, unitQty: true } },
      },
      orderBy: [{ parentProductId: 'asc' }, { version: 'desc' }],
    });
    const bomCountByParent = new Map<number, number>();
    for (const h of headers) {
      if (!bomCountByParent.has(h.parentProductId)) {
        const validCount = h.details.filter((d) => !isDummyBomDetail(d.unit, d.unitQty)).length;
        bomCountByParent.set(h.parentProductId, validCount);
      }
    }

    const formatted = products.map((p) => {
      const boxQty = normalizePackUnit(p.boxQty);
      const purchasePrice = pickLatestValidPurchasePrice(p.prices);
      const deliveryPrice = pickLatestValidDeliveryPrice(p.prices);
      const boxPrice = calcBoxPrice(purchasePrice, boxQty);
      return {
        id: p.id,
        productCode: p.productCode,
        name: p.name,
        spec: p.spec,
        unit: p.unit,
        category: p.category,
        kind: p.kind,
        packType: p.packType,
        shift: p.shift,
        boxQty,
        warehouse: p.warehouse,
        safetyStockQty: p.safetyStockQty,
        minOrderQty: p.minOrderQty,
        orderUnitQty: p.orderUnitQty,
        targetOrderDays: (p as any).targetOrderDays ?? 0,
        bomDivisor: (p as any).bomDivisor ?? 1000,
        bomMultiplier: (p as any).bomMultiplier ?? 1,
        bomRoundDigits: (p as any).bomRoundDigits ?? 1,
        orderCycle: (p as any).orderCycle ?? '',
        status: p.status ?? '정상',
        discontinuedDate: p.discontinuedDate ?? null,
        isUsed: p.isUsed,
        deliveryPrice,
        purchasePrice,
        bagPrice: purchasePrice,
        boxPrice,
        partnerId: p.partnerId ?? '',
        partnerName: p.partner?.name ?? '',
        gyeId: p.gyeId ?? '',
        gyeName: p.gye?.name ?? '',
        bomCount: bomCountByParent.get(p.id) ?? 0,
      };
    });

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

// POST /api/master/product
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      productCode,
      name,
      spec,
      unit,
      category,
      kind,
      packType,
      shift,
      boxQty,
      warehouse,
      safetyStockQty,
      minOrderQty,
      orderUnitQty,
      targetOrderDays,
      orderCycle,
      status,
      discontinuedDate,
      isUsed,
      deliveryPrice,
      purchasePrice,
      bagPrice,
      boxPrice,
      partnerId,
      gyeId,
    } = body;

    if (!productCode || !name) {
      return NextResponse.json(
        { success: false, error: 'productCode and name are required' },
        { status: 400 }
      );
    }

    const existingProduct = await prisma.product.findUnique({
      where: { productCode },
      include: {
        prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
      },
    });

    const resolvedBoxQty =
      boxQty !== undefined
        ? normalizePackUnit(boxQty)
        : existingProduct
          ? normalizePackUnit(existingProduct.boxQty)
          : 1;

    const product = await prisma.product.upsert({
      where: { productCode },
      update: {
        name,
        spec: spec ?? '',
        unit: unit ?? 'ea',
        category: category ?? '완성품',
        kind: kind ?? '',
        packType: packType ?? '',
        shift: shift ?? '1편',
        boxQty: resolvedBoxQty,
        warehouse: warehouse ?? '',
        safetyStockQty: safetyStockQty ? Number(safetyStockQty) : 0,
        minOrderQty: minOrderQty ? Number(minOrderQty) : 0,
        orderUnitQty: orderUnitQty ? Number(orderUnitQty) : 0,
        ...(targetOrderDays !== undefined ? { targetOrderDays: Number(targetOrderDays) || 0 } : {}),
        ...(orderCycle !== undefined ? { orderCycle: String(orderCycle || '') } : {}),
        ...(status !== undefined ? { status: String(status || '정상') } : {}),
        ...(discontinuedDate !== undefined ? { discontinuedDate: discontinuedDate || null } : {}),
        ...(isUsed !== undefined ? { isUsed: Boolean(isUsed) } : {}),
        partnerId: partnerId || null,
        gyeId: gyeId || null,
      },
      create: {
        productCode,
        name,
        spec: spec ?? '',
        unit: unit ?? 'ea',
        category: category ?? '완성품',
        kind: kind ?? '',
        packType: packType ?? '',
        shift: shift ?? '1편',
        boxQty: resolvedBoxQty,
        warehouse: warehouse ?? '',
        safetyStockQty: safetyStockQty ? Number(safetyStockQty) : 0,
        minOrderQty: minOrderQty ? Number(minOrderQty) : 0,
        orderUnitQty: orderUnitQty ? Number(orderUnitQty) : 0,
        targetOrderDays: targetOrderDays ? Number(targetOrderDays) : 0,
        orderCycle: orderCycle ? String(orderCycle) : '',
        status: status ? String(status) : '정상',
        discontinuedDate: discontinuedDate || null,
        isUsed: isUsed !== undefined ? Boolean(isUsed) : true,
        partnerId: partnerId || null,
        gyeId: gyeId || null,
      },
    });

    const curPurchase = pickLatestValidPurchasePrice(existingProduct?.prices);
    const curDelivery = pickLatestValidDeliveryPrice(existingProduct?.prices);

    const rawPurchaseInput =
      purchasePrice !== undefined
        ? Number(purchasePrice)
        : bagPrice !== undefined
          ? Number(bagPrice)
          : boxPrice !== undefined
            ? calcBagPriceFromBox(Number(boxPrice), resolvedBoxQty)
            : undefined;
    const rawDeliveryInput =
      deliveryPrice !== undefined ? Number(deliveryPrice) : undefined;

    const hasPurchaseUpdate =
      rawPurchaseInput !== undefined && Number.isFinite(rawPurchaseInput) && rawPurchaseInput >= 0;
    const hasDeliveryUpdate =
      rawDeliveryInput !== undefined && Number.isFinite(rawDeliveryInput) && rawDeliveryInput >= 0;

    const nextPurchase = hasPurchaseUpdate ? rawPurchaseInput! : curPurchase;
    const nextDelivery = hasDeliveryUpdate ? rawDeliveryInput! : curDelivery;

    const priceChanged =
      (hasPurchaseUpdate && Math.abs(nextPurchase - curPurchase) > 0.01) ||
      (hasDeliveryUpdate && Math.abs(nextDelivery - curDelivery) > 0.01) ||
      (!existingProduct && (nextPurchase > 0 || nextDelivery > 0));

    if (priceChanged && (nextPurchase > 0 || nextDelivery > 0)) {
      await prisma.productPrice.create({
        data: {
          productId: product.id,
          deliveryPrice: nextDelivery,
          purchasePrice: nextPurchase,
          effectiveDate: kstToday(),
          remark: '품목마스터 저장',
        },
      });
    }

    // 단가(봉단가)가 유효하거나 변경되었으면 해당 품목 모든 Inventory LOT 단가/금액/품명 동기화
    if (hasPurchaseUpdate && nextPurchase > 0) {
      const invLots = await prisma.inventory.findMany({ where: { productId: product.id } });
      for (const inv of invLots) {
        await prisma.inventory.update({
          where: { id: inv.id },
          data: {
            productName: name,
            unitPrice: nextPurchase,
            stockAmount: Math.round((Number(inv.currentQty) || 0) * nextPurchase),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...product,
        bagPrice: nextPurchase,
        purchasePrice: nextPurchase,
        boxPrice: calcBoxPrice(nextPurchase, resolvedBoxQty),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save product' },
      { status: 500 }
    );
  }
}
