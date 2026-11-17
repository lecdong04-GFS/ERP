'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let globalShowToast: ((message: string, type?: ToastType, title?: string) => void) | null = null;

/** 어디서든 컴포넌트 외부나 일반 함수에서도 호출 가능한 전역 토스트 헬퍼 */
export const erpToast = {
  success: (msg: string, title?: string) => globalShowToast?.(msg, 'success', title),
  error: (msg: string, title?: string) => globalShowToast?.(msg, 'error', title),
  warning: (msg: string, title?: string) => globalShowToast?.(msg, 'warning', title),
  info: (msg: string, title?: string) => globalShowToast?.(msg, 'info', title),
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration: number = 3500) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev.slice(-4), newToast]); // 최대 5개 유지

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, title: string = '성공') => showToast(message, 'success', title, 3000),
    [showToast]
  );
  const error = useCallback(
    (message: string, title: string = '오류') => showToast(message, 'error', title, 5000),
    [showToast]
  );
  const warning = useCallback(
    (message: string, title: string = '주의') => showToast(message, 'warning', title, 4000),
    [showToast]
  );
  const info = useCallback(
    (message: string, title: string = '알림') => showToast(message, 'info', title, 3500),
    [showToast]
  );

  // 글로벌 헬퍼 바인딩
  globalShowToast = showToast;

  // 네이티브 window.alert를 고급 ERP 토스트로 자동 변환 브릿지
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalAlert = window.alert;

    window.alert = (msg?: any) => {
      const text = String(msg ?? '');
      if (text.includes('실패') || text.includes('오류') || text.includes('에러') || text.includes('불가')) {
        error(text);
      } else if (text.includes('완료') || text.includes('성공') || text.includes('정상') || text.includes('저장') || text.includes('삭제') || text.includes('반영') || text.includes('초기화')) {
        success(text);
      } else if (text.includes('선택') || text.includes('확인') || text.includes('주의') || text.includes('경고') || text.includes('양식') || text.includes('없습니다')) {
        warning(text);
      } else {
        info(text);
      }
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [success, error, warning, info]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, success, error, warning, info, removeToast }}>
      {children}
      {/* Toast Render Container (화면 우측 상단 고정) */}
      <div className="fixed top-11 right-4 z-[9999] flex flex-col gap-2 max-w-[380px] w-full pointer-events-none">
        {toasts.map((toast) => {
          let bgClass = 'bg-slate-900/95 border-slate-700 text-white';
          let icon = <Info className="w-4 h-4 text-sky-400 shrink-0" />;

          if (toast.type === 'success') {
            bgClass = 'bg-emerald-950/95 border-emerald-600 text-emerald-50';
            icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
          } else if (toast.type === 'error') {
            bgClass = 'bg-rose-950/95 border-rose-600 text-rose-50';
            icon = <XCircle className="w-4 h-4 text-rose-400 shrink-0" />;
          } else if (toast.type === 'warning') {
            bgClass = 'bg-amber-950/95 border-amber-600 text-amber-50';
            icon = <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 rounded shadow-xl border text-[12px] transition-all transform animate-in slide-in-from-top-2 duration-200 backdrop-blur-md ${bgClass}`}
            >
              <div className="mt-0.5">{icon}</div>
              <div className="flex-1 min-w-0">
                {toast.title && <div className="font-bold text-[11px] opacity-90">{toast.title}</div>}
                <div className="text-[12px] leading-snug break-keep">{toast.message}</div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-white/60 hover:text-white p-0.5 cursor-pointer ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
