import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';
import { calcExpectedDeliveryInfo, isExcludedFromOrder } from '@/lib/gfs/orderCalc';
import { isTerminalProductStatus } from '@/lib/gfs/productStatus';
import {
  normalizePackUnit,
  pickLatestValidPurchasePrice,
  resolveBagPrice,
  isBoxUnitLabel,
  unitPriceForOrderUnit,
} from '@/lib/gfs/pricing';

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
    // 로그인 세션 및 구매 쓰기 권한 필수: 담당자 신원으로 발주 기록
    const auth = await requireSession({ categoryId: 'purchase', action: 'write' });
    if (auth.error) return auth.error;
    const me = auth.user;
    const actorLabel = `${me.name}(${me.loginId})`;

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
    const foundProducts =
      prodOr.length > 0
        ? await prisma.product.findMany({
            where: { OR: prodOr },
            include: {
              prices: {
                orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
                take: 10,
                select: { effectiveDate: true, purchasePrice: true },
              },
              inventories: {
                select: { unitPrice: true },
              },
            },
          })
        : [];
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
      select: { id: true, name: true, leadTime: true },
      orderBy: { id: 'asc' },
    });
    if (!resolvedDefaultPartner) {
      resolvedDefaultPartner = await prisma.partner.create({
        data: { id: 'P-DEFAULT', name: '일반거래처(미지정)', partnerType: 'P' },
        select: { id: true, name: true, leadTime: true },
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
        ? await prisma.partner.findMany({ where: { OR: partnerOr }, select: { id: true, name: true, leadTime: true } })
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

    const prefix = `PO-${today.replace(/-/g, '')}`;
    let skippedExcludedCount = 0;

    // ── 발주서 다건 생성 + 채번 + 감사로그를 단일 트랜잭션으로 원자화 ──
    const preparedBatches: {
      partner: { id: string; name: string; leadTime: number | null };
      detailData: {
        productId: number;
        productCode: string;
        productName: string;
        category: string;
        unit: string;
        orderQty: number;
        unitPrice: number;
        amount: number;
        remainQty: number;
      }[];
      totalAmount: number;
      earliestDeliveryDate: string;
    }[] = [];

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

      const expectedDates: string[] = [];

      for (const it of groupItems) {
        const product = resolveProduct(it);
        if (!product) continue; // 미등록 품목은 스킵
        const itemName = it.productName || product.name;
        const isPastDisc = Boolean(product.discontinuedDate) && today >= product.discontinuedDate!;
        if (!product.isUsed || isTerminalProductStatus(product.status) || isPastDisc || isExcludedFromOrder(itemName, today)) {
          skippedExcludedCount += 1;
          continue;
        }
        const qty = Number(it.orderQty) || 0;
        if (qty <= 0) continue;
        const deliv = calcExpectedDeliveryInfo({
          orderDate: today,
          orderCycle: product.orderCycle,
          partnerLeadTime: partner.leadTime,
        });
        if (deliv.expectedDate) expectedDates.push(deliv.expectedDate);
        const unit = it.unit || 'box';
        const pack = normalizePackUnit(product.boxQty);
        const invValidPrice = (product.inventories || []).reduce(
          (best, inv) => (best > 0 ? best : Number(inv.unitPrice) || 0),
          0
        );
        const masterBagPrice = resolveBagPrice({
          masterBagPrice: pickLatestValidPurchasePrice(product.prices as any),
          invUnitPrice: invValidPrice,
        });
        const expectedUnitPrice = unitPriceForOrderUnit(masterBagPrice, unit, pack);

        let price = Number(it.unitPrice) || 0;
        if (price <= 0) {
          price = expectedUnitPrice > 0
            ? expectedUnitPrice
            : it.totalAmount && it.totalAmount > 0
              ? Math.round(Number(it.totalAmount) / qty)
              : 0;
        } else if (isBoxUnitLabel(unit) && pack > 1 && expectedUnitPrice > 0) {
          // 이중 입수량 곱셈(박스단가 × 입수량) 또는 박스 발주에 봉단가 오입력 방어
          if (price >= expectedUnitPrice * pack * 0.85 && price > expectedUnitPrice * 1.8) {
            price = expectedUnitPrice;
          } else if (
            masterBagPrice > 0 &&
            Math.abs(price - masterBagPrice) < 0.01 &&
            Math.abs(expectedUnitPrice - masterBagPrice) > 1
          ) {
            price = expectedUnitPrice;
          }
        }
        const lineAmount = Math.round(qty * price);

        detailData.push({
          productId: product.id,
          productCode: product.productCode,
          productName: itemName,
          category: product.category,
          unit,
          orderQty: qty,
          unitPrice: price,
          amount: lineAmount,
          remainQty: qty,
        });
      }

      if (detailData.length === 0) {
        continue; // 매칭 품목 없음 → 해당 그룹 스킵 (불필요한 채번 방지)
      }

      preparedBatches.push({
        partner,
        detailData,
        totalAmount: Math.round(detailData.reduce((a, d) => a + d.amount, 0)),
        earliestDeliveryDate: expectedDates.sort()[0] || '',
      });
    }

    if (preparedBatches.length > 0) {
      await prisma.$transaction(
        async (tx) => {
          const existingOrders = await tx.purchaseOrder.findMany({
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

          for (const batch of preparedBatches) {
            orderSeq += 1;
            let orderNo = `${prefix}-${String(orderSeq).padStart(3, '0')}`;
            while (await tx.purchaseOrder.findUnique({ where: { orderNo }, select: { id: true } })) {
              orderSeq += 1;
              orderNo = `${prefix}-${String(orderSeq).padStart(3, '0')}`;
            }

            await tx.purchaseOrder.create({
              data: {
                orderNo,
                orderDate: today,
                deliveryDate: batch.earliestDeliveryDate,
                partnerId: batch.partner.id,
                partnerName: batch.partner.name,
                orderType: '자재발주',
                status: '발주',
                totalAmount: batch.totalAmount,
                remark: memo || '자재발주(요일별) 연동 생성',
                createdBy: actorLabel,
                details: { create: batch.detailData },
              },
            });

            createdOrders.push({ orderNo, itemCount: batch.detailData.length });
            logRows.push({
              logDate: new Date().toISOString(),
              ...(Number.isFinite(Number((me as any)?.id)) ? { userId: Number((me as any).id) } : {}),
              loginId: String(me.loginId || ''),
              userName: String(me.name || ''),
              action: '자재발주생성',
              menuId: 'pur-mat-order-day',
              menuName: '자재발주(요일별)',
              detail: `${actorLabel} 발주서 ${orderNo} 생성 (${batch.detailData.length}품목, ${batch.totalAmount.toLocaleString()}원)`,
            });
          }

          if (logRows.length > 0) {
            await tx.systemLog.createMany({ data: logRows });
          }
        },
        { maxWait: 20000, timeout: 60000 }
      );
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

    // ── MaterialRequirement 테이블에 자재발주 확정 내역 동기화 (원자적 트랜잭션) ──
    try {
      const matReqData = targetItems
        .filter((it) => {
          if (!(Number(it.orderQty) > 0)) return false;
          const product = resolveProduct(it);
          if (!product || !product.isUsed || isTerminalProductStatus(product.status)) return false;
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

      await prisma.$transaction(
        async (tx) => {
          await tx.materialRequirement.deleteMany({
            where: { reqDate: today, OR: [{ remark: { contains: '스마트발주' } }, { remark: { contains: '자재발주' } }] },
          });
          if (matReqData.length > 0) {
            await tx.materialRequirement.createMany({ data: matReqData });
          }
        },
        { maxWait: 20000, timeout: 60000 }
      );
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