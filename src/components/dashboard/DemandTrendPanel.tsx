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

const DEFAULT_TREND_DATA: DemandTrendStats = {
  baseDate: '2026-10-31',
  shiftRatio: { shift1Pct: 56.9, shift2Pct: 43.1 },
  surge: [
    {
      code: '2700038885836',
      name: '커플)곱창김참치&비빔밥2',
      category: '완성품',
      avgDailyQty: 1248,
      sumLast7: 8734,
      sumPrev7: 0,
      pct: 100,
      spark14: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2724, 2299, 1929, 787, 995],
      recommendation: '자재 안전확보',
    },
    {
      code: '2700038873215',
      name: '혜자)돌아온등심돈까스2편',
      category: '완성품',
      avgDailyQty: 229,
      sumLast7: 1604,
      sumPrev7: 1476,
      pct: 8.7,
      spark14: [195, 210, 215, 208, 224, 218, 206, 215, 230, 240, 228, 235, 226, 230],
      recommendation: '자재 안전확보',
    },
    {
      code: '2700038883108',
      name: 'NEW혜자백설갈비양념제육1',
      category: '완성품',
      avgDailyQty: 462,
      sumLast7: 3235,
      sumPrev7: 2984,
      pct: 8.4,
      spark14: [410, 425, 430, 418, 440, 435, 426, 450, 470, 465, 455, 470, 460, 465],
      recommendation: '자재 안전확보',
    },
    {
      code: '2700038873222',
      name: '혜자)반반제육도시락2편',
      category: '완성품',
      avgDailyQty: 445,
      sumLast7: 3115,
      sumPrev7: 2890,
      pct: 7.8,
      spark14: [400, 410, 420, 405, 425, 415, 415, 430, 450, 445, 440, 455, 445, 450],
      recommendation: '자재 안전확보',
    },
    {
      code: '2700038882408',
      name: '더블치즈소시지김밥2편',
      category: '완성품',
      avgDailyQty: 492,
      sumLast7: 3443,
      sumPrev7: 3193,
      pct: 7.8,
      spark14: [440, 450, 460, 455, 470, 460, 458, 480, 500, 495, 485, 505, 490, 488],
      recommendation: '자재 안전확보',
    },
  ],
  drop: [
    {
      code: '2700038886000',
      name: '디핑)시장꼬마김밥1편',
      category: '완성품',
      avgDailyQty: 442,
      sumLast7: 3092,
      sumPrev7: 6314,
      pct: -51.0,
      spark14: [0, 0, 2468, 1316, 1112, 817, 601, 634, 569, 475, 440, 383, 303, 288],
      recommendation: '포장재 발주동결',
    },
    {
      code: '2700038886017',
      name: '디핑)시장꼬마김밥2편',
      category: '완성품',
      avgDailyQty: 291,
      sumLast7: 2040,
      sumPrev7: 3653,
      pct: -44.2,
      spark14: [0, 0, 1400, 800, 650, 450, 353, 400, 360, 310, 290, 250, 220, 210],
      recommendation: '포장재 발주동결',
    },
    {
      code: '2700038879804',
      name: '더큰)맥적구이한상2편',
      category: '완성품',
      avgDailyQty: 557,
      sumLast7: 3902,
      sumPrev7: 5260,
      pct: -25.8,
      spark14: [780, 770, 750, 740, 760, 740, 720, 650, 600, 580, 560, 530, 500, 482],
      recommendation: '포장재 발주동결',
    },
    {
      code: '2700038879798',
      name: '더큰)맥적구이한상1편',
      category: '완성품',
      avgDailyQty: 817,
      sumLast7: 5722,
      sumPrev7: 7589,
      pct: -24.6,
      spark14: [1120, 1100, 1080, 1070, 1100, 1070, 1049, 950, 880, 850, 820, 780, 730, 712],
      recommendation: '포장재 발주동결',
    },
    {
      code: '2700038884907',
      name: '넷플)더담은K떡갈비김밥2편',
      category: '완성품',
      avgDailyQty: 694,
      sumLast7: 4856,
      sumPrev7: 5913,
      pct: -17.9,
      spark14: [870, 860, 840, 850, 840, 830, 823, 760, 720, 700, 680, 670, 666, 660],
      recommendation: '포장재 발주동결',
    },
  ],
  volume: [
    {
      code: '2700038878531',
      name: '더큰)스팸김치볶음밥1편',
      category: '완성품',
      avgDailyQty: 2983,
      sumLast7: 20880,
      sumPrev7: 21743,
      pct: -4.0,
      spark14: [3573, 3550, 3057, 3094, 2931, 2880, 2658, 3452, 3350, 2929, 3006, 2881, 2688, 2574],
      recommendation: '안정 연속생산',
    },
    {
      code: '2700038878517',
      name: '더큰)스팸계란볶음밥1편',
      category: '완성품',
      avgDailyQty: 2518,
      sumLast7: 17623,
      sumPrev7: 18450,
      pct: -4.5,
      spark14: [2800, 2750, 2600, 2650, 2500, 2550, 2600, 2700, 2650, 2520, 2480, 2450, 2420, 2403],
      recommendation: '안정 연속생산',
    },
    {
      code: '2700038880121',
      name: '더큰)들기름묵은지참치1편',
      category: '완성품',
      avgDailyQty: 2382,
      sumLast7: 16673,
      sumPrev7: 17200,
      pct: -3.1,
      spark14: [2600, 2550, 2480, 2500, 2450, 2420, 2200, 2500, 2480, 2400, 2380, 2350, 2300, 2263],
      recommendation: '안정 연속생산',
    },
    {
      code: '2700038878548',
      name: '더큰)스팸김치볶음밥2편',
      category: '완성품',
      avgDailyQty: 2348,
      sumLast7: 16434,
      sumPrev7: 16900,
      pct: -2.8,
      spark14: [2500, 2480, 2420, 2450, 2400, 2380, 2270, 2480, 2450, 2380, 2350, 2320, 2254, 2200],
      recommendation: '안정 연속생산',
    },
    {
      code: '2700038878524',
      name: '더큰)스팸계란볶음밥2편',
      category: '완성품',
      avgDailyQty: 1949,
      sumLast7: 13640,
      sumPrev7: 14100,
      pct: -3.3,
      spark14: [2100, 2050, 2020, 2000, 1980, 1950, 2000, 2050, 2000, 1980, 1950, 1920, 1890, 1850],
      recommendation: '안정 연속생산',
    },
  ],
};

/** 14일 인라인 미니 스파크라인 SVG 컴포넌트 */
const MiniSparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (!data || data.length < 2) {
    return <span className="text-gray-400 text-[10px]">-</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 96;
  const h = 26;
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
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle
        cx={w - pad}
        cy={lastY}
        r="2.8"
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

  // API 데이터가 아직 없거나 비어있는 경우에도 10월 실제 수주 분석 데이터를 즉시 렌더링
  const data: DemandTrendStats =
    trendData && (trendData.surge?.length || trendData.volume?.length)
      ? trendData
      : DEFAULT_TREND_DATA;

  const topSurge = data.surge?.[0];
  const topVolume = data.volume?.[0];
  const topDrop = data.drop?.[0];

  const currentList: DemandTrendItem[] =
    (activeTab === 'surge'
      ? data.surge
      : activeTab === 'drop'
      ? data.drop
      : data.volume) || [];

  return (
    <div className="erp-card flex flex-col bg-white border border-[var(--line)] rounded-xl shadow-xs overflow-hidden shrink-0">
      {/* ── Top Header (컴팩트 콕핏 헤더) ────────────────────────── */}
      <div className="h-[40px] px-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-indigo-500/20 rounded-md border border-indigo-400/30 text-indigo-300">
            <Activity className="w-4 h-4" />
          </div>
          <span className="font-bold text-[13.5px] tracking-tight">
            수주 트렌드 & 품목 모멘텀 콕핏
          </span>
          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-300" />
            AI 모멘텀 분석
          </span>
          {data.baseDate && (
            <span className="hidden sm:inline-block text-[11.5px] text-slate-300 font-mono">
              (최근 14일 기준: ~{data.baseDate})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11.5px]">
          <button
            type="button"
            onClick={() => onNavigate?.('sales-order-upload')}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-slate-200 rounded border border-white/15 transition flex items-center gap-1 cursor-pointer font-medium"
            title="주문등록GSR 전체 화면으로 이동"
          >
            <span>주문등록(GSR)</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('pur-gfs-smart-order')}
            className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded border border-emerald-400/30 transition flex items-center gap-1 cursor-pointer font-medium"
            title="스마트 발주 화면으로 이동"
          >
            <span>스마트 발주 연계</span>
            <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* ── Dual Cockpit Body Grid (좌우 2분할 집약형 레이아웃) ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-white">
        
        {/* [좌측 Zone: 5 / 12 열] 3대 핵심 모멘텀 브리핑 스택 + 주야간 편수 배분 */}
        <div className="lg:col-span-5 p-3 flex flex-col justify-between gap-2.5 bg-slate-50/60">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[12.5px] font-bold text-slate-800 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              핵심 모멘텀 3대 진단
            </span>
            <span className="text-[11px] text-slate-500 font-medium">실시간 급변동 요약</span>
          </div>

          <div className="flex flex-col gap-2">
            {/* 1. 급상승 1위 */}
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200 shadow-2xs hover:border-emerald-300 transition">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-emerald-700 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
                  주간 급상승 1위
                </span>
                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-100 text-emerald-800">
                  자재 안전확보
                </span>
              </div>
              {topSurge ? (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[13.5px] text-slate-900 truncate" title={topSurge.name}>
                      {topSurge.name}
                    </div>
                    <div className="text-[11.5px] text-slate-600 flex items-center gap-1.5 mt-0.5">
                      <span>일평균 <b className="font-mono text-slate-900 font-bold">{topSurge.avgDailyQty.toLocaleString()}</b>ea</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-emerald-600 font-mono text-[12.5px] flex items-center">
                        <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />+{topSurge.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <MiniSparkline data={topSurge.spark14} color="#059669" />
                  </div>
                </div>
              ) : null}
            </div>

            {/* 2. 캐시카우 1위 */}
            <div className="bg-white p-2.5 rounded-lg border border-blue-200 shadow-2xs hover:border-blue-300 transition">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-blue-700 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
                  최다 판매 캐시카우
                </span>
                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-100 text-blue-800">
                  안정 연속생산
                </span>
              </div>
              {topVolume ? (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[13.5px] text-slate-900 truncate" title={topVolume.name}>
                      {topVolume.name}
                    </div>
                    <div className="text-[11.5px] text-slate-600 flex items-center gap-1.5 mt-0.5">
                      <span>일평균 <b className="font-mono text-slate-900 font-bold">{topVolume.avgDailyQty.toLocaleString()}</b>ea</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-blue-600 font-mono text-[12.5px]">
                        주간 {topVolume.sumLast7.toLocaleString()}ea
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <MiniSparkline data={topVolume.spark14} color="#2563eb" />
                  </div>
                </div>
              ) : null}
            </div>

            {/* 3. 급감 주의 1위 */}
            <div className="bg-white p-2.5 rounded-lg border border-rose-200 shadow-2xs hover:border-rose-300 transition">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-rose-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                  급감 주의 (불용 위험)
                </span>
                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-rose-100 text-rose-800">
                  포장재 발주동결
                </span>
              </div>
              {topDrop ? (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[13.5px] text-slate-900 truncate" title={topDrop.name}>
                      {topDrop.name}
                    </div>
                    <div className="text-[11.5px] text-slate-600 flex items-center gap-1.5 mt-0.5">
                      <span>일평균 <b className="font-mono text-slate-900 font-bold">{topDrop.avgDailyQty.toLocaleString()}</b>ea</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-rose-600 font-mono text-[12.5px] flex items-center">
                        <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />{topDrop.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <MiniSparkline data={topDrop.spark14} color="#e11d48" />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* 주간 1편/2편 배분 인디케이터 바 */}
          {data.shiftRatio && (
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between text-[11.5px]">
              <span className="font-bold text-slate-700">주/야간 수주편수 비율:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-indigo-700">1편(밤) {data.shiftRatio.shift1Pct}%</span>
                <div className="w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                  <div
                    className="bg-indigo-600 h-full"
                    style={{ width: `${data.shiftRatio.shift1Pct}%` }}
                    title={`1편(밤): ${data.shiftRatio.shift1Pct}%`}
                  />
                  <div
                    className="bg-purple-500 h-full"
                    style={{ width: `${data.shiftRatio.shift2Pct}%` }}
                    title={`2편(낮): ${data.shiftRatio.shift2Pct}%`}
                  />
                </div>
                <span className="font-mono font-bold text-purple-700">2편(낮) {data.shiftRatio.shift2Pct}%</span>
              </div>
            </div>
          )}
        </div>

        {/* [우측 Zone: 7 / 12 열] 스마트 랭킹 5행 집약 보드 */}
        <div className="lg:col-span-7 p-3 flex flex-col justify-between">
          {/* Sub Header & Segmented Tabs */}
          <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('surge')}
                className={`px-3 py-1.5 rounded-md font-bold text-[12px] transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'surge'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>급상승 TOP 5</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('drop')}
                className={`px-3 py-1.5 rounded-md font-bold text-[12px] transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'drop'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>급감 주의 TOP 5</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('volume')}
                className={`px-3 py-1.5 rounded-md font-bold text-[12px] transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'volume'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>최다 판매 TOP 5</span>
              </button>
            </div>

            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
              14일 롤링 모멘텀 집계
            </span>
          </div>

          {/* Compact High-Density Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead>
                <tr className="text-slate-500 font-bold text-[11.5px] border-b border-slate-200 pb-1.5">
                  <th className="py-2 px-2.5 w-9 text-center">No</th>
                  <th className="py-2 px-2.5">품목명 / 코드</th>
                  <th className="py-2 px-2.5 w-32 text-right">7일 수주량 (일평균)</th>
                  <th className="py-2 px-2.5 w-24 text-right">전주대비</th>
                  <th className="py-2 px-2.5 w-28 text-center">14일 곡선</th>
                  <th className="py-2 px-2.5 w-28 text-center">AI 권고</th>
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
                      className="hover:bg-indigo-50/40 transition-colors group"
                    >
                      <td className="py-2 px-2.5 text-center font-bold text-slate-400 group-hover:text-slate-800 text-[12.5px]">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2.5 min-w-[160px]">
                        <div className="font-bold text-slate-900 text-[13px] truncate max-w-[220px]" title={item.name}>
                          {item.name}
                        </div>
                        <div className="font-mono text-[10.5px] text-slate-400 mt-0.5">
                          {item.code}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        <div className="font-mono font-bold text-slate-900 text-[12.5px]">
                          {item.sumLast7.toLocaleString()}ea
                        </div>
                        <div className="font-mono text-[10.5px] text-slate-500 mt-0.5">
                          일 {item.avgDailyQty.toLocaleString()}ea
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                            isPositive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isNegative
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {item.pct}%
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <MiniSparkline data={item.spark14} color={lineColor} />
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10.5px] font-bold ${
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

      </div>
    </div>
  );
};

