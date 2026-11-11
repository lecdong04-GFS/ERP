import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const kpiMonth = searchParams.get('kpiMonth') || '2026-10';

    const list = await prisma.kpiRecord.findMany({
      where: { kpiMonth },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'management', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const { rows } = body;

    if (Array.isArray(rows)) {
      const results = [];
      for (const r of rows) {
        if (!r.kpiItem) continue;
        const target = Number(r.targetValue) || 0;
        const actual = Number(r.actualValue) || 0;
        const achieveRate = target > 0 ? (actual / target) * 100 : 0;

        const upserted = await prisma.kpiRecord.upsert({
          where: {
            kpiMonth_kpiItem: {
              kpiMonth: r.kpiMonth || '2026-10',
              kpiItem: r.kpiItem,
            },
          },
          update: {
            targetValue: target,
            actualValue: actual,
            achieveRate,
            unit: r.unit || '',
            remark: r.remark || '',
          },
          create: {
            kpiMonth: r.kpiMonth || '2026-10',
            kpiItem: r.kpiItem,
            targetValue: target,
            actualValue: actual,
            achieveRate,
            unit: r.unit || '',
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
