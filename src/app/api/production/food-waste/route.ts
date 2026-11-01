import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wasteDate = searchParams.get('wasteDate');
    const gyeId = searchParams.get('gyeId');

    const where: any = {};
    if (wasteDate) where.wasteDate = wasteDate;
    if (gyeId && gyeId !== 'ALL') where.gyeId = gyeId;

    const list = await prisma.foodWaste.findMany({
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
      await prisma.foodWaste.delete({ where: { id: Number(id) } });
      return NextResponse.json({ success: true, message: 'Deleted' });
    }

    const created = await prisma.foodWaste.create({
      data: {
        wasteDate: data.wasteDate || kstToday(),
        gyeId: data.gyeId || '',
        gyeName: data.gyeName || '',
        wasteType: data.wasteType || '잔반',
        wasteQty: Number(data.wasteQty) || 0,
        remark: data.remark || '',
        createdBy: data.createdBy || '관리자',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}