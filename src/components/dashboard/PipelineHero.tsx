'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Clock, RefreshCw, ArrowRight } from 'lucide-react';
import { PipelineStats } from './dashboardData';

interface PipelineHeroProps {
  pipeline: PipelineStats;
  fetchedAt: string;
  onRefresh: () => void;
  refreshing?: boolean;
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

function minutesUntil(cutoff: string | null, now: Date): number | null {
  if (!cutoff) return null;
  const [hh, mm] = cutoff.split(':').map(Number);
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 60000);
  return diff >= 0 ? diff : diff + 1440;
}

export const PipelineHero: React.FC<PipelineHeroProps> = ({
  pipeline,
  fetchedAt,
  onRefresh,
  refreshing = false,
}) => {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = now ? minutesUntil(pipeline.cutoffAt, now) : null;
  const prodPct = Math.max(0, Math.min(100, pipeline.prodPct));
  const prodRatio = pipeline.prodTarget > 0 ? pipeline.prodDone / pipeline.prodTarget : 0;

  return (
    <section className="relative overflow-hidden rounded-[10px] bg-[#111a2b] text-white shadow-[0_6px_18px_rgba(15,23,42,0.18)] ring-1 ring-white/10 shrink-0">
      <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(43,125,233,0.28),transparent_55%),radial-gradient(90%_120%_at_100%_0%,rgba(16,185,129,0.16),transparent_60%)]" />
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        {/* 시계 */}
        <div className="flex items-center gap-3 min-w-[190px]">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
          </span>
          <div className="leading-none">
            <div className="mono text-[19px] font-bold tracking-tight text-white">
              {now ? formatClock(now) : '--:--:--'}
            </div>
            <div className="text-[10.5px] text-slate-400 mt-1">{now ? formatDate(now) : ''}</div>
          </div>
        </div>

        <div className="hidden sm:block w-px self-stretch bg-white/10" />

        {/* 파이프라인 */}
        <div className="flex-1 min-w-[300px] max-w-[640px] flex items-center gap-3">
          <div className="flex flex-col min-w-[72px] whitespace-nowrap">
            <span className="text-[10.5px] text-slate-400">금일 수주</span>
            <span className="num text-[15px] font-bold text-white">
              {pipeline.orderQty.toLocaleString()}
              <span className="text-[10.5px] font-normal text-slate-400 ml-1">ea</span>
            </span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <div className="flex-1 min-w-[130px]">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10.5px] text-slate-400">생산 진척</span>
              <span className="num text-[13px] font-bold text-emerald-300">{prodPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-700"
                style={{ width: `${prodPct}%` }}
              />
            </div>
            <div className="mt-1 text-[10px] text-slate-500 num">
              {pipeline.prodDone.toLocaleString()} / {pipeline.prodTarget.toLocaleString()} ea
              {pipeline.prodTarget > 0 && ` · ${Math.round(prodRatio * 1000) / 10}%`}
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <div className="flex flex-col min-w-[64px] whitespace-nowrap">
            <span className="text-[10.5px] text-slate-400">출하 대기</span>
            <span className="num text-[15px] font-bold text-white">
              {pipeline.undeliveredCount}
              <span className="text-[10.5px] font-normal text-slate-400 ml-1">건</span>
            </span>
          </div>
        </div>

        {/* 마감 카운트다운 */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-2 rounded-md bg-white/[0.06] border border-white/10 px-2.5 py-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-[10.5px] text-slate-400">
              {pipeline.cutoffAt ? `${pipeline.cutoffAt} 마감` : '마감 없음'}
            </span>
            <span className="num text-[13px] font-bold text-amber-200">
              {remaining !== null ? `${remaining}분` : '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 px-2.5 py-2 text-[11px] font-semibold text-slate-200 transition-colors cursor-pointer disabled:cursor-wait"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden lg:inline">
              {fetchedAt
                ? new Date(fetchedAt).toLocaleTimeString('ko-KR', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'LIVE'}
            </span>
            <Activity className="w-3.5 h-3.5 text-emerald-400 lg:hidden" />
          </button>
        </div>
      </div>
    </section>
  );
};
