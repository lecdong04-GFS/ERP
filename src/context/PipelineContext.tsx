'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  WorkOrderDispatchItem,
  MaterialLedgerDepletionItem,
  CostAnalysisResultItem,
  PipelineExecutionSummary,
  OrderIntakeItem,
} from '@/services/pipeline/types';
import {
  ProductionCostPipelineEngine,
  SAMPLE_STORE_ORDERS,
} from '@/services/pipeline/ProductionCostPipeline';
import { useCost } from '@/components/cost/context/CostContext';
import { kstToday } from '@/lib/kst';

interface PipelineContextType {
  isPipelineModalOpen: boolean;
  openPipelineModal: () => void;
  closePipelineModal: () => void;
  isExcelOrderModalOpen: boolean;
  openExcelOrderModal: () => void;
  closeExcelOrderModal: () => void;
  isExecuting: boolean;
  latestSummary: PipelineExecutionSummary | null;
  dispatchedWorkOrders: WorkOrderDispatchItem[];
  depletedMaterials: MaterialLedgerDepletionItem[];
  pipelineCostResults: CostAnalysisResultItem[];
  executePipeline: (customOrders?: OrderIntakeItem[], overhead?: number) => Promise<PipelineExecutionSummary>;
  pipelineRunCount: number;
  currentOrders: OrderIntakeItem[];
}

const PipelineContext = createContext<PipelineContextType | null>(null);

export const PipelineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setProductPlList, setMonthlyPlRows, totalOverhead } = useCost();

  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pipelineRunCount, setPipelineRunCount] = useState(1);

  // Initial execution results generated on boot
  const initialResult = ProductionCostPipelineEngine.executePipeline(
    SAMPLE_STORE_ORDERS,
    totalOverhead > 0 ? totalOverhead : 85000000
  );

  const [latestSummary, setLatestSummary] = useState<PipelineExecutionSummary | null>(
    initialResult.summary
  );
  const [dispatchedWorkOrders, setDispatchedWorkOrders] = useState<WorkOrderDispatchItem[]>(
    initialResult.workOrders
  );
  const [depletedMaterials, setDepletedMaterials] = useState<MaterialLedgerDepletionItem[]>(
    initialResult.materialDepletions
  );
  const [pipelineCostResults, setPipelineCostResults] = useState<CostAnalysisResultItem[]>(
    initialResult.costResults
  );

  const [currentOrders, setCurrentOrders] = useState<OrderIntakeItem[]>(SAMPLE_STORE_ORDERS);

  const [isExcelOrderModalOpen, setIsExcelOrderModalOpen] = useState(false);

  // DB에 영구 적재된 작업지시 데이터가 있으면 복원 로드
  useEffect(() => {
    fetch('/api/production/work-order')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const restored: WorkOrderDispatchItem[] = res.data.map((wo: any, idx: number) => ({
            id: wo.id || idx + 1,
            gyeId: wo.gyeId,
            gyeName: wo.gyeName || (wo.gye?.name ?? ''),
            lineName: `${wo.gyeName || ''}라인`,
            workSeq: wo.workSeq || idx + 1,
            partName: wo.productName,
            partSpec: wo.spec,
            unit: wo.unit,
            nextProcess: wo.nextProcess || '검품/포장',
            totalOrderQty: wo.orderQty,
            orderQty1: Math.round(wo.orderQty * 0.55),
            orderQty2: Math.round(wo.orderQty * 0.45),
            prodQty: wo.prodQty || wo.orderQty,
            completeStatus: wo.status as any,
            completeTime: wo.completeTime || '완료',
          }));
          setDispatchedWorkOrders(restored);
        }
      })
      .catch((err) => console.error('Failed to restore work orders from DB:', err));
  }, []);

  const openPipelineModal = useCallback(() => setIsPipelineModalOpen(true), []);
  const closePipelineModal = useCallback(() => setIsPipelineModalOpen(false), []);

  const openExcelOrderModal = useCallback(() => setIsExcelOrderModalOpen(true), []);
  const closeExcelOrderModal = useCallback(() => setIsExcelOrderModalOpen(false), []);

  const executePipeline = useCallback(
    async (customOrders?: OrderIntakeItem[], overhead?: number) => {
      setIsExecuting(true);

      const ordersToUse = customOrders && customOrders.length > 0 ? customOrders : currentOrders;
      if (customOrders && customOrders.length > 0) {
        setCurrentOrders(customOrders);
      }

      const overheadAmount = overhead !== undefined ? overhead : totalOverhead > 0 ? totalOverhead : 85000000;

      // Realistic pipeline visual execution delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = ProductionCostPipelineEngine.executePipeline(
        ordersToUse,
        overheadAmount
      );

      // 데이터베이스에 영구 저장 (비동기 API 호출)
      try {
        fetch('/api/pipeline/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderDate: kstToday(),
            shift: '1편',
          }),
        }).catch((err) => console.error('Failed to sync pipeline to DB:', err));
      } catch (err) {
        console.error('Pipeline DB fetch error:', err);
      }

      setDispatchedWorkOrders(result.workOrders);
      setDepletedMaterials(result.materialDepletions);
      setPipelineCostResults(result.costResults);
      setLatestSummary(result.summary);
      setPipelineRunCount((prev) => prev + 1);

      // Synchronize with CostContext (ProdPlStatusView)
      setProductPlList((prev) => {
        return prev.map((item) => {
          const match = result.costResults.find(
            (c) => c.productName === item.productName || item.productName.includes(c.productName)
          );
          if (match) {
            return {
              ...item,
              salesAmount: match.salesAmount > 0 ? match.salesAmount : item.salesAmount,
              salesRatio: match.salesRatio > 0 ? match.salesRatio : item.salesRatio,
              indirectCostAllocated: match.indirectCostAllocated,
              logisticsCost: match.logisticsCost,
              directMaterialUnit: match.directMaterialUnit,
              directMaterialCost: match.directMaterialCost,
              totalCost: match.totalCost,
              salesProfit: match.salesProfit,
              profitRate: match.profitRate,
              costRatio: match.costRatio,
              unitCost: match.unitCost,
              unitProfit: match.unitProfit,
            };
          }
          return item;
        });
      });

      // Synchronize with Monthly P&L
      setMonthlyPlRows((prev) => {
        return prev.map((row) => {
          if (row.id === 3) {
            // 원가합계
            return {
              ...row,
              total: result.summary.totalCostAmount,
              costToSalesRatio: `${((result.summary.totalCostAmount / result.summary.totalSalesAmount) * 100).toFixed(2)} %`,
            };
          }
          if (row.id === 13) {
            // 손익총계
            return {
              ...row,
              total: result.summary.netProfitAmount,
              costToSalesRatio: `${result.summary.overallProfitRate.toFixed(2)} %`,
            };
          }
          if (row.id === 14) {
            // 손익율
            return {
              ...row,
              total: result.summary.overallProfitRate,
              costToSalesRatio: `${result.summary.overallProfitRate.toFixed(2)} %`,
            };
          }
          return row;
        });
      });

      setIsExecuting(false);
      return result.summary;
    },
    [totalOverhead, setProductPlList, setMonthlyPlRows]
  );

  return (
    <PipelineContext.Provider
      value={{
        isPipelineModalOpen,
        openPipelineModal,
        closePipelineModal,
        isExcelOrderModalOpen,
        openExcelOrderModal,
        closeExcelOrderModal,
        isExecuting,
        latestSummary,
        dispatchedWorkOrders,
        depletedMaterials,
        pipelineCostResults,
        executePipeline,
        pipelineRunCount,
        currentOrders,
      }}
    >
      {children}
    </PipelineContext.Provider>
  );
};

export const usePipeline = () => {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error('usePipeline must be used within a PipelineProvider');
  }
  return context;
};
