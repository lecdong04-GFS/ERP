import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

// GET /api/inventory/stock?category=원재료&warehouse=상온보관고&targetDate=2026-11-09
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const warehouse = searchParams.get('warehouse');
    const search = searchParams.get('search');
    const rawTargetDate = searchParams.get('targetDate');
    const targetDate = rawTargetDate
      ? rawTargetDate.replace(/\./g, '-').slice(0, 10)
      : new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    const where: any = {};
    const andConditions: any[] = [];

    if (category) andConditions.push({ category });
    if (warehouse) andConditions.push({ warehouse });
    if (search) {
      andConditions.push({
        OR: [
          { productCode: { contains: search } },
          { productName: { contains: search } },
          { lotNo: { contains: search } },
        ],
      });
    }

    // 단종/미사용(isUsed=false) 품목 중 현재고가 0인 항목은 기본 목록에서 숨김 처리 (방안 A)
    const includeDiscontinued = searchParams.get('includeDiscontinued') === 'true';
    if (!includeDiscontinued) {
      andConditions.push({
        OR: [
          { product: { isUsed: true } },
          { currentQty: { gt: 0 } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
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

    // 당일(또는 targetDate) 입고 확정 전표(Receiving & ReceivingDetail)로부터 입고수량 집계 (실시간 조회 연동)
    // * 중요: 현재고(currentQty)는 절대 수정/조작하지 않고 순수 입고수량(inQty) 정보만 부착하여 반환
    const receivings = await prisma.receiving.findMany({
      where: {
        receivingDate: targetDate,
        status: { not: '취소' },
      },
      select: {
        details: {
          select: {
            productId: true,
            productCode: true,
            warehouse: true,
            receivedQty: true,
          },
        },
      },
    });

    // 필터와 무관하게 전체 재고 위치를 기준으로 입고수량을 정확한 재고 ID에 매핑
    const allInvs = await prisma.inventory.findMany({
      select: { id: true, productId: true, warehouse: true },
    });
    const invMap = new Map<string, { id: number; productId: number; warehouse: string }>();
    const invsByProd = new Map<number, { id: number; productId: number; warehouse: string }[]>();
    for (const inv of allInvs) {
      invMap.set(`${inv.productId}_${inv.warehouse}`, inv);
      if (!invsByProd.has(inv.productId)) {
        invsByProd.set(inv.productId, []);
      }
      invsByProd.get(inv.productId)!.push(inv);
    }

    const inQtyByInvId = new Map<number, number>();
    for (const r of receivings) {
      for (const d of r.details) {
        let target = invMap.get(`${d.productId}_${d.warehouse}`);
        if (!target) {
          const candidates = invsByProd.get(d.productId);
          if (candidates && candidates.length > 0) {
            target = candidates[0];
          }
        }
        if (target) {
          inQtyByInvId.set(
            target.id,
            (inQtyByInvId.get(target.id) || 0) + (Number(d.receivedQty) || 0)
          );
        }
      }
    }

    const responseItems = items.map((inv) => ({
      ...inv,
      inQty: inQtyByInvId.get(inv.id) || 0,
    }));

    return NextResponse.json({ success: true, data: responseItems });
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

    // 1) DB에 실제로 존재하는 Inventory ID 목록 조회 (존재하지 않는 가상 ID로 인한 트랜잭션 충돌 방지)
    const candidateIds = updates
      .map((u) => Number(u.id))
      .filter((id) => !isNaN(id) && id > 0);

    const existingInvs = await prisma.inventory.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, productId: true },
    });
    const existingIdSet = new Set(existingInvs.map((x) => x.id));
    const prodIdMap = new Map(existingInvs.map((x) => [x.id, x.productId]));

    // 2) 실제 존재하는 ID만 50개 단위 청크 트랜잭션으로 안전하게 갱신 (대용량 락 및 타임아웃 방지)
    const validUpdates = updates.filter((u) => existingIdSet.has(Number(u.id)));

    let results: any[] = [];
    if (validUpdates.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < validUpdates.length; i += CHUNK_SIZE) {
        const slice = validUpdates.slice(i, i + CHUNK_SIZE);
        const chunkResults = await prisma.$transaction(
          slice.map((item) => {
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
        results.push(...chunkResults);
      }
    }

    // 3) 안전재고(Product.safetyStockQty) 업데이트가 있는 경우 별도 반영
    const safetyUpdates = updates.filter(
      (u) => u.safetyStock !== undefined && (u.productId || existingIdSet.has(Number(u.id)))
    );
    if (safetyUpdates.length > 0) {
      await Promise.all(
        safetyUpdates.map(async (u) => {
          const pId = u.productId || prodIdMap.get(Number(u.id));
          if (pId) {
            await prisma.product.update({
              where: { id: pId },
              data: { safetyStockQty: Number(u.safetyStock) },
            }).catch(() => {});
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

    // N+1 순차 쿼리 제거: 전체 품목 및 기존 재고 1회 일괄 조회 후 메모리 매칭 (30초 타임아웃 원천 방지)
    const allProducts = await prisma.product.findMany({
      select: { id: true, productCode: true, name: true, category: true, warehouse: true, unit: true, safetyStockQty: true },
    });
    const prodByCode = new Map(allProducts.map((p) => [p.productCode, p]));
    const prodByName = new Map<string, (typeof allProducts)[number]>();
    allProducts.forEach((p) => {
      if (!prodByName.has(p.name)) prodByName.set(p.name, p);
    });

    const allInventories = await prisma.inventory.findMany({
      select: { id: true, productId: true, warehouse: true, expiryDate: true },
    });
    const invByProdAndWh = new Map<string, (typeof allInventories)[number]>();
    allInventories.forEach((inv) => {
      invByProdAndWh.set(`${inv.productId}||${inv.warehouse}`, inv);
    });

    const toUpdate: { id: number; currentQty: number; unitPrice: number; stockAmount: number; expiryDate?: string }[] = [];
    const toCreate: any[] = [];
    const prodSafetyUpdates: { id: number; safetyStockQty: number }[] = [];
    const created: { productCode: string; warehouse: string }[] = [];

    for (const it of items) {
      if (!it.productName && !it.productCode) continue;
      const product = (it.productCode ? prodByCode.get(it.productCode) : undefined) ||
                      (it.productName ? prodByName.get(it.productName) : undefined);
      if (!product) continue;

      // 안전재고가 비어 있으면 자동계산값으로 채움 (수기값 유지)
      const wantSafety = Math.max(0, Math.round(Number(it.safetyStock) || 0));
      if (wantSafety > 0 && !(Number(product.safetyStockQty) > 0)) {
        prodSafetyUpdates.push({ id: product.id, safetyStockQty: wantSafety });
        product.safetyStockQty = wantSafety; // 중복 업데이트 방지
      }

      const warehouse = it.warehouse || product.warehouse || '상온';
      const qty = Number(it.currentQty) || 0;
      const price = Number(it.unitPrice) || 0;
      const key = `${product.id}||${warehouse}`;
      const existInv = invByProdAndWh.get(key);

      if (existInv) {
        toUpdate.push({
          id: existInv.id,
          currentQty: qty,
          unitPrice: price,
          stockAmount: qty * price,
          expiryDate: it.expiryDate !== undefined ? String(it.expiryDate) : existInv.expiryDate,
        });
      } else {
        toCreate.push({
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
        });
        // 동일 요청 내 중복 생성 방지를 위해 임시 키 등록
        invByProdAndWh.set(key, { id: -1, productId: product.id, warehouse, expiryDate: '' });
      }
      created.push({ productCode: product.productCode, warehouse });
    }

    // 신규 생성은 createMany로 단 1번에 벌크 삽입
    if (toCreate.length > 0) {
      await prisma.inventory.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
    }

    // 기존 재고 업데이트는 50개씩 병렬 청크 처리 (타임아웃 방지)
    const CHUNK_SIZE = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((u) =>
          prisma.inventory.update({
            where: { id: u.id },
            data: {
              currentQty: u.currentQty,
              unitPrice: u.unitPrice,
              stockAmount: u.stockAmount,
              ...(u.expiryDate !== undefined ? { expiryDate: u.expiryDate } : {}),
            },
          })
        )
      );
    }

    // 품목 마스터 안전재고 보강 병렬 실행
    if (prodSafetyUpdates.length > 0) {
      await Promise.all(
        prodSafetyUpdates.slice(0, 50).map((ps) =>
          prisma.product.update({
            where: { id: ps.id },
            data: { safetyStockQty: ps.safetyStockQty },
          }).catch(() => {})
        )
      );
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