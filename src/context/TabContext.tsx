'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { MenuItem, TabItem } from '@/types/erp';
import { useSession } from 'next-auth/react';
import { getMenuItemById } from '@/config/menuConfig';
import { erpToast } from '@/context/ToastContext';

export const DASHBOARD_TAB_ID = 'dashboard';

const INITIAL_DASHBOARD_TAB: TabItem = {
  id: DASHBOARD_TAB_ID,
  title: '대시보드',
  menuId: 'dashboard',
  categoryId: 'home',
  categoryName: '홈',
  isClosable: false,
  openedAt: Date.now(),
};

interface TabContextType {
  tabs: TabItem[];
  activeTabId: string;
  activeTab: TabItem;
  openTab: (menu: MenuItem) => void;
  closeTab: (tabId: string) => void;
  closeAllTabs: () => void;
  setActiveTabId: (tabId: string) => void;
  startupMenuIds: string[];
  isStartupTab: (menuId: string) => boolean;
  toggleStartupTab: (menuId: string, title?: string) => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: session } = useSession();
  const [tabs, setTabs] = useState<TabItem[]>([INITIAL_DASHBOARD_TAB]);
  const [activeTabId, setActiveTabId] = useState<string>(DASHBOARD_TAB_ID);
  const [startupMenuIds, setStartupMenuIds] = useState<string[]>([]);
  const hasInitializedRef = useRef(false);
  const tabsRef = useRef<TabItem[]>(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const loginId = (session?.user as any)?.loginId || 'admin';
  const storageKey = `gfs_startup_tabs_${loginId}`;

  // 1. 초기 마운트 시 로컬스토리지 및 DB에서 시작화면 불러와서 자동 열기
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 로컬스토리지 우선 로드 (즉시 반영)
    let localSaved: string[] = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) localSaved = parsed;
      }
    } catch {}

    setStartupMenuIds(localSaved);

    // 첫 1회에 한해 시작 화면 자동 탭 열기
    if (!hasInitializedRef.current && localSaved.length > 0) {
      hasInitializedRef.current = true;
      const initialOpenTabs: TabItem[] = [INITIAL_DASHBOARD_TAB];
      localSaved.forEach((menuId) => {
        const item = getMenuItemById(menuId);
        if (item && item.id !== 'dashboard') {
          initialOpenTabs.push({
            id: `tab-${item.id}`,
            title: item.title,
            menuId: item.id,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            isClosable: true,
            openedAt: Date.now(),
          });
        }
      });
      setTabs(initialOpenTabs);
    }

    // 서버 DB와 비동기 동기화
    fetch('/api/user/startup-tabs')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.startupTabs)) {
          const dbTabs: string[] = res.startupTabs;
          setStartupMenuIds(dbTabs);
          localStorage.setItem(storageKey, JSON.stringify(dbTabs));

          // 만약 로컬에 아무것도 없었는데 DB에 등록된 게 있었다면 열어주기
          if (!hasInitializedRef.current && dbTabs.length > 0) {
            hasInitializedRef.current = true;
            const initialOpenTabs: TabItem[] = [INITIAL_DASHBOARD_TAB];
            dbTabs.forEach((menuId) => {
              const item = getMenuItemById(menuId);
              if (item && item.id !== 'dashboard') {
                initialOpenTabs.push({
                  id: `tab-${item.id}`,
                  title: item.title,
                  menuId: item.id,
                  categoryId: item.categoryId,
                  categoryName: item.categoryName,
                  isClosable: true,
                  openedAt: Date.now(),
                });
              }
            });
            setTabs(initialOpenTabs);
          }
        }
      })
      .catch(() => {});
  }, [storageKey]);

  const openTab = useCallback((menu: MenuItem) => {
    const prevTabs = tabsRef.current;
    const existingTab = prevTabs.find((t) => t.menuId === menu.id);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    const newTab: TabItem = {
      id: `tab-${menu.id}`,
      title: menu.title,
      menuId: menu.id,
      categoryId: menu.categoryId,
      categoryName: menu.categoryName,
      isClosable: true,
      openedAt: Date.now(),
    };

    const nextTabs = [...prevTabs, newTab];
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    setActiveTabId(newTab.id);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    const prevTabs = tabsRef.current;
    const targetTab = prevTabs.find((t) => t.id === tabId);
    if (!targetTab || !targetTab.isClosable) {
      return;
    }

    const newTabs = prevTabs.filter((t) => t.id !== tabId);
    tabsRef.current = newTabs;
    setTabs(newTabs);

    // If active tab was closed, switch to adjacent tab
    if (tabId === activeTabId) {
      const closedIndex = prevTabs.findIndex((t) => t.id === tabId);
      const nextActiveTab = newTabs[closedIndex] || newTabs[closedIndex - 1] || INITIAL_DASHBOARD_TAB;
      setActiveTabId(nextActiveTab.id);
    }
  }, [activeTabId]);

  const closeAllTabs = useCallback(() => {
    setTabs([INITIAL_DASHBOARD_TAB]);
    setActiveTabId(DASHBOARD_TAB_ID);
  }, []);

  const isStartupTab = useCallback(
    (menuId: string) => startupMenuIds.includes(menuId),
    [startupMenuIds]
  );

  const toggleStartupTab = useCallback(
    (menuId: string, title?: string) => {
      if (menuId === DASHBOARD_TAB_ID) {
        erpToast.info('대시보드는 시스템 기본 홈 화면입니다.', '📌 시작화면 안내');
        return;
      }

      setStartupMenuIds((prev) => {
        const exists = prev.includes(menuId);
        let next: string[];
        if (exists) {
          next = prev.filter((id) => id !== menuId);
          erpToast.info(`[${title || menuId}] 화면이 시작화면에서 해제되었습니다.`, '📌 시작화면 해제');
        } else {
          next = [...prev, menuId];
          erpToast.success(`[${title || menuId}] 화면이 로그인 시 자동 실행으로 등록되었습니다!`, '📌 시작화면 등록 완료');
        }

        // 로컬스토리지 저장
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, JSON.stringify(next));
        }

        // DB 서버 비동기 동기화
        fetch('/api/user/startup-tabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startupTabs: next }),
        }).catch((err) => console.error('Failed to sync startup tabs to DB:', err));

        return next;
      });
    },
    [storageKey]
  );

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || INITIAL_DASHBOARD_TAB;

  return (
    <TabContext.Provider
      value={{
        tabs,
        activeTabId,
        activeTab,
        openTab,
        closeTab,
        closeAllTabs,
        setActiveTabId,
        startupMenuIds,
        isStartupTab,
        toggleStartupTab,
      }}
    >
      {children}
    </TabContext.Provider>
  );
};

export const useTabs = () => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
};
