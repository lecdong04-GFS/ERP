'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

export type KpiTone = 'info' | 'ok' | 'warn' | 'act' | 'money';

interface KpiCardProps {
  label: string;
  value: number;
  format: (n: number) => string;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
  tone: KpiTone;
  icon: LucideIcon;
  spark?: number[];
  sparkTone?: 'info' | 'ok' | 'warn' | 'act';
  subTone?: 'default' | 'warn' | 'ok';
}

const TONE: Record<
  KpiTone,
  { edge: string; iconBg: string; iconText: string; value: string }
> = {
  info: { edge: 'bg-[#2b7de9]', iconBg: 'bg-[#eff6ff] border-[#bfdbfe]', iconText: 'text-[#2b7de9]', value: 'text-[#0f172a]' },
  ok: { edge: 'bg-[#059669]', iconBg: 'bg-[#ecfdf5] border-[#a7f3d0]', iconText: 'text-[#059669]', value: 'text-[#065f46]' },
  warn: { edge: 'bg-[#d97706]', iconBg: 'bg-[#fffbeb] border-[#fde68a]', iconText: 'text-[#d97706]', value: 'text-[#92400e]' },
  act: { edge: 'bg-[#e11d48]', iconBg: 'bg-[#fff1f2] border-[#fecdd3]', iconText: 'text-[#e11d48]', value: 'text-[#9f1239]' },
  money: { edge: 'bg-[#b45309]', iconBg: 'bg-[#fff7ed] border-[#fed7aa]', iconText: 'text-[#b45309]', value: 'text-[#7c2d12]' },
};

const SPARK: Record<string, { stroke: string; fill: string }> = {
  info: { stroke: '#2b7de9', fill: 'rgba(43,125,233,0.14)' },
  ok: { stroke: '#059669', fill: 'rgba(5,150,105,0.14)' },
  warn: { stroke: '#d97706', fill: 'rgba(217,119,6,0.14)' },
  act: { stroke: '#e11d48', fill: 'rgba(225,29,72,0.14)' },
};

/** 값을 600ms 동안 카운트업 (prefers-reduced-motion 존중) */
function useCountUp(target: number, duration = 600): number {
  const [current, setCurrent] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) {
      setCurrent(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setCurrent(from + (target - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);

  return current;
}

function Sparkline({ data, tone }: { data: number[]; tone: keyof typeof SPARK }) {
  const geo = useMemo(() => {
    if (!data || data.length < 2) return null;
    const w = 76;
    const h = 24;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const span = max - min || 1;
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => {
      const x = i * step;
      const y = h - 3 - ((v - min) / span) * (h - 6);
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area, w, h, last: pts[pts.length - 1] };
  }, [data]);

  if (!geo) return null;
  const c = SPARK[tone];
  const gid = `spark-${tone}`;

  return (
    <svg width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={c.stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={geo.area} fill={`url(#${gid})`} />
      <path d={geo.line} fill="none" stroke={c.stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={geo.last[0]} cy={geo.last[1]} r="2" fill={c.stroke} />
    </svg>
  );
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  format,
  sub,
  delta,
  deltaLabel,
  tone,
  icon: Icon,
  spark,
  sparkTone,
  subTone = 'default',
}) => {
  const t = TONE[tone];
  const animated = useCountUp(value);
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta) && delta !== 0;
  const subClass =
    subTone === 'warn'
      ? 'text-[#b45309] font-semibold'
      : subTone === 'ok'
        ? 'text-[#047857] font-semibold'
        : 'text-[var(--ink-400)]';

  return (
    <div className="erp-card erp-card-hover relative overflow-hidden pl-4 pr-3.5 py-3.5">
      <span className={`absolute left-0 top-0 bottom-0 w-[3.5px] ${t.edge}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-[var(--ink-700)] tracking-tight truncate">
            {label}
          </div>
          <div className={`num text-[28px] font-black leading-tight mt-1 tracking-tight ${t.value}`}>
            {format(animated)}
          </div>
        </div>
        <div className={`w-9.5 h-9.5 shrink-0 rounded-lg border flex items-center justify-center ${t.iconBg}`}>
          <Icon className={`w-5 h-5 ${t.iconText}`} />
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {hasDelta && (
            <span
              className={`chip num mr-1.5 text-[11.5px] font-bold ${
                delta! > 0
                  ? 'bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]'
                  : 'bg-[#fff1f2] text-[#be123c] border border-[#fecdd3]'
              }`}
            >
              {delta! > 0 ? '▲' : '▼'} {Math.abs(delta!).toFixed(1)}%
            </span>
          )}
          <span className={`text-[12px] ${subClass}`}>{deltaLabel || sub}</span>
        </div>
        {spark && spark.some((v) => v !== 0) && (
          <Sparkline data={spark} tone={sparkTone || (tone === 'money' ? 'info' : (tone as keyof typeof SPARK))} />
        )}
      </div>
    </div>
  );
};
