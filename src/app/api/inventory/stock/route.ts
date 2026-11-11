import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';
import { normalizeDateYmd } from '@/lib/gfs/orderCalc';
import { normName } from '@/lib/gfs/norm';
import { pickLatestValidPrice } from '@/lib/gfs/bomMatch';
import {
  normalizeOrderCycleText,
  parseExcelLifecycle,
} from '@/lib/gfs/productStatus';
import { kstToday } from '@/lib/kst';
import {
  calcBoxPrice,
  normalizePackUnit,
  pickLatestValidPurchasePrice,
  resolveBagPrice,
  toBagQty,
} from '@/lib/gfs/pricing';

// GET /api/inventory/stock?category=원재료&warehouse=상온보관고&targetDate=2026-11-09
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const warehouse = searchParams.get('warehouse');
    const search = searchParams.get('search');
    const rawTargetDate = searchParams.get('targetDate');
    const targetDate = rawTargetDate
      ? normalizeDateYmd(rawTargetDate)
      : new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    const where: any = {};
    const andConditions: any[] = [];

    if (category) {
      andConditions.push({ category });
    } else {
      andConditions.push({
        product: { category: { notIn: ['완성품', '반제품'] } },
      });
    }
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

    // 삭제/이관/불용/출고정지/미사용 또는 삭제예정일 도래(discontinuedDate <= targetDate) 품목 중 현재고가 0인 항목은 기본 목록에서 숨김 처리 (방안 A3)
    const includeDiscontinued = searchParams.get('includeDiscontinued') === 'true';
    if (!includeDiscontinued) {
      // 명시적으로 삭제(status='삭제')되었거나 미사용(isUsed=false) 처리된 품목은 잔여 재고가 있더라도 숨김
      andConditions.push({
        product: {
          isUsed: true,
          status: { not: '삭제' },
        },
      });
      andConditions.push({
        OR: [
          {
            product: {
              isUsed: true,
              status: { notIn: ['삭제', '이관', '불용', '출고정지', '단종', '발주제외'] },
              OR: [
                { discontinuedDate: null },
                { discontinuedDate: '' },
                { discontinuedDate: { gt: targetDate } },
              ],
            },
          },
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
            prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
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
            unit: true,
            boxQty: true,
            product: {
              select: { boxQty: true },
            },
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
          const packUnit = normalizePackUnit(d.product?.boxQty || d.boxQty);
          const recvBags = toBagQty(Number(d.receivedQty) || 0, d.unit, packUnit);
          inQtyByInvId.set(
            target.id,
            (inQtyByInvId.get(target.id) || 0) + recvBags
          );
        }
      }
    }

    const responseItems = items.map((inv) => {
      const packUnit = normalizePackUnit(inv.product?.boxQty);
      const bagPrice = resolveBagPrice({
        masterBagPrice: pickLatestValidPurchasePrice(inv.product?.prices),
        invUnitPrice: inv.unitPrice,
      });
      const boxPrice = calcBoxPrice(bagPrice, packUnit);
      const stockAmount =
        bagPrice > 0
          ? Math.round((Number(inv.currentQty) || 0) * bagPrice)
          : (Number(inv.stockAmount) || 0);
      return {
        ...inv,
        unitPrice: bagPrice,
        bagPrice,
        boxPrice,
        packUnit,
        targetOrderDays: Number(inv.product?.targetOrderDays) || 0,
        stockAmount,
        inQty: inQtyByInvId.get(inv.id) || 0,
      };
    });

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
  const auth = await requireSession({ categoryId: 'inventory', action: 'write' });
  if (auth.error) return auth.error;

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
      packUnit?: number;
      boxQty?: number;
      orderCycle?: string;
      targetOrderDays?: number;
      productName?: string;
      status?: string;
      discontinuedDate?: string | null;
      isUsed?: boolean;
      effectiveDate?: string;
      priceEdited?: boolean;
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
            if (item.productName !== undefined && String(item.productName).trim()) {
              data.productName = String(item.productName).trim();
            }

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

    // 3) 안전재고·입수량·발주주기·품명·상태·매입단가(ProductPrice) 동기화 반영
    const masterSyncUpdates = updates.filter(
      (u) =>
        (u.safetyStock !== undefined ||
          u.packUnit !== undefined ||
          u.boxQty !== undefined ||
          u.orderCycle !== undefined ||
          u.targetOrderDays !== undefined ||
          u.productName !== undefined ||
          u.status !== undefined ||
          u.discontinuedDate !== undefined ||
          u.isUsed !== undefined ||
          (u.priceEdited === true && u.unitPrice !== undefined && Number(u.unitPrice) > 0)) &&
        (u.productId || existingIdSet.has(Number(u.id)))
    );
    if (masterSyncUpdates.length > 0) {
      const todayKst = kstToday();
      const targetPids = [
        ...new Set(
          masterSyncUpdates
            .map((u) => u.productId || prodIdMap.get(Number(u.id)))
            .filter((n): n is number => Number(n) > 0)
        ),
      ];
      const existingMasterPrices = targetPids.length
        ? await prisma.productPrice.findMany({
            where: { productId: { in: targetPids } },
            orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
          })
        : [];
      const pricesByPid = new Map<number, typeof existingMasterPrices>();
      for (const pr of existingMasterPrices) {
        const list = pricesByPid.get(pr.productId) || [];
        list.push(pr);
        pricesByPid.set(pr.productId, list);
      }

      await Promise.all(
        masterSyncUpdates.map(async (u) => {
          const pId = u.productId || prodIdMap.get(Number(u.id));
          if (!pId) return;
          const pData: any = {};
          if (u.safetyStock !== undefined) pData.safetyStockQty = Number(u.safetyStock);
          const nextBoxQty = Number(u.boxQty ?? u.packUnit ?? 0);
          if (nextBoxQty > 0 && !(pId === 265 && nextBoxQty === 30)) pData.boxQty = nextBoxQty;
          if (u.orderCycle !== undefined) {
            const normCycle = normalizeOrderCycleText(u.orderCycle);
            if (normCycle || u.orderCycle === '') pData.orderCycle = normCycle;
          }
          if (u.targetOrderDays !== undefined) {
            const nextDays = Number(u.targetOrderDays);
            if (Number.isFinite(nextDays) && nextDays >= 0) {
              pData.targetOrderDays = Math.round(nextDays * 100) / 100;
            }
          }
          if (u.productName !== undefined && String(u.productName).trim()) {
            pData.name = String(u.productName).trim();
          }
          if (u.status !== undefined && String(u.status).trim()) {
            pData.status = String(u.status).trim();
          }
          if (u.isUsed !== undefined) {
            pData.isUsed = Boolean(u.isUsed);
          } else if (pData.status) {
            if (['삭제', '이관', '불용', '출고정지', '단종', '발주제외'].includes(pData.status)) {
              pData.isUsed = false;
            } else if (pData.status === '정상' || pData.status === '삭제예정') {
              pData.isUsed = true;
            }
          }
          if (u.discontinuedDate !== undefined) {
            pData.discontinuedDate = u.discontinuedDate || null;
          }
          if (u.warehouse !== undefined && String(u.warehouse).trim()) {
            pData.warehouse = String(u.warehouse).trim();
          }
          if (Object.keys(pData).length > 0) {
            await prisma.product.update({ where: { id: pId }, data: pData }).catch(() => {});
          }

          const nextPrice = Number(u.unitPrice) || 0;
          if (u.priceEdited === true && nextPrice > 0) {
            const pPrices = pricesByPid.get(pId) || [];
            const latestValid = pickLatestValidPrice(pPrices as any);
            const effDate = u.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(u.effectiveDate) ? u.effectiveDate : todayKst;
            if ((Number(latestValid?.purchasePrice) || 0) !== nextPrice) {
              const sameDay = pPrices.find((pr) => normalizeDateYmd(pr.effectiveDate) === effDate);
              if (sameDay) {
                await prisma.productPrice
                  .update({
                    where: { id: sameDay.id },
                    data: { purchasePrice: nextPrice, remark: '재고조회 봉단가 동기화' },
                  })
                  .catch(() => {});
              } else {
                await prisma.productPrice
                  .create({
                    data: {
                      productId: pId,
                      purchasePrice: nextPrice,
                      deliveryPrice: 0,
                      effectiveDate: effDate,
                      remark: '재고조회 봉단가 동기화',
                    },
                  })
                  .catch(() => {});
              }
            }
            // 동일 품목의 모든 LOT 재고 row에도 봉단가 및 재고금액 동기화
            const siblingLots = await prisma.inventory.findMany({
              where: { productId: pId },
              select: { id: true, currentQty: true, productName: true },
            });
            for (const lot of siblingLots) {
              await prisma.inventory
                .update({
                  where: { id: lot.id },
                  data: {
                    unitPrice: nextPrice,
                    stockAmount: Math.round((Number(lot.currentQty) || 0) * nextPrice),
                    ...(pData.name ? { productName: pData.name } : {}),
                  },
                })
                .catch(() => {});
            }
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
  const auth = await requireSession({ categoryId: 'inventory', action: 'write' });
  if (auth.error) return auth.error;
  const me = auth.user;

  try {
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
      packUnit?: number;
      boxQty?: number;
      orderCycle?: string;
      targetOrderDays?: number;
      status?: string;
      discontinuedDate?: string | null;
      isUsed?: boolean;
      effectiveDate?: string;
      preserveZeroStock?: boolean;
      priceEdited?: boolean;
    }>;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: '생성할 재고 내역이 없습니다.' }, { status: 400 });
    }

    // N+1 순차 쿼리 제거: 전체 원·부자재 품목 및 기존 재고 1회 일괄 조회 후 메모리 매칭 (완성품/반제품 오매칭 차단)
    const allProducts = await prisma.product.findMany({
      where: { category: { notIn: ['완성품', '반제품'] } },
      orderBy: [{ isUsed: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        productCode: true,
        name: true,
        category: true,
        warehouse: true,
        unit: true,
        boxQty: true,
        safetyStockQty: true,
        orderCycle: true,
        targetOrderDays: true,
        status: true,
        discontinuedDate: true,
        isUsed: true,
      },
    });
    const prodByCode = new Map<string, (typeof allProducts)[number]>();
    const prodByName = new Map<string, (typeof allProducts)[number]>();
    const prodByNameWh = new Map<string, (typeof allProducts)[number]>();
    const prodByNorm = new Map<string, (typeof allProducts)[number]>();
    const prodByNormWh = new Map<string, (typeof allProducts)[number]>();
    allProducts.forEach((p) => {
      if (!prodByCode.has(p.productCode)) prodByCode.set(p.productCode, p);
      if (!prodByName.has(p.name)) prodByName.set(p.name, p);
      if (p.warehouse && !prodByNameWh.has(`${p.warehouse}||${p.name}`)) prodByNameWh.set(`${p.warehouse}||${p.name}`, p);
      const nk = normName(p.name);
      if (nk) {
        if (!prodByNorm.has(nk)) prodByNorm.set(nk, p);
        if (p.warehouse && !prodByNormWh.has(`${p.warehouse}||${nk}`)) prodByNormWh.set(`${p.warehouse}||${nk}`, p);
      }
    });

    const allInventories = await prisma.inventory.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, productId: true, warehouse: true, expiryDate: true, currentQty: true, unitPrice: true },
    });
    const invByProdAndWh = new Map<string, (typeof allInventories)[number]>();
    const invByProdId = new Map<number, (typeof allInventories)[number]>();
    allInventories.forEach((inv) => {
      invByProdAndWh.set(`${inv.productId}||${inv.warehouse}`, inv);
      if (!invByProdId.has(inv.productId)) invByProdId.set(inv.productId, inv);
    });

    const allPrices = await prisma.productPrice.findMany({
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
    });
    const pricesByPid = new Map<number, typeof allPrices>();
    for (const pr of allPrices) {
      const list = pricesByPid.get(pr.productId) || [];
      list.push(pr);
      pricesByPid.set(pr.productId, list);
    }

    const todayKst = kstToday();
    const toUpdateByInvId = new Map<
      number,
      { id: number; currentQty: number; unitPrice: number; stockAmount: number; expiryDate?: string; productName?: string; isDeletedRow: boolean }
    >();
    const toCreate: any[] = [];
    const prodMasterUpdates = new Map<number, any>();
    const priceSyncTargets: Array<{ productId: number; price: number; effectiveDate: string }> = [];
    const created: { productCode: string; warehouse: string }[] = [];

    for (const it of items) {
      if (!it.productName && !it.productCode) continue;
      if (/[\r\n]/.test(String(it.productName || ''))) continue;
      const expStr = String(it.expiryDate || '').trim();
      const lifecycle = parseExcelLifecycle(expStr, it.effectiveDate || todayKst);
      const isDeletedRow = lifecycle.isTerminal || /삭제|불용|이관|단종|출고정지/.test(expStr);
      const qty = Number(it.currentQty) || 0;
      if (isDeletedRow && qty <= 0) continue;
      const nmNorm = it.productName ? normName(it.productName) : '';
      const whKey = String(it.warehouse || '').trim();
      // 품명+창고 → 품명 → 품번 → 정규화명+창고 → 정규화명 순 (동일 품번 타창고·삭제행 오덮어쓰기 및 [상온]/[냉동] 충돌 방지)
      const product =
        (it.productName && whKey ? prodByNameWh.get(`${whKey}||${it.productName}`) : undefined) ||
        (it.productName ? prodByName.get(it.productName) : undefined) ||
        (!isDeletedRow && it.productCode ? prodByCode.get(it.productCode) : undefined) ||
        (nmNorm && whKey ? prodByNormWh.get(`${whKey}||${nmNorm}`) : undefined) ||
        (nmNorm ? prodByNorm.get(nmNorm) : undefined);
      if (!product || (!product.isUsed && !lifecycle.isScheduled)) continue;

      const patch: any = prodMasterUpdates.get(product.id) || {};
      // 안전재고가 비어 있으면 자동계산값으로 채움 (수기값 유지)
      const wantSafety = Math.max(0, Math.round(Number(it.safetyStock) || 0));
      if (wantSafety > 0 && !(Number(product.safetyStockQty) > 0)) {
        patch.safetyStockQty = wantSafety;
        product.safetyStockQty = wantSafety;
      }
      // 입수량(K열) 반영 (9개입/9개 품목 K=1 오기 및 혜자도시락김 300봉/box 보호)
      const wantBoxQty = Number(it.boxQty ?? it.packUnit ?? 0);
      if (wantBoxQty > 0 && wantBoxQty !== product.boxQty) {
        const isSpecialPackTypo =
          (wantBoxQty === 1 && /9개/.test(product.name) && product.boxQty === 9) ||
          (product.id === 265 && wantBoxQty === 30 && product.boxQty === 300);
        if (!isSpecialPackTypo) {
          patch.boxQty = wantBoxQty;
          product.boxQty = wantBoxQty;
        }
      }
      // 발주주기(E열) 반영
      const wantCycle = normalizeOrderCycleText(it.orderCycle);
      if (wantCycle && wantCycle !== product.orderCycle) {
        patch.orderCycle = wantCycle;
        product.orderCycle = wantCycle;
      }
      if (it.targetOrderDays !== undefined) {
        const wantDays = Math.round(Number(it.targetOrderDays) * 100) / 100;
        if (Number.isFinite(wantDays) && wantDays > 0 && wantDays !== Number(product.targetOrderDays || 0)) {
          patch.targetOrderDays = wantDays;
          product.targetOrderDays = wantDays;
        }
      }
      // 상태/삭제예정일(G열) 반영
      if (it.status && String(it.status).trim()) {
        patch.status = String(it.status).trim();
      } else if (lifecycle.isScheduled || lifecycle.isTerminal) {
        patch.status = lifecycle.status;
      }
      if (it.isUsed !== undefined) {
        patch.isUsed = Boolean(it.isUsed);
      } else if (patch.status) {
        if (['삭제', '이관', '불용', '출고정지', '단종', '발주제외'].includes(patch.status)) {
          patch.isUsed = false;
        } else if (patch.status === '정상' || patch.status === '삭제예정') {
          patch.isUsed = true;
        }
      }
      if (it.discontinuedDate !== undefined) {
        patch.discontinuedDate = it.discontinuedDate || null;
      } else if (lifecycle.discontinuedDate) {
        patch.discontinuedDate = lifecycle.discontinuedDate;
      }
      if (Object.keys(patch).length > 0) {
        prodMasterUpdates.set(product.id, patch);
      }

      const warehouse = product.warehouse || it.warehouse || '상온';
      const priceInput = Number(it.unitPrice) || 0;
      const key = `${product.id}||${warehouse}`;
      const existInv = invByProdAndWh.get(key) || invByProdId.get(product.id);

      const pPrices = pricesByPid.get(product.id) || [];
      const latestValid = pickLatestValidPrice(pPrices as any);
      const existingMasterPrice = Number(latestValid?.purchasePrice) || 0;
      const shouldUpdatePrice = Boolean(it.priceEdited) || (existingMasterPrice <= 0 && (Number(existInv?.unitPrice) || 0) <= 0);

      const finalQty = it.preserveZeroStock && qty === 0 && existInv ? existInv.currentQty : qty;
      const finalPrice =
        priceInput > 0 && shouldUpdatePrice
          ? priceInput
          : (existingMasterPrice || existInv?.unitPrice || 0);

      if (priceInput > 0 && shouldUpdatePrice && existingMasterPrice !== priceInput) {
        priceSyncTargets.push({
          productId: product.id,
          price: priceInput,
          effectiveDate: it.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(it.effectiveDate) ? it.effectiveDate : todayKst,
        });
      }

      if (existInv) {
        const prev = toUpdateByInvId.get(existInv.id);
        // 같은 배치 내 0수량/삭제행이 기존 유수량 정본 행을 0으로 덮어쓰는 사고 차단
        if (prev && (isDeletedRow || (finalQty === 0 && prev.currentQty > 0))) {
          continue;
        }
        toUpdateByInvId.set(existInv.id, {
          id: existInv.id,
          currentQty: finalQty,
          unitPrice: finalPrice,
          stockAmount: finalQty * finalPrice,
          expiryDate: it.expiryDate !== undefined && !isDeletedRow ? expStr : existInv.expiryDate,
          productName: product.name,
          isDeletedRow,
        });
      } else {
        if (finalQty <= 0 && isDeletedRow) continue;
        toCreate.push({
          productId: product.id,
          productCode: product.productCode,
          productName: product.name,
          category: product.category,
          warehouse,
          currentQty: finalQty,
          unit: product.unit,
          unitPrice: finalPrice,
          stockAmount: finalQty * finalPrice,
          expiryDate: it.expiryDate ? expStr : '',
          remark: '재고조사표 업로드 생성',
        });
        // 동일 요청 내 중복 생성 방지를 위해 임시 키 등록
        invByProdAndWh.set(key, {
          id: -1,
          productId: product.id,
          warehouse,
          expiryDate: '',
          currentQty: finalQty,
          unitPrice: finalPrice,
        });
      }
      created.push({ productCode: product.productCode, warehouse });
    }
    const toUpdate = Array.from(toUpdateByInvId.values());

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
              ...(u.unitPrice > 0 ? { unitPrice: u.unitPrice } : {}),
              stockAmount: u.stockAmount,
              ...(u.productName ? { productName: u.productName } : {}),
              ...(u.expiryDate !== undefined ? { expiryDate: u.expiryDate } : {}),
            },
          })
        )
      );
    }

    // 품목 마스터(안전재고·입수량·발주주기·상태) 보강 병렬 실행
    const masterEntries = Array.from(prodMasterUpdates.entries());
    for (let i = 0; i < masterEntries.length; i += 50) {
      const slice = masterEntries.slice(i, i + 50);
      await Promise.all(
        slice.map(([pid, data]) =>
          prisma.product.update({ where: { id: pid }, data }).catch(() => {})
        )
      );
    }

    // 봉단가(ProductPrice) 동기화 (중복 피하면서 변동분만 반영)
    if (priceSyncTargets.length > 0) {
      const dedupPriceTargets = new Map<number, { productId: number; price: number; effectiveDate: string }>();
      for (const pt of priceSyncTargets) dedupPriceTargets.set(pt.productId, pt);
      const priceEntries = Array.from(dedupPriceTargets.values());
      for (let i = 0; i < priceEntries.length; i += 50) {
        const slice = priceEntries.slice(i, i + 50);
        await Promise.all(
          slice.map(async (pt) => {
            const pPrices = pricesByPid.get(pt.productId) || [];
            const sameDay = pPrices.find((pr) => normalizeDateYmd(pr.effectiveDate) === pt.effectiveDate);
            if (sameDay) {
              await prisma.productPrice
                .update({
                  where: { id: sameDay.id },
                  data: { purchasePrice: pt.price, remark: '재고조사표 업로드 단가 동기화' },
                })
                .catch(() => {});
            } else {
              await prisma.productPrice
                .create({
                  data: {
                    productId: pt.productId,
                    purchasePrice: pt.price,
                    deliveryPrice: 0,
                    effectiveDate: pt.effectiveDate,
                    remark: '재고조사표 업로드 단가 동기화',
                  },
                })
                .catch(() => {});
            }
            const lots = await prisma.inventory.findMany({
              where: { productId: pt.productId },
              select: { id: true, currentQty: true },
            });
            for (const lot of lots) {
              await prisma.inventory
                .update({
                  where: { id: lot.id },
                  data: {
                    unitPrice: pt.price,
                    stockAmount: Math.round((Number(lot.currentQty) || 0) * pt.price),
                  },
                })
                .catch(() => {});
            }
          })
        );
      }
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