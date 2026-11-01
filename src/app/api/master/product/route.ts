import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

// GET /api/master/product?category=완성품&search=김밥
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const kind = searchParams.get('kind');
    const search = searchParams.get('search');

    const where: any = { isUsed: true };
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
          orderBy: { effectiveDate: 'desc' },
          take: 1,
        },
        partner: true,
        gye: true,
      },
      orderBy: { productCode: 'asc' },
    });

    // BOM 구성품 수 (부모 기준 최신 버전 합산 → 버전별 중복 제외는 최신 버전만)
    const headers = await prisma.bomHeader.findMany({
      where: { parentProductId: { in: products.map((p) => p.id) } },
      select: {
        parentProductId: true,
        version: true,
        _count: { select: { details: true } },
      },
      orderBy: [{ parentProductId: 'asc' }, { version: 'desc' }],
    });
    const bomCountByParent = new Map<number, number>();
    for (const h of headers) {
      if (!bomCountByParent.has(h.parentProductId)) {
        bomCountByParent.set(h.parentProductId, h._count.details);
      }
    }

    const formatted = products.map((p) => ({
      id: p.id,
      productCode: p.productCode,
      name: p.name,
      spec: p.spec,
      unit: p.unit,
      category: p.category,
      kind: p.kind,
      packType: p.packType,
      shift: p.shift,
      boxQty: p.boxQty,
      warehouse: p.warehouse,
      safetyStockQty: p.safetyStockQty,
      minOrderQty: p.minOrderQty,
      orderUnitQty: p.orderUnitQty,
      deliveryPrice: p.prices[0]?.deliveryPrice ?? 0,
      purchasePrice: p.prices[0]?.purchasePrice ?? 0,
      partnerId: p.partnerId ?? '',
      partnerName: p.partner?.name ?? '',
      gyeId: p.gyeId ?? '',
      gyeName: p.gye?.name ?? '',
      bomCount: bomCountByParent.get(p.id) ?? 0,
    }));

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
      deliveryPrice,
      purchasePrice,
      partnerId,
      gyeId,
    } = body;

    if (!productCode || !name) {
      return NextResponse.json(
        { success: false, error: 'productCode and name are required' },
        { status: 400 }
      );
    }

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
        boxQty: boxQty ? Number(boxQty) : 1,
        warehouse: warehouse ?? '',
        safetyStockQty: safetyStockQty ? Number(safetyStockQty) : 0,
        minOrderQty: minOrderQty ? Number(minOrderQty) : 0,
        orderUnitQty: orderUnitQty ? Number(orderUnitQty) : 0,
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
        boxQty: boxQty ? Number(boxQty) : 1,
        warehouse: warehouse ?? '',
        safetyStockQty: safetyStockQty ? Number(safetyStockQty) : 0,
        minOrderQty: minOrderQty ? Number(minOrderQty) : 0,
        orderUnitQty: orderUnitQty ? Number(orderUnitQty) : 0,
        partnerId: partnerId || null,
        gyeId: gyeId || null,
      },
    });

    if (deliveryPrice !== undefined || purchasePrice !== undefined) {
      await prisma.productPrice.create({
        data: {
          productId: product.id,
          deliveryPrice: deliveryPrice ? Number(deliveryPrice) : 0,
          purchasePrice: purchasePrice ? Number(purchasePrice) : 0,
          effectiveDate: kstToday(),
        },
      });
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save product' },
      { status: 500 }
    );
  }
}
