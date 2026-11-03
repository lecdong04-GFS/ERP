import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

// GET /api/purchase/receiving
// - ?type=pending_orders : 아직 입고되지 않은 발주서(PurchaseOrderDetail) 목록 반환 (입고등록 대기 목록)
// - ?startDate=...&endDate=...&status=... : 실제 입고 이력(Receiving) 목록 반환
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const receivingDate = searchParams.get('receivingDate');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // 1) 입고 대기 발주 목록 (type=pending_orders)
    if (type === 'pending_orders') {
      const poWhere: any = {
        remainQty: { gt: 0 },
        purchaseOrder: {
          status: { in: ['발주', '미입고', '부분입고'] },
        },
      };

      if (startDate || endDate) {
        poWhere.purchaseOrder.orderDate = {};
        if (startDate) poWhere.purchaseOrder.orderDate.gte = startDate;
        if (endDate) poWhere.purchaseOrder.orderDate.lte = endDate;
      }

      if (search) {
        poWhere.OR = [
          { purchaseOrder: { orderNo: { contains: search } } },
          { productName: { contains: search } },
          { productCode: { contains: search } },
          { purchaseOrder: { partnerName: { contains: search } } },
        ];
      }

      const pendingDetails = await prisma.purchaseOrderDetail.findMany({
        where: poWhere,
        include: {
          purchaseOrder: {
            include: { partner: true },
          },
          product: true,
        },
        orderBy: { purchaseOrder: { orderDate: 'desc' } },
      });

      return NextResponse.json({ success: true, data: pendingDetails });
    }

    // 2) 실제 입고 전표 이력 목록 (Receiving)
    const where: any = {};
    if (receivingDate) {
      where.receivingDate = receivingDate;
    } else if (startDate || endDate) {
      where.receivingDate = {};
      if (startDate) where.receivingDate.gte = startDate;
      if (endDate) where.receivingDate.lte = endDate;
    }

    if (status && status !== '전체') where.status = status;
    if (search) {
      where.OR = [
        { receivingNo: { contains: search } },
        { partnerName: { contains: search } },
      ];
    }

    const receivings = await prisma.receiving.findMany({
      where,
      include: {
        partner: true,
        details: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: receivings });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch receivings' },
      { status: 500 }
    );
  }
}

// POST /api/purchase/receiving
// 신규 입고 등록 및:
// 1. Receiving & ReceivingDetail 생성
// 2. Inventory (현재고) 원자적 가산/갱신
// 3. MaterialLedger (자재수불부) 입고 거래 자동 기록
// 4. PurchaseOrderDetail & PurchaseOrder (발주서 잔량 차감 및 입고상태 갱신)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { receivingDate, partnerId, partnerName, items = [], createdBy = 'admin' } = body;

    if (!receivingDate || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '입고일자(receivingDate)와 입고품목(items)이 필수입니다.' },
        { status: 400 }
      );
    }

    const receivingNo = makeDocNo('RC', receivingDate);

    // Prisma $transaction으로 ACID 원자성 보장
    const result = await prisma.$transaction(async (tx) => {
      // 0) 협력사(Partner) 외래키 안전성 확보
      let finalPartnerId = partnerId;
      if (finalPartnerId) {
        const pExists = await tx.partner.findUnique({ where: { id: finalPartnerId } });
        if (!pExists) finalPartnerId = null;
      }
      if (!finalPartnerId) {
        const firstPartner = await tx.partner.findFirst();
        if (firstPartner) {
          finalPartnerId = firstPartner.id;
        } else {
          const createdP = await tx.partner.create({
            data: {
              id: 'V001',
              name: partnerName || '기본공급사',
              partnerType: 'P',
            },
          });
          finalPartnerId = createdP.id;
        }
      }

      let totalAmount = 0;
      const detailRecords = [];
      const updatedPoIds = new Set<number>();

      for (const item of items) {
        const receivedQty = Number(item.recvQty || item.receivedQty || 0);
        const isManualClose = Boolean(item.manualClose);

        // 1) 품목(Product) 조회 또는 생성
        let product = await tx.product.findFirst({
          where: {
            OR: [
              ...(item.productCode ? [{ productCode: item.productCode }] : []),
              { name: item.name || item.productName },
            ],
          },
        });

        if (!product) {
          product = await tx.product.create({
            data: {
              productCode: item.productCode || `P-${Date.now().toString().slice(-6)}`,
              name: item.name || item.productName,
              spec: item.spec || '',
              unit: item.unit || 'ea',
              category: item.type || item.category || '원재료',
              partnerId: finalPartnerId,
            },
          });
        }

        const unitPrice = Number(item.unitPrice || 0);
        const amount = receivedQty * unitPrice;
        totalAmount += amount;

        const lotNo =
          item.lotNo ||
          `LOT-${receivingDate.replace(/-/g, '')}-${product.productCode.slice(-4)}`;
        const expiryDate = item.expiryDate || '2026-11-30';
        const warehouse = item.warehouse || '상온보관고';
        const inspectResult =
          item.totalJudge === 'X' || item.inspectResult === '불합격' ? '불합격' : '합격';

        // 2) 입고 상세(ReceivingDetail) 기록 준비
        detailRecords.push({
          productId: product.id,
          productCode: product.productCode,
          productName: item.name || item.productName,
          lotNo,
          expiryDate,
          receivedQty,
          unit: item.unit || 'ea',
          unitPrice,
          amount,
          boxQty: Number(item.unitQty || item.boxQty || 0),
          warehouse,
          inspectResult,
          remark: item.remark || (item.carNo ? `차량:${item.carNo}` : ''),
        });

        // 3) 현재고 (Inventory) 원자적 반영
        if (receivedQty > 0) {
          const existingInventory = await tx.inventory.findFirst({
            where: {
              productId: product.id,
              lotNo,
              warehouse,
            },
          });

          if (existingInventory) {
            await tx.inventory.update({
              where: { id: existingInventory.id },
              data: {
                currentQty: { increment: receivedQty },
                stockAmount: { increment: amount },
                lastInDate: receivingDate,
                expiryDate,
              },
            });
          } else {
            await tx.inventory.create({
              data: {
                productId: product.id,
                productCode: product.productCode,
                productName: item.name || item.productName,
                category: item.type || item.category || '원재료',
                lotNo,
                expiryDate,
                warehouse,
                currentQty: receivedQty,
                unit: item.unit || 'ea',
                unitPrice,
                stockAmount: amount,
                lastInDate: receivingDate,
              },
            });
          }

          // 4) 자재수불부 (MaterialLedger) 거래 생성
          const totalStock = await tx.inventory.aggregate({
            where: { productId: product.id },
            _sum: { currentQty: true },
          });

          await tx.materialLedger.create({
            data: {
              ledgerDate: receivingDate,
              productId: product.id,
              productCode: product.productCode,
              productName: item.name || item.productName,
              category: item.type || item.category || '원재료',
              unit: item.unit || 'ea',
              carryOverQty: 0,
              inQty: receivedQty,
              outQty: 0,
              adjustQty: 0,
              currentQty: totalStock._sum.currentQty || receivedQty,
              unitPrice,
              stockAmount: (totalStock._sum.currentQty || receivedQty) * unitPrice,
              txnType: '정규입고',
              refNo: receivingNo,
              remark: `[GSR입고] ${partnerName || ''} (LOT:${lotNo},차량:${item.carNo || '-'},온도:${item.carTemp || '-'})`,
            },
          });
        }

        // 5) ★ 발주서 파이프라인 연계: PurchaseOrderDetail 및 PurchaseOrder 잔량/상태 업데이트
        let poDetail: any = null;
        if (item.orderDetailId || item.purchaseOrderDetailId) {
          const detailId = Number(item.orderDetailId || item.purchaseOrderDetailId);
          poDetail = await tx.purchaseOrderDetail.findUnique({
            where: { id: detailId },
          });
        } else if (item.orderNo) {
          poDetail = await tx.purchaseOrderDetail.findFirst({
            where: {
              purchaseOrder: { orderNo: item.orderNo },
              OR: [
                { productId: product.id },
                { productCode: product.productCode },
                { productName: item.name || item.productName },
              ],
            },
          });
        }

        if (poDetail) {
          const currentRecv = poDetail.receivedQty || 0;
          const newReceivedQty = currentRecv + receivedQty;
          const newRemainQty = isManualClose
            ? 0
            : Math.max(0, (poDetail.orderQty || 0) - newReceivedQty);

          await tx.purchaseOrderDetail.update({
            where: { id: poDetail.id },
            data: {
              receivedQty: newReceivedQty,
              remainQty: newRemainQty,
            },
          });

          updatedPoIds.add(poDetail.purchaseOrderId);
        }
      }

      // 6) 갱신된 발주서들의 전체 상태 판정 ('부분입고' vs '입고완료')
      for (const poId of updatedPoIds) {
        const details = await tx.purchaseOrderDetail.findMany({
          where: { purchaseOrderId: poId },
        });

        const allDone = details.every((d) => (d.remainQty || 0) <= 0);
        const anyReceived = details.some((d) => (d.receivedQty || 0) > 0);

        const newPoStatus = allDone ? '입고완료' : anyReceived ? '부분입고' : '발주';
        await tx.purchaseOrder.update({
          where: { id: poId },
          data: { status: newPoStatus },
        });
      }

      // 7) 입고 마스터 헤더 및 상세 생성
      const createdReceiving = await tx.receiving.create({
        data: {
          receivingNo,
          receivingDate,
          partnerId: finalPartnerId,
          partnerName: partnerName || '',
          status: '입고',
          totalAmount,
          remark: `차량: ${items[0]?.carNo || '-'}, 판정: ${items[0]?.totalJudge || 'O'} (총 ${detailRecords.length}품목)`,
          createdBy,
          details: {
            create: detailRecords,
          },
        },
        include: {
          details: true,
        },
      });

      return createdReceiving;
    });

    await touchDashboardSnapshot();
    return NextResponse.json({
      success: true,
      message: '입고가 정상 등록되었으며 현재고, 자재수불부, 발주서 잔량 및 상태에 즉시 동기화되었습니다.',
      data: result,
    });
  } catch (error: any) {
    console.error('Failed to register receiving', error);
    return NextResponse.json(
      { success: false, error: error.message || '입고 등록에 실패하였습니다.' },
      { status: 500 }
    );
  }
}
