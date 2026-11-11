import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { normName } from '@/lib/gfs/canonical';
import { docHashOf } from '@/lib/gfs/docKey';
import { kstToday, makeDocNo } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

interface IntakeItem {
  menuName: string;
  category?: string;
  qty1?: number;
  qty2?: number;
  total?: number;
  productCode?: string;
  unitPrice?: number;
  amount?: number;
}

// POST /api/sales/intake — 발주현황/본발주 수주 일괄등록
// body: { orderDate?, centerCode?, orderType? (정규/추가/슈퍼), uploadMethod?, replaceByDate?, docKeys?: string[], items: [...] }
// 같은 날짜라도 orderType별로 따로 저장(누적) · 같은 파일 재업로드(docKeys 일치)는 스킵
export async function POST(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'sales', action: 'write' });
  if (auth.error) return auth.error;
  const me = auth.user;

  try {
    const body = await req.json();
    const orderDate: string = body.orderDate || kstToday();
    const centerCode: string = body.centerCode || 'GSR-001';
    const items = (body.items || []) as IntakeItem[];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'items가 비어 있습니다.' }, { status: 400 });
    }

    // 종류별 분리 저장 (하루 3종 누적용) + 같은 파일 재업로드 스킵
    const replaceByDate = body.replaceByDate === true;
    const orderType: string = ['정규', '추가', '슈퍼'].includes(String(body.orderType))
      ? String(body.orderType)
      : '정규';
    const uploadMethod: string = String(
      body.uploadMethod || (body.source === '본발주' ? '엑셀(본발주)' : '엑셀(발주현황)')
    );
    const dupKeyword = uploadMethod.includes('본발주') ? '본발주' : '발주현황';
    const docHash = docHashOf(body.docKeys);
    const docMarker = docHash ? `DOC:${docHash}` : null;
    const scope = { orderDate, centerCode, orderType, status: { not: '취소' }, uploadMethod: { contains: dupKeyword } };
    const existingOrders = await prisma.salesOrder.findMany({
      where: scope as any,
      orderBy: { id: 'desc' },
      select: { orderNo: true, totalAmount: true, remark: true, _count: { select: { details: true } } },
    });
    // 같은 파일이면 등록 없이 스킵 (상자 중복 쌓기 방지) — 단, 덮어쓰기(replaceByDate) 시에는 덮어쓰기 허용
    if (!replaceByDate && docMarker && existingOrders.some((o) => (o.remark || '').includes(docMarker))) {
      const dup = existingOrders.find((o) => (o.remark || '').includes(docMarker));
      return NextResponse.json({
        success: true,
        data: {
          orderNo: dup?.orderNo ?? null,
          itemCount: 0,
          matched: 0,
          createdProducts: 0,
          skipped: items.length,
          alreadyRegistered: true,
          message: `${orderDate} [${orderType}] 이미 등록된 파일입니다. (변경 없음)`,
        },
      });
    }
    const existingOrder = existingOrders[0];
    const appended = !replaceByDate && existingOrders.length > 0 && orderType !== '정규';
    if (existingOrder && !replaceByDate && !appended) {
      return NextResponse.json(
        {
          success: false,
          code: 'DUPLICATE_ORDER',
          error: `${orderDate} [${orderType}] 수주가 이미 등록되어 있습니다. (${existingOrder.orderNo}, ${existingOrder._count.details}개 품목)`,
          existingOrderNo: existingOrder.orderNo,
          existingItemCount: existingOrder._count.details,
        },
        { status: 409 }
      );
    }
    if (existingOrders.length > 0 && replaceByDate) {
      await prisma.salesOrder.deleteMany({ where: scope as any });
    }

    let matched = 0;
    let createdProducts = 0;
    let skipped = 0;
    const detailInputs: { productId: number; qty1: number; qty2: number; total: number; unitPrice?: number; amount?: number }[] = [];

    for (const it of items) {
      const name = String(it.menuName || '').trim();
      const qty1 = Math.round(Number(it.qty1) || 0);
      const qty2 = Math.round(Number(it.qty2) || 0);
      const total = it.total != null && Number(it.total) > 0 ? Math.round(Number(it.total)) : qty1 + qty2;
      const givenCode = String(it.productCode || '').trim();
      const givenPrice = Number(it.unitPrice) > 0 ? Math.round(Number(it.unitPrice)) : 0;
      const givenAmount = Number(it.amount) > 0 ? Math.round(Number(it.amount)) : 0;
      if (!name || total <= 0) {
        skipped += 1;
        continue;
      }
      // 코드 우선 매칭 (본발주) → 품명 정확 매칭 → 정규화 매칭
      let product = null as Awaited<ReturnType<typeof prisma.product.findFirst>>;
      if (givenCode) {
        product = await prisma.product.findUnique({ where: { productCode: givenCode } });
      }
      if (!product) {
        product = await prisma.product.findFirst({ where: { name } });
      }
      if (!product) {
        const norm = normName(name);
        const cand = await prisma.product.findMany({ where: { category: '완성품' }, select: { id: true, productCode: true, name: true } });
        const hit = cand.find((p) => normName(p.name) === norm);
        if (hit) product = await prisma.product.findUnique({ where: { id: hit.id } });
      }
      if (!product) {
        let productCode = givenCode;
        if (!productCode) {
          const count = await prisma.product.count();
          productCode = `FG-${orderDate.replace(/-/g, '').slice(2)}-${String(count + 1).padStart(4, '0')}`;
          let n = 1;
          while (await prisma.product.findUnique({ where: { productCode } })) {
            productCode = `${productCode}-${n++}`;
          }
        } else if (await prisma.product.findUnique({ where: { productCode } })) {
          // 동일 코드가 이미 있으면(경쟁 생성) 재조회
          product = await prisma.product.findUnique({ where: { productCode } });
        }
        if (!product) {
          product = await prisma.product.create({
            data: {
              productCode,
              name,
              spec: '',
              unit: 'ea',
              category: '완성품',
              kind: '',
              boxQty: 1,
              remark: dupKeyword === '본발주' ? '본발주 intake 자동생성' : '수주 intake 자동생성',
            },
          });
          createdProducts += 1;
        } else {
          matched += 1;
        }
      } else {
        matched += 1;
      }
      detailInputs.push({ productId: product.id, qty1, qty2, total, unitPrice: givenPrice || undefined, amount: givenAmount || undefined });
    }

    if (detailInputs.length === 0) {
      return NextResponse.json({ success: false, error: '등록할 수주가 없습니다. (수량 0 또는 품명 누락)' }, { status: 400 });
    }

    // 납품단가: 제품별 최신 적용일 기준 ProductPrice.deliveryPrice
    const priceRows = await prisma.productPrice.findMany({
      where: { productId: { in: detailInputs.map((d) => d.productId) } },
      select: { productId: true, deliveryPrice: true, effectiveDate: true },
      orderBy: [{ productId: 'asc' }, { effectiveDate: 'desc' }],
    });
    const priceMap = new Map<number, number>();
    for (const p of priceRows) {
      if (!priceMap.has(p.productId)) priceMap.set(p.productId, Number(p.deliveryPrice) || 0);
    }

    const orderNo = makeDocNo('SO', orderDate);
    let totalQty = 0;
    let totalAmount = 0;
    const details = detailInputs.map((d) => {
      totalQty += d.total;
      // 본발주 단가(발주단가)는 상세에만 저장, 마스터 미갱신. 없으면 마스터 최신가 fallback
      const unitPrice = d.unitPrice && d.unitPrice > 0 ? d.unitPrice : (priceMap.get(d.productId) ?? 0);
      const amount = d.amount && d.amount > 0 ? Math.round(d.amount) : Math.round(d.total * unitPrice);
      totalAmount += amount;
      return {
        productId: d.productId,
        orderQty1: d.qty1,
        orderQty2: d.qty2,
        totalQty: d.total,
        unitPrice,
        amount,
      };
    });

    const order = await prisma.salesOrder.create({
      data: {
        orderNo,
        orderDate,
        centerCode,
        shift: '전체',
        orderType,
        uploadMethod,
        status: '접수',
        totalAmount,
        totalQty,
        remark: docMarker ?? '',
        createdBy: `${me.name || me.loginId || '담당자'}(${(me as any).loginId || ''})`,
        details: { create: details },
      },
    });

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '수주일괄등록',
          menuId: 'sales-order-upload',
          menuName: '주문등록GSR(upload)',
          detail: `${me.name || me.loginId} ${dupKeyword}[${orderType}] 수주 ${detailInputs.length}건 등록 (${orderNo}, 매칭 ${matched}건, 신규 ${createdProducts}건${appended ? ', 누적추가' : ''})`,
        },
      })
      .catch(() => {});

    await touchDashboardSnapshot();
    return NextResponse.json({
      success: true,
      data: { orderNo, orderType, itemCount: detailInputs.length, matched, createdProducts, skipped, appended },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '수주 intake 실패' },
      { status: 500 }
    );
  }
}
