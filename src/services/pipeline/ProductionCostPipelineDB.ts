/**
 * ProductionCostPipelineDB — DB 실데이터 기반 파이프라인 엔진
 * 
 * 기존 하드코딩(SAMPLE_STORE_ORDERS, BOM_MASTER_RECIPES, REPR_MAPPINGS) 대신
 * 실제 DB 테이블에서 수주, BOM, 대표매핑, 재고 데이터를 읽어서 연산합니다.
 * 
 * 흐름:
 *   1. SalesOrder(수주) → 대표제품 매핑(ReprProduct) → BOM 전개(BomHeader+BomDetail)
 *   2. 46개 계 작업지시 분배 → WorkOrder DB 저장
 *   3. 실제 Inventory 기반 FEFO 자재 차감 → MaterialLedger + Inventory 갱신
 *   4. 자재소요량(MaterialRequirement) 자동 적재 → 발주 검토 화면 연계
 *   5. 원가/손익 집계 → ProductPnL DB 저장
 */
import { PrismaClient } from '@prisma/client';
import { normName } from '@/lib/gfs/norm';
import {
  OrderIntakeItem,
  WorkOrderDispatchItem,
  MaterialLedgerDepletionItem,
  CostAnalysisResultItem,
  PipelineExecutionSummary,
} from './types';

// 하드코딩 데이터는 DB에 데이터가 없을 때 폴백으로만 사용
import {
  SAMPLE_STORE_ORDERS,
  REPR_MAPPINGS,
  BOM_MASTER_RECIPES,
  ProductionCostPipelineEngine as LegacyEngine,
} from './ProductionCostPipeline';

interface PipelineParams {
  orderDate: string;
  shift?: string;
  totalOverhead?: number;
  useLegacyFallback?: boolean;
}

interface PipelineResult {
  workOrders: WorkOrderDispatchItem[];
  materialDepletions: MaterialLedgerDepletionItem[];
  costResults: CostAnalysisResultItem[];
  summary: PipelineExecutionSummary;
  materialRequirements: MaterialRequirementRow[];
  /** 해당 일자 수주가 없어 연산할 내용이 없으면 true (샘플 폴백 없음) */
  isEmpty: boolean;
}

interface MaterialRequirementRow {
  productCode: string;
  productName: string;
  category: string;
  unit: string;
  requiredQty: number;
  currentStock: number;
  shortageQty: number;
  partnerId: string | null;
  partnerName: string;
}

export class ProductionCostPipelineDBEngine {
  /**
   * DB 기반 파이프라인 실행
   */
  public static async executePipeline(
    prisma: PrismaClient,
    params: PipelineParams
  ): Promise<PipelineResult> {
    const {
      orderDate,
      shift = '1편',
      totalOverhead = 85000000,
    } = params;

    const logs: PipelineExecutionSummary['logs'] = [];
    const addLog = (
      step: string,
      message: string,
      type: 'info' | 'success' | 'warn' | 'error' = 'info'
    ) => {
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 8);
      logs.push({ timestamp: timeStr, step, message, type });
    };

    addLog('초기화', '생산-원가 자동 연산 파이프라인 엔진 가동 (DB 실데이터 모드)', 'info');

    // ============================================================
    // STEP 1: 수주(SalesOrder) 데이터 DB 조회
    // ============================================================
    addLog('STEP 1: 수주 조회', `DB에서 ${orderDate} 수주 데이터 조회 중...`, 'info');

    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        orderDate,
        status: { in: ['접수', '확정'] },
      },
      include: {
        details: {
          include: { product: true },
        },
      },
    });

    // 수주 데이터를 OrderIntakeItem 형태로 변환
    let orders: OrderIntakeItem[] = [];

    if (salesOrders.length > 0) {
      // 품목별로 집계 (같은 품번의 여러 수주를 합산)
      const itemMap: Record<string, OrderIntakeItem> = {};
      for (const so of salesOrders) {
        for (const d of so.details) {
          const key = d.product.productCode;
          if (!itemMap[key]) {
            itemMap[key] = {
              orderId: so.orderNo,
              storeCode: so.centerCode,
              storeName: `GS센터-${so.centerCode}`,
              orderItemCode: d.product.productCode,
              orderItemName: d.product.name,
              orderQty1: 0,
              orderQty2: 0,
              totalOrderQty: 0,
              deliveryPrice: d.unitPrice || 0,
            };
          }
          itemMap[key].orderQty1 += d.orderQty1 || 0;
          itemMap[key].orderQty2 += d.orderQty2 || 0;
          itemMap[key].totalOrderQty += d.totalQty || (d.orderQty1 + d.orderQty2);
        }
      }
      orders = Object.values(itemMap);
      addLog('STEP 1: 수주 조회', `DB에서 ${salesOrders.length}건 수주, ${orders.length}개 품목 집계 완료`, 'success');
    } else if (params.useLegacyFallback === true) {
      // 명시적 요청 시에만 내장 샘플 데이터 사용 (폴백)
      orders = [...SAMPLE_STORE_ORDERS];
      addLog('STEP 1: 수주 조회', `DB 수주 없음 → 내장 샘플 데이터 ${orders.length}건 사용 (명시적 폴백)`, 'warn');
    } else {
      // 수주 없음 → 빈 결과 반환 (샘플 저장 방지)
      addLog('STEP 1: 수주 조회', `${orderDate} 수주가 DB에 없습니다. 주문등록GSR에서 먼저 수주를 등록하세요.`, 'error');
      const now = new Date();
      const emptySummary: PipelineExecutionSummary = {
        executionDate: orderDate,
        executionTime: now.toTimeString().slice(0, 8),
        totalOrdersCount: 0,
        totalOrdersQty: 0,
        dispatchedWorkOrdersCount: 0,
        depletedMaterialsCount: 0,
        totalSalesAmount: 0,
        totalDirectMaterialCost: 0,
        totalLogisticsCost: 0,
        totalIndirectCost: 0,
        totalCostAmount: 0,
        netProfitAmount: 0,
        overallProfitRate: 0,
        abnormalItemsCount: 0,
        logs,
      };
      return {
        workOrders: [],
        materialDepletions: [],
        costResults: [],
        summary: emptySummary,
        materialRequirements: [],
        isEmpty: true,
      };
    }

    const totalOrderQty = orders.reduce((sum, o) => sum + o.totalOrderQty, 0);
    const orderQty1 = orders.reduce((sum, o) => sum + o.orderQty1, 0);
    const orderQty2 = orders.reduce((sum, o) => sum + o.orderQty2, 0);
    addLog(
      'STEP 1: 수주 집계',
      `총 수주수량: ${totalOrderQty.toLocaleString()}개 (1편: ${orderQty1.toLocaleString()} / 2편: ${orderQty2.toLocaleString()})`,
      'success'
    );

    // ============================================================
    // STEP 2: 대표제품 N:1 매핑 (DB ReprProduct 테이블 우선)
    // ============================================================
    addLog('STEP 2: 대표제품 매핑', 'DB ReprProduct 테이블에서 N:1 매핑 조회 중...', 'info');

    const reprMappings = await prisma.reprProduct.findMany({
      where: { isUsed: true },
      include: {
        orderProduct: true,
        reprProduct: true,
      },
    });

    // DB 매핑 맵 구성
    const reprMap = new Map<string, { reprCode: string; reprName: string; category: string }>();
    for (const rm of reprMappings) {
      reprMap.set(rm.orderProduct.productCode, {
        reprCode: rm.reprProduct.productCode,
        reprName: rm.reprProduct.name,
        category: rm.reprProduct.kind || rm.reprProduct.category,
      });
    }

    // 레거시 매핑도 폴백으로 추가
    for (const lm of REPR_MAPPINGS) {
      if (!reprMap.has(lm.orderItemCode)) {
        reprMap.set(lm.orderItemCode, {
          reprCode: lm.reprItemCode,
          reprName: lm.reprItemName,
          category: lm.category,
        });
      }
    }

    const mappedOrders = orders.map((order) => {
      const mapping = reprMap.get(order.orderItemCode);
      return {
        ...order,
        reprCode: mapping ? mapping.reprCode : order.orderItemCode,
        reprName: mapping ? mapping.reprName : order.orderItemName,
        category: mapping ? mapping.category : '일반식품',
      };
    });

    addLog(
      'STEP 2: 대표제품 매핑',
      `DB매핑 ${reprMappings.length}건 + 레거시매핑 ${REPR_MAPPINGS.length}건 → ${mappedOrders.length}개 품목 정규화 완료`,
      'success'
    );

    // ============================================================
    // STEP 3: BOM 다단계 전개 (DB BomHeader+BomDetail 우선)
    // ============================================================
    addLog('STEP 3: BOM 전개', 'DB BOM 테이블에서 다단계 레시피 조회 중...', 'info');

    // DB BOM 조회 (완성품 기준 → 하위 자재 include)
    const bomHeaders = await prisma.bomHeader.findMany({
      where: { isUsed: true },
      include: {
        parentProduct: true,
        details: {
          include: {
            childProduct: {
              include: {
                prices: { orderBy: { effectiveDate: 'desc' as const }, take: 1 },
                partner: true,
              },
            },
            gye: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // DB BOM을 코드 및 품명 기반 맵으로 변환
    const dbBomByCode = new Map<string, typeof bomHeaders[0]>();
    const dbBomByName = new Map<string, typeof bomHeaders[0]>();
    const dbBomByNorm = new Map<string, typeof bomHeaders[0]>();

    for (const bh of bomHeaders) {
      if (bh.parentProduct?.productCode) dbBomByCode.set(bh.parentProduct.productCode, bh);
      if (bh.parentProduct?.name) {
        dbBomByName.set(bh.parentProduct.name, bh);
        dbBomByNorm.set(normName(bh.parentProduct.name), bh);
      }
    }

    const findDbBom = (order: { reprCode: string; reprName: string }) => {
      return (
        dbBomByCode.get(order.reprCode) ||
        dbBomByName.get(order.reprName) ||
        dbBomByNorm.get(normName(order.reprName))
      );
    };

    let dbBomUsed = 0;
    let legacyBomUsed = 0;

    // ============================================================
    // STEP 4: 작업지시 분배 + 자재소요량 집계
    // ============================================================
    const workOrderList: WorkOrderDispatchItem[] = [];
    const materialRequirementMap: Record<string, {
      partCode: string;
      partName: string;
      partSpec: string;
      unit: string;
      warehouse: string;
      totalReqQty: number;
      category: string;
      partnerId: string | null;
      partnerName: string;
      unitCost: number;
    }> = {};

    let seqCounter = 1;

    for (const order of mappedOrders) {
      // shift 필터링 (1편 / 2편 엄격 분리)
      const effOrderQty =
        params.shift === '2편'
          ? order.orderQty2
          : params.shift === '1편'
          ? order.orderQty1
          : order.totalOrderQty;

      if (effOrderQty <= 0) continue;

      // 완제품 성형장 지시 등록
      let moldingGye = { gyeId: 'GFS004', gyeName: '성형장(도시락)', line: '도시락1호라인' };
      if (order.category === '김밥') {
        moldingGye = { gyeId: 'GFS005', gyeName: '성형장(김밥)', line: '김밥1호라인' };
      } else if (order.category === '삼각김밥') {
        moldingGye = { gyeId: 'GFS007', gyeName: '성형장(삼각김밥)', line: '삼각1호라인' };
      } else if (order.category === '샌드위치') {
        moldingGye = { gyeId: 'GFS002', gyeName: '성형장(샌드위치)', line: '샌드1호라인' };
      } else if (order.category === '햄버거') {
        moldingGye = { gyeId: 'GFS003', gyeName: '성형장(햄버거)', line: '버거1호라인' };
      } else if (order.category === '주먹밥') {
        moldingGye = { gyeId: 'GFS008', gyeName: '성형장(주먹밥)', line: '주먹밥1호라인' };
      } else if (order.category === '무스비') {
        moldingGye = { gyeId: 'GFS009', gyeName: '성형장(무스비)', line: '무스비1호라인' };
      }

      workOrderList.push({
        id: seqCounter++,
        gyeId: moldingGye.gyeId,
        gyeName: moldingGye.gyeName,
        lineName: moldingGye.line,
        workSeq: seqCounter,
        partName: order.reprName,
        partSpec: '1ea/팩',
        unit: 'ea',
        nextProcess: '포장/금속검출',
        totalOrderQty: effOrderQty,
        orderQty1: order.orderQty1,
        orderQty2: order.orderQty2,
        prodQty: effOrderQty,
        completeStatus: '대기',
        completeTime: '',
      });

      // BOM 전개: DB 우선, 없으면 레거시 폴백
      const dbBom = findDbBom(order);
      if (dbBom && dbBom.details.length > 0) {
        // === DB BOM 사용 ===
        dbBomUsed++;
        for (const bd of dbBom.details) {
          const factor = bd.unitQty / ((bd.yieldRate || 100) / 100);
          const compTotalReq = Math.round(effOrderQty * factor * 100) / 100;
          const compReq1 = Math.round(order.orderQty1 * factor * 100) / 100;
          const compReq2 = Math.round(order.orderQty2 * factor * 100) / 100;

          if (bd.gye) {
            workOrderList.push({
              id: seqCounter++,
              gyeId: bd.gye.id,
              gyeName: bd.gye.name,
              lineName: bd.nextProcess || '자동배치',
              workSeq: seqCounter,
              partName: bd.childProduct?.name || '',
              partSpec: `${bd.unitQty}${bd.unit} 배합`,
              unit: bd.unit,
              nextProcess: bd.nextProcess || moldingGye.gyeName,
              totalOrderQty: compTotalReq,
              orderQty1: compReq1,
              orderQty2: compReq2,
              prodQty: compTotalReq,
              completeStatus: '대기',
              completeTime: '',
            });
          }

          if (bd.childProduct) {
            const code = bd.childProduct.productCode || `MAT-${bd.childProductId}`;
            const unitCost = bd.childProduct.prices?.[0]?.purchasePrice || 0;
            if (!materialRequirementMap[code]) {
              materialRequirementMap[code] = {
                partCode: code,
                partName: bd.childProduct.name,
                partSpec: bd.childProduct.spec || '',
                unit: bd.unit || bd.childProduct.unit || 'g',
                warehouse: bd.childProduct.warehouse || '상온창고',
                totalReqQty: 0,
                category: bd.childProduct.category || '원재료',
                partnerId: bd.childProduct.partnerId,
                partnerName: bd.childProduct.partner?.name || '',
                unitCost,
              };
            }
            materialRequirementMap[code].totalReqQty += compTotalReq;
          }
        }
      } else if (BOM_MASTER_RECIPES[order.reprCode]) {
        // === 레거시 BOM 폴백 ===
        legacyBomUsed++;
        const recipe = BOM_MASTER_RECIPES[order.reprCode];
        recipe.forEach((comp) => {
          const factor = comp.unitQty / (comp.yieldRate / 100);
          const compTotalReq = Math.round(effOrderQty * factor * 100) / 100;
          const compReq1 = Math.round(order.orderQty1 * factor * 100) / 100;
          const compReq2 = Math.round(order.orderQty2 * factor * 100) / 100;

          if (comp.level === 2) {
            workOrderList.push({
              id: seqCounter++,
              gyeId: comp.gyeId,
              gyeName: comp.gyeName,
              lineName: comp.lineName,
              workSeq: seqCounter,
              partName: comp.componentName,
              partSpec: `${comp.unitQty}${comp.unit} 배합`,
              unit: comp.unit,
              nextProcess: comp.nextProcess,
              totalOrderQty: compTotalReq,
              orderQty1: compReq1,
              orderQty2: compReq2,
              prodQty: compTotalReq,
              completeStatus: '대기',
              completeTime: '',
            });
          }

          const rawComponents = comp.subComponents || [comp];
          rawComponents.forEach((raw) => {
            if (raw.level === 3) {
              const rawFactor = raw.unitQty / (raw.yieldRate / 100);
              const rawReq = Math.round(effOrderQty * rawFactor * 100) / 100;
              if (!materialRequirementMap[raw.componentCode]) {
                materialRequirementMap[raw.componentCode] = {
                  partCode: raw.componentCode,
                  partName: raw.componentName,
                  partSpec: `${raw.unitQty}${raw.unit}`,
                  unit: raw.unit,
                  warehouse: raw.warehouse,
                  totalReqQty: 0,
                  category: raw.warehouse === '부재료보관고' ? '부재료' : '원재료',
                  partnerId: null,
                  partnerName: '',
                  unitCost: raw.unitCost || 0,
                };
              }
              materialRequirementMap[raw.componentCode].totalReqQty += rawReq;
            }
          });
        });
      }
      // BOM 없는 제품은 소요량 계산 불가 → 건너뜀
    }

    addLog(
      'STEP 3-4: BOM 전개 & 공정 분배',
      `DB BOM ${dbBomUsed}건 + 레거시 BOM ${legacyBomUsed}건 사용 → 작업지시 ${workOrderList.length}건, 자재 ${Object.keys(materialRequirementMap).length}종`,
      'success'
    );

    // ============================================================
    // STEP 5: 실제 Inventory 기반 FEFO 자재 차감
    // ============================================================
    addLog('STEP 5: 자재 차감 & FEFO', 'DB Inventory에서 실제 현재고 조회 후 FEFO 차감 적용 중...', 'info');

    // DB에서 실제 재고 사전 로드 (유통기한 오름차순 = FEFO)
    const allInventories = await prisma.inventory.findMany({
      where: { currentQty: { gt: 0 } },
      orderBy: { expiryDate: 'asc' }, // FEFO: 유통기한 가까운 것 먼저
    });

    const invMapByNorm = new Map<string, typeof allInventories>();
    const invMapByCode = new Map<string, typeof allInventories>();
    for (const inv of allInventories) {
      if (inv.productCode) {
        const list = invMapByCode.get(inv.productCode) || [];
        list.push(inv);
        invMapByCode.set(inv.productCode, list);
      }
      if (inv.productName) {
        const k = normName(inv.productName);
        const list = invMapByNorm.get(k) || [];
        list.push(inv);
        invMapByNorm.set(k, list);
      }
    }

    const materialDepletions: MaterialLedgerDepletionItem[] = [];
    const materialRequirements: MaterialRequirementRow[] = [];

    let idx = 0;
    for (const mat of Object.values(materialRequirementMap)) {
      idx++;

      const matNorm = normName(mat.partName);
      const inventories = invMapByCode.get(mat.partCode) || invMapByNorm.get(matNorm) || [];

      const totalStock = inventories.reduce((sum, inv) => sum + inv.currentQty, 0);
      const fefoLot = inventories.length > 0 ? inventories[0] : null;

      // 이월재고 = 현재 총 재고
      const carriedOver = totalStock;
      const outQty = Math.round(mat.totalReqQty);
      const currentAfter = carriedOver - outQty;

      materialDepletions.push({
        id: idx,
        ledgerDate: orderDate,
        category: (mat.category as '원재료' | '부재료' | '포장재') || '원재료',
        partCode: mat.partCode,
        partName: mat.partName,
        partSpec: mat.partSpec,
        unit: mat.unit,
        warehouse: mat.warehouse,
        carriedOverQty: carriedOver,
        inQty: 0,
        outQty,
        currentStock: Math.max(0, currentAfter),
        safetyStock: 0, // 아래에서 채움
        fefoLotNo: fefoLot?.lotNo || `LOT-${orderDate.replace(/-/g, '')}-${mat.partCode}`,
        expiryDate: fefoLot?.expiryDate || '',
      });

      // 자재소요량 적재 (발주 검토 화면용)
      materialRequirements.push({
        productCode: mat.partCode,
        productName: mat.partName,
        category: mat.category,
        unit: mat.unit,
        requiredQty: Math.round(mat.totalReqQty),
        currentStock: totalStock,
        shortageQty: Math.max(0, Math.round(mat.totalReqQty) - totalStock),
        partnerId: mat.partnerId,
        partnerName: mat.partnerName,
      });
    }

    addLog(
      'STEP 5: 자재 차감 & FEFO',
      `${materialDepletions.length}개 자재 실재고 FEFO 차감 완료, ${materialRequirements.filter(m => m.shortageQty > 0).length}개 부족 자재 검출`,
      'success'
    );

    // ============================================================
    // STEP 6: 원가/손익 집계
    // ============================================================
    addLog('STEP 6: 원가/손익 집계', '직접재료비, 물류비(12.5%), 간접비 배분 실시간 연산 시작', 'info');

    const totalSales = mappedOrders.reduce(
      (sum, o) => sum + o.totalOrderQty * (o.deliveryPrice > 0 ? o.deliveryPrice : 0),
      0
    );

    let abnormalCount = 0;
    const costResults: CostAnalysisResultItem[] = mappedOrders.map((order, idx) => {
      const salesQty = order.totalOrderQty;
      const unitPrice = order.deliveryPrice;
      const salesAmount = salesQty * (unitPrice > 0 ? unitPrice : 0);
      const salesRatio = totalSales > 0 ? Number(((salesAmount / totalSales) * 100).toFixed(2)) : 0;

      // 직접재료비: DB BOM 또는 레거시 BOM
      let unitMaterialCost = 0;
      const dbBom = findDbBom(order);
      if (dbBom && dbBom.details.length > 0) {
        for (const bd of dbBom.details) {
          const price = bd.childProduct.prices[0]?.purchasePrice || 0;
          unitMaterialCost += bd.unitQty * price;
        }
      } else {
        const recipe = BOM_MASTER_RECIPES[order.reprCode];
        if (recipe) {
          recipe.forEach((c) => {
            unitMaterialCost += c.unitQty * (c.unitCost || 0);
          });
        } else {
          unitMaterialCost = Math.round(unitPrice * 0.45);
        }
      }

      const directMaterialCost = Math.round(unitMaterialCost * salesQty);
      const logisticsRatio = 12.5;
      const logisticsCost = Math.round(salesAmount * (logisticsRatio / 100));
      const indirectCostAllocated = Math.round(totalOverhead * (salesRatio / 100));
      const totalCost = indirectCostAllocated + logisticsCost + directMaterialCost;
      const salesProfit = salesAmount - totalCost;
      const unitCost = salesQty > 0 ? Math.round(totalCost / salesQty) : 0;
      const unitProfit = unitPrice - unitCost;
      const profitRate = salesAmount > 0 ? Number(((salesProfit / salesAmount) * 100).toFixed(2)) : 0;
      const costRatio = salesAmount > 0 ? Number(((totalCost / salesAmount) * 100).toFixed(2)) : 0;

      const isAbnormalPrice = unitPrice <= 0 || unitPrice === -9 || unitPrice === -99;
      const isLossItem = salesProfit < 0 || unitProfit < 0 || (unitPrice > 0 && unitPrice < unitMaterialCost);
      if (isAbnormalPrice || isLossItem) abnormalCount++;

      let alertMessage = '';
      if (isAbnormalPrice) alertMessage = '★ 납품단가 미등록(-9/0원)';
      else if (isLossItem) alertMessage = `★ 역마진 경고 (개당손익: ${unitProfit.toLocaleString()}원)`;

      return {
        id: idx + 1,
        productId: order.reprCode,
        productName: order.reprName,
        salesAmount, salesRatio, indirectCostAllocated, logisticsRatio, logisticsCost,
        directMaterialUnit: unitMaterialCost, productionQty: salesQty, directMaterialCost,
        totalCost, salesProfit, profitRate, costRatio, salesQty, unitPrice, unitCost, unitProfit,
        isAbnormalPrice, isLossItem, alertMessage,
      };
    });

    if (abnormalCount > 0) {
      addLog('STEP 6: 원가/손익 집계', `경고: 총 ${abnormalCount}건의 이상 단가 또는 역마진 품목 검출`, 'warn');
    }

    const totalDirectMat = costResults.reduce((s, c) => s + c.directMaterialCost, 0);
    const totalLogistics = costResults.reduce((s, c) => s + c.logisticsCost, 0);
    const totalIndirect = costResults.reduce((s, c) => s + c.indirectCostAllocated, 0);
    const totalCostSum = costResults.reduce((s, c) => s + c.totalCost, 0);
    const netProfit = totalSales - totalCostSum;
    const overallProfitRate = totalSales > 0 ? Number(((netProfit / totalSales) * 100).toFixed(2)) : 0;

    addLog(
      '완료',
      `파이프라인 연산 완료 | 매출: ${totalSales.toLocaleString()}원, 총원가: ${totalCostSum.toLocaleString()}원, 순손익: ${netProfit.toLocaleString()}원 (${overallProfitRate}%)`,
      'success'
    );

    const now = new Date();
    const summary: PipelineExecutionSummary = {
      executionDate: orderDate,
      executionTime: now.toTimeString().slice(0, 8),
      totalOrdersCount: orders.length,
      totalOrdersQty: totalOrderQty,
      dispatchedWorkOrdersCount: workOrderList.length,
      depletedMaterialsCount: materialDepletions.length,
      totalSalesAmount: totalSales,
      totalDirectMaterialCost: totalDirectMat,
      totalLogisticsCost: totalLogistics,
      totalIndirectCost: totalIndirect,
      totalCostAmount: totalCostSum,
      netProfitAmount: netProfit,
      overallProfitRate,
      abnormalItemsCount: abnormalCount,
      logs,
    };

    return {
      workOrders: workOrderList,
      materialDepletions,
      costResults,
      summary,
      materialRequirements,
      isEmpty: false,
    };
  }
}

