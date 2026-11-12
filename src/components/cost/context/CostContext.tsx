'use client';

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import {
  FixedOverheadItem,
  DailyVariableOverheadItem,
  ProductPlItem,
  MonthlyPlRowItem,
  RecipeCostRateItem,
  INITIAL_FIXED_OVERHEADS,
  INITIAL_DAILY_VARIABLE_OVERHEADS,
  INITIAL_PRODUCT_PL_DATA,
  INITIAL_MONTHLY_PL_ROWS,
  INITIAL_RECIPE_COST_RATES,
} from '../data/costData';

interface CostContextType {
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  selectedMonth: number;
  setSelectedMonth: (m: number) => void;

  // Overhead State
  fixedOverheads: FixedOverheadItem[];
  setFixedOverheads: React.Dispatch<React.SetStateAction<FixedOverheadItem[]>>;
  updateFixedOverhead: (id: number, val: number) => void;
  totalFixedOverhead: number;

  dailyVariableOverheads: DailyVariableOverheadItem[];
  setDailyVariableOverheads: React.Dispatch<React.SetStateAction<DailyVariableOverheadItem[]>>;
  updateDailyVariableOverhead: (id: number, dayIndex: number, val: number) => void;
  totalVariableOverhead: number;
  totalOverhead: number;

  // Product P&L State
  productPlList: ProductPlItem[];
  setProductPlList: React.Dispatch<React.SetStateAction<ProductPlItem[]>>;
  resetProductPlList: () => void;
  allocateOverheadToProducts: () => { success: boolean; totalAllocated: number; count: number };

  // Monthly P&L State
  monthlyPlRows: MonthlyPlRowItem[];
  setMonthlyPlRows: React.Dispatch<React.SetStateAction<MonthlyPlRowItem[]>>;

  // Recipe Cost Rate State
  recipeCostRates: RecipeCostRateItem[];
  setRecipeCostRates: React.Dispatch<React.SetStateAction<RecipeCostRateItem[]>>;
}

const CostContext = createContext<CostContextType | null>(null);

export const CostProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(10);

  // 1. Fixed Overheads
  const [fixedOverheads, setFixedOverheads] = useState<FixedOverheadItem[]>(INITIAL_FIXED_OVERHEADS);

  const updateFixedOverhead = useCallback((id: number, val: number) => {
    setFixedOverheads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, totalCost: val } : item))
    );
  }, []);

  const totalFixedOverhead = useMemo(() => {
    return fixedOverheads.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  }, [fixedOverheads]);

  // 2. Daily Variable Overheads
  const [dailyVariableOverheads, setDailyVariableOverheads] =
    useState<DailyVariableOverheadItem[]>(INITIAL_DAILY_VARIABLE_OVERHEADS);

  const updateDailyVariableOverhead = useCallback((id: number, dayIndex: number, val: number) => {
    setDailyVariableOverheads((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextDaily = [...item.dailyValues];
          nextDaily[dayIndex] = val;
          const nextTotal = nextDaily.reduce((s, v) => s + (v || 0), 0);
          return {
            ...item,
            dailyValues: nextDaily,
            total: nextTotal,
          };
        }
        return item;
      })
    );
  }, []);

  const totalVariableOverhead = useMemo(() => {
    return dailyVariableOverheads.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [dailyVariableOverheads]);

  const totalOverhead = useMemo(() => {
    return totalFixedOverhead + totalVariableOverhead;
  }, [totalFixedOverhead, totalVariableOverhead]);

  // 3. Product P&L
  const [productPlList, setProductPlList] = useState<ProductPlItem[]>(INITIAL_PRODUCT_PL_DATA);

  // 4. Monthly P&L
  const [monthlyPlRows, setMonthlyPlRows] = useState<MonthlyPlRowItem[]>(INITIAL_MONTHLY_PL_ROWS);

  // 5. Recipe Cost Rates
  const [recipeCostRates, setRecipeCostRates] =
    useState<RecipeCostRateItem[]>(INITIAL_RECIPE_COST_RATES);

  // Fetch live data from cost APIs with graceful fallback
  useEffect(() => {
    const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    // 1. Fetch Product P&L
    fetch(`/api/cost/product-pl?pnlMonth=${monthStr}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const mapped: ProductPlItem[] = json.data.map((item: any, idx: number) => ({
            id: item.id || idx + 1,
            productId: item.productId,
            productName: item.product?.name || item.productCode || '제품',
            salesAmount: Number(item.salesAmount) || 0,
            salesRatio: Number(item.salesRatio) || 0,
            indirectCostAllocated: Number(item.indirectCostAlloc) || 0,
            logisticsRate: Number(item.logisticsRate) || 0,
            logisticsCost: Number(item.logisticsCost) || 0,
            directMaterialTotal: Number(item.directMaterialTotal) || 0,
            productionQty: Number(item.productionQty) || 0,
            directMaterialCost: Number(item.directMaterialCost) || 0,
            totalCost: Number(item.totalCost) || 0,
            salesProfit: Number(item.salesProfit) || 0,
            profitRate: Number(item.profitRate) || 0,
            costRatio: Number(item.costRatio) || 0,
            salesQty: Number(item.salesQty) || 0,
            unitPrice: Number(item.unitPrice) || 0,
            unitCost: Number(item.unitCost) || 0,
            unitProfit: Number(item.unitProfit) || 0,
          }));
          setProductPlList(mapped);
        }
      })
      .catch((err) => console.error('Fetch product-pl failed:', err));

    // 2. Fetch Recipe Cost Rates
    fetch(`/api/cost/recipe-rate?calcMonth=${monthStr}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const mapped: RecipeCostRateItem[] = json.data.map((item: any, idx: number) => ({
            id: item.id || idx + 1,
            itemCode: item.productCode || `P-${idx + 1}`,
            itemType: item.category || '완제품',
            category: item.kind || '일반',
            itemName: item.productName || item.product?.name || '제품',
            spec: item.spec || '표준규격',
            unit: 'ea',
            packType: '완제',
            lineName: item.remark || '성형장(도시락)',
            recipeCost: Number(item.recipeCost) || 0,
            deliveryPrice: Number(item.deliveryPrice) || 0,
            diff: Number(item.diff) || 0,
            costRate: Number(item.costRate) || 0,
            remark: item.remark || '',
          }));
          setRecipeCostRates(mapped);
        }
      })
      .catch((err) => console.error('Fetch recipe cost rate failed:', err));

    // 3. Fetch Overheads
    fetch(`/api/cost/overhead?month=${monthStr}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          if (Array.isArray(json.data.fixed) && json.data.fixed.length > 0) {
            const mappedFixed: FixedOverheadItem[] = json.data.fixed.map((f: any, idx: number) => ({
              id: f.id || idx + 1,
              costItem: f.costItem || f.accountName || '경비',
              totalCost: Number(f.totalCost ?? f.totalAmount) || 0,
              remark: f.remark || '',
            }));
            setFixedOverheads(mappedFixed);
          }
          if (Array.isArray(json.data.variable) && json.data.variable.length > 0) {
            const byItem = new Map<string, number[]>();
            for (const v of json.data.variable) {
              const name = String(v.costItem || '변동비');
              if (!byItem.has(name)) byItem.set(name, new Array(31).fill(0));
              const dayMatch = String(v.costDate || '').match(/(\d{1,2})$/);
              const dayIdx = dayMatch ? parseInt(dayMatch[1], 10) - 1 : -1;
              if (dayIdx >= 0 && dayIdx < 31) {
                byItem.get(name)![dayIdx] = Number(v.dailyCost) || 0;
              }
            }
            const mappedVar: DailyVariableOverheadItem[] = Array.from(byItem.entries()).map(
              ([costItem, dailyValues], idx) => ({
                id: idx + 1,
                costItem,
                dailyValues,
                total: dailyValues.reduce((s, x) => s + (x || 0), 0),
              })
            );
            setDailyVariableOverheads(mappedVar);
          }
        }
      })
      .catch((err) => console.error('Fetch overhead failed:', err));
  }, [selectedYear, selectedMonth]);

  // Overhead Allocation Execution
  const allocateOverheadToProducts = useCallback(() => {
    const totalToAllocate = totalOverhead > 0 ? totalOverhead : 85000000; // If user hasn't typed, simulate 85,000,000 allocation or actual
    const totalSales = productPlList.reduce((s, p) => s + p.salesAmount, 0);

    const updated = productPlList.map((prod) => {
      const ratio = totalSales > 0 ? prod.salesAmount / totalSales : 0;
      const allocated = Math.round(totalToAllocate * ratio);
      const totalCost = allocated + prod.logisticsCost + prod.directMaterialCost;
      const salesProfit = prod.salesAmount - totalCost;
      const profitRate =
        prod.salesAmount > 0
          ? Number(((salesProfit / prod.salesAmount) * 100).toFixed(2))
          : 0;
      const costRatio =
        prod.salesAmount > 0 ? Number(((totalCost / prod.salesAmount) * 100).toFixed(2)) : 0;
      const unitCost = prod.salesQty > 0 ? Math.round(totalCost / prod.salesQty) : 0;
      const unitProfit = prod.unitPrice - unitCost;

      return {
        ...prod,
        indirectCostAllocated: allocated,
        totalCost,
        salesProfit,
        profitRate,
        costRatio,
        unitCost,
        unitProfit,
      };
    });

    setProductPlList(updated);

    // Also synchronize Monthly P&L Rows
    setMonthlyPlRows((prev) => {
      return prev.map((row) => {
        if (row.id === 3) {
          // 원가합계
          const dailyTotal = row.dailyValues.map((_, i) => Math.round(totalToAllocate / 31));
          return {
            ...row,
            costToSalesRatio: `${((totalToAllocate / totalSales) * 100).toFixed(2)} %`,
            total: totalToAllocate,
            dailyValues: dailyTotal,
          };
        }
        if (row.id === 13) {
          // 손익총계 = 매출액 - 원가합계
          const salesRow = prev.find((r) => r.id === 1);
          const newTotal = (salesRow ? salesRow.total : 3179622813) - totalToAllocate;
          const dailyProfit = (salesRow?.dailyValues || []).map((sVal) =>
            Math.round(sVal - totalToAllocate / 31)
          );
          return {
            ...row,
            costToSalesRatio: `${((newTotal / totalSales) * 100).toFixed(2)} %`,
            total: newTotal,
            dailyValues: dailyProfit,
          };
        }
        if (row.id === 14) {
          // 손익율(%)
          const salesRow = prev.find((r) => r.id === 1);
          const newTotal = (salesRow ? salesRow.total : 3179622813) - totalToAllocate;
          const rate = Number(((newTotal / totalSales) * 100).toFixed(2));
          return {
            ...row,
            total: rate,
            costToSalesRatio: `${rate} %`,
            dailyValues: new Array(31).fill(rate),
          };
        }
        return row;
      });
    });

    return { success: true, totalAllocated: totalToAllocate, count: updated.length };
  }, [totalOverhead, productPlList]);

  const resetProductPlList = useCallback(() => {
    setProductPlList(INITIAL_PRODUCT_PL_DATA);
    setMonthlyPlRows(INITIAL_MONTHLY_PL_ROWS);
    setFixedOverheads(INITIAL_FIXED_OVERHEADS);
    setDailyVariableOverheads(INITIAL_DAILY_VARIABLE_OVERHEADS);
  }, []);

  return (
    <CostContext.Provider
      value={{
        selectedYear,
        setSelectedYear,
        selectedMonth,
        setSelectedMonth,
        fixedOverheads,
        setFixedOverheads,
        updateFixedOverhead,
        totalFixedOverhead,
        dailyVariableOverheads,
        setDailyVariableOverheads,
        updateDailyVariableOverhead,
        totalVariableOverhead,
        totalOverhead,
        productPlList,
        setProductPlList,
        resetProductPlList,
        allocateOverheadToProducts,
        monthlyPlRows,
        setMonthlyPlRows,
        recipeCostRates,
        setRecipeCostRates,
      }}
    >
      {children}
    </CostContext.Provider>
  );
};

export const useCost = () => {
  const context = useContext(CostContext);
  if (!context) {
    throw new Error('useCost must be used within a CostProvider');
  }
  return context;
};

