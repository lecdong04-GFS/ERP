'use client';

import React, { useId, useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ReferenceLine,
  Cell,
} from 'recharts';
import { ChartPoint } from './dashboardData';

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

interface ErpChartPanelProps {
  title: string;
  monthlyData: ChartPoint[];
  yearlyData: ChartPoint[];
  yDomain?: [number, number];
  defaultMode?: 'monthly' | 'yearly';
  showZeroLabels?: boolean;
  hasData?: boolean;
  accent?: string;
}

export const ErpChartPanel: React.FC<ErpChartPanelProps> = ({
  title,
  monthlyData,
  yearlyData,
  yDomain = [0, 120],
  defaultMode = 'monthly',
  showZeroLabels = false,
  hasData = true,
  accent = '#2b7de9',
}) => {
  const [mode, setMode] = useState<'monthly' | 'yearly'>(defaultMode);
  const [isMounted, setIsMounted] = useState(false);
  const gradientId = `bar-${useId().replace(/[:]/g, '')}`;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const currentData = mode === 'monthly' ? monthlyData : yearlyData;
  const values = currentData.map((d) => d.value).filter((v) => v > 0);
  const average = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

  const renderCustomizedLabel = (props: any) => {
    if (!props) return null;
    const { x, y, width, value } = props;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      isNaN(x) ||
      isNaN(y) ||
      isNaN(width)
    ) {
      return null;
    }
    if (!value || (!showZeroLabels && value === 0)) return null;

    return (
      <text
        x={x + width / 2}
        y={y - 4}
        fill="#475569"
        textAnchor="middle"
        dominantBaseline="auto"
        style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
      >
        {value}
      </text>
    );
  };

  return (
    <div className="erp-card flex flex-col overflow-hidden text-[12.5px]">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--line)] bg-[#fbfcfe] select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: accent }} />
          <span className="font-bold text-[var(--ink-900)] text-[12.5px] truncate">{title}</span>
          {!hasData && (
            <span className="chip bg-[#f8fafc] text-[var(--ink-400)] border border-[var(--line)]">
              데이터 없음
            </span>
          )}
          {hasData && average > 0 && (
            <span className="chip bg-[#f8fafc] text-[var(--ink-600)] border border-[var(--line)] num">
              평균 {Math.round(average)}
            </span>
          )}
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
              {m === 'monthly' ? '당월' : '년'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-[228px] p-2 pt-3 bg-white relative">
        {isMounted ? (
          <ResponsiveContainer width="100%" height={210} minWidth={0} minHeight={0}>
            <BarChart data={currentData} margin={{ top: 16, right: 10, left: -10, bottom: 2 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 3" vertical={false} stroke="#eef2f7" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval={mode === 'monthly' ? 1 : 0}
                tickLine={false}
                axisLine={{ stroke: '#dbe3ee' }}
              />
              <YAxis
                domain={
                  mode === 'yearly'
                    ? [0, (dataMax: number) => Math.ceil((dataMax || 1000) * 1.15)]
                    : yDomain
                }
                tick={{ fontSize: 9.5, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                width={34}
              />
              {average > 0 && (
                <ReferenceLine
                  y={Math.round(average)}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              )}
              <Tooltip
                cursor={{ fill: 'rgba(43,125,233,0.06)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as ChartPoint;
                    return (
                      <div className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 shadow-lg">
                        <div className="text-[10px] font-semibold text-[var(--ink-400)]">
                          {mode === 'monthly' ? `${data.label}일` : data.label}
                        </div>
                        <div className="num text-[13px] font-bold" style={{ color: accent }}>
                          {data.value?.toLocaleString() ?? 0}
                          <span className="text-[9.5px] font-normal text-[var(--ink-400)] ml-1">
                            백만원
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" maxBarSize={mode === 'monthly' ? 13 : 26} radius={[3, 3, 0, 0]}>
                {currentData.map((_, i) => (
                  <Cell key={i} fill={`url(#${gradientId})`} />
                ))}
                <LabelList content={renderCustomizedLabel} />
              </Bar>
            </BarChart>
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
