'use client';

import React, { useState } from 'react';
import { ArrowRight, Clock3, PackageMinus, ShieldCheck, AlertTriangle, CalendarClock, ChevronRight } from 'lucide-react';
import { StockDayRow, FefoRow } from './dashboardData';

interface WatchListProps {
  stockDays: StockDayRow[];
  fefoTop?: FefoRow[];
  onNavigate: (menuId: string) => void;
}

function stockBar(days: number) {
  const pct = Math.max(5, Math.min(100, (Math.min(days, 5) / 5) * 100));
  const color =
    days < 1
      ? 'bg-rose-500'
      : days < 2
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  return { pct, color };
}

export const WatchList: React.FC<WatchListProps> = ({ stockDays = [], fefoTop = [], onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'stock' | 'fefo'>('stock');

  return (
    <section className="bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col min-w-0 overflow-hidden">
      {/* Panel Header & Tab Switcher */}
      <header className="px-3.5 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 bg-slate-200/70 p-0.5 rounded-lg border border-slate-300/60">
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`px-3 py-1 rounded-md text-[11.5px] font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'stock'
                ? 'bg-white text-rose-700 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>재고 소진 임박 (D-1.5 미달)</span>
            {stockDays.length > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 font-bold">
                {stockDays.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fefo')}
            className={`px-3 py-1 rounded-md text-[11.5px] font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'fefo'
                ? 'bg-white text-amber-700 shadow-2xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
            <span>유통기한 FEFO 선출고 (D-3 이내)</span>
            {fefoTop.length > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-700 font-bold">
                {fefoTop.length}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('inv-lookup')}
          className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer shrink-0"
        >
          <span>실사 재고 전체조회</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Content List */}
      <div className="flex-1 min-h-[160px] max-h-[220px] overflow-y-auto">
        {activeTab === 'stock' ? (
          stockDays.length === 0 ? (
            <div className="h-36 flex flex-col items-center justify-center text-slate-400 gap-2 text-xs">
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
              <span className="text-emerald-700 font-bold">현재 긴급 소진 위험 품목 없음 (안정 유지)</span>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stockDays.map((r) => {
                const bar = stockBar(r.stockDays);
                const isUrgent = r.stockDays < 1.0;
                return (
                  <li
                    key={`${r.code}-${r.warehouse}`}
                    className="flex items-center gap-3 px-3.5 py-2 hover:bg-slate-50/80 transition"
                  >
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                        isUrgent
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {r.warehouse || '공장'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-slate-900 truncate">
                        {r.name || r.code}
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${bar.color}`}
                          style={{ width: `${bar.pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono text-[13px] font-black ${
                          isUrgent ? 'text-rose-600' : 'text-amber-600'
                        }`}
                      >
                        {r.stockDays.toFixed(1)}
                        <span className="text-[10px] font-medium text-slate-400 ml-0.5">일분 잔여</span>
                      </span>
                      <div className="text-[10px] text-slate-400">
                        {isUrgent ? '🚨 긴급 발주 요망' : '⚠️ 수급 점검'}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : fefoTop.length === 0 ? (
          <div className="h-36 flex flex-col items-center justify-center text-slate-400 gap-2 text-xs">
            <ShieldCheck className="w-6 h-6 text-emerald-500" />
            <span className="text-emerald-700 font-bold">D-3 이내 유통기한 임박 품목 없음 (정상 관리)</span>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {fefoTop.map((r, i) => {
              const isToday = r.daysLeft <= 0;
              return (
                <li
                  key={`${r.code}-${r.warehouse}-${i}`}
                  className="flex items-center gap-3 px-3.5 py-2 hover:bg-slate-50/80 transition"
                >
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                      isToday
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {isToday ? 'D-Day' : `D-${r.daysLeft}`}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold text-slate-900 truncate">
                      {r.name || r.code}
                    </div>
                    <div className="text-[10.5px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span>보관: {r.warehouse || '냉장고'}</span>
                      <span>·</span>
                      <span className="text-slate-700 font-medium">선입선출 우선 투입</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-[13px] font-black text-slate-900">
                      {r.qty.toLocaleString()}
                      <span className="text-[10px] font-normal text-slate-500 ml-0.5">{r.unit || '개'}</span>
                    </span>
                    <div className="text-[10px] text-amber-700 font-semibold">
                      {isToday ? '오늘 즉시 소진' : '출고 우선순위 1'}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
