'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MENU_CATEGORIES, getMenuItemById } from '@/config/menuConfig';
import { useTabs } from '@/context/TabContext';
import { MenuItem } from '@/types/erp';
import {
  PanelLeft,
  ShoppingBag,
  ClipboardCheck,
  ShoppingCart,
  PackageCheck,
  Printer,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface TopMenuBarProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

// 사장님 핵심 5대 데일리 퀵메뉴 (수주 ➔ 재고 ➔ 발주 ➔ 제품/BOM ➔ 출력)
const QUICK_WORKFLOW_ITEMS = [
  {
    step: '1',
    id: 'sales-order-upload',
    title: '수주등록 (GS)',
    icon: ShoppingBag,
    btnClass:
      'bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-600 hover:text-white hover:border-blue-700',
    badgeClass: 'bg-blue-600 text-white',
    iconColor: 'text-blue-600 group-hover:text-white',
  },
  {
    step: '2',
    id: 'inv-lookup',
    title: '재고조회 (5시 실사)',
    icon: ClipboardCheck,
    btnClass:
      'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-700',
    badgeClass: 'bg-emerald-600 text-white',
    iconColor: 'text-emerald-600 group-hover:text-white',
  },
  {
    step: '3',
    id: 'pur-mat-order-day',
    title: '자재발주 (요일별)',
    icon: ShoppingCart,
    btnClass:
      'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-600 hover:text-white hover:border-amber-700 ring-1 ring-amber-300/40',
    badgeClass: 'bg-amber-600 text-white',
    iconColor: 'text-amber-600 group-hover:text-white',
  },
  {
    step: '4',
    id: 'master-product-reg',
    title: '제품등록 (BOM)',
    icon: PackageCheck,
    btnClass:
      'bg-indigo-50 text-indigo-950 border-indigo-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-700',
    badgeClass: 'bg-indigo-600 text-white',
    iconColor: 'text-indigo-600 group-hover:text-white',
  },
  {
    step: '5',
    id: 'pur-order-print',
    title: '발주서출력',
    icon: Printer,
    btnClass:
      'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-800',
    badgeClass: 'bg-slate-700 text-white',
    iconColor: 'text-slate-600 group-hover:text-white',
  },
];

export const TopMenuBar: React.FC<TopMenuBarProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const { openTab } = useTabs();
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (item: MenuItem) => {
    openTab(item);
    setOpenDropdownId(null);
  };

  const handleDropdownHover = (catId: string) => {
    if (openDropdownId !== null) {
      setOpenDropdownId(catId);
    }
  };

  return (
    <div
      ref={barRef}
      className="h-[38px] bg-white border-b border-[#cbd5e1] flex items-center justify-between px-2 text-xs select-none relative z-50 overflow-visible shadow-2xs"
    >
      {/* Left: Sidebar Toggle + ⚡ 핵심 데일리 퀵메뉴 (방안 B) */}
      <div className="flex items-center gap-1.5 min-w-0 overflow-visible">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] border rounded transition-all cursor-pointer ${
              isSidebarOpen
                ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold shadow-2xs'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 font-semibold'
            }`}
            title="전체 메뉴 서랍 열기/닫기"
          >
            <PanelLeft className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-[12px]">전체메뉴</span>
          </button>
        )}

        <div className="h-5 w-px bg-gray-300 mx-0.5 hidden sm:block" />

        {/* ⚡ 사장님 핵심 퀵메뉴 (방안 B) */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <span className="hidden xl:inline-flex items-center gap-1 text-[11px] font-black text-blue-800 bg-blue-50/80 border border-blue-200 px-1.5 py-0.5 rounded">
            <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" />
            <span>핵심업무</span>
          </span>

          {QUICK_WORKFLOW_ITEMS.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                const item = getMenuItemById(q.id);
                if (item) openTab(item);
              }}
              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-bold border transition-all cursor-pointer whitespace-nowrap shadow-2xs ${q.btnClass}`}
              title={`${q.title} 화면으로 즉시 이동`}
            >
              <span
                className={`w-3.5 h-3.5 rounded-full text-[9px] font-black flex items-center justify-center shrink-0 ${q.badgeClass}`}
              >
                {q.step}
              </span>
              <q.icon className={`w-3.5 h-3.5 transition-colors shrink-0 ${q.iconColor}`} />
              <span className="font-extrabold tracking-tight">{q.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Full Menu Category Dropdowns (서랍형 카테고리) */}
      <div className="hidden lg:flex items-center space-x-0.5 overflow-visible pl-2 border-l border-gray-200 shrink-0">
        <span className="text-[11px] font-bold text-gray-400 mr-1 whitespace-nowrap">전체서랍:</span>

        {MENU_CATEGORIES.filter((c) => c.id !== 'admin').map((category) => {
          const isOpen = openDropdownId === category.id;
          return (
            <div
              key={category.id}
              className="relative overflow-visible"
              onMouseEnter={() => handleDropdownHover(category.id)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdownId(isOpen ? null : category.id);
                }}
                className={`whitespace-nowrap shrink-0 px-2 py-1 text-[12px] font-semibold transition-colors cursor-pointer rounded ${
                  isOpen
                    ? 'bg-blue-600 text-white shadow-2xs font-bold'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-black'
                }`}
              >
                <span>{category.title}</span>
              </button>

              {/* Submenu Dropdown */}
              {isOpen && (
                <div
                  className="absolute top-[38px] right-0 min-w-[240px] max-h-[500px] overflow-y-auto bg-white border border-gray-300 rounded shadow-2xl py-1 z-[100]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 text-[11px] font-bold text-gray-600 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <span>{category.title}</span>
                    <span className="text-gray-400 font-mono">({category.items.length}개)</span>
                  </div>
                  {category.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuClick(item);
                      }}
                      className="w-full text-left px-3.5 py-2 text-[12px] text-gray-800 hover:bg-blue-600 hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
                    >
                      <span className="truncate">{item.title}</span>
                      {item.badge && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-700 group-hover:bg-white group-hover:text-blue-900 border border-blue-200 rounded font-bold">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* 관리자전용 */}
        {(() => {
          const adminCat = MENU_CATEGORIES.find((c) => c.id === 'admin');
          if (!adminCat) return null;
          const isOpen = openDropdownId === 'admin';
          return (
            <div
              key={adminCat.id}
              className="relative overflow-visible"
              onMouseEnter={() => handleDropdownHover('admin')}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdownId(isOpen ? null : 'admin');
                }}
                className={`px-2 py-1 text-[12px] font-bold transition-colors cursor-pointer rounded ${
                  isOpen
                    ? 'bg-rose-600 text-white'
                    : 'text-rose-700 hover:bg-rose-50 border border-rose-200'
                }`}
              >
                {adminCat.title}
              </button>

              {isOpen && (
                <div
                  className="absolute top-[38px] right-0 min-w-[240px] max-h-[500px] overflow-y-auto bg-white border border-rose-300 rounded shadow-2xl py-1 z-[100]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 text-[11px] font-bold text-rose-800 border-b border-rose-200 bg-rose-50 flex items-center justify-between">
                    <span>{adminCat.title}</span>
                    <span className="text-rose-400 font-mono font-normal">(관리자 전용)</span>
                  </div>
                  {adminCat.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuClick(item);
                      }}
                      className="w-full text-left px-3.5 py-2 text-[12px] text-gray-800 hover:bg-rose-600 hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
                    >
                      <span className="truncate">{item.title}</span>
                      {item.badge && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-rose-100 text-rose-700 group-hover:bg-white group-hover:text-rose-900 border border-rose-200 rounded font-bold">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};
