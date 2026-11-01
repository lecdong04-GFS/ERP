import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const discardDate = searchParams.get('discardDate');
    const gyeId = searchParams.get('gyeId');

    const where: any = {};
    if (discardDate) where.discardDate = discardDate;
    if (gyeId && gyeId !== 'ALL') where.gyeId = gyeId;

    const list = await prisma.discardRecord.findMany({
      where,
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

    if (action === 'delete' && id) {
      await prisma.discardRecord.delete({ where: { id: Number(id) } });
      return NextResponse.json({ success: true, message: 'Deleted' });
    }

    const created = await prisma.discardRecord.create({
      data: {
        discardDate: data.discardDate || kstToday(),
        gyeId: data.gyeId || '',
        gyeName: data.gyeName || '',
        productCode: data.productCode || '',
        productName: data.productName || '',
        spec: data.spec || '',
        unit: data.unit || 'ea',
        discardQty: Number(data.discardQty) || 0,
        reason: data.reason || '폐기',
        lotNo: data.lotNo || '',
        expiryDate: data.expiryDate || '',
        remark: data.remark || '',
        createdBy: data.createdBy || '관리자',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}