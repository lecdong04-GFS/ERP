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

  // 알림바 신호등 상태 스타일 매핑 (동그라미가 잘리거나 사라지지 않도록 고정)
  const tickerStyle = React.useMemo(() => {
    switch (currentTicker.type) {
      case 'danger':
        return {
          dotBg: 'bg-rose-500',
          pingBg: 'bg-rose-400',
          textColor: 'text-rose-600',
        };
      case 'warning':
        return {
          dotBg: 'bg-amber-500',
          pingBg: 'bg-amber-400',
          textColor: 'text-amber-700',
        };
      case 'success':
        return {
          dotBg: 'bg-emerald-500',
          pingBg: 'bg-emerald-400',
          textColor: 'text-emerald-700',
        };
      case 'primary':
        return {
          dotBg: 'bg-indigo-500',
          pingBg: 'bg-indigo-400',
          textColor: 'text-indigo-600',
        };
      default:
        return {
          dotBg: 'bg-blue-500',
          pingBg: 'bg-blue-400',
          textColor: 'text-blue-700',
        };
    }
  }, [currentTicker.type]);

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
        <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-4">
          {/* 안정적인 이중 레이어 LED 인디케이터 (절대 잘리거나 깜빡임으로 사라지지 않고 영롱하게 반짝임) */}
          <div className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
            <span
              className={`absolute inline-flex h-3.5 w-3.5 rounded-full opacity-60 animate-ping ${tickerStyle.pingBg}`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${tickerStyle.dotBg} shadow-xs`}
            />
          </div>

          {/* 텍스트 영역 (텍스트만 안전하게 말줄임 처리되어 LED 인디케이터를 절대 침범하거나 자르지 않음) */}
          <div className="overflow-hidden min-w-0 flex-1">
            <span
              className={`font-bold truncate block transition-all duration-300 text-[13px] ${tickerStyle.textColor}`}
            >
              {currentTicker.text}
            </span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={openExcelOrderModal}
            className="h-7.5 flex items-center gap-1.5 px-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-200 text-blue-900 rounded-lg text-[12.5px] font-black cursor-pointer transition-all shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
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
            <span>표준 양식 센터</span>
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

