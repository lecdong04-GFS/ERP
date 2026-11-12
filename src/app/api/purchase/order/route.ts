import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';
import { calcExpectedDeliveryInfo, normalizeDateYmd } from '@/lib/gfs/orderCalc';
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

type AuditActor = { id?: number | string | null; loginId?: string | null; name?: string | null } | undefined;

async function recordOrderAuditLog(
  tx: any,
  user: AuditActor,
  action: string,
  detail: string
) {
  const actorLabel = user?.name ? `${user.name}(${user.loginId || ''})` : String(user?.loginId || 'system');
  const parsedUid = user?.id !== null && user?.id !== undefined && user?.id !== '' ? Number(user.id) : NaN;
  await tx.systemLog.create({
    data: {
      logDate: new Date().toISOString(),
      ...(Number.isFinite(parsedUid) ? { userId: parsedUid } : {}),
      loginId: String(user?.loginId || ''),
      userName: String(user?.name || ''),
      action,
      menuId: 'pur-order-mgmt',
      menuName: '발주관리',
      detail: `${actorLabel} ${detail}`,
    },
  });
}

// GET /api/purchase/order?orderDate=2026-10-30&status=미입고
// GET /api/purchase/order?startDate=2026-10-01&endDate=2026-10-31 (기간 조회)
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

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
            leadTime: true,
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
                orderCycle: true,
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
      take: startDate || endDate ? 2000 : 200,
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

        const deliveryInfo = calcExpectedDeliveryInfo({
          orderDate: po.orderDate,
          orderCycle: d.product?.orderCycle,
          explicitDeliveryDate: po.deliveryDate,
          partnerLeadTime: po.partner?.leadTime,
        });

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
          orderCycle: deliveryInfo.orderCycle,
          leadDays: deliveryInfo.leadDays,
          expectedDeliveryDate: deliveryInfo.expectedDate,
          product: d.product ? productMeta : null,
        };
      });
      const computedTotal = Math.round(
        enrichedDetails.reduce((s, d) => s + (Number(d.amount) || 0), 0)
      );
      const expectedDates = enrichedDetails
        .map((d) => d.expectedDeliveryDate)
        .filter(Boolean)
        .sort();
      return {
        ...po,
        deliveryDate: po.deliveryDate || expectedDates[0] || '',
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
  const auth = await requireSession({ categoryId: 'purchase', action: 'write' });
  if (auth.error) return auth.error;
  const actor = auth.user;

  try {
    const body = await req.json();
    const { action, id, orderNo, ids, orderNos, status, cancelReason, detailId } = body;

    // 1) 발주 취소 (상태만 발주취소로 변경)
    if (action === 'cancel' && (id || orderNo || (Array.isArray(ids) && ids.length > 0) || (Array.isArray(orderNos) && orderNos.length > 0))) {
      const targetIds = Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : id ? [Number(id)].filter((n) => Number.isInteger(n) && n > 0) : [];
      const targetOrderNos = Array.isArray(orderNos) ? orderNos.map(String).filter(Boolean) : orderNo ? [String(orderNo)] : [];

      if (targetIds.length === 0 && targetOrderNos.length === 0) {
        return NextResponse.json({ success: false, error: '유효한 발주 ID 또는 번호가 필요합니다.' }, { status: 400 });
      }

      const reason = cancelReason || '사용자 요청에 의한 발주 취소';
      const cancelResult = await prisma.$transaction(async (tx) => {
        const targets = await tx.purchaseOrder.findMany({
          where: {
            OR: [
              ...(targetIds.length > 0 ? [{ id: { in: targetIds } }] : []),
              ...(targetOrderNos.length > 0 ? [{ orderNo: { in: targetOrderNos } }] : []),
            ],
          },
          include: { details: { select: { receivedQty: true } } },
        });
        const blocked = targets.filter(
          (po) =>
            po.status === '입고완료' ||
            po.status === '부분입고' ||
            po.details.some((d) => Number(d.receivedQty || 0) > 0)
        );
        if (blocked.length > 0) {
          return { blocked };
        }
        await tx.purchaseOrder.updateMany({
          where: { id: { in: targets.map((t) => t.id) } },
          data: {
            status: '발주취소',
            cancelReason: reason,
            cancelDate: kstToday(),
          },
        });
        if (targets.length > 0) {
          const orderNoSummary = targets.slice(0, 5).map((t) => t.orderNo).join(', ') + (targets.length > 5 ? ` 외 ${targets.length - 5}건` : '');
          await recordOrderAuditLog(tx, actor, '발주취소', `발주서 ${targets.length}건 취소 (${orderNoSummary}) - ${reason}`);
        }
        return { blocked: [], count: targets.length };
      }, { maxWait: 20000, timeout: 60000 });

      if (cancelResult.blocked.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `이미 입고된 품목이 포함된 발주는 취소할 수 없습니다. (${cancelResult.blocked.map((b) => b.orderNo).join(', ')})`,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, message: '발주가 성공적으로 취소되었습니다.' });
    }

    // 2) 발주서 영구 삭제 (DB에서 PurchaseOrder 및 하위 Details 완전 삭제)
    if (action === 'delete') {
      const delAuth = await requireSession({ categoryId: 'purchase', action: 'delete' });
      if (delAuth.error) return delAuth.error;
      return await handleDeleteOrders(body, delAuth.user);
    }

    // 3) 단일 발주 품목 삭제
    if (action === 'delete_detail' && (detailId || id)) {
      const delAuth = await requireSession({ categoryId: 'purchase', action: 'delete' });
      if (delAuth.error) return delAuth.error;
      return await handleDeleteDetail(Number(detailId || id), delAuth.user);
    }

    // 3-2) 다중 발주 품목 일괄 삭제
    if (action === 'delete_details' && Array.isArray(body.detailIds) && body.detailIds.length > 0) {
      const delAuth = await requireSession({ categoryId: 'purchase', action: 'delete' });
      if (delAuth.error) return delAuth.error;
      return await handleDeleteDetails(body.detailIds.map(Number), delAuth.user);
    }

    if (action === 'update_status' && id) {
      const numId = Number(id);
      const allowedStatuses = ['발주', '부분입고', '입고완료', '발주취소', '취소'];
      if (!Number.isInteger(numId) || numId <= 0 || !allowedStatuses.includes(String(status || ''))) {
        return NextResponse.json({ success: false, error: '유효하지 않은 발주 ID 또는 상태값입니다.' }, { status: 400 });
      }
      const updated = await prisma.$transaction(async (tx) => {
        const res = await tx.purchaseOrder.update({
          where: { id: numId },
          data: { status },
        });
        await recordOrderAuditLog(tx, actor, '발주상태변경', `발주서 ${res.orderNo} 상태 변경 → ${status}`);
        return res;
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
          select: { amount: true, remainQty: true, receivedQty: true },
        });
        const newTotalAmount = Math.round(
          allDetails.reduce((s, d) => s + (Number(d.amount) || 0), 0)
        );
        const isCancelled = po.status === '발주취소' || po.status === '취소';
        let nextStatus = po.status;
        if (!isCancelled && allDetails.length > 0) {
          const anyRecv = allDetails.some((d) => (Number(d.receivedQty) || 0) > 0);
          const allClosed = allDetails.every((d) => (Number(d.remainQty) || 0) <= 0);
          nextStatus = anyRecv ? (allClosed ? '입고완료' : '부분입고') : '발주';
        }

        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: {
            totalAmount: newTotalAmount,
            status: nextStatus,
            ...(remark !== undefined ? { remark } : {}),
            ...(deliveryDate !== undefined ? { deliveryDate: normalizeDateYmd(deliveryDate) } : {}),
          },
        });

        await recordOrderAuditLog(
          tx,
          actor,
          '발주서수정',
          `발주서 ${po.orderNo} 수정 (총액 ${newTotalAmount.toLocaleString()}원, 상태 ${nextStatus})`
        );
      }, { maxWait: 20000, timeout: 60000 });

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
  const auth = await requireSession({ categoryId: 'purchase', action: 'delete' });
  if (auth.error) return auth.error;

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
      return await handleDeleteDetail(Number(detailId), auth.user);
    }

    return await handleDeleteOrders({ id, ids, orderNo, orderNos }, auth.user);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '발주서 삭제 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/** 발주서 영구 삭제 로직 (공통) */
async function handleDeleteOrders(
  params: {
    id?: number | string;
    ids?: (number | string)[];
    orderNo?: string;
    orderNos?: string[];
  },
  actor?: AuditActor
) {
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

  // 조회·입고검증·삭제·감사로그를 단일 트랜잭션으로 원자화 (동시 입고와의 경합 방지)
  const txRes = await prisma.$transaction(
    async (tx) => {
      const targetOrders = await tx.purchaseOrder.findMany({
        where: {
          OR: [
            ...(numIds.length > 0 ? [{ id: { in: numIds } }] : []),
            ...(targetOrderNos.length > 0 ? [{ orderNo: { in: targetOrderNos } }] : []),
          ],
        },
        include: { details: true },
      });

      if (targetOrders.length === 0) {
        return { kind: 'not_found' as const };
      }

      const blockedOrders = targetOrders.filter(
        (o) =>
          o.status === '입고완료' ||
          o.status === '부분입고' ||
          o.details.some((d) => (d.receivedQty || 0) > 0)
      );

      if (blockedOrders.length > 0) {
        return {
          kind: 'blocked' as const,
          blockedNos: blockedOrders.map((o) => o.orderNo).join(', '),
        };
      }

      const orderIdsToDelete = targetOrders.map((o) => o.id);
      await tx.purchaseOrderDetail.deleteMany({
        where: { purchaseOrderId: { in: orderIdsToDelete } },
      });
      const res = await tx.purchaseOrder.deleteMany({
        where: { id: { in: orderIdsToDelete } },
      });
      const orderNoSummary =
        targetOrders.slice(0, 5).map((o) => o.orderNo).join(', ') +
        (targetOrders.length > 5 ? ` 외 ${targetOrders.length - 5}건` : '');
      await recordOrderAuditLog(
        tx,
        actor,
        '발주서삭제',
        `발주서 ${res.count}건 영구 삭제 (${orderNoSummary})`
      );
      return {
        kind: 'deleted' as const,
        deletedCount: res.count,
        deletedOrderNos: targetOrders.map((o) => o.orderNo),
      };
    },
    { maxWait: 20000, timeout: 60000 }
  );

  if (txRes.kind === 'not_found') {
    return NextResponse.json(
      { success: false, error: '삭제 대상 발주서를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }
  if (txRes.kind === 'blocked') {
    return NextResponse.json(
      {
        success: false,
        error: `이미 입고 처리되었거나 부분 입고된 발주서(${txRes.blockedNos})는 삭제할 수 없습니다. 입고등록 화면에서 입고를 먼저 취소한 후 삭제해주세요.`,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `선택하신 ${txRes.deletedCount}건의 발주서가 완전히 삭제되었습니다.`,
    deletedCount: txRes.deletedCount,
    deletedOrderNos: txRes.deletedOrderNos,
  });
}

/** 단일 발주 품목 삭제 로직 */
async function handleDeleteDetail(detailId: number, actor?: AuditActor) {
  if (!detailId || isNaN(detailId)) {
    return NextResponse.json(
      { success: false, error: '유효한 품목 ID가 아닙니다.' },
      { status: 400 }
    );
  }

  const txRes = await prisma.$transaction(
    async (tx) => {
      const detail = await tx.purchaseOrderDetail.findUnique({
        where: { id: detailId },
        include: {
          purchaseOrder: {
            include: { details: true },
          },
        },
      });

      if (!detail) {
        return { kind: 'not_found' as const };
      }
      if ((detail.receivedQty || 0) > 0) {
        return { kind: 'blocked' as const };
      }

      const parentOrder = detail.purchaseOrder;
      await tx.purchaseOrderDetail.delete({
        where: { id: detailId },
      });

      const remaining = parentOrder.details.filter((d) => d.id !== detailId);
      if (remaining.length === 0) {
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

      await recordOrderAuditLog(
        tx,
        actor,
        '발주품목삭제',
        `발주서 ${parentOrder.orderNo} 품목 삭제 [${detail.productName || detail.productCode}]`
      );
      return { kind: 'deleted' as const, label: detail.productName || detail.productCode };
    },
    { maxWait: 20000, timeout: 60000 }
  );

  if (txRes.kind === 'not_found') {
    return NextResponse.json(
      { success: false, error: '삭제할 발주 품목을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }
  if (txRes.kind === 'blocked') {
    return NextResponse.json(
      { success: false, error: '이미 입고 처리된 품목은 삭제할 수 없습니다.' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `품목 [${txRes.label}]이(가) 발주서에서 삭제되었습니다.`,
  });
}

/** 다중 발주 품목 일괄 삭제 로직 */
async function handleDeleteDetails(detailIds: number[], actor?: AuditActor) {
  if (!Array.isArray(detailIds) || detailIds.length === 0) {
    return NextResponse.json({ success: false, error: '삭제할 품목 ID 목록이 없습니다.' }, { status: 400 });
  }

  const txRes = await prisma.$transaction(
    async (tx) => {
      const details = await tx.purchaseOrderDetail.findMany({
        where: { id: { in: detailIds } },
        select: { id: true, purchaseOrderId: true, receivedQty: true, productName: true, productCode: true },
      });

      if (details.length === 0) {
        return { kind: 'not_found' as const };
      }
      if (details.some((d) => (d.receivedQty || 0) > 0)) {
        return { kind: 'blocked' as const };
      }

      const parentOrderIds = [...new Set(details.map((d) => d.purchaseOrderId))];

      // 1. 해당 품목들 일괄 삭제
      await tx.purchaseOrderDetail.deleteMany({
        where: { id: { in: detailIds } },
      });

      // 2. 잔여 품목 일괄 조회 후 빈 발주서 일괄 삭제 / 부분 잔존 발주서 합계 재계산 (N+1 쿼리 제거)
      const remainingAll = await tx.purchaseOrderDetail.findMany({
        where: { purchaseOrderId: { in: parentOrderIds } },
        select: { purchaseOrderId: true, amount: true },
      });

      const sumByOrderId = new Map<number, number>();
      for (const row of remainingAll) {
        sumByOrderId.set(
          row.purchaseOrderId,
          (sumByOrderId.get(row.purchaseOrderId) || 0) + (Number(row.amount) || 0)
        );
      }

      const emptyOrderIds = parentOrderIds.filter((pId) => !sumByOrderId.has(pId));
      if (emptyOrderIds.length > 0) {
        await tx.purchaseOrder.deleteMany({
          where: { id: { in: emptyOrderIds } },
        });
      }

      for (const [pId, newTotal] of sumByOrderId.entries()) {
        await tx.purchaseOrder.update({
          where: { id: pId },
          data: { totalAmount: Math.round(newTotal) },
        });
      }

      await recordOrderAuditLog(
        tx,
        actor,
        '발주품목삭제',
        `발주 품목 ${details.length}건 일괄 삭제 (빈 발주서 ${emptyOrderIds.length}건 함께 삭제)`
      );
      return { kind: 'deleted' as const, deletedCount: details.length };
    },
    { maxWait: 20000, timeout: 60000 }
  );

  if (txRes.kind === 'not_found') {
    return NextResponse.json({ success: false, error: '삭제할 품목을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (txRes.kind === 'blocked') {
    return NextResponse.json(
      { success: false, error: '이미 입고 처리된 품목이 포함되어 있어 삭제할 수 없습니다.' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `선택하신 ${txRes.deletedCount}개 품목이 발주서에서 완전히 삭제되었습니다.`,
    deletedCount: txRes.deletedCount,
  });
}
