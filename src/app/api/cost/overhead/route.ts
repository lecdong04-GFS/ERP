import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

// GET /api/cost/overhead?month=2026-10
export async function GET(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'cost', action: 'read' });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || searchParams.get('yearMonth') || '2026-10';

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
    const { costMonth = '2026-10', fixedCosts = [], variableCosts } = body;

    await prisma.$transaction(
      async (tx) => {
        // 고정비 업데이트
        for (const f of fixedCosts) {
          await tx.overheadFixed.upsert({
            where: {
              costMonth_costItem: {
                costMonth,
                costItem: String(f.costItem || '경비'),
              },
            },
            update: { totalCost: Number(f.totalCost || 0), remark: String(f.remark || '') },
            create: {
              costMonth,
              costItem: String(f.costItem || '경비'),
              totalCost: Number(f.totalCost || 0),
              remark: String(f.remark || ''),
            },
          });
        }

        // 변동비 일별 내역 업데이트 (전달된 경우 해당 월 내역 재기록)
        if (Array.isArray(variableCosts)) {
          await tx.overheadVariable.deleteMany({ where: { costMonth } });
          const varRows = variableCosts
            .filter((v: any) => v && v.costItem && v.costDate && Number(v.dailyCost) !== 0)
            .map((v: any) => ({
              costMonth,
              costItem: String(v.costItem),
              costDate: String(v.costDate),
              dailyCost: Number(v.dailyCost || 0),
              remark: String(v.remark || ''),
            }));
          if (varRows.length > 0) {
            await tx.overheadVariable.createMany({ data: varRows });
          }
        }
      },
      { maxWait: 20000, timeout: 60000 }
    );

    return NextResponse.json({ success: true, message: '간접비가 성공적으로 저장되었습니다.' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save overheads' },
      { status: 500 }
    );
  }
}

