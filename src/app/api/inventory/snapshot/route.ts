import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/inventory/snapshot?date=YYYY-MM-DD → 해당 일자 스냅샷 (없으면 exists:false)
// GET /api/inventory/snapshot?latest=1 → 최신 스냅샷 일자
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get('latest') === '1') {
      const latest = await prisma.inventorySnapshot.findFirst({
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
      });
      return NextResponse.json({ success: true, data: { date: latest?.snapshotDate ?? null } });
    }
    const date = searchParams.get('date') || '';
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ success: false, error: 'date 파라미터가 필요합니다. (YYYY-MM-DD)' }, { status: 400 });
    }
    const rows = await prisma.inventorySnapshot.findMany({
      where: { snapshotDate: date },
      include: { product: { include: { partner: true } } },
      orderBy: [{ warehouse: 'asc' }, { productName: 'asc' }],
    });
    return NextResponse.json({ success: true, data: { date, exists: rows.length > 0, rows } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '스냅샷 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/inventory/snapshot — 일자별 스냅샷 저장 (같은 날짜는 통째로 교체, 멱등)
// body: { date, rows: [{productCode?, productName, warehouse, ...}], createdBy? }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const body = await req.json();
    const date: string = String(body.date || '');
    const rows = body.rows as any[];
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ success: false, error: 'date 파라미터가 필요합니다. (YYYY-MM-DD)' }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: '저장할 스냅샷 내역이 없습니다.' }, { status: 400 });
    }

    const createdBy = String(body.createdBy || `${me.name || me.loginId || '담당자'}`);
    const data: any[] = [];
    for (const r of rows) {
      const productCode = String(r.productCode || '').trim();
      const productName = String(r.productName || r.itemName || '').trim();
      if (!productCode && !productName) continue;
      let product = null as any;
      if (productCode) {
        product = await prisma.product.findUnique({ where: { productCode } }).catch(() => null);
      }
      if (!product && productName) {
        product = await prisma.product.findFirst({ where: { name: productName } }).catch(() => null);
      }
      const qty = Number(r.currentQty) || 0;
      const price = Number(r.unitPrice) || 0;
      data.push({
        snapshotDate: date,
        productId: product?.id ?? null,
        productCode: productCode || product?.productCode || '',
        productName: productName || product?.name || '',
        category: String(r.category || product?.category || ''),
        warehouse: String(r.warehouse || r.whName || product?.warehouse || '상온'),
        lotNo: String(r.lotNo || ''),
        expiryDate: String(r.expiryDate || ''),
        currentQty: qty,
        dailyUsage: Number(r.dailyUsage) || 0,
        packUnit: Number(r.packUnit) || 0,
        boxQty: Number(r.boxQty) || 0,
        pieceQty: Number(r.pieceQty) || 0,
        unit: String(r.unit || product?.unit || ''),
        unitPrice: price,
        stockAmount: Number(r.stockAmount) || qty * price,
        safetyStock: Number(r.safetyStock) || 0,
        inboundDate: String(r.inboundDate || ''),
        vendor: String(r.vendor || ''),
        itemCode: String(r.itemCode || ''),
        itemType: String(r.itemType || ''),
        spec: String(r.spec || product?.spec || ''),
        remark: String(r.remark || ''),
        createdBy,
      });
    }
    if (data.length === 0) {
      return NextResponse.json({ success: false, error: '저장할 스냅샷 내역이 없습니다.' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.inventorySnapshot.deleteMany({ where: { snapshotDate: date } }),
      prisma.inventorySnapshot.createMany({ data }),
    ]);

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '재고스냅샷저장',
          menuId: 'inv-lookup',
          menuName: '재고조회',
          detail: `${me.name || me.loginId} ${date} 재고 스냅샷 ${data.length}건 저장`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, count: data.length, data: { date } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '스냅샷 저장 실패' },
      { status: 500 }
    );
  }
}

// PUT /api/inventory/snapshot — 과거 스냅샷 행 수정
// body: { updates: [{ id, currentQty?, unitPrice?, stockAmount?, warehouse?, expiryDate?, safetyStock?, dailyUsage?, packUnit?, boxQty?, pieceQty?, inboundDate?, vendor? }] }
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const body = await req.json();
    const updates = body.updates as any[];
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ success: false, error: '저장할 변경 내역이 없습니다.' }, { status: 400 });
    }
    const results = await prisma.$transaction(
      updates.map((u) => {
        const d: any = {};
        if (u.currentQty !== undefined) d.currentQty = Number(u.currentQty);
        if (u.unitPrice !== undefined) d.unitPrice = Number(u.unitPrice);
        if (u.stockAmount !== undefined) {
          d.stockAmount = Number(u.stockAmount);
        } else if (u.currentQty !== undefined && u.unitPrice !== undefined) {
          d.stockAmount = Number(u.currentQty) * Number(u.unitPrice);
        }
        if (u.warehouse !== undefined) d.warehouse = String(u.warehouse);
        if (u.expiryDate !== undefined) d.expiryDate = String(u.expiryDate);
        if (u.safetyStock !== undefined) d.safetyStock = Number(u.safetyStock);
        if (u.dailyUsage !== undefined) d.dailyUsage = Number(u.dailyUsage);
        if (u.packUnit !== undefined) d.packUnit = Number(u.packUnit);
        if (u.boxQty !== undefined) d.boxQty = Number(u.boxQty);
        if (u.pieceQty !== undefined) d.pieceQty = Number(u.pieceQty);
        if (u.inboundDate !== undefined) d.inboundDate = String(u.inboundDate);
        if (u.vendor !== undefined) d.vendor = String(u.vendor);
        return prisma.inventorySnapshot.update({ where: { id: Number(u.id) }, data: d });
      })
    );
    return NextResponse.json({ success: true, count: results.length });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '스냅샷 수정 실패' },
      { status: 500 }
    );
  }
}
