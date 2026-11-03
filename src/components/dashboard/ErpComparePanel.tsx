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

// React 19 + Recharts defaultProps 콘솔 경고 억제 (Next.js 오버레이 방지)
if (typeof window !== 'undefined') {
  const origError = console.error;
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('defaultProps') || args[0].includes('Support for defaultProps'))
    ) {
      return;
    }
    origError(...args);
  };
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
      ? 'bg-blue-50/80 border-blue-200'
      : tone === 'warn'
        ? 'bg-amber-50/80 border-amber-200'
        : tone === 'ok'
          ? 'bg-emerald-50/80 border-emerald-200'
          : 'bg-rose-50/80 border-rose-200';
  return (
    <div className={`flex-1 min-w-0 rounded-xl border px-3.5 py-2.5 ${bg} shadow-2xs`}>
      <div className="text-[12px] font-bold text-slate-600 truncate">{label}</div>
      <div className={`num text-[22px] sm:text-[24px] font-black tracking-tight truncate ${color} mt-0.5`}>
        {value}
        <span className="text-[12px] font-bold text-slate-500 ml-1.5">백만원</span>
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
    <div className="erp-card flex flex-col overflow-hidden text-[13px] bg-white rounded-2xl border border-slate-200 shadow-xs">
      {/* Panel Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-4.5 rounded-full"
            style={{ background: `linear-gradient(180deg, ${SALES}, ${PURCHASE})` }}
          />
          <span className="text-[15px] font-black text-slate-900 tracking-tight">{title}</span>
          {!hasData && (
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
              데이터 없음
            </span>
          )}
          {/* 범례 */}
          <span className="hidden sm:flex items-center gap-2 ml-2">
            <span className="px-2 py-0.5 rounded-md text-[12px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: SALES }} />
              매출
            </span>
            <span className="px-2 py-0.5 rounded-md text-[12px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: PURCHASE }} />
              매입
            </span>
          </span>
        </div>
        {/* 세그먼트 컨트롤 */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-200/80 border border-slate-300">
          {(['monthly', 'yearly'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-[12px] font-extrabold rounded-md transition-all cursor-pointer ${
                mode === m
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m === 'monthly' ? '30일' : '년'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="flex items-stretch gap-3 px-4 pt-3.5 pb-2">
        <Stat label={`기간 매출합 (${mode === 'monthly' ? '30일' : '년'})`} value={num(totalSales)} tone="info" />
        <Stat label={`기간 매입합 (${mode === 'monthly' ? '30일' : '년'})`} value={num(totalPurchase)} tone="warn" />
        <Stat
          label={`차이 (매출−매입)${totalSales > 0 ? ` · 매입률 ${purchRate.toFixed(1)}%` : ''}`}
          value={`${diff < 0 ? '−' : ''}${num(Math.abs(diff))}`}
          tone={diff >= 0 ? 'ok' : 'bad'}
        />
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-[320px] p-2 pt-2 bg-white relative">
        {isMounted ? (
          <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
            <ComposedChart data={currentData} margin={{ top: 16, right: 12, left: -6, bottom: 8 }} barCategoryGap="16%">
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
                tick={{ fontSize: 9.5, fill: '#64748b' }}
                interval={0}
                angle={mode === 'monthly' ? -30 : 0}
                textAnchor={mode === 'monthly' ? 'end' : 'middle'}
                tickLine={false}
                axisLine={{ stroke: '#dbe3ee' }}
                height={mode === 'monthly' ? 40 : 24}
              />
              <YAxis
                domain={[0, (dataMax: number) => Math.ceil((dataMax || 10) * 1.15)]}
                tick={{ fontSize: 9.5, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                width={44}
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
                      <div className="rounded-md border border-[var(--line)] bg-white px-2.5 py-2 shadow-lg min-w-[150px]">
                        <div className="text-[10px] font-semibold text-[var(--ink-400)] mb-1">
                          {d.label}
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[11.5px]">
                          <span className="flex items-center gap-1 font-semibold text-[var(--ink-600)]">
                            <span className="w-2 h-2 rounded-[2px]" style={{ background: SALES }} />
                            매출
                          </span>
                          <span className="num font-bold text-[#1d4ed8]">
                            {num(s)} <span className="text-[9px] font-normal text-[var(--ink-400)]">백만</span>
                          </span>
                        </div>
                        <div className="text-right text-[10px] text-[var(--ink-400)] num">
                          ₩{(s * 1000000).toLocaleString('ko-KR')}
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[11.5px] mt-0.5">
                          <span className="flex items-center gap-1 font-semibold text-[var(--ink-600)]">
                            <span className="w-2 h-2 rounded-[2px]" style={{ background: PURCHASE }} />
                            매입
                          </span>
                          <span className="num font-bold text-[#b45309]">
                            {num(p)} <span className="text-[9px] font-normal text-[var(--ink-400)]">백만</span>
                          </span>
                        </div>
                        <div className="text-right text-[10px] text-[var(--ink-400)] num">
                          ₩{(p * 1000000).toLocaleString('ko-KR')}
                        </div>
                        <div className="border-t border-[var(--line)] mt-1.5 pt-1.5 flex items-center justify-between gap-3 text-[12px]">
                          <span className="font-bold text-[var(--ink-700)]">차이</span>
                          <span className={`num font-extrabold ${gap >= 0 ? 'text-[#047857]' : 'text-[#be123c]'}`}>
                            {gap < 0 ? '−' : '+'}
                            {num(Math.abs(gap))}
                          </span>
                        </div>
                        {s > 0 && (
                          <div className="text-right text-[10px] text-[var(--ink-400)] mt-0.5 num">
                            매입률 {rate.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="sales" maxBarSize={mode === 'monthly' ? 22 : 34} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {currentData.map((_, i) => (
                  <Cell key={i} fill={`url(#${salesGrad})`} />
                ))}
                <LabelList
                  dataKey="sales"
                  position="top"
                  style={{ fontSize: 9, fill: '#475569', fontWeight: 600 }}
                  formatter={(v: any) => (typeof v === 'number' && v > 0 ? v : '')}
                />
              </Bar>
              <Bar dataKey="purchase" maxBarSize={mode === 'monthly' ? 22 : 34} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {currentData.map((_, i) => (
                  <Cell key={i} fill={`url(#${purchGrad})`} />
                ))}
                <LabelList
                  dataKey="purchase"
                  position="top"
                  style={{ fontSize: 9, fill: '#475569', fontWeight: 600 }}
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
