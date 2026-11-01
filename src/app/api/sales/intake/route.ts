import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { normName } from '@/lib/gfs/canonical';

interface IntakeItem {
  menuName: string;
  category?: string;
  qty1?: number;
  qty2?: number;
  total?: number;
}

// POST /api/sales/intake — 발주현황(카톡보내기) 수주 일괄등록
// body: { orderDate?: string(기본 오늘), centerCode?, items: [{menuName, category, qty1, qty2, total?}] }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const body = await req.json();
    const orderDate: string = body.orderDate || new Date().toISOString().slice(0, 10);
    const centerCode: string = body.centerCode || 'GSR-001';
    const items = (body.items || []) as IntakeItem[];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'items가 비어 있습니다.' }, { status: 400 });
    }

    let matched = 0;
    let createdProducts = 0;
    let skipped = 0;
    const detailInputs: { productId: number; qty1: number; qty2: number; total: number }[] = [];

    for (const it of items) {
      const name = String(it.menuName || '').trim();
      const qty1 = Math.round(Number(it.qty1) || 0);
      const qty2 = Math.round(Number(it.qty2) || 0);
      const total = it.total != null && Number(it.total) > 0 ? Math.round(Number(it.total)) : qty1 + qty2;
      if (!name || total <= 0) {
        skipped += 1;
        continue;
      }
      let product = await prisma.product.findFirst({ where: { name } });
      if (!product) {
        const norm = normName(name);
        const cand = await prisma.product.findMany({ where: { category: '완성품' }, select: { id: true, productCode: true, name: true } });
        const hit = cand.find((p) => normName(p.name) === norm);
        if (hit) product = await prisma.product.findUnique({ where: { id: hit.id } });
      }
      if (!product) {
        const count = await prisma.product.count();
        let productCode = `FG-${orderDate.replace(/-/g, '').slice(2)}-${String(count + 1).padStart(4, '0')}`;
        let n = 1;
        while (await prisma.product.findUnique({ where: { productCode } })) {
          productCode = `${productCode}-${n++}`;
        }
        product = await prisma.product.create({
          data: {
            productCode,
            name,
            spec: '',
            unit: 'ea',
            category: '완성품',
            kind: '',
            boxQty: 1,
            remark: '수주 intake 자동생성',
          },
        });
        createdProducts += 1;
      } else {
        matched += 1;
      }
      detailInputs.push({ productId: product.id, qty1, qty2, total });
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

    const orderNo = `SO-${orderDate.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
    let totalQty = 0;
    let totalAmount = 0;
    const details = detailInputs.map((d) => {
      totalQty += d.total;
      const unitPrice = priceMap.get(d.productId) ?? 0;
      const amount = Math.round(d.total * unitPrice);
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
        orderType: '정규',
        uploadMethod: '엑셀(발주현황)',
        status: '접수',
        totalAmount,
        totalQty,
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
          detail: `${me.name || me.loginId} 발주현황 수주 ${detailInputs.length}건 등록 (${orderNo}, 매칭 ${matched}건, 신규 ${createdProducts}건)`,
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      data: { orderNo, itemCount: detailInputs.length, matched, createdProducts, skipped },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '수주 intake 실패' },
      { status: 500 }
    );
  }
}
