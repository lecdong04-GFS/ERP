'use client';

import React, { useMemo } from 'react';
import { ArrowRight, Boxes, PackageSearch } from 'lucide-react';
import { WarehouseStockRow } from './dashboardData';

interface WarehouseStockProps {
  rows: WarehouseStockRow[];
  total: number;
  onNavigate: (menuId: string) => void;
}

const COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'];

function compactWon(n: number): string {
  if (n >= 100000000) return `₩${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `₩${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
  return `₩${Math.round(n).toLocaleString('ko-KR')}`;
}

export const WarehouseStock: React.FC<WarehouseStockProps> = ({ rows, total, onNavigate }) => {
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.amount)), [rows]);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden min-w-0">
      {/* Panel Header (Height matched to h-[62px]) */}
      <header className="h-[62px] px-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-xs">
            <Boxes className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-[14.5px] font-black text-slate-800 tracking-tight">창고별 재고금액</h3>
            <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-black bg-amber-100 text-amber-800 border border-amber-300">
              합계 {compactWon(total)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('inv-lookup')}
          className="flex items-center gap-1 text-[12.5px] font-extrabold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer shrink-0"
        >
          <span>재고조회</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Content List with Breathing Room & Hover-only Smooth Scrollbar */}
      <div className="flex-1 min-h-[280px] max-h-[320px] overflow-y-auto hover-scrollbar p-3.5 space-y-2">
        {rows.length === 0 ? (
          <div className="h-52 flex flex-col items-center justify-center text-slate-400 gap-2.5 text-sm">
            <PackageSearch className="w-9 h-9 text-slate-400" />
            <span className="text-slate-600 font-extrabold text-[15px]">창고별 재고 데이터가 없습니다</span>
            <span className="text-xs text-slate-400">입고 등록 후 창고별 실보유 금액이 자동 집계됩니다.</span>
          </div>
        ) : (
          rows.map((r, i) => {
            const color = COLORS[i % COLORS.length];
            const pct = Math.max(5, Math.round((r.amount / max) * 100));
            const sharePct = total > 0 ? ((r.amount / total) * 100).toFixed(1) : '0.0';

            return (
              <div
                key={r.warehouse}
                className="group/item flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/90 border border-slate-200/60 hover:border-slate-300 transition-all shadow-xs"
              >
                {/* Warehouse Badge */}
                <span className="text-[11px] px-2 py-0.5 rounded-md font-black shrink-0 bg-blue-50 text-blue-700 border border-blue-200">
                  {r.warehouse.slice(0, 4)}
                </span>

                {/* Middle: Warehouse Title, Items count, and Gauge Bar */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[13.5px] font-black text-slate-900 truncate">
                      {r.warehouse}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 font-mono">
                      {r.items}개 품목 보관
                    </span>
                  </div>

                  {/* Visual Progress Bar (그래프) */}
                  <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden shadow-inner">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>

                {/* Right: Amount & Share % */}
                <div className="text-right shrink-0 min-w-[85px]">
                  <span
                    className="font-mono text-[14.5px] font-black text-slate-900"
                    title={`₩${r.amount.toLocaleString('ko-KR')}`}
                  >
                    {compactWon(r.amount)}
                  </span>
                  <div className="text-[11px] font-extrabold text-slate-500 mt-0.5 flex items-center justify-end gap-1">
                    <span>비중 {sharePct}%</span>
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
