import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday, makeDocNo } from '@/lib/kst';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';
import {
  dedupSalesOrders,
  isDummyBomDetail,
  menuKey,
  pickLatestValidPrice,
} from '@/lib/gfs/bomMatch';
import {
  BOM_MASTER_RECIPES,
  REPR_MAPPINGS,
} from '@/services/pipeline/ProductionCostPipeline';

export const dynamic = 'force-dynamic';

// GET /api/purchase/order-req-confirm?date=2026-10-30&supplier=ALL&search=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const todayKst = kstToday();
    const date = searchParams.get('date') || todayKst;
    const supplierParam = searchParams.get('supplier') || 'ALL';
    const searchParam = (searchParams.get('search') || '').trim().toLowerCase();

    // 1. 해당 일자에 스마트발주(GFS) 또는 기존 발주서로 이미 확정된 내역 조회
    const confirmedOrders = await prisma.purchaseOrder.findMany({
      where: {
        orderDate: date,
        status: { not: '발주취소' },
      },
      include: {
        details: true,
        partner: true,
      },
      orderBy: { orderNo: 'asc' },
    });

    const confirmedItemMap = new Map<
      string,
      {
        orderNo: string;
        orderQty: number;
        unitPrice: number;
        amount: number;
        partnerName: string;
        orderType: string;
      }
    >();

    confirmedOrders.forEach((po) => {
      po.details.forEach((dt) => {
        const code = dt.productCode;
        const prev = confirmedItemMap.get(code);
        if (prev) {
          prev.orderQty += dt.orderQty;
          prev.amount += dt.amount;
        } else {
          confirmedItemMap.set(code, {
            orderNo: po.orderNo,
            orderQty: dt.orderQty,
            unitPrice: dt.unitPrice,
            amount: dt.amount,
            partnerName: po.partnerName || po.partner?.name || '',
            orderType: po.orderType || 'GFS스마트',
          });
        }
      });
    });

    // 2. 소요량 테이블(MaterialRequirement) 조회
    const requirements = await prisma.materialRequirement.findMany({
      where: { reqDate: date },
    });
    const reqMap = new Map<string, number>();
    for (const r of requirements) {
      reqMap.set(r.materialCode, (reqMap.get(r.materialCode) || 0) + r.requiredQty);
    }

    // 3. 만약 MaterialRequirement가 비어있다면, 해당 일자 GS25 수주 및 BOM을 통해 실시간 소요량 연산
    if (reqMap.size === 0) {
      const salesOrders = await prisma.salesOrder.findMany({
        where: { orderDate: date, status: { not: '취소' } },
        include: { details: { include: { product: true } } },
      });

      if (salesOrders.length > 0) {
        const uniqueSalesOrders = dedupSalesOrders(salesOrders);
        // 완제품별 수량 집계 (코드 + 품명 보존)
        const prodAgg = new Map<string, { qty: number; name: string }>();
        uniqueSalesOrders.forEach((so) => {
          so.details.forEach((dt) => {
            if (!dt.product) return;
            const code = dt.product.productCode;
            const tot = Number(dt.totalQty) || (Number(dt.orderQty1) || 0) + (Number(dt.orderQty2) || 0);
            const prev = prodAgg.get(code) || { qty: 0, name: dt.product.name || '' };
            prev.qty += tot;
            prodAgg.set(code, prev);
          });
        });

        // DB BOM 로드
        const bomHeaders = await prisma.bomHeader.findMany({
          where: { isUsed: true },
          include: {
            parentProduct: true,
            details: { include: { childProduct: true } },
          },
          orderBy: { id: 'asc' },
        });
        const bomMap = new Map<string, (typeof bomHeaders)[0]>();
        const bomByMenuKey = new Map<string, (typeof bomHeaders)[0]>();
        bomHeaders.forEach((bh) => {
          if (bh.parentProduct?.productCode) {
            bomMap.set(bh.parentProduct.productCode, bh);
          }
          const mk = menuKey(bh.parentProduct?.name || '');
          if (mk && !bomByMenuKey.has(mk)) {
            bomByMenuKey.set(mk, bh);
          }
        });

        prodAgg.forEach(({ qty: orderQty, name: orderName }, orderCode) => {
          const reprCode =
            REPR_MAPPINGS.find((m) => m.orderItemCode === orderCode)?.reprItemCode || orderCode;
          const dbBom =
            bomMap.get(orderCode) ||
            bomMap.get(reprCode) ||
            bomByMenuKey.get(menuKey(orderName));

          if (dbBom && dbBom.details.length > 0) {
            dbBom.details.forEach((bd) => {
              if (isDummyBomDetail(bd.unit, bd.unitQty)) return;
              if (bd.level === 3 || bd.level === 2) {
                const cp = bd.childProduct as any;
                const childCode = cp.productCode;
                const childName = cp.name || '';
                // 발주 제외 요청 품목 및 비활성/단종예정 도래 품목 스킵 (date 기준 동적 비교)
                const childDisc = cp.discontinuedDate;
                if (
                  isExcludedFromOrder(childName, date) ||
                  !cp.isUsed ||
                  (childDisc && date >= childDisc)
                ) {
                  return;
                }
                const divisor = Number(cp.bomDivisor) > 0 ? Number(cp.bomDivisor) : 1000;
                const factor = (bd.unitQty / ((bd.yieldRate || 100) / 100)) / (divisor > 1 ? divisor : 1);
                const req = Math.round(orderQty * factor * 100) / 100;
                reqMap.set(childCode, (reqMap.get(childCode) || 0) + req);
              }
            });
          } else {
            const legacyRecipe =
              BOM_MASTER_RECIPES[orderCode] || BOM_MASTER_RECIPES[reprCode];
            if (legacyRecipe) {
              legacyRecipe.forEach((comp) => {
                const rawComponents = comp.subComponents || [comp];
                rawComponents.forEach((raw) => {
                  if (raw.level === 3 || raw.level === 2) {
                    if (isExcludedFromOrder(raw.componentName, date)) {
                      return;
                    }
                    const rawFactor = raw.unitQty / ((raw.yieldRate || 100) / 100);
                    const req = Math.round(orderQty * rawFactor * 100) / 100;
                    reqMap.set(raw.componentCode, (reqMap.get(raw.componentCode) || 0) + req);
                  }
                });
              });
            }
          }
        });
      }
    }

    // 4. 입고예정량 (PurchaseOrderDetail 중 아직 미입고 상태인 것) 집계
    const pendingOrders = await prisma.purchaseOrderDetail.findMany({
      where: {
        purchaseOrder: {
          status: { in: ['발주', '부분입고'] },
          orderDate: { not: date }, // 당일 발주 제외
        },
      },
      select: {
        productId: true,
        productCode: true,
        remainQty: true,
      },
    });
    const pendingMap = new Map<string, number>();
    for (const po of pendingOrders) {
      pendingMap.set(po.productCode, (pendingMap.get(po.productCode) || 0) + (po.remainQty || 0));
    }

    // 5. 자재 마스터 로드
    const materials = await prisma.product.findMany({
      where: {
        category: { in: ['원재료', '부자재', '포장재'] },
        isUsed: true,
      },
      include: {
        partner: true,
        prices: { orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: 10 },
        inventories: true,
      },
      orderBy: { productCode: 'asc' },
    });

    // 6. 데이터 병합 및 행 생성 (발주 제외 및 삭제예정일 도래 품목 제외 — date 기준 동적 비교)
    const activeMaterials = materials.filter((m) => {
      if (isExcludedFromOrder(m.name, date)) return false;
      if (m.discontinuedDate && date >= m.discontinuedDate) return false;
      return true;
    });

    const allRows = activeMaterials.map((m, index) => {
      const currentStock = m.inventories.reduce((acc, inv) => acc + inv.currentQty, 0);
      const reqQty = reqMap.get(m.productCode) || 0;
      const incomingScheduled = pendingMap.get(m.productCode) || 0;
      const safetyStock = m.safetyStockQty || 0;

      // 순소요량 (Net Requirement)
      const netShortage = Math.max(0, reqQty + safetyStock - (currentStock + incomingScheduled));

      // 발주단위 및 최소발주수량 적용한 권장수량
      const orderUnit = m.orderUnitQty > 0 ? m.orderUnitQty : 1;
      let recommendedOrderQty = 0;
      if (netShortage > 0) {
        recommendedOrderQty = Math.ceil(netShortage / orderUnit) * orderUnit;
        if (m.minOrderQty > 0 && recommendedOrderQty < m.minOrderQty) {
          recommendedOrderQty = m.minOrderQty;
        }
      }

      // 스마트발주(GFS) 확정 여부 확인
      const confirmed = confirmedItemMap.get(m.productCode);
      const isConfirmed = !!confirmed;
      const finalOrderQty = isConfirmed ? confirmed.orderQty : recommendedOrderQty;

      const unitPrice = confirmed?.unitPrice || Number(pickLatestValidPrice(m.prices as any)?.purchasePrice) || 0;
      const amount = finalOrderQty * unitPrice;
      const boxQty = m.boxQty > 0 ? m.boxQty : 1;
      const expectedBox = boxQty > 0 ? Math.ceil(finalOrderQty / boxQty) : 0;

      let status = '정상 재고';
      if (isConfirmed) {
        status = '확정완료(자재발주)';
      } else if (finalOrderQty > 0) {
        status = '발주대상';
      }

      return {
        id: index + 1,
        category: m.category,
        itemName: m.name,
        materialCode: m.productCode,
        spec: m.spec || '',
        unit: m.unit || 'ea',
        supplier: confirmed?.partnerName || m.partner?.name || '미지정거래처',
        partnerId: m.partnerId || '',
        orderUnit: m.boxQty > 1 ? 'box' : m.unit || 'ea',
        minOrderQty: m.minOrderQty || 1,
        orderQty: finalOrderQty,
        unitPrice,
        orderAmt: amount,
        calcQty: Number(netShortage.toFixed(2)),
        unitQty: boxQty,
        orderUnitQty: m.orderUnitQty || 1,
        leadTime: m.partner?.leadTime || 1,
        clientStock: 0,
        safetyStock,
        currentStock: Number(currentStock.toFixed(2)),
        incomingScheduledBox: boxQty > 0 ? Math.ceil(incomingScheduled / boxQty) : 0,
        incomingScheduled: Number(incomingScheduled.toFixed(2)),
        stockQty: Number(currentStock.toFixed(2)),
        isConfirmed,
        orderNo: confirmed?.orderNo || '',
        status,
      };
    });

    // 필터링 (거래처, 검색어)
    const filteredRows = allRows.filter((r) => {
      if (supplierParam !== 'ALL' && !r.supplier.includes(supplierParam)) return false;
      if (searchParam) {
        const hitName = r.itemName.toLowerCase().includes(searchParam);
        const hitCode = r.materialCode.toLowerCase().includes(searchParam);
        const hitSupplier = r.supplier.toLowerCase().includes(searchParam);
        if (!hitName && !hitCode && !hitSupplier) return false;
      }
      return true;
    });

    // 최근 발주 확정 일자 확인
    const latestPo = await prisma.purchaseOrder.findFirst({
      where: { status: { not: '발주취소' } },
      orderBy: { orderDate: 'desc' },
      select: { orderDate: true },
    });

    return NextResponse.json({
      success: true,
      queryDate: date,
      hasGfsOrders: confirmedOrders.length > 0,
      confirmedOrderCount: confirmedOrders.length,
      confirmedOrderNos: confirmedOrders.map((o) => o.orderNo),
      latestDateWithOrders: latestPo?.orderDate || null,
      data: filteredRows,
      summary: {
        totalItemCount: filteredRows.length,
        totalOrderQty: filteredRows.reduce((acc, r) => acc + r.orderQty, 0),
        totalOrderAmt: filteredRows.reduce((acc, r) => acc + r.orderAmt, 0),
        confirmedCount: filteredRows.filter((r) => r.isConfirmed).length,
        targetCount: filteredRows.filter((r) => r.orderQty > 0).length,
      },
    });
  } catch (error: any) {
    console.error('Error in order-req-confirm GET:', error);
    return NextResponse.json(
      { success: false, error: error.message || '소요량 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST /api/purchase/order-req-confirm (최종 검토 후 발주서 일괄 생성 및 파이프라인 동기화)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderDate, items = [], createdBy = 'admin' } = body;

    const today = orderDate || kstToday();

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '발주 품목이 비어 있습니다.' },
        { status: 400 }
      );
    }

    const validItems = items.filter((item: any) => Number(item.orderQty) > 0);
    if (validItems.length === 0) {
      return NextResponse.json(
        { success: false, error: '발주수량이 1 이상인 품목이 없습니다.' },
        { status: 400 }
      );
    }

    // 거래처별 그룹핑
    const partnerGroups = new Map<string, any[]>();
    for (const item of validItems) {
      const pKey = item.partnerId || item.supplier || 'DEFAULT_PARTNER';
      if (!partnerGroups.has(pKey)) partnerGroups.set(pKey, []);
      partnerGroups.get(pKey)!.push(item);
    }

    const createdOrders: any[] = [];

    await prisma.$transaction(async (tx) => {
      // 기존 해당 일자/거래처의 미입고 발주서가 있다면 갱신을 위해 삭제 후 재성성
      let partnerIdx = 1;
      for (const [partnerKey, groupItems] of partnerGroups.entries()) {
        let partner = await tx.partner.findFirst({
          where: {
            OR: [{ id: partnerKey }, { name: groupItems[0]?.supplier }],
          },
        });

        if (!partner) {
          partner = await tx.partner.create({
            data: {
              id: `V-${Date.now().toString().slice(-4)}-${partnerIdx}`,
              name: groupItems[0]?.supplier || '협력사',
              partnerType: 'P',
            },
          });
        }

        // 기존 해당 일자 & 거래처의 미입고 전표 정리
        await tx.purchaseOrder.deleteMany({
          where: {
            orderDate: today,
            partnerId: partner.id,
            status: '발주',
          },
        });

        const prefix = `PO-${today.replace(/-/g, '')}`;
        const existingOrders = await tx.purchaseOrder.findMany({
          where: { orderNo: { startsWith: prefix } },
          select: { orderNo: true },
        });
        let maxSeq = 0;
        for (const o of existingOrders) {
          const match = o.orderNo.match(/PO-\d{8}-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxSeq) maxSeq = num;
          }
        }
        let poSeq = maxSeq + 1;
        let poNo = `${prefix}-${String(poSeq).padStart(3, '0')}`;
        while (await tx.purchaseOrder.findUnique({ where: { orderNo: poNo }, select: { id: true } })) {
          poSeq += 1;
          poNo = `${prefix}-${String(poSeq).padStart(3, '0')}`;
        }

        let poTotalAmount = 0;
        const detailRecords = [];

        for (const gi of groupItems) {
          let product = await tx.product.findFirst({
            where: {
              OR: [
                { productCode: gi.materialCode },
                { name: gi.itemName || gi.materialName },
              ],
            },
          });

          if (!product) {
            product = await tx.product.create({
              data: {
                productCode: gi.materialCode || `MAT-${Date.now().toString().slice(-6)}`,
                name: gi.itemName || gi.materialName || '자재',
                spec: gi.spec || '',
                unit: gi.unit || 'ea',
                category: gi.category || '원재료',
                partnerId: partner.id,
              },
            });
          }

          const oQty = Number(gi.orderQty);
          const uPrice = Number(gi.unitPrice || 0);
          const amt = oQty * uPrice;
          poTotalAmount += amt;

          detailRecords.push({
            productId: product.id,
            productCode: product.productCode,
            productName: product.name,
            category: gi.category || '원재료',
            unit: gi.unit || 'ea',
            orderQty: oQty,
            unitPrice: uPrice,
            amount: amt,
            remainQty: oQty,
            minOrderQty: Number(gi.minOrderQty || 0),
            orderUnitQty: Number(gi.orderUnitQty || 1),
            expectedBoxQty: Number(gi.incomingScheduledBox || 0),
            avgDailyUsage: 0,
            currentStock: Number(gi.currentStock || 0),
            remark: gi.remark || '발주소요량확정',
          });
        }

        if (detailRecords.length > 0) {
          const po = await tx.purchaseOrder.create({
            data: {
              orderNo: poNo,
              orderDate: today,
              partnerId: partner.id,
              partnerName: partner.name,
              orderType: '소요량확정',
              status: '발주',
              totalAmount: poTotalAmount,
              createdBy,
              remark: `발주소요량확정 시스템 등록 (${detailRecords.length}개 품목)`,
              details: {
                create: detailRecords,
              },
            },
          });
          createdOrders.push({ orderNo: po.orderNo, itemCount: detailRecords.length });
        }
        partnerIdx++;
      }

      // MaterialRequirement 테이블 상태 동기화
      await tx.materialRequirement.deleteMany({
        where: { reqDate: today, remark: { contains: '소요량확정' } },
      });
      const mrList = validItems.map((gi: any) => ({
        reqDate: today,
        shift: '1편',
        productCode: '',
        productName: '',
        materialCode: gi.materialCode,
        materialName: gi.itemName || gi.materialName || '',
        category: gi.category || '원재료',
        requiredQty: Number(gi.orderQty),
        unit: gi.unit || 'ea',
        partnerId: gi.partnerId || null,
        partnerName: gi.supplier || '',
        currentStock: Number(gi.currentStock || 0),
        shortageQty: Number(gi.orderQty),
        status: '확정',
        remark: '소요량확정 발주등록',
      }));
      if (mrList.length > 0) {
        await tx.materialRequirement.createMany({ data: mrList });
      }
    });

    return NextResponse.json({
      success: true,
      message: `총 ${createdOrders.length}건의 발주서(PO) 전표가 성공적으로 확정 저장되었습니다.`,
      data: createdOrders,
    });
  } catch (error: any) {
    console.error('Error in order-req-confirm POST:', error);
    return NextResponse.json(
      { success: false, error: error.message || '발주서 확정 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
