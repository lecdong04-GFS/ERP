import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';
import { normalizeDateYmd } from '@/lib/gfs/orderCalc';

// GET /api/purchase/receiving
// - ?type=pending_orders : 아직 입고되지 않은 발주서(PurchaseOrderDetail) 목록 반환 (입고등록 대기 목록)
// - ?startDate=...&endDate=...&status=... : 실제 입고 이력(Receiving) 목록 반환
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const rawReceivingDate = searchParams.get('receivingDate');
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');
    const receivingDate = rawReceivingDate ? normalizeDateYmd(rawReceivingDate) : null;
    const startDate = rawStartDate ? normalizeDateYmd(rawStartDate) : null;
    const endDate = rawEndDate ? normalizeDateYmd(rawEndDate) : null;
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

    const partnerId = searchParams.get('partnerId');
    if (partnerId && partnerId !== 'ALL') {
      where.OR = [
        { partnerId },
        { partnerName: { contains: partnerId } },
      ];
    }

    if (status && status !== '전체') where.status = status;
    if (search) {
      where.OR = [
        { receivingNo: { contains: search } },
        { partnerName: { contains: search } },
        { details: { some: { productName: { contains: search } } } },
        { details: { some: { productCode: { contains: search } } } },
        { details: { some: { lotNo: { contains: search } } } },
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
      orderBy: [
        { receivingDate: 'desc' },
        { createdAt: 'desc' },
      ],
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
    const { receivingDate: rawReceivingDate, partnerId, partnerName, items = [], createdBy = 'admin' } = body;
    const receivingDate = normalizeDateYmd(rawReceivingDate);

    if (!receivingDate || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '입고일자(receivingDate)와 입고품목(items)이 필수입니다.' },
        { status: 400 }
      );
    }

    const baseReceivingNo = makeDocNo('RC', receivingDate);

    // Prisma $transaction으로 ACID 원자성 보장
    const result = await prisma.$transaction(async (tx) => {
      // 0) 기본 협력사(Partner) 외래키 안전성 확보
      let fallbackPartnerId = partnerId;
      if (fallbackPartnerId) {
        const pExists = await tx.partner.findUnique({ where: { id: fallbackPartnerId } });
        if (!pExists) fallbackPartnerId = null;
      }
      if (!fallbackPartnerId) {
        const firstPartner = await tx.partner.findFirst();
        if (firstPartner) {
          fallbackPartnerId = firstPartner.id;
        } else {
          const createdP = await tx.partner.create({
            data: {
              id: 'V001',
              name: partnerName || '기본공급사',
              partnerType: 'P',
            },
          });
          fallbackPartnerId = createdP.id;
        }
      }

      const allPartners = await tx.partner.findMany();
      const partnerById = new Map(allPartners.map((p) => [p.id, p]));
      const partnerByName = new Map(allPartners.map((p) => [p.name.trim(), p]));

      const updatedPoIds = new Set<number>();
      const groupedDetails = new Map<
        string,
        { partnerId: string; partnerName: string; totalAmount: number; detailRecords: any[]; sampleItem: any }
      >();

      for (const item of items) {
        const receivedQty = Number(item.recvQty ?? item.receivedQty ?? 0);
        const isManualClose = Boolean(item.manualClose);

        // 1) 품목(Product) 조회 (원재료/부자재 및 isUsed=true 우선)
        let product = item.productId
          ? await tx.product.findUnique({ where: { id: Number(item.productId) } })
          : null;

        if (!product || product.category === '완성품' || product.category === '반제품') {
          product = await tx.product.findFirst({
            where: {
              category: { notIn: ['완성품', '반제품'] },
              OR: [
                ...(item.productCode ? [{ productCode: item.productCode }] : []),
                ...(item.name || item.productName ? [{ name: item.name || item.productName }] : []),
              ],
            },
            orderBy: [{ isUsed: 'desc' }, { id: 'asc' }],
          });
        }

        // 품목의 거래처 확인
        let itemPartnerId = item.partnerId || product?.partnerId || fallbackPartnerId;
        let itemPartnerName = item.supplier || item.partnerName || partnerName || '';
        if (itemPartnerId && partnerById.has(itemPartnerId)) {
          const pt = partnerById.get(itemPartnerId)!;
          if (!itemPartnerName || itemPartnerName === '공급사') itemPartnerName = pt.name;
        } else if (itemPartnerName && partnerByName.has(itemPartnerName.trim())) {
          const pt = partnerByName.get(itemPartnerName.trim())!;
          itemPartnerId = pt.id;
          itemPartnerName = pt.name;
        } else {
          itemPartnerId = fallbackPartnerId;
        }

        if (!product) {
          product = await tx.product.create({
            data: {
              productCode: item.productCode || `P-${Date.now().toString().slice(-6)}`,
              name: item.name || item.productName,
              spec: item.spec || '',
              unit: '봉',
              category: item.type || item.category || '원재료',
              partnerId: itemPartnerId,
              boxQty: Math.max(1, Number(item.unitQty || item.boxQty || 1)),
            },
          });
        }

        const packUnit = Math.max(1, Number(product.boxQty || item.unitQty || item.boxQty || 1));
        const isBagInput = item.unit === '봉' || item.unit === 'ea' || item.unit === 'pk';
        const bagReceivedQty = isBagInput ? receivedQty : receivedQty * packUnit;

        const unitPrice = Number(item.unitPrice || 0);
        const bagUnitPrice = !isBagInput && packUnit > 1 && unitPrice > 0
          ? Math.round(unitPrice / packUnit)
          : unitPrice;
        const amount = receivedQty * unitPrice;

        const cleanLotNo = item.lotNo
          ? String(item.lotNo).replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, receivingDate.replace(/-/g, '').slice(2))
          : `LOT-${receivingDate.replace(/-/g, '')}-${product.productCode.slice(-4)}`;
        const expiryDate = normalizeDateYmd(item.expiryDate) || '2026-11-30';
        const rawWh = item.warehouse || product.warehouse || '상온';
        const warehouse = ['냉장1', '냉장2', '냉동', '상온', '부자재'].includes(rawWh)
          ? rawWh
          : rawWh.includes('냉동')
          ? '냉동'
          : rawWh.includes('냉장2')
          ? '냉장2'
          : rawWh.includes('냉장')
          ? '냉장1'
          : rawWh.includes('부재')
          ? '부자재'
          : '상온';
        const inspectResult =
          item.totalJudge === 'X' || item.inspectResult === '불합격' ? '불합격' : '합격';

        const groupKey = `${itemPartnerId}|${itemPartnerName}`;
        if (!groupedDetails.has(groupKey)) {
          groupedDetails.set(groupKey, {
            partnerId: itemPartnerId,
            partnerName: itemPartnerName,
            totalAmount: 0,
            detailRecords: [],
            sampleItem: item,
          });
        }
        const grp = groupedDetails.get(groupKey)!;
        grp.totalAmount += amount;

        // 2) 입고 상세(ReceivingDetail) 기록 준비 (발주/입고 상세는 box 수량 및 box 단가 유지)
        grp.detailRecords.push({
          productId: product.id,
          productCode: product.productCode,
          productName: product.name,
          lotNo: cleanLotNo,
          expiryDate,
          receivedQty,
          unit: isBagInput ? (item.unit || '봉') : 'box',
          unitPrice,
          amount,
          boxQty: packUnit,
          warehouse,
          inspectResult,
          remark: item.remark || (item.carNo ? `차량:${item.carNo}` : ''),
        });

        // 3) 현재고 (Inventory) 원자적 반영 (재고는 봉/낱개 수량 및 봉 단가 기준, 품목당 정본 Inventory 행 갱신)
        if (receivedQty > 0) {
          const existingInventory =
            (await tx.inventory.findFirst({
              where: { productId: product.id, warehouse },
              orderBy: { id: 'asc' },
            })) ||
            (await tx.inventory.findFirst({
              where: { productId: product.id },
              orderBy: { id: 'asc' },
            }));

          if (existingInventory) {
            await tx.inventory.update({
              where: { id: existingInventory.id },
              data: {
                currentQty: { increment: bagReceivedQty },
                stockAmount: { increment: amount },
                ...(bagUnitPrice > 0 ? { unitPrice: bagUnitPrice } : {}),
                lastInDate: receivingDate,
                expiryDate,
                lotNo: cleanLotNo,
              },
            });
          } else {
            await tx.inventory.create({
              data: {
                productId: product.id,
                productCode: product.productCode,
                productName: product.name,
                category: product.category || '원재료',
                lotNo: cleanLotNo,
                expiryDate,
                warehouse: product.warehouse && ['냉장1', '냉장2', '냉동', '상온', '부자재'].includes(product.warehouse)
                  ? product.warehouse
                  : warehouse,
                currentQty: bagReceivedQty,
                unit: product.unit || '봉',
                unitPrice: bagUnitPrice,
                stockAmount: amount,
                lastInDate: receivingDate,
              },
            });
          }

          // 4) 자재수불부 (MaterialLedger) 거래 생성 (봉 수량 및 봉 단가 기준)
          const totalStock = await tx.inventory.aggregate({
            where: { productId: product.id },
            _sum: { currentQty: true },
          });
          const ledgerCurrentQty = totalStock._sum.currentQty || bagReceivedQty;

          await tx.materialLedger.create({
            data: {
              ledgerDate: receivingDate,
              productId: product.id,
              productCode: product.productCode,
              productName: product.name,
              category: product.category || '원재료',
              unit: product.unit || '봉',
              carryOverQty: 0,
              inQty: bagReceivedQty,
              outQty: 0,
              adjustQty: 0,
              currentQty: ledgerCurrentQty,
              unitPrice: bagUnitPrice,
              stockAmount: Math.round(ledgerCurrentQty * bagUnitPrice),
              txnType: '정규입고',
              refNo: baseReceivingNo,
              remark: `[GSR입고] ${itemPartnerName || ''} (LOT:${cleanLotNo},차량:${item.carNo || '-'},온도:${item.carTemp || '-'})`,
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

      // 7) 거래처별 입고 마스터 헤더 및 상세 생성
      const createdReceivings = [];
      let grpSeq = 1;
      for (const grp of groupedDetails.values()) {
        if (grp.detailRecords.length === 0) continue;
        const rNo =
          groupedDetails.size > 1
            ? `${baseReceivingNo}-${String(grpSeq++).padStart(2, '0')}`
            : baseReceivingNo;
        const createdReceiving = await tx.receiving.create({
          data: {
            receivingNo: rNo,
            receivingDate,
            partnerId: grp.partnerId,
            partnerName: grp.partnerName || '',
            status: '입고',
            totalAmount: grp.totalAmount,
            remark: `차량: ${grp.sampleItem?.carNo || '-'}, 판정: ${grp.sampleItem?.totalJudge || 'O'} (총 ${grp.detailRecords.length}품목)`,
            createdBy,
            details: {
              create: grp.detailRecords,
            },
          },
          include: {
            details: true,
          },
        });
        createdReceivings.push(createdReceiving);
      }

      return createdReceivings.length === 1 ? createdReceivings[0] : createdReceivings;
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

// PUT /api/purchase/receiving
// 입고 내역 수정 (수량, 단가, 유통기한, 창고, LOT, 검수결과 등)
// 변경된 차이(delta)를 현재고(Inventory), 자재수불부(MaterialLedger), 발주서 잔량(PurchaseOrderDetail)에 즉시 원자적 반영
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { updates, detailId, status, remark } = body;

    const listToUpdate: any[] = Array.isArray(updates)
      ? updates
      : detailId
      ? [{ detailId, ...body }]
      : [];

    if (listToUpdate.length === 0) {
      return NextResponse.json(
        { success: false, error: '수정할 항목(updates 또는 detailId)이 필요합니다.' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedReceivingIds = new Set<number>();

      for (const item of listToUpdate) {
        const id = Number(item.detailId || item.id);
        if (!id) continue;

        const currentDetail = await tx.receivingDetail.findUnique({
          where: { id },
          include: { receiving: true, product: true },
        });

        if (!currentDetail) continue;

        const oldQty = Number(currentDetail.receivedQty || 0);
        const oldPrice = Number(currentDetail.unitPrice || 0);
        const oldAmt = Number(currentDetail.amount || 0);

        const newQty = item.receivedQty !== undefined ? Number(item.receivedQty) : oldQty;
        const newPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : oldPrice;
        const newAmt = newQty * newPrice;

        const newExpiry = item.expiryDate ?? currentDetail.expiryDate;
        const newWarehouse = item.warehouse ?? currentDetail.warehouse;
        const newLotNo = item.lotNo ?? currentDetail.lotNo;
        const newInspect = item.inspectResult ?? currentDetail.inspectResult;
        const newRemark = item.remark ?? currentDetail.remark;

        const deltaQty = newQty - oldQty;
        const deltaAmt = newAmt - oldAmt;
        const packUnit = Math.max(1, Number(currentDetail.product?.boxQty) || 1);
        const isBagUnit = currentDetail.unit === '봉' || currentDetail.unit === 'ea' || currentDetail.unit === 'pk';
        const deltaBagQty = isBagUnit ? deltaQty : deltaQty * packUnit;
        const newBagQty = isBagUnit ? newQty : newQty * packUnit;
        const newBagPrice = !isBagUnit && packUnit > 1 && newPrice > 0 ? Math.round(newPrice / packUnit) : newPrice;

        // 1) ReceivingDetail 갱신
        await tx.receivingDetail.update({
          where: { id },
          data: {
            receivedQty: newQty,
            unitPrice: newPrice,
            amount: newAmt,
            expiryDate: newExpiry,
            warehouse: newWarehouse,
            lotNo: newLotNo,
            inspectResult: newInspect,
            remark: newRemark,
          },
        });

        updatedReceivingIds.add(currentDetail.receivingId);

        // 2) 현재고 (Inventory) 원자적 가감 (봉 수량 기준)
        if (deltaQty !== 0 || deltaAmt !== 0 || newWarehouse !== currentDetail.warehouse || newExpiry !== currentDetail.expiryDate) {
          const inv =
            (await tx.inventory.findFirst({
              where: {
                productId: currentDetail.productId,
                lotNo: currentDetail.lotNo,
                warehouse: currentDetail.warehouse,
              },
            })) ||
            (await tx.inventory.findFirst({
              where: { productId: currentDetail.productId },
              orderBy: { id: 'asc' },
            }));

          if (inv) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                currentQty: { increment: deltaBagQty },
                stockAmount: { increment: deltaAmt },
                ...(newBagPrice > 0 ? { unitPrice: newBagPrice } : {}),
                warehouse: newWarehouse,
                expiryDate: newExpiry,
                lotNo: newLotNo,
              },
            });
          } else if (newQty > 0) {
            await tx.inventory.create({
              data: {
                productId: currentDetail.productId,
                productCode: currentDetail.productCode,
                productName: currentDetail.productName,
                category: currentDetail.product?.category || '원재료',
                lotNo: newLotNo,
                expiryDate: newExpiry,
                warehouse: newWarehouse,
                currentQty: newBagQty,
                unit: currentDetail.product?.unit || '봉',
                unitPrice: newBagPrice,
                stockAmount: newAmt,
                lastInDate: normalizeDateYmd(currentDetail.receiving.receivingDate),
              },
            });
          }

          // 3) 자재수불부 (MaterialLedger) 감사 로그
          if (deltaQty !== 0) {
            const totalStock = await tx.inventory.aggregate({
              where: { productId: currentDetail.productId },
              _sum: { currentQty: true },
            });
            const curBagQty = totalStock._sum.currentQty || newBagQty;
            await tx.materialLedger.create({
              data: {
                ledgerDate: normalizeDateYmd(currentDetail.receiving.receivingDate),
                productId: currentDetail.productId,
                productCode: currentDetail.productCode,
                productName: currentDetail.productName,
                category: currentDetail.product?.category || '원재료',
                unit: currentDetail.product?.unit || '봉',
                carryOverQty: 0,
                inQty: deltaBagQty > 0 ? deltaBagQty : 0,
                outQty: deltaBagQty < 0 ? Math.abs(deltaBagQty) : 0,
                adjustQty: deltaBagQty,
                currentQty: curBagQty,
                unitPrice: newBagPrice,
                stockAmount: Math.round(curBagQty * newBagPrice),
                txnType: '입고수정',
                refNo: currentDetail.receiving.receivingNo,
                remark: `[입고수량수정] ${oldQty} → ${newQty} (${deltaQty > 0 ? '+' : ''}${deltaQty}box / ${deltaBagQty > 0 ? '+' : ''}${deltaBagQty}봉)`,
              },
            });
          }

          // 4) 발주서 잔량 동기화
          const poDetail = await tx.purchaseOrderDetail.findFirst({
            where: {
              OR: [
                { productId: currentDetail.productId },
                { productCode: currentDetail.productCode },
                { productName: currentDetail.productName },
              ],
            },
            orderBy: { id: 'desc' },
          });

          if (poDetail) {
            const updatedRecvQty = Math.max(0, (poDetail.receivedQty || 0) + deltaQty);
            const updatedRemainQty = Math.max(0, (poDetail.orderQty || 0) - updatedRecvQty);
            await tx.purchaseOrderDetail.update({
              where: { id: poDetail.id },
              data: {
                receivedQty: updatedRecvQty,
                remainQty: updatedRemainQty,
              },
            });

            const allDetails = await tx.purchaseOrderDetail.findMany({
              where: { purchaseOrderId: poDetail.purchaseOrderId },
            });
            const allDone = allDetails.every((d) => (d.remainQty || 0) <= 0);
            const anyDone = allDetails.some((d) => (d.receivedQty || 0) > 0);
            await tx.purchaseOrder.update({
              where: { id: poDetail.purchaseOrderId },
              data: { status: allDone ? '입고완료' : anyDone ? '부분입고' : '발주' },
            });
          }
        }
      }

      // 5) Receiving 헤더 공급가액 및 비고 재계산
      for (const rId of updatedReceivingIds) {
        const sumResult = await tx.receivingDetail.aggregate({
          where: { receivingId: rId },
          _sum: { amount: true },
        });
        await tx.receiving.update({
          where: { id: rId },
          data: {
            totalAmount: sumResult._sum.amount || 0,
            ...(remark ? { remark } : {}),
            ...(status ? { status } : {}),
          },
        });
      }

      return { updatedCount: listToUpdate.length };
    });

    await touchDashboardSnapshot();
    return NextResponse.json({
      success: true,
      message: `${result.updatedCount}건의 입고 내역이 안전하게 수정되었으며 재고 및 발주 잔량에 즉시 동기화되었습니다.`,
    });
  } catch (error: any) {
    console.error('Failed to update receiving', error);
    return NextResponse.json(
      { success: false, error: error.message || '입고 수정 처리에 실패하였습니다.' },
      { status: 500 }
    );
  }
}

// DELETE /api/purchase/receiving
// 입고 취소 / 롤백 (Receiving 또는 개별 ReceivingDetail)
// 현재고(Inventory)에서 입고수량 원상 차감, 발주서 잔량(remainQty) 복원, 상태를 '취소'로 전환
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { receivingIds = [], detailIds = [], cancelReason = '사용자 입고취소 및 재고 롤백' } = body;
    const cancelDate = new Date().toISOString().slice(0, 10);

    if (receivingIds.length === 0 && detailIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '취소할 대상(receivingIds 또는 detailIds)을 선택해주세요.' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      let cancelledCount = 0;

      // 1) 전체 전표(Receiving) 취소 처리
      for (const rId of receivingIds) {
        const receiving = await tx.receiving.findUnique({
          where: { id: Number(rId) },
          include: { details: { include: { product: true } } },
        });

        if (!receiving || receiving.status === '취소') continue;

        for (const dt of receiving.details) {
          const packUnit = Math.max(1, Number(dt.product?.boxQty) || 1);
          const isBagUnit = dt.unit === '봉' || dt.unit === 'ea' || dt.unit === 'pk';
          const dtBagQty = isBagUnit ? dt.receivedQty : dt.receivedQty * packUnit;
          const dtBagPrice = !isBagUnit && packUnit > 1 && dt.unitPrice > 0 ? Math.round(dt.unitPrice / packUnit) : dt.unitPrice;

          // 재고 차감
          const inv =
            (await tx.inventory.findFirst({
              where: {
                productId: dt.productId,
                lotNo: dt.lotNo,
                warehouse: dt.warehouse,
              },
            })) ||
            (await tx.inventory.findFirst({
              where: { productId: dt.productId },
              orderBy: { id: 'asc' },
            }));
          if (inv) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                currentQty: { decrement: dtBagQty },
                stockAmount: { decrement: dt.amount },
              },
            });
          }

          // 발주서 잔량 복원
          const poDetail = await tx.purchaseOrderDetail.findFirst({
            where: {
              OR: [
                { productId: dt.productId },
                { productCode: dt.productCode },
                { productName: dt.productName },
              ],
            },
            orderBy: { id: 'desc' },
          });

          if (poDetail) {
            const newRecv = Math.max(0, (poDetail.receivedQty || 0) - dt.receivedQty);
            await tx.purchaseOrderDetail.update({
              where: { id: poDetail.id },
              data: {
                receivedQty: newRecv,
                remainQty: (poDetail.remainQty || 0) + dt.receivedQty,
              },
            });
            await tx.purchaseOrder.update({
              where: { id: poDetail.purchaseOrderId },
              data: { status: newRecv > 0 ? '부분입고' : '발주' },
            });
          }

          // 수불부 감사 기록
          await tx.materialLedger.create({
            data: {
              ledgerDate: normalizeDateYmd(receiving.receivingDate),
              productId: dt.productId,
              productCode: dt.productCode,
              productName: dt.productName,
              category: dt.product?.category || '원재료',
              unit: dt.product?.unit || '봉',
              carryOverQty: 0,
              inQty: 0,
              outQty: dtBagQty,
              adjustQty: -dtBagQty,
              currentQty: 0,
              unitPrice: dtBagPrice,
              stockAmount: 0,
              txnType: '입고취소',
              refNo: receiving.receivingNo,
              remark: `[입고취소] ${cancelReason}`,
            },
          });
        }

        await tx.receiving.update({
          where: { id: receiving.id },
          data: {
            status: '취소',
            cancelReason,
            cancelDate,
          },
        });
        cancelledCount++;
      }

      // 2) 개별 Detail 취소 처리
      for (const dtId of detailIds) {
        const dt = await tx.receivingDetail.findUnique({
          where: { id: Number(dtId) },
          include: { receiving: true, product: true },
        });

        if (!dt || dt.receivedQty <= 0) continue;

        const packUnit = Math.max(1, Number(dt.product?.boxQty) || 1);
        const isBagUnit = dt.unit === '봉' || dt.unit === 'ea' || dt.unit === 'pk';
        const dtBagQty = isBagUnit ? dt.receivedQty : dt.receivedQty * packUnit;

        // 재고 차감
        const inv =
          (await tx.inventory.findFirst({
            where: {
              productId: dt.productId,
              lotNo: dt.lotNo,
              warehouse: dt.warehouse,
            },
          })) ||
          (await tx.inventory.findFirst({
            where: { productId: dt.productId },
            orderBy: { id: 'asc' },
          }));
        if (inv) {
          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              currentQty: { decrement: dtBagQty },
              stockAmount: { decrement: dt.amount },
            },
          });
        }

        // 발주서 잔량 복원
        const poDetail = await tx.purchaseOrderDetail.findFirst({
          where: {
            OR: [
              { productId: dt.productId },
              { productCode: dt.productCode },
              { productName: dt.productName },
            ],
          },
          orderBy: { id: 'desc' },
        });
        if (poDetail) {
          const newRecv = Math.max(0, (poDetail.receivedQty || 0) - dt.receivedQty);
          await tx.purchaseOrderDetail.update({
            where: { id: poDetail.id },
            data: {
              receivedQty: newRecv,
              remainQty: (poDetail.remainQty || 0) + dt.receivedQty,
            },
          });
        }

        await tx.receivingDetail.update({
          where: { id: dt.id },
          data: {
            receivedQty: 0,
            amount: 0,
            remark: `[품목취소] ${cancelReason} · ${dt.remark || ''}`,
          },
        });

        // 부모 전표 합계 재계산
        const sumResult = await tx.receivingDetail.aggregate({
          where: { receivingId: dt.receivingId },
          _sum: { amount: true },
        });
        await tx.receiving.update({
          where: { id: dt.receivingId },
          data: {
            totalAmount: sumResult._sum.amount || 0,
          },
        });

        cancelledCount++;
      }

      return { cancelledCount };
    });

    await touchDashboardSnapshot();
    return NextResponse.json({
      success: true,
      message: `${result.cancelledCount}건의 입고 항목이 정상 취소(롤백)되어 재고 및 발주 잔량에 즉시 반영되었습니다.`,
    });
  } catch (error: any) {
    console.error('Failed to cancel receiving', error);
    return NextResponse.json(
      { success: false, error: error.message || '입고 취소에 실패했습니다.' },
      { status: 500 }
    );
  }
}
