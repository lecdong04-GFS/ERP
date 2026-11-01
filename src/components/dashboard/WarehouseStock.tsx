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
    <section className="erp-card flex flex-col overflow-hidden min-w-0">
      <header className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--line)] bg-[#fbfcfe]">
        <div className="flex items-center gap-2 min-w-0">
          <Boxes className="w-3.5 h-3.5 text-[var(--ink-600)]" />
          <h3 className="text-[12px] font-bold text-[var(--ink-900)]">창고별 재고금액</h3>
          <span className="chip bg-[#fff7ed] text-[#b45309] border border-[#fed7aa] num">
            합계 {compactWon(total)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('inv-lookup')}
          className="flex items-center gap-0.5 text-[10.5px] font-semibold text-[var(--info)] hover:underline cursor-pointer shrink-0"
        >
          재고조회
          <ArrowRight className="w-3 h-3" />
        </button>
      </header>

      <div className="px-3.5 py-2 flex-1 flex flex-col justify-center">
        {rows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-5 text-center">
            <Boxes className="w-5 h-5 text-[var(--ink-400)]" />
            <span className="text-[11px] text-[var(--ink-400)]">재고 데이터가 없습니다</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const color = COLORS[i % COLORS.length];
              const pct = Math.max(2, Math.round((r.amount / max) * 100));
              return (
                <li key={r.warehouse}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[11.5px] font-semibold text-[var(--ink-900)] truncate">
                      {r.warehouse}
                      <span className="text-[10px] font-normal text-[var(--ink-400)] ml-1.5">
                        {r.items}품목
                      </span>
                    </span>
                    <span
                      className="num text-[11.5px] font-bold text-[var(--ink-700)] shrink-0"
                      title={`₩${r.amount.toLocaleString('ko-KR')}`}
                    >
                      {compactWon(r.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#eef2f7] overflow-hidden">
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
