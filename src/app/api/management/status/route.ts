import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    const salesPurchase = await prisma.salesPurchaseStatus.findMany({
      orderBy: { statusDate: 'desc' },
      take: 50,
    });
    const provisional = await prisma.provisionalSalesStatus.findMany({
      orderBy: { statusDate: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: {
        salesPurchase,
        provisional,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...data } = body;

    if (type === 'sales_purchase') {
      const sales = Number(data.salesAmount) || 0;
      const purchase = Number(data.purchaseAmount) || 0;
      const profit = sales - purchase;
      const profitRate = sales > 0 ? (profit / sales) * 100 : 0;

      const created = await prisma.salesPurchaseStatus.create({
        data: {
          statusDate: data.statusDate || kstToday(),
          statusMonth: data.statusMonth || new Date().toISOString().slice(0, 7),
          salesAmount: sales,
          purchaseAmount: purchase,
          grossProfit: profit,
          grossProfitRate: profitRate,
          remark: data.remark || '',
        },
      });
      return NextResponse.json({ success: true, data: created });
    }

    if (type === 'provisional') {
      const created = await prisma.provisionalSalesStatus.create({
        data: {
          statusDate: data.statusDate || kstToday(),
          provisionalSales: Number(data.provisionalSales) || 0,
          undeliveredAmount: Number(data.undeliveredAmount) || 0,
          confirmedAmount: Number(data.confirmedAmount) || 0,
          remark: data.remark || '',
        },
      });
      return NextResponse.json({ success: true, data: created });
    }

    return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}