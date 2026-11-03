export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  monthly: ChartPoint[];
  yearly: ChartPoint[];
}

export type ChartKey = 'sales' | 'purchase' | 'production' | 'undelivered';

export interface PipelineStats {
  orderQty: number;
  prodDone: number;
  prodTarget: number;
  prodPct: number;
  undeliveredCount: number;
  cutoffAt: string | null;
}

export type ActionKind = 'act' | 'warn' | 'info';

export interface ActionItem {
  id: string;
  kind: ActionKind;
  label: string;
  count: number;
  unit: string;
  menuId: string;
}

export interface FefoRow {
  code: string;
  name: string;
  warehouse: string;
  qty: number;
  unit: string;
  daysLeft: number;
}

export interface StockDayRow {
  code: string;
  name: string;
  warehouse: string;
  stockDays: number;
}

export interface WarehouseStockRow {
  warehouse: string;
  items: number;
  amount: number;
}

export interface ProductionLineRow {
  gyeId: string;
  name: string;
  orderQty: number;
  prodQty: number;
  pct: number;
  status: '완료' | '진행중' | '대기';
}

export interface ProductionWorkStats {
  doneLines: number;
  activeLines: number;
  waitingLines: number;
  defectRate: number;
  lines: ProductionLineRow[];
}

export interface KpiSummary {
  totalProducts: number;
  totalPartners: number;
  totalInventoryItems: number;
  salesTotalMonth: number;
  shortageCount: number;
  todaySalesAmount: number;
  yesterdaySalesAmount: number;
  todayOrderQty: number;
  deliveryRate: number;
  deliveryDoneCount: number;
  deliveryTotalCount: number;
  productionRate: number;
  expiryUrgentCount: number;
  safetyShortageCount: number;
}

export interface DemandTrendItem {
  code: string;
  name: string;
  category?: string;
  avgDailyQty: number;
  sumLast7: number;
  sumPrev7: number;
  pct: number;
  spark14: number[];
  recommendation: '자재 안전확보' | '안정 연속생산' | '포장재 발주동결' | '모니터링';
}

export interface DemandTrendStats {
  surge: DemandTrendItem[];
  drop: DemandTrendItem[];
  volume: DemandTrendItem[];
  shiftRatio: { shift1Pct: number; shift2Pct: number };
  baseDate: string;
}

export interface DashboardStats {
  sales: ChartSeries;
  purchase: ChartSeries;
  production: ChartSeries;
  undelivered: ChartSeries;
  notifications: string[];
  hasData: Record<ChartKey, boolean>;
  kpiSummary: KpiSummary;
  pipeline: PipelineStats;
  productionWork: ProductionWorkStats;
  actionQueue: ActionItem[];
  fefoTop: FefoRow[];
  stockDaysTop: StockDayRow[];
  warehouseStock: WarehouseStockRow[];
  warehouseStockTotal: number;
  spark: { sales: number[]; purchase: number[]; production: number[] };
  demandTrend: DemandTrendStats;
  fetchedAt: string;
}

/** 1~31일 빈 축 */
export function emptyMonth(): ChartPoint[] {
  return Array.from({ length: 31 }, (_, i) => ({
    label: String(i + 1).padStart(2, '0'),
    value: 0,
  }));
}

/** 01월~12월 빈 축 */
export function emptyYear(): ChartPoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    label: `${String(i + 1).padStart(2, '0')}월`,
    value: 0,
  }));
}

export const EMPTY_STATS: DashboardStats = {
  sales: { monthly: emptyMonth(), yearly: emptyYear() },
  purchase: { monthly: emptyMonth(), yearly: emptyYear() },
  production: { monthly: emptyMonth(), yearly: emptyYear() },
  undelivered: { monthly: emptyMonth(), yearly: emptyYear() },
  notifications: [],
  hasData: { sales: false, purchase: false, production: false, undelivered: false },
  kpiSummary: {
    totalProducts: 0,
    totalPartners: 0,
    totalInventoryItems: 0,
    salesTotalMonth: 0,
    shortageCount: 0,
    todaySalesAmount: 0,
    yesterdaySalesAmount: 0,
    todayOrderQty: 0,
    deliveryRate: 0,
    deliveryDoneCount: 0,
    deliveryTotalCount: 0,
    productionRate: 0,
    expiryUrgentCount: 0,
    safetyShortageCount: 0,
  },
  pipeline: {
    orderQty: 0,
    prodDone: 0,
    prodTarget: 0,
    prodPct: 0,
    undeliveredCount: 0,
    cutoffAt: null,
  },
  productionWork: {
    doneLines: 0,
    activeLines: 0,
    waitingLines: 0,
    defectRate: 0,
    lines: [],
  },
  actionQueue: [],
  fefoTop: [],
  stockDaysTop: [],
  warehouseStock: [],
  warehouseStockTotal: 0,
  spark: { sales: [0, 0, 0, 0, 0, 0, 0], purchase: [0, 0, 0, 0, 0, 0, 0], production: [0, 0, 0, 0, 0, 0, 0] },
  demandTrend: {
    surge: [],
    drop: [],
    volume: [],
    shiftRatio: { shift1Pct: 50, shift2Pct: 50 },
    baseDate: '',
  },
  fetchedAt: '',
};
