import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';

// GET /api/sales/delivery?deliveryDate=2026-10-30
// GET /api/sales/delivery?startDate=2026-10-01&endDate=2026-10-31 (기간 조회)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deliveryDate = searchParams.get('deliveryDate');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');

    const where: any = {};
    if (deliveryDate) {
      where.deliveryDate = deliveryDate;
    } else if (startDate || endDate) {
      where.deliveryDate = {};
      if (startDate) where.deliveryDate.gte = startDate;
      if (endDate) where.deliveryDate.lte = endDate;
    }
    if (status && status !== '전체') where.status = status;

    const deliveries = await prisma.delivery.findMany({
      where,
      include: {
        salesOrder: true,
        details: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: deliveries });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch deliveries' },
      { status: 500 }
    );
  }
}

// POST /api/sales/delivery (납품 등록 및 확정)
// body: { deliveryDate, centerCode?, shift?, salesOrderId?, items: [{productCode?, productName?, deliveryQty, unitPrice?, boxQty?, remark?}], createdBy? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deliveryDate, centerCode, shift, salesOrderId, items = [], createdBy = 'admin' } = body;

    if (!deliveryDate || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'deliveryDate and items are required' },
        { status: 400 }
      );
    }

    const deliveryNo = makeDocNo('DELIV', deliveryDate);
    let totalAmount = 0;
    let totalQty = 0;

    const detailRecords = [];
    for (const item of items) {
      const qty = Number(item.delivQty || item.deliveryQty || 0);
      const price = Number(item.unitPrice || 0);
      const amount = qty * price;
      totalAmount += amount;
      totalQty += qty;

      detailRecords.push({
        productCode: item.productCode || item.partNo || '',
        productName: item.productName || item.partName || '',
        deliveryQty: qty,
        unitPrice: price,
        amount,
        boxQty: Number(item.boxQty || 0),
        remark: item.remark || '',
      });
    }

    const delivery = await prisma.delivery.create({
      data: {
        deliveryNo,
        deliveryDate,
        salesOrderId: Number(salesOrderId) > 0 ? Number(salesOrderId) : null,
        centerCode: centerCode || 'GSR-001',
        shift: shift || '1편',
        status: '완료',
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

    return NextResponse.json({
      success: true,
      message: '납품 내역이 성공적으로 등록되었습니다.',
      data: delivery,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save delivery' },
      { status: 500 }
    );
  }
}
