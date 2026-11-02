'use client';

import React, { useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Factory, PackageCheck, TrendingUp } from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { PipelineHero } from './PipelineHero';
import { KpiCard } from './KpiCard';
import { WatchList } from './WatchList';
import { WarehouseStock } from './WarehouseStock';
import { useDashboardStats } from './useDashboardStats';
import type { ChartPoint } from './dashboardData';
import type { ComparePoint } from './ErpComparePanel';

// Recharts는 클라이언트 환경(브라우저)에서만 로드하도록 ssr: false 설정
const ErpChartPanel = dynamic(
  () => import('./ErpChartPanel').then((mod) => mod.ErpChartPanel),
  {
    ssr: false,
    loading: () => (
      <div className="erp-card flex flex-col h-[265px]">
        <div className="h-[34px] bg-[#fbfcfe] border-b border-[var(--line)]" />
        <div className="flex-1 p-3">
          <div className="skeleton h-full w-full rounded-md" />
        </div>
      </div>
    ),
  }
);

const ErpComparePanel = dynamic(
  () => import('./ErpComparePanel').then((mod) => mod.ErpComparePanel),
  {
    ssr: false,
    loading: () => (
      <div className="erp-card flex flex-col h-[340px] lg:col-span-2">
        <div className="h-[34px] bg-[#fbfcfe] border-b border-[var(--line)]" />
        <div className="flex-1 p-3">
          <div className="skeleton h-full w-full rounded-md" />
        </div>
      </div>
    ),
  }
);

/** 매출/매입 시리즈를 라벨 기준으로 병합 (한쪽에만 있는 날짜는 0) */
function zipCompare(sales: ChartPoint[], purchase: ChartPoint[]): ComparePoint[] {
  const map = new Map<string, ComparePoint>();
  sales.forEach((p) => map.set(p.label, { label: p.label, sales: p.value || 0, purchase: 0 }));
  purchase.forEach((p) => {
    const cur = map.get(p.label);
    if (cur) cur.purchase = p.value || 0;
    else map.set(p.label, { label: p.label, sales: 0, purchase: p.value || 0 });
  });
  return [...map.values()];
}

const wont = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

export const Dashboard: React.FC = () => {
  const { stats, loading, refreshing, error, refresh } = useDashboardStats();
  const { openTab } = useTabs();

  const navigate = useCallback(
    (menuId: string) => {
      const menu = getMenuItemById(menuId);
      if (menu) openTab(menu);
    },
    [openTab]
  );

  const k = stats.kpiSummary;
  const salesDelta =
    k.yesterdaySalesAmount > 0
      ? ((k.todaySalesAmount - k.yesterdaySalesAmount) / k.yesterdaySalesAmount) * 100
      : null;

  const compareMonthly = useMemo(
    () => zipCompare(stats.sales.monthly, stats.purchase.monthly),
    [stats.sales.monthly, stats.purchase.monthly]
  );
  const compareYearly = useMemo(
    () => zipCompare(stats.sales.yearly, stats.purchase.yearly),
    [stats.sales.yearly, stats.purchase.yearly]
  );
  const compareHasData = stats.hasData.sales || stats.hasData.purchase;

  if (loading) {
    return (
      <div className="flex flex-col w-full h-full bg-[var(--canvas)] overflow-hidden p-3 gap-3">
        <div className="skeleton h-[70px] rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[92px] rounded-[10px]" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="skeleton h-[180px] rounded-[10px] lg:col-span-2" />
          <div className="skeleton h-[180px] rounded-[10px]" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[265px] rounded-[10px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-[var(--canvas)] overflow-y-auto p-3 gap-3">
      <PipelineHero
        pipeline={stats.pipeline}
        fetchedAt={stats.fetchedAt}
        onRefresh={() => { void refresh(); }}
        refreshing={refreshing}
      />

      {error && (
        <div className="rounded-md border border-[#fecdd3] bg-[#fff1f2] px-3 py-2 text-[11.5px] text-[#9f1239]">
          {error}
        </div>
      )}

      {/* KPI 3열 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 shrink-0">
        <KpiCard
          label="금일 GS25 수주액"
          value={k.todaySalesAmount}
          format={wont}
          delta={salesDelta}
          deltaLabel={`총 ${k.todayOrderQty.toLocaleString()} ea`}
          tone="money"
          icon={TrendingUp}
          spark={stats.spark.sales}
          sparkTone="info"
        />
        <KpiCard
          label="납품 출하 달성률"
          value={k.deliveryRate}
          format={(n) => `${n.toFixed(1)} %`}
          sub={
            k.deliveryTotalCount > 0
              ? `${k.deliveryDoneCount} / ${k.deliveryTotalCount} 건 완료`
              : '금일 납품 데이터 없음'
          }
          tone="ok"
          icon={PackageCheck}
        />
        <KpiCard
          label="생산 진척률"
          value={stats.pipeline.prodPct}
          format={(n) => `${Math.round(n)} %`}
          sub={
            stats.pipeline.prodTarget > 0
              ? `${stats.pipeline.prodDone.toLocaleString()} / ${stats.pipeline.prodTarget.toLocaleString()} ea · 완료 ${stats.productionWork.doneLines}·진행 ${stats.productionWork.activeLines}`
              : '금일 작업지시 없음'
          }
          tone="info"
          icon={Factory}
          spark={stats.spark.production}
          sparkTone="ok"
        />
      </div>

      {/* FEFO / 재고유지일 / 창고별 재고금액 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 shrink-0">
        <div className="xl:col-span-2">
          <WatchList stockDays={stats.stockDaysTop} onNavigate={navigate} />
        </div>
        <WarehouseStock
          rows={stats.warehouseStock}
          total={stats.warehouseStockTotal}
          onNavigate={navigate}
        />
      </div>

      {/* 차트 2×2 + 매출/매입 비교 (전체폭) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pb-2">
        <div className="lg:col-span-2">
          <ErpComparePanel
            monthly={compareMonthly}
            yearly={compareYearly}
            defaultMode="monthly"
            hasData={compareHasData}
          />
        </div>
        <ErpChartPanel
          title="매출현황 (단위: 백만)"
          monthlyData={stats.sales.monthly}
          yearlyData={stats.sales.yearly}
          defaultMode="monthly"
          hasData={stats.hasData.sales}
          accent="#2b7de9"
        />
        <ErpChartPanel
          title="매입현황 (단위: 백만)"
          monthlyData={stats.purchase.monthly}
          yearlyData={stats.purchase.yearly}
          defaultMode="monthly"
          hasData={stats.hasData.purchase}
          accent="#0ea5e9"
        />
      </div>
    </div>
  );
};
