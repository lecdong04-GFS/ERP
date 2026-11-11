import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

// GET /api/production/input-result?resultDate=2026-10-30&gyeId=GFS046
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const resultDate = searchParams.get('resultDate');
    const gyeId = searchParams.get('gyeId');

    const where: any = {};
    if (resultDate) where.resultDate = resultDate;
    if (gyeId && gyeId !== 'ALL') where.gyeId = gyeId;

    const results = await prisma.productionResult.findMany({
      where,
      include: {
        product: true,
        workOrder: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch production results' },
      { status: 500 }
    );
  }
}

// POST /api/production/input-result (실적 등록 및 작업지시 업데이트)
export async function POST(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'production', action: 'write' });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { resultDate, items = [] } = body;
    const createdBy = body.createdBy || auth.user.name || auth.user.loginId;

    if (!resultDate || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'resultDate and items are required' },
        { status: 400 }
      );
    }

    const savedRecords = [];
    for (const item of items) {
      let product = await prisma.product.findFirst({
        where: {
          OR: [{ productCode: item.itemCode }, { name: item.itemName }],
        },
      });

      if (!product) {
        product = await prisma.product.create({
          data: {
            productCode: item.itemCode || `P-${Date.now().toString().slice(-6)}`,
            name: item.itemName,
            spec: item.spec || '',
            unit: item.unit || 'ea',
            category: item.category || '반제품',
          },
        });
      }

      const orderQty = Number(item.totalOrder || item.orderQty || 0);
      const prodQty = Number(item.totalProd || item.prodQty || 0);
      const yieldRate = orderQty > 0 ? (prodQty / orderQty) * 100 : 100;

      const res = await prisma.productionResult.create({
        data: {
          resultDate,
          shift: '1편',
          gyeId: item.gyeId || 'GFS046',
          gyeName: item.gyeName || '',
          productId: product.id,
          productCode: product.productCode,
          productName: item.itemName,
          orderQty,
          prodQty,
          defectQty: Math.max(0, orderQty - prodQty),
          yieldRate,
          remark: item.remark || '',
          createdBy,
        },
      });
      savedRecords.push(res);
    }

    return NextResponse.json({
      success: true,
      message: `${savedRecords.length}건의 투입실적이 데이터베이스에 정상 등록되었습니다.`,
      data: savedRecords,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to register production results' },
      { status: 500 }
    );
  }
}

