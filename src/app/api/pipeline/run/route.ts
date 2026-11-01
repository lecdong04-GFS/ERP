import { NextRequest, NextResponse } from 'next/server';
import { ProductionCostPipelineDBEngine } from '@/services/pipeline/ProductionCostPipelineDB';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

// POST /api/pipeline/run (DB 실데이터 기반 원클릭 파이프라인 엔진 실행 & DB 영구 저장)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orderDate = kstToday(), shift = '1편' } = body;

    // 1. DB 기반 파이프라인 연산 실행
    const result = await ProductionCostPipelineDBEngine.executePipeline(prisma, {
      orderDate,
      shift,
    });

    // 2. 결과를 SQLite DB에 영구 적재 ($transaction으로 ACID 보장)
    await prisma.$transaction(async (tx) => {
      // 2-1. 작업지시서 DB 저장
      for (const wo of result.workOrders) {
        const woNo = `WO-${orderDate.replace(/-/g, '')}-${wo.gyeId}-${wo.workSeq}`;

        let product = await tx.product.findFirst({
          where: { name: wo.partName },
        });

        if (!product) {
          const prodCode = `P-${wo.gyeId}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
          product = await tx.product.create({
            data: {
              productCode: prodCode,
              name: wo.partName,
              spec: wo.partSpec || '',
              unit: wo.unit || 'ea',
              category: '반제품',
              gyeId: wo.gyeId,
            },
          });
        }

        await tx.workOrder.upsert({
          where: { workOrderNo: woNo },
          update: {
            orderQty: wo.totalOrderQty,
            prodQty: wo.prodQty,
            status: wo.completeStatus,
            workSeq: wo.workSeq,
            nextProcess: wo.nextProcess,
          },
          create: {
            workOrderNo: woNo,
            workDate: orderDate,
            shift,
            gyeId: wo.gyeId,
            gyeName: wo.gyeName,
            productId: product.id,
            productCode: product.productCode,
            productName: wo.partName,
            spec: wo.partSpec,
            unit: wo.unit,
            orderQty: wo.totalOrderQty,
            prodQty: wo.prodQty,
            workSeq: wo.workSeq,
            nextProcess: wo.nextProcess,
            status: wo.completeStatus,
            createdBy: 'PIPELINE_AUTO',
          },
        });
      }

      // 2-2. 자재수불부 (MaterialLedger) 차감 이력 + 재고(Inventory) 동기화
      for (const d of result.materialDepletions) {
        let mat = await tx.product.findFirst({
          where: {
            OR: [{ productCode: d.partCode }, { name: d.partName }],
          },
        });

        if (!mat) {
          mat = await tx.product.create({
            data: {
              productCode: d.partCode,
              name: d.partName,
              spec: d.partSpec || '',
              unit: d.unit || 'kg',
              category: d.category || '원재료',
            },
          });
        }

        await tx.materialLedger.create({
          data: {
            ledgerDate: orderDate,
            productId: mat.id,
            productCode: mat.productCode,
            productName: d.partName,
            category: d.category,
            unit: d.unit,
            carryOverQty: Number(d.carriedOverQty || 0),
            inQty: Number(d.inQty || 0),
            outQty: Number(d.outQty || 0),
            adjustQty: 0,
            currentQty: Number(d.currentStock || 0),
            unitPrice: 0,
            stockAmount: 0,
            txnType: '생산투입차감(FEFO)',
            refNo: `PIPE-${orderDate.replace(/-/g, '')}`,
            remark: `FEFO LOT: ${d.fefoLotNo} (유통기한: ${d.expiryDate})`,
          },
        });

        // 현재고 테이블 동기화
        const inv = await tx.inventory.findFirst({
          where: { productId: mat.id },
        });
        if (inv) {
          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              currentQty: Math.max(0, Number(d.currentStock || 0)),
              lastOutDate: orderDate,
            },
          });
        }
      }

      // 2-3. 자재소요량(MaterialRequirement) 자동 적재 → 발주검토 화면 연계
      // 기존 해당일 소요량 삭제 후 새로 적재
      await tx.materialRequirement.deleteMany({
        where: { reqDate: orderDate },
      });
      for (const mr of result.materialRequirements) {
        await tx.materialRequirement.create({
          data: {
            reqDate: orderDate,
            shift,
            productCode: '', // 완성품 여러 개에서 나온 합산이므로 빈 값
            productName: '',
            materialCode: mr.productCode,
            materialName: mr.productName,
            category: mr.category,
            requiredQty: mr.requiredQty,
            unit: mr.unit,
            partnerId: mr.partnerId,
            partnerName: mr.partnerName,
            currentStock: mr.currentStock,
            shortageQty: mr.shortageQty,
            status: mr.shortageQty > 0 ? '미확정' : '재고충분',
          },
        });
      }

      // 2-4. 제품별 손익현황 (ProductPnL) DB 저장
      const pnlMonth = orderDate.slice(0, 7);
      for (const pnl of result.costResults) {
        let prod = await tx.product.findFirst({
          where: {
            OR: [{ productCode: pnl.productId }, { name: pnl.productName }],
          },
        });

        if (!prod) {
          prod = await tx.product.create({
            data: {
              productCode: pnl.productId,
              name: pnl.productName,
              unit: 'ea',
              category: '완성품',
            },
          });
        }

        await tx.productPnL.upsert({
          where: {
            pnlMonth_productId: { pnlMonth, productId: prod.id },
          },
          update: {
            productName: pnl.productName,
            salesAmount: pnl.salesAmount,
            salesRatio: pnl.salesRatio,
            indirectCostAlloc: pnl.indirectCostAllocated,
            logisticsRate: pnl.logisticsRatio,
            logisticsCost: pnl.logisticsCost,
            directMaterialTotal: pnl.directMaterialUnit,
            productionQty: pnl.productionQty,
            directMaterialCost: pnl.directMaterialCost,
            totalCost: pnl.totalCost,
            salesProfit: pnl.salesProfit,
            profitRate: pnl.profitRate,
            costRatio: pnl.costRatio,
            salesQty: pnl.salesQty,
            unitPrice: pnl.unitPrice,
            unitCost: pnl.unitCost,
            unitProfit: pnl.unitProfit,
            remark: pnl.alertMessage,
          },
          create: {
            pnlMonth,
            productId: prod.id,
            productName: pnl.productName,
            salesAmount: pnl.salesAmount,
            salesRatio: pnl.salesRatio,
            indirectCostAlloc: pnl.indirectCostAllocated,
            logisticsRate: pnl.logisticsRatio,
            logisticsCost: pnl.logisticsCost,
            directMaterialTotal: pnl.directMaterialUnit,
            productionQty: pnl.productionQty,
            directMaterialCost: pnl.directMaterialCost,
            totalCost: pnl.totalCost,
            salesProfit: pnl.salesProfit,
            profitRate: pnl.profitRate,
            costRatio: pnl.costRatio,
            salesQty: pnl.salesQty,
            unitPrice: pnl.unitPrice,
            unitCost: pnl.unitCost,
            unitProfit: pnl.unitProfit,
            remark: pnl.alertMessage,
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: `파이프라인이 성공적으로 실행되었습니다. (DB 실데이터 모드) | 작업지시 ${result.workOrders.length}건, 자재소요량 ${result.materialRequirements.length}건, 부족자재 ${result.materialRequirements.filter(m => m.shortageQty > 0).length}건 적재`,
      data: result,
    });
  } catch (error: any) {
    console.error('Pipeline Execution Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Pipeline execution failed' },
      { status: 500 }
    );
  }
}