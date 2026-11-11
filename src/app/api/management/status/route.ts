import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { requireSession } from '@/lib/apiAuth';

const CENTER_NAME_MAP: Record<string, string> = {
  'C60810': '양산조리센터(수D)',
  'C68110': '부산조리센터(수D)',
  'CVV20': '(주)지에스리테일(해인CVS)',
  'CVV25': '(주)지에스리테일진주일배',
  'CVV57': '(주)지에스리테일김해일배',
  'CVV58': '(주)지에스리테일김해2일배',
  'CVV65': '㈜지에스리테일익산일배',
  'CVV83': '지에스리테일경산저온',
  'CVV84': '㈜지에스리테일경산2저온',
  'CVV95': '(주)지에스리테일신광주저온',
  'CVV96': '(주)지에스리테일신광주2저온',
  'CVV97': '(주)지에스리테일경산3저온',
};

// GET /api/management/status?date=2026-11-05
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    // 1. 최근 가용 정산일자 조회 (배송 및 가매출 테이블 기준)
    const [delivDates, provDates] = await Promise.all([
      prisma.delivery.findMany({
        where: { status: { not: '취소' } },
        select: { deliveryDate: true },
        distinct: ['deliveryDate'],
        orderBy: { deliveryDate: 'desc' },
        take: 30,
      }),
      prisma.provisionalSalesStatus.findMany({
        select: { statusDate: true },
        distinct: ['statusDate'],
        orderBy: { statusDate: 'desc' },
        take: 30,
      }),
    ]);

    const allDates = Array.from(
      new Set([
        ...delivDates.map((d) => d.deliveryDate),
        ...provDates.map((p) => p.statusDate),
      ])
    ).sort((a, b) => b.localeCompare(a));

    const targetDate = dateParam || allDates[0] || kstToday();

    // 2. 가매출 상태 테이블 및 매출/매입 현황 조회
    const [salesPurchase, provisionalRows, deliveries] = await Promise.all([
      prisma.salesPurchaseStatus.findMany({
        orderBy: { statusDate: 'desc' },
        take: 50,
      }),
      prisma.provisionalSalesStatus.findMany({
        where: { statusDate: targetDate },
        orderBy: { id: 'asc' },
      }),
      prisma.delivery.findMany({
        where: { deliveryDate: targetDate, status: { not: '취소' } },
        include: { details: true },
        orderBy: { centerCode: 'asc' },
      }),
    ]);

    // 3. 센터별 정밀 정산 집계 (배송 및 미출 상세 내역 기반)
    const centerMap: Record<string, any> = {};

    if (deliveries.length > 0) {
      deliveries.forEach((d) => {
        const cCode = d.centerCode || 'UNKNOWN';
        const rawStore = d.remark?.replace(/\[미출엑셀\]|\s*\(미출.*?\)/g, '').trim() || '';
        const cName = CENTER_NAME_MAP[cCode] || rawStore || cCode;

        if (!centerMap[cCode]) {
          centerMap[cCode] = {
            id: d.id,
            centerCode: cCode,
            partnerName: cName,
            provQty: 0,
            provAmt: 0,
            undelivQty: 0,
            undelivAmt: 0,
            confirmQty: 0,
            confirmAmt: 0,
            achieveRate: 100,
            itemCount: 0,
            details: [],
          };
        }

        const centerItem = centerMap[cCode];

        d.details.forEach((dt) => {
          const rem = dt.remark || '';
          const m = rem.match(/미출\s*(\d+)개\s*\(([0-9,]+)원\)/);
          const unQty = m ? parseInt(m[1], 10) : 0;
          const unAmt = m ? parseInt(m[2].replace(/,/g, ''), 10) : 0;
          const dQty = dt.deliveryQty || 0;
          const dAmt = dt.amount || 0;
          const ordQty = dQty + unQty;
          const ordAmt = dAmt + unAmt;

          centerItem.confirmQty += dQty;
          centerItem.confirmAmt += dAmt;
          centerItem.undelivQty += unQty;
          centerItem.undelivAmt += unAmt;
          centerItem.provQty += ordQty;
          centerItem.provAmt += ordAmt;
          centerItem.itemCount += 1;

          centerItem.details.push({
            id: dt.id,
            deliveryId: d.id,
            centerCode: cCode,
            productCode: dt.productCode,
            productName: dt.productName,
            unitPrice: dt.unitPrice,
            orderQty: ordQty,
            orderAmt: ordAmt,
            delivQty: dQty,
            delivAmt: dAmt,
            unDelivQty: unQty,
            unDelivAmt: unAmt,
            remark: dt.remark || '',
          });
        });
      });
    } else if (provisionalRows.length > 0) {
      // 배송 상세가 없는 과거 일자의 경우 ProvisionalSalesStatus 레코드 매핑
      provisionalRows.forEach((p, idx) => {
        const provAmt = p.provisionalSales || 0;
        const undelivAmt = p.undeliveredAmount || 0;
        const confirmAmt = p.confirmedAmount || Math.max(0, provAmt - undelivAmt);
        const estPrice = provAmt > 0 ? 1900 : 1;
        const provQty = Math.round(provAmt / estPrice);
        const undelivQty = Math.round(undelivAmt / estPrice);
        const confirmQty = Math.max(0, provQty - undelivQty);

        centerMap[`PROV-${idx}`] = {
          id: p.id,
          centerCode: `C-${idx + 1}`,
          partnerName: p.remark || `GSR 센터 ${idx + 1}`,
          provQty,
          provAmt,
          undelivQty,
          undelivAmt,
          confirmQty,
          confirmAmt,
          achieveRate: provAmt > 0 ? Math.round((confirmAmt / provAmt) * 1000) / 10 : 100,
          itemCount: 1,
          details: [],
        };
      });
    }

    const settlementList = Object.values(centerMap).map((c, idx) => ({
      ...c,
      id: c.id || idx + 1,
      achieveRate:
        c.provAmt > 0
          ? Math.round((c.confirmAmt / c.provAmt) * 1000) / 10
          : c.provQty > 0
          ? 0
          : 100,
    }));

    // 전체 KPI 합계 산출
    const totalProvQty = settlementList.reduce((s, c) => s + c.provQty, 0);
    const totalProvAmt = settlementList.reduce((s, c) => s + c.provAmt, 0);
    const totalUndelivQty = settlementList.reduce((s, c) => s + c.undelivQty, 0);
    const totalUndelivAmt = settlementList.reduce((s, c) => s + c.undelivAmt, 0);
    const totalConfirmQty = settlementList.reduce((s, c) => s + c.confirmQty, 0);
    const totalConfirmAmt = settlementList.reduce((s, c) => s + c.confirmAmt, 0);
    const overallRate =
      totalProvAmt > 0
        ? Math.round((totalConfirmAmt / totalProvAmt) * 1000) / 10
        : 100;

    return NextResponse.json({
      success: true,
      data: {
        date: targetDate,
        availableDates: allDates,
        salesPurchase,
        provisional: provisionalRows,
        settlement: settlementList,
        summary: {
          totalProvQty,
          totalProvAmt,
          totalUndelivQty,
          totalUndelivAmt,
          totalConfirmQty,
          totalConfirmAmt,
          overallRate,
          centerCount: settlementList.length,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/management/status
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'management', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const { type, ...data } = body;

    if (type === 'sales_purchase') {
      const sales = Number(data.salesAmount) || 0;
      const purchase = Number(data.purchaseAmount) || 0;
      const profit = sales - purchase;
      const profitRate = sales > 0 ? (profit / sales) * 100 : 0;

      const created = await prisma.salesPurchaseStatus.create({
        data: {
          statusDate: data.statusDate || kstToday(),
          statusMonth: data.statusMonth || new Date().toISOString().slice(0, 7),
          salesAmount: sales,
          purchaseAmount: purchase,
          grossProfit: profit,
          grossProfitRate: profitRate,
          remark: data.remark || '',
        },
      });
      return NextResponse.json({ success: true, data: created });
    }

    if (type === 'provisional') {
      const created = await prisma.provisionalSalesStatus.create({
        data: {
          statusDate: data.statusDate || kstToday(),
          provisionalSales: Number(data.provisionalSales) || 0,
          undeliveredAmount: Number(data.undeliveredAmount) || 0,
          confirmedAmount: Number(data.confirmedAmount) || 0,
          remark: data.remark || '',
        },
      });
      return NextResponse.json({ success: true, data: created });
    }

    return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
