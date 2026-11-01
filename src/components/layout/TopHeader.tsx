'use client';

import React, { useState, useEffect } from 'react';
import { LogOut, User, ShieldCheck, Server, Clock, Zap, FileSpreadsheet, Printer } from 'lucide-react';
import { usePipeline } from '@/context/PipelineContext';
import { usePrintReport } from '@/context/PrintReportContext';
import { useSession, signOut } from 'next-auth/react';
import { erpConfirm } from '@/context/ConfirmContext';
import { NotificationCenter } from './NotificationCenter';

interface TopHeaderProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const { data: session } = useSession();
  const { openPipelineModal, openExcelOrderModal } = usePipeline();
  const { openPrintModal } = usePrintReport();
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
          now.getDate()
        ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes()
        ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    const ok = await erpConfirm('시스템에서 로그아웃 하시겠습니까?', '로그아웃 확인', 'warning');
    if (ok) {
      signOut({ callbackUrl: '/login' });
    }
  };

  const userName = session?.user?.name || '전정우';
  const userRole = (session?.user as any)?.role || '관리자';
  const userDept = (session?.user as any)?.department;

  return (
    <header className="h-[46px] bg-[#1a2332] text-gray-200 px-2 sm:px-4 flex items-center justify-between gap-2 border-b border-slate-700/80 select-none shadow-sm">
      {/* Title & Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 font-black tracking-tight text-white text-[15px]">
          {/* Company Logo (Transparent PNG) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pic/logo.png"
            alt="(주)GFS 로고"
            className="h-6 w-auto object-contain drop-shadow-md select-none"
          />
          <span className="font-black text-white tracking-tight">(주)GFS</span>
          <span className="text-blue-300 font-mono text-[11.5px] font-bold bg-blue-950/80 border border-blue-600/60 px-2 py-0.5 rounded shadow-2xs">
            v2026.11.2
          </span>
        </div>
        <span className="text-gray-300 text-[12.5px] font-medium hidden md:inline-block">
          | 식품 제조 유통 통합 엔터프라이즈 ERP
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5 text-[12px]">
        {/* GS Retail Excel Import Button */}
        <button
          onClick={openExcelOrderModal}
          className="hidden lg:flex items-center gap-1.5 h-7.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[12px] shadow-sm transition-all active:scale-95 cursor-pointer"
          title="GS리테일 점포 발주 엑셀 업로드 및 자동 파싱"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>GS리테일 엑셀 수주</span>
        </button>

        {/* Pipeline Trigger Button */}
        <button
          onClick={openPipelineModal}
          className="hidden lg:flex items-center gap-1.5 h-7.5 px-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-extrabold rounded text-[12px] shadow-sm transition-all active:scale-95 cursor-pointer"
          title="생산-원가 자동 연산 파이프라인 엔진 가동"
        >
          <Zap className="w-4 h-4 fill-black stroke-black" />
          <span>자동 파이프라인</span>
        </button>

        {/* Standard Document Print Button */}
        <button
          onClick={() => openPrintModal()}
          className="hidden lg:flex items-center gap-1.5 h-7.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-[12px] shadow-sm transition-all active:scale-95 cursor-pointer"
          title="HACCP 및 공정 작업지시서, 수불부 표준 규격 인쇄"
        >
          <Printer className="w-4 h-4" />
          <span>표준 양식 인쇄</span>
        </button>

        {/* Server status */}
        <div className="hidden md:flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] bg-slate-800/80 px-2 py-1 rounded border border-slate-700/60">
          <Server className="w-3.5 h-3.5" />
          <span>GFS-PROD-SRV01 [정상]</span>
        </div>

        {/* Current Time */}
        <div className="hidden lg:flex items-center gap-1.5 text-gray-300 font-mono text-[12px] bg-slate-800/80 px-2 py-1 rounded border border-slate-700/60">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span suppressHydrationWarning>{timeStr || '2026-10-30 09:00:00'}</span>
        </div>

        {/* Real-time Notification Bell */}
        <NotificationCenter />

        {/* User Info & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-600">
          <div className="hidden sm:flex items-center gap-1.5 text-amber-300 font-medium text-[12px]">
            <User className="w-4 h-4" />
            <span>
              {userName}님{userDept ? ` (${userDept})` : ''} <span className="text-[11px] bg-amber-400/20 text-amber-200 px-1.5 py-0.5 rounded border border-amber-400/30 font-bold">{userRole}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1 h-7 px-2.5 bg-gray-700 hover:bg-rose-700 hover:text-white text-gray-200 border border-gray-500 rounded text-[11px] transition-colors cursor-pointer font-medium"
            title="시스템 로그아웃"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>로그아웃</span>
          </button>
        </div>
      </div>
    </header>
  );
};

