'use client';

import React from 'react';
import { useTabs, DASHBOARD_TAB_ID } from '@/context/TabContext';
import { LayoutDashboard, X, XSquare, Layers } from 'lucide-react';

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTabId, closeTab, closeAllTabs } = useTabs();

  return (
    <div className="h-[34px] bg-[#eef2f7] border-b border-[var(--line)] flex items-end justify-between px-2 text-xs select-none">
      {/* Scrollable Tab List */}
      <div className="flex items-end space-x-1.5 overflow-x-auto flex-1 min-w-0 pr-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isDashboard = tab.id === DASHBOARD_TAB_ID;

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group relative flex items-center gap-2 px-3 py-1.5 text-[12px] cursor-pointer transition-colors whitespace-nowrap min-w-[104px] max-w-[220px] rounded-t-md ${
                isActive
                  ? 'bg-white text-[var(--ink-900)] font-bold border-t-[2px] border-t-[#2b7de9] shadow-sm z-10 -mb-px pb-2'
                  : 'bg-transparent text-[var(--ink-600)] hover:bg-white/70 font-medium'
              }`}
            >
              {isDashboard ? (
                <LayoutDashboard className="w-4 h-4 text-[#2563eb] shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-[#2563eb] shrink-0 opacity-70 group-hover:opacity-100" />
              )}

              <span className="truncate flex-1" title={tab.title}>
                {tab.title}
              </span>

              {tab.isClosable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="p-0.5 ml-1 text-gray-400 hover:text-rose-600 hover:bg-gray-200 rounded transition-colors shrink-0 cursor-pointer"
                  title="탭 닫기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Right End: [창 모두 닫기] Button */}
      <div className="flex items-center gap-1 shrink-0 pb-1.5 pl-2 border-l border-[var(--line)]">
        <button
          type="button"
          onClick={closeAllTabs}
          disabled={tabs.length <= 1}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] border rounded-xs font-semibold transition-colors shadow-2xs cursor-pointer ${
            tabs.length <= 1
              ? 'bg-[#f1f5f9] text-[var(--ink-400)] border-[var(--line)] cursor-not-allowed opacity-60'
              : 'bg-white text-[var(--ink-700)] border-[var(--line)] hover:bg-[#fff1f2] hover:text-[#be123c] hover:border-[#fecdd3]'
          }`}
          title="대시보드를 제외한 모든 탭 닫기"
        >
          <XSquare className="w-4 h-4 text-rose-600" />
          <span>창 모두 닫기</span>
        </button>
      </div>
    </div>
  );
};

