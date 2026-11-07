'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MENU_CATEGORIES } from '@/config/menuConfig';
import { useTabs } from '@/context/TabContext';
import { MenuItem } from '@/types/erp';
import { PanelLeft } from 'lucide-react';

interface TopMenuBarProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

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
    // If a menu is already open, hovering switches to the new menu
    if (openDropdownId !== null) {
      setOpenDropdownId(catId);
    }
  };

  return (
    <div
      ref={barRef}
      className="h-[36px] bg-white border-b border-[var(--line)] flex items-center px-2 text-xs select-none relative z-50 overflow-visible"
    >
      {/* Sidebar Toggle Button */}
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`flex items-center gap-1.5 px-2.5 py-1 mr-2 text-[12px] border rounded transition-colors cursor-pointer ${
            isSidebarOpen
              ? 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe] font-semibold'
              : 'bg-white text-[var(--ink-700)] border-[var(--line)] hover:bg-[#f8fafc] font-medium'
          }`}
          title="사이드바 메뉴 트리 열기/닫기"
        >
          <PanelLeft className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-[12px]">메뉴트리</span>
        </button>
      )}

      {/* Horizontal Main Categories (좌측부터 시원하게 펼쳐지는 1~10 대메뉴) */}
      <div className="hidden md:flex items-center space-x-1 overflow-visible">
        {/* 1~9: 업무관리 ~ 도움말 */}
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
                className={`whitespace-nowrap shrink-0 px-3 py-1.5 text-[12.5px] font-semibold transition-colors cursor-pointer rounded ${
                  isOpen
                    ? 'bg-[#2563eb] text-white shadow-xs font-bold'
                    : 'text-[var(--ink-700)] hover:bg-[#f1f5f9]'
                }`}
              >
                {category.title}
              </button>

              {/* Submenu Dropdown */}
              {isOpen && (
                <div
                  className="absolute top-[36px] left-0 min-w-[240px] max-h-[500px] overflow-y-auto bg-white border border-gray-400 rounded shadow-2xl py-1 z-[100]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 text-[11px] font-bold text-gray-600 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <span>{category.title}</span>
                    <span className="text-gray-400 font-mono">({category.items.length}개 메뉴)</span>
                  </div>
                  {category.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuClick(item);
                      }}
                      className="w-full text-left px-3.5 py-2 text-[12.5px] text-gray-800 hover:bg-[#2563eb] hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
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
                className={`px-3 py-1.5 text-[12.5px] font-bold transition-colors cursor-pointer rounded ${
                  isOpen
                    ? 'bg-[#e11d48] text-white shadow-xs'
                    : 'text-[#be123c] hover:bg-[#fff1f2] border border-[#fecdd3]'
                }`}
              >
                {adminCat.title}
              </button>

              {isOpen && (
                <div
                  className="absolute top-[36px] left-0 min-w-[240px] max-h-[500px] overflow-y-auto bg-white border border-rose-300 rounded shadow-2xl py-1 z-[100]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 text-[11px] font-bold text-rose-800 border-b border-rose-200 bg-rose-50 flex items-center justify-between">
                    <span>{adminCat.title}</span>
                    <span className="text-rose-500 font-mono font-normal">({adminCat.items.length}개 메뉴)</span>
                  </div>
                  {adminCat.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuClick(item);
                      }}
                      className="w-full text-left px-3.5 py-2 text-[12.5px] text-gray-800 hover:bg-rose-600 hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
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
