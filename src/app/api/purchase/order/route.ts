import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { normalizeDateYmd } from '@/lib/gfs/orderCalc';
import {
  normalizePackUnit,
  pickLatestValidPurchasePrice,
  resolveBagPrice,
  calcBoxPrice,
  calcBagPriceFromBox,
  isBoxUnitLabel,
  unitPriceForOrderUnit,
} from '@/lib/gfs/pricing';

export const dynamic = 'force-dynamic';

// GET /api/purchase/order?orderDate=2026-10-30&status=미입고
// GET /api/purchase/order?startDate=2026-10-01&endDate=2026-10-31 (기간 조회)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawOrderDate = searchParams.get('orderDate');
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');
    const orderDate = rawOrderDate ? normalizeDateYmd(rawOrderDate) : null;
    const startDate = rawStartDate ? normalizeDateYmd(rawStartDate) : null;
    const endDate = rawEndDate ? normalizeDateYmd(rawEndDate) : null;
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: any = {};
    if (orderDate) {
      where.orderDate = orderDate;
    } else if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) where.orderDate.gte = startDate;
      if (endDate) where.orderDate.lte = endDate;
    }
    if (status && status !== '전체') where.status = status;
    if (search) {
      where.OR = [
        { orderNo: { contains: search } },
        { partnerName: { contains: search } },
      ];
    }

    const orders = await prisma.purchaseOrder.findMany({
      where,
      select: {
        id: true,
        orderNo: true,
        orderDate: true,
        partnerId: true,
        partnerName: true,
        orderType: true,
        deliveryDate: true,
        status: true,
        totalAmount: true,
        cancelReason: true,
        cancelDate: true,
        remark: true,
        createdBy: true,
        createdAt: true,
        partner: {
          select: {
            id: true,
            name: true,
            tel: true,
          },
        },
        details: {
          select: {
            id: true,
            productId: true,
            productCode: true,
            productName: true,
            category: true,
            unit: true,
            orderQty: true,
            unitPrice: true,
            amount: true,
            receivedQty: true,
            remainQty: true,
            remark: true,
            product: {
              select: {
                name: true,
                spec: true,
                warehouse: true,
                boxQty: true,
                prices: {
                  orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
                  take: 10,
                  select: { effectiveDate: true, purchasePrice: true },
                },
                inventories: {
                  select: { unitPrice: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ orderDate: 'desc' }, { id: 'desc' }],
      take: 200,
    });

    const enrichedOrders = orders.map((po) => {
      const enrichedDetails = po.details.map((d) => {
        const packUnit = normalizePackUnit(d.product?.boxQty);
        const invValidPrice = (d.product?.inventories || []).reduce(
          (best, inv) => (best > 0 ? best : Number(inv.unitPrice) || 0),
          0
        );
        const masterBagPrice = resolveBagPrice({
          masterBagPrice: pickLatestValidPurchasePrice(d.product?.prices as any),
          invUnitPrice: invValidPrice,
        });
        const masterBoxPrice = calcBoxPrice(masterBagPrice, packUnit);
        const isBox = isBoxUnitLabel(d.unit);
        const lineRaw = Number(d.unitPrice) || 0;
        const fallbackLinePrice = unitPriceForOrderUnit(masterBagPrice, d.unit, packUnit);
        const effectiveUnitPrice = lineRaw > 0 ? lineRaw : fallbackLinePrice;
        const bagPrice =
          masterBagPrice > 0
            ? masterBagPrice
            : isBox && packUnit > 1
              ? calcBagPriceFromBox(effectiveUnitPrice, packUnit)
              : effectiveUnitPrice;
        const boxPrice = masterBoxPrice > 0 ? masterBoxPrice : calcBoxPrice(bagPrice, packUnit);
        const amount =
          Number(d.amount) > 0
            ? Number(d.amount)
            : Math.round((Number(d.orderQty) || 0) * effectiveUnitPrice);

        const { prices: _prices, inventories: _inventories, ...productMeta } = (d.product || {}) as any;
        return {
          ...d,
          unitPrice: effectiveUnitPrice,
          amount,
          packUnit,
          bagPrice,
          boxPrice,
          masterBagPrice,
          masterBoxPrice,
          product: d.product ? productMeta : null,
        };
      });
      const computedTotal = Math.round(
        enrichedDetails.reduce((s, d) => s + (Number(d.amount) || 0), 0)
      );
      return {
        ...po,
        totalAmount: Number(po.totalAmount) > 0 ? Number(po.totalAmount) : computedTotal,
        details: enrichedDetails,
      };
    });

    return NextResponse.json({ success: true, data: enrichedOrders });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch purchase orders' },
      { status: 500 }
    );
  }
}

// POST /api/purchase/order (발주 상태 변경, 품목 수정, 취소 및 삭제)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, orderNo, ids, orderNos, status, cancelReason, detailId } = body;

    // 1) 발주 취소 (상태만 발주취소로 변경)
    if (action === 'cancel' && (id || orderNo || (Array.isArray(ids) && ids.length > 0) || (Array.isArray(orderNos) && orderNos.length > 0))) {
      const targetIds = Array.isArray(ids) ? ids.map(Number) : id ? [Number(id)] : [];
      const targetOrderNos = Array.isArray(orderNos) ? orderNos : orderNo ? [orderNo] : [];

      await prisma.purchaseOrder.updateMany({
        where: {
          OR: [
            ...(targetIds.length > 0 ? [{ id: { in: targetIds } }] : []),
            ...(targetOrderNos.length > 0 ? [{ orderNo: { in: targetOrderNos } }] : []),
          ],
        },
        data: {
          status: '발주취소',
          cancelReason: cancelReason || '사용자 요청에 의한 발주 취소',
          cancelDate: kstToday(),
        },
      });
      return NextResponse.json({ success: true, message: '발주가 성공적으로 취소되었습니다.' });
    }

    // 2) 발주서 영구 삭제 (DB에서 PurchaseOrder 및 하위 Details 완전 삭제)
    if (action === 'delete') {
      return await handleDeleteOrders(body);
    }

    // 3) 단일 발주 품목 삭제
    if (action === 'delete_detail' && (detailId || id)) {
      return await handleDeleteDetail(Number(detailId || id));
    }

    // 3-2) 다중 발주 품목 일괄 삭제
    if (action === 'delete_details' && Array.isArray(body.detailIds) && body.detailIds.length > 0) {
      return await handleDeleteDetails(body.detailIds.map(Number));
    }

    if (action === 'update_status' && id) {
      const updated = await prisma.purchaseOrder.update({
        where: { id: Number(id) },
        data: { status },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'update_order') {
      const { orderId, orderNo, details = [], remark, deliveryDate } = body;
      const targetId = orderId ? Number(orderId) : undefined;
      const po = await prisma.purchaseOrder.findFirst({
        where: targetId ? { id: targetId } : { orderNo },
        include: { details: true },
      });

      if (!po) {
        return NextResponse.json({ success: false, error: '발주서를 찾을 수 없습니다.' }, { status: 404 });
      }

      await prisma.$transaction(async (tx) => {
        for (const dt of details) {
          const dtId = Number(dt.id);
          const orderQty = Math.max(0, Number(dt.orderQty) || 0);
          const unitPrice = Math.max(0, Number(dt.unitPrice) || 0);
          const amount = Math.round(orderQty * unitPrice);

          const existingDetail = po.details.find((d) => d.id === dtId);
          const receivedQty = existingDetail?.receivedQty || 0;
          const remainQty = Math.max(0, orderQty - receivedQty);

          if (existingDetail) {
            await tx.purchaseOrderDetail.update({
              where: { id: dtId },
              data: {
                ...(dt.unit !== undefined ? { unit: String(dt.unit) } : {}),
                orderQty,
                unitPrice,
                amount,
                remainQty,
                remark: dt.remark !== undefined ? dt.remark : existingDetail.remark,
              },
            });
          }
        }

        const allDetails = await tx.purchaseOrderDetail.findMany({
          where: { purchaseOrderId: po.id },
          select: { amount: true },
        });
        const newTotalAmount = Math.round(
          allDetails.reduce((s, d) => s + (Number(d.amount) || 0), 0)
        );

        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: {
            totalAmount: newTotalAmount,
            ...(remark !== undefined ? { remark } : {}),
            ...(deliveryDate !== undefined ? { deliveryDate: normalizeDateYmd(deliveryDate) } : {}),
          },
        });
      });

      const refreshed = await prisma.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { details: true, partner: true },
      });

      return NextResponse.json({
        success: true,
        message: '발주서가 성공적으로 수정되었습니다.',
        data: refreshed,
      });
    }

    return NextResponse.json({ success: false, error: '유효하지 않은 요청(action)입니다.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '발주서 처리 실패' },
      { status: 500 }
    );
  }
}

// DELETE /api/purchase/order (발주서 영구 삭제)
export async function DELETE(req: NextRequest) {
  try {
    let body: any = {};
    const { searchParams } = new URL(req.url);

    try {
      body = await req.json();
    } catch {
      // Body may be empty if params passed via URL
      body = {};
    }

    const id = body.id || searchParams.get('id');
    const ids = body.ids || (searchParams.get('ids') ? searchParams.get('ids')!.split(',') : undefined);
    const orderNo = body.orderNo || searchParams.get('orderNo');
    const orderNos = body.orderNos || (searchParams.get('orderNos') ? searchParams.get('orderNos')!.split(',') : undefined);
    const detailId = body.detailId || searchParams.get('detailId');

    if (detailId) {
      return await handleDeleteDetail(Number(detailId));
    }

    return await handleDeleteOrders({ id, ids, orderNo, orderNos });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '발주서 삭제 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/** 발주서 영구 삭제 로직 (공통) */
async function handleDeleteOrders(params: {
  id?: number | string;
  ids?: (number | string)[];
  orderNo?: string;
  orderNos?: string[];
}) {
  const { id, ids, orderNo, orderNos } = params;
  const numIds = Array.isArray(ids)
    ? ids.map(Number).filter((n) => !isNaN(n))
    : id
    ? [Number(id)].filter((n) => !isNaN(n))
    : [];

  const targetOrderNos = Array.isArray(orderNos)
    ? orderNos.map(String).filter(Boolean)
    : orderNo
    ? [String(orderNo)].filter(Boolean)
    : [];

  if (numIds.length === 0 && targetOrderNos.length === 0) {
    return NextResponse.json(
      { success: false, error: '삭제할 발주서 ID 또는 발주번호가 지정되지 않았습니다.' },
      { status: 400 }
    );
  }

  // 1. 대상 발주서 조회 및 입고 상태 검증
  const targetOrders = await prisma.purchaseOrder.findMany({
    where: {
      OR: [
        ...(numIds.length > 0 ? [{ id: { in: numIds } }] : []),
        ...(targetOrderNos.length > 0 ? [{ orderNo: { in: targetOrderNos } }] : []),
      ],
    },
    include: { details: true },
  });

  if (targetOrders.length === 0) {
    return NextResponse.json(
      { success: false, error: '삭제 대상 발주서를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  // 2. 이미 입고 처리된 발주서가 포함되어 있는지 안전 검증
  const blockedOrders = targetOrders.filter(
    (o) => o.status === '입고완료' || o.details.some((d) => (d.receivedQty || 0) > 0)
  );

  if (blockedOrders.length > 0) {
    const blockedNos = blockedOrders.map((o) => o.orderNo).join(', ');
    return NextResponse.json(
      {
        success: false,
        error: `이미 입고 처리되었거나 부분 입고된 발주서(${blockedNos})는 삭제할 수 없습니다. 입고등록 화면에서 입고를 먼저 취소한 후 삭제해주세요.`,
      },
      { status: 400 }
    );
  }

  // 3. 트랜잭션으로 상세 품목 및 헤더 삭제
  const orderIdsToDelete = targetOrders.map((o) => o.id);
  const deletedCount = await prisma.$transaction(async (tx) => {
    // 상세 품목 삭제
    await tx.purchaseOrderDetail.deleteMany({
      where: { purchaseOrderId: { in: orderIdsToDelete } },
    });
    // 헤더 삭제
    const res = await tx.purchaseOrder.deleteMany({
      where: { id: { in: orderIdsToDelete } },
    });
    return res.count;
  });

  return NextResponse.json({
    success: true,
    message: `선택하신 ${deletedCount}건의 발주서가 완전히 삭제되었습니다.`,
    deletedCount,
    deletedOrderNos: targetOrders.map((o) => o.orderNo),
  });
}

/** 단일 발주 품목 삭제 로직 */
async function handleDeleteDetail(detailId: number) {
  if (!detailId || isNaN(detailId)) {
    return NextResponse.json(
      { success: false, error: '유효한 품목 ID가 아닙니다.' },
      { status: 400 }
    );
  }

  const detail = await prisma.purchaseOrderDetail.findUnique({
    where: { id: detailId },
    include: {
      purchaseOrder: {
        include: { details: true },
      },
    },
  });

  if (!detail) {
    return NextResponse.json(
      { success: false, error: '삭제할 발주 품목을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  if ((detail.receivedQty || 0) > 0) {
    return NextResponse.json(
      { success: false, error: '이미 입고 처리된 품목은 삭제할 수 없습니다.' },
      { status: 400 }
    );
  }

  const parentOrder = detail.purchaseOrder;

  await prisma.$transaction(async (tx) => {
    // 해당 품목 삭제
    await tx.purchaseOrderDetail.delete({
      where: { id: detailId },
    });

    // 남은 품목들의 합계금액 계산
    const remaining = parentOrder.details.filter((d) => d.id !== detailId);
    if (remaining.length === 0) {
      // 발주 품목이 0개가 되면 발주서 헤더도 함께 삭제
      await tx.purchaseOrder.delete({
        where: { id: parentOrder.id },
      });
    } else {
      const newTotal = remaining.reduce((sum, d) => sum + (d.amount || 0), 0);
      await tx.purchaseOrder.update({
        where: { id: parentOrder.id },
        data: { totalAmount: newTotal },
      });
    }
  });

  return NextResponse.json({
    success: true,
    message: `품목 [${detail.productName || detail.productCode}]이(가) 발주서에서 삭제되었습니다.`,
  });
}

/** 다중 발주 품목 일괄 삭제 로직 */
async function handleDeleteDetails(detailIds: number[]) {
  if (!Array.isArray(detailIds) || detailIds.length === 0) {
    return NextResponse.json({ success: false, error: '삭제할 품목 ID 목록이 없습니다.' }, { status: 400 });
  }

  const details = await prisma.purchaseOrderDetail.findMany({
    where: { id: { in: detailIds } },
    select: { id: true, purchaseOrderId: true, receivedQty: true, productName: true, productCode: true },
  });

  if (details.length === 0) {
    return NextResponse.json({ success: false, error: '삭제할 품목을 찾을 수 없습니다.' }, { status: 404 });
  }

  const received = details.filter((d) => (d.receivedQty || 0) > 0);
  if (received.length > 0) {
    return NextResponse.json(
      { success: false, error: '이미 입고 처리된 품목이 포함되어 있어 삭제할 수 없습니다.' },
      { status: 400 }
    );
  }

  const parentOrderIds = [...new Set(details.map((d) => d.purchaseOrderId))];

  await prisma.$transaction(async (tx) => {
    // 1. 해당 품목들 일괄 삭제
    await tx.purchaseOrderDetail.deleteMany({
      where: { id: { in: detailIds } },
    });

    // 2. 각 부모 발주서의 남은 품목 재확인 및 합계금액 갱신 또는 헤더 삭제
    for (const pId of parentOrderIds) {
      const remaining = await tx.purchaseOrderDetail.findMany({
        where: { purchaseOrderId: pId },
        select: { amount: true },
      });

      if (remaining.length === 0) {
        await tx.purchaseOrder.delete({ where: { id: pId } });
      } else {
        const newTotal = remaining.reduce((sum, d) => sum + (d.amount || 0), 0);
        await tx.purchaseOrder.update({
          where: { id: pId },
          data: { totalAmount: newTotal },
        });
      }
    }
  });

  return NextResponse.json({
    success: true,
    message: `선택하신 ${details.length}개 품목이 발주서에서 완전히 삭제되었습니다.`,
    deletedCount: details.length,
  });
}
