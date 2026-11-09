import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normName } from '@/lib/gfs/canonical';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';
import { getLiveBomUsageMap, LiveBomUsageMap } from '@/lib/gfs/liveUsage';

// GET /api/gfs/order-sheet — 100% PostgreSQL DB 기반 정본, 실시간 BOM 일사용량 및 기발주 미입고(Pending PO) 실시간 연동
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get('date') || '';
    const errors: string[] = [];

    // 1. DB에서 활성 재고 및 품목 마스터 일괄 조회
    const inventories = await prisma.inventory.findMany({
      where: {
        product: {
          isUsed: true,
        },
      },
      include: {
        product: {
          include: {
            partner: true,
            prices: {
              orderBy: { effectiveDate: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: [
        { warehouse: 'asc' },
        { productCode: 'asc' },
      ],
    });

    // 2. 최신 GS25 완제품 수주량 x BOM 레시피 전개 실시간 일사용량 산출
    let liveBomUsage: LiveBomUsageMap | null = null;
    try {
      liveBomUsage = await getLiveBomUsageMap(targetDate);
    } catch (bomErr: any) {
      errors.push(`실시간 BOM 일사용량 산출 연동 실패(기준 일사용량 폴백): ${bomErr?.message || bomErr}`);
    }

    // 2. DB에서 현재 미입고 상태인 '기발주(Pending PO)' 내역 실시간 일괄 조회
    type PendingPoInfo = {
      remainBoxes: number;
      orderBoxes: number;
      orderNos: string[];
      latestOrderDate: string;
    };
    const pendingByCode = new Map<string, PendingPoInfo>();
    const pendingByNorm = new Map<string, PendingPoInfo>();

    try {
      const activePendingDetails = await prisma.purchaseOrderDetail.findMany({
        where: {
          remainQty: { gt: 0 },
          purchaseOrder: {
            status: { notIn: ['발주취소', '취소'] },
          },
        },
        select: {
          productCode: true,
          productName: true,
          orderQty: true,
          remainQty: true,
          purchaseOrder: {
            select: {
              orderNo: true,
              orderDate: true,
              status: true,
            },
          },
        },
      });

      for (const d of activePendingDetails) {
        const orderNo = d.purchaseOrder?.orderNo || '';
        const orderDate = d.purchaseOrder?.orderDate || '';
        const boxes = d.remainQty > 0 ? d.remainQty : d.orderQty;

        if (d.productCode) {
          const cur = pendingByCode.get(d.productCode) || {
            remainBoxes: 0,
            orderBoxes: 0,
            orderNos: [],
            latestOrderDate: '',
          };
          cur.remainBoxes += boxes;
          cur.orderBoxes += d.orderQty;
          if (orderNo && !cur.orderNos.includes(orderNo)) cur.orderNos.push(orderNo);
          if (!cur.latestOrderDate || orderDate > cur.latestOrderDate) cur.latestOrderDate = orderDate;
          pendingByCode.set(d.productCode, cur);
        }

        const norm = normName(d.productName);
        if (norm) {
          const cur = pendingByNorm.get(norm) || {
            remainBoxes: 0,
            orderBoxes: 0,
            orderNos: [],
            latestOrderDate: '',
          };
          cur.remainBoxes += boxes;
          cur.orderBoxes += d.orderQty;
          if (orderNo && !cur.orderNos.includes(orderNo)) cur.orderNos.push(orderNo);
          if (!cur.latestOrderDate || orderDate > cur.latestOrderDate) cur.latestOrderDate = orderDate;
          pendingByNorm.set(norm, cur);
        }
      }
    } catch (poErr: any) {
      errors.push(`DB 기발주 미입고 내역 연동 실패: ${poErr?.message || poErr}`);
    }

    const suppliersSet = new Set<string>();

    const rows = inventories
      .filter((inv) => {
        const name = inv.product?.name || inv.productCode;
        if (isExcludedFromOrder(name)) {
          return false;
        }
        return true;
      })
      .map((inv, idx) => {
      const p = inv.product;
      const name = p?.name || inv.productCode;
      const norm = normName(name);
      const code = inv.productCode || p?.productCode || '';
      const pack = (Number(p?.boxQty) > 0 ? Number(p?.boxQty) : 1);
      const current = Number(inv.currentQty) || 0;
      const leadTime = p?.partner?.leadTime || 2;

      // ── [실시간 BOM 일사용량 연동] ──
      // 1순위: 당일 완제품 수주량 x BOM 레시피 전개 실소진량 (BOM 등록 자재)
      // 2순위: 재고조사표 엑셀 업로드 기준 일사용량 (BOM 미등록 부자재/일반소모품 폴백)
      const liveBomVal = liveBomUsage
        ? (p?.id && liveBomUsage.byProductId.get(p.id))
          ?? (code && liveBomUsage.byProductCode.get(code))
          ?? (norm && liveBomUsage.byNormName.get(norm))
        : undefined;

      const isBomDriven = liveBomVal !== undefined && Number(liveBomVal) > 0;
      const baseDailyUsage = isBomDriven ? Number(liveBomVal) : (Number(inv.dailyUsage) || 0);

      // 발주 거래처 / 공급자 명칭
      const supplier = p?.partner?.name || inv.warehouse || '기타';
      if (supplier) suppliersSet.add(supplier);

      // 기발주 미입고 내역 매칭
      const poInfo = (code && pendingByCode.get(code)) || (norm ? pendingByNorm.get(norm) : null);
      const pendingBoxes = poInfo?.remainBoxes || 0;
      const pendingBags = pack > 0 ? pendingBoxes * pack : pendingBoxes;

      const baseIncoming = Number((inv as any).inQty) || 0;
      const totalIncoming = baseIncoming + pendingBags;

      const unitPrice = Number(inv.unitPrice) > 0
        ? Number(inv.unitPrice)
        : (p?.prices?.[0]?.purchasePrice ? Number(p.prices[0].purchasePrice) : 0);

      // 자재 대체/단종 안전 제어: 스팸 ➔ 고미트햄(한성) 대체 완료
      const isReplacedSpam = name.includes('스팸(340g*20캔)') || (name.includes('스팸') && supplier.includes('튀김실'));
      const effectiveDailyUsage = isReplacedSpam ? 0 : Number(baseDailyUsage) || 0;
      const effectiveBoxesBase = isReplacedSpam ? 0 : Math.floor(current / pack);

      const stockDays = effectiveDailyUsage > 0 ? Math.round((current / effectiveDailyUsage) * 10) / 10 : null;

      return {
        id: inv.id || idx + 1,
        supplier,
        name,
        norm,
        boxesBase: effectiveBoxesBase,
        packUnit: pack,
        packUnitAudit: pack,
        days: leadTime,
        dailyUsage: effectiveDailyUsage,
        isBomDriven,
        usageSource: isBomDriven ? 'BOM실시간' : '기준소진량',
        liveBomUsage: liveBomVal ?? null,
        surveyDailyUsage: Number(inv.dailyUsage) || 0,
        incoming: totalIncoming,
        baseIncoming,
        pendingBoxes,
        pendingOrderNos: poInfo?.orderNos || [],
        latestOrderDate: poInfo?.latestOrderDate || '',
        currentStock: current,
        bagPrice: unitPrice,
        stockDays,
        warehouse: inv.warehouse,
        vendor: p?.partner?.name || '',
        orderDay: p?.partner?.orderDay || '월화수목금',
        itemId: code,
        isReplaced: isReplacedSpam,
        replacementNote: isReplacedSpam ? '고미트햄(한성) 대체 완료 (스팸 발주 영구 중단)' : undefined,
      };
    });

    const suppliers = Array.from(suppliersSet).sort();

    return NextResponse.json({
      success: true,
      data: {
        rows,
        suppliers,
        auditCount: rows.length,
        rowCount: rows.length,
        liveBomDate: liveBomUsage?.asOfDate || '',
        liveBomCount: liveBomUsage?.rowCount || 0,
        orderFile: 'PostgreSQL DB + 완제품 수주 x BOM 실시간 일사용량',
        masterSource: 'db_live_bom',
        auditFile: null,
        errors,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'order-sheet DB 조회 실패' },
      { status: 500 }
    );
  }
}
