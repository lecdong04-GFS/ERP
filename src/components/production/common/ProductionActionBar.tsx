'use client';

import React, { useState } from 'react';
import { useTabs, DASHBOARD_TAB_ID } from '@/context/TabContext';
import { HelpCircle, Check, RotateCcw, Search, Save, FileText, Layers, ListOrdered, Printer, Plus, Trash2, FileSpreadsheet, Sparkles } from 'lucide-react';

export interface ProductionActionButton {
  key: string;
  label: string;
  icon?: 'search' | 'save' | 'reset' | 'print' | 'doc' | 'list' | 'plus' | 'trash' | 'excel' | 'sparkles';
  onClick?: () => void;
  disabled?: boolean;
}

interface ProductionActionBarProps {
  title: string;
  buttons?: ProductionActionButton[];
  helpContent?: string;
}

export const ProductionActionBar: React.FC<ProductionActionBarProps> = ({
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
        return <Search size={12} className="stroke-[2.5]" />;
      case 'save':
        return <Save size={12} className="stroke-[2.5]" />;
      case 'reset':
        return <RotateCcw size={12} className="stroke-[2.5]" />;
      case 'print':
        return <Printer size={12} className="stroke-[2.5]" />;
      case 'doc':
        return <FileText size={12} className="stroke-[2.5]" />;
      case 'list':
        return <ListOrdered size={12} className="stroke-[2.5]" />;
      case 'plus':
        return <Plus size={12} className="stroke-[2.5]" />;
      case 'trash':
        return <Trash2 size={12} className="stroke-[2.5]" />;
      case 'excel':
        return <FileSpreadsheet size={12} className="stroke-[2.5]" />;
      case 'sparkles':
        return <Sparkles size={12} className="stroke-[2.5]" />;
      default:
        return null;
    }
  };

  return (
    <div className="h-[44px] bg-[#1e293b] border-b border-slate-900 px-3.5 flex items-center justify-between text-white select-none relative z-10 shrink-0 shadow-xs">
      {/* Title */}
      <div className="flex items-center gap-2.5">
        <span className="w-2.5 h-4 bg-[#60a5fa] rounded-2xs shadow-xs inline-block" />
        <h1 className="text-[15px] font-black tracking-tight text-white">{displayTitle}</h1>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {buttons.map((btn) => (
          <button
            key={btn.key}
            type="button"
            onClick={btn.onClick}
            disabled={btn.disabled}
            className={`h-7.5 px-3 py-1 text-[12px] font-bold rounded-xs border transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
              btn.disabled
                ? 'bg-gray-600 text-gray-400 border-gray-700 cursor-not-allowed'
                : 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] hover:from-[#60a5fa] hover:to-[#2563eb] text-white border-[#1e40af] active:translate-y-px'
            }`}
          >
            {renderIcon(btn.icon)}
            <span>{btn.label}</span>
          </button>
        ))}

        {/* Circular Help Button */}
        <button
          type="button"
          onClick={() => setShowHelp((prev) => !prev)}
          className="w-7 h-7 ml-1 rounded-full bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center text-[12px] font-bold border border-slate-500 cursor-pointer transition-colors shadow-xs"
          title="도움말 보기"
        >
          ?
        </button>
      </div>

      {/* Help Popup */}
      {showHelp && (
        <div className="absolute right-3 top-[34px] w-80 bg-white border border-gray-600 shadow-2xl p-3 z-50 text-gray-800 rounded-xs">
          <div className="flex items-center justify-between border-b border-gray-300 pb-1.5 mb-2">
            <span className="font-bold text-[12px] text-gray-900 flex items-center gap-1.5">
              <HelpCircle size={14} className="text-[#6c8ebf]" />
              {displayTitle} 도움말
            </span>
            <button
              onClick={() => setShowHelp(false)}
              className="text-gray-400 hover:text-gray-700 font-bold text-xs"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-line">
            {helpContent ||
              `${displayTitle} 화면입니다. 상단 기능 버튼을 사용하여 실적 등록, 작업지시 확인 및 저장을 수행할 수 있습니다.`}
          </p>
        </div>
      )}
    </div>
  );
};

