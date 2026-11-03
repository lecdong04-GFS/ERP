'use client';

import React, { useMemo } from 'react';
import { ArrowRight, Boxes } from 'lucide-react';
import { WarehouseStockRow } from './dashboardData';

interface WarehouseStockProps {
  rows: WarehouseStockRow[];
  total: number;
  onNavigate: (menuId: string) => void;
}

const COLORS = ['#2b7de9', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#94a3b8'];

function compactWon(n: number): string {
  if (n >= 100000000) return `₩${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `₩${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
  return `₩${Math.round(n).toLocaleString('ko-KR')}`;
}

export const WarehouseStock: React.FC<WarehouseStockProps> = ({ rows, total, onNavigate }) => {
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.amount)), [rows]);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden min-w-0">
      <header className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Boxes className="w-4.5 h-4.5 text-slate-700" />
          <h3 className="text-[15px] font-black text-slate-900 tracking-tight">창고별 재고금액</h3>
          <span className="px-2.5 py-0.5 rounded-lg text-[12.5px] font-black bg-amber-50 text-amber-900 border border-amber-300">
            합계 {compactWon(total)}
          </span>
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

      <div className="px-5 py-3.5 flex-1 flex flex-col justify-between min-h-[260px]">
        {rows.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-slate-400 gap-2 text-sm">
            <Boxes className="w-8 h-8 text-slate-400" />
            <span className="font-bold text-slate-500">재고 데이터가 없습니다</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r, i) => {
              const color = COLORS[i % COLORS.length];
              const pct = Math.max(2, Math.round((r.amount / max) * 100));
              return (
                <li key={r.warehouse}>
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-[14px] font-bold text-slate-900 truncate">
                      {r.warehouse}
                      <span className="text-[12px] font-bold text-slate-500 ml-2">
                        {r.items}품목
                      </span>
                    </span>
                    <span
                      className="font-mono text-[14.5px] font-black text-slate-900 shrink-0"
                      title={`₩${r.amount.toLocaleString('ko-KR')}`}
                    >
                      {compactWon(r.amount)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden shadow-inner">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${pct}%`, background: color }}
                    />
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
