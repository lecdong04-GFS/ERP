import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
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
    const auth = await requireSession({ categoryId: 'production', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'delete' && id) {
      const seqId = Number(id);
      if (!Number.isInteger(seqId) || seqId <= 0) {
        return NextResponse.json({ success: false, error: '유효하지 않은 ID입니다.' }, { status: 400 });
      }
      if (auth.user.role !== '관리자' && auth.user.loginId !== 'admin') {
        const delAuth = await requireSession({ categoryId: 'production', action: 'delete' });
        if ('error' in delAuth) return delAuth.error;
      }
      await prisma.productionSeq.delete({ where: { id: seqId } });
      return NextResponse.json({ success: true, message: 'Deleted' });
    }
    if (action === 'update' && id) {
      const seqId = Number(id);
      if (!Number.isInteger(seqId) || seqId <= 0) {
        return NextResponse.json({ success: false, error: '유효하지 않은 ID입니다.' }, { status: 400 });
      }
      const updatePayload: Record<string, any> = {};
      if (data.seqDate !== undefined) updatePayload.seqDate = String(data.seqDate);
      if (data.shift !== undefined) updatePayload.shift = String(data.shift);
      if (data.gyeId !== undefined) updatePayload.gyeId = String(data.gyeId);
      if (data.gyeName !== undefined) updatePayload.gyeName = String(data.gyeName);
      if (data.productCode !== undefined) updatePayload.productCode = String(data.productCode);
      if (data.productName !== undefined) updatePayload.productName = String(data.productName);
      if (data.processOrder !== undefined) updatePayload.processOrder = Number(data.processOrder) || 1;
      if (data.nextProcess !== undefined) updatePayload.nextProcess = String(data.nextProcess);
      if (data.remark !== undefined) updatePayload.remark = String(data.remark);

      const updated = await prisma.productionSeq.update({
        where: { id: seqId },
        data: updatePayload,
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