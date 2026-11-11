import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';
import { kstToday } from '@/lib/kst';
import { isExcludedOrderMaterial } from '@/lib/gfs/orderCalc';
import { getLiveBomUsageMap } from '@/lib/gfs/liveUsage';
import {
  calcBoxPrice,
  normalizePackUnit,
  pickLatestValidPurchasePrice,
  resolveBagPrice,
} from '@/lib/gfs/pricing';

// GET /api/inventory/safety-stock?warehouse=냉장1&statusFilter=CRITICAL&search=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouse = searchParams.get('warehouse');
    const category = searchParams.get('category');
    const supplier = searchParams.get('supplier');
    const statusFilter = searchParams.get('statusFilter') || 'ALL'; // ALL, CRITICAL, WARNING, OPTIMAL, EXCESS
    const search = searchParams.get('search');
    const today = kstToday();

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

    // 활성 원부재료 인벤토리, 최신 수주 기반 BOM live 일사용량 병렬 조회
    const [rawInventories, liveBomUsage] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: {
          product: {
            include: {
              partner: true,
              prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
            },
          },
        },
        orderBy: [{ warehouse: 'asc' }, { productCode: 'asc' }],
      }),
      getLiveBomUsageMap().catch(() => null),
    ]);

    const inventories = rawInventories.filter(
      (inv) => inv.product && !isExcludedOrderMaterial(inv.product, today)
    );

    const allRows = inventories.map((inv, idx) => {
      const p = inv.product;
      const partnerName = p?.partner?.name || '기타협력사';
      const partnerLead = p?.partner?.leadTime && p.partner.leadTime > 0 ? p.partner.leadTime : 1;
      const leadTime = Number(p?.targetOrderDays) > 0 ? Number(p.targetOrderDays) : partnerLead;
      const boxUnit = normalizePackUnit(p?.boxQty);
      const bagPrice = resolveBagPrice({
        masterBagPrice: pickLatestValidPurchasePrice(p?.prices),
        invUnitPrice: inv.unitPrice,
      });
      const boxPrice = calcBoxPrice(bagPrice, boxUnit);
      const unitPrice = bagPrice;
      const masterDailyUsage = Number(inv.dailyUsage) || 0;
      const liveDailyVal = liveBomUsage
        ? (liveBomUsage.byProductId.get(inv.productId) ??
            (inv.productCode ? liveBomUsage.byProductCode.get(inv.productCode) : undefined) ??
            0)
        : 0;
      const dailyUsage = liveDailyVal > 0 ? liveDailyVal : masterDailyUsage;
      const usageSource = liveDailyVal > 0 ? 'LIVE_BOM' : 'INVENTORY';
      const currentQty = inv.currentQty || 0;

      // 안전재고 기준: Product에 등록된 safetyStockQty 우선, 없으면 (일사용량 * 리드타임 * 1.5)
      let safetyStock = p?.safetyStockQty && p.safetyStockQty > 0
        ? p.safetyStockQty
        : Math.ceil(dailyUsage * Math.max(1, leadTime) * 1.5);
      if (safetyStock <= 0) safetyStock = 5; // 기본 최소 버퍼

      // 적정(권장)재고: 안전재고의 1.3배
      const recommendStock = Math.ceil(safetyStock * 1.3);

      // 차이수량 = 현재고 - 안전재고
      const diffQty = Math.round((currentQty - safetyStock) * 100) / 100;

      // 부족수량 = 현재고 < 안전재고 인 경우 (safetyStock - currentQty)
      const shortageQty = currentQty < safetyStock
        ? Math.round((safetyStock - currentQty) * 100) / 100
        : 0;

      // 재고유지일수 = 현재고 / 일사용량
      const stockDays = dailyUsage > 0
        ? Math.round((currentQty / dailyUsage) * 10) / 10
        : currentQty > 0 ? 99.9 : 0;

      // 보충 필요금액
      const restockAmount = Math.round(shortageQty * unitPrice);
      const currentStockAmount = Math.round(currentQty * unitPrice);
      const safetyStockAmount = Math.round(safetyStock * unitPrice);

      // 재고 건전성 상태 산출
      let healthStatus: 'CRITICAL' | 'WARNING' | 'OPTIMAL' | 'EXCESS' = 'OPTIMAL';
      let statusLabel = '적정';
      if (currentQty < safetyStock) {
        healthStatus = 'CRITICAL';
        statusLabel = '결품위험';
      } else if (currentQty < recommendStock) {
        healthStatus = 'WARNING';
        statusLabel = '주의';
      } else if (recommendStock > 0 && currentQty > recommendStock * 1.8) {
        healthStatus = 'EXCESS';
        statusLabel = '과다';
      }

      return {
        id: inv.id,
        productId: inv.productId,
        no: idx + 1,
        warehouse: inv.warehouse || '상온',
        category: inv.category || p?.category || '원재료',
        supplier: partnerName,
        supplierId: p?.partnerId || '',
        leadTime,
        itemCode: inv.productCode,
        itemName: inv.productName || p?.name || '',
        spec: p?.spec || '',
        unit: inv.unit || p?.unit || '봉',
        boxUnitQty: boxUnit,
        unitPrice,
        bagPrice,
        boxPrice,
        dailyUsage: Math.round(dailyUsage * 100) / 100,
        liveDailyUsage: Math.round(liveDailyVal * 100) / 100,
        masterDailyUsage: Math.round(masterDailyUsage * 100) / 100,
        usageSource,
        currentQty,
        stockDays,
        safetyStock,
        recommendStock,
        diffQty,
        shortageQty,
        restockAmount,
        currentStockAmount,
        safetyStockAmount,
        healthStatus,
        statusLabel,
        ratio: safetyStock > 0 ? Math.round((currentQty / safetyStock) * 1000) / 10 : 0,
        remark: inv.remark || '',
      };
    });

    // 거래처 필터
    let filteredRows = allRows;
    if (supplier && supplier !== 'ALL') {
      filteredRows = filteredRows.filter((r) => r.supplier === supplier);
    }

    // 상태 필터
    if (statusFilter !== 'ALL') {
      filteredRows = filteredRows.filter((r) => r.healthStatus === statusFilter);
    }

    // 전체 및 창고별 정밀 KPI 통계
    const warehouseStats: Record<string, { total: number; critical: number; warning: number; optimal: number; excess: number; shortageAmount: number }> = {
      '전체': { total: allRows.length, critical: 0, warning: 0, optimal: 0, excess: 0, shortageAmount: 0 },
      '냉장1': { total: 0, critical: 0, warning: 0, optimal: 0, excess: 0, shortageAmount: 0 },
      '냉장2': { total: 0, critical: 0, warning: 0, optimal: 0, excess: 0, shortageAmount: 0 },
      '냉동': { total: 0, critical: 0, warning: 0, optimal: 0, excess: 0, shortageAmount: 0 },
      '상온': { total: 0, critical: 0, warning: 0, optimal: 0, excess: 0, shortageAmount: 0 },
      '부자재': { total: 0, critical: 0, warning: 0, optimal: 0, excess: 0, shortageAmount: 0 },
    };

    let totalShortageAmount = 0;
    let totalCurrentStockAmount = 0;
    let totalSafetyStockAmount = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let optimalCount = 0;
    let excessCount = 0;

    allRows.forEach((r) => {
      const wh = r.warehouse;
      if (!warehouseStats[wh]) {
        warehouseStats[wh] = { total: 0, critical: 0, warning: 0, optimal: 0, excess: 0, shortageAmount: 0 };
      }
      warehouseStats[wh].total += 1;
      warehouseStats[wh].shortageAmount += r.restockAmount;

      if (r.healthStatus === 'CRITICAL') {
        warehouseStats[wh].critical += 1;
        warehouseStats['전체'].critical += 1;
        criticalCount++;
      } else if (r.healthStatus === 'WARNING') {
        warehouseStats[wh].warning += 1;
        warehouseStats['전체'].warning += 1;
        warningCount++;
      } else if (r.healthStatus === 'EXCESS') {
        warehouseStats[wh].excess += 1;
        warehouseStats['전체'].excess += 1;
        excessCount++;
      } else {
        warehouseStats[wh].optimal += 1;
        warehouseStats['전체'].optimal += 1;
        optimalCount++;
      }

      totalShortageAmount += r.restockAmount;
      totalCurrentStockAmount += r.currentStockAmount;
      totalSafetyStockAmount += r.safetyStockAmount;
    });

    warehouseStats['전체'].shortageAmount = totalShortageAmount;

    // 거래처 고유 목록 추출
    const supplierList = Array.from(new Set(allRows.map((r) => r.supplier).filter(Boolean))).sort();

    return NextResponse.json({
      success: true,
      data: filteredRows,
      totalCount: filteredRows.length,
      supplierList,
      warehouseStats,
      summary: {
        totalCount: allRows.length,
        filteredCount: filteredRows.length,
        criticalCount,
        warningCount,
        optimalCount,
        excessCount,
        criticalRate: allRows.length > 0 ? Math.round((criticalCount / allRows.length) * 1000) / 10 : 0,
        totalCurrentStockAmount,
        totalSafetyStockAmount,
        totalShortageAmount,
      },
    });
  } catch (error: any) {
    console.error('Error fetching safety stocks:', error);
    return NextResponse.json(
      { success: false, error: error.message || '안전재고 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/inventory/safety-stock (안전재고 일괄 저장 및 동기화 파이프라인)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action = 'save', rows = [], bufferMultiplier = 1.5 } = body;

    // 1. 자동 산출 시뮬레이션 요청인 경우
    if (action === 'auto-calc') {
      const today = kstToday();
      const rawInventories = await prisma.inventory.findMany({
        where: {
          product: {
            isUsed: true,
            category: { notIn: ['완성품', '반제품'] },
          },
        },
        include: {
          product: { include: { partner: true } },
        },
      });
      const inventories = rawInventories.filter(
        (inv) => inv.product && !isExcludedOrderMaterial(inv.product, today)
      );

      const mult = Number(bufferMultiplier) || 1.5;
      const updatedList = inventories.map((inv) => {
        const partnerLead = inv.product?.partner?.leadTime && inv.product.partner.leadTime > 0
          ? inv.product.partner.leadTime
          : 1;
        const leadTime = Number(inv.product?.targetOrderDays) > 0
          ? Number(inv.product.targetOrderDays)
          : partnerLead;
        const daily = inv.dailyUsage || 0;
        let autoSafety = Math.ceil(daily * Math.max(1, leadTime) * mult);
        if (autoSafety <= 0) autoSafety = 5;

        return {
          productId: inv.productId,
          productCode: inv.productCode,
          safetyStock: autoSafety,
        };
      });

      return NextResponse.json({
        success: true,
        data: updatedList,
        message: `${updatedList.length}개 품목의 권장 안전재고(버퍼 ${mult}배 기준)가 자동 계산되었습니다.`,
      });
    }

    // 2. 안전재고 확정 저장
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '저장할 안전재고 품목 데이터가 없습니다.' },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const r of rows) {
        const pId = Number(r.productId);
        if (!pId) continue;

        const safetyQty = Number(r.safetyStock || 0);

        // Product 마스터의 safetyStockQty 업데이트
        await tx.product.update({
          where: { id: pId },
          data: {
            safetyStockQty: safetyQty,
          },
        });

        // SafetyStock 스냅샷 테이블 업서트
        const existing = await tx.safetyStock.findFirst({
          where: { productId: pId },
        });

        if (existing) {
          await tx.safetyStock.update({
            where: { id: existing.id },
            data: {
              safetyQty,
              currentQty: Number(r.currentQty || existing.currentQty),
              shortageQty: Number(r.shortageQty || Math.max(0, safetyQty - Number(r.currentQty || 0))),
              avgDailyUsage: Number(r.dailyUsage || existing.avgDailyUsage),
              leadTime: Number(r.leadTime || existing.leadTime),
              remark: r.remark !== undefined ? r.remark : existing.remark,
            },
          });
        } else {
          await tx.safetyStock.create({
            data: {
              productId: pId,
              productCode: r.itemCode || '',
              productName: r.itemName || '',
              category: r.category || '원재료',
              unit: r.unit || '봉',
              safetyQty,
              currentQty: Number(r.currentQty || 0),
              shortageQty: Number(r.shortageQty || Math.max(0, safetyQty - Number(r.currentQty || 0))),
              avgDailyUsage: Number(r.dailyUsage || 0),
              leadTime: Number(r.leadTime || 1),
              remark: r.remark || '',
            },
          });
        }
        count++;
      }
      return count;
    });

    // ERP 대시보드 스냅샷 캐시 무효화 (결품위험 지표 실시간 동기화)
    await touchDashboardSnapshot();

    return NextResponse.json({
      success: true,
      count: updated,
      message: `${updated}개 품목의 적정/안전재고 설정이 성공적으로 데이터베이스에 확정 저장되었습니다.`,
    });
  } catch (error: any) {
    console.error('Error saving safety stocks:', error);
    return NextResponse.json(
      { success: false, error: error.message || '안전재고 저장 실패' },
      { status: 500 }
    );
  }
}
