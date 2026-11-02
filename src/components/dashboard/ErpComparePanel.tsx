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
      ? 'bg-blue-50/70 border-blue-100'
      : tone === 'warn'
        ? 'bg-amber-50/70 border-amber-100'
        : tone === 'ok'
          ? 'bg-emerald-50/70 border-emerald-100'
          : 'bg-rose-50/70 border-rose-100';
  return (
    <div className={`flex-1 min-w-0 rounded-md border px-2.5 py-1.5 ${bg}`}>
      <div className="text-[10px] font-semibold text-[var(--ink-400)] truncate">{label}</div>
      <div className={`num text-[18px] font-extrabold truncate ${color}`}>
        {value}
        <span className="text-[9.5px] font-normal text-[var(--ink-400)] ml-1">백만원</span>
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
    <div className="erp-card flex flex-col overflow-hidden text-[12.5px]">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--line)] bg-[#fbfcfe] select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-[3px] h-3.5 rounded-full"
            style={{ background: `linear-gradient(180deg, ${SALES}, ${PURCHASE})` }}
          />
          <span className="font-bold text-[var(--ink-900)] text-[12.5px] truncate">{title}</span>
          {!hasData && (
            <span className="chip bg-[#f8fafc] text-[var(--ink-400)] border border-[var(--line)]">
              데이터 없음
            </span>
          )}
          {/* 범례 */}
          <span className="hidden sm:flex items-center gap-1.5 ml-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-600)]">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: SALES }} />
              매출
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-600)]">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: PURCHASE }} />
              매입
            </span>
          </span>
        </div>
        {/* 세그먼트 컨트롤 */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[#eef2f7] border border-[var(--line)]">
          {(['monthly', 'yearly'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2.5 py-[3px] text-[11px] font-bold rounded-[5px] transition-all cursor-pointer ${
                mode === m
                  ? 'bg-white text-[var(--ink-900)] shadow-[0_1px_2px_rgba(15,23,42,0.12)]'
                  : 'text-[var(--ink-600)] hover:text-[var(--ink-900)]'
              }`}
            >
              {m === 'monthly' ? '30일' : '년'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="flex items-stretch gap-2 px-3.5 pt-2.5">
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
