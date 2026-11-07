import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

const STATUSES = ['대기', '출하', '완료', '취소'] as const;

// PUT /api/sales/delivery/[id] — 납품 상태 변경 및 전표(품목/수량/단가) 수정 파이프라인
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const me = (session?.user as any) || { id: 1, loginId: 'admin', name: '관리자' };

    const { id } = await context.params;
    const deliveryId = Number(id);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { details: true },
    });

    if (!delivery) {
      return NextResponse.json({ success: false, error: '해당 납품 전표를 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await req.json();

    // 케이스 1: 단순 상태값만 변경하는 경우 (빠른 상태 전환)
    if (body.status && !body.details && !body.deliveryDate && !body.centerCode) {
      const status = String(body.status);
      if (!(STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ success: false, error: '상태값이 올바르지 않습니다. (대기/출하/완료/취소)' }, { status: 400 });
      }

      const updated = await prisma.delivery.update({
        where: { id: deliveryId },
        data: { status },
      });

      await prisma.systemLog
        .create({
          data: {
            logDate: new Date().toISOString(),
            userId: Number(me.id) || undefined,
            loginId: String(me.loginId || 'admin'),
            userName: String(me.name || '관리자'),
            action: '납품상태변경',
            menuId: 'sales-delivery-status-edit',
            menuName: '납품현황및전표수정',
            detail: `${me.name || me.loginId} 납품 전표 ${delivery.deliveryNo} 상태: ${delivery.status} → ${status}`,
          },
        })
        .catch(() => {});

      await touchDashboardSnapshot();
      return NextResponse.json({ success: true, data: updated, message: `전표 상태가 '${status}'(으)로 변경되었습니다.` });
    }

    // 케이스 2: 전표 상세 품목/수량/단가 및 헤더 전체 수정 (정밀 전표 수정)
    const result = await prisma.$transaction(async (tx) => {
      const details = Array.isArray(body.details) ? body.details : [];
      let nextTotalQty = 0;
      let nextTotalAmount = 0;

      const currentDetailIds = new Set(delivery.details.map((d) => d.id));
      const incomingDetailIds = new Set(details.filter((d: any) => d.id).map((d: any) => Number(d.id)));

      // 1. 제거된 품목 삭제
      for (const curId of currentDetailIds) {
        if (!incomingDetailIds.has(curId)) {
          await tx.deliveryDetail.delete({ where: { id: curId } });
        }
      }

      // 2. 품목 업데이트 및 신규 생성
      for (const item of details) {
        const qty = Math.max(0, Number(item.deliveryQty || 0));
        const price = Math.max(0, Number(item.unitPrice || 0));
        const amt = Math.round(qty * price);
        nextTotalQty += qty;
        nextTotalAmount += amt;

        if (item.id && currentDetailIds.has(Number(item.id))) {
          await tx.deliveryDetail.update({
            where: { id: Number(item.id) },
            data: {
              productCode: String(item.productCode || ''),
              productName: String(item.productName || ''),
              deliveryQty: qty,
              unitPrice: price,
              amount: amt,
              boxQty: Number(item.boxQty || 0),
              remark: item.remark !== undefined ? String(item.remark) : undefined,
            },
          });
        } else {
          await tx.deliveryDetail.create({
            data: {
              deliveryId,
              productCode: String(item.productCode || ''),
              productName: String(item.productName || ''),
              deliveryQty: qty,
              unitPrice: price,
              amount: amt,
              boxQty: Number(item.boxQty || 0),
              remark: String(item.remark || ''),
            },
          });
        }
      }

      // 3. 헤더 업데이트
      const updatedDelivery = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          deliveryDate: body.deliveryDate ? String(body.deliveryDate) : delivery.deliveryDate,
          centerCode: body.centerCode ? String(body.centerCode) : delivery.centerCode,
          shift: body.shift ? String(body.shift) : delivery.shift,
          status: body.status && (STATUSES as readonly string[]).includes(body.status) ? String(body.status) : delivery.status,
          totalQty: nextTotalQty,
          totalAmount: nextTotalAmount,
          remark: body.remark !== undefined ? String(body.remark) : delivery.remark,
        },
        include: { details: true },
      });

      return updatedDelivery;
    });

    // 시스템 변경 로그 기록
    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || 'admin'),
          userName: String(me.name || '관리자'),
          action: '전표상세수정',
          menuId: 'sales-delivery-status-edit',
          menuName: '납품현황및전표수정',
          detail: `납품 전표(${delivery.deliveryNo}) 품목 수정 완료 (수량: ${result.totalQty}, 금액: ₩${result.totalAmount.toLocaleString()})`,
        },
      })
      .catch(() => {});

    await touchDashboardSnapshot();

    return NextResponse.json({
      success: true,
      data: result,
      message: `납품 전표(${result.deliveryNo})가 성공적으로 수정 저장되었습니다.`,
    });
  } catch (error: any) {
    console.error('Error updating delivery:', error);
    return NextResponse.json(
      { success: false, error: error.message || '납품 전표 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE /api/sales/delivery/[id] — 납품 전표 삭제 파이프라인
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const me = (session?.user as any) || { id: 1, loginId: 'admin', name: '관리자' };

    const { id } = await context.params;
    const deliveryId = Number(id);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { details: true },
    });

    if (!delivery) {
      return NextResponse.json({ success: false, error: '해당 납품 전표를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 트랜잭션으로 상세 품목 및 헤더 삭제
    await prisma.$transaction(async (tx) => {
      await tx.deliveryDetail.deleteMany({ where: { deliveryId } });
      await tx.delivery.delete({ where: { id: deliveryId } });
    });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || 'admin'),
          userName: String(me.name || '관리자'),
          action: '전표삭제',
          menuId: 'sales-delivery-status-edit',
          menuName: '납품현황및전표수정',
          detail: `납품 전표 ${delivery.deliveryNo} 완전 삭제`,
        },
      })
      .catch(() => {});

    await touchDashboardSnapshot();

    return NextResponse.json({
      success: true,
      message: `납품 전표(${delivery.deliveryNo})가 삭제되었습니다.`,
    });
  } catch (error: any) {
    console.error('Error deleting delivery:', error);
    return NextResponse.json(
      { success: false, error: error.message || '전표 삭제 실패' },
      { status: 500 }
    );
  }
}
