import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

// GET /api/inventory/stock?category=원재료&warehouse=상온보관고
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const warehouse = searchParams.get('warehouse');
    const search = searchParams.get('search');

    const where: any = {};
    if (category) where.category = category;
    if (warehouse) where.warehouse = warehouse;
    if (search) {
      where.OR = [
        { productCode: { contains: search } },
        { productName: { contains: search } },
        { lotNo: { contains: search } },
      ];
    }

    const items = await prisma.inventory.findMany({
      where,
      include: {
        product: {
          include: {
            partner: true,
          },
        },
      },
      orderBy: [{ expiryDate: 'asc' }, { productCode: 'asc' }],
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch inventory' },
      { status: 500 }
    );
  }
}

// PUT /api/inventory/stock - 재고 정보 직접입력/수정 일괄 저장
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
  const updates: Array<{
    id: number;
    currentQty?: number;
    dailyUsage?: number;
    unitPrice?: number;
    stockAmount?: number;
    warehouse?: string;
    safetyStock?: number;
    expiryDate?: string;
    productId?: number;
  }> = body.updates || (body.id ? [body] : []);

    if (!updates || updates.length === 0) {
      return NextResponse.json(
        { success: false, error: '저장할 변경 내역이 없습니다.' },
        { status: 400 }
      );
    }

    const results = await prisma.$transaction(
      updates.map((item) => {
        const data: any = {};
        if (item.currentQty !== undefined) data.currentQty = Number(item.currentQty);
        if (item.dailyUsage !== undefined) data.dailyUsage = Number(item.dailyUsage);
        if (item.unitPrice !== undefined) data.unitPrice = Number(item.unitPrice);
        if (item.stockAmount !== undefined) {
          data.stockAmount = Number(item.stockAmount);
        } else if (item.currentQty !== undefined && item.unitPrice !== undefined) {
          data.stockAmount = Number(item.currentQty) * Number(item.unitPrice);
        }
        if (item.warehouse !== undefined) data.warehouse = String(item.warehouse);
        if (item.expiryDate !== undefined) data.expiryDate = String(item.expiryDate);

        return prisma.inventory.update({
          where: { id: Number(item.id) },
          data,
          include: { product: true },
        });
      })
    );

    // 안전재고(Product.safetyStockQty) 업데이트가 있는 경우 별도 반영
    const safetyUpdates = updates.filter(
      (u) => u.safetyStock !== undefined && (u.productId || u.id)
    );
    if (safetyUpdates.length > 0) {
      await Promise.all(
        safetyUpdates.map(async (u) => {
          let pId = u.productId;
          if (!pId) {
            const inv = await prisma.inventory.findUnique({
              where: { id: Number(u.id) },
              select: { productId: true },
            });
            pId = inv?.productId;
          }
          if (pId) {
            await prisma.product.update({
              where: { id: pId },
              data: { safetyStockQty: Number(u.safetyStock) },
            });
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      message: `${results.length}건의 재고 정보가 저장되었습니다.`,
      count: results.length,
      data: results,
    });
  } catch (error: any) {
    console.error('Inventory stock update failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '재고 정보 저장에 실패했습니다.' },
      { status: 500 }
    );
  }
}


// POST /api/inventory/stock - 재고 신규 생성 (재고조사표 업로드 등)
// body: { items: [{ productCode?, productName, warehouse, currentQty, unitPrice, expiryDate, vendor? }] }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const me = (session?.user as any) || { id: 1, loginId: 'admin', name: '관리자' };
    const body = await req.json();
    const items = body.items as Array<{
      productCode?: string;
      productName: string;
      warehouse?: string;
      currentQty?: number;
      unitPrice?: number;
      expiryDate?: string;
      vendor?: string;
      safetyStock?: number;
    }>;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: '생성할 재고 내역이 없습니다.' }, { status: 400 });
    }

    const created: { productCode: string; warehouse: string }[] = [];
    for (const it of items) {
      if (!it.productName && !it.productCode) continue;
      let product = it.productCode
        ? await prisma.product.findUnique({ where: { productCode: it.productCode } })
        : await prisma.product.findFirst({ where: { name: it.productName } });
      if (!product && it.productName) {
        product = await prisma.product.findFirst({ where: { name: it.productName } });
      }
      if (!product) continue;
      // 안전재고가 비어 있으면 자동계산값으로 채움 (수기값 유지)
      const wantSafety = Math.max(0, Math.round(Number(it.safetyStock) || 0));
      if (wantSafety > 0 && !(Number(product.safetyStockQty) > 0)) {
        try {
          product = await prisma.product.update({
            where: { id: product.id },
            data: { safetyStockQty: wantSafety },
          });
        } catch {}
      }
      const warehouse = it.warehouse || product.warehouse || '상온';
      const qty = Number(it.currentQty) || 0;
      const price = Number(it.unitPrice) || 0;
      // 같은 품목+창고 재고가 있으면 수량 갱신, 없으면 생성
      const existInv = await prisma.inventory.findFirst({
        where: { productId: product.id, warehouse },
      });
      if (existInv) {
        await prisma.inventory.update({
          where: { id: existInv.id },
          data: {
            currentQty: qty,
            unitPrice: price,
            stockAmount: qty * price,
            expiryDate: it.expiryDate !== undefined ? String(it.expiryDate) : existInv.expiryDate,
          },
        });
      } else {
        await prisma.inventory.create({
          data: {
            productId: product.id,
            productCode: product.productCode,
            productName: it.productName || product.name,
            category: product.category,
            warehouse,
            currentQty: qty,
            unit: product.unit,
            unitPrice: price,
            stockAmount: qty * price,
            expiryDate: it.expiryDate ? String(it.expiryDate) : '',
            remark: '재고조사표 업로드 생성',
          },
        });
      }
      created.push({ productCode: product.productCode, warehouse });
    }

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: '재고조사표업로드',
          menuId: 'master-stock-lookup',
          menuName: '재고조회',
          detail: `${me.name || me.loginId} 재고조사표 업로드로 ${created.length}건 반영`,
        },
      })
      .catch(() => {});

    await touchDashboardSnapshot();
    return NextResponse.json({ success: true, count: created.length, data: created });
  } catch (error: any) {
    console.error('Inventory stock create failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '재고 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}