'use client';

import React, { useState, useEffect } from 'react';
import { Bell, AlertTriangle, AlertCircle, Info, Check, Clock, ExternalLink, RefreshCw, X } from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';

export interface NotificationItem {
  id: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  time: string;
  tabId?: string;
  read: boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    type: 'danger',
    title: '안전재고 미달 경고',
    message: '[원재료] 국내산 경기미 백미(햅쌀) 현재고가 안전재고(50포) 이하입니다 (현재 38포).',
    time: '10분 전',
    tabId: 'inv-safety-stock-mgmt',
    read: false,
  },
  {
    id: 'n2',
    type: 'warning',
    title: '유통기한 임박 주의 (D-3)',
    message: '[원재료] [냉장]다진맛살 10kg 유통기한이 3일 남았습니다. FEFO 선출고 권장.',
    time: '25분 전',
    tabId: 'pur-expiry-status',
    read: false,
  },
  {
    id: 'n3',
    type: 'info',
    title: 'GS리테일 익일 수주 접수',
    message: '김해/양산/신광주 저온센터 1편 배차 발주서 총 32,067개 정상 동기화 완료.',
    time: '1시간 전',
    tabId: 'sales-order-upload',
    read: false,
  },
  {
    id: 'n4',
    type: 'success',
    title: '자동 연산 파이프라인 가동 완료',
    message: '46개 계 작업지시서 생성 및 레시피 소요량 FEFO 자재 자동 차감 완료.',
    time: '2시간 전',
    tabId: 'prod-work-order-status',
    read: true,
  },
];

export const NotificationCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(DEFAULT_NOTIFICATIONS);
  const { openTab } = useTabs();

  // API에서 알림 불러오기 시도
  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.notifications) {
          // Keep default structured notifications
        }
      })
      .catch(() => {});
  }, []);

  const unreadCount = items.filter((i) => !i.read).length;

  const markAllAsRead = () => {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  };

  const handleItemClick = (item: NotificationItem) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
    if (item.tabId) {
      const targetMenu = getMenuItemById(item.tabId);
      if (targetMenu) {
        openTab(targetMenu);
      } else {
        const catId = item.tabId.split('-')[0];
        const catMap: Record<string, string> = {
          sales: '매출관리',
          pur: '매입관리',
          purchase: '매입관리',
          prod: '생산관리',
          production: '생산관리',
          inv: '재고관리',
          inventory: '재고관리',
          master: '기준정보',
          cost: '원가관리',
          mgmt: '경영관리',
          management: '경영관리',
          admin: '관리자전용',
          work: '업무관리',
        };
        const standardCatId =
          catId === 'pur'
            ? 'purchase'
            : catId === 'prod'
            ? 'production'
            : catId === 'inv'
            ? 'inventory'
            : catId === 'mgmt'
            ? 'management'
            : catId;
        openTab({
          id: item.tabId,
          title: item.title,
          categoryId: standardCatId,
          categoryName: catMap[catId] || '업무관리',
        });
      }
      setIsOpen(false);
    }
  };

  return (
    <div className="relative select-none">
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center p-2 text-slate-200 hover:text-white hover:bg-slate-700/70 rounded transition-colors cursor-pointer"
        title="실시간 알림 센터"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 top-full mt-2 w-[400px] bg-white border border-slate-300 rounded-md shadow-2xl z-50 text-slate-800 text-[12.5px] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            {/* Header */}
            <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2 font-bold text-[13px]">
                <Bell className="w-4 h-4 text-amber-400" />
                <span>실시간 알림 센터</span>
                {unreadCount > 0 && (
                  <span className="bg-rose-600 text-white text-[11px] px-2 py-0.5 rounded-full font-bold">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 text-[11px]">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-gray-300 hover:text-white underline cursor-pointer"
                  >
                    모두 읽음
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
              {items.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-[12px]">
                  새로운 알림이 없습니다.
                </div>
              ) : (
                items.map((item) => {
                  let border = 'border-l-4 border-l-slate-300';
                  let icon = <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />;

                  if (item.type === 'danger') {
                    border = 'border-l-4 border-l-rose-500';
                    icon = <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />;
                  } else if (item.type === 'warning') {
                    border = 'border-l-4 border-l-amber-500';
                    icon = <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
                  } else if (item.type === 'success') {
                    border = 'border-l-4 border-l-emerald-500';
                    icon = <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />;
                  }

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={`p-3 flex items-start gap-3 hover:bg-slate-50 transition-colors cursor-pointer ${border} ${
                        item.read ? 'opacity-60 bg-white' : 'bg-slate-50/70'
                      }`}
                    >
                      {icon}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-[12.5px] text-slate-800 truncate">
                            {item.title}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono shrink-0">
                            {item.time}
                          </span>
                        </div>
                        <p className="text-[12px] text-slate-600 leading-relaxed break-keep">
                          {item.message}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>(주)GFS 종합관제센터 연동</span>
              <span className="text-blue-700 font-bold">FEFO 안심관제 가동중</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
