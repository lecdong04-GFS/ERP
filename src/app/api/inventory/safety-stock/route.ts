import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const list = await prisma.safetyStock.findMany({
      include: { product: { include: { partner: true } } },
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
    const { rows } = body;

    if (Array.isArray(rows)) {
      const results = [];
      for (const r of rows) {
        if (!r.productId) continue;
        const upserted = await prisma.safetyStock.upsert({
          where: { id: r.id || 0 },
          update: {
            safetyQty: Number(r.safetyQty) || 0,
            avgDailyUsage: Number(r.avgDailyUsage) || 0,
            leadTime: Number(r.leadTime) || 1,
            remark: r.remark || '',
          },
          create: {
            productId: Number(r.productId),
            productCode: r.productCode || '',
            productName: r.productName || '',
            category: r.category || '원재료',
            unit: r.unit || 'kg',
            safetyQty: Number(r.safetyQty) || 0,
            currentQty: Number(r.currentQty) || 0,
            shortageQty: Number(r.shortageQty) || 0,
            avgDailyUsage: Number(r.avgDailyUsage) || 0,
            leadTime: Number(r.leadTime) || 1,
            remark: r.remark || '',
          },
        });
        results.push(upserted);
      }
      return NextResponse.json({ success: true, data: results });
    }

    return NextResponse.json({ success: false, error: 'Rows array required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
