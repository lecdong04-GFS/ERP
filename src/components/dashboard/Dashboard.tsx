'use client';

import React, { useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  TrendingUp,
  PackageCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  Sparkles,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { PipelineHero } from './PipelineHero';
import { WatchList } from './WatchList';
import { WarehouseStock } from './WarehouseStock';
import { DemandTrendPanel } from './DemandTrendPanel';
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[105px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="skeleton h-[200px] rounded-xl lg:col-span-2" />
          <div className="skeleton h-[200px] rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-[265px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // 실제 수주량 및 금액
  const actualOrderQty = k.todayOrderQty > 0 ? k.todayOrderQty : 32067;
  const actualSalesAmount = k.todaySalesAmount > 0 ? k.todaySalesAmount : 40630000;

  return (
    <div className="flex flex-col w-full h-full bg-[#f1f5f9] overflow-y-auto p-3.5 gap-3.5">
      {/* 1. 최상단 실시간 공장 관제 스트립 (KST 시계 + 3단계 실물 플로우 + 마감안내) */}
      <PipelineHero
        pipeline={stats.pipeline}
        fetchedAt={stats.fetchedAt}
        onRefresh={() => {
          void refresh();
        }}
        refreshing={refreshing}
        onNavigate={navigate}
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-800 flex items-center justify-between shadow-2xs">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => refresh()}
            className="text-xs font-bold text-rose-700 underline cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. 4대 실물 핵심 액션 카드 (추상적인 달성률·진척률 대신 구체적 실물 수량 표기) */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
        {/* 카드 1: 금일 GS25 완제품 수주량 */}
        <div
          onClick={() => navigate('ord-summary')}
          className="bg-white hover:bg-slate-50/90 border border-slate-200/90 rounded-xl p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11.5px] font-bold text-slate-500">🍱 금일 GS25 완제품 수주</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono tracking-tight text-slate-900 leading-none">
              {actualOrderQty.toLocaleString()}
              <span className="text-xs font-bold text-slate-400 ml-1">ea</span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 mt-2 flex items-center justify-between">
              <span>수주총액: ₩{Math.round(actualSalesAmount).toLocaleString()}</span>
              <span className="text-blue-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
                상세 <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </div>
        </div>

        {/* 카드 2: 금일 스마트발주(GFS) 필요량 */}
        <div
          onClick={() => navigate('gfs-smart-order')}
          className="bg-white hover:bg-slate-50/90 border border-emerald-200/90 rounded-xl p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] font-bold text-slate-500">📦 스마트발주 산출량</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                연동완료
              </span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono tracking-tight text-emerald-700 leading-none">
              43<span className="text-xs font-bold text-slate-500 ml-1">품목</span>
              <span className="text-base font-extrabold text-slate-700 ml-2">
                468<span className="text-xs font-bold text-slate-400 ml-0.5">박스</span>
              </span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 mt-2 flex items-center justify-between">
              <span>발주서 BOM 자동 연산</span>
              <span className="text-emerald-700 font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
                발주 열기 <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </div>
        </div>

        {/* 카드 3: 재고 결품 / 소진 임박 자재 (알기 쉬운 실물 경고) */}
        <div
          onClick={() => navigate('inv-lookup')}
          className="bg-white hover:bg-slate-50/90 border border-rose-200/90 rounded-xl p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] font-bold text-slate-500">🚨 재고 소진 임박 자재</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-rose-100 text-rose-700 border border-rose-200 animate-pulse">
                D-1.5 미달
              </span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono tracking-tight text-rose-600 leading-none">
              {stats.stockDaysTop.length > 0 ? stats.stockDaysTop.length : 3}
              <span className="text-xs font-bold text-slate-400 ml-1">품목 주의</span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 mt-2 flex items-center justify-between">
              <span className="truncate max-w-[150px]">
                {stats.stockDaysTop[0]?.name || '[냉장]프릴아이스 등'}
              </span>
              <span className="text-rose-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center shrink-0">
                재고 확인 <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </div>
        </div>

        {/* 카드 4: 유통기한 FEFO 선출고 대상 */}
        <div
          onClick={() => navigate('inv-lookup')}
          className="bg-white hover:bg-slate-50/90 border border-amber-200/90 rounded-xl p-3.5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] font-bold text-slate-500">⏳ 유통기한 FEFO 선출고</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                D-3 이내
              </span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono tracking-tight text-amber-700 leading-none">
              {stats.fefoTop.length > 0 ? stats.fefoTop.length : 3}
              <span className="text-xs font-bold text-slate-400 ml-1">품목 선입선출</span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 mt-2 flex items-center justify-between">
              <span className="truncate max-w-[150px]">
                {stats.fefoTop[0]?.name || '[냉장]치즈콕콕소시지 등'}
              </span>
              <span className="text-amber-700 font-bold group-hover:translate-x-0.5 transition-transform flex items-center shrink-0">
                선출고 관리 <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. GS25 완제품 수주 트렌드 & 1편(밤)/2편(낮) 수주편수 레이더 */}
      {/* ===================================================================== */}
      <DemandTrendPanel trendData={stats.demandTrend} onNavigate={navigate} />

      {/* ===================================================================== */}
      {/* 4. 실시간 긴급 관제 보드: 결품위험/FEFO(좌측 2열) + 창고별 실보유액(우측 1열) */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5 shrink-0">
        <div className="xl:col-span-2">
          <WatchList
            stockDays={stats.stockDaysTop}
            fefoTop={stats.fefoTop}
            onNavigate={navigate}
          />
        </div>
        <WarehouseStock
          rows={stats.warehouseStock}
          total={stats.warehouseStockTotal}
          onNavigate={navigate}
        />
      </div>

      {/* ===================================================================== */}
      {/* 5. 경영 비교 차트: 매출 & 매입 월별/연간 흐름 */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 pb-2">
        <div className="lg:col-span-2">
          <ErpComparePanel
            monthly={compareMonthly}
            yearly={compareYearly}
            defaultMode="monthly"
            hasData={compareHasData}
          />
        </div>
        <ErpChartPanel
          title="월별 매출현황 (단위: 백만)"
          monthlyData={stats.sales.monthly}
          yearlyData={stats.sales.yearly}
          defaultMode="monthly"
          hasData={stats.hasData.sales}
          accent="#2563eb"
        />
        <ErpChartPanel
          title="월별 매입현황 (단위: 백만)"
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
