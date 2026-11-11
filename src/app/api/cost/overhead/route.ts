import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

// GET /api/cost/overhead?month=2026-10
export async function GET(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'cost', action: 'read' });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || '2026-10';

    const fixed = await prisma.overheadFixed.findMany({
      where: { costMonth: month },
      orderBy: { id: 'asc' },
    });

    const variable = await prisma.overheadVariable.findMany({
      where: { costMonth: month },
      orderBy: { costDate: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        fixed,
        variable,
        totalFixed: fixed.reduce((acc, f) => acc + f.totalCost, 0),
        totalVariable: variable.reduce((acc, v) => acc + v.dailyCost, 0),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch overheads' },
      { status: 500 }
    );
  }
}

// POST /api/cost/overhead (간접비 저장)
export async function POST(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'cost', action: 'write' });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { costMonth = '2026-10', fixedCosts = [], variableCosts = [] } = body;

    // 고정비 업데이트
    for (const f of fixedCosts) {
      await prisma.overheadFixed.upsert({
        where: {
          costMonth_costItem: {
            costMonth,
            costItem: f.costItem,
          },
        },
        update: { totalCost: Number(f.totalCost || 0), remark: f.remark || '' },
        create: {
          costMonth,
          costItem: f.costItem,
          totalCost: Number(f.totalCost || 0),
          remark: f.remark || '',
        },
      });
    }

    return NextResponse.json({ success: true, message: '간접비가 성공적으로 저장되었습니다.' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save overheads' },
      { status: 500 }
    );
  }
}

