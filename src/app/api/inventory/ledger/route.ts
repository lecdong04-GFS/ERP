import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ledgerDate = searchParams.get('ledgerDate');
    const productId = searchParams.get('productId');
    const txnType = searchParams.get('txnType');

    const where: any = {};
    if (ledgerDate) where.ledgerDate = ledgerDate;
    if (productId) where.productId = Number(productId);
    if (txnType && txnType !== 'ALL') where.txnType = txnType;

    const list = await prisma.materialLedger.findMany({
      where,
      include: { product: true },
      orderBy: { id: 'desc' },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    const created = await prisma.materialLedger.create({
      data: {
        ledgerDate: data.ledgerDate || kstToday(),
        productId: Number(data.productId) || 1,
        productCode: data.productCode || '',
        productName: data.productName || '',
        category: data.category || '원재료',
        unit: data.unit || 'kg',
        carryOverQty: Number(data.carryOverQty) || 0,
        inQty: Number(data.inQty) || 0,
        outQty: Number(data.outQty) || 0,
        adjustQty: Number(data.adjustQty) || 0,
        currentQty: Number(data.currentQty) || 0,
        unitPrice: Number(data.unitPrice) || 0,
        stockAmount: Number(data.stockAmount) || 0,
        txnType: data.txnType || '기타',
        refNo: data.refNo || '',
        remark: data.remark || '',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}