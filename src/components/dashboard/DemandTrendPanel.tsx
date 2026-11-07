'use client';

import React, { useState, useMemo } from 'react';
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
  Maximize2,
  X,
  Info,
  Calendar,
  BarChart3,
  Table as TableIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';
import { DemandTrendItem, DemandTrendStats } from './dashboardData';

// React 19 + Recharts defaultProps 경고 억제 (중복 래핑 방지)
if (typeof window !== 'undefined' && !(console.error as any).__rechartsPatched) {
  const origError = console.error;
  const patched = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('defaultProps') || args[0].includes('Support for defaultProps'))
    ) {
      return;
    }
    origError(...args);
  };
  (patched as any).__rechartsPatched = true;
  console.error = patched;
}

interface DemandTrendPanelProps {
  trendData?: DemandTrendStats;
  onNavigate?: (menuId: string) => void;
}

const DEFAULT_TREND_DATA: DemandTrendStats = {
  baseDate: '2026-10-31',
  shiftRatio: { shift1Pct: 56.9, shift2Pct: 43.1 },
  dates14: [
    '2026-10-18',
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
    '2026-10-25',
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
  ],
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

/** 14일 날짜 라벨 목록 생성 헬퍼 */
function getFormatted14Dates(
  baseDateStr: string,
  dates14?: string[],
  dataCount: number = 14
): { fullDate: string; shortLabel: string; dayOfWeek: string; dateNum: number }[] {
  const days = ['일', '월', '화', '수', '목', '금', '토'];

  if (dates14 && dates14.length >= 2) {
    return dates14.map((dStr, idx) => {
      const d = new Date(dStr);
      const isInvalid = isNaN(d.getTime());
      if (isInvalid) {
        return {
          fullDate: dStr,
          shortLabel: dStr.slice(5) || `D-${dataCount - 1 - idx}`,
          dayOfWeek: '',
          dateNum: idx + 1,
        };
      }
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const dow = days[d.getDay()];
      return {
        fullDate: dStr,
        shortLabel: `${m}/${day}`,
        dayOfWeek: `(${dow})`,
        dateNum: day,
      };
    });
  }

  const base = new Date(baseDateStr || '2026-11-04');
  const validBase = isNaN(base.getTime()) ? new Date('2026-11-04') : base;
  const result = [];
  for (let i = dataCount - 1; i >= 0; i--) {
    const d = new Date(validBase);
    d.setDate(d.getDate() - i);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = days[d.getDay()];
    const yyyy = d.getFullYear();
    const mmStr = String(m).padStart(2, '0');
    const ddStr = String(day).padStart(2, '0');
    result.push({
      fullDate: `${yyyy}-${mmStr}-${ddStr}`,
      shortLabel: `${m}/${day}`,
      dayOfWeek: `(${dow})`,
      dateNum: day,
    });
  }
  return result;
}

/** 14일 인라인 미니 스파크라인 SVG 컴포넌트 */
const MiniSparkline: React.FC<{
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}> = ({ data, color = '#334155', width = 120, height = 36 }) => {
  if (!data || data.length < 2) {
    return <span className="text-slate-400 text-xs font-bold">-</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = width;
  const h = height;
  const pad = 4;

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
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={w - pad} cy={lastY} r="3" fill={color} />
    </svg>
  );
};

export const DemandTrendPanel: React.FC<DemandTrendPanelProps> = ({
  trendData,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'surge' | 'drop' | 'volume'>('surge');
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

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

  const selectedItem: DemandTrendItem | undefined =
    currentList[selectedIdx] || currentList[0];

  const dateList = useMemo(() => {
    const dataLen = selectedItem?.spark14?.length || 14;
    return getFormatted14Dates(data.baseDate, data.dates14, dataLen);
  }, [data.baseDate, data.dates14, selectedItem]);

  // Recharts용 일자별 시계열 데이터 구성
  const chartData = useMemo(() => {
    if (!selectedItem || !selectedItem.spark14) return [];
    return selectedItem.spark14.map((qty, idx) => {
      const dateInfo = dateList[idx] || {
        shortLabel: `D-${dateList.length - 1 - idx}`,
        dayOfWeek: '',
        fullDate: '',
      };
      const prevQty = idx > 0 ? selectedItem.spark14[idx - 1] : qty;
      const diff = qty - prevQty;
      return {
        idx,
        date: dateInfo.shortLabel + dateInfo.dayOfWeek,
        shortDate: dateInfo.shortLabel,
        fullDate: dateInfo.fullDate,
        qty,
        diff,
        pct: prevQty > 0 ? Math.round((diff / prevQty) * 100) : 0,
      };
    });
  }, [selectedItem, dateList]);

  // 차트 통계치 계산 (피크, 최저, 평균)
  const chartStats = useMemo(() => {
    if (!selectedItem || !selectedItem.spark14 || selectedItem.spark14.length === 0) {
      return { peak: 0, peakDate: '-', min: 0, avg: 0, total: 0 };
    }
    const arr = selectedItem.spark14;
    let max = -Infinity;
    let maxIdx = 0;
    let min = Infinity;
    let sum = 0;
    arr.forEach((v, i) => {
      if (v > max) {
        max = v;
        maxIdx = i;
      }
      if (v < min) min = v;
      sum += v;
    });
    return {
      peak: max,
      peakDate: dateList[maxIdx]
        ? `${dateList[maxIdx].shortLabel}${dateList[maxIdx].dayOfWeek}`
        : '-',
      min,
      avg: Math.round(sum / arr.length),
      total: sum,
    };
  }, [selectedItem, dateList]);

  const dateRangeLabel = useMemo(() => {
    if (!dateList || dateList.length < 2) return '';
    return `${dateList[0].fullDate || dateList[0].shortLabel} ~ ${
      dateList[dateList.length - 1].fullDate || dateList[dateList.length - 1].shortLabel
    }`;
  }, [dateList]);

  return (
    <div className="erp-card flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden shrink-0">
      
      {/* ── 1. Top Executive Header (절제된 슬레이트-차콜 테마) ─── */}
      <div className="h-[56px] px-5 sm:px-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center">
            <Activity className="w-4.5 h-4.5 text-slate-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[16.5px] tracking-tight text-white">
                수주 모멘텀 & 트렌드 분석
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                14일 롤링 기준
              </span>
            </div>
            {dateRangeLabel && (
              <div className="text-[11.5px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>분석 기간: {dateRangeLabel}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[13px]">
          <button
            type="button"
            onClick={() => onNavigate?.('sales-order-upload')}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition flex items-center gap-1.5 font-bold cursor-pointer outline-none focus:outline-none"
            title="주문등록GSR 전체 화면으로 이동"
          >
            <span>주문등록(GSR)</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('pur-mat-order-day')}
            className="px-3.5 py-1.5 bg-indigo-900/60 hover:bg-indigo-900 text-indigo-200 rounded-lg border border-indigo-700/60 transition flex items-center gap-1.5 font-bold cursor-pointer outline-none focus:outline-none"
            title="자재발주(요일별) 화면으로 이동"
          >
            <span>자재발주(요일별) 연계</span>
            <ChevronRight className="w-3.5 h-3.5 text-indigo-400" />
          </button>
        </div>
      </div>

      {/* ── 2. Body Grid (좌우 2분할 레이아웃) ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-white">
        
        {/* [좌측 Zone: 5 / 12 열] 핵심 모멘텀 3대 진단 카드 + 편수 비율 */}
        <div className="lg:col-span-5 p-5 flex flex-col justify-between gap-3.5 bg-slate-50/60">
          <div className="flex items-center justify-between px-1">
            <span className="text-[14.5px] font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-4.5 h-4.5 text-slate-700" />
              핵심 모멘텀 3대 요약
            </span>
            <span className="text-[12px] text-slate-500 font-medium">
              클릭 시 우측 차트 즉시 연동
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* 1. 급상승 1위 카드 */}
            <div
              onClick={() => {
                setActiveTab('surge');
                setSelectedIdx(0);
              }}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer box-border outline-none focus:outline-none select-none ${
                activeTab === 'surge' && selectedIdx === 0
                  ? 'bg-white border-2 border-slate-900 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-emerald-600" />
                  주간 급상승 1위
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  자재 안전확보
                </span>
              </div>
              {topSurge ? (
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[14.5px] text-slate-900 truncate" title={topSurge.name}>
                      {topSurge.name}
                    </div>
                    <div className="text-[12px] text-slate-500 flex items-center gap-2 mt-1 font-medium">
                      <span>일평균 <b className="font-mono text-slate-800 font-bold">{topSurge.avgDailyQty.toLocaleString()}</b>ea</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-emerald-700 font-mono flex items-center">
                        <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />+{topSurge.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                    <MiniSparkline data={topSurge.spark14} color="#059669" width={105} height={32} />
                  </div>
                </div>
              ) : null}
            </div>

            {/* 2. 최다 판매 캐시카우 1위 카드 */}
            <div
              onClick={() => {
                setActiveTab('volume');
                setSelectedIdx(0);
              }}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer box-border outline-none focus:outline-none select-none ${
                activeTab === 'volume' && selectedIdx === 0
                  ? 'bg-white border-2 border-slate-900 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-slate-800" />
                  최다 판매 1위 (캐시카우)
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  안정 연속생산
                </span>
              </div>
              {topVolume ? (
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[14.5px] text-slate-900 truncate" title={topVolume.name}>
                      {topVolume.name}
                    </div>
                    <div className="text-[12px] text-slate-500 flex items-center gap-2 mt-1 font-medium">
                      <span>일평균 <b className="font-mono text-slate-800 font-bold">{topVolume.avgDailyQty.toLocaleString()}</b>ea</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-slate-800 font-mono">
                        주간 {topVolume.sumLast7.toLocaleString()}ea
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                    <MiniSparkline data={topVolume.spark14} color="#0f172a" width={105} height={32} />
                  </div>
                </div>
              ) : null}
            </div>

            {/* 3. 급감 주의 1위 카드 */}
            <div
              onClick={() => {
                setActiveTab('drop');
                setSelectedIdx(0);
              }}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer box-border outline-none focus:outline-none select-none ${
                activeTab === 'drop' && selectedIdx === 0
                  ? 'bg-white border-2 border-slate-900 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  급감 주의 1위 (불용 위험)
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  포장재 발주동결
                </span>
              </div>
              {topDrop ? (
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[14.5px] text-slate-900 truncate" title={topDrop.name}>
                      {topDrop.name}
                    </div>
                    <div className="text-[12px] text-slate-500 flex items-center gap-2 mt-1 font-medium">
                      <span>일평균 <b className="font-mono text-slate-800 font-bold">{topDrop.avgDailyQty.toLocaleString()}</b>ea</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-rose-600 font-mono flex items-center">
                        <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />{topDrop.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                    <MiniSparkline data={topDrop.spark14} color="#e11d48" width={105} height={32} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* 주야간 편수 비율 (차분한 슬레이트 바) */}
          {data.shiftRatio && (
            <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between text-[12.5px]">
              <span className="font-bold text-slate-700">주/야간 수주편수 비율:</span>
              <div className="flex items-center gap-2.5">
                <span className="font-mono font-bold text-slate-900">1편(밤) {data.shiftRatio.shift1Pct}%</span>
                <div className="w-24 h-3 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
                  <div
                    className="bg-slate-800 h-full"
                    style={{ width: `${data.shiftRatio.shift1Pct}%` }}
                    title={`1편(밤): ${data.shiftRatio.shift1Pct}%`}
                  />
                  <div
                    className="bg-slate-400 h-full"
                    style={{ width: `${data.shiftRatio.shift2Pct}%` }}
                    title={`2편(낮): ${data.shiftRatio.shift2Pct}%`}
                  />
                </div>
                <span className="font-mono font-bold text-slate-600">2편(낮) {data.shiftRatio.shift2Pct}%</span>
              </div>
            </div>
          )}
        </div>

        {/* [우측 Zone: 7 / 12 열] 14일 롤링 모멘텀 집계 (테이블 & 정밀 그래프) */}
        <div className="lg:col-span-7 p-5 flex flex-col justify-between">
          
          {/* Sub Header & Segmented Tabs (모던 미니멀리즘 탭) */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3.5 mb-3 border-b border-slate-200">
            
            {/* 카테고리 탭: 통일된 다크 슬레이트 액티브 스타일 (알록달록함 제거) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('surge');
                  setSelectedIdx(0);
                }}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-[13px] transition cursor-pointer flex items-center gap-1.5 outline-none focus:outline-none select-none ${
                  activeTab === 'surge'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Flame className={`w-3.5 h-3.5 ${activeTab === 'surge' ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>급상승 TOP 5</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('drop');
                  setSelectedIdx(0);
                }}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-[13px] transition cursor-pointer flex items-center gap-1.5 outline-none focus:outline-none select-none ${
                  activeTab === 'drop'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <TrendingDown className={`w-3.5 h-3.5 ${activeTab === 'drop' ? 'text-rose-400' : 'text-slate-500'}`} />
                <span>급감 주의 TOP 5</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('volume');
                  setSelectedIdx(0);
                }}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-[13px] transition cursor-pointer flex items-center gap-1.5 outline-none focus:outline-none select-none ${
                  activeTab === 'volume'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Award className={`w-3.5 h-3.5 ${activeTab === 'volume' ? 'text-amber-300' : 'text-slate-500'}`} />
                <span>최다 판매 TOP 5</span>
              </button>
            </div>

            {/* 보기 방식 토글 & 확대 모달 버튼 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-bold flex items-center gap-1 transition outline-none focus:outline-none ${
                    viewMode === 'table'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="5대 품목 요약표 보기"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>요약표</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('chart')}
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-bold flex items-center gap-1 transition outline-none focus:outline-none ${
                    viewMode === 'chart'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="14일 정밀 추이 그래프 보기"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>14일 정밀 차트</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-300 transition flex items-center gap-1.5 text-[12px] font-bold cursor-pointer outline-none focus:outline-none shadow-2xs"
                title="14일 정밀 추이 전체화면 모달 열기"
              >
                <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                <span>정밀 분석 확대</span>
              </button>
            </div>
          </div>

          {/* ── View Mode 1: 요약표 (Table View) ──────────────────── */}
          {viewMode === 'table' ? (
            <div className="flex flex-col gap-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13.5px] border-collapse">
                  <thead>
                    <tr className="text-slate-700 font-bold text-[12.5px] border-b border-slate-200 pb-2 bg-slate-50">
                      <th className="py-2.5 px-3 w-10 text-center rounded-l-lg">No</th>
                      <th className="py-2.5 px-3">품목명 / 코드</th>
                      <th className="py-2.5 px-3 w-36 text-right">7일 수주량 (일평균)</th>
                      <th className="py-2.5 px-3 w-28 text-right">전주대비</th>
                      <th className="py-2.5 px-3 w-36 text-center">14일 추이</th>
                      <th className="py-2.5 px-3 w-32 text-center rounded-r-lg">추천 권고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentList.map((item, idx) => {
                      const isPositive = item.pct > 0;
                      const isNegative = item.pct < 0;
                      const isSelected = selectedIdx === idx;

                      return (
                        <tr
                          key={item.code}
                          onClick={() => setSelectedIdx(idx)}
                          className={`transition-colors cursor-pointer outline-none focus:outline-none select-none ${
                            isSelected
                              ? 'bg-slate-100/90 text-slate-900 border-l-4 border-slate-900'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <td className="py-3 px-3 text-center text-[13.5px]">
                            <span
                              className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-[12px] font-bold ${
                                isSelected
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-400'
                              }`}
                            >
                              {idx + 1}
                            </span>
                          </td>
                          <td className="py-3 px-3 min-w-[190px]">
                            <div
                              className="font-bold text-[14px] truncate max-w-[240px] leading-snug"
                              title={item.name}
                            >
                              {item.name}
                            </div>
                            <div className="font-mono text-[11.5px] text-slate-500 font-normal mt-0.5">
                              {item.code}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="font-mono font-bold text-[13.5px]">
                              {item.sumLast7.toLocaleString()}ea
                            </div>
                            <div className="font-mono text-[11.5px] text-slate-500 mt-0.5">
                              일 {item.avgDailyQty.toLocaleString()}ea
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[12px] font-bold font-mono ${
                                isPositive
                                  ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                  : isNegative
                                  ? 'text-rose-700 bg-rose-50 border border-rose-200'
                                  : 'text-slate-600 bg-slate-100'
                              }`}
                            >
                              {isPositive ? '+' : ''}
                              {item.pct}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="inline-block px-1.5 py-0.5 bg-slate-50 rounded-lg border border-slate-200">
                              <MiniSparkline
                                data={item.spark14}
                                color="#0f172a"
                                width={105}
                                height={30}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded text-[11.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {item.recommendation}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 하단 선택 품목 14일 인라인 미니 브리핑 바 */}
              {selectedItem && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-white text-[11px] font-bold shrink-0">
                      선택
                    </span>
                    <span className="font-bold text-slate-900 truncate">
                      {selectedItem.name}
                    </span>
                    <span className="text-slate-500 font-mono text-[11.5px]">
                      ({selectedItem.code})
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-slate-600">
                      14일 최고: <b className="font-mono text-slate-900 font-bold">{chartStats.peak.toLocaleString()}ea</b> ({chartStats.peakDate})
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600">
                      14일 일평균: <b className="font-mono text-slate-900 font-bold">{chartStats.avg.toLocaleString()}ea</b>
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewMode('chart')}
                      className="ml-2 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11.5px] font-bold transition flex items-center gap-1 cursor-pointer outline-none focus:outline-none"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>14일 정밀 차트 열기</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── View Mode 2: 14일 정밀 차트 (완전한 인셋 보더로 테두리 깨짐 원천 방지) ─── */
            <div className="flex flex-col gap-3">
              
              {/* 상단 5개 품목 빠른 선택 알약 (p-1.5 패딩으로 스크롤 컨테이너 경계선 클리핑 완벽 차단) */}
              <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-slate-50 rounded-xl border border-slate-200">
                {currentList.map((item, idx) => {
                  const isSelected = selectedIdx === idx;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => setSelectedIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition shrink-0 flex items-center gap-1.5 cursor-pointer outline-none focus:outline-none select-none box-border ${
                        isSelected
                          ? 'bg-slate-900 text-white border border-slate-900 shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <span className={isSelected ? 'text-slate-300' : 'text-slate-400'}>#{idx + 1}</span>
                      <span className="truncate max-w-[130px]">{item.name}</span>
                      <span className="font-mono text-[11px] opacity-80">
                        ({item.pct > 0 ? `+${item.pct}%` : `${item.pct}%`})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 선택된 품목 지표 요약 헤더 (차분한 슬레이트 박스) */}
              {selectedItem && (
                <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[15px] text-slate-900">
                        {selectedItem.name}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white border border-slate-300 text-slate-700">
                        {selectedItem.recommendation}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-slate-500 font-mono mt-0.5">
                      바코드: {selectedItem.code} | 분류: {selectedItem.category || '완성품'}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[12.5px]">
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 font-medium">14일 총수주량</div>
                      <div className="font-mono font-bold text-slate-900 text-[14.5px]">
                        {chartStats.total.toLocaleString()}ea
                      </div>
                    </div>
                    <div className="h-6 w-[1px] bg-slate-300" />
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 font-medium">일평균 수주량</div>
                      <div className="font-mono font-bold text-slate-900 text-[14.5px]">
                        {chartStats.avg.toLocaleString()}ea
                      </div>
                    </div>
                    <div className="h-6 w-[1px] bg-slate-300" />
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 font-medium">최고 수주일(Peak)</div>
                      <div className="font-mono font-bold text-slate-900 text-[14.5px]">
                        {chartStats.peak.toLocaleString()}ea
                        <span className="text-[11px] font-normal text-slate-500 ml-1">
                          ({chartStats.peakDate})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 메인 14일 Recharts AreaChart (모던 슬레이트-차콜 그라데이션) */}
              <div className="h-[210px] w-full bg-white rounded-xl border border-slate-200 p-2.5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f172a" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#0f172a" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg border border-slate-800 text-[12px]">
                              <div className="text-slate-300 font-bold flex items-center gap-1.5 mb-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>{p.fullDate || p.date}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4 font-mono">
                                <span className="text-slate-400">수주량:</span>
                                <span className="font-bold text-[14.5px] text-white">
                                  {p.qty.toLocaleString()} ea
                                </span>
                              </div>
                              {p.idx > 0 && (
                                <div className="flex items-center justify-between gap-4 mt-1 font-mono text-[11px]">
                                  <span className="text-slate-400">전일대비:</span>
                                  <span
                                    className={`font-bold ${
                                      p.diff > 0
                                        ? 'text-emerald-400'
                                        : p.diff < 0
                                        ? 'text-rose-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {p.diff > 0 ? `+${p.diff.toLocaleString()}` : p.diff.toLocaleString()} ea ({p.pct > 0 ? `+${p.pct}%` : `${p.pct}%`})
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      y={chartStats.avg}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      label={{
                        value: `평균 ${chartStats.avg.toLocaleString()}ea`,
                        position: 'insideTopRight',
                        fill: '#64748b',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="qty"
                      stroke="#0f172a"
                      strokeWidth={2.8}
                      fillOpacity={1}
                      fill="url(#trendGradient)"
                      activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2, fill: '#0f172a' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* 하단 14일 일자별 수주량 정밀 그리드 */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="text-[11.5px] font-bold text-slate-700 mb-1.5 flex items-center justify-between px-1">
                  <span>14일 일자별 수주 실적 (EA)</span>
                  <span className="text-slate-400 font-mono text-[10.5px]">*좌측부터 D-13 ~ D-Day</span>
                </div>
                <div className="grid grid-cols-7 sm:grid-cols-14 gap-1 text-center">
                  {chartData.map((d, i) => {
                    const isPeak = d.qty === chartStats.peak && d.qty > 0;
                    return (
                      <div
                        key={i}
                        className={`p-1.5 rounded-lg border transition ${
                          isPeak
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-800'
                        }`}
                        title={`${d.fullDate || d.date}: ${d.qty.toLocaleString()}ea`}
                      >
                        <div className={`text-[10px] font-mono ${isPeak ? 'text-slate-300 font-bold' : 'text-slate-400'}`}>
                          {d.shortDate}
                        </div>
                        <div className="text-[11.5px] font-mono font-bold mt-0.5 truncate">
                          {d.qty.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── 3. 14일 정밀 추이 분석 대형 모달 (모던 슬레이트 테마) ──── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-slate-300 overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200">
                  <BarChart3 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold tracking-tight text-white">
                    14일 일자별 수주 정밀 추이 & 수요 모멘텀 분석
                  </h3>
                  <p className="text-[12px] text-slate-400 font-mono mt-0.5">
                    기준일: ~{data.baseDate} ({dateRangeLabel})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-white cursor-pointer outline-none focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 bg-slate-50/50">
              
              {/* Category & Item Selector Pill Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-bold text-slate-500 mr-1">분류:</span>
                  {(['surge', 'volume', 'drop'] as const).map((tabKey) => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => {
                        setActiveTab(tabKey);
                        setSelectedIdx(0);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold transition cursor-pointer outline-none focus:outline-none select-none ${
                        activeTab === tabKey
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tabKey === 'surge'
                        ? '🔥 급상승 TOP 5'
                        : tabKey === 'drop'
                        ? '⚠️ 급감 주의 TOP 5'
                        : '🏆 최다 판매 TOP 5'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto p-1">
                  <span className="text-[12.5px] font-bold text-slate-500 mr-1">순위:</span>
                  {currentList.map((it, idx) => (
                    <button
                      key={it.code}
                      type="button"
                      onClick={() => setSelectedIdx(idx)}
                      className={`px-3 py-1 rounded-lg text-[12px] font-bold transition cursor-pointer border outline-none focus:outline-none select-none ${
                        selectedIdx === idx
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      #{idx + 1} {it.name.slice(0, 7)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 KPI Summary Cards for Selected Item */}
              {selectedItem && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="text-[11.5px] font-medium text-slate-500">14일 총 수주량</div>
                    <div className="text-[19px] font-mono font-bold text-slate-900 mt-1">
                      {chartStats.total.toLocaleString()}
                      <span className="text-[12px] font-normal text-slate-500 ml-1">ea</span>
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="text-[11.5px] font-medium text-slate-500">일평균 수주량</div>
                    <div className="text-[19px] font-mono font-bold text-slate-900 mt-1">
                      {chartStats.avg.toLocaleString()}
                      <span className="text-[12px] font-normal text-slate-500 ml-1">ea/일</span>
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="text-[11.5px] font-medium text-slate-500">전주 대비 모멘텀</div>
                    <div
                      className={`text-[19px] font-mono font-bold mt-1 flex items-center ${
                        selectedItem.pct > 0
                          ? 'text-emerald-700'
                          : selectedItem.pct < 0
                          ? 'text-rose-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {selectedItem.pct > 0 ? `+${selectedItem.pct}%` : `${selectedItem.pct}%`}
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="text-[11.5px] font-medium text-slate-500">최고 수주일(Peak)</div>
                    <div className="text-[19px] font-mono font-bold text-slate-900 mt-1 truncate">
                      {chartStats.peak.toLocaleString()}
                      <span className="text-[11.5px] font-normal text-slate-500 ml-1">
                        ({chartStats.peakDate})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Grand Chart (AreaChart 280px) */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-3.5">
                  <div>
                    <h4 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
                      <span>{selectedItem?.name}</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {selectedItem?.recommendation}
                      </span>
                    </h4>
                    <p className="text-[11.5px] text-slate-500 font-mono mt-0.5">
                      바코드: {selectedItem?.code} | 카테고리: {selectedItem?.category || '완성품'}
                    </p>
                  </div>
                  <div className="text-[12px] text-slate-500 hidden sm:block">
                    * 점에 마우스를 올리면 당일 수주량 및 전일대비 증감이 표시됩니다.
                  </div>
                </div>

                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="modalGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0f172a" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0f172a" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11.5, fill: '#64748b', fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11.5, fill: '#64748b', fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const p = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg border border-slate-800 text-[12px]">
                                <div className="text-slate-300 font-bold flex items-center gap-1.5 mb-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{p.fullDate || p.date}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4 font-mono">
                                  <span className="text-slate-400">수주량:</span>
                                  <span className="font-bold text-[15px] text-white">
                                    {p.qty.toLocaleString()} ea
                                  </span>
                                </div>
                                {p.idx > 0 && (
                                  <div className="flex items-center justify-between gap-4 mt-1 font-mono text-[11px]">
                                    <span className="text-slate-400">전일대비:</span>
                                    <span
                                      className={`font-bold ${
                                        p.diff > 0
                                          ? 'text-emerald-400'
                                          : p.diff < 0
                                          ? 'text-rose-400'
                                          : 'text-slate-400'
                                      }`}
                                    >
                                      {p.diff > 0 ? `+${p.diff.toLocaleString()}` : p.diff.toLocaleString()} ea ({p.pct > 0 ? `+${p.pct}%` : `${p.pct}%`})
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine
                        y={chartStats.avg}
                        stroke="#94a3b8"
                        strokeDasharray="4 4"
                        label={{
                          value: `평균 ${chartStats.avg.toLocaleString()}ea`,
                          position: 'insideTopRight',
                          fill: '#475569',
                          fontSize: 11.5,
                          fontWeight: 600,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="qty"
                        stroke="#0f172a"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#modalGradient)"
                        activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2, fill: '#0f172a' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 14일 일자별 수주량 테이블 그리드 */}
              <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-2xs">
                <h4 className="text-[13.5px] font-bold text-slate-900 mb-2.5 flex items-center justify-between">
                  <span>14일 일자별 정밀 수주 내역</span>
                  <span className="text-[11.5px] text-slate-500 font-mono">단위: EA</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
                  {chartData.map((d, i) => {
                    const isPeak = d.qty === chartStats.peak && d.qty > 0;
                    return (
                      <div
                        key={i}
                        className={`p-2.5 rounded-lg border flex flex-col justify-between ${
                          isPeak
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 border-slate-200 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className={`font-mono font-bold ${isPeak ? 'text-slate-200' : 'text-slate-600'}`}>{d.date}</span>
                          {isPeak && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white text-slate-900">
                              PEAK
                            </span>
                          )}
                        </div>
                        <div className="text-[15px] font-mono font-bold mt-1.5 text-right">
                          {d.qty.toLocaleString()}
                          <span className={`text-[10.5px] font-normal ml-1 ${isPeak ? 'text-slate-300' : 'text-slate-500'}`}>ea</span>
                        </div>
                        <div className="text-[10.5px] font-mono text-right mt-0.5">
                          {i === 0 ? (
                            <span className={isPeak ? 'text-slate-400' : 'text-slate-400'}>기준</span>
                          ) : (
                            <span
                              className={`font-bold ${
                                isPeak
                                  ? 'text-slate-300'
                                  : d.diff > 0
                                  ? 'text-emerald-700'
                                  : d.diff < 0
                                  ? 'text-rose-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {d.diff > 0 ? `+${d.diff.toLocaleString()}` : d.diff < 0 ? `${d.diff.toLocaleString()}` : '-'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SCM 조치 권고사항 가이드 (차분한 슬레이트 박스) */}
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
                <div className="p-1.5 bg-slate-800 text-white rounded-lg shrink-0 mt-0.5">
                  <Info className="w-4.5 h-4.5" />
                </div>
                <div className="text-[13px] text-slate-700 leading-relaxed">
                  <div className="font-bold text-slate-900 text-[13.5px] mb-0.5">
                    GFS 공급망(SCM) 현장 조치 권고
                  </div>
                  {activeTab === 'surge' ? (
                    <div>
                      수주 급상승 모멘텀 품목입니다. <b>원부자재(쌀, 주원료, 소스류) 안전재고를 최소 20% 추가 확보</b>하고, 1편/2편 성형 및 포장 라인의 가동 우선순위를 상향 배정하여 결품(미출)을 사전에 차단하십시오.
                    </div>
                  ) : activeTab === 'drop' ? (
                    <div>
                      수주가 급감 추세에 있는 주의 품목입니다. <b>전용 인쇄 필름 및 특수 포장용기의 추가 발주를 즉시 홀딩(동결)</b>하고, 잔여 원자재의 유통기한을 모니터링하여 불용 폐기 손실을 방지하십시오.
                    </div>
                  ) : (
                    <div>
                      안정적으로 매출을 견인하는 최다 판매 캐시카우 품목입니다. <b>연속 생산 스케줄을 유지</b>하여 품목 교체(C/O) 비용을 최소화하고 벤더와의 정기 입고 루틴을 안정적으로 유지하십시오.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[12px] text-slate-500 font-medium">
                * 본 데이터는 GS EDI 본발주 수주 실적을 기반으로 실시간 집계됩니다.
              </span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[13px] font-bold transition cursor-pointer outline-none focus:outline-none"
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
