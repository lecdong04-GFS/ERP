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

    // ── 일괄 조회: 거래처 + 품목 (요청당 2회) ──
    const groupIds = [...groups.keys()].filter((k) => k !== '__DEFAULT__');
    const groupNames = new Map<string, string>();
    for (const [pid, gi] of groups) {
      if (pid === '__DEFAULT__') continue;
      const nm = String(gi[0]?.partnerName || (gi[0] as any)?.supplier || '').trim();
      if (nm) groupNames.set(pid, nm);
    }
    const partnerOr: any[] = [];
    if (groupIds.length > 0) partnerOr.push({ id: { in: groupIds } });
    const nameList = [...new Set(groupNames.values())];
    if (nameList.length > 0) partnerOr.push({ name: { in: nameList } });
    const foundPartners =
      partnerOr.length > 0
        ? await prisma.partner.findMany({ where: { OR: partnerOr }, select: { id: true, name: true } })
        : [];
    const partnerById = new Map(foundPartners.map((p) => [p.id, p]));
    const partnerByName = new Map(foundPartners.map((p) => [p.name, p]));

    const allCodes = [
      ...new Set(
        [...groups.values()]
          .flatMap((gi) => gi.map((it) => String(it.productCode || '').trim()))
          .filter(Boolean)
      ),
    ];
    const foundProducts =
      allCodes.length > 0
        ? await prisma.product.findMany({ where: { productCode: { in: allCodes } } })
        : [];
    const productByCode = new Map(foundProducts.map((p) => [p.productCode, p]));

    const logRows: {
      logDate: string;
      userId?: number;
      loginId: string;
      userName: string;
      action: string;
      menuId: string;
      menuName: string;
      detail: string;
    }[] = [];
    // 발주서 생성은 채번 충돌 방지를 위해 그룹별 순차 처리 (건당 2회)
    for (const [pid, groupItems] of groups) {
      const usePartnerId = pid === '__DEFAULT__' ? resolvedDefaultPartner!.id : pid;
      const partner =
        partnerById.get(usePartnerId) ??
        (groupNames.has(pid) ? partnerByName.get(groupNames.get(pid)!) : undefined);
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

      // 품목 매칭 (productCode 기준, 일괄 조회 결과 사용)
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
        const code = String(it.productCode || '').trim();
        const product = code ? productByCode.get(code) : undefined;
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
      logRows.push({
        logDate: new Date().toISOString(),
        ...(Number.isFinite(Number((me as any)?.id)) ? { userId: Number((me as any).id) } : {}),
        loginId: String(me.loginId || ''),
        userName: String(me.name || ''),
        action: 'GFS발주생성',
        menuId: 'pur-gfs-smart-order',
        menuName: '스마트발주(GFS)',
        detail: `${actorLabel} 발주서 ${orderNo} 생성 (${detailData.length}품목, ${totalAmount.toLocaleString()}원)`,
      });
    }
    if (logRows.length > 0) {
      await prisma.systemLog.createMany({ data: logRows }).catch(() => {});
    }

    // ── MaterialRequirement 테이블에 GFS 확정 내역 동기화 (파이프라인 연계) ──
    try {
      await prisma.materialRequirement.deleteMany({
        where: { reqDate: today, remark: { contains: '스마트발주' } },
      });
      const matReqData = items
        .filter((it) => Number(it.orderQty) > 0)
        .map((it) => {
          const product = productByCode.get(String(it.productCode || '').trim());
          return {
            reqDate: today,
            shift: '1편',
            productCode: '',
            productName: '',
            materialCode: String(it.productCode || '').trim(),
            materialName: it.productName || product?.name || '',
            category: product?.category || '원재료',
            requiredQty: Number(it.orderQty) || 0,
            unit: it.unit || product?.unit || 'ea',
            partnerId: it.partnerId || product?.partnerId || null,
            partnerName: it.partnerName || '',
            currentStock: 0,
            shortageQty: Number(it.orderQty) || 0,
            status: '확정',
            remark: '스마트발주(GFS) 확정',
          };
        });
      if (matReqData.length > 0) {
        await prisma.materialRequirement.createMany({ data: matReqData });
      }
    } catch (mrErr) {
      console.warn('MaterialRequirement sync warning in order-result:', mrErr);
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