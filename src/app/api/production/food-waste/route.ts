import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
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
    const auth = await requireSession({ categoryId: 'production', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'delete' && id) {
      if (auth.user.role !== '관리자' && auth.user.loginId !== 'admin') {
        const delAuth = await requireSession({ categoryId: 'production', action: 'delete' });
        if ('error' in delAuth) return delAuth.error;
      }
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
        createdBy: data.createdBy || auth.user.name || auth.user.loginId,
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}