'use client';

import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { ActionItem, ActionKind } from './dashboardData';

interface ActionQueueProps {
  items: ActionItem[];
  onNavigate: (menuId: string) => void;
}

const KIND_STYLE: Record<
  ActionKind,
  { edge: string; icon: string; iconBg: string; text: string; Icon: typeof AlertTriangle }
> = {
  act: {
    edge: 'before:bg-[#e11d48]',
    icon: 'text-[#e11d48]',
    iconBg: 'bg-[#fff1f2] border-[#fecdd3]',
    text: 'text-[#9f1239]',
    Icon: ShieldAlert,
  },
  warn: {
    edge: 'before:bg-[#d97706]',
    icon: 'text-[#d97706]',
    iconBg: 'bg-[#fffbeb] border-[#fde68a]',
    text: 'text-[#92400e]',
    Icon: AlertTriangle,
  },
  info: {
    edge: 'before:bg-[#2b7de9]',
    icon: 'text-[#2b7de9]',
    iconBg: 'bg-[#eff6ff] border-[#bfdbfe]',
    text: 'text-[#1e40af]',
    Icon: Info,
  },
};

export const ActionQueue: React.FC<ActionQueueProps> = ({ items, onNavigate }) => {
  if (items.length === 0) {
    return (
      <section className="erp-card flex items-center gap-3 px-4 py-3 shrink-0">
        <div className="w-8 h-8 rounded-md bg-[#ecfdf5] border border-[#a7f3d0] flex items-center justify-center">
          <CheckCircle2 className="w-[18px] h-[18px] text-[#059669]" />
        </div>
        <div>
          <div className="text-[12.5px] font-bold text-[#065f46]">지금 조치할 항목이 없습니다</div>
          <div className="text-[11px] text-[var(--ink-400)]">
            유통기한·안전재고·미출·변경요청 모두 정상입니다.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="shrink-0">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <h2 className="text-[11.5px] font-bold text-[var(--ink-600)] tracking-tight">
          지금 조치할 일
        </h2>
        <span className="text-[10.5px] text-[var(--ink-400)]">클릭하면 해당 업무로 이동</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        {items.map((item) => {
          const s = KIND_STYLE[item.kind];
          const Icon = s.Icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.menuId)}
              className={`erp-card erp-card-hover relative overflow-hidden text-left pl-3 pr-2.5 py-2.5 flex items-center gap-2.5 cursor-pointer before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${s.edge}`}
            >
              <div
                className={`w-8 h-8 shrink-0 rounded-md border flex items-center justify-center ${s.iconBg}`}
              >
                <Icon className={`w-4 h-4 ${s.icon}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-semibold text-[var(--ink-600)] truncate">
                  {item.label}
                </div>
                <div className={`num text-[17px] font-black leading-tight ${s.text}`}>
                  {item.count.toLocaleString()}
                  <span className="text-[10px] font-semibold ml-0.5 text-[var(--ink-400)]">
                    {item.unit}
                  </span>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--ink-400)] shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
};
