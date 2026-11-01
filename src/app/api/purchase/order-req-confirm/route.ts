import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday, makeDocNo } from '@/lib/kst';

// GET /api/purchase/order-req-confirm?date=2026-10-30
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || kstToday();

    // 1. 자재 마스터 및 현재고, 소요량 집계
    const materials = await prisma.product.findMany({
      where: {
        category: { in: ['원재료', '부자재', '포장재'] },
        isUsed: true,
      },
      include: {
        partner: true,
        prices: { orderBy: { effectiveDate: 'desc' }, take: 1 },
        inventories: true,
      },
      orderBy: { productCode: 'asc' },
    });

    // 2. 소요량 테이블에서 해당일자 소요량 가져오기
    const requirements = await prisma.materialRequirement.findMany({
      where: { reqDate: date },
    });
    const reqMap = new Map<string, number>();
    for (const r of requirements) {
      reqMap.set(r.materialCode, (reqMap.get(r.materialCode) || 0) + r.requiredQty);
    }

    // 3. 입고예정량 (PurchaseOrderDetail 중 아직 미입고 상태인 것) 집계
    const pendingOrders = await prisma.purchaseOrderDetail.findMany({
      where: {
        purchaseOrder: {
          status: { in: ['발주', '부분입고'] },
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

    // 4. ERP 표준 순소요량(Net Requirements) & 추천 발주량 산출
    // 공식: 순부족량 = (소요량 + 안전재고) - (현재고 + 입고예정량)
    const rows = materials.map((m, index) => {
      const currentStock = m.inventories.reduce((acc, inv) => acc + inv.currentQty, 0);
      const reqQty = reqMap.get(m.productCode) || 0;
      const incomingScheduled = pendingMap.get(m.productCode) || 0;
      const safetyStock = m.safetyStockQty || 0;

      // 순소요량 (Net Requirement)
      const netShortage = Math.max(0, reqQty + safetyStock - (currentStock + incomingScheduled));

      // 발주단위 및 최소발주수량 적용
      const orderUnit = m.orderUnitQty > 0 ? m.orderUnitQty : 1;
      let calculatedOrderQty = 0;
      if (netShortage > 0) {
        calculatedOrderQty = Math.ceil(netShortage / orderUnit) * orderUnit;
        if (m.minOrderQty > 0 && calculatedOrderQty < m.minOrderQty) {
          calculatedOrderQty = m.minOrderQty;
        }
      }

      const unitPrice = m.prices[0]?.purchasePrice || 0;
      const amount = calculatedOrderQty * unitPrice;
      const boxQty = m.boxQty > 0 ? m.boxQty : 1;
      const expectedBox = boxQty > 0 ? Math.ceil(calculatedOrderQty / boxQty) : 0;

      return {
        id: index + 1,
        category: m.category,
        itemName: m.name,
        materialCode: m.productCode,
        spec: m.spec || '',
        unit: m.unit || 'ea',
        supplier: m.partner?.name || '미지정거래처',
        partnerId: m.partnerId || '',
        orderUnit: m.boxQty > 1 ? 'box' : (m.unit || 'ea'),
        minOrderQty: m.minOrderQty || 1,
        orderQty: calculatedOrderQty, // 추천 발주량 (사용자가 화면에서 검토 후 수정 가능)
        unitPrice,
        orderAmt: amount,
        calcQty: Number(netShortage.toFixed(3)), // 순수 계산 부족량
        unitQty: boxQty,
        orderUnitQty: m.orderUnitQty || 1,
        leadTime: m.partner?.leadTime || 1,
        clientStock: 0,
        safetyStock,
        currentStock: Number(currentStock.toFixed(3)),
        incomingScheduledBox: boxQty > 0 ? Math.ceil(incomingScheduled / boxQty) : 0,
        incomingScheduled: Number(incomingScheduled.toFixed(3)),
        stockQty: Number(currentStock.toFixed(3)),
        status: calculatedOrderQty > 0 ? '발주대상' : '재고충분',
      };
    });

    return NextResponse.json({
      success: true,
      data: rows,
      totalCount: rows.length,
      shortageCount: rows.filter((r) => r.orderQty > 0).length,
    });
  } catch (error: any) {
    console.error('Error in order-req-confirm GET:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch order requirements' },
      { status: 500 }
    );
  }
}

// POST /api/purchase/order-req-confirm (최종 사람이 검토 후 확정한 발주서 일괄 생성)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderDate, items = [], createdBy = 'admin' } = body;

    if (!orderDate || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'orderDate와 items는 필수 입력 항목입니다.' },
        { status: 400 }
      );
    }

    // 발주수량이 0보다 큰 품목만 발주 대상
    const validItems = items.filter((item: any) => Number(item.orderQty) > 0);
    if (validItems.length === 0) {
      return NextResponse.json(
        { success: false, error: '발주수량이 1 이상인 품목이 존재하지 않습니다.' },
        { status: 400 }
      );
    }

    // 거래처별 그룹핑
    const partnerGroups = new Map<string, any[]>();
    for (const item of validItems) {
      const pKey = item.partnerId || item.supplier || 'DEFAULT_PARTNER';
      if (!partnerGroups.has(pKey)) {
        partnerGroups.set(pKey, []);
      }
      partnerGroups.get(pKey)!.push(item);
    }

    const createdOrders: any[] = [];

    // DB 트랜잭션으로 발주서 및 상세 일괄 생성
    await prisma.$transaction(async (tx) => {
      let partnerIdx = 1;
      for (const [partnerKey, groupItems] of partnerGroups.entries()) {
        // 거래처 확인 또는 생성
        let partner = await tx.partner.findFirst({
          where: {
            OR: [{ id: partnerKey }, { name: groupItems[0]?.supplier || groupItems[0]?.partnerName }],
          },
        });

        if (!partner) {
          partner = await tx.partner.create({
            data: {
              id: `V-AUTO-${Date.now()}-${partnerIdx}`,
              name: groupItems[0]?.supplier || groupItems[0]?.partnerName || '협력사',
              partnerType: 'P',
            },
          });
        }

        const poNo = `${makeDocNo('PO', orderDate)}-${partner.id}`;
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
            remark: gi.remark || '소요량확정 발주',
          });
        }

        if (detailRecords.length > 0) {
          const po = await tx.purchaseOrder.create({
            data: {
              orderNo: poNo,
              orderDate,
              partnerId: partner.id,
              partnerName: partner.name,
              orderType: '정기',
              status: '발주',
              totalAmount: poTotalAmount,
              createdBy,
              remark: `발주소요량확정 시스템 등록 (${detailRecords.length}개 품목)`,
              details: {
                create: detailRecords,
              },
            },
          });
          createdOrders.push(po);
        }
        partnerIdx++;
      }
    });

    return NextResponse.json({
      success: true,
      message: `${createdOrders.length}개 거래처에 총 ${validItems.length}개 품목의 정식 발주서가 성공적으로 생성되었습니다.`,
      orders: createdOrders,
    });
  } catch (error: any) {
    console.error('Error in order-req-confirm POST:', error);
    return NextResponse.json(
      { success: false, error: error.message || '발주서 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}