import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/master/bom?productId=1 OR ?productCode=27000388710
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    const productCode = searchParams.get('productCode');

    let whereParent: any = {};
    if (productId) whereParent.id = Number(productId);
    if (productCode) whereParent.productCode = productCode;

    const bomHeaders = await prisma.bomHeader.findMany({
      where: Object.keys(whereParent).length > 0 ? { parentProduct: whereParent } : {},
      include: {
        parentProduct: true,
        details: {
          include: {
            childProduct: {
              include: {
                prices: { orderBy: { effectiveDate: 'desc' }, take: 1 },
                partner: true,
              },
            },
            gye: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return NextResponse.json({ success: true, data: bomHeaders });
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

