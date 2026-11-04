'use client';

import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, AlertTriangle, CalendarClock } from 'lucide-react';
import { StockDayRow, FefoRow } from './dashboardData';

interface WatchListProps {
  stockDays: StockDayRow[];
  fefoTop?: FefoRow[];
  onNavigate: (menuId: string) => void;
}

function stockBar(days: number) {
  const pct = Math.max(8, Math.min(100, (Math.min(days, 5) / 5) * 100));
  const color =
    days < 1
      ? 'bg-rose-500'
      : days < 2
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  return { pct, color };
}

function fefoBar(daysLeft: number) {
  if (daysLeft <= 0) return { pct: 100, color: 'bg-rose-600 animate-pulse' };
  if (daysLeft === 1) return { pct: 75, color: 'bg-rose-500' };
  if (daysLeft === 2) return { pct: 50, color: 'bg-amber-500' };
  return { pct: 25, color: 'bg-emerald-500' };
}

export const WatchList: React.FC<WatchListProps> = ({ stockDays = [], fefoTop = [], onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'stock' | 'fefo'>('stock');

  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col min-w-0 overflow-hidden">
      {/* Panel Header & Tab Switcher */}
      <header className="px-4 py-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl border border-slate-300/70">
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'stock'
                ? 'bg-white text-rose-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>재고 소진 임박 (D-1.5)</span>
            {stockDays.length > 0 && (
              <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 font-black">
                {stockDays.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fefo')}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'fefo'
                ? 'bg-white text-amber-800 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>유통기한 FEFO (D-3)</span>
            {fefoTop.length > 0 && (
              <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-black">
                {fefoTop.length}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('inv-lookup')}
          className="flex items-center gap-1 text-[12.5px] font-extrabold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer shrink-0"
        >
          <span>실사재고 조회</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Content List with Breathing Room & Hover-only Smooth Scrollbar */}
      <div className="flex-1 min-h-[280px] max-h-[320px] overflow-y-auto hover-scrollbar p-3.5 space-y-2">
        {activeTab === 'stock' ? (
          stockDays.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center text-slate-400 gap-2.5 text-sm">
              <ShieldCheck className="w-9 h-9 text-emerald-500" />
              <span className="text-emerald-700 font-extrabold text-[15px]">현재 긴급 소진 위험 품목 없음 (안정 유지)</span>
              <span className="text-xs text-slate-400">모든 원부자재가 안전 재고 일수 이상 확보되어 있습니다.</span>
            </div>
          ) : (
            stockDays.map((r) => {
              const bar = stockBar(r.stockDays);
              const isUrgent = r.stockDays < 1.0;
              return (
                <div
                  key={`${r.code}-${r.warehouse}`}
                  className="group/item flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/90 border border-slate-200/60 hover:border-slate-300 transition-all shadow-xs"
                >
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-md font-black shrink-0 ${
                      isUrgent
                        ? 'bg-rose-100 text-rose-700 border border-rose-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {r.warehouse || '공장'}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[13.5px] font-black text-slate-900 truncate">
                        {r.name || r.code}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 font-mono hidden sm:inline">
                        {r.code}
                      </span>
                    </div>
                    {/* Visual Progress Bar (그래프) */}
                    <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden shadow-inner">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${bar.color}`}
                        style={{ width: `${bar.pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-right shrink-0 min-w-[85px]">
                    <span
                      className={`font-mono text-[14.5px] font-black ${
                        isUrgent ? 'text-rose-600' : 'text-amber-700'
                      }`}
                    >
                      {r.stockDays.toFixed(1)}
                      <span className="text-[11px] font-bold text-slate-500 ml-1">일분 잔여</span>
                    </span>
                    <div className="text-[11px] font-extrabold mt-0.5 flex items-center justify-end gap-1">
                      {isUrgent ? (
                        <span className="text-rose-600 font-black">🚨 긴급발주</span>
                      ) : (
                        <span className="text-amber-700 font-bold">⚠️ 수급점검</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )
        ) : fefoTop.length === 0 ? (
          <div className="h-52 flex flex-col items-center justify-center text-slate-400 gap-2.5 text-sm">
            <ShieldCheck className="w-9 h-9 text-emerald-500" />
            <span className="text-emerald-700 font-extrabold text-[15px]">D-3 이내 유통기한 임박 품목 없음 (정상 관리)</span>
            <span className="text-xs text-slate-400">선입선출(FEFO) 기준 위험 일자에 도달한 자재가 없습니다.</span>
          </div>
        ) : (
          fefoTop.map((r, i) => {
            const fbar = fefoBar(r.daysLeft);
            const isToday = r.daysLeft <= 0;
            return (
              <div
                key={`${r.code}-${r.warehouse}-${i}`}
                className="group/item flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/90 border border-slate-200/60 hover:border-slate-300 transition-all shadow-xs"
              >
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-md font-black shrink-0 ${
                    isToday
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {isToday ? 'D-Day' : `D-${r.daysLeft}`}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[13.5px] font-black text-slate-900 truncate">
                      {r.name || r.code}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
                      보관: <b className="text-slate-700">{r.warehouse || '냉장고'}</b>
                    </span>
                  </div>
                  {/* FEFO Urgency Gauge Bar (그래프) */}
                  <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${fbar.color}`}
                      style={{ width: `${fbar.pct}%` }}
                    />
                  </div>
                </div>

                <div className="text-right shrink-0 min-w-[85px]">
                  <span className="font-mono text-[14.5px] font-black text-slate-900">
                    {r.qty.toLocaleString()}
                    <span className="text-[11px] font-bold text-slate-500 ml-1">{r.unit || '개'}</span>
                  </span>
                  <div className="text-[11px] font-extrabold mt-0.5 flex items-center justify-end gap-1">
                    {isToday ? (
                      <span className="text-rose-600 font-black">🚨 당일 우선소진</span>
                    ) : (
                      <span className="text-amber-700 font-bold">선출고 1순위</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
