import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';

// GET /api/sales/order?orderDate=2026-10-30&shift=1편
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderDate = searchParams.get('orderDate');
    const shift = searchParams.get('shift');
    const status = searchParams.get('status');

    const where: any = {};
    if (orderDate) where.orderDate = orderDate;
    if (shift) where.shift = shift;
    if (status) where.status = status;

    const orders = await prisma.salesOrder.findMany({
      where,
      include: {
        details: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: orders });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch sales orders' },
      { status: 500 }
    );
  }
}

// POST /api/sales/order (주문 등록)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      orderDate,
      centerCode = 'GSR-001',
      shift = '1편',
      orderType = '정규',
      uploadMethod = '수기',
      items = [], // [{ productCode, orderQty1, orderQty2, unitPrice }]
      createdBy = 'admin',
    } = body;

    if (!orderDate || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'orderDate and items are required' },
        { status: 400 }
      );
    }

    const orderNo = makeDocNo('SO', orderDate);

    let totalAmount = 0;
    let totalQty = 0;

    // 상세 데이터 준비
    const detailRecords = [];
    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { productCode: item.productCode },
      });
      if (!product) continue;

      const qty1 = Number(item.orderQty1 || 0);
      const qty2 = Number(item.orderQty2 || 0);
      const sumQty = qty1 + qty2;
      const price = Number(item.unitPrice || 0);
      const amount = sumQty * price;

      totalAmount += amount;
      totalQty += sumQty;

      detailRecords.push({
        productId: product.id,
        orderQty1: qty1,
        orderQty2: qty2,
        totalQty: sumQty,
        unitPrice: price,
        amount,
      });
    }

    const order = await prisma.salesOrder.create({
      data: {
        orderNo,
        orderDate,
        centerCode,
        shift,
        orderType,
        uploadMethod,
        status: '접수',
        totalAmount,
        totalQty,
        createdBy,
        details: {
          create: detailRecords,
        },
      },
      include: {
        details: true,
      },
    });

    return NextResponse.json({ success: true, data: order });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create sales order' },
      { status: 500 }
    );
  }
}
