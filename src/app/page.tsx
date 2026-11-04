'use client';

import React, { useState } from 'react';
import { TabProvider, useTabs, DASHBOARD_TAB_ID } from '@/context/TabContext';
import { TopHeader } from '@/components/layout/TopHeader';
import { TopMenuBar } from '@/components/layout/TopMenuBar';
import { TabBar } from '@/components/layout/TabBar';
import { SideNav } from '@/components/layout/SideNav';
import { StatusBar } from '@/components/layout/StatusBar';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ErpWorkspace } from '@/components/common/ErpWorkspace';
import { SalesScreenRouter } from '@/components/sales/SalesScreenRouter';
import { PurchaseScreenRouter } from '@/components/purchase/PurchaseScreenRouter';
import { ProductionScreenRouter } from '@/components/production/ProductionScreenRouter';
import { InventoryScreenRouter } from '@/components/inventory/InventoryScreenRouter';
import { MasterScreenRouter } from '@/components/master/MasterScreenRouter';
import { CostScreenRouter } from '@/components/cost/CostScreenRouter';
import { CostProvider } from '@/components/cost/context/CostContext';
import { ManagementScreenRouter } from '@/components/management/ManagementScreenRouter';
import { AdminScreenRouter } from '@/components/admin/AdminScreenRouter';
import { WorkScreenRouter } from '@/components/work/WorkScreenRouter';
import { AdminProvider } from '@/components/admin/context/AdminContext';
import { PipelineProvider, usePipeline } from '@/context/PipelineContext';
import { PipelineModal } from '@/components/pipeline/PipelineModal';
import { ExcelOrderModal } from '@/components/excel/ExcelOrderModal';
import { PrintReportProvider, usePrintReport } from '@/context/PrintReportContext';
import { PrintReportModal } from '@/components/print/PrintReportModal';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

interface TickerItem {
  type: 'danger' | 'warning' | 'info' | 'success' | 'primary';
  text: string;
}

const DEFAULT_TICKER_MESSAGES: TickerItem[] = [
  { type: 'primary', text: '[시스템 관제] (주)GFS 엔터프라이즈 ERP — 실시간 데이터 연동 준비 중' },
];

function ErpApp() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [tickerMessages, setTickerMessages] = useState<TickerItem[]>(DEFAULT_TICKER_MESSAGES);
  const [tickerIndex, setTickerIndex] = useState(0);

  // 100% 실제 DB 실시간 팩트(결품위험·FEFO·수주·발주마감·BOM) 로드 및 60초 주기 갱신
  React.useEffect(() => {
    let mounted = true;
    const fetchLiveTicker = async () => {
      try {
        const res = await fetch('/api/system/live-ticker');
        const json = await res.json();
        if (mounted && json?.success && Array.isArray(json.data) && json.data.length > 0) {
          setTickerMessages(json.data);
        }
      } catch (err) {
        console.warn('live ticker fetch error:', err);
      }
    };

    fetchLiveTicker();
    const interval = setInterval(fetchLiveTicker, 60000); // 1분 주기 자동 동기화
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // 4.5초 주기 롤링 순환
  React.useEffect(() => {
    if (tickerMessages.length <= 1) return;
    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % tickerMessages.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [tickerMessages.length]);

  const currentTicker = tickerMessages[tickerIndex % tickerMessages.length] || tickerMessages[0];

  const { activeTab, activeTabId } = useTabs();
  const {
    openPipelineModal,
    isExcelOrderModalOpen,
    openExcelOrderModal,
    closeExcelOrderModal,
  } = usePipeline();
  const { openPrintModal } = usePrintReport();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#e2e8f0]">
      {/* 1. Top Bar: Header */}
      <TopHeader
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* 2. Top Menu Bar (10 대분류 메뉴 드롭다운) */}
      <TopMenuBar
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* 2-1. 알림바 (GNB 바로 아래 실시간 롤링 알림 & 3대 핵심 퀵 액션) */}
      <div className="h-[38px] bg-white border-b border-gray-300 px-3.5 flex items-center justify-between text-[13px] select-none shadow-2xs shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden max-w-2xl">
          <span
            className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${
              currentTicker.type === 'danger'
                ? 'bg-rose-500 animate-ping'
                : currentTicker.type === 'warning'
                ? 'bg-amber-500 animate-pulse'
                : currentTicker.type === 'success'
                ? 'bg-emerald-500'
                : currentTicker.type === 'primary'
                ? 'bg-indigo-500'
                : 'bg-blue-500'
            }`}
          />
          <span
            className={`font-bold truncate transition-all duration-300 text-[13px] ${
              currentTicker.type === 'danger'
                ? 'text-rose-600'
                : currentTicker.type === 'warning'
                ? 'text-amber-700'
                : currentTicker.type === 'success'
                ? 'text-emerald-700'
                : currentTicker.type === 'primary'
                ? 'text-indigo-600'
                : 'text-blue-700'
            }`}
          >
            {currentTicker.text}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={openExcelOrderModal}
            className="h-7.5 flex items-center gap-1.5 px-3 bg-white hover:bg-[#f8fafc] border border-slate-300 text-slate-800 rounded-md text-[12.5px] font-bold cursor-pointer transition-colors shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>엑셀 수주 업로드</span>
          </button>
          <button
            onClick={openPipelineModal}
            className="h-7.5 flex items-center gap-1.5 px-3 bg-white hover:bg-[#f8fafc] border border-slate-300 text-slate-800 rounded-md text-[12.5px] font-bold cursor-pointer transition-colors shadow-2xs"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
            <span>자동 파이프라인</span>
          </button>
          <button
            onClick={() => openPrintModal()}
            className="h-7.5 flex items-center gap-1.5 px-3 bg-white hover:bg-[#f8fafc] border border-slate-300 text-slate-800 rounded-md text-[12.5px] font-bold cursor-pointer transition-colors shadow-2xs"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            <span>표준 양식 인쇄</span>
          </button>
        </div>
      </div>

      {/* 3. Multi-Tab (MDI) Bar */}
      <TabBar />

      {/* 4. Body Area: Left Sidebar (Optional) + Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Collapsible Left SideNav */}
        <SideNav
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Main Work Area */}
        <main className="flex-1 h-full overflow-hidden flex flex-col bg-white">
          <ErrorBoundary>
            {activeTabId === DASHBOARD_TAB_ID ? (
              <Dashboard />
            ) : activeTab.categoryId === 'sales' ? (
              <SalesScreenRouter key={activeTab.id} tab={activeTab} />
            ) : activeTab.categoryId === 'purchase' ? (
              <PurchaseScreenRouter key={activeTab.id} tab={activeTab} />
            ) : activeTab.categoryId === 'production' ? (
              <ProductionScreenRouter key={activeTab.id} tab={activeTab} />
            ) : activeTab.categoryId === 'inventory' ? (
              <InventoryScreenRouter key={activeTab.id} tab={activeTab} />
            ) : activeTab.categoryId === 'master' ? (
              <MasterScreenRouter key={activeTab.id} tab={activeTab} />
            ) : activeTab.categoryId === 'cost' ? (
              <CostScreenRouter key={activeTab.id} tab={activeTab} />
            ) : activeTab.categoryId === 'management' ? (
              <ManagementScreenRouter key={activeTab.id} tab={activeTab} />
            ) : activeTab.categoryId === 'admin' ? (
              <AdminScreenRouter key={activeTab.id} tab={activeTab} />
            ) : activeTab.categoryId === 'work' ? (
              <WorkScreenRouter key={activeTab.id} tab={activeTab} />
            ) : (
              <ErpWorkspace key={activeTab.id} tab={activeTab} />
            )}
          </ErrorBoundary>
        </main>
      </div>

      {/* 5. Bottom Status Bar */}
      <StatusBar />

      {/* 6. Modals & Engines */}
      <PipelineModal />
      <ExcelOrderModal
        isOpen={isExcelOrderModalOpen}
        onClose={closeExcelOrderModal}
      />
      <PrintReportModal />
    </div>
  );
}

export default function Home() {
  return (
    <TabProvider>
      <CostProvider>
        <AdminProvider>
          <PipelineProvider>
            <PrintReportProvider>
              <ErpApp />
            </PrintReportProvider>
          </PipelineProvider>
        </AdminProvider>
      </CostProvider>
    </TabProvider>
  );
}

