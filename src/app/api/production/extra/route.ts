import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const prodDate = searchParams.get('prodDate');
    const gyeId = searchParams.get('gyeId');

    const where: any = {};
    if (prodDate) where.prodDate = prodDate;
    if (gyeId && gyeId !== 'ALL') where.gyeId = gyeId;

    const list = await prisma.extraProduction.findMany({
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
    const { action, id, status, ...data } = body;

    if (action === 'update_status' && id) {
      const updated = await prisma.extraProduction.update({
        where: { id: Number(id) },
        data: { status },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    const created = await prisma.extraProduction.create({
      data: {
        prodDate: data.prodDate || kstToday(),
        shift: data.shift || '1편',
        gyeId: data.gyeId || '',
        gyeName: data.gyeName || '',
        productCode: data.productCode || '',
        productName: data.productName || '',
        spec: data.spec || '',
        extraQty: Number(data.extraQty) || 0,
        reason: data.reason || '',
        status: status || '등록',
        remark: data.remark || '',
        createdBy: data.createdBy || '관리자',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}