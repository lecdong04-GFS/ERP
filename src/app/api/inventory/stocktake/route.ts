import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';
import { isExcludedOrderMaterial } from '@/lib/gfs/orderCalc';
import {
  calcBoxPrice,
  normalizePackUnit,
  pickLatestValidPurchasePrice,
  resolveBagPrice,
} from '@/lib/gfs/pricing';
import { requireSession } from '@/lib/apiAuth';

// GET /api/inventory/stocktake?warehouse=냉장1&category=원재료&stocktakeDate=2026-11-07&search=...
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const warehouse = searchParams.get('warehouse');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const stocktakeDate = searchParams.get('stocktakeDate') || kstToday();
    const diffFilter = searchParams.get('diffFilter') || 'ALL'; // ALL, DIFF, MATCH, SHORTAGE, SURPLUS

    const where: any = {
      product: {
        isUsed: true,
        category: { notIn: ['완성품', '반제품'] },
      },
    };
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

    // 1. 기준일자의 기존 실사 기록(StocktakeRecord) 조회
    const existingRecords = await prisma.stocktakeRecord.findMany({
      where: { stocktakeDate },
    });

    const recordMap = new Map<string, typeof existingRecords[0]>();
    existingRecords.forEach((rec) => {
      const key = `${rec.productCode}|${rec.warehouse}`;
      recordMap.set(key, rec);
    });

    // 2. 현재고(Inventory) 및 품목 마스터/거래처/단가 조회
    const rawInventories = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          include: {
            partner: true,
            prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
          },
        },
      },
      orderBy: [
        { warehouse: 'asc' },
        { productCode: 'asc' },
      ],
    });

    const inventories = rawInventories.filter(
      (inv) => inv.product && !isExcludedOrderMaterial(inv.product, stocktakeDate)
    );

    // 3. 실사 데이터 매핑 및 장부/실사/차이 계산
    const allRows = inventories.map((inv, idx) => {
      const boxUnit = normalizePackUnit(inv.product?.boxQty);
      const bagPrice = resolveBagPrice({
        masterBagPrice: pickLatestValidPurchasePrice(inv.product?.prices),
        invUnitPrice: inv.unitPrice,
      });
      const boxPrice = calcBoxPrice(bagPrice, boxUnit);
      const unitPrice = bagPrice;
      const rec = recordMap.get(`${inv.productCode}|${inv.warehouse}`);

      const bookQty = rec ? rec.bookQty : (inv.currentQty || 0);
      const actualQty = rec ? rec.actualQty : (inv.currentQty || 0);
      const diffQty = Math.round((actualQty - bookQty) * 100) / 100;

      const boxCount = boxUnit > 0 ? Math.floor(actualQty / boxUnit) : 0;
      const pieceCount = boxUnit > 0 ? Math.round((actualQty % boxUnit) * 10) / 10 : 0;

      const bookAmount = Math.round(bookQty * unitPrice);
      const actualAmount = Math.round(actualQty * unitPrice);
      const diffAmount = Math.round(diffQty * unitPrice);

      const status = rec ? (rec.status || '미확정') : '대기';
      const adjustReason = rec?.adjustReason || (diffQty !== 0 ? '실사 차이발생' : '정상');
      const expiryDate = rec?.expiryDate || inv.expiryDate || '';
      const lotNo = rec?.lotNo || inv.lotNo || (inv.productCode ? `LOT-${stocktakeDate.replace(/-/g, '')}-${inv.productCode}` : '');

      return {
        id: inv.id,
        recordId: rec?.id || null,
        no: idx + 1,
        warehouse: inv.warehouse || '기타',
        category: inv.category || inv.product?.category || '원재료',
        supplier: inv.product?.partner?.name || '기타협력사',
        supplierId: inv.product?.partnerId || '',
        itemCode: inv.productCode,
        itemName: inv.productName || inv.product?.name || '',
        spec: inv.product?.spec || '',
        unit: inv.unit || inv.product?.unit || '봉',
        leadTime: inv.product?.partner?.leadTime ? `D+${inv.product.partner.leadTime}` : 'D+2',
        expiryDate,
        lotNo,
        boxUnitQty: boxUnit,
        unitPrice,
        bagPrice,
        boxPrice,
        bookQty,
        boxQty: boxCount,
        pieceQty: pieceCount,
        currentStock: actualQty, // 실사재고
        actualQty,
        diffQty,
        bookAmount,
        actualAmount,
        diffAmount,
        amount: actualAmount, // 호환성 유지
        adjustReason,
        status,
        remark: rec?.remark || inv.remark || '',
      };
    });

    // 4. 차이 조건 필터링 (화면 요청시)
    let filteredRows = allRows;
    if (diffFilter === 'DIFF') {
      filteredRows = allRows.filter((r) => r.diffQty !== 0);
    } else if (diffFilter === 'MATCH') {
      filteredRows = allRows.filter((r) => r.diffQty === 0);
    } else if (diffFilter === 'SHORTAGE') {
      filteredRows = allRows.filter((r) => r.diffQty < 0);
    } else if (diffFilter === 'SURPLUS') {
      filteredRows = allRows.filter((r) => r.diffQty > 0);
    }

    // 5. 창고별 정밀 통계 산출
    const warehouseStats: Record<
      string,
      {
        count: number;
        bookAmount: number;
        actualAmount: number;
        diffAmount: number;
        bookQty: number;
        actualQty: number;
        diffQty: number;
        diffCount: number;
        matchCount: number;
        confirmedCount: number;
      }
    > = {
      '전체': {
        count: allRows.length,
        bookAmount: 0,
        actualAmount: 0,
        diffAmount: 0,
        bookQty: 0,
        actualQty: 0,
        diffQty: 0,
        diffCount: 0,
        matchCount: 0,
        confirmedCount: 0,
      },
      '냉장1': { count: 0, bookAmount: 0, actualAmount: 0, diffAmount: 0, bookQty: 0, actualQty: 0, diffQty: 0, diffCount: 0, matchCount: 0, confirmedCount: 0 },
      '냉장2': { count: 0, bookAmount: 0, actualAmount: 0, diffAmount: 0, bookQty: 0, actualQty: 0, diffQty: 0, diffCount: 0, matchCount: 0, confirmedCount: 0 },
      '냉동': { count: 0, bookAmount: 0, actualAmount: 0, diffAmount: 0, bookQty: 0, actualQty: 0, diffQty: 0, diffCount: 0, matchCount: 0, confirmedCount: 0 },
      '상온': { count: 0, bookAmount: 0, actualAmount: 0, diffAmount: 0, bookQty: 0, actualQty: 0, diffQty: 0, diffCount: 0, matchCount: 0, confirmedCount: 0 },
      '부자재': { count: 0, bookAmount: 0, actualAmount: 0, diffAmount: 0, bookQty: 0, actualQty: 0, diffQty: 0, diffCount: 0, matchCount: 0, confirmedCount: 0 },
    };

    allRows.forEach((r) => {
      const wh = r.warehouse;
      if (!warehouseStats[wh]) {
        warehouseStats[wh] = { count: 0, bookAmount: 0, actualAmount: 0, diffAmount: 0, bookQty: 0, actualQty: 0, diffQty: 0, diffCount: 0, matchCount: 0, confirmedCount: 0 };
      }
      // 창고별 누적
      warehouseStats[wh].count += 1;
      warehouseStats[wh].bookAmount += r.bookAmount;
      warehouseStats[wh].actualAmount += r.actualAmount;
      warehouseStats[wh].diffAmount += r.diffAmount;
      warehouseStats[wh].bookQty += r.bookQty;
      warehouseStats[wh].actualQty += r.actualQty;
      warehouseStats[wh].diffQty += r.diffQty;
      if (r.diffQty !== 0) warehouseStats[wh].diffCount += 1;
      else warehouseStats[wh].matchCount += 1;
      if (r.status === '확정') warehouseStats[wh].confirmedCount += 1;

      // 전체 누적
      warehouseStats['전체'].bookAmount += r.bookAmount;
      warehouseStats['전체'].actualAmount += r.actualAmount;
      warehouseStats['전체'].diffAmount += r.diffAmount;
      warehouseStats['전체'].bookQty += r.bookQty;
      warehouseStats['전체'].actualQty += r.actualQty;
      warehouseStats['전체'].diffQty += r.diffQty;
      if (r.diffQty !== 0) warehouseStats['전체'].diffCount += 1;
      else warehouseStats['전체'].matchCount += 1;
      if (r.status === '확정') warehouseStats['전체'].confirmedCount += 1;
    });

    const summary = {
      stocktakeDate,
      totalCount: allRows.length,
      filteredCount: filteredRows.length,
      totalBookAmount: warehouseStats['전체'].bookAmount,
      totalActualAmount: warehouseStats['전체'].actualAmount,
      totalDiffAmount: warehouseStats['전체'].diffAmount,
      totalBookQty: warehouseStats['전체'].bookQty,
      totalActualQty: warehouseStats['전체'].actualQty,
      totalDiffQty: warehouseStats['전체'].diffQty,
      diffCount: warehouseStats['전체'].diffCount,
      matchCount: warehouseStats['전체'].matchCount,
      confirmedCount: warehouseStats['전체'].confirmedCount,
      shortageCount: allRows.filter((r) => r.diffQty < 0).length,
      surplusCount: allRows.filter((r) => r.diffQty > 0).length,
    };

    return NextResponse.json({
      success: true,
      data: filteredRows,
      summary,
      warehouseStats,
      totalCount: filteredRows.length,
      totalStockAmount: summary.totalActualAmount,
      totalStockQty: summary.totalActualQty,
    });
  } catch (error: any) {
    console.error('Error fetching stocktake:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch stocktake' },
      { status: 500 }
    );
  }
}

// POST /api/inventory/stocktake (현장 실사 재고 일괄 반영 및 확정/임시저장 파이프라인)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'inventory', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const {
      stocktakeDate = kstToday(),
      mode = 'confirm', // 'confirm' (실사확정: Inventory와 동기화) | 'draft' (임시저장)
      rows = [],
      createdBy = auth.user.name || auth.user.loginId,
    } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '반영할 실사 품목(rows) 데이터가 없습니다.' },
        { status: 400 }
      );
    }

    const isConfirm = mode === 'confirm';

    // 트랜잭션으로 일괄 처리 (StocktakeRecord 업서트 + Inventory 현재고 동기화)
    const result = await prisma.$transaction(async (tx) => {
      let recordCount = 0;
      let invSyncCount = 0;

      for (const r of rows) {
        const boxUnit = Number(r.boxUnitQty || 1);
        const boxQty = Number(r.boxQty || 0);
        const pieceQty = Number(r.pieceQty || 0);

        // 실사수량: currentStock이 직접 주어지면 우선, 아니면 boxQty * boxUnit + pieceQty
        const actualQty = Number(
          r.currentStock !== undefined
            ? r.currentStock
            : boxQty * boxUnit + pieceQty
        );
        const bookQty = Number(r.bookQty !== undefined ? r.bookQty : actualQty);
        const diffQty = Math.round((actualQty - bookQty) * 100) / 100;
        const unitPrice = Number(r.unitPrice || 0);
        const amount = Math.round(actualQty * unitPrice);
        const itemCode = String(r.itemCode || '');
        const warehouse = String(r.warehouse || '');
        const expiryDate = r.expiryDate || '';
        const lotNo = r.lotNo || `LOT-${stocktakeDate.replace(/-/g, '')}-${itemCode}`;
        const adjustReason = r.adjustReason || (diffQty !== 0 ? (diffQty < 0 ? '자연감모/손실' : '재고잉여') : '정기실사일치');
        const status = isConfirm ? '확정' : '미확정';

        // 1. 기존 StocktakeRecord 조회 후 업서트
        const existingRecord = await tx.stocktakeRecord.findFirst({
          where: {
            stocktakeDate,
            productCode: itemCode,
            warehouse,
          },
        });

        if (existingRecord) {
          await tx.stocktakeRecord.update({
            where: { id: existingRecord.id },
            data: {
              productName: r.itemName || existingRecord.productName,
              lotNo,
              expiryDate,
              bookQty,
              actualQty,
              diffQty,
              unit: r.unit || '봉',
              adjustReason,
              status,
              remark: r.remark || existingRecord.remark,
              createdBy,
            },
          });
        } else {
          await tx.stocktakeRecord.create({
            data: {
              stocktakeDate,
              productCode: itemCode,
              productName: r.itemName || '',
              warehouse,
              lotNo,
              expiryDate,
              bookQty,
              actualQty,
              diffQty,
              unit: r.unit || '봉',
              adjustReason,
              status,
              remark: r.remark || '',
              createdBy,
            },
          });
        }
        recordCount++;

        // 2. 실사 확정 모드일 때만 현재고(Inventory) 테이블 동기화
        if (isConfirm) {
          if (r.id) {
            await tx.inventory.update({
              where: { id: Number(r.id) },
              data: {
                currentQty: actualQty,
                unitPrice,
                stockAmount: amount,
                expiryDate,
                lastInDate: stocktakeDate,
                remark: r.remark || undefined,
              },
            });
            invSyncCount++;
          } else if (itemCode && warehouse) {
            const inv = await tx.inventory.findFirst({
              where: { productCode: itemCode, warehouse },
            });
            if (inv) {
              await tx.inventory.update({
                where: { id: inv.id },
                data: {
                  currentQty: actualQty,
                  unitPrice,
                  stockAmount: amount,
                  expiryDate,
                  lastInDate: stocktakeDate,
                  remark: r.remark || undefined,
                },
              });
              invSyncCount++;
            }
          }
        }
      }

      return { recordCount, invSyncCount };
    }, { maxWait: 20000, timeout: 60000 });

    // ERP 대시보드 스냅샷 캐시 무효화 (KPI 즉각 반영)
    if (isConfirm) {
      await touchDashboardSnapshot();
    }

    return NextResponse.json({
      success: true,
      mode,
      recordCount: result.recordCount,
      invSyncCount: result.invSyncCount,
      message: isConfirm
        ? `${result.recordCount}개 품목의 재고실사가 성공적으로 확정되어 장부 재고(${result.invSyncCount}건)에 실시간 동기화되었습니다.`
        : `${result.recordCount}개 품목의 실사 데이터가 성공적으로 임시저장되었습니다.`,
    });
  } catch (error: any) {
    console.error('Error saving stocktake:', error);
    return NextResponse.json(
      { success: false, error: error.message || '실사 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE /api/inventory/stocktake?stocktakeDate=2026-11-07&warehouse=냉장1
// 실사 초기화 및 해당 일자 기록 삭제
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'inventory', action: 'delete' });
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const stocktakeDate = searchParams.get('stocktakeDate');
    const warehouse = searchParams.get('warehouse');

    if (!stocktakeDate) {
      return NextResponse.json(
        { success: false, error: 'stocktakeDate가 필요합니다.' },
        { status: 400 }
      );
    }

    const where: any = { stocktakeDate };
    if (warehouse && warehouse !== 'ALL') {
      where.warehouse = warehouse;
    }

    const deleted = await prisma.stocktakeRecord.deleteMany({
      where,
    });

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
      message: `${stocktakeDate} 일자의 ${deleted.count}개 실사 기록이 초기화되었습니다.`,
    });
  } catch (error: any) {
    console.error('Error resetting stocktake:', error);
    return NextResponse.json(
      { success: false, error: error.message || '실사 초기화 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
