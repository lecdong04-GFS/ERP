import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'cost', action: 'read' });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const pnlMonth = searchParams.get('pnlMonth') || '2026-10';

    const list = await prisma.monthlyPnL.findMany({
      where: { pnlMonth },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'cost', action: 'write' });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { rows } = body;

    if (Array.isArray(rows)) {
      const results = await prisma.$transaction(async (tx) => {
        const list = [];
        for (const r of rows) {
          if (!r.costItem) continue;
          const upserted = await tx.monthlyPnL.upsert({
            where: {
              pnlMonth_costItem: {
                pnlMonth: r.pnlMonth || '2026-10',
                costItem: r.costItem,
              },
            },
            update: {
              costToSalesRatio: r.costToSalesRatio || '',
              totalAmount: Number(r.totalAmount) || 0,
              remark: r.remark || '',
            },
            create: {
              pnlMonth: r.pnlMonth || '2026-10',
              costItem: r.costItem,
              costToSalesRatio: r.costToSalesRatio || '',
              totalAmount: Number(r.totalAmount) || 0,
              remark: r.remark || '',
            },
          });
          list.push(upserted);
        }
        return list;
      });
      return NextResponse.json({ success: true, data: results });
    }

    return NextResponse.json({ success: false, error: 'Rows array required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
