import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { isBoxUnitLabel, normalizePackUnit } from '@/lib/gfs/pricing';

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

        // 대상 품목 조회 (productId / productCode 우선, name 보조)
        const pId = Number(item.productId) || 0;
        const pCode = String(item.productCode || '').trim();
        const product =
          (pId > 0 ? await tx.product.findUnique({ where: { id: pId } }) : null) ||
          (pCode ? await tx.product.findUnique({ where: { productCode: pCode } }) : null) ||
          (await tx.product.findFirst({
            where: { name: item.itemName },
            orderBy: [{ isUsed: 'desc' }, { id: 'asc' }],
          }));

        if (product) {
          const packUnit = normalizePackUnit(product.boxQty);
          const moveBags = isBoxUnitLabel(item.unit) ? moveQty * packUnit : moveQty;
          const baseUnit = product.unit || item.unit || 'ea';

          // 1. 출고 창고 재고 감소 (출발 창고에 재고가 없으면 이동 불가 → 가상 재고 생성 차단)
          const fromInv = await tx.inventory.findFirst({
            where: { productId: product.id, warehouse: item.currentWarehouse },
          });
          const effectiveMoved = fromInv
            ? Math.min(Math.max(0, Number(fromInv.currentQty) || 0), moveBags)
            : 0;

          if (effectiveMoved <= 0) {
            continue;
          }

          if (fromInv) {
            const nextFromQty = Math.max(0, (Number(fromInv.currentQty) || 0) - effectiveMoved);
            const fromUnitP = Number(fromInv.unitPrice) || Number(item.unitPrice) || 0;
            await tx.inventory.update({
              where: { id: fromInv.id },
              data: {
                currentQty: nextFromQty,
                stockAmount: Math.round(nextFromQty * fromUnitP),
                lastOutDate: moveDate,
              },
            });
          }

          // 2. 입고 창고 재고 증가 (또는 신규 생성)
          const toInv = await tx.inventory.findFirst({
            where: { productId: product.id, warehouse: item.targetWarehouse },
          });
          let afterToQty = effectiveMoved;
          let toUnitP = Number(item.unitPrice) || Number(fromInv?.unitPrice) || 0;
          if (toInv) {
            afterToQty = (Number(toInv.currentQty) || 0) + effectiveMoved;
            toUnitP = Number(toInv.unitPrice) || toUnitP;
            await tx.inventory.update({
              where: { id: toInv.id },
              data: {
                currentQty: afterToQty,
                stockAmount: Math.round(afterToQty * toUnitP),
                lastInDate: moveDate,
              },
            });
          } else {
            await tx.inventory.create({
              data: {
                productId: product.id,
                productCode: product.productCode,
                productName: product.name,
                category: product.category || item.category || '원재료',
                warehouse: item.targetWarehouse,
                currentQty: effectiveMoved,
                unit: baseUnit,
                unitPrice: toUnitP,
                stockAmount: Math.round(effectiveMoved * toUnitP),
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
              productName: product.name,
              category: product.category || item.category || '원재료',
              unit: baseUnit,
              carryOverQty: 0,
              inQty: effectiveMoved,
              outQty: effectiveMoved,
              adjustQty: 0,
              currentQty: afterToQty,
              unitPrice: toUnitP,
              stockAmount: Math.round(afterToQty * toUnitP),
              txnType: '창고이동',
              refNo: `MOVE-${moveDate.replace(/-/g, '')}`,
              remark: `${item.currentWarehouse} ➔ ${item.targetWarehouse} 이동`,
            },
          });
        }
      }

      return moves;
    }, { maxWait: 20000, timeout: 60000 });

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

