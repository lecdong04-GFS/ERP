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
      // 별칭/단축 ID 자동 변환 매핑
      const aliasMap: Record<string, string> = {
        'ord-summary': 'sales-order-summary-gsr',
        'sales-summary': 'sales-order-summary-gsr',
        'order-summary': 'sales-order-summary-gsr',
        'gfs-smart-order': 'pur-gfs-smart-order',
        'smart-order': 'pur-gfs-smart-order',
        'fefo': 'pur-expiry-status',
        'expiry': 'pur-expiry-status',
        'stock': 'inv-lookup',
      };
      const targetId = aliasMap[menuId] || menuId;
      const menu = getMenuItemById(targetId);
      if (menu) {
        openTab(menu);
      } else {
        console.warn(`Menu item not found for id: ${menuId} (target: ${targetId})`);
      }
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

  // 실제 수주량 및 금액 (임시 더미 제거: 실제 DB 등록 수주 기준)
  const actualOrderQty = k.todayOrderQty || 0;
  const actualSalesAmount = k.todaySalesAmount || 0;

  return (
    <div className="flex flex-col w-full h-full bg-[#f1f5f9] overflow-y-auto p-4 sm:p-5 gap-4 sm:gap-5">
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
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 flex items-center justify-between shadow-2xs">
          <span className="font-semibold">{error}</span>
          <button
            type="button"
            onClick={() => refresh()}
            className="text-sm font-extrabold text-rose-700 underline cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. 4대 실물 핵심 액션 카드 (시인성 극대화: 실제 등록 데이터만 정직하게 반영) */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
        {/* 카드 1: 금일 GS25 완제품 수주량 */}
        <div
          onClick={() => navigate('sales-order-summary-gsr')}
          className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[14px] font-extrabold text-slate-700 tracking-tight">🍱 금일 GS25 완제품 수주</span>
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <TrendingUp className="w-5.5 h-5.5" />
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-[34px] font-black font-mono tracking-tight text-slate-900 leading-none">
              {actualOrderQty > 0 ? (
                <>
                  {actualOrderQty.toLocaleString()}
                  <span className="text-sm font-extrabold text-slate-500 ml-1.5">ea</span>
                </>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-[34px] font-black font-mono text-slate-400">0</span>
                  <span className="text-[13px] font-bold text-slate-400">ea (수주 등록 대기)</span>
                </div>
              )}
            </div>
            <div className="text-[12.5px] font-semibold text-slate-600 mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-700 font-bold">
                {actualSalesAmount > 0
                  ? `수주총액: ₩${Math.round(actualSalesAmount).toLocaleString()}`
                  : '금일 수주 파일 등록 전'}
              </span>
              <span className="text-blue-600 font-extrabold group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[12.5px]">
                수주집계 보기 <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* 카드 2: 스마트발주(GFS) */}
        <div
          onClick={() => navigate('pur-gfs-smart-order')}
          className="bg-white hover:bg-slate-50 border border-emerald-200 rounded-2xl p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-extrabold text-slate-700 tracking-tight">📦 스마트발주(GFS)</span>
              <span className="px-2 py-0.5 rounded text-[11.5px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                자동연계
              </span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <PackageCheck className="w-5.5 h-5.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-[26px] font-black tracking-tight text-emerald-700 leading-none">
              BOM 소요량 자동산출
            </div>
            <div className="text-[12.5px] font-semibold text-slate-600 mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-emerald-700 font-bold">10시 수주 즉시 소요량 계산</span>
              <span className="text-emerald-700 font-extrabold group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[12.5px]">
                스마트발주 열기 <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* 카드 3: 재고 결품 / 소진 임박 자재 (실제 데이터 반영) */}
        <div
          onClick={() => navigate('inv-lookup')}
          className="bg-white hover:bg-slate-50 border border-rose-200 rounded-2xl p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-extrabold text-slate-700 tracking-tight">🚨 재고 소진 임박 자재</span>
              <span className="px-2 py-0.5 rounded text-[11.5px] font-black bg-rose-100 text-rose-700 border border-rose-300 animate-pulse">
                D-1.5 미달
              </span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <AlertTriangle className="w-5.5 h-5.5" />
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-[34px] font-black font-mono tracking-tight text-rose-600 leading-none">
              {stats.stockDaysTop.length > 0 ? (
                <>
                  {stats.stockDaysTop.length}
                  <span className="text-sm font-bold text-slate-500 ml-1.5">품목 주의</span>
                </>
              ) : (
                <span className="text-2xl sm:text-[28px] font-bold text-slate-500">0 품목 (정상)</span>
              )}
            </div>
            <div className="text-[12.5px] font-semibold text-slate-600 mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="truncate max-w-[170px] text-slate-700 font-bold">
                {stats.stockDaysTop[0]?.name || '소진 임박 자재 없음'}
              </span>
              <span className="text-rose-600 font-extrabold group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[12.5px] shrink-0">
                실사재고 조회 <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* 카드 4: 유통기한 FEFO 선출고 대상 (실제 데이터 반영) */}
        <div
          onClick={() => navigate('pur-expiry-status')}
          className="bg-white hover:bg-slate-50 border border-amber-200 rounded-2xl p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-extrabold text-slate-700 tracking-tight">⏳ 유통기한 FEFO 선출고</span>
              <span className="px-2 py-0.5 rounded text-[11.5px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                D-3 이내
              </span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <Clock className="w-5.5 h-5.5" />
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-[34px] font-black font-mono tracking-tight text-amber-700 leading-none">
              {stats.fefoTop.length > 0 ? (
                <>
                  {stats.fefoTop.length}
                  <span className="text-sm font-bold text-slate-500 ml-1.5">품목 선출고</span>
                </>
              ) : (
                <span className="text-2xl sm:text-[28px] font-bold text-slate-500">0 품목 (정상)</span>
              )}
            </div>
            <div className="text-[12.5px] font-semibold text-slate-600 mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="truncate max-w-[170px] text-slate-700 font-bold">
                {stats.fefoTop[0]?.name || 'D-3 이내 임박 없음'}
              </span>
              <span className="text-amber-700 font-extrabold group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[12.5px] shrink-0">
                유통기한 현황 <ArrowRight className="w-3.5 h-3.5" />
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
      {/* 4. 실시간 긴급 관제 보드: 결품위험/FEFO(50%) + 창고별 실보유액(50%) 1:1 반반 분할 */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
        <WatchList
          stockDays={stats.stockDaysTop}
          fefoTop={stats.fefoTop}
          onNavigate={navigate}
        />
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
