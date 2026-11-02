'use client';

import React from 'react';
import { ArrowRight, Clock3, PackageMinus, ShieldCheck } from 'lucide-react';
import { StockDayRow } from './dashboardData';

interface WatchListProps {
  stockDays: StockDayRow[];
  onNavigate: (menuId: string) => void;
}

function stockBar(days: number) {
  const pct = Math.max(4, Math.min(100, (Math.min(days, 7) / 7) * 100));
  const color = days < 1 ? 'bg-[#e11d48]' : days < 2 ? 'bg-[#d97706]' : 'bg-[#059669]';
  return { pct, color };
}

const Panel: React.FC<{
  title: string;
  hint: string;
  icon: React.ReactNode;
  onMore?: () => void;
  children: React.ReactNode;
}> = ({ title, hint, icon, onMore, children }) => (
  <section className="erp-card flex flex-col min-w-0 overflow-hidden">
    <header className="erp-panel-head">
      <div className="erp-panel-title">
        <span className="text-[var(--ink-600)]">{icon}</span>
        <h3 className="truncate">{title}</h3>
        <span className="text-[10px] text-[var(--ink-400)] truncate hidden sm:inline">{hint}</span>
      </div>
      {onMore && (
        <button
          type="button"
          onClick={onMore}
          className="flex items-center gap-0.5 text-[10.5px] font-semibold text-[var(--info)] hover:underline cursor-pointer shrink-0"
        >
          전체
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </header>
    <div className="flex-1">{children}</div>
  </section>
);

const Empty: React.FC<{ text: string; ok?: boolean }> = ({ text, ok }) => (
  <div className="erp-empty">
    {ok ? (
      <ShieldCheck className="w-5 h-5 text-[#059669]" />
    ) : (
      <Clock3 className="w-5 h-5 text-[var(--ink-400)]" />
    )}
    <span className={ok ? 'text-[#047857] font-semibold' : undefined}>{text}</span>
  </div>
);

export const WatchList: React.FC<WatchListProps> = ({ stockDays, onNavigate }) => {
  return (
    <div className="shrink-0">
      {/* 재고유지일 */}
      <Panel
        title="재고유지일 현황"
        hint="재고유지일 짧은 순"
        icon={<PackageMinus className="w-3.5 h-3.5" />}
        onMore={() => onNavigate('inv-lookup')}
      >
        {stockDays.length === 0 ? (
          <Empty text="재고유지일 데이터가 없습니다" />
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {stockDays.map((r) => {
              const bar = stockBar(r.stockDays);
              return (
                <li
                  key={`${r.code}-${r.warehouse}`}
                  className="flex items-center gap-2 px-3.5 py-1.5 hover:bg-[#f8fafc]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-semibold text-[var(--ink-900)] truncate">
                      {r.name || r.code}
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-[#eef2f7] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bar.color}`}
                        style={{ width: `${bar.pct}%` }}
                      />
                    </div>
                  </div>
                  <span
                    className={`num text-[12px] font-bold shrink-0 ${
                      r.stockDays < 1
                        ? 'text-[#be123c]'
                        : r.stockDays < 2
                          ? 'text-[#b45309]'
                          : 'text-[#047857]'
                    }`}
                  >
                    {r.stockDays.toFixed(1)}
                    <span className="text-[9.5px] font-normal text-[var(--ink-400)] ml-0.5">일</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
};
