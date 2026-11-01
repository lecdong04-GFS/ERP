import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const checkDate = searchParams.get('checkDate');
    const warehouse = searchParams.get('warehouse');

    const where: any = {};
    if (checkDate) where.checkDate = checkDate;
    if (warehouse && warehouse !== 'ALL') where.warehouse = warehouse;

    const list = await prisma.expiryDiscardMgmt.findMany({
      where,
      orderBy: { expiryDate: 'asc' },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, rows, ...data } = body;

    if (action === 'batch' && Array.isArray(rows)) {
      const createdList = [];
      for (const r of rows) {
        const item = await prisma.expiryDiscardMgmt.create({
          data: {
            checkDate: r.checkDate || kstToday(),
            productCode: r.productCode || '',
            productName: r.productName || '',
            lotNo: r.lotNo || '',
            expiryDate: r.expiryDate || '',
            daysRemaining: Number(r.daysRemaining) || 0,
            warehouse: r.warehouse || '',
            currentQty: Number(r.currentQty) || 0,
            unit: r.unit || 'ea',
            action: r.action || '폐기',
            status: r.status || '처리완료',
            remark: r.remark || '',
          },
        });
        createdList.push(item);
      }
      await touchDashboardSnapshot();
      return NextResponse.json({ success: true, count: createdList.length, data: createdList });
    }

    const created = await prisma.expiryDiscardMgmt.create({
      data: {
        checkDate: data.checkDate || kstToday(),
        productCode: data.productCode || '',
        productName: data.productName || '',
        lotNo: data.lotNo || '',
        expiryDate: data.expiryDate || '',
        daysRemaining: Number(data.daysRemaining) || 0,
        warehouse: data.warehouse || '',
        currentQty: Number(data.currentQty) || 0,
        unit: data.unit || 'ea',
        action: data.action || '폐기',
        status: data.status || '점검',
        remark: data.remark || '',
      },
    });
    await touchDashboardSnapshot();
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
