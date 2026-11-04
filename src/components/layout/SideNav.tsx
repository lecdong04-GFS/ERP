'use client';

import React, { useState, useMemo } from 'react';
import { MENU_CATEGORIES, getMenuItemById } from '@/config/menuConfig';
import { useTabs } from '@/context/TabContext';
import { MenuItem } from '@/types/erp';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  X,
  Layers,
  Sparkles,
  ShoppingBag,
  ClipboardCheck,
  ShoppingCart,
  PackageCheck,
  Printer,
} from 'lucide-react';

const SIDE_QUICK_WORKFLOW = [
  { step: '1', id: 'sales-order-upload', title: '수주등록 (GS)', desc: '일일 수주', icon: ShoppingBag, color: 'bg-blue-600' },
  { step: '2', id: 'inv-lookup', title: '재고조회 (5시 실사)', desc: '실사표 업로드', icon: ClipboardCheck, color: 'bg-emerald-600' },
  { step: '3', id: 'pur-mat-order-day', title: '자재발주 (요일별)', desc: '발주량 자동산출', icon: ShoppingCart, color: 'bg-amber-600' },
  { step: '4', id: 'master-product-reg', title: '제품등록 (BOM)', desc: '레시피 작성', icon: PackageCheck, color: 'bg-indigo-600' },
  { step: '5', id: 'pur-order-print', title: '발주서출력', desc: '협력사 전송', icon: Printer, color: 'bg-slate-700' },
];

interface SideNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SideNav: React.FC<SideNavProps> = ({ isOpen, onClose }) => {
  const { openTab, activeTab } = useTabs();
  const [searchTerm, setSearchTerm] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    work: true,
    sales: true,
    purchase: true,
    production: true,
    inventory: true,
    management: true,
    master: true,
    cost: true,
    help: false,
    admin: false,
  });

  const toggleCategory = (id: string) => {
    setOpenCategories((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    MENU_CATEGORIES.forEach((c) => (next[c.id] = true));
    setOpenCategories(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    MENU_CATEGORIES.forEach((c) => (next[c.id] = false));
    setOpenCategories(next);
  };

  // Filter categories and items based on search term
  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return MENU_CATEGORIES;

    const term = searchTerm.toLowerCase();
    return MENU_CATEGORIES.map((category) => {
      const matchingItems = category.items.filter((item) =>
        item.title.toLowerCase().includes(term)
      );
      return {
        ...category,
        items: matchingItems,
      };
    }).filter((category) => category.items.length > 0);
  }, [searchTerm]);

  if (!isOpen) return null;

  return (
    <aside className="w-[290px] h-full bg-[#f8fafc] border-r border-gray-300 flex flex-col shrink-0 select-none text-xs z-30 shadow-md">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#e2e8f0] border-b border-gray-300">
        <div className="flex items-center gap-2 font-black text-gray-800 text-[13.5px]">
          <Layers className="w-4 h-4 text-blue-700" />
          <span>전체 메뉴 탐색기</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-300 text-gray-600 rounded cursor-pointer"
            title="사이드바 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Search */}
      <div className="p-2.5 border-b border-gray-200 bg-white">
        <div className="relative">
          <input
            type="text"
            placeholder="메뉴명 검색 (예: GSR, BOM, 발주)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 text-[12.5px] border border-gray-300 rounded-xs bg-white focus:outline-none focus:border-blue-600 placeholder:text-gray-400 h-8 shadow-2xs"
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500 font-medium">
          <span>전체 10개 대분류 67개 메뉴</span>
          <div className="flex items-center gap-1.5">
            <button onClick={expandAll} className="hover:text-blue-700 underline cursor-pointer">
              모두펼침
            </button>
            <span>/</span>
            <button onClick={collapseAll} className="hover:text-blue-700 underline cursor-pointer">
              모두접음
            </button>
          </div>
        </div>
      </div>

      {/* ⭐ 수주·발주 핵심 데일리 퀵메뉴 (방안 B) */}
      {!searchTerm && (
        <div className="p-2 border-b border-gray-200 bg-gradient-to-b from-blue-50/70 to-slate-50 shrink-0">
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="flex items-center gap-1 text-[11px] font-black text-blue-900">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>핵심 데일리 업무</span>
            </span>
            <span className="text-[10px] text-gray-400 font-medium">원클릭 바로가기</span>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {SIDE_QUICK_WORKFLOW.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  const item = getMenuItemById(q.id);
                  if (item) openTab(item);
                }}
                className="w-full px-2 py-1.5 rounded bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 flex items-center justify-between text-left transition-all shadow-2xs group cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-4 h-4 rounded text-[10px] font-black flex items-center justify-center text-white shrink-0 ${q.color}`}
                  >
                    {q.step}
                  </span>
                  <q.icon className="w-3.5 h-3.5 text-gray-500 group-hover:text-blue-600 shrink-0" />
                  <span className="font-bold text-[12px] text-gray-800 group-hover:text-blue-700 truncate">
                    {q.title}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 group-hover:text-blue-600 font-medium whitespace-nowrap">
                  {q.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Menu Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {filteredCategories.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-[13px]">
            검색 결과가 없습니다.
          </div>
        ) : (
          filteredCategories.map((category) => {
            const isCatOpen = searchTerm.trim() ? true : !!openCategories[category.id];

            return (
              <div key={category.id} className="border border-transparent">
                {/* Category Header */}
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-gray-800 hover:bg-[#e2e8f0] font-bold text-[13px] group rounded-xs cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCatOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-600" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    )}
                    {isCatOpen ? (
                      <FolderOpen className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Folder className="w-4 h-4 text-amber-600" />
                    )}
                    <span>{category.title}</span>
                  </div>
                  <span className="text-[11px] text-gray-500 font-mono">
                    ({category.items.length})
                  </span>
                </button>

                {/* Submenu Items */}
                {isCatOpen && (
                  <div className="pl-5 pr-1 py-1 space-y-1 border-l-2 border-gray-200 ml-4">
                    {category.items.map((item) => {
                      const isCurrent = activeTab.menuId === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openTab(item)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-[12.5px] rounded-xs transition-colors cursor-pointer ${
                            isCurrent
                              ? 'bg-[#2563eb] text-white font-bold shadow-xs'
                              : 'text-gray-700 hover:bg-blue-50 hover:text-blue-950 font-medium'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isCurrent ? 'text-white' : 'text-gray-400'
                              }`}
                            />
                            <span className="truncate">{item.title}</span>
                          </div>

                          {item.badge && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-xs shrink-0 border ${
                                isCurrent
                                  ? 'bg-white text-blue-900 border-white font-bold'
                                  : 'bg-blue-100 text-blue-700 border-blue-200'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

