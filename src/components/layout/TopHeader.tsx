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
    <header className="h-[52px] bg-[#0f172a] text-slate-200 px-3 sm:px-5 flex items-center justify-between gap-3 border-b border-white/10 select-none">
      {/* Title & Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 font-black tracking-tight text-white text-[16px]">
          {/* Company Logo (Transparent PNG) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pic/logo.png"
            alt="(주)GFS 로고"
            className="h-7 w-auto object-contain drop-shadow-md select-none"
          />
          <span className="font-black text-white tracking-tight text-[16.5px]">(주)GFS</span>
          <span className="text-slate-300 font-mono text-[11.5px] font-bold bg-white/10 border border-white/15 px-2 py-0.5 rounded-md">
            v2026.11.2
          </span>
        </div>
        <span className="text-slate-400 text-[13px] font-medium hidden xl:inline-block">
          | 식품 제조 유통 통합 엔터프라이즈 ERP
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* GS Retail Excel Import Button (Premium Redesigned) */}
        <button
          onClick={openExcelOrderModal}
          className="hidden md:flex items-center gap-2 h-9 px-3.5 whitespace-nowrap shrink-0 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-xl text-[13px] border border-blue-300/30 shadow-md shadow-blue-950/40 hover:shadow-blue-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer group"
          title="GS리테일 점포 발주 엑셀 업로드 및 자동 파싱"
        >
          <div className="w-5 h-5 rounded-md bg-white/20 border border-white/25 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="tracking-tight">엑셀 수주</span>
          <span className="text-[10.5px] px-1.5 py-0.2 rounded-md bg-white/20 text-blue-100 font-extrabold border border-white/20">
            GS25
          </span>
        </button>

        {/* Pipeline Trigger Button */}
        <button
          onClick={openPipelineModal}
          className="hidden md:flex items-center gap-2 h-8.5 px-3.5 whitespace-nowrap shrink-0 bg-white/10 hover:bg-white/15 text-slate-100 border border-white/15 font-bold rounded-lg text-[13px] transition-all cursor-pointer"
          title="생산-원가 자동 연산 파이프라인 엔진 가동"
        >
          <Zap className="w-4.5 h-4.5 text-amber-400 fill-amber-400" />
          <span>파이프라인</span>
        </button>

        {/* Standard Document Print Button */}
        <button
          onClick={() => openPrintModal()}
          className="hidden md:flex items-center gap-2 h-8.5 px-3.5 whitespace-nowrap shrink-0 bg-white/10 hover:bg-white/15 text-slate-100 border border-white/15 font-bold rounded-lg text-[13px] transition-all cursor-pointer"
          title="HACCP 및 공정 작업지시서, 수불부 표준 규격 인쇄"
        >
          <Printer className="w-4.5 h-4.5 text-blue-300" />
          <span>표준 양식</span>
        </button>

        {/* Server status */}
        <div className="hidden lg:flex items-center gap-1.5 text-slate-300 font-mono text-[12px] bg-white/10 px-2.5 py-1 rounded-lg border border-white/15">
          <Server className="w-3.5 h-3.5 text-emerald-400" />
          <span>GFS-PROD-SRV01 [정상]</span>
        </div>

        {/* Current Time */}
        <div className="hidden xl:flex items-center gap-1.5 text-slate-200 font-mono text-[12.5px] bg-white/10 px-2.5 py-1 rounded-lg border border-white/15">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span suppressHydrationWarning>{timeStr || '2026-10-30 09:00:00'}</span>
        </div>

        {/* Real-time Notification Bell */}
        <NotificationCenter />

        {/* User Info & Logout */}
        <div className="flex items-center gap-2.5 pl-2.5 border-l border-white/15">
          <div className="hidden sm:flex items-center gap-2 text-slate-100 font-bold text-[13px]">
            <User className="w-4.5 h-4.5 text-slate-300" />
            <span>
              {userName}님{userDept ? ` (${userDept})` : ''}{' '}
              <span className="text-[11px] bg-white/15 text-white px-2 py-0.5 rounded-md border border-white/20 font-black">
                {userRole}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 h-8.5 px-3 bg-white/10 hover:bg-rose-600 text-slate-100 hover:text-white border border-white/15 rounded-lg text-[12.5px] transition-all cursor-pointer font-bold shadow-xs"
            title="시스템 로그아웃"
          >
            <LogOut className="w-4 h-4" />
            <span>로그아웃</span>
          </button>
        </div>
      </div>
    </header>
  );
};

