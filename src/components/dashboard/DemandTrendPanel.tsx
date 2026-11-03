'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Flame,
  AlertTriangle,
  Award,
  ChevronRight,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import { DemandTrendItem, DemandTrendStats } from './dashboardData';

interface DemandTrendPanelProps {
  trendData?: DemandTrendStats;
  onNavigate?: (menuId: string) => void;
}

/** 14일 인라인 미니 스파크라인 SVG 컴포넌트 */
const MiniSparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (!data || data.length < 2) {
    return <span className="text-gray-400 text-[10px]">-</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 90;
  const h = 24;
  const pad = 3;

  const points = data
    .map((val, idx) => {
      const x = pad + (idx / (data.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((val - min) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const lastVal = data[data.length - 1];
  const lastY = h - pad - ((lastVal - min) / range) * (h - 2 * pad);

  return (
    <svg width={w} height={h} className="overflow-visible inline-block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle
        cx={w - pad}
        cy={lastY}
        r="2.5"
        fill={color}
        className="animate-pulse"
      />
    </svg>
  );
};

export const DemandTrendPanel: React.FC<DemandTrendPanelProps> = ({
  trendData,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'surge' | 'drop' | 'volume'>('surge');

  if (!trendData || (!trendData.surge.length && !trendData.volume.length)) {
    return null;
  }

  const topSurge = trendData.surge[0];
  const topVolume = trendData.volume[0];
  const topDrop = trendData.drop[0];

  const currentList: DemandTrendItem[] =
    activeTab === 'surge'
      ? trendData.surge
      : activeTab === 'drop'
      ? trendData.drop
      : trendData.volume;

  return (
    <div className="erp-card flex flex-col bg-white border border-[var(--line)] rounded-xl shadow-xs overflow-hidden">
      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="h-[42px] px-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-indigo-500/20 rounded-md border border-indigo-400/30 text-indigo-300">
            <Activity className="w-4 h-4" />
          </div>
          <span className="font-bold text-[13px] tracking-tight">
            수주 트렌드 & 품목 모멘텀 레이더
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-300" />
            AI 모멘텀 분석
          </span>
          {trendData.baseDate && (
            <span className="hidden sm:inline-block text-[11px] text-slate-400 font-mono">
              (최근 14일 기준: ~{trendData.baseDate})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => onNavigate?.('sales-order-upload')}
            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-slate-200 rounded border border-white/15 transition flex items-center gap-1 cursor-pointer font-medium"
            title="주문등록GSR 전체 화면으로 이동"
          >
            <span>주문등록(GSR)</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('pur-gfs-smart-order')}
            className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded border border-emerald-400/30 transition flex items-center gap-1 cursor-pointer font-medium"
            title="스마트 발주 화면으로 이동"
          >
            <span>스마트 발주 연계</span>
            <ChevronRight className="w-3 h-3 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* ── 3 Hero Intelligence Cards ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 p-3 bg-slate-50 border-b border-slate-200 shrink-0">
        {/* Card 1: 급상승 1위 */}
        <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[12px]">
              <Flame className="w-4 h-4 text-emerald-500 fill-emerald-500" />
              <span>주간 급상승 1위 (모멘텀)</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              자재 안전확보
            </span>
          </div>
          {topSurge ? (
            <div className="mt-2">
              <div className="font-bold text-[13px] text-slate-900 truncate" title={topSurge.name}>
                {topSurge.name}
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[11.5px] text-slate-500">
                  일평균 <b className="text-slate-800 font-mono">{topSurge.avgDailyQty.toLocaleString()}</b>ea
                </span>
                <span className="font-black text-emerald-600 font-mono text-[13px] flex items-center">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                  +{topSurge.pct}%
                </span>
              </div>
              <div className="mt-1.5 flex justify-end">
                <MiniSparkline data={topSurge.spark14} color="#059669" />
              </div>
            </div>
          ) : (
            <div className="text-slate-400 text-[11px] mt-2">데이터 없음</div>
          )}
        </div>

        {/* Card 2: 캐시카우 1위 */}
        <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-700 font-bold text-[12px]">
              <Award className="w-4 h-4 text-blue-500 fill-blue-500" />
              <span>부동의 1위 캐시카우 (최다수주)</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
              안정 연속생산
            </span>
          </div>
          {topVolume ? (
            <div className="mt-2">
              <div className="font-bold text-[13px] text-slate-900 truncate" title={topVolume.name}>
                {topVolume.name}
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[11.5px] text-slate-500">
                  일평균 <b className="text-slate-800 font-mono">{topVolume.avgDailyQty.toLocaleString()}</b>ea
                </span>
                <span className="font-black text-blue-600 font-mono text-[13px]">
                  주간 {topVolume.sumLast7.toLocaleString()}ea
                </span>
              </div>
              <div className="mt-1.5 flex justify-end">
                <MiniSparkline data={topVolume.spark14} color="#2563eb" />
              </div>
            </div>
          ) : (
            <div className="text-slate-400 text-[11px] mt-2">데이터 없음</div>
          )}
        </div>

        {/* Card 3: 급감 주의 1위 */}
        <div className="bg-white p-3 rounded-lg border border-amber-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-rose-700 font-bold text-[12px]">
              <AlertTriangle className="w-4 h-4 text-rose-500 fill-rose-500" />
              <span>급감 주의 (불용 재고 위험)</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
              포장재 발주동결
            </span>
          </div>
          {topDrop ? (
            <div className="mt-2">
              <div className="font-bold text-[13px] text-slate-900 truncate" title={topDrop.name}>
                {topDrop.name}
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-[11.5px] text-slate-500">
                  일평균 <b className="text-slate-800 font-mono">{topDrop.avgDailyQty.toLocaleString()}</b>ea
                </span>
                <span className="font-black text-rose-600 font-mono text-[13px] flex items-center">
                  <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                  {topDrop.pct}%
                </span>
              </div>
              <div className="mt-1.5 flex justify-end">
                <MiniSparkline data={topDrop.spark14} color="#e11d48" />
              </div>
            </div>
          ) : (
            <div className="text-slate-400 text-[11px] mt-2">데이터 없음</div>
          )}
        </div>
      </div>

      {/* ── Sub Navigation & 1편/2편 Ratio Bar ─────────────────── */}
      <div className="px-3.5 py-2 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('surge')}
            className={`px-3 py-1 rounded-md font-bold text-[11.5px] transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'surge'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>급상승 TOP 5</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drop')}
            className={`px-3 py-1 rounded-md font-bold text-[11.5px] transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'drop'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>급감 주의 TOP 5</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('volume')}
            className={`px-3 py-1 rounded-md font-bold text-[11.5px] transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'volume'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>최다 판매 TOP 5</span>
          </button>
        </div>

        {/* 1편 / 2편 배분 비율 미니 인디케이터 */}
        {trendData.shiftRatio && (
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="font-semibold text-slate-500">주간 편수 배분:</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-indigo-700">1편(낮) {trendData.shiftRatio.shift1Pct}%</span>
              <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden flex">
                <div
                  className="bg-indigo-600 h-full"
                  style={{ width: `${trendData.shiftRatio.shift1Pct}%` }}
                />
                <div
                  className="bg-purple-500 h-full"
                  style={{ width: `${trendData.shiftRatio.shift2Pct}%` }}
                />
              </div>
              <span className="font-mono font-bold text-purple-700">2편(밤) {trendData.shiftRatio.shift2Pct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* ── High-Density Data Table ───────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11.5px] border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <th className="py-2 px-3 w-12 text-center">순위</th>
              <th className="py-2 px-3 w-32 font-mono">품목코드</th>
              <th className="py-2 px-3">품목명</th>
              <th className="py-2 px-3 w-28 text-right">최근 7일 합계</th>
              <th className="py-2 px-3 w-24 text-right">일평균 수주</th>
              <th className="py-2 px-3 w-24 text-right">전주대비 증감</th>
              <th className="py-2 px-3 w-28 text-center">14일 트렌드 곡선</th>
              <th className="py-2 px-3 w-28 text-center">AI 권고 진단</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentList.map((item, idx) => {
              const isPositive = item.pct > 0;
              const isNegative = item.pct < 0;
              const lineColor =
                activeTab === 'surge'
                  ? '#059669'
                  : activeTab === 'drop'
                  ? '#e11d48'
                  : '#2563eb';

              return (
                <tr
                  key={item.code}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="py-2 px-3 text-center font-bold text-slate-500">
                    {idx + 1}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                    {item.code}
                  </td>
                  <td className="py-2 px-3 font-medium text-slate-900 max-w-[240px] truncate" title={item.name}>
                    {item.name}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-700 font-semibold">
                    {item.sumLast7.toLocaleString()}ea
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600">
                    {item.avgDailyQty.toLocaleString()}ea
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] ${
                        isPositive
                          ? 'bg-emerald-50 text-emerald-700'
                          : isNegative
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {item.pct}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <MiniSparkline data={item.spark14} color={lineColor} />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.recommendation === '자재 안전확보'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : item.recommendation === '포장재 발주동결'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : item.recommendation === '안정 연속생산'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.recommendation}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
