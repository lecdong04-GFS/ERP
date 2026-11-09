import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normName } from '@/lib/gfs/canonical';

// GET /api/gfs/order-sheet — 100% PostgreSQL DB 기반 정본 및 기발주 미입고(Pending PO) 실시간 연동
export async function GET() {
  try {
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

    const rows = inventories.map((inv, idx) => {
      const p = inv.product;
      const name = p?.name || inv.productCode;
      const norm = normName(name);
      const code = inv.productCode || p?.productCode || '';
      const pack = (Number(p?.boxQty) > 0 ? Number(p?.boxQty) : 1);
      const current = Number(inv.currentQty) || 0;
      const dailyUsage = Number(inv.dailyUsage) || 0;
      const leadTime = p?.partner?.leadTime || 2;

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

      const stockDays = dailyUsage > 0 ? Math.round((current / dailyUsage) * 10) / 10 : null;

      // 자재 대체/단종 안전 제어: 스팸 ➔ 고미트햄(한성) 대체 완료
      const isReplacedSpam = name.includes('스팸(340g*20캔)') || (name.includes('스팸') && supplier.includes('튀김실'));
      const effectiveDailyUsage = isReplacedSpam ? 0 : dailyUsage;
      const effectiveBoxesBase = isReplacedSpam ? 0 : Math.floor(current / pack);

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
        auditFile: null,
        orderFile: 'PostgreSQL DB (100% 일원화)',
        masterSource: 'db',
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
