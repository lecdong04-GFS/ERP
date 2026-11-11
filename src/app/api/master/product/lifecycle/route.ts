import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIp, requireSession } from '@/lib/apiAuth';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

function nowKstTimestamp(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * GET /api/master/product/lifecycle
 * 삭제(status='삭제') 및 비활성(isUsed=false) 원·부자재 품목 목록 조회
 * - ?scope=ui (기본): 발주 화면 등에서 담당자가 직접 삭제(SystemLog '품목삭제')한 품목만 반환
 * - ?scope=deleted: 엑셀·기초 데이터 삭제 포함 status='삭제' 전체 반환
 * - ?scope=all: 이관·불용·출고정지·단종·발주제외 포함 비활성 전체 반환
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const scopeParam = searchParams.get('scope');
    const scope = scopeParam === 'all' ? 'all' : scopeParam === 'deleted' ? 'deleted' : 'ui';

    const products = await prisma.product.findMany({
      where: {
        category: { notIn: ['완성품', '반제품'] },
        OR: [{ status: '삭제' }, { isUsed: false }],
      },
      select: {
        id: true,
        productCode: true,
        name: true,
        category: true,
        warehouse: true,
        spec: true,
        unit: true,
        boxQty: true,
        targetOrderDays: true,
        orderCycle: true,
        status: true,
        isUsed: true,
        discontinuedDate: true,
        partner: { select: { id: true, name: true } },
      },
      orderBy: [{ id: 'desc' }],
    });

    const ids = products.map((p) => p.id);

    const [inventories, lifecycleLogs] = await Promise.all([
      ids.length > 0
        ? prisma.inventory.findMany({
            where: { productId: { in: ids } },
            select: { productId: true, currentQty: true, warehouse: true },
          })
        : Promise.resolve([]),
      prisma.systemLog.findMany({
        where: { action: { in: ['품목삭제', '품목복구'] } },
        orderBy: { id: 'desc' },
        take: 500,
        select: { id: true, action: true, logDate: true, userName: true, detail: true },
      }),
    ]);

    const stockByPid = new Map<number, number>();
    for (const inv of inventories) {
      if (inv.productId == null) continue;
      stockByPid.set(inv.productId, (stockByPid.get(inv.productId) || 0) + (Number(inv.currentQty) || 0));
    }

    // 동일 품목의 가장 최신(id DESC) 생애주기 로그가 '품목삭제'인지 판별
    const latestLifecycleByPid = new Map<
      number,
      { id: number; action: string; logDate: string; userName: string; detail: string }
    >();
    for (const log of lifecycleLogs) {
      const m = /\[ID:(\d+)\]/.exec(log.detail || '');
      if (!m) continue;
      const pid = Number(m[1]);
      if (!latestLifecycleByPid.has(pid)) {
        latestLifecycleByPid.set(pid, {
          id: log.id,
          action: log.action,
          logDate: log.logDate,
          userName: log.userName,
          detail: log.detail,
        });
      }
    }

    let uiDeletedCount = 0;
    let deletedCount = 0;
    const enriched = products.map((p) => {
      const isSoftDeleted = p.status === '삭제' || (!p.isUsed && (!p.status || p.status === '정상'));
      if (isSoftDeleted) deletedCount += 1;
      const latestLog = latestLifecycleByPid.get(p.id);
      const isUiDeleted = latestLog?.action === '품목삭제';
      if (isUiDeleted) uiDeletedCount += 1;
      return {
        id: p.id,
        productCode: p.productCode,
        name: p.name,
        category: p.category,
        warehouse: p.warehouse || '',
        spec: p.spec || '',
        unit: p.unit || 'EA',
        boxQty: Number(p.boxQty) || 0,
        targetOrderDays: Number(p.targetOrderDays) || 0,
        orderCycle: p.orderCycle || '',
        status: p.status || (p.isUsed ? '정상' : '삭제'),
        isUsed: p.isUsed,
        isSoftDeleted,
        isUiDeleted,
        discontinuedDate: p.discontinuedDate || '',
        partnerName: p.partner?.name || '',
        currentStock: stockByPid.get(p.id) || 0,
        deletedAt: isUiDeleted ? latestLog?.logDate || '' : '',
        deletedBy: isUiDeleted ? latestLog?.userName || '' : '',
      };
    });

    // 최근 삭제순 우선 정렬 (로그가 있는 경우 logDate DESC)
    enriched.sort((a, b) => {
      if (a.deletedAt && b.deletedAt) return b.deletedAt.localeCompare(a.deletedAt);
      if (a.deletedAt) return -1;
      if (b.deletedAt) return 1;
      return b.id - a.id;
    });

    const items =
      scope === 'all'
        ? enriched
        : scope === 'deleted'
        ? enriched.filter((p) => p.isSoftDeleted || p.status === '삭제')
        : enriched.filter((p) => p.isUiDeleted);

    return NextResponse.json({
      success: true,
      data: {
        items,
        uiDeletedCount,
        deletedCount,
        totalInactiveCount: enriched.length,
      },
    });
  } catch (error: any) {
    console.error('Failed to load lifecycle products:', error);
    return NextResponse.json(
      { success: false, error: error?.message || '삭제 품목 목록 조회 실패' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/master/product/lifecycle
 * 품목 소프트 삭제(status='삭제', isUsed=false) 및 복구(status='정상', isUsed=true)
 * - BOM/발주/입고/수불부/재고 외래키 무결성 보호를 위해 물리 DELETE 대신 소프트 삭제/복구 사용
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'purchase', action: 'write' });
  if (auth.error) return auth.error;
  const me = auth.user;
  const clientIp = getClientIp(req);

  try {
    const body = await req.json();

    const action = body?.action;
    if (action !== 'delete' && action !== 'restore') {
      return NextResponse.json(
        { success: false, error: "action 파라미터는 'delete' 또는 'restore'여야 합니다." },
        { status: 400 }
      );
    }

    const rawIds: number[] = Array.isArray(body?.ids)
      ? body.ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];
    const singleId = Number(body?.id);
    if (Number.isInteger(singleId) && singleId > 0 && !rawIds.includes(singleId)) {
      rawIds.push(singleId);
    }

    if (rawIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '대상 품목 id가 필요합니다.' },
        { status: 400 }
      );
    }

    const existing = await prisma.product.findMany({
      where: { id: { in: rawIds } },
      select: { id: true, name: true, productCode: true, status: true, isUsed: true },
    });

    if (existing.length === 0) {
      return NextResponse.json(
        { success: false, error: '해당 품목을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const foundIds = existing.map((p) => p.id);
    const reason = String(body?.reason || '').trim();
    const isDelete = action === 'delete';

    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { id: { in: foundIds } },
        data: isDelete
          ? { isUsed: false, status: '삭제' }
          : { isUsed: true, status: '정상' },
      });

      const ts = nowKstTimestamp();
      await tx.systemLog.createMany({
        data: existing.map((p) => ({
          logDate: ts,
          userId: me.id,
          loginId: me.loginId,
          userName: me.name,
          action: isDelete ? '품목삭제' : '품목복구',
          menuId: 'pur-mat-order-day',
          menuName: '스마트 자재발주(요일별)',
          detail: `[ID:${p.id}] ${p.name} (${p.productCode}) ${
            isDelete ? '발주/재고조회 소프트 삭제' : '정상 품목 복구'
          } (이전: ${p.status || (p.isUsed ? '정상' : '비활성')}${reason ? ` / 사유: ${reason}` : ''})`,
          ipAddress: clientIp,
        })),
      });
    });

    await touchDashboardSnapshot().catch(() => {});

    return NextResponse.json({
      success: true,
      action,
      count: foundIds.length,
      ids: foundIds,
      items: existing.map((p) => ({
        id: p.id,
        name: p.name,
        productCode: p.productCode,
        status: isDelete ? '삭제' : '정상',
        isUsed: !isDelete,
      })),
    });
  } catch (error: any) {
    console.error('Failed to update product lifecycle:', error);
    return NextResponse.json(
      { success: false, error: error?.message || '품목 상태 변경 실패' },
      { status: 500 }
    );
  }
}
