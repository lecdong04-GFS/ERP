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
  Warehouse,
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
        'gfs-smart-order': 'pur-mat-order-day',
        'smart-order': 'pur-mat-order-day',
        'pur-gfs-smart-order': 'pur-mat-order-day',
        'fefo': 'pur-expiry-status',
        'expiry': 'pur-expiry-status',
        'stock': 'inv-lookup',
        'receiving': 'pur-receiving-status-edit',
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

  // 실제 금일 자재 입고 현황 (실제 DB 등록 입고 기준)
  const receivingTotal = k.todayReceivingTotal || 0;
  const receivingDone = k.todayReceivingDone || 0;
  const receivingAmount = k.todayReceivingAmount || 0;
  const receivingPending = k.todayReceivingPending || 0;

  // 실제 금일 자재 예상발주 (실제 DB 등록 발주 및 소요 기준)
  const actualPoItemCount = k.todayPurchaseItemCount || 0;
  const actualPoAmount = k.todayPurchaseAmount || 0;
  const actualPoPartnerCount = k.todayPurchasePartnerCount || 0;
  const expectedPoItemCount = k.expectedPurchaseItemCount || 0;
  const expectedPoAmount = k.expectedPurchaseAmount || 0;
  const expectedPoPartnerCount = k.expectedPurchasePartnerCount || 0;
  const expectedStockDate = k.expectedPurchaseStockDate || '';
  const stockBasisLabel = expectedStockDate
    ? `전일(${expectedStockDate.slice(5).replace('-', '/')}) 17시 재고`
    : '전일 17시 재고';

  // 실제 전 창고 실시간 재고 현황
  const warehouseTotal = stats.warehouseStockTotal || 0;
  const totalInvCount = k.totalInventoryItems || stats.warehouseStock.reduce((s, w) => s + w.items, 0);
  const safetyShortage = k.safetyShortageCount || 0;

  return (
    <div className="flex flex-col w-full h-full bg-[#f1f5f9] overflow-y-auto p-3 sm:p-4 gap-3">
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
      {/* 2. 4대 실물 핵심 액션 카드 (초슬림 1화면 뷰: 수주 · 입고 · 예상발주 · 재고) */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
        {/* 카드 1: [수주] 금일 GS25 완제품 수주 */}
        <div
          onClick={() => navigate('sales-order-summary-gsr')}
          className="bg-white hover:bg-slate-50/90 border border-blue-200/90 rounded-xl px-3.5 py-2.5 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between gap-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-extrabold text-slate-800 flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />
              </span>
              금일 수주 현황
            </span>
            <span className="text-[11px] font-extrabold text-blue-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 shrink-0">
              수주집계 <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[20px] sm:text-[22px] font-black font-mono tracking-tight leading-none truncate">
              {actualSalesAmount > 0 ? (
                <>
                  <span className="text-sm font-bold text-blue-600 mr-0.5">₩</span>
                  <span className="text-blue-950">{Math.round(actualSalesAmount).toLocaleString()}</span>
                </>
              ) : (
                <span className="text-lg font-black font-mono text-slate-400">₩0</span>
              )}
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-[11.5px] font-black font-mono text-blue-800 shrink-0">
              {actualOrderQty > 0 ? `${actualOrderQty.toLocaleString()} ea` : '등록 대기'}
            </span>
          </div>

          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>수주총액 · 완제품 생산 연동</span>
            <span className="text-blue-700 font-bold">GS25 일일수주</span>
          </div>
        </div>

        {/* 카드 2: [입고현황] 금일 자재 입고현황 */}
        <div
          onClick={() => navigate('pur-receiving-status-edit')}
          className="bg-white hover:bg-slate-50/90 border border-emerald-200/90 rounded-xl px-3.5 py-2.5 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between gap-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-extrabold text-slate-800 flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                <PackageCheck className="w-3.5 h-3.5" />
              </span>
              금일 입고 현황
            </span>
            <span className="text-[11px] font-extrabold text-emerald-700 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 shrink-0">
              입고현황 <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[20px] sm:text-[22px] font-black font-mono tracking-tight leading-none truncate">
              {receivingAmount > 0 ? (
                <>
                  <span className="text-sm font-bold text-emerald-600 mr-0.5">₩</span>
                  <span className="text-emerald-950">{Math.round(receivingAmount).toLocaleString()}</span>
                </>
              ) : receivingTotal > 0 ? (
                <span className="text-lg font-black font-mono text-emerald-800">
                  {receivingDone}/{receivingTotal}건 완료
                </span>
              ) : (
                <span className="text-lg font-black font-mono text-slate-400">₩0</span>
              )}
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11.5px] font-black font-mono text-emerald-800 shrink-0">
              {receivingTotal > 0
                ? `완료 ${receivingDone}${receivingPending > 0 ? ` · 대기 ${receivingPending}` : '건'}`
                : '검수 대기'}
            </span>
          </div>

          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>입고총액(검수) · 실시간 입고</span>
            <span className="text-emerald-700 font-bold">협력사 납품</span>
          </div>
        </div>

        {/* 카드 3: [예상발주량] 전일 17시 실사재고 기준 금일 발주 판단/확정 현황 */}
        <div
          onClick={() => navigate('pur-mat-order-day')}
          className="bg-white hover:bg-slate-50/90 border border-amber-200/90 rounded-xl px-3.5 py-2.5 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between gap-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-extrabold text-slate-800 flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                <ShoppingCart className="w-3.5 h-3.5" />
              </span>
              금일 예상 발주량
            </span>
            <span className="text-[11px] font-extrabold text-amber-700 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 shrink-0">
              자재발주 <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[20px] sm:text-[22px] font-black font-mono tracking-tight leading-none truncate">
              {actualPoAmount > 0 ? (
                <>
                  <span className="text-sm font-bold text-emerald-600 mr-0.5">₩</span>
                  <span className="text-emerald-950">{Math.round(actualPoAmount).toLocaleString()}</span>
                </>
              ) : expectedPoAmount > 0 ? (
                <>
                  <span className="text-sm font-bold text-amber-600 mr-0.5">₩</span>
                  <span className="text-amber-950">{Math.round(expectedPoAmount).toLocaleString()}</span>
                </>
              ) : (
                <span className="text-lg font-black font-mono text-slate-400">₩0</span>
              )}
            </div>
            <span
              className={`px-2 py-0.5 rounded-lg border text-[11.5px] font-black font-mono shrink-0 ${
                actualPoAmount > 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {actualPoAmount > 0
                ? `확정 ${actualPoItemCount}품목`
                : expectedPoItemCount > 0
                ? `${expectedPoItemCount}품목(${expectedPoPartnerCount}사)`
                : '발주 불필요'}
            </span>
          </div>

          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between gap-1 pt-1 border-t border-slate-100 truncate">
            <span className="truncate">
              {actualPoAmount > 0
                ? `${stockBasisLabel} 확정완료`
                : `${stockBasisLabel} 기준`}
            </span>
            {actualPoAmount > 0 && expectedPoAmount > 0 ? (
              <span className="text-amber-700 font-bold shrink-0">잔여 ₩{Math.round(expectedPoAmount).toLocaleString()}</span>
            ) : (
              <span className="text-amber-700 font-bold shrink-0">요일별 자동배분</span>
            )}
          </div>
        </div>

        {/* 카드 4: [재고현황] 전 창고 실시간 재고현황 + 창고별 요약 */}
        <div
          onClick={() => navigate('inv-lookup')}
          className="bg-white hover:bg-slate-50/90 border border-indigo-200/90 rounded-xl px-3.5 py-2.5 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group flex flex-col justify-between gap-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-extrabold text-slate-800 flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0">
                <Warehouse className="w-3.5 h-3.5" />
              </span>
              실시간 재고 현황
            </span>
            <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 shrink-0">
              실사재고 <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[20px] sm:text-[22px] font-black font-mono tracking-tight leading-none truncate">
              {warehouseTotal > 0 ? (
                <>
                  <span className="text-sm font-bold text-indigo-600 mr-0.5">₩</span>
                  <span className="text-indigo-950">{Math.round(warehouseTotal).toLocaleString()}</span>
                </>
              ) : (
                <span className="text-lg font-black font-mono text-slate-400">₩0</span>
              )}
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-[11.5px] font-black font-mono text-indigo-800 shrink-0">
              {totalInvCount > 0 ? `${totalInvCount.toLocaleString()}개` : '정상'}
              {safetyShortage > 0 && (
                <span className="text-rose-600 ml-1">· 주의{safetyShortage}</span>
              )}
            </span>
          </div>

          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>총 보관재고액 · 실사 연동</span>
            <span className="text-indigo-700 font-bold">전 창고 합계</span>
          </div>
        </div>
      </div>

      {/* 2-1. 창고별 실시간 재고액 스트립 (냉장1 · 냉장2 · 냉동 · 상온 · 부자재 시원한 5열 뷰) */}
      {stats.warehouseStock.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 shrink-0">
          {stats.warehouseStock.slice(0, 5).map((w) => {
            const whName = w.warehouse || '기타';
            const theme = whName.includes('냉장1')
              ? { border: 'border-sky-200', badge: 'bg-sky-50 text-sky-800 border-sky-200', bar: 'bg-sky-500', dot: 'bg-sky-500' }
              : whName.includes('냉장2')
              ? { border: 'border-blue-200', badge: 'bg-blue-50 text-blue-800 border-blue-200', bar: 'bg-blue-600', dot: 'bg-blue-600' }
              : whName.includes('냉동')
              ? { border: 'border-cyan-200', badge: 'bg-cyan-50 text-cyan-800 border-cyan-200', bar: 'bg-cyan-500', dot: 'bg-cyan-500' }
              : whName.includes('상온')
              ? { border: 'border-amber-200', badge: 'bg-amber-50 text-amber-800 border-amber-200', bar: 'bg-amber-500', dot: 'bg-amber-500' }
              : whName.includes('부자재')
              ? { border: 'border-purple-200', badge: 'bg-purple-50 text-purple-800 border-purple-200', bar: 'bg-purple-500', dot: 'bg-purple-500' }
              : { border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700 border-slate-200', bar: 'bg-slate-500', dot: 'bg-slate-400' };
            const amt = Math.round(w.amount || 0);
            const pct = warehouseTotal > 0 ? Math.min(100, Math.round((amt / warehouseTotal) * 100)) : 0;
            return (
              <div
                key={whName}
                onClick={() => navigate('inv-lookup')}
                className={`bg-white hover:bg-slate-50/90 border ${theme.border} rounded-xl px-3.5 py-2.5 shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-sm cursor-pointer flex flex-col justify-between gap-1.5`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5 text-[13px] font-black text-slate-800">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${theme.dot}`} />
                    {whName}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-md border text-[11px] font-bold font-mono ${theme.badge}`}>
                    {w.items.toLocaleString()}종 · {pct}%
                  </span>
                </div>
                <div className="text-[17px] sm:text-[18px] font-black font-mono tracking-tight text-slate-950 leading-none truncate">
                  <span className="text-[13px] font-bold text-slate-500 mr-0.5">₩</span>
                  {amt.toLocaleString()}
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${theme.bar}`} style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

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
