import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const list = await prisma.reprProduct.findMany({
      where: { isUsed: true },
      include: {
        orderProduct: true,
        reprProduct: true,
      },
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
    const { rows, ...single } = body;

    if (Array.isArray(rows)) {
      const results = [];
      for (const r of rows) {
        if (!r.orderProductId || !r.reprProductId) continue;
        const item = await prisma.reprProduct.create({
          data: {
            orderProductId: Number(r.orderProductId),
            reprProductId: Number(r.reprProductId),
            effectiveDate: r.effectiveDate || '',
            expiryDate: r.expiryDate || '',
            remark: r.remark || '',
          },
        });
        results.push(item);
      }
      return NextResponse.json({ success: true, count: results.length, data: results });
    }

    const created = await prisma.reprProduct.create({
      data: {
        orderProductId: Number(single.orderProductId),
        reprProductId: Number(single.reprProductId),
        effectiveDate: single.effectiveDate || '',
        expiryDate: single.expiryDate || '',
        remark: single.remark || '',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
