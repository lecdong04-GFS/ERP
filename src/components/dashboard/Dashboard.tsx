'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Factory, PackageCheck, ShieldAlert, TrendingUp } from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { PipelineHero } from './PipelineHero';
import { ActionQueue } from './ActionQueue';
import { KpiCard } from './KpiCard';
import { WatchList } from './WatchList';
import { WarehouseStock } from './WarehouseStock';
import { DashboardStats, EMPTY_STATS } from './dashboardData';

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

const wont = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { openTab } = useTabs();

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const res = await fetch('/api/dashboard/stats', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setStats((prev) => ({ ...prev, ...json.data }));
        setError(json.error || null);
      } else {
        setError(json.error || '대시보드 데이터를 불러오지 못했습니다.');
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
      setError('대시보드 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 60_000);
    return () => clearInterval(timer);
  }, [load]);

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

  if (loading) {
    return (
      <div className="flex flex-col w-full h-full bg-[var(--canvas)] overflow-hidden p-3 gap-3">
        <div className="skeleton h-[70px] rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
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
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      {error && (
        <div className="rounded-md border border-[#fecdd3] bg-[#fff1f2] px-3 py-2 text-[11.5px] text-[#9f1239]">
          {error}
        </div>
      )}

      <ActionQueue items={stats.actionQueue} onNavigate={navigate} />

      {/* KPI 4열 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
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
          label="생산 가동률"
          value={k.productionRate}
          format={(n) => `${Math.round(n)} %`}
          sub={
            stats.pipeline.prodTarget > 0
              ? `${stats.pipeline.prodDone.toLocaleString()} / ${stats.pipeline.prodTarget.toLocaleString()} ea`
              : '금일 작업지시 없음'
          }
          tone="info"
          icon={Factory}
          spark={stats.spark.production}
          sparkTone="ok"
        />
        <KpiCard
          label="유통기한 임박 (D-3)"
          value={k.expiryUrgentCount}
          format={(n) => `${Math.round(n)} 건`}
          sub={
            k.safetyShortageCount > 0
              ? `안전재고 미달 ${k.safetyShortageCount}품목`
              : '안전재고 정상'
          }
          tone="act"
          icon={ShieldAlert}
          subTone={k.safetyShortageCount > 0 ? 'warn' : 'ok'}
        />
      </div>

      {/* FEFO / 재고유지일 / 창고별 재고금액 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 shrink-0">
        <div className="xl:col-span-2">
          <WatchList fefo={stats.fefoTop} stockDays={stats.stockDaysTop} onNavigate={navigate} />
        </div>
        <WarehouseStock
          rows={stats.warehouseStock}
          total={stats.warehouseStockTotal}
          onNavigate={navigate}
        />
      </div>

      {/* 차트 2×2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pb-2">
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
        <ErpChartPanel
          title="생산현황 (단위: 백만)"
          monthlyData={stats.production.monthly}
          yearlyData={stats.production.yearly}
          defaultMode="monthly"
          hasData={stats.hasData.production}
          accent="#10b981"
          showZeroLabels={false}
        />
        <ErpChartPanel
          title="미납품금액 (단위: 백만)"
          monthlyData={stats.undelivered.monthly}
          yearlyData={stats.undelivered.yearly}
          defaultMode="monthly"
          hasData={stats.hasData.undelivered}
          accent="#f59e0b"
        />
      </div>
    </div>
  );
};
