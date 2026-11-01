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
import { AdminProvider } from '@/components/admin/context/AdminContext';
import { PipelineProvider, usePipeline } from '@/context/PipelineContext';
import { PipelineModal } from '@/components/pipeline/PipelineModal';
import { ExcelOrderModal } from '@/components/excel/ExcelOrderModal';
import { PrintReportProvider, usePrintReport } from '@/context/PrintReportContext';
import { PrintReportModal } from '@/components/print/PrintReportModal';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

const TICKER_MESSAGES = [
  { type: 'danger', text: '[안전재고 경고] 경기미 백미(햅쌀) 현재고 38포 (안전재고 50포 미달 - 추가 발주 권장)' },
  { type: 'warning', text: '[유통기한 주의] [냉장]다진맛살 10kg 유통기한 D-3 임박 (FEFO 자동 차감 적용 중)' },
  { type: 'info', text: '[출하 현황] 1편 GS25 김해·양산·광주 저온센터 32,067개 출하지시 완료' },
  { type: 'success', text: '[HACCP 모니터] 성형실 온습도 적합 (18℃ 이하) 및 콜드체인(2.8℃) 정상 유지' },
];

function ErpApp() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % TICKER_MESSAGES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

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
      <div className="h-[34px] bg-white border-b border-gray-300 px-3.5 flex items-center justify-between text-[12.5px] select-none shadow-2xs shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden max-w-2xl">
          <span
            className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${
              TICKER_MESSAGES[tickerIndex].type === 'danger'
                ? 'bg-rose-500 animate-ping'
                : TICKER_MESSAGES[tickerIndex].type === 'warning'
                ? 'bg-amber-500 animate-pulse'
                : TICKER_MESSAGES[tickerIndex].type === 'success'
                ? 'bg-emerald-500'
                : 'bg-blue-500'
            }`}
          />
          <span
            className={`font-semibold truncate transition-all duration-300 text-[12.5px] ${
              TICKER_MESSAGES[tickerIndex].type === 'danger'
                ? 'text-rose-600'
                : TICKER_MESSAGES[tickerIndex].type === 'warning'
                ? 'text-amber-700'
                : TICKER_MESSAGES[tickerIndex].type === 'success'
                ? 'text-emerald-700'
                : 'text-blue-700'
            }`}
          >
            {TICKER_MESSAGES[tickerIndex].text}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={openExcelOrderModal}
            className="h-6.5 flex items-center gap-1.5 px-2.5 bg-white hover:bg-[#f8fafc] border border-[var(--line)] text-[var(--ink-700)] rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>엑셀 수주 업로드</span>
          </button>
          <button
            onClick={openPipelineModal}
            className="h-6.5 flex items-center gap-1.5 px-2.5 bg-white hover:bg-[#f8fafc] border border-[var(--line)] text-[var(--ink-700)] rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
            <span>자동 파이프라인</span>
          </button>
          <button
            onClick={() => openPrintModal()}
            className="h-6.5 flex items-center gap-1.5 px-2.5 bg-white hover:bg-[#f8fafc] border border-[var(--line)] text-[var(--ink-700)] rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-blue-600" />
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

