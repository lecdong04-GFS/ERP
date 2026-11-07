'use client';

import React, { useState } from 'react';
import { useTabs, DASHBOARD_TAB_ID } from '@/context/TabContext';
import {
  HelpCircle,
  Search,
  Save,
  RotateCcw,
  Share2,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';

export interface CostActionButton {
  key: string;
  label: string;
  icon?: 'search' | 'save' | 'reset' | 'allocate' | 'excel' | 'print';
  onClick?: () => void;
  disabled?: boolean;
}

interface CostActionBarProps {
  title: string;
  buttons?: CostActionButton[];
  helpContent?: string;
}

export const CostActionBar: React.FC<CostActionBarProps> = ({
  title,
  buttons = [],
  helpContent,
}) => {
  const [showHelp, setShowHelp] = useState(false);
  const { activeTab } = useTabs();
  const displayTitle = activeTab && activeTab.id !== DASHBOARD_TAB_ID && activeTab.title ? activeTab.title : title;

  const renderIcon = (icon?: string) => {
    switch (icon) {
      case 'search':
        return <Search className="w-3.5 h-3.5 text-white" />;
      case 'save':
        return <Save className="w-3.5 h-3.5 text-white" />;
      case 'reset':
        return <RotateCcw className="w-3.5 h-3.5 text-white" />;
      case 'allocate':
        return <Share2 className="w-3.5 h-3.5 text-white" />;
      case 'excel':
        return <FileSpreadsheet className="w-3.5 h-3.5 text-white" />;
      case 'print':
        return <Printer className="w-3.5 h-3.5 text-white" />;
      default:
        return null;
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
              onClick={btn.onClick}
              disabled={btn.disabled}
              className={`h-7.5 flex items-center gap-1.5 px-3 py-1 text-[12px] font-bold text-white rounded shadow-xs border transition-colors cursor-pointer ${
                btn.disabled
                  ? 'bg-gray-600 border-gray-700 opacity-60 cursor-not-allowed'
                  : btn.key === 'allocate'
                  ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] hover:from-[#60a5fa] hover:to-[#2563eb] border-[#1e40af] active:translate-y-px'
                  : 'bg-gradient-to-b from-[#475569] to-[#334155] hover:from-[#64748b] hover:to-[#475569] border-slate-600 active:translate-y-px'
              }`}
            >
              {renderIcon(btn.icon)}
              <span>{btn.label}</span>
            </button>
          ))}

          {/* Help Button */}
          {helpContent && (
            <button
              onClick={() => setShowHelp(true)}
              title="화면 도움말"
              className="ml-1 w-7 h-7 bg-slate-700 hover:bg-slate-600 text-white rounded-full transition-colors border border-slate-500 flex items-center justify-center cursor-pointer shadow-xs"
            >
              <HelpCircle className="w-4 h-4 text-amber-300" />
            </button>
          )}
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-md shadow-2xl border border-gray-400 w-[480px] text-gray-800 text-[12px] overflow-hidden">
            <div className="bg-[#333333] text-white px-3 py-2 flex items-center justify-between font-bold">
              <span>[도움말] {displayTitle}</span>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-300 hover:text-white font-bold text-sm px-1"
              >
                ✕
              </button>
            </div>
            <div className="p-4 leading-relaxed text-gray-700 whitespace-pre-line bg-[#fbfbfb]">
              {helpContent}
            </div>
            <div className="bg-[#f0f0f0] border-t border-gray-300 px-3 py-2 flex justify-end">
              <button
                onClick={() => setShowHelp(false)}
                className="px-4 py-1 bg-[#6c8ebf] hover:bg-[#5a7cae] text-white font-semibold rounded text-[11px]"
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

