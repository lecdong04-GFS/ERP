import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { getEstimatedDailyUsageWithDb } from '@/lib/gfs/estimatedUsage';
import { canonNormName } from '@/lib/gfs/norm';

const MASTER_KEY = 'gfs_master_workbook';

// GET /api/gfs/auto-boot?orderDate=YYYY-MM-DD&stockDate=YYYY-MM-DD&includeMaster=1
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reqOrderDate = searchParams.get('orderDate') || '';
    const reqStockDate = searchParams.get('stockDate') || '';
    const includeMaster = searchParams.get('includeMaster') !== '0';
    const today = kstToday();

    // 1. 병렬 메타 조회: (A) 발주서 마스터, (B) 수주일자 목록, (C) 재고조사표 스냅샷 일자 목록, (D) 추정일사용량
    const [masterSnap, orderDateRows, stockDateRows, estUsageResult] = await Promise.all([
      prisma.dashboardSnapshot.findUnique({ where: { key: MASTER_KEY } }),
      prisma.salesOrder.findMany({
        select: { orderDate: true },
        distinct: ['orderDate'],
        orderBy: { orderDate: 'desc' },
        take: 20,
      }),
      prisma.inventorySnapshot.findMany({
        select: { snapshotDate: true },
        distinct: ['snapshotDate'],
        orderBy: { snapshotDate: 'desc' },
        take: 25,
      }),
      getEstimatedDailyUsageWithDb(prisma).catch(() => null),
    ]);

    // (A) 마스터 발주서 정보 정리
    const mp =
      masterSnap && masterSnap.payload && typeof masterSnap.payload === 'object'
        ? (masterSnap.payload as Record<string, any>)
        : null;
    const hasCustomMaster = Boolean(mp && mp.base64);
    const masterInfo = {
      hasCustom: hasCustomMaster,
      fileName: hasCustomMaster
        ? String(mp!.fileName || '발주서_마스터.xlsx')
        : '★★발주서양식통합★★(11월 최신본)',
      asOf: hasCustomMaster ? masterSnap!.asOf || String(mp!.asOf || today) : '2026-11-02',
      uploadedBy: hasCustomMaster ? String(mp!.uploadedBy || '담당자') : '시스템 내장',
      itemCount: hasCustomMaster ? Number(mp!.itemCount) || 442 : 442,
      ...(includeMaster && hasCustomMaster ? { base64: String(mp!.base64) } : {}),
    };

    // (B) 수주(10시 주문서) 대상 일자 결정 및 집계
    const availableOrderDates = orderDateRows.map((r) => r.orderDate).filter(Boolean);
    const hasTodayOrder = availableOrderDates.includes(today);
    const usedOrderDate =
      reqOrderDate && availableOrderDates.includes(reqOrderDate)
        ? reqOrderDate
        : hasTodayOrder
          ? today
          : availableOrderDates[0] || today;

    const salesOrders = usedOrderDate
      ? await prisma.salesOrder.findMany({
          where: { orderDate: usedOrderDate },
          include: {
            details: {
              include: { product: { select: { name: true } } },
            },
          },
        })
      : [];

    const menuMap = new Map<string, number>();
    let totalOrderQty = 0;
    for (const o of salesOrders) {
      for (const d of o.details || []) {
        const nm = String(d.product?.name || '').trim();
        const q = Number(d.totalQty) || 0;
        if (!nm || !(q > 0)) continue;
        menuMap.set(nm, (menuMap.get(nm) || 0) + q);
        totalOrderQty += q;
      }
    }
    const orderItems = Array.from(menuMap.entries()).map(([menuName, qty]) => ({
      menuName,
      qty,
    }));

    // (B-2) 최근 14일간 수주가 있었던 완제품 목록 (휴면/미사용 원부자재 정밀 필터링용)
    const recent14Dates = availableOrderDates.slice(0, 14);
    const recent14Orders = recent14Dates.length > 0
      ? await prisma.salesOrderDetail.findMany({
          where: {
            order: {
              orderDate: { in: recent14Dates },
            },
          },
          select: {
            product: { select: { name: true } },
            totalQty: true,
          },
        })
      : [];

    const recent14MenuMap: Record<string, number> = {};
    for (const d of recent14Orders) {
      const nm = String(d.product?.name || '').trim();
      if (!nm) continue;
      const q = Number(d.totalQty) || 0;
      recent14MenuMap[nm] = (recent14MenuMap[nm] || 0) + q;
    }

    // (C) 재고조사표(전일 17시 마감 실사) 대상 일자 결정 및 조회
    const availableStockDates = stockDateRows.map((r) => r.snapshotDate).filter(Boolean);
    const usedStockDate =
      reqStockDate && availableStockDates.includes(reqStockDate)
        ? reqStockDate
        : availableStockDates[0] || today;

    const byWhAndKey = estUsageResult?.byWhAndKey || {};
    const byKeyOnly = estUsageResult?.byKeyOnly || {};
    const lookupEst = (wh: string, name: string): number => {
      const k = canonNormName(name);
      const e = byWhAndKey[`${wh}|${k}`] || byKeyOnly[k];
      return e?.estDailyUsage || 0;
    };

    let stockItems: Array<{
      name: string;
      box: number;
      piece: number;
      currentStock: number;
      packQty: number;
      unitPrice: number;
      dailyUsage: number;
      estDailyUsage: number;
      sheet: string;
    }> = [];

    if (usedStockDate && availableStockDates.length > 0) {
      const snapRows = await prisma.inventorySnapshot.findMany({
        where: { snapshotDate: usedStockDate },
        orderBy: [{ warehouse: 'asc' }, { productName: 'asc' }],
      });
      stockItems = snapRows
        .filter((s) => s.productName)
        .map((s) => {
          const wh = String(s.warehouse || '');
          const est = lookupEst(wh, s.productName);
          return {
            name: String(s.productName),
            box: Number(s.boxQty) || 0,
            piece: Number(s.pieceQty) || 0,
            currentStock: Number(s.currentQty) || 0,
            packQty: Number(s.packUnit) || 1,
            unitPrice: Number(s.unitPrice) || 0,
            dailyUsage: Number(s.dailyUsage) || 0,
            estDailyUsage: est,
            sheet: wh,
          };
        });
    } else {
      // 스냅샷이 없을 때 Inventory 테이블 폴백
      const invRows = await prisma.inventory.findMany({
        include: { product: true },
      });
      stockItems = invRows
        .filter((s) => s.productName || s.product?.name)
        .map((s) => {
          const nm = String(s.productName || s.product?.name || '');
          const wh = String(s.warehouse || '');
          const boxUnit = Number(s.product?.boxQty) || 1;
          const cur = Number(s.currentQty) || 0;
          return {
            name: nm,
            box: boxUnit > 0 ? Math.floor(cur / boxUnit) : 0,
            piece: boxUnit > 0 ? Math.round((cur % boxUnit) * 10) / 10 : 0,
            currentStock: cur,
            packQty: boxUnit,
            unitPrice: Number(s.unitPrice) || 0,
            dailyUsage: 0,
            estDailyUsage: lookupEst(wh, nm),
            sheet: wh,
          };
        });
    }

    const estUsageMap: Record<string, { estDailyUsage: number; sampleCount: number; observedDays: number }> = {};
    for (const [k, v] of Object.entries(byKeyOnly)) {
      estUsageMap[k] = {
        estDailyUsage: v.estDailyUsage,
        sampleCount: v.sampleCount,
        observedDays: v.observedDays,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        today,
        master: masterInfo,
        dormantMeta: {
          recent14MenuMap,
          estUsageMap,
        },
        orders: {
          usedDate: usedOrderDate,
          isToday: usedOrderDate === today && orderItems.length > 0,
          hasTodayOrder,
          availableDates: availableOrderDates,
          menuCount: orderItems.length,
          totalQty: totalOrderQty,
          items: orderItems,
        },
        stock: {
          usedDate: usedStockDate,
          availableDates: availableStockDates,
          itemCount: stockItems.length,
          items: stockItems,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '스마트발주 자동 부팅 데이터 조회 실패' },
      { status: 500 }
    );
  }
}

