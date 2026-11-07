'use client';

import React, { useId, useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  Cell,
} from 'recharts';

// React 19 + Recharts defaultProps 콘솔 경고 억제 (중복 래핑 방지)
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

export interface ComparePoint {
  label: string;
  sales: number;
  purchase: number;
}

interface ErpComparePanelProps {
  title?: string;
  monthly: ComparePoint[];
  yearly: ComparePoint[];
  defaultMode?: 'monthly' | 'yearly';
  hasData?: boolean;
}

const SALES = '#2b7de9';
const PURCHASE = '#f59e0b';

const num = (n: number) => (Math.round(n) || 0).toLocaleString('ko-KR');

function Stat({ label, value, tone }: { label: string; value: string; tone: 'info' | 'warn' | 'ok' | 'bad' }) {
  const color =
    tone === 'info'
      ? 'text-[#1d4ed8]'
      : tone === 'warn'
        ? 'text-[#b45309]'
        : tone === 'ok'
          ? 'text-[#047857]'
          : 'text-[#be123c]';
  const bg =
    tone === 'info'
      ? 'bg-blue-50/90 border-blue-200'
      : tone === 'warn'
        ? 'bg-amber-50/90 border-amber-200'
        : tone === 'ok'
          ? 'bg-emerald-50/90 border-emerald-200'
          : 'bg-rose-50/90 border-rose-200';
  return (
    <div className={`flex-1 min-w-0 rounded-2xl border-2 px-4.5 py-3.5 sm:px-5 sm:py-4 ${bg} shadow-xs`}>
      <div className="text-[13.5px] sm:text-[14px] font-black text-slate-700 truncate">{label}</div>
      <div className={`num text-[28px] sm:text-[34px] font-black tracking-tight truncate ${color} mt-1.5 leading-none`}>
        {value}
        <span className="text-[13.5px] font-extrabold text-slate-500 ml-2">백만원</span>
      </div>
    </div>
  );
}

export const ErpComparePanel: React.FC<ErpComparePanelProps> = ({
  title = '매출 vs 매입 비교 (단위: 백만)',
  monthly,
  yearly,
  defaultMode = 'monthly',
  hasData = true,
}) => {
  const [mode, setMode] = useState<'monthly' | 'yearly'>(defaultMode);
  const [isMounted, setIsMounted] = useState(false);
  const baseId = useId().replace(/[:]/g, '');
  const salesGrad = `cmp-sales-${baseId}`;
  const purchGrad = `cmp-purch-${baseId}`;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const currentData = mode === 'monthly' ? monthly : yearly;
  const totalSales = currentData.reduce((s, d) => s + (d.sales || 0), 0);
  const totalPurchase = currentData.reduce((s, d) => s + (d.purchase || 0), 0);
  const diff = totalSales - totalPurchase;
  const purchRate = totalSales > 0 ? (totalPurchase / totalSales) * 100 : 0;

  return (
    <div className="erp-card flex flex-col overflow-hidden text-[13px] bg-white rounded-2xl border border-slate-200 shadow-md">
      {/* Panel Header */}
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="w-2 h-5 rounded-full"
            style={{ background: `linear-gradient(180deg, ${SALES}, ${PURCHASE})` }}
          />
          <span className="text-[17px] font-black text-slate-900 tracking-tight">{title}</span>
          {!hasData && (
            <span className="px-2.5 py-0.5 rounded text-[12px] font-black bg-slate-100 text-slate-500 border border-slate-200">
              데이터 없음
            </span>
          )}
          {/* 범례 */}
          <span className="hidden sm:flex items-center gap-2 ml-3">
            <span className="px-3 py-1 rounded-lg text-[13px] font-black bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-2">
              <span className="w-3 h-3 rounded-[3px]" style={{ background: SALES }} />
              매출
            </span>
            <span className="px-3 py-1 rounded-lg text-[13px] font-black bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-2">
              <span className="w-3 h-3 rounded-[3px]" style={{ background: PURCHASE }} />
              매입
            </span>
          </span>
        </div>
        {/* 세그먼트 컨트롤 */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/80 border border-slate-300">
          {(['monthly', 'yearly'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-[13px] font-black rounded-lg transition-all cursor-pointer ${
                mode === m
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m === 'monthly' ? '30일' : '년'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="flex items-stretch gap-4 px-5 pt-4 pb-3">
        <Stat label={`기간 매출합 (${mode === 'monthly' ? '30일' : '년'})`} value={num(totalSales)} tone="info" />
        <Stat label={`기간 매입합 (${mode === 'monthly' ? '30일' : '년'})`} value={num(totalPurchase)} tone="warn" />
        <Stat
          label={`차이 (매출−매입)${totalSales > 0 ? ` · 매입률 ${purchRate.toFixed(1)}%` : ''}`}
          value={`${diff < 0 ? '−' : ''}${num(Math.abs(diff))}`}
          tone={diff >= 0 ? 'ok' : 'bad'}
        />
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-[370px] p-3 pt-3 bg-white relative">
        {isMounted ? (
          <ResponsiveContainer width="100%" height={345} minWidth={0} minHeight={0}>
            <ComposedChart data={currentData} margin={{ top: 20, right: 14, left: 0, bottom: 10 }} barCategoryGap="16%">
              <defs>
                <linearGradient id={salesGrad} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SALES} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={SALES} stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id={purchGrad} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PURCHASE} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={PURCHASE} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 3" vertical={false} stroke="#eef2f7" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11.5, fill: '#475569', fontWeight: 700 }}
                interval={0}
                angle={mode === 'monthly' ? -30 : 0}
                textAnchor={mode === 'monthly' ? 'end' : 'middle'}
                tickLine={false}
                axisLine={{ stroke: '#dbe3ee' }}
                height={mode === 'monthly' ? 44 : 28}
              />
              <YAxis
                domain={[0, (dataMax: number) => Math.ceil((dataMax || 10) * 1.15)]}
                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload as ComparePoint;
                    const s = d.sales || 0;
                    const p = d.purchase || 0;
                    const gap = s - p;
                    const rate = s > 0 ? (p / s) * 100 : 0;
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-xl min-w-[170px]">
                        <div className="text-[12.5px] font-black text-slate-800 mb-1.5">
                          {d.label}
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="flex items-center gap-1.5 font-bold text-slate-700">
                            <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: SALES }} />
                            매출
                          </span>
                          <span className="num font-black text-[#1d4ed8] text-[14px]">
                            {num(s)} <span className="text-[11px] font-bold text-slate-500">백만</span>
                          </span>
                        </div>
                        <div className="text-right text-[11.5px] text-slate-500 font-bold num">
                          ₩{(s * 1000000).toLocaleString('ko-KR')}
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[13px] mt-1">
                          <span className="flex items-center gap-1.5 font-bold text-slate-700">
                            <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: PURCHASE }} />
                            매입
                          </span>
                          <span className="num font-black text-[#b45309] text-[14px]">
                            {num(p)} <span className="text-[11px] font-bold text-slate-500">백만</span>
                          </span>
                        </div>
                        <div className="text-right text-[11.5px] text-slate-500 font-bold num">
                          ₩{(p * 1000000).toLocaleString('ko-KR')}
                        </div>
                        <div className="border-t border-slate-100 mt-2 pt-2 flex items-center justify-between gap-3 text-[13.5px]">
                          <span className="font-black text-slate-800">차이</span>
                          <span className={`num font-black ${gap >= 0 ? 'text-[#047857]' : 'text-[#be123c]'}`}>
                            {gap < 0 ? '−' : '+'}
                            {num(Math.abs(gap))}
                          </span>
                        </div>
                        {s > 0 && (
                          <div className="text-right text-[11.5px] text-slate-500 font-bold mt-0.5 num">
                            매입률 {rate.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="sales" maxBarSize={mode === 'monthly' ? 24 : 38} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {currentData.map((_, i) => (
                  <Cell key={i} fill={`url(#${salesGrad})`} />
                ))}
                <LabelList
                  dataKey="sales"
                  position="top"
                  style={{ fontSize: 11, fill: '#0f172a', fontWeight: 800 }}
                  formatter={(v: any) => (typeof v === 'number' && v > 0 ? v : '')}
                />
              </Bar>
              <Bar dataKey="purchase" maxBarSize={mode === 'monthly' ? 24 : 38} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {currentData.map((_, i) => (
                  <Cell key={i} fill={`url(#${purchGrad})`} />
                ))}
                <LabelList
                  dataKey="purchase"
                  position="top"
                  style={{ fontSize: 11, fill: '#0f172a', fontWeight: 800 }}
                  formatter={(v: any) => (typeof v === 'number' && v > 0 ? v : '')}
                />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex flex-col gap-2 p-2">
            <div className="skeleton h-[150px] rounded-md" />
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
        )}
        {isMounted && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] text-[var(--ink-400)] bg-white/90 px-2 py-1 rounded border border-[var(--line)]">
              해당 기간 데이터가 없습니다
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
