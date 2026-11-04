import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

// GET /api/sales/undelivered?startDate=&endDate=
// 미출 현황 = 수주(취소 제외) − 납품(취소 제외), 일자·센터·품목별 집계
// 납품 매칭: 1순위 salesOrderId 연결, 2순위 (센터+품번, 납품일>=수주일) 선입선출 차감
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const today = kstToday();
    const startDate = searchParams.get('startDate') || today;
    const endDate = searchParams.get('endDate') || today;
    const centerCode = searchParams.get('centerCode') || '';

    const orderWhere: any = {
      orderDate: { gte: startDate, lte: endDate },
      status: { not: '취소' },
    };
    if (centerCode) orderWhere.centerCode = centerCode;

    const [orders, deliveries] = await Promise.all([
      prisma.salesOrder.findMany({
        where: orderWhere,
        include: { details: { include: { product: true } } },
        orderBy: [{ orderDate: 'asc' }, { id: 'asc' }],
      }),
      prisma.delivery.findMany({
        where: {
          status: { not: '취소' },
          deliveryDate: { gte: startDate },
        },
        include: { details: true },
        orderBy: [{ deliveryDate: 'asc' }, { id: 'asc' }],
      }),
    ]);

    // 납품 소비 풀: (orderId|null, center, productCode) →殘량 FIFO
    interface DelivLot { deliveryId: number; orderId: number | null; center: string; code: string; date: string; qty: number; }
    const lots: DelivLot[] = [];
    for (const d of deliveries) {
      for (const dt of d.details) {
        const q = Number((dt as any).deliveryQty) || 0;
        if (q <= 0) continue;
        lots.push({
          deliveryId: d.id,
          orderId: (d as any).salesOrderId || null,
          center: d.centerCode || '',
          code: (dt as any).productCode || '',
          date: d.deliveryDate,
          qty: q,
        });
      }
    }

    const consume = (orderId: number, center: string, code: string, orderDate: string, need: number) => {
      let remaining = need;
      const used: { deliveryId: number; qty: number }[] = [];
      // 1순위: 직접 연결분
      for (const lot of lots) {
        if (remaining <= 0) break;
        if (lot.orderId === orderId && lot.code === code && lot.qty > 0) {
          const take = Math.min(lot.qty, remaining);
          lot.qty -= take;
          remaining -= take;
          used.push({ deliveryId: lot.deliveryId, qty: take });
        }
      }
      // 2순위: 같은 센터·품번, 납품일>=수주일 FIFO
      for (const lot of lots) {
        if (remaining <= 0) break;
        if (lot.orderId !== null && lot.orderId !== orderId) continue;
        if (lot.center !== center || lot.code !== code || lot.qty <= 0) continue;
        if (lot.date < orderDate) continue;
        const take = Math.min(lot.qty, remaining);
        lot.qty -= take;
        remaining -= take;
        used.push({ deliveryId: lot.deliveryId, qty: take });
      }
      return { delivered: need - remaining, used };
    };

    const rows: any[] = [];
    for (const o of orders) {
      for (const dt of o.details as any[]) {
        const orderQty = Number(dt.totalQty) || 0;
        if (orderQty <= 0) continue;
        const code = dt.product?.productCode || '';
        const { delivered, used } = consume(o.id, o.centerCode || '', code, o.orderDate, orderQty);
        const unDeliv = Math.max(0, orderQty - delivered);
        const price = Number(dt.unitPrice) || 0;
      rows.push({
        salesOrderId: o.id,
        orderNo: o.orderNo,
        orderDate: o.orderDate,
        centerCode: o.centerCode,
        shift: o.shift,
        orderType: o.orderType,
        status: o.status,
        productId: dt.productId,
        productCode: code,
        productName: dt.product?.name || '',
        kind: dt.product?.kind || '',
        category: dt.product?.category || '완성품',
        spec: dt.product?.spec || '',
        unit: dt.product?.unit || 'ea',
        unitPrice: price,
        orderQty,
        orderQty1: Number((dt as any).orderQty1) || 0,
        orderQty2: Number((dt as any).orderQty2) || 0,
        orderAmt: Math.round(orderQty * price),
          deliveredQty: delivered,
          deliveredAmt: Math.round(delivered * price),
          unDelivQty: unDeliv,
          unDelivAmt: Math.round(unDeliv * price),
          deliveryRefs: used,
          storeName: dt.remark || o.remark || '',
        });
      }
    }

    // 3. 미출 엑셀로 직접 등록된 납품/미납 상세 내역 병합
    const michulDeliveries = deliveries.filter((d) => d.remark?.startsWith('[미출엑셀]'));
    for (const d of michulDeliveries) {
      const storeName = d.remark.replace('[미출엑셀]', '').split('(')[0].trim();
      for (const dt of d.details) {
        const rem = dt.remark || '';
        const m = rem.match(/미출\s*(\d+)개\s*\(([0-9,]+)원\)/);
        const unDeliv = m ? parseInt(m[1], 10) : 0;
        const unDelivAmt = m ? parseInt(m[2].replace(/,/g, ''), 10) : 0;
        const delivQty = dt.deliveryQty || 0;
        const orderQty = delivQty + unDeliv;
        const unitPrice = dt.unitPrice || (orderQty > 0 ? Math.round((dt.amount + unDelivAmt) / orderQty) : 0);

        rows.push({
          salesOrderId: 0,
          orderNo: d.deliveryNo,
          orderDate: d.deliveryDate,
          centerCode: d.centerCode,
          storeName: storeName || d.centerCode,
          shift: d.shift || '1편',
          orderType: '정규',
          status: '완료',
          productId: 0,
          productCode: dt.productCode,
          productName: dt.productName,
          kind: '완제품',
          category: '미출엑셀',
          spec: '',
          unit: 'ea',
          unitPrice,
          orderQty,
          orderQty1: orderQty,
          orderQty2: 0,
          orderAmt: dt.amount + unDelivAmt,
          deliveredQty: delivQty,
          deliveredAmt: dt.amount,
          unDelivQty: unDeliv,
          unDelivAmt,
          deliveryRefs: [{ deliveryId: d.id, qty: delivQty }],
        });
      }
    }

    const onlyShort = searchParams.get('onlyShort') === '1';
    const filtered = onlyShort ? rows.filter((r) => r.unDelivQty > 0) : rows;
    const totalOrder = filtered.reduce((s, r) => s + r.orderQty, 0);
    const totalDelivered = filtered.reduce((s, r) => s + r.deliveredQty, 0);
    const totalUnDeliv = filtered.reduce((s, r) => s + r.unDelivQty, 0);

    return NextResponse.json({
      success: true,
      data: {
        startDate, endDate,
        rows: filtered, rowCount: filtered.length,
        totalOrder, totalDelivered, totalUnDeliv,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '미출 현황 조회 실패' },
      { status: 500 }
    );
  }
}
