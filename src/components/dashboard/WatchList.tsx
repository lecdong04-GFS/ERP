'use client';

import React from 'react';
import { ArrowRight, Clock3, PackageMinus, ShieldCheck, Timer } from 'lucide-react';
import { FefoRow, StockDayRow } from './dashboardData';

interface WatchListProps {
  fefo: FefoRow[];
  stockDays: StockDayRow[];
  onNavigate: (menuId: string) => void;
}

function dayChip(days: number) {
  if (days < 0) return { cls: 'bg-[#fff1f2] text-[#be123c] border-[#fecdd3]', text: `만료 ${Math.abs(days)}일` };
  if (days === 0) return { cls: 'bg-[#fff1f2] text-[#be123c] border-[#fecdd3]', text: 'D-DAY' };
  if (days <= 3) return { cls: 'bg-[#fff1f2] text-[#be123c] border-[#fecdd3]', text: `D-${days}` };
  if (days <= 7) return { cls: 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]', text: `D-${days}` };
  return { cls: 'bg-[#f8fafc] text-[var(--ink-600)] border-[var(--line)]', text: `D-${days}` };
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
    <header className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--line)] bg-[#fbfcfe]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[var(--ink-600)]">{icon}</span>
        <h3 className="text-[12px] font-bold text-[var(--ink-900)] truncate">{title}</h3>
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
  <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
    {ok ? (
      <ShieldCheck className="w-5 h-5 text-[#059669]" />
    ) : (
      <Clock3 className="w-5 h-5 text-[var(--ink-400)]" />
    )}
    <span className={`text-[11px] ${ok ? 'text-[#047857] font-semibold' : 'text-[var(--ink-400)]'}`}>
      {text}
    </span>
  </div>
);

export const WatchList: React.FC<WatchListProps> = ({ fefo, stockDays, onNavigate }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 shrink-0">
      {/* FEFO */}
      <Panel
        title="유통기한 임박 (FEFO)"
        hint="선입선출 우선 출고"
        icon={<Timer className="w-3.5 h-3.5" />}
        onMore={() => onNavigate('inv-expiry-discard-mgmt')}
      >
        {fefo.length === 0 ? (
          <Empty ok text="D-7 이내 임박 재고가 없습니다" />
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {fefo.map((r) => {
              const chip = dayChip(r.daysLeft);
              return (
                <li
                  key={`${r.code}｜${r.warehouse}`}
                  className="flex items-center gap-2 px-3.5 py-1.5 hover:bg-[#f8fafc]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-semibold text-[var(--ink-900)] truncate">
                      {r.name || r.code}
                    </div>
                    <div className="text-[10px] text-[var(--ink-400)] truncate">
                      [{r.warehouse || '창고미지정'}] {r.code}
                    </div>
                  </div>
                  <span className="num text-[11px] text-[var(--ink-600)] shrink-0">
                    {r.qty.toLocaleString()}
                    <span className="text-[9.5px] text-[var(--ink-400)] ml-0.5">{r.unit || 'ea'}</span>
                  </span>
                  <span className={`chip border shrink-0 ${chip.cls}`}>{chip.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* 재고 유지일 */}
      <Panel
        title="재고 바닥 임박"
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
