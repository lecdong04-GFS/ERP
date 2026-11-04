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
  ShoppingCart,
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

  // 실제 수주량 및 금액 (실제 DB 등록 수주 기준)
  const actualOrderQty = k.todayOrderQty || 0;
  const actualSalesAmount = k.todaySalesAmount || 0;
  // 실제 금일 자재 예상발주 (실제 DB 등록 발주 및 소요 기준)
  const actualPoItemCount = k.todayPurchaseItemCount || 0;
  const actualPoAmount = k.todayPurchaseAmount || 0;
  const actualPoPartnerCount = k.todayPurchasePartnerCount || 0;

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
      {/* 2. 4대 실물 핵심 액션 카드 (수주총액·수주수량·발주예정액 최우선 시인성) */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
        {/* 카드 1: 금일 GS25 완제품 수주 (수주총액 & 수주수량 동시 강조) */}
        <div
          onClick={() => navigate('sales-order-summary-gsr')}
          className="bg-white hover:bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[14px] font-extrabold text-slate-700 tracking-tight flex items-center gap-1.5">
              <span>🍱</span> 금일 GS25 완제품 수주
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div>
            <div className="text-[11.5px] font-extrabold text-blue-700 uppercase tracking-wide flex items-center gap-1 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" />
              수주총액
            </div>

            <div className="text-[26px] sm:text-[30px] xl:text-[27px] 2xl:text-[32px] font-black font-mono tracking-tight text-slate-900 leading-none truncate my-1">
              {actualSalesAmount > 0 ? (
                <>
                  <span className="text-xl sm:text-2xl font-bold text-blue-600 mr-1">₩</span>
                  <span className="text-blue-950">{Math.round(actualSalesAmount).toLocaleString()}</span>
                </>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-[28px] font-black font-mono text-slate-400">₩0</span>
                  <span className="text-[12px] font-bold text-slate-400">(수주 등록 대기)</span>
                </div>
              )}
            </div>

            {/* 수주받은 수량 (요청 반영: 대형 22px 폰트로 크게 강조) */}
            <div className="mt-2.5 px-3 py-2 rounded-xl bg-blue-50/80 border border-blue-100 flex items-center justify-between">
              <span className="text-[12px] font-extrabold text-blue-900">수주수량</span>
              {actualOrderQty > 0 ? (
                <span className="text-[20px] sm:text-[22px] font-black font-mono tracking-tight text-blue-700 leading-none">
                  {actualOrderQty.toLocaleString()}
                  <span className="text-[13px] font-extrabold text-blue-900 ml-1">ea</span>
                </span>
              ) : (
                <span className="text-[12.5px] font-bold text-slate-400">0 ea (등록 대기)</span>
              )}
            </div>

            <div className="text-[12px] font-semibold text-slate-600 mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-500 font-medium truncate">완제품 생산 연동</span>
              <span className="text-blue-600 font-extrabold group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[12px] shrink-0">
                수주집계 보기 <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* 카드 2: 금일 자재 예상발주 (발주예정액 & 품목수 동시 강조) */}
        <div
          onClick={() => navigate('pur-mat-order-day')}
          className="bg-white hover:bg-slate-50/90 border border-amber-200/90 rounded-2xl p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[14px] font-extrabold text-slate-700 tracking-tight flex items-center gap-1.5">
              <span>🛒</span> 금일 자재 예상발주
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>

          <div>
            <div className="text-[11.5px] font-extrabold text-amber-800 uppercase tracking-wide flex items-center gap-1 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 inline-block" />
              발주예정액
            </div>

            <div className="text-[26px] sm:text-[30px] xl:text-[27px] 2xl:text-[32px] font-black font-mono tracking-tight text-slate-900 leading-none truncate my-1">
              {actualPoAmount > 0 ? (
                <>
                  <span className="text-xl sm:text-2xl font-bold text-amber-600 mr-1">₩</span>
                  <span className="text-amber-950">{Math.round(actualPoAmount).toLocaleString()}</span>
                </>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-[28px] font-black font-mono text-slate-400">₩0</span>
                  <span className="text-[12px] font-bold text-slate-400">(5시 산출)</span>
                </div>
              )}
            </div>

            {/* 발주 품목 및 협력사 수 */}
            <div className="mt-2.5 px-3 py-2 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between">
              <span className="text-[12px] font-extrabold text-amber-900">발주대상</span>
              {actualPoItemCount > 0 ? (
                <span className="text-[20px] sm:text-[22px] font-black font-mono tracking-tight text-amber-800 leading-none">
                  {actualPoItemCount.toLocaleString()}
                  <span className="text-[13px] font-extrabold text-amber-900 ml-1">품목</span>
                  {actualPoPartnerCount > 0 && (
                    <span className="text-[11.5px] font-bold text-amber-700 ml-1">({actualPoPartnerCount}개사)</span>
                  )}
                </span>
              ) : (
                <span className="text-[12.5px] font-bold text-slate-400">오후 5시 자동산출</span>
              )}
            </div>

            <div className="text-[12px] font-semibold text-slate-600 mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-500 font-medium truncate">오후 5시 재고실사 후 확정</span>
              <span className="text-amber-700 font-extrabold group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[12px] shrink-0">
                자재발주(요일별) <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* 카드 3: 재고 결품 / 소진 임박 자재 (실제 데이터 반영) */}
        <div
          onClick={() => navigate('inv-lookup')}
          className="bg-white hover:bg-slate-50/90 border border-rose-200/90 rounded-2xl p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[14px] font-extrabold text-slate-700 tracking-tight flex items-center gap-1.5">
              <span>🚨</span> 재고 소진 임박 자재
            </span>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11.5px] font-extrabold text-rose-700 uppercase tracking-wide flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping inline-block" />
                결품 위험
              </span>
              <span className="text-[11px] font-black text-rose-600 bg-rose-100/80 px-1.5 py-0.5 rounded">
                D-1.5 미달
              </span>
            </div>

            <div className="text-[26px] sm:text-[30px] xl:text-[27px] 2xl:text-[32px] font-black font-mono tracking-tight text-rose-600 leading-none truncate my-1">
              {stats.stockDaysTop.length > 0 ? (
                <>
                  {stats.stockDaysTop.length}
                  <span className="text-base sm:text-lg font-extrabold text-slate-500 ml-1.5">품목 주의</span>
                </>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-[28px] font-black font-mono text-slate-400">0</span>
                  <span className="text-[12px] font-bold text-slate-400">품목 (정상)</span>
                </div>
              )}
            </div>

            {/* 주의 자재 안내 박스 */}
            <div className="mt-2.5 px-3 py-2 rounded-xl bg-rose-50/80 border border-rose-200 flex items-center justify-between">
              <span className="text-[12px] font-extrabold text-rose-900">임박자재</span>
              <span className="text-[13px] font-extrabold text-rose-700 truncate max-w-[150px]">
                {stats.stockDaysTop[0]?.name || '결품 위험 없음'}
              </span>
            </div>

            <div className="text-[12px] font-semibold text-slate-600 mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-500 font-medium truncate">실시간 재고 실사 연동</span>
              <span className="text-rose-600 font-extrabold group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[12px] shrink-0">
                실사재고 조회 <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* 카드 4: 유통기한 FEFO 선출고 대상 (실제 데이터 반영) */}
        <div
          onClick={() => navigate('pur-expiry-status')}
          className="bg-white hover:bg-slate-50/90 border border-amber-200/90 rounded-2xl p-4.5 sm:p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[14px] font-extrabold text-slate-700 tracking-tight flex items-center gap-1.5">
              <span>⏳</span> 유통기한 FEFO 선출고
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11.5px] font-extrabold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 inline-block" />
                선출고 관리
              </span>
              <span className="text-[11px] font-black text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                D-3 이내
              </span>
            </div>

            <div className="text-[26px] sm:text-[30px] xl:text-[27px] 2xl:text-[32px] font-black font-mono tracking-tight text-amber-800 leading-none truncate my-1">
              {stats.fefoTop.length > 0 ? (
                <>
                  {stats.fefoTop.length}
                  <span className="text-base sm:text-lg font-extrabold text-slate-500 ml-1.5">품목 대상</span>
                </>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-[28px] font-black font-mono text-slate-400">0</span>
                  <span className="text-[12px] font-bold text-slate-400">품목 (정상)</span>
                </div>
              )}
            </div>

            {/* 선출고 자재 안내 박스 */}
            <div className="mt-2.5 px-3 py-2 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between">
              <span className="text-[12px] font-extrabold text-amber-900">임박자재</span>
              <span className="text-[13px] font-extrabold text-amber-800 truncate max-w-[150px]">
                {stats.fefoTop[0]?.name || '선출고 대상 없음'}
              </span>
            </div>

            <div className="text-[12px] font-semibold text-slate-600 mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-500 font-medium truncate">유통기한 FEFO 기준</span>
              <span className="text-amber-700 font-extrabold group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[12px] shrink-0">
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
