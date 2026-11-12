import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

// GET /api/inventory/return?returnDate=2026-10-30
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const returnDate = searchParams.get('returnDate');

    const where: any = {};
    if (returnDate) where.returnDate = returnDate;

    const returns = await prisma.returnRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: returns });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch return records' },
      { status: 500 }
    );
  }
}

// POST /api/inventory/return (반품 등록 및 재고/수불부 반영)
export async function POST(req: NextRequest) {
  const auth = await requireSession({ categoryId: 'inventory', action: 'write' });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { returnDate, partnerName, items = [] } = body;
    const createdBy = body.createdBy || auth.user.name || auth.user.loginId;

    if (!returnDate || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'returnDate and items are required' },
        { status: 400 }
      );
    }

    const baseStamp = Date.now().toString().slice(-6);
    const createdRecords = await prisma.$transaction(
      async (tx) => {
        const recs = [];
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const returnQty = Number(item.returnQty || 0);
          if (returnQty <= 0) continue;
          const unitPrice = Number(item.unitPrice || 0);
          const amount = Math.round(returnQty * unitPrice);

          const record = await tx.returnRecord.create({
            data: {
              returnDate,
              returnNo: item.orderNo ? `${item.orderNo}-${idx + 1}` : `RET-${baseStamp}-${idx + 1}`,
              partnerName: partnerName || '',
              productName: item.itemName,
              returnQty,
              unit: item.unit || 'ea',
              unitPrice,
              amount,
              reason: item.returnReason || '품질 불량',
              status: '처리완료',
              remark: item.remark || '',
              createdBy,
            },
          });
          recs.push(record);

          // 대상 제품 조회 (productId / productCode 우선, name 보조)
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
            let afterQty = 0;
            let effPrice = unitPrice;
            const inv = await tx.inventory.findFirst({
              where: { productId: product.id },
              orderBy: { id: 'asc' },
            });
            if (inv) {
              afterQty = Math.max(0, (Number(inv.currentQty) || 0) - returnQty);
              effPrice = unitPrice > 0 ? unitPrice : (Number(inv.unitPrice) || 0);
              await tx.inventory.update({
                where: { id: inv.id },
                data: {
                  currentQty: afterQty,
                  stockAmount: Math.round(afterQty * effPrice),
                  lastOutDate: returnDate,
                },
              });
            }

            // 자재수불부(MaterialLedger) 반품 기장
            await tx.materialLedger.create({
              data: {
                ledgerDate: returnDate,
                productId: product.id,
                productCode: product.productCode,
                productName: product.name,
                category: product.category || item.category || '원재료',
                unit: product.unit || item.unit || 'ea',
                carryOverQty: 0,
                inQty: 0,
                outQty: returnQty,
                adjustQty: 0,
                currentQty: afterQty,
                unitPrice: effPrice,
                stockAmount: Math.round(afterQty * effPrice),
                txnType: '반품출고',
                refNo: record.returnNo,
                remark: `반품등록: ${item.returnReason || ''}`,
              },
            });
          }
        }
        return recs;
      },
      { maxWait: 20000, timeout: 60000 }
    );

    return NextResponse.json({
      success: true,
      message: `${createdRecords.length}건의 반품 내역이 등록되어 현재고 및 자재수불부에 반영되었습니다.`,
      data: createdRecords,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to register return' },
      { status: 500 }
    );
  }
}

