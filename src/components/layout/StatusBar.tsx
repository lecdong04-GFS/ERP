'use client';

import React from 'react';
import { useTabs, DASHBOARD_TAB_ID } from '@/context/TabContext';
import { Activity, Database, CheckCircle2 } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const { activeTab } = useTabs();
  const isDashboard = activeTab.id === DASHBOARD_TAB_ID;

  return (
    <footer className="h-[28px] bg-white border-t border-[var(--line)] px-3 flex items-center justify-between text-[11.5px] text-[var(--ink-600)] select-none font-sans shrink-0">
      {/* Left status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[var(--ink-900)]">상태</span>
          <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            정상
          </span>
        </div>
        <span className="text-[var(--line-strong)]">|</span>
        <div className="flex items-center gap-1.5 text-[var(--ink-600)]">
          <Database className="w-3.5 h-3.5 text-[#2b7de9]" />
          <span>PostgreSQL (gfs_erp) 연결됨</span>
        </div>
      </div>

      {/* Center active screen info */}
      <div className="hidden md:flex items-center gap-2 text-[var(--ink-600)] font-medium">
        <span className="text-[var(--ink-400)]">화면:</span>
        <span className="text-[var(--ink-900)] font-semibold">
          {isDashboard ? '통합 대시보드' : `${activeTab.categoryName} > ${activeTab.title}`}
        </span>
      </div>

      {/* Right system flags */}
      <div className="flex items-center gap-2.5 font-mono text-[11px] text-[var(--ink-600)]">
        <span className="hidden sm:inline-block text-[var(--ink-600)] font-sans">사업장: (주)GFS 거창식품공장</span>
        <span className="text-[var(--line-strong)]">|</span>
        <span className="px-1.5 py-0.2 bg-gray-200 border border-gray-300 text-gray-700 rounded-2xs">CAPS</span>
        <span className="px-1.5 py-0.2 bg-blue-100 border border-blue-300 text-blue-800 font-bold rounded-2xs">NUM</span>
        <span className="px-1.5 py-0.2 bg-gray-200 border border-gray-300 text-gray-700 rounded-2xs">SCRL</span>
      </div>
    </footer>
  );
};

