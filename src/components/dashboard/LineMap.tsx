'use client';

import React, { useMemo } from 'react';
import { ArrowRight, Factory } from 'lucide-react';
import { LineRow } from './dashboardData';

interface LineMapProps {
  lines: LineRow[];
  onNavigate: (menuId: string) => void;
}

const STATUS_STYLE: Record<LineRow['status'], string> = {
  가동: 'bg-[#059669] hover:bg-[#047857]',
  대기: 'bg-[#cbd5e1] hover:bg-[#94a3b8]',
  이상: 'bg-[#e11d48] hover:bg-[#be123c]',
};

export const LineMap: React.FC<LineMapProps> = ({ lines, onNavigate }) => {
  const counts = useMemo(() => {
    const c = { 가동: 0, 대기: 0, 이상: 0 };
    lines.forEach((l) => (c[l.status] += 1));
    return c;
  }, [lines]);

  const abnormal = useMemo(() => lines.filter((l) => l.status === '이상'), [lines]);

  return (
    <section className="erp-card flex flex-col overflow-hidden min-w-0">
      <header className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--line)] bg-[#fbfcfe]">
        <div className="flex items-center gap-2">
          <Factory className="w-3.5 h-3.5 text-[var(--ink-600)]" />
          <h3 className="text-[12px] font-bold text-[var(--ink-900)]">계 가동 현황</h3>
          <span className="num text-[10px] text-[var(--ink-400)]">{lines.length}계</span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('prod-work-order-status')}
          className="flex items-center gap-0.5 text-[10.5px] font-semibold text-[var(--info)] hover:underline cursor-pointer"
        >
          작업지시
          <ArrowRight className="w-3 h-3" />
        </button>
      </header>

      <div className="px-3.5 py-2.5 flex-1 flex flex-col gap-2 justify-center">
        {lines.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-4 text-[11px] text-[var(--ink-400)]">
            계 마스터 데이터가 없습니다
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center gap-2">
            <div
              className="grid gap-[4px]"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(15px, 1fr))' }}
            >
              {lines.map((l) => (
                <span
                  key={l.gyeId}
                  title={`${l.name} · ${l.status}`}
                  className={`h-[15px] rounded-[3px] cursor-default transition-colors ${STATUS_STYLE[l.status]}`}
                />
              ))}
            </div>
            {abnormal.length > 0 ? (
              <div className="flex items-start gap-1.5 rounded-md bg-[#fff1f2] border border-[#fecdd3] px-2 py-1.5">
                <span className="mt-[3px] w-1.5 h-1.5 rounded-full bg-[#e11d48] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-[#9f1239]">
                    이상 {abnormal.length}계 — 확인 필요
                  </div>
                  <div className="text-[10px] text-[#be123c] truncate">
                    {abnormal.map((l) => l.name).join(', ')}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-md bg-[#ecfdf5] border border-[#a7f3d0] px-2 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                <span className="text-[10px] font-semibold text-[#047857]">
                  모든 계가 정상 범위입니다
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--ink-600)]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-[2px] bg-[#059669]" />
            가동 <b className="num text-[var(--ink-900)]">{counts.가동}</b>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-[2px] bg-[#cbd5e1]" />
            대기 <b className="num text-[var(--ink-900)]">{counts.대기}</b>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-[2px] bg-[#e11d48]" />
            이상 <b className="num text-[var(--ink-900)]">{counts.이상}</b>
          </span>
        </div>
      </div>
    </section>
  );
};
