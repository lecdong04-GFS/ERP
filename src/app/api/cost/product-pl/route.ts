import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'cost', action: 'read' });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const pnlMonth = searchParams.get('pnlMonth') || '2026-10';

    const list = await prisma.productPnL.findMany({
      where: { pnlMonth },
      include: { product: true },
      orderBy: { salesAmount: 'desc' },
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
          if (!r.productId) continue;
          const upserted = await tx.productPnL.upsert({
            where: {
              pnlMonth_productId: {
                pnlMonth: r.pnlMonth || '2026-10',
                productId: Number(r.productId),
              },
            },
            update: {
              salesAmount: Number(r.salesAmount) || 0,
              salesRatio: Number(r.salesRatio) || 0,
              indirectCostAlloc: Number(r.indirectCostAlloc) || 0,
              logisticsRate: Number(r.logisticsRate) || 0,
              logisticsCost: Number(r.logisticsCost) || 0,
              directMaterialTotal: Number(r.directMaterialTotal) || 0,
              productionQty: Number(r.productionQty) || 0,
              directMaterialCost: Number(r.directMaterialCost) || 0,
              totalCost: Number(r.totalCost) || 0,
              salesProfit: Number(r.salesProfit) || 0,
              profitRate: Number(r.profitRate) || 0,
              costRatio: Number(r.costRatio) || 0,
              salesQty: Number(r.salesQty) || 0,
              unitPrice: Number(r.unitPrice) || 0,
              unitCost: Number(r.unitCost) || 0,
              unitProfit: Number(r.unitProfit) || 0,
              remark: r.remark || '',
            },
            create: {
              pnlMonth: r.pnlMonth || '2026-10',
              productId: Number(r.productId),
              productName: r.productName || '',
              salesAmount: Number(r.salesAmount) || 0,
              salesRatio: Number(r.salesRatio) || 0,
              indirectCostAlloc: Number(r.indirectCostAlloc) || 0,
              logisticsRate: Number(r.logisticsRate) || 0,
              logisticsCost: Number(r.logisticsCost) || 0,
              directMaterialTotal: Number(r.directMaterialTotal) || 0,
              productionQty: Number(r.productionQty) || 0,
              directMaterialCost: Number(r.directMaterialCost) || 0,
              totalCost: Number(r.totalCost) || 0,
              salesProfit: Number(r.salesProfit) || 0,
              profitRate: Number(r.profitRate) || 0,
              costRatio: Number(r.costRatio) || 0,
              salesQty: Number(r.salesQty) || 0,
              unitPrice: Number(r.unitPrice) || 0,
              unitCost: Number(r.unitCost) || 0,
              unitProfit: Number(r.unitProfit) || 0,
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
