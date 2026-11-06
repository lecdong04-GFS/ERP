'use client';

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { HelpCircle, AlertTriangle, AlertCircle, Check, X } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger' | 'warning';
}

interface ConfirmContextType {
  confirmModal: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

let globalConfirm: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

export const erpConfirm = (
  message: string,
  title?: string,
  variant: 'primary' | 'danger' | 'warning' = 'primary'
): Promise<boolean> => {
  if (globalConfirm) {
    return globalConfirm({ message, title, variant });
  }
  return Promise.resolve(typeof window !== 'undefined' ? window.confirm(message) : true);
};

export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: '' });
  const resolverRef = useRef<((val: boolean) => void) | null>(null);

  const confirmModal = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
      setIsOpen(true);
    });
  }, []);

  globalConfirm = confirmModal;

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(true);
  }, []);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(false);
  }, []);

  // ESC 키로 취소, Enter 키로 확인
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCancel, handleConfirm]);

  return (
    <ConfirmContext.Provider value={{ confirmModal }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 animate-in fade-in duration-100">
          <div className="bg-white border-2 border-slate-600 rounded-xl shadow-2xl w-[460px] max-w-full text-xs animate-in zoom-in-95 duration-150 overflow-hidden">
            {/* Header */}
            <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center justify-between font-bold text-[13px] border-b border-slate-700">
              <div className="flex items-center gap-2">
                {options.variant === 'danger' ? (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                ) : options.variant === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : (
                  <HelpCircle className="w-4 h-4 text-sky-400" />
                )}
                <span>{options.title || '확인'}</span>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="text-gray-400 hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 bg-[#f8fafc] text-slate-800 text-[12.5px] leading-relaxed break-keep min-h-[80px] whitespace-pre-wrap">
              {options.message}
            </div>

            {/* Footer Buttons */}
            <div className="px-4 py-3 bg-slate-100 border-t border-slate-300 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[12px] border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                {options.cancelText || '취소'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                autoFocus
                className={`px-4 py-1.5 text-white font-bold text-[12px] rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                  options.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500 border border-rose-700'
                    : options.variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-500 border border-amber-700'
                    : 'bg-blue-600 hover:bg-blue-500 border border-blue-700'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>{options.confirmText || '확인'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export function useConfirm(): ConfirmContextType {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
