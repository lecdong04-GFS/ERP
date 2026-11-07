'use client';

import React, { useState } from 'react';
import { useTabs, DASHBOARD_TAB_ID } from '@/context/TabContext';
import {
  Search,
  RotateCcw,
  Save,
  Download,
  Printer,
  HelpCircle,
  Upload,
  CheckSquare,
  Trash2,
  Plus,
  FileSpreadsheet,
} from 'lucide-react';

export interface ActionButtonConfig {
  key: string;
  label: string;
  icon?: 'search' | 'reset' | 'save' | 'excel' | 'print' | 'upload' | 'batchSave' | 'delete' | 'add';
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  onClick: () => void;
  disabled?: boolean;
}

interface SalesActionBarProps {
  title: string;
  buttons: ActionButtonConfig[];
  helpContent?: string;
}

export const SalesActionBar: React.FC<SalesActionBarProps> = ({
  title,
  buttons,
  helpContent = '해당 화면은 (주)GFS 식품 제조 및 유통의 매출관리 실무 전용 화면입니다.',
}) => {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const { activeTab } = useTabs();
  const displayTitle = activeTab && activeTab.id !== DASHBOARD_TAB_ID && activeTab.title ? activeTab.title : title;

  const renderIcon = (iconName?: string) => {
    switch (iconName) {
      case 'search':
        return <Search className="w-3.5 h-3.5" />;
      case 'reset':
        return <RotateCcw className="w-3.5 h-3.5" />;
      case 'save':
        return <Save className="w-3.5 h-3.5" />;
      case 'excel':
        return <Download className="w-3.5 h-3.5" />;
      case 'print':
        return <Printer className="w-3.5 h-3.5" />;
      case 'upload':
        return <Upload className="w-3.5 h-3.5" />;
      case 'batchSave':
        return <CheckSquare className="w-3.5 h-3.5" />;
      case 'delete':
        return <Trash2 className="w-3.5 h-3.5" />;
      case 'add':
        return <Plus className="w-3.5 h-3.5" />;
      default:
        return null;
    }
  };

  const getButtonClass = (variant?: 'primary' | 'secondary' | 'success' | 'danger') => {
    switch (variant) {
      case 'primary':
        return 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] text-white hover:brightness-110 border-[#1e40af] shadow-xs font-bold';
      case 'success':
        return 'bg-gradient-to-b from-[#10b981] to-[#047857] text-white hover:brightness-110 border-[#065f46] shadow-xs font-bold';
      case 'danger':
        return 'bg-gradient-to-b from-[#ef4444] to-[#b91c1c] text-white hover:brightness-110 border-[#991b1b] shadow-xs font-bold';
      case 'secondary':
      default:
        return 'bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] text-gray-800 hover:from-white hover:to-[#cbd5e1] border-gray-400 font-medium active:translate-y-px shadow-2xs';
    }
  };

  return (
    <>
      <div className="h-[44px] bg-[#1e293b] text-white px-3.5 flex items-center justify-between border-b border-slate-900 select-none shrink-0 shadow-xs">
        {/* Left Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-4 bg-[#3b82f6] rounded-2xs shadow-xs" />
          <h1 className="text-[15px] font-black tracking-tight text-white">{displayTitle}</h1>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {buttons.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={btn.onClick}
              disabled={btn.disabled}
              className={`flex items-center gap-1.5 h-7.5 px-3 py-1 text-[12px] font-bold border rounded-xs transition-all shadow-xs ${getButtonClass(
                btn.variant
              )} ${btn.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
            >
              {renderIcon(btn.icon)}
              <span>{btn.label}</span>
            </button>
          ))}

          {/* Help Button */}
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="flex items-center justify-center w-7 h-7 ml-1 bg-[#334155] hover:bg-[#475569] text-gray-100 border border-slate-600 rounded-xs text-[13px] font-bold shadow-xs cursor-pointer"
            title="화면 도움말"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Help Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border-2 border-gray-600 shadow-2xl w-[480px] max-w-full text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#333333] text-white px-3 py-1.5 flex items-center justify-between font-bold text-[13px]">
              <span>[도움말] {displayTitle} 안내</span>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="text-gray-300 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3 text-gray-800">
              <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-900 leading-relaxed">
                {helpContent}
              </div>
              <div className="text-[11px] text-gray-600 space-y-1">
                <div>• <span className="font-semibold text-gray-700">조회 단축키:</span> 엔터키 또는 상단 [조회] 클릭</div>
                <div>• <span className="font-semibold text-gray-700">엑셀 출력:</span> 현재 그리드에 조회된 데이터가 CSV로 즉시 다운로드됩니다.</div>
                <div>• <span className="font-semibold text-gray-700">데이터 저장:</span> 내역 수정/삭제 후 반드시 [저장] 버튼을 눌러야 반영됩니다.</div>
              </div>
            </div>
            <div className="px-4 py-2 bg-gray-100 border-t border-gray-300 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-800 text-white font-medium text-xs border border-gray-600"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

