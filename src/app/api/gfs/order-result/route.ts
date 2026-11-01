import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

interface OrderResultItem {
  productCode: string;
  productName?: string;
  orderQty: number;
  unit?: string;
  unitPrice?: number;
  partnerId?: string;
  partnerName?: string;
}

// POST /api/gfs/order-result
// GFS 발주 확정분을 ERP 발주서로 생성
// body: { orderDate, partnerId?, memo?, items: OrderResultItem[] }
export async function POST(req: NextRequest) {
  try {
    // 로그인 세션 필수: 담당자 신원으로 발주 기록
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }
    const me = session.user as any;
    const actorLabel = `${me.name || me.loginId || '담당자'}(${me.loginId || me.id || ''})`;

    const body = await req.json();
    const { orderDate, partnerId, memo, items } = body as {
      orderDate?: string;
      partnerId?: string;
      memo?: string;
      items?: OrderResultItem[];
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'items(발주 품목)가 비어 있습니다.' },
        { status: 400 }
      );
    }

    const today = orderDate || kstToday();

    // 그룹핑: partnerId별 1건씩 발주서 생성 (미지정 시 첫 번째 유효 거래처 사용)
    const groups = new Map<string, OrderResultItem[]>();
    for (const it of items) {
      const pid = it.partnerId || partnerId || '__DEFAULT__';
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid)!.push(it);
    }

    let resolvedDefaultPartner: { id: string; name: string } | null = null;
    if (groups.has('__DEFAULT__')) {
      const firstPartner = await prisma.partner.findFirst({
        where: { isUsed: true },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      });
      if (!firstPartner) {
        return NextResponse.json(
          { success: false, error: '유효한 거래처가 없어 발주서를 생성할 수 없습니다.' },
          { status: 400 }
        );
      }
      resolvedDefaultPartner = firstPartner;
    }

    const createdOrders: { orderNo: string; itemCount: number }[] = [];

    for (const [pid, groupItems] of groups) {
      const usePartnerId = pid === '__DEFAULT__' ? resolvedDefaultPartner!.id : pid;
      const partner = await prisma.partner.findUnique({ where: { id: usePartnerId } });
      if (!partner) {
        return NextResponse.json(
          { success: false, error: `거래처를 찾을 수 없습니다: ${usePartnerId}` },
          { status: 400 }
        );
      }

      // 발주번호 채번: PO-YYYYMMDD-###
      const prefix = `PO-${today.replace(/-/g, '')}`;
      const countToday = await prisma.purchaseOrder.count({
        where: { orderNo: { startsWith: prefix } },
      });
      const orderNo = `${prefix}-${String(countToday + 1).padStart(3, '0')}`;

      // 품목 매칭 (productCode 기준)
      const detailData: {
        productId: number;
        productCode: string;
        productName: string;
        category: string;
        unit: string;
        orderQty: number;
        unitPrice: number;
        amount: number;
        remainQty: number;
      }[] = [];

      for (const it of groupItems) {
        const product = await prisma.product.findUnique({
          where: { productCode: it.productCode },
        });
        if (!product) continue; // 미등록 품목은 스킵
        const qty = Number(it.orderQty) || 0;
        if (qty <= 0) continue;
        const price = Number(it.unitPrice) || 0;
        detailData.push({
          productId: product.id,
          productCode: product.productCode,
          productName: it.productName || product.name,
          category: product.category,
          unit: it.unit || product.unit,
          orderQty: qty,
          unitPrice: price,
          amount: qty * price,
          remainQty: qty,
        });
      }

      if (detailData.length === 0) {
        continue; // 매칭 품목 없음 → 해당 그룹 스킵
      }

      const totalAmount = detailData.reduce((a, d) => a + d.amount, 0);

      await prisma.purchaseOrder.create({
        data: {
          orderNo,
          orderDate: today,
          partnerId: partner.id,
          partnerName: partner.name,
          orderType: 'GFS스마트',
          status: '발주',
          totalAmount,
          remark: memo || 'GFS 스마트발주 연동 생성',
          createdBy: actorLabel,
          details: { create: detailData },
        },
      });

      createdOrders.push({ orderNo, itemCount: detailData.length });

      // 발주 감사 로그 (담당자 추적)
      await prisma.systemLog.create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: 'GFS발주생성',
          menuId: 'pur-gfs-smart-order',
          menuName: '스마트발주(GFS)',
          detail: `${actorLabel} 발주서 ${orderNo} 생성 (${detailData.length}품목, ${totalAmount.toLocaleString()}원)`,
        },
      }).catch(() => {});
    }

    if (createdOrders.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ERP에 등록된 품목과 매칭되는 발주 항목이 없습니다.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${createdOrders.length}건의 발주서가 생성되었습니다.`,
      data: createdOrders,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save GFS order result' },
      { status: 500 }
    );
  }
}