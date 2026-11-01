'use client';

import React from 'react';
import { ArrowRight, Activity } from 'lucide-react';
import { ProductionWorkStats } from './dashboardData';

interface ProductionProgressProps {
  work: ProductionWorkStats;
  onNavigate: (menuId: string) => void;
}

const STATUS: Record<
  string,
  { bar: string; text: string; chip: string; dot: string }
> = {
  완료: {
    bar: 'bg-[#059669]',
    text: 'text-[#047857]',
    chip: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
    dot: 'bg-[#059669]',
  },
  진행중: {
    bar: 'bg-[#d97706]',
    text: 'text-[#b45309]',
    chip: 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]',
    dot: 'bg-[#d97706]',
  },
  대기: {
    bar: 'bg-[#94a3b8]',
    text: 'text-[var(--ink-600)]',
    chip: 'bg-[#f8fafc] text-[var(--ink-600)] border-[var(--line)]',
    dot: 'bg-[#94a3b8]',
  },
};

export const ProductionProgress: React.FC<ProductionProgressProps> = ({ work, onNavigate }) => {
  const total = work.doneLines + work.activeLines + work.waitingLines;

  return (
    <section className="erp-card overflow-hidden shrink-0">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--line)] bg-[#fbfcfe]">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-3.5 h-3.5 text-[var(--ink-600)]" />
          <h3 className="text-[12px] font-bold text-[var(--ink-900)]">계별 생산 진척</h3>
          <span className="chip bg-[#f8fafc] text-[var(--ink-600)] border border-[var(--line)] num">
            {total}계
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip border ${STATUS['완료'].chip}`}>완료 {work.doneLines}</span>
          <span className={`chip border ${STATUS['진행중'].chip}`}>진행중 {work.activeLines}</span>
          <span className={`chip border ${STATUS['대기'].chip}`}>대기 {work.waitingLines}</span>
          <span className="chip bg-[#f8fafc] text-[var(--ink-600)] border border-[var(--line)] num">
            불량 {work.defectRate.toFixed(1)}%
          </span>
          <button
            type="button"
            onClick={() => onNavigate('prod-work-order-status')}
            className="flex items-center gap-0.5 text-[10.5px] font-semibold text-[var(--info)] hover:underline cursor-pointer"
          >
            작업지시
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </header>

      <div className="px-3.5 py-2.5">
        {work.lines.length === 0 ? (
          <div className="py-3 text-center text-[11px] text-[var(--ink-400)]">
            금일 작업지시가 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-1.5">
            {work.lines.map((line) => {
              const s = STATUS[line.status] || STATUS['대기'];
              return (
                <button
                  key={line.gyeId}
                  type="button"
                  onClick={() => onNavigate('prod-work-order-status')}
                  className="text-left rounded-md border border-[var(--line)] bg-white px-2 py-1.5 hover:bg-[#f8fafc] transition-colors cursor-pointer min-w-0"
                  title={`${line.name} · ${line.status} · ${line.prodQty}/${line.orderQty}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10.5px] font-semibold text-[var(--ink-900)] truncate">
                      {line.name}
                    </span>
                    <span className={`num text-[11px] font-bold ${s.text}`}>{line.pct}%</span>
                  </div>
                  <div className="mt-1 h-[3px] rounded-full bg-[#eef2f7] overflow-hidden">
                    <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${line.pct}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="num text-[9.5px] text-[var(--ink-400)] truncate">
                      {Math.round(line.prodQty).toLocaleString()} / {Math.round(line.orderQty).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      <span className={`text-[9.5px] font-semibold ${s.text}`}>{line.status}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
