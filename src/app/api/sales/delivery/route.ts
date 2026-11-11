import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { makeDocNo, kstToday } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

const CENTER_NAME_MAP: Record<string, string> = {
  'CVV20': '해인CVS(본부)',
  'CVV25': '진주일배센터',
  'CVV57': '김해일배센터',
  'CVV58': '김해2일배센터',
  'CVV65': '익산일배센터',
  'CVV83': '경산저온센터',
  'CVV84': '경산2저온센터',
  'CVV95': '신광주저온센터',
  'CVV96': '신광주2저온센터',
  'CVV97': '경산3저온센터',
  'C60810': '양산조리센터',
  'C68110': '부산조리센터',
  'GSR-001': 'GSR 김해일배',
  'GSR-002': 'GSR 김해2일배',
  'GSR-003': 'GSR 양산조리',
  'GSR-004': 'GSR 부산물류',
  'GSR-005': 'GSR 신광주저온',
  'GSR-006': 'GSR 신광주2저온',
  'GSR-007': 'GSR 해인CVS',
};

// GET /api/sales/delivery?deliveryDate=2026-11-05
// GET /api/sales/delivery?startDate=2026-10-01&endDate=2026-11-07&status=전체&centerCode=...
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const deliveryDate = searchParams.get('deliveryDate');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const centerCode = searchParams.get('centerCode');
    const search = searchParams.get('search');

    const where: any = {};
    if (deliveryDate) {
      where.deliveryDate = deliveryDate;
    } else if (startDate || endDate) {
      where.deliveryDate = {};
      if (startDate) where.deliveryDate.gte = startDate;
      if (endDate) where.deliveryDate.lte = endDate;
    }

    if (status && status !== '전체' && status !== 'ALL') {
      where.status = status;
    }

    if (centerCode && centerCode !== '전체' && centerCode !== 'ALL') {
      where.centerCode = centerCode;
    }

    if (search) {
      where.OR = [
        { deliveryNo: { contains: search } },
        { centerCode: { contains: search } },
        { details: { some: { productName: { contains: search } } } },
        { details: { some: { productCode: { contains: search } } } },
      ];
    }

    const deliveries = await prisma.delivery.findMany({
      where,
      include: {
        salesOrder: true,
        details: {
          orderBy: { id: 'asc' },
        },
      },
      orderBy: [{ deliveryDate: 'desc' }, { id: 'desc' }],
    });

    // 데이터 조합 및 센터명 매핑, 통계 산출
    let totalQty = 0;
    let totalAmount = 0;
    const statusCounts = { completed: 0, shipped: 0, pending: 0, canceled: 0 };
    const centerStats: Record<string, { code: string; name: string; count: number; qty: number; amount: number }> = {};

    const enriched = deliveries.map((d) => {
      const centerName = CENTER_NAME_MAP[d.centerCode] || d.centerCode || '미지정센터';
      totalQty += d.totalQty;
      totalAmount += d.totalAmount;

      if (d.status === '완료') statusCounts.completed++;
      else if (d.status === '출하') statusCounts.shipped++;
      else if (d.status === '취소') statusCounts.canceled++;
      else statusCounts.pending++;

      if (!centerStats[d.centerCode]) {
        centerStats[d.centerCode] = { code: d.centerCode, name: centerName, count: 0, qty: 0, amount: 0 };
      }
      centerStats[d.centerCode].count++;
      centerStats[d.centerCode].qty += d.totalQty;
      centerStats[d.centerCode].amount += d.totalAmount;

      return {
        ...d,
        centerName,
      };
    });

    const summary = {
      totalCount: enriched.length,
      totalQty,
      totalAmount,
      statusCounts,
      centerStats,
    };

    return NextResponse.json({
      success: true,
      data: enriched,
      totalCount: enriched.length,
      summary,
    });
  } catch (error: any) {
    console.error('Error fetching deliveries:', error);
    return NextResponse.json(
      { success: false, error: error.message || '납품 목록 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/sales/delivery (신규 납품 전표 등록)
export async function POST(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'sales', action: 'write' });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const {
      deliveryDate = kstToday(),
      centerCode = 'CVV20',
      shift = '1편',
      salesOrderId,
      items = [],
      status = '완료',
      remark = '',
    } = body;
    const createdBy = body.createdBy || auth.user.name || auth.user.loginId;

    if (!deliveryDate || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '납품일자와 최소 1개 이상의 품목(items)이 필요합니다.' },
        { status: 400 }
      );
    }

    const deliveryNo = makeDocNo('DELIV', deliveryDate);
    let totalAmount = 0;
    let totalQty = 0;

    const detailRecords = items.map((item: any) => {
      const qty = Math.max(0, Number(item.deliveryQty || item.delivQty || 0));
      const price = Math.max(0, Number(item.unitPrice || 0));
      const amt = Math.round(qty * price);
      totalAmount += amt;
      totalQty += qty;

      return {
        productCode: String(item.productCode || ''),
        productName: String(item.productName || ''),
        deliveryQty: qty,
        unitPrice: price,
        amount: amt,
        boxQty: Number(item.boxQty || 0),
        remark: String(item.remark || ''),
      };
    });

    const delivery = await prisma.delivery.create({
      data: {
        deliveryNo,
        deliveryDate,
        salesOrderId: Number(salesOrderId) > 0 ? Number(salesOrderId) : null,
        centerCode,
        shift,
        status,
        totalAmount,
        totalQty,
        remark,
        createdBy,
        details: {
          create: detailRecords,
        },
      },
      include: {
        details: true,
      },
    });

    await touchDashboardSnapshot();

    return NextResponse.json({
      success: true,
      message: `납품 전표(${deliveryNo})가 성공적으로 등록되었습니다.`,
      data: delivery,
    });
  } catch (error: any) {
    console.error('Error creating delivery:', error);
    return NextResponse.json(
      { success: false, error: error.message || '납품 전표 생성 실패' },
      { status: 500 }
    );
  }
}
