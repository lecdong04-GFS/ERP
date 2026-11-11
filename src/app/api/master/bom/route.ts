import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { isDummyBomDetail, normalizeDateYmd } from '@/lib/gfs/bomMatch';
import {
  calcBoxPrice,
  normalizePackUnit,
  pickLatestValidDeliveryPrice,
  pickLatestValidPurchasePrice,
} from '@/lib/gfs/pricing';

function sortPricesDesc(prices?: any[] | null): any[] {
  if (!prices || prices.length === 0) return [];
  return [...prices].sort((a, b) => {
    const da = normalizeDateYmd(a.effectiveDate);
    const db = normalizeDateYmd(b.effectiveDate);
    if (da !== db) return db.localeCompare(da);
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
}

// GET /api/master/bom?productId=1 OR ?productCode=27000388710
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    const productCode = searchParams.get('productCode');

    const whereParent: any = {};
    if (productId) whereParent.id = Number(productId);
    if (productCode) whereParent.productCode = productCode;

    const bomHeaders = await prisma.bomHeader.findMany({
      where: {
        isUsed: true,
        ...(Object.keys(whereParent).length > 0 ? { parentProduct: whereParent } : {}),
      },
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

    const cleaned = bomHeaders.map((bh) => {
      const parentPrices = sortPricesDesc(bh.parentProduct?.prices);
      return {
        ...bh,
        parentProduct: bh.parentProduct
          ? {
              ...bh.parentProduct,
              prices: parentPrices,
              deliveryPrice: pickLatestValidDeliveryPrice(parentPrices),
              purchasePrice: pickLatestValidPurchasePrice(parentPrices),
            }
          : bh.parentProduct,
        details: (bh.details || [])
          .filter((d) => !isDummyBomDetail(d.unit, d.unitQty))
          .map((d) => {
            const cp = d.childProduct;
            const childPrices = sortPricesDesc(cp?.prices);
            const bagPrice = pickLatestValidPurchasePrice(childPrices);
            const packUnit = normalizePackUnit(cp?.boxQty);
            return {
              ...d,
              childProduct: cp
                ? {
                    ...cp,
                    prices: childPrices,
                    boxQty: packUnit,
                    bagPrice,
                    purchasePrice: bagPrice,
                    boxPrice: calcBoxPrice(bagPrice, packUnit),
                  }
                : cp,
            };
          }),
      };
    });

    return NextResponse.json({ success: true, data: cleaned });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch BOM' },
      { status: 500 }
    );
  }
}

// POST /api/master/bom (BOM 헤더 및 상세 저장 - 원자적 트랜잭션)
export async function POST(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'master', action: 'write' });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { parentProductId, version = '1.0', effectiveDate = '', details = [] } = body;

    if (!parentProductId) {
      return NextResponse.json(
        { success: false, error: 'parentProductId is required' },
        { status: 400 }
      );
    }

    const detailList = Array.isArray(details) ? details : [];
    const lookupCodes: string[] = [];
    const lookupNames: string[] = [];
    for (const d of detailList) {
      if (!Number(d.childProductId)) {
        const code = d.childProductCode || d.partCode || d.itemCode;
        const name = d.childProductName || d.partName || d.itemName;
        if (code) lookupCodes.push(String(code));
        if (name) lookupNames.push(String(name));
      }
    }

    const lookupProducts =
      lookupCodes.length > 0 || lookupNames.length > 0
        ? await prisma.product.findMany({
            where: {
              OR: [
                ...(lookupCodes.length > 0 ? [{ productCode: { in: lookupCodes } }] : []),
                ...(lookupNames.length > 0 ? [{ name: { in: lookupNames } }] : []),
              ],
            },
            select: { id: true, productCode: true, name: true },
          })
        : [];

    const byCode = new Map(lookupProducts.map((p) => [p.productCode, p.id]));
    const byName = new Map(lookupProducts.map((p) => [p.name, p.id]));

    const resolvedDetails: Array<{
      childProductId: number;
      level: number;
      unitQty: number;
      unit: string;
      yieldRate: number;
      gyeId: string | null;
      nextProcess: string;
      sortOrder: number;
      remark: string;
    }> = [];

    for (let i = 0; i < detailList.length; i++) {
      const d = detailList[i];
      let childId = Number(d.childProductId);
      if (!childId || isNaN(childId)) {
        const code = d.childProductCode || d.partCode || d.itemCode;
        const name = d.childProductName || d.partName || d.itemName;
        childId = (code ? byCode.get(String(code)) : undefined) || (name ? byName.get(String(name)) : undefined) || 0;
      }
      if (!childId) continue;

      resolvedDetails.push({
        childProductId: childId,
        level: d.level ? Number(d.level) : 3,
        unitQty: Number(d.unitQty || 0),
        unit: d.unit || '',
        yieldRate: Number(d.yieldRate || 100),
        gyeId: d.gyeId ? String(d.gyeId) : null,
        nextProcess: d.nextProcess || '',
        sortOrder: i + 1,
        remark: d.remark || '',
      });
    }

    const header = await prisma.$transaction(async (tx) => {
      let bomHeader = await tx.bomHeader.findFirst({
        where: { parentProductId: Number(parentProductId), version },
      });

      if (!bomHeader) {
        bomHeader = await tx.bomHeader.create({
          data: {
            parentProductId: Number(parentProductId),
            version,
            effectiveDate,
          },
        });
      }

      await tx.bomDetail.deleteMany({
        where: { bomHeaderId: bomHeader.id },
      });

      if (resolvedDetails.length > 0) {
        await tx.bomDetail.createMany({
          data: resolvedDetails.map((d) => ({
            bomHeaderId: bomHeader.id,
            ...d,
          })),
        });
      }

      return bomHeader;
    });

    return NextResponse.json({ success: true, message: 'BOM saved successfully', bomHeaderId: header.id });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save BOM' },
      { status: 500 }
    );
  }
}

// DELETE /api/master/bom?id=123 (BOM 헤더 및 상세 삭제)
export async function DELETE(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'master', action: 'delete' });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || searchParams.get('bomHeaderId');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'BOM 헤더 ID(id)가 필요합니다.' },
        { status: 400 }
      );
    }

    const bomHeaderId = Number(id);
    await prisma.$transaction([
      prisma.bomDetail.deleteMany({ where: { bomHeaderId } }),
      prisma.bomHeader.delete({ where: { id: bomHeaderId } }),
    ]);

    return NextResponse.json({ success: true, message: 'BOM이 성공적으로 삭제되었습니다.' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete BOM' },
      { status: 500 }
    );
  }
}


