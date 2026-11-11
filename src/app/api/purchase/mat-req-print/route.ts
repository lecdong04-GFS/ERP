import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';
import { isTerminalProductStatus } from '@/lib/gfs/productStatus';
import {
  CUSTOM_BOM_ALIAS,
  dedupSalesOrders,
  isDummyBomDetail,
  matchBomHeader,
  menuKey,
  normalizeForBom,
  pickLatestValidPrice,
} from '@/lib/gfs/bomMatch';
import {
  BOM_MASTER_RECIPES,
  REPR_MAPPINGS,
} from '@/services/pipeline/ProductionCostPipeline';
import {
  normalizePackUnit,
  pickLatestValidPurchasePrice,
  resolveBagPrice,
  calcBoxPrice,
} from '@/lib/gfs/pricing';

// GET /api/purchase/mat-req-print?date=2026-10-30&shift=ALL&gye=ALL&category=ALL&search=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const shiftParam = searchParams.get('shift') || 'ALL'; // ALL, 1편, 2편
    const gyeParam = searchParams.get('gye') || 'ALL';
    const categoryParam = searchParams.get('category') || 'ALL';
    const searchParam = (searchParams.get('search') || '').trim().toLowerCase();

    // 1. 기준일자 결정 (지정일자 없으면 KST 오늘)
    let targetDate = dateParam || kstToday();

    // 2. 해당 일자의 GS25 완제품 수주 조회 (취소 제외)
    let salesOrders = await prisma.salesOrder.findMany({
      where: {
        orderDate: targetDate,
        status: { not: '취소' },
      },
      include: {
        details: {
          include: {
            product: {
              include: {
                prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
                inventories: true,
                partner: true,
              },
            },
          },
        },
      },
      orderBy: { orderNo: 'asc' },
    });

    // 최근 수주일자 조회 (데이터가 없을 때 UI에서 안내할 용도)
    const latestOrder = await prisma.salesOrder.findFirst({
      where: { status: { not: '취소' } },
      orderBy: { orderDate: 'desc' },
      select: { orderDate: true },
    });
    const latestDateWithOrders = latestOrder?.orderDate || null;

    // 만약 지정된 날짜에 수주가 없는데 파라미터가 없었다면 최근 일자로 자동 폴백
    if (salesOrders.length === 0 && latestDateWithOrders && !dateParam) {
      targetDate = latestDateWithOrders;
      salesOrders = await prisma.salesOrder.findMany({
        where: {
          orderDate: targetDate,
          status: { not: '취소' },
        },
        include: {
          details: {
            include: {
              product: {
                include: {
                  prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
                  inventories: true,
                  partner: true,
                },
              },
            },
          },
        },
        orderBy: { orderNo: 'asc' },
      });
    }

    // 수주가 전혀 없으면 빈 결과 반환
    if (salesOrders.length === 0) {
      return NextResponse.json({
        success: true,
        queryDate: targetDate,
        shift: shiftParam,
        latestDateWithOrders,
        isEmpty: true,
        orderCount: 0,
        totalFinishedOrderQty: 0,
        totalFinishedItemCount: 0,
        gyeList: [],
        categories: ['원재료', '부재료', '포장재'],
        data: [],
        summary: {
          totalItemCount: 0,
          totalReqQty: 0,
          totalShortageCount: 0,
          totalOrderAmt: 0,
        },
      });
    }

    // 3. 완제품별 주문량 집계 (1편, 2편, 합계) — 중복 전표 제거
    const uniqueSalesOrders = dedupSalesOrders(salesOrders);
    const orderAggMap = new Map<
      string,
      {
        product: any;
        qty1: number;
        qty2: number;
        totalQty: number;
      }
    >();

    let totalFinishedOrderQty = 0;
    uniqueSalesOrders.forEach((so) => {
      so.details.forEach((dt) => {
        if (!dt.product) return;
        const code = dt.product.productCode;
        const q1 = Number(dt.orderQty1) || 0;
        const q2 = Number(dt.orderQty2) || 0;
        const tot = Number(dt.totalQty) || q1 + q2;

        totalFinishedOrderQty += tot;

        const prev = orderAggMap.get(code);
        if (prev) {
          prev.qty1 += q1;
          prev.qty2 += q2;
          prev.totalQty += tot;
        } else {
          orderAggMap.set(code, {
            product: dt.product,
            qty1: q1,
            qty2: q2,
            totalQty: tot,
          });
        }
      });
    });

    // 4. 대표품목 매핑 로드
    const reprList = await prisma.reprProduct.findMany({
      where: { isUsed: true },
      include: {
        orderProduct: true,
        reprProduct: true,
      },
    });
    const reprCodeMap = new Map<string, string>();
    reprList.forEach((r) => {
      reprCodeMap.set(r.orderProduct.productCode, r.reprProduct.productCode);
    });

    // 5. DB 등록 BOM 헤더 및 상세 로드
    const bomHeaders = await prisma.bomHeader.findMany({
      where: { isUsed: true },
      include: {
        parentProduct: true,
        details: {
          include: {
            childProduct: {
              include: {
                partner: true,
                prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
                inventories: true,
              },
            },
            gye: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });

    const usableBomHeaders = bomHeaders.filter((bh) =>
      bh.details.some((d) => !isDummyBomDetail(d.unit, d.unitQty) && Number(d.unitQty) > 0),
    );
    usableBomHeaders.sort((a, b) => {
      const aDummy = a.details.some((d) => isDummyBomDetail(d.unit, d.unitQty));
      const bDummy = b.details.some((d) => isDummyBomDetail(d.unit, d.unitQty));
      if (aDummy !== bDummy) return aDummy ? 1 : -1;
      const aCat = a.parentProduct?.category === '완성품' ? 0 : 1;
      const bCat = b.parentProduct?.category === '완성품' ? 0 : 1;
      if (aCat !== bCat) return aCat - bCat;
      return a.id - b.id;
    });

    const dbBomByParentCode = new Map<string, (typeof usableBomHeaders)[0]>();
    const dbBomByName = new Map<string, (typeof usableBomHeaders)[0]>();
    const dbBomByNorm = new Map<string, (typeof usableBomHeaders)[0]>();
    const dbBomByMenuKey = new Map<string, (typeof usableBomHeaders)[0]>();

    usableBomHeaders.forEach((bh) => {
      if (bh.parentProduct?.productCode && !dbBomByParentCode.has(bh.parentProduct.productCode)) {
        dbBomByParentCode.set(bh.parentProduct.productCode, bh);
      }
      if (bh.parentProduct?.name) {
        if (!dbBomByName.has(bh.parentProduct.name)) dbBomByName.set(bh.parentProduct.name, bh);
        const n = normalizeForBom(bh.parentProduct.name);
        if (!dbBomByNorm.has(n)) dbBomByNorm.set(n, bh);
        const mk = menuKey(bh.parentProduct.name);
        if (mk && !dbBomByMenuKey.has(mk)) dbBomByMenuKey.set(mk, bh);
      }
    });

    const findBomForProduct = (prod: any) => {
      if (!prod) return null;
      const orderCode = prod.productCode || '';
      const mappedReprCode = reprCodeMap.get(orderCode);
      if (mappedReprCode && dbBomByParentCode.has(mappedReprCode)) {
        return dbBomByParentCode.get(mappedReprCode);
      }
      if (orderCode && dbBomByParentCode.has(orderCode)) {
        const direct = dbBomByParentCode.get(orderCode)!;
        if (!direct.details.some((d) => isDummyBomDetail(d.unit, d.unitQty))) {
          return direct;
        }
      }
      const matched = matchBomHeader(prod.name || '', prod.id ?? null, usableBomHeaders);
      if (matched) return matched;
      if (prod.name && dbBomByName.has(prod.name)) {
        return dbBomByName.get(prod.name);
      }
      const mk = menuKey(prod.name || '');
      if (mk && dbBomByMenuKey.has(mk)) {
        return dbBomByMenuKey.get(mk);
      }
      const norm = normalizeForBom(prod.name || '');
      if (dbBomByNorm.has(norm)) {
        return dbBomByNorm.get(norm);
      }
      const aliasTarget = CUSTOM_BOM_ALIAS[norm];
      if (aliasTarget) {
        if (dbBomByName.has(aliasTarget)) return dbBomByName.get(aliasTarget);
        const normAlias = normalizeForBom(aliasTarget);
        if (dbBomByNorm.has(normAlias)) return dbBomByNorm.get(normAlias);
      }
      // 부분일치 (길이 4글자 이상)
      for (const [bhNorm, bh] of dbBomByNorm.entries()) {
        if (norm.length >= 4 && (bhNorm.includes(norm) || norm.includes(bhNorm))) {
          return bh;
        }
      }
      return null;
    };

    // 전체 자재의 실재고 사전 조회 (FEFO / 총합)
    const allInventories = await prisma.inventory.findMany({
      where: { currentQty: { gt: 0 } },
      orderBy: { expiryDate: 'asc' },
    });
    const stockMapByCode = new Map<string, number>();
    const stockMapByName = new Map<string, number>();
    allInventories.forEach((inv) => {
      stockMapByCode.set(
        inv.productCode,
        (stockMapByCode.get(inv.productCode) || 0) + inv.currentQty
      );
      stockMapByName.set(
        inv.productName,
        (stockMapByName.get(inv.productName) || 0) + inv.currentQty
      );
    });

    // 6. 자재 소요량 전개 (BOM 다단계 역산)
    // 키: [자재코드 + '::' + 공정(계명칭)]
    interface AggReq {
      partCategory: string;
      partCode: string;
      partName: string;
      partSpec: string;
      partUnit: string;
      gyeName: string;
      recipeYield: number;
      reqQty1: number;
      reqQty2: number;
      reqTotal: number;
      packUnit: number;
      bagPrice: number;
      boxPrice: number;
      unitPrice: number;
      safetyStock: number;
      orderUnit: string;
      orderUnitQty: number;
      minOrderQty: number;
      supplier: string;
    }

    const matReqAgg = new Map<string, AggReq>();

    orderAggMap.forEach(({ product, qty1, qty2, totalQty }) => {
      const orderCode = product.productCode;
      const reprCode =
        reprCodeMap.get(orderCode) ||
        REPR_MAPPINGS.find((m) => m.orderItemCode === orderCode)?.reprItemCode ||
        orderCode;

      // 6-1. DB BOM 확인 (품목객체 기반 다각적 매칭: 코드, 명칭, 정규화, 관용별칭, 대표품목)
      const dbBom =
        findBomForProduct(product) ||
        dbBomByParentCode.get(orderCode) ||
        dbBomByParentCode.get(reprCode);

      if (dbBom && dbBom.details.length > 0) {
        dbBom.details.forEach((bd) => {
          if (isDummyBomDetail(bd.unit, bd.unitQty)) return;
          if (!(Number(bd.unitQty) > 0)) return;
          if (bd.childProductId === dbBom.parentProductId) return;
          if (!bd.level || bd.level >= 2) {
            const child = bd.childProduct as any;
            if (!child || !child.isUsed) return;
            if (child.category === '완성품' || child.category === '반제품') return;
            if (isTerminalProductStatus(child.status)) return;
            if (isExcludedFromOrder(child.name || '', targetDate)) return;
            if (child.discontinuedDate && targetDate >= child.discontinuedDate) return;
            const divisor = Number(child.bomDivisor) > 0 ? Number(child.bomDivisor) : 1000;
            const multiplier = Number(child.bomMultiplier) > 0 ? Number(child.bomMultiplier) : 1;
            const buffer = Number((bd as any).orderBuffer) > 0 ? Number((bd as any).orderBuffer) : 1;
            const u = String(bd.unit || '').trim().toLowerCase();
            const rawUnitQty = u === 'kg' && divisor >= 100 ? bd.unitQty * 1000 : bd.unitQty;
            const factor = (((rawUnitQty * buffer) / ((bd.yieldRate || 100) / 100)) / (divisor > 1 ? divisor : 1)) * multiplier;
            const req1 = Math.round(qty1 * factor * 1000) / 1000;
            const req2 = Math.round(qty2 * factor * 1000) / 1000;
            const reqTot = Math.round(totalQty * factor * 1000) / 1000;

            const gyeName = bd.gye?.name || bd.nextProcess || '성형장';
            const cat =
              child?.category === '부자재'
                ? '부재료'
                : child?.category === '포장재'
                ? '포장재'
                : '원재료';

            const partCode = child?.productCode || `MAT-${bd.childProductId}`;
            const partName = child?.name || `자재-${bd.childProductId}`;
            const aggKey = `${partCode}::${gyeName}`;
            const existing = matReqAgg.get(aggKey);

            if (existing) {
              existing.reqQty1 += req1;
              existing.reqQty2 += req2;
              existing.reqTotal += reqTot;
            } else {
              const packUnit = normalizePackUnit(child?.boxQty);
              const invPrice = (child?.inventories || []).reduce(
                (best: number, inv: any) => (best > 0 ? best : Number(inv.unitPrice) || 0),
                0
              );
              const bagPrice = resolveBagPrice({
                masterBagPrice:
                  pickLatestValidPurchasePrice(child?.prices) ||
                  Number(pickLatestValidPrice(child?.prices)?.purchasePrice) ||
                  0,
                invUnitPrice: invPrice,
              });
              const boxPrice = calcBoxPrice(bagPrice, packUnit);
              matReqAgg.set(aggKey, {
                partCategory: cat,
                partCode,
                partName,
                partSpec: child?.spec || `${bd.unitQty}${bd.unit}`,
                partUnit: child?.unit || '봉',
                gyeName,
                recipeYield: bd.yieldRate || 100,
                reqQty1: req1,
                reqQty2: req2,
                reqTotal: reqTot,
                packUnit,
                bagPrice,
                boxPrice,
                unitPrice: bagPrice,
                safetyStock: child?.safetyStockQty || 0,
                orderUnit: child && child.boxQty > 1 ? 'box' : child?.unit || 'ea',
                orderUnitQty: child?.orderUnitQty || 1,
                minOrderQty: child?.minOrderQty || 1,
                supplier: child?.partner?.name || '미지정거래처',
              });
            }
          }
        });
      } else {
        // 6-2. 레거시 BOM 폴백 (BOM_MASTER_RECIPES)
        const legacyRecipe =
          BOM_MASTER_RECIPES[orderCode] ||
          BOM_MASTER_RECIPES[reprCode] ||
          null;

        if (legacyRecipe) {
          legacyRecipe.forEach((comp) => {
            const gyeName = comp.gyeName || '성형장';
            const rawComponents = comp.subComponents || [comp];

            rawComponents.forEach((raw) => {
              if (raw.level === 3 || (!raw.subComponents && raw.level === 2)) {
                const rawFactor = raw.unitQty / ((raw.yieldRate || 100) / 100);
                const req1 = Math.round(qty1 * rawFactor * 1000) / 1000;
                const req2 = Math.round(qty2 * rawFactor * 1000) / 1000;
                const reqTot = Math.round(totalQty * rawFactor * 1000) / 1000;

                const cat =
                  raw.warehouse === '부재료보관고' || raw.componentName.includes('용기')
                    ? '부재료'
                    : raw.componentName.includes('포장') || raw.componentName.includes('필름')
                    ? '포장재'
                    : '원재료';

                const aggKey = `${raw.componentCode}::${gyeName}`;
                const existing = matReqAgg.get(aggKey);

                if (existing) {
                  existing.reqQty1 += req1;
                  existing.reqQty2 += req2;
                  existing.reqTotal += reqTot;
                } else {
                  matReqAgg.set(aggKey, {
                    partCategory: cat,
                    partCode: raw.componentCode,
                    partName: raw.componentName,
                    partSpec: `${raw.unitQty}${raw.unit}`,
                    partUnit: raw.unit || 'kg',
                    gyeName,
                    recipeYield: raw.yieldRate || 100,
                    reqQty1: req1,
                    reqQty2: req2,
                    reqTotal: reqTot,
                    packUnit: 1,
                    bagPrice: raw.unitCost || 0,
                    boxPrice: raw.unitCost || 0,
                    unitPrice: raw.unitCost || 0,
                    safetyStock: 50,
                    orderUnit: 'box',
                    orderUnitQty: 1,
                    minOrderQty: 1,
                    supplier: raw.componentName.includes('스팸')
                      ? 'CJ제일제당'
                      : raw.componentName.includes('김')
                      ? '대림수산'
                      : '평화영농',
                  });
                }
              }
            });
          });
        }
      }
    });

    // 7. 실재고 조회 및 순부족량, 추천 발주량 산출
    const uniqueGyes = new Set<string>();
    const rows = Array.from(matReqAgg.values()).map((item, idx) => {
      uniqueGyes.add(item.gyeName);

      // 현재고 (코드 매핑 또는 품명 매핑)
      const currentStock =
        stockMapByCode.get(item.partCode) ??
        stockMapByName.get(item.partName) ??
        0;

      // 선택된 편수에 따른 소요계산수량
      let reqCalcQty = item.reqTotal;
      if (shiftParam === '1편') reqCalcQty = item.reqQty1;
      else if (shiftParam === '2편') reqCalcQty = item.reqQty2;

      // 순부족량 = Math.max(0, 소요계산량 + 안전재고 - 현재고)
      const shortageQty = Math.max(
        0,
        Math.round((reqCalcQty + item.safetyStock - currentStock) * 100) / 100
      );

      // 추천 발주수량
      let orderQty = 0;
      if (shortageQty > 0) {
        orderQty =
          Math.ceil(shortageQty / item.orderUnitQty) * item.orderUnitQty;
        if (item.minOrderQty > 0 && orderQty < item.minOrderQty) {
          orderQty = item.minOrderQty;
        }
      }

      const totalAmt = Math.round(orderQty * item.unitPrice);

      let remark = '정상 재고';
      if (currentStock < reqCalcQty) {
        remark = '🚨 결품주의(재고부족)';
      } else if (currentStock < reqCalcQty + item.safetyStock) {
        remark = '⚠️ 안전재고미달';
      }

      return {
        id: idx + 1,
        partCategory: item.partCategory,
        partCode: item.partCode,
        partName: item.partName,
        partSpec: item.partSpec,
        partUnit: item.partUnit,
        gyeName: item.gyeName,
        recipeYield: item.recipeYield,
        reqCalcQty: Number(reqCalcQty.toFixed(2)),
        reqQty1: Number(item.reqQty1.toFixed(2)),
        reqQty2: Number(item.reqQty2.toFixed(2)),
        currentStock: Number(currentStock.toFixed(2)),
        safetyStock: item.safetyStock,
        shortageQty: Number(shortageQty.toFixed(2)),
        orderQty,
        orderUnit: item.orderUnit,
        packUnit: item.packUnit,
        bagPrice: item.bagPrice,
        boxPrice: item.boxPrice,
        unitPrice: item.unitPrice,
        totalAmt,
        supplier: item.supplier,
        remark,
      };
    });

    // 8. 필터링 (공정, 카테고리, 검색어)
    const filteredRows = rows.filter((r) => {
      if (gyeParam !== 'ALL' && r.gyeName !== gyeParam) return false;
      if (categoryParam !== 'ALL' && r.partCategory !== categoryParam) return false;
      if (searchParam) {
        const hitName = r.partName.toLowerCase().includes(searchParam);
        const hitCode = r.partCode.toLowerCase().includes(searchParam);
        const hitSupplier = r.supplier.toLowerCase().includes(searchParam);
        if (!hitName && !hitCode && !hitSupplier) return false;
      }
      return true;
    });

    // 9. 정렬: 카테고리(원재료 -> 부재료 -> 포장재) -> 공정명 -> 품목명
    const catOrder: Record<string, number> = {
      원재료: 1,
      부재료: 2,
      포장재: 3,
    };
    filteredRows.sort((a, b) => {
      const co = (catOrder[a.partCategory] || 99) - (catOrder[b.partCategory] || 99);
      if (co !== 0) return co;
      const go = a.gyeName.localeCompare(b.gyeName, 'ko');
      if (go !== 0) return go;
      return a.partName.localeCompare(b.partName, 'ko');
    });

    // id 재부여
    filteredRows.forEach((r, i) => {
      r.id = i + 1;
    });

    // 집계 요약
    const summary = {
      totalItemCount: filteredRows.length,
      totalReqQty: filteredRows.reduce((acc, r) => acc + r.reqCalcQty, 0),
      totalShortageCount: filteredRows.filter((r) => r.shortageQty > 0).length,
      totalOrderAmt: filteredRows.reduce((acc, r) => acc + r.totalAmt, 0),
    };

    return NextResponse.json({
      success: true,
      queryDate: targetDate,
      shift: shiftParam,
      latestDateWithOrders,
      isEmpty: false,
      orderCount: salesOrders.length,
      totalFinishedOrderQty,
      totalFinishedItemCount: orderAggMap.size,
      gyeList: Array.from(uniqueGyes).sort((a, b) => a.localeCompare(b, 'ko')),
      categories: ['원재료', '부재료', '포장재'],
      data: filteredRows,
      summary,
    });
  } catch (error: any) {
    console.error('Error in /api/purchase/mat-req-print:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '자재소요량 산출 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
