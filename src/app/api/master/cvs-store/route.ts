import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const region = searchParams.get('region');

    const where: any = {};
    if (search) {
      where.OR = [
        { storeCode: { contains: search } },
        { storeName: { contains: search } },
      ];
    }
    if (region && region !== 'ALL') where.region = region;

    const list = await prisma.cvsStore.findMany({
      where,
      take: 200,
      orderBy: { id: 'asc' },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'master', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const { rows, ...single } = body;

    if (Array.isArray(rows)) {
      const results = [];
      for (const r of rows) {
        if (!r.storeCode) continue;
        const upserted = await prisma.cvsStore.upsert({
          where: { storeCode: r.storeCode },
          update: {
            storeName: r.storeName || '',
            centerCode: r.centerCode || '',
            region: r.region || '',
            address: r.address || '',
            tel: r.tel || '',
            status: r.status || '영업중',
          },
          create: {
            storeCode: r.storeCode,
            storeName: r.storeName || '',
            centerCode: r.centerCode || '',
            region: r.region || '',
            address: r.address || '',
            tel: r.tel || '',
            status: r.status || '영업중',
          },
        });
        results.push(upserted);
      }
      return NextResponse.json({ success: true, count: results.length, data: results });
    }

    const created = await prisma.cvsStore.create({
      data: {
        storeCode: single.storeCode,
        storeName: single.storeName,
        centerCode: single.centerCode || '',
        region: single.region || '',
        address: single.address || '',
        tel: single.tel || '',
        status: single.status || '영업중',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
