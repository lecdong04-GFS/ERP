'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Clock, RefreshCw, ArrowRight, Zap, CheckCircle2, ShieldCheck, ExternalLink } from 'lucide-react';
import { PipelineStats } from './dashboardData';

interface PipelineHeroProps {
  pipeline: PipelineStats;
  fetchedAt: string;
  onRefresh: () => void;
  refreshing?: boolean;
  onNavigate?: (menuId: string) => void;
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

export const PipelineHero: React.FC<PipelineHeroProps> = ({
  pipeline,
  fetchedAt,
  onRefresh,
  refreshing = false,
  onNavigate,
}) => {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now ? now.getHours() : 12;

  // 실제 마감 단계 판정 (알기 쉬운 실무 마감 단계)
  let deadlineLabel = '11:00 CJ저온(마감완료)';
  let deadlineColor = 'text-emerald-300';
  if (hour < 11) {
    deadlineLabel = '🔥 11:00 CJ저온 마감 임박';
    deadlineColor = 'text-rose-300';
  } else if (hour < 12) {
    deadlineLabel = '⏰ 12:00 CJ상온 마감 집중';
    deadlineColor = 'text-amber-300';
  } else if (hour < 13) {
    deadlineLabel = '⏰ 13:00 전산 발주고 마감';
    deadlineColor = 'text-amber-200';
  } else {
    deadlineLabel = '✅ 정규 전산 발주(13시) 마감 완료';
    deadlineColor = 'text-emerald-300';
  }

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0b1329] via-[#0f1d38] to-[#0b1329] text-white shadow-lg ring-1 ring-white/10 shrink-0">
      <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(59,130,246,0.22),transparent_55%),radial-gradient(90%_120%_at_100%_0%,rgba(16,185,129,0.18),transparent_60%)] pointer-events-none" />

      <div className="relative flex flex-wrap items-center justify-between gap-y-4 px-5 py-4">
        {/* 좌측: 실시간 시계 & 공장 가동 상태 */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center shrink-0 shadow-inner">
            <span className="relative flex w-3 h-3">
              <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex w-3 h-3 rounded-full bg-emerald-400" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-[22px] sm:text-[24px] font-mono font-black tracking-tight text-white leading-none">
                {now ? formatClock(now) : '--:--:--'}
              </span>
              <span className="px-2 py-0.5 rounded text-[11.5px] font-extrabold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40">
                LIVE 관제
              </span>
            </div>
            <div className="text-[12.5px] text-slate-300 flex items-center gap-2 mt-1 font-medium">
              <span>{now ? formatDate(now) : ''}</span>
              <span>·</span>
              <span className="text-emerald-300 font-bold">영남 제1제조공장 정상 가동 중</span>
            </div>
          </div>
        </div>

        {/* 중앙: 오늘 공장 3단계 실물 플로우 (추상적인 비율 대신 명확한 실물 단계) */}
        <div className="hidden xl:flex items-center gap-4 bg-white/[0.06] border border-white/15 rounded-xl px-5 py-2.5">
          {/* 1단계: 수주 */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/30 text-blue-300 flex items-center justify-center text-[13px] font-black">
              1
            </div>
            <div>
              <span className="text-[11.5px] text-slate-300 block leading-tight font-medium">10시 완제품 수주</span>
              <span className="text-[14.5px] font-black text-white font-mono">
                {pipeline.orderQty > 0 ? `${pipeline.orderQty.toLocaleString()}개` : '수주 대기'}
              </span>
            </div>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />

          {/* 2단계: 스마트발주 */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/30 text-emerald-300 flex items-center justify-center text-[13px] font-black">
              2
            </div>
            <div>
              <span className="text-[11.5px] text-slate-300 block leading-tight font-medium">스마트발주(GFS)</span>
              <span className="text-[14.5px] font-black text-emerald-300 font-mono">
                BOM 자동소요
              </span>
            </div>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />

          {/* 3단계: 출하/배송 */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/30 text-purple-300 flex items-center justify-center text-[13px] font-black">
              3
            </div>
            <div>
              <span className="text-[11.5px] text-slate-300 block leading-tight font-medium">GS25 납품 배송</span>
              <span className="text-[14.5px] font-black text-purple-300 font-mono">
                1편(밤) · 2편(낮)
              </span>
            </div>
          </div>
        </div>

        {/* 우측: 실시간 마감 알림 & 빠른 액션 버튼들 */}
        <div className="flex items-center gap-3">
          {/* 마감 상태 배지 */}
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.08] border border-white/15 px-3.5 py-2 text-[13px] font-bold">
            <Clock className="w-4 h-4 text-amber-300 shrink-0" />
            <span className={deadlineColor}>{deadlineLabel}</span>
          </div>

          {/* 스마트발주 바로가기 하이라이트 버튼 */}
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('pur-gfs-smart-order')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-[13.5px] transition shadow-md hover:shadow-lg cursor-pointer border border-emerald-400/40"
              title="원조 엑셀뷰 및 스마트발주 관제 화면으로 즉시 이동합니다."
            >
              <Zap className="w-4 h-4 fill-current text-amber-300" />
              <span>스마트발주 열기</span>
            </button>
          )}

          {/* 데이터 새로고침 */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 px-3 py-2 text-[13px] font-bold text-slate-200 transition cursor-pointer disabled:cursor-wait"
            title="실시간 ERP 데이터 동기화 새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">동기화</span>
          </button>
        </div>
      </div>
    </section>
  );
};
