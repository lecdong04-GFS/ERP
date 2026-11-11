import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';

interface OrderResultItem {
  productId?: number;
  productCode: string;
  productName?: string;
  orderQty: number;
  unit?: string;
  unitPrice?: number;
  totalAmount?: number;
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

    const todayKst = kstToday();
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(orderDate || '')) ? String(orderDate) : todayKst;

    // 발주 제외 요청 품목 필터링
    const targetItems = items.filter((it) => {
      const nm = it.productName || '';
      return !isExcludedFromOrder(nm, today);
    });

    if (targetItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: '발주 제외 품목만 포함되어 발주서가 생성되지 않았습니다.',
        count: 0,
        orders: [],
      });
    }

    // ── 품목 일괄 조회 (productId 우선, productCode 보조) ──
    const allIds = [...new Set(targetItems.map((it) => Number(it.productId) || 0).filter((n) => n > 0))];
    const allCodes = [...new Set(targetItems.map((it) => String(it.productCode || '').trim()).filter(Boolean))];
    const prodOr: any[] = [];
    if (allIds.length > 0) prodOr.push({ id: { in: allIds } });
    if (allCodes.length > 0) prodOr.push({ productCode: { in: allCodes } });
    const foundProducts = prodOr.length > 0 ? await prisma.product.findMany({ where: { OR: prodOr } }) : [];
    const productById = new Map(foundProducts.map((p) => [p.id, p]));
    const productByCode = new Map(foundProducts.map((p) => [p.productCode, p]));
    const resolveProduct = (it: OrderResultItem) =>
      (Number(it.productId) ? productById.get(Number(it.productId)) : undefined) ||
      productByCode.get(String(it.productCode || '').trim());

    // 그룹핑: 품목 거래처(요청 partnerId → 품목 마스터 partnerId → 요청 공통 partnerId) 별 1건씩 발주서 생성
    const groups = new Map<string, OrderResultItem[]>();
    for (const it of targetItems) {
      const prod = resolveProduct(it);
      const pid = it.partnerId || prod?.partnerId || partnerId || '__DEFAULT__';
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid)!.push(it);
    }

    // 기본 거래처 확보 (미지정 품목용 안전장치)
    let resolvedDefaultPartner = await prisma.partner.findFirst({
      where: { isUsed: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    if (!resolvedDefaultPartner) {
      resolvedDefaultPartner = await prisma.partner.create({
        data: { id: 'P-DEFAULT', name: '일반거래처(미지정)', partnerType: 'P' },
        select: { id: true, name: true },
      });
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

    // 기본 거래처 등록
    if (resolvedDefaultPartner) {
      partnerById.set(resolvedDefaultPartner.id, resolvedDefaultPartner);
      partnerByName.set(resolvedDefaultPartner.name, resolvedDefaultPartner);
    }

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

    // 발주번호 채번 시퀀스 (당일 기존 번호 기준 중복 없이 연속 채번 - 최대 시퀀스 번호 추적)
    const prefix = `PO-${today.replace(/-/g, '')}`;
    const existingOrders = await prisma.purchaseOrder.findMany({
      where: { orderNo: { startsWith: prefix } },
      select: { orderNo: true },
    });
    let maxSeq = 0;
    for (const o of existingOrders) {
      const match = o.orderNo.match(/PO-\d{8}-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
    let orderSeq = maxSeq;

    let skippedExcludedCount = 0;

    // 발주서 생성: 거래처별 순차 생성 (어떤 품목도 누락되지 않고 100% 저장)
    for (const [pid, groupItems] of groups) {
      const usePartnerId = pid === '__DEFAULT__' ? resolvedDefaultPartner.id : pid;
      const partner =
        partnerById.get(usePartnerId) ??
        (groupNames.has(pid) ? partnerByName.get(groupNames.get(pid)!) : undefined) ??
        resolvedDefaultPartner;

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
        const product = resolveProduct(it);
        if (!product) continue; // 미등록 품목은 스킵
        const itemName = it.productName || product.name;
        const isPastDisc = Boolean(product.discontinuedDate) && today >= product.discontinuedDate!;
        if (!product.isUsed || isPastDisc || isExcludedFromOrder(itemName, today)) {
          skippedExcludedCount += 1;
          continue;
        }
        const qty = Number(it.orderQty) || 0;
        if (qty <= 0) continue;
        const price = Number(it.unitPrice) || 0;
        const lineAmount = it.totalAmount != null && it.totalAmount > 0
          ? Number(it.totalAmount)
          : Math.round(qty * price);

        detailData.push({
          productId: product.id,
          productCode: product.productCode,
          productName: itemName,
          category: product.category,
          unit: it.unit || 'box',
          orderQty: qty,
          unitPrice: price,
          amount: lineAmount,
          remainQty: qty,
        });
      }

      if (detailData.length === 0) {
        continue; // 매칭 품목 없음 → 해당 그룹 스킵 (불필요한 채번 방지)
      }

      orderSeq += 1;
      let orderNo = `${prefix}-${String(orderSeq).padStart(3, '0')}`;
      while (await prisma.purchaseOrder.findUnique({ where: { orderNo }, select: { id: true } })) {
        orderSeq += 1;
        orderNo = `${prefix}-${String(orderSeq).padStart(3, '0')}`;
      }

      const totalAmount = detailData.reduce((a, d) => a + d.amount, 0);

      await prisma.purchaseOrder.create({
        data: {
          orderNo,
          orderDate: today,
          partnerId: partner.id,
          partnerName: partner.name,
          orderType: '자재발주',
          status: '발주',
          totalAmount,
          remark: memo || '자재발주(요일별) 연동 생성',
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
        action: '자재발주생성',
        menuId: 'pur-mat-order-day',
        menuName: '자재발주(요일별)',
        detail: `${actorLabel} 발주서 ${orderNo} 생성 (${detailData.length}품목, ${totalAmount.toLocaleString()}원)`,
      });
    }
    if (logRows.length > 0) {
      await prisma.systemLog.createMany({ data: logRows }).catch(() => {});
    }

    if (createdOrders.length === 0) {
      if (skippedExcludedCount > 0) {
        return NextResponse.json({
          success: true,
          message: '발주 제외 또는 삭제예정일 도래 품목만 포함되어 발주서가 생성되지 않았습니다.',
          count: 0,
          orders: [],
        });
      }
      return NextResponse.json(
        { success: false, error: 'ERP에 등록된 품목과 매칭되는 발주 항목이 없습니다.' },
        { status: 400 }
      );
    }

    // ── MaterialRequirement 테이블에 자재발주 확정 내역 동기화 (파이프라인 연계) ──
    try {
      await prisma.materialRequirement.deleteMany({
        where: { reqDate: today, OR: [{ remark: { contains: '스마트발주' } }, { remark: { contains: '자재발주' } }] },
      });
      const matReqData = targetItems
        .filter((it) => {
          if (!(Number(it.orderQty) > 0)) return false;
          const product = resolveProduct(it);
          if (!product || !product.isUsed) return false;
          const isPastDisc = Boolean(product.discontinuedDate) && today >= product.discontinuedDate!;
          if (isPastDisc || isExcludedFromOrder(it.productName || product.name, today)) return false;
          return true;
        })
        .map((it) => {
          const product = resolveProduct(it);
          return {
            reqDate: today,
            shift: '1편',
            productCode: '',
            productName: '',
            materialCode: product?.productCode || String(it.productCode || '').trim(),
            materialName: it.productName || product?.name || '',
            category: product?.category || '원재료',
            requiredQty: Number(it.orderQty) || 0,
            unit: it.unit || 'box',
            partnerId: it.partnerId || product?.partnerId || null,
            partnerName: it.partnerName || '',
            currentStock: 0,
            shortageQty: Number(it.orderQty) || 0,
            status: '확정',
            remark: '자재발주(요일별) 확정',
          };
        });
      if (matReqData.length > 0) {
        await prisma.materialRequirement.createMany({ data: matReqData });
      }
    } catch (mrErr) {
      console.warn('MaterialRequirement sync warning in order-result:', mrErr);
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