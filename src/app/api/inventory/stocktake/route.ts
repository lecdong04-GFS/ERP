import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

// GET /api/inventory/stocktake?warehouse=냉장창고1&category=원재료
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouse = searchParams.get('warehouse');
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    const where: any = {};
    if (warehouse && warehouse !== 'ALL') {
      where.warehouse = warehouse;
    }
    if (category && category !== 'ALL') {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { productCode: { contains: search } },
        { productName: { contains: search } },
        { product: { partner: { name: { contains: search } } } },
      ];
    }

    // 10월 29일 새 양식 기준 실데이터 조회
    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          include: {
            partner: true,
            prices: { orderBy: { effectiveDate: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: [
        { warehouse: 'asc' },
        { productCode: 'asc' },
      ],
    });

    const rows = inventories.map((inv, idx) => {
      const boxUnit = inv.product?.boxQty || 1;
      const currentQty = inv.currentQty || 0;
      const boxCount = boxUnit > 0 ? Math.floor(currentQty / boxUnit) : 0;
      const pieceCount = boxUnit > 0 ? Math.round((currentQty % boxUnit) * 10) / 10 : 0;
      const unitPrice = inv.unitPrice || inv.product?.prices[0]?.purchasePrice || 0;
      const stockAmount = inv.stockAmount || (currentQty * unitPrice);

      return {
        id: inv.id,
        no: idx + 1,
        sheet: inv.warehouse,
        warehouse: inv.warehouse,
        category: inv.category || inv.product?.category || '원재료',
        supplier: inv.product?.partner?.name || '기타협력사',
        itemCode: inv.productCode,
        itemName: inv.productName || inv.product?.name || '',
        leadTime: inv.product?.partner?.leadTime ? `D+${inv.product.partner.leadTime}` : 'D+2',
        dailyUsageBox: 0,
        expiryDate: inv.expiryDate || '2026-11-30',
        boxQty: boxCount,
        pieceQty: pieceCount,
        currentStock: currentQty,
        boxUnitQty: boxUnit,
        unitPrice,
        amount: stockAmount,
        remark: inv.remark || '',
      };
    });

    // 창고별 요약 통계
    const warehouseStats: Record<string, { count: number; totalAmount: number; totalQty: number }> = {};
    for (const r of rows) {
      const wh = r.warehouse || '기타';
      if (!warehouseStats[wh]) {
        warehouseStats[wh] = { count: 0, totalAmount: 0, totalQty: 0 };
      }
      warehouseStats[wh].count += 1;
      warehouseStats[wh].totalAmount += r.amount;
      warehouseStats[wh].totalQty += r.currentStock;
    }

    return NextResponse.json({
      success: true,
      data: rows,
      totalCount: rows.length,
      totalStockAmount: rows.reduce((acc, r) => acc + r.amount, 0),
      totalStockQty: rows.reduce((acc, r) => acc + r.currentStock, 0),
      warehouseStats,
    });
  } catch (error: any) {
    console.error('Error fetching stocktake:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch stocktake' },
      { status: 500 }
    );
  }
}

// POST /api/inventory/stocktake (현장 실사 재고 일괄 반영)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stocktakeDate = kstToday(), rows = [], createdBy = 'admin' } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'rows array is required' },
        { status: 400 }
      );
    }

    // 트랜잭션으로 실사 기록 생성 및 현재고(Inventory) 동기화
    const updated = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const r of rows) {
        const actualQty = Number(r.currentStock || (Number(r.boxQty || 0) * Number(r.boxUnitQty || 1) + Number(r.pieceQty || 0)));
        const unitPrice = Number(r.unitPrice || 0);
        const amount = actualQty * unitPrice;

        // 1. 재고 실사 기록 생성
        await tx.stocktakeRecord.create({
          data: {
            stocktakeDate,
            productCode: r.itemCode || '',
            productName: r.itemName || '',
            warehouse: r.warehouse || '',
            lotNo: `LOT-${stocktakeDate.replace(/-/g, '')}-${r.itemCode || ''}`,
            expiryDate: r.expiryDate || '2026-11-30',
            bookQty: Number(r.bookQty || actualQty),
            actualQty,
            diffQty: actualQty - Number(r.bookQty || actualQty),
            unit: '봉',
            adjustReason: '일일 재고조사표 실사 반영',
            status: '확정',
            remark: r.remark || '',
            createdBy,
          },
        });

        // 2. 현재고 테이블 동기화
        if (r.id) {
          await tx.inventory.update({
            where: { id: Number(r.id) },
            data: {
              currentQty: actualQty,
              unitPrice,
              stockAmount: amount,
              lastInDate: stocktakeDate,
            },
          });
          count++;
        }
      }
      return count;
    });

    await touchDashboardSnapshot();
    return NextResponse.json({
      success: true,
      message: `${updated}개 품목의 일일 재고실사가 성공적으로 반영되었습니다.`,
    });
  } catch (error: any) {
    console.error('Error saving stocktake:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save stocktake' },
      { status: 500 }
    );
  }
}
