import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';

// GET /api/sales/order?orderDate=2026-10-30&shift=1편
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderDate = searchParams.get('orderDate');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const shift = searchParams.get('shift');
    const status = searchParams.get('status');

    const where: any = {};
    if (orderDate) {
      where.orderDate = orderDate;
    } else if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) where.orderDate.gte = startDate;
      if (endDate) where.orderDate.lte = endDate;
    }
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

// DELETE /api/sales/order?date=YYYY-MM-DD — 해당 날짜 수주 완전 삭제
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const date = req.nextUrl.searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: 'date 파라미터가 필요합니다. (YYYY-MM-DD)' }, { status: 400 });
    }

    const existing = await prisma.salesOrder.findMany({
      where: { orderDate: date },
      select: { id: true, orderNo: true, totalAmount: true, _count: { select: { details: true } } },
    });

    if (existing.length === 0) {
      return NextResponse.json({ success: false, error: `${date}에 등록된 수주가 없습니다.` }, { status: 404 });
    }

    const totalQty = existing.reduce((s, o) => s + (o._count.details || 0), 0);
    const totalAmount = existing.reduce((s, o) => s + (o.totalAmount || 0), 0);

    const deleted = await prisma.salesOrder.deleteMany({ where: { orderDate: date } });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '수주일자삭제',
          menuId: 'sales-order-upload',
          menuName: '주문등록GSR(upload)',
          detail: `${me.name || me.loginId} ${date} 수주 삭제: ${existing.length}건 (품목 ${totalQty}건, ₩${totalAmount.toLocaleString()})`,
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      deleted: deleted.count,
      details: {
        orderCount: existing.length,
        itemCount: totalQty,
        totalAmount,
        orderNos: existing.map((o) => o.orderNo),
      },
    });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return NextResponse.json(
        { success: false, error: '납품/출하 데이터가 연결되어 있어 삭제할 수 없습니다. 먼저 납품 데이터를 삭제하세요.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || '수주 삭제 실패' },
      { status: 500 }
    );
  }
}
