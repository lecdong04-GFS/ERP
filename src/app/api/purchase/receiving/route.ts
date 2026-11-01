import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

// GET /api/purchase/receiving?receivingDate=2026-10-30&status=입고
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const receivingDate = searchParams.get('receivingDate');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: any = {};
    if (receivingDate) where.receivingDate = receivingDate;
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

// POST /api/purchase/receiving (신규 입고 등록 및 재고/유통기한 LOT 자동 반영 - 원자적 트랜잭션 보장)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { receivingDate, partnerId, partnerName, items = [], createdBy = 'admin' } = body;

    if (!receivingDate || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'receivingDate and items are required' },
        { status: 400 }
      );
    }

    const receivingNo = makeDocNo('RC', receivingDate);

    // Prisma $transaction으로 입고 + 재고 + 수불부 원자적 동시 처리 (ACID 보장)
    const result = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const detailRecords = [];

      for (const item of items) {
        let product = await tx.product.findFirst({
          where: {
            OR: [{ productCode: item.productCode }, { name: item.productName }],
          },
        });

        if (!product) {
          product = await tx.product.create({
            data: {
              productCode: item.productCode || `P-${Date.now().toString().slice(-6)}`,
              name: item.productName,
              spec: item.spec || '',
              unit: item.unit || 'ea',
              category: item.category || '원재료',
              partnerId: partnerId || null,
            },
          });
        }

        const receivedQty = Number(item.receivedQty || 0);
        const unitPrice = Number(item.unitPrice || 0);
        const amount = receivedQty * unitPrice;
        totalAmount += amount;

        const lotNo = item.lotNo || `LOT-${receivingDate.replace(/-/g, '')}-${product.productCode}`;
        const expiryDate = item.expiryDate || '2026-11-30';
        const warehouse = item.warehouse || '상온보관고';

        detailRecords.push({
          productId: product.id,
          productCode: product.productCode,
          productName: item.productName,
          lotNo,
          expiryDate,
          receivedQty,
          unit: item.unit || 'ea',
          unitPrice,
          amount,
          boxQty: Number(item.boxQty || 0),
          warehouse,
          inspectResult: item.inspectResult || '합격',
          remark: item.remark || '',
        });

        // 1. 현재고 (Inventory) 반영
        await tx.inventory.create({
          data: {
            productId: product.id,
            productCode: product.productCode,
            productName: item.productName,
            category: item.category || '원재료',
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

        // 2. 자재수불부 (MaterialLedger) 입고 이력 반영
        await tx.materialLedger.create({
          data: {
            ledgerDate: receivingDate,
            productId: product.id,
            productCode: product.productCode,
            productName: item.productName,
            category: item.category || '원재료',
            unit: item.unit || 'ea',
            carryOverQty: 0,
            inQty: receivedQty,
            outQty: 0,
            adjustQty: 0,
            currentQty: receivedQty,
            unitPrice,
            stockAmount: amount,
            txnType: '정규입고',
            refNo: receivingNo,
            remark: `입고등록 (${partnerName || ''})`,
          },
        });
      }

      // 3. 입고 마스터 + 디테일 영구 생성
      const createdReceiving = await tx.receiving.create({
        data: {
          receivingNo,
          receivingDate,
          partnerId: partnerId || 'V001',
          partnerName: partnerName || '',
          status: '입고',
          totalAmount,
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
      message: '입고가 정상 등록되었으며 현재고와 자재수불부에 반영되었습니다 (트랜잭션 완료).',
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to register receiving' },
      { status: 500 }
    );
  }
}