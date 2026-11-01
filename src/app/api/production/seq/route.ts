import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seqDate = searchParams.get('seqDate');
    const gyeId = searchParams.get('gyeId');

    const where: any = {};
    if (seqDate) where.seqDate = seqDate;
    if (gyeId && gyeId !== 'ALL') where.gyeId = gyeId;

    const list = await prisma.productionSeq.findMany({
      where,
      orderBy: { processOrder: 'asc' },
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
      await prisma.productionSeq.delete({ where: { id: Number(id) } });
      return NextResponse.json({ success: true, message: 'Deleted' });
    }
    if (action === 'update' && id) {
      const updated = await prisma.productionSeq.update({
        where: { id: Number(id) },
        data,
      });
      return NextResponse.json({ success: true, data: updated });
    }
    const created = await prisma.productionSeq.create({
      data: {
        seqDate: data.seqDate || kstToday(),
        shift: data.shift || '1편',
        gyeId: data.gyeId || '',
        gyeName: data.gyeName || '',
        productCode: data.productCode || '',
        productName: data.productName || '',
        processOrder: Number(data.processOrder) || 1,
        nextProcess: data.nextProcess || '',
        remark: data.remark || '',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}