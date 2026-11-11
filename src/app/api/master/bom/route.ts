import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isDummyBomDetail, normalizeDateYmd } from '@/lib/gfs/bomMatch';

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

    const cleaned = bomHeaders.map((bh) => ({
      ...bh,
      parentProduct: bh.parentProduct
        ? {
            ...bh.parentProduct,
            prices: sortPricesDesc(bh.parentProduct.prices),
          }
        : bh.parentProduct,
      details: (bh.details || [])
        .filter((d) => !isDummyBomDetail(d.unit, d.unitQty))
        .map((d) => ({
          ...d,
          childProduct: d.childProduct
            ? {
                ...d.childProduct,
                prices: sortPricesDesc(d.childProduct.prices),
              }
            : d.childProduct,
        })),
    }));

    return NextResponse.json({ success: true, data: cleaned });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch BOM' },
      { status: 500 }
    );
  }
}

// POST /api/master/bom (BOM 헤더 및 상세 저장)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { parentProductId, version = '1.0', effectiveDate = '', details = [] } = body;

    if (!parentProductId) {
      return NextResponse.json(
        { success: false, error: 'parentProductId is required' },
        { status: 400 }
      );
    }

    // 헤더 조회 또는 생성
    let header = await prisma.bomHeader.findFirst({
      where: { parentProductId: Number(parentProductId), version },
    });

    if (!header) {
      header = await prisma.bomHeader.create({
        data: {
          parentProductId: Number(parentProductId),
          version,
          effectiveDate,
        },
      });
    }

    // 기존 상세 삭제 후 재등록
    await prisma.bomDetail.deleteMany({
      where: { bomHeaderId: header.id },
    });

    for (let i = 0; i < details.length; i++) {
      const d = details[i];
      let childId = Number(d.childProductId);
      if (!childId || isNaN(childId)) {
        const code = d.childProductCode || d.partCode || d.itemCode;
        const name = d.childProductName || d.partName || d.itemName;
        if (code || name) {
          const found = await prisma.product.findFirst({
            where: code ? { productCode: code } : { name },
            select: { id: true },
          });
          if (found) childId = found.id;
        }
      }
      if (!childId) continue;

      await prisma.bomDetail.create({
        data: {
          bomHeaderId: header.id,
          childProductId: childId,
          level: d.level ? Number(d.level) : 3,
          unitQty: Number(d.unitQty || 0),
          unit: d.unit || '',
          yieldRate: Number(d.yieldRate || 100),
          gyeId: d.gyeId ? String(d.gyeId) : null,
          nextProcess: d.nextProcess || '',
          sortOrder: i + 1,
          remark: d.remark || '',
        },
      });
    }

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
    await prisma.bomDetail.deleteMany({
      where: { bomHeaderId },
    });
    await prisma.bomHeader.delete({
      where: { id: bomHeaderId },
    });

    return NextResponse.json({ success: true, message: 'BOM이 성공적으로 삭제되었습니다.' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete BOM' },
      { status: 500 }
    );
  }
}


