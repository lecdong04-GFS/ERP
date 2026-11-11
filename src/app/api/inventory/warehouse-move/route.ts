import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

// GET /api/inventory/warehouse-move?moveDate=2026-10-30
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const moveDate = searchParams.get('moveDate');

    const where: any = {};
    if (moveDate) where.moveDate = moveDate;

    const moves = await prisma.warehouseMove.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: moves });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch warehouse moves' },
      { status: 500 }
    );
  }
}

// POST /api/inventory/warehouse-move (창고이동 등록 및 재고 창고 갱신 - 원자적 트랜잭션 보장)
export async function POST(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'inventory', action: 'write' });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { moveDate, items = [] } = body;
    const createdBy = body.createdBy || auth.user.name || auth.user.loginId;

    if (!moveDate || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'moveDate and items are required' },
        { status: 400 }
      );
    }

    // Prisma $transaction으로 출고창고 차감 + 입고창고 가산 + 수불부 동시 처리 (ACID 보장)
    const createdMoves = await prisma.$transaction(async (tx) => {
      const moves = [];

      for (const item of items) {
        const moveQty = Number(item.moveQty || 0);
        if (moveQty <= 0) continue;

        const record = await tx.warehouseMove.create({
          data: {
            moveDate,
            productCode: item.productCode || `MAT-${item.id}`,
            productName: item.itemName,
            fromWarehouse: item.currentWarehouse,
            toWarehouse: item.targetWarehouse,
            moveQty,
            unit: item.unit || 'box',
            lotNo: item.lotNo || '',
            reason: '생산라인 투입 이동',
            status: '완료',
            createdBy,
          },
        });
        moves.push(record);

        // 대상 품목 조회
        const product = await tx.product.findFirst({
          where: { name: item.itemName },
        });

        if (product) {
          // 1. 출고 창고 재고 감소
          const fromInv = await tx.inventory.findFirst({
            where: { productId: product.id, warehouse: item.currentWarehouse },
          });
          if (fromInv) {
            await tx.inventory.update({
              where: { id: fromInv.id },
              data: {
                currentQty: Math.max(0, fromInv.currentQty - moveQty),
                lastOutDate: moveDate,
              },
            });
          }

          // 2. 입고 창고 재고 증가 (또는 신규 생성)
          const toInv = await tx.inventory.findFirst({
            where: { productId: product.id, warehouse: item.targetWarehouse },
          });
          if (toInv) {
            await tx.inventory.update({
              where: { id: toInv.id },
              data: {
                currentQty: toInv.currentQty + moveQty,
                lastInDate: moveDate,
              },
            });
          } else {
            await tx.inventory.create({
              data: {
                productId: product.id,
                productCode: product.productCode,
                productName: item.itemName,
                category: item.category || '원재료',
                warehouse: item.targetWarehouse,
                currentQty: moveQty,
                unit: item.unit || 'ea',
                unitPrice: item.unitPrice || 0,
                stockAmount: moveQty * (item.unitPrice || 0),
                lastInDate: moveDate,
              },
            });
          }

          // 3. 자재수불부(MaterialLedger) 이동 기장
          await tx.materialLedger.create({
            data: {
              ledgerDate: moveDate,
              productId: product.id,
              productCode: product.productCode,
              productName: item.itemName,
              category: item.category || '원재료',
              unit: item.unit || 'ea',
              carryOverQty: 0,
              inQty: moveQty,
              outQty: moveQty,
              adjustQty: 0,
              currentQty: moveQty,
              unitPrice: item.unitPrice || 0,
              stockAmount: moveQty * (item.unitPrice || 0),
              txnType: '창고이동',
              refNo: `MOVE-${moveDate.replace(/-/g, '')}`,
              remark: `${item.currentWarehouse} ➔ ${item.targetWarehouse} 이동`,
            },
          });
        }
      }

      return moves;
    });

    return NextResponse.json({
      success: true,
      message: `${createdMoves.length}건의 창고이동이 처리되어 현재고 및 수불부에 반영되었습니다 (트랜잭션 완료).`,
      data: createdMoves,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process warehouse move' },
      { status: 500 }
    );
  }
}

