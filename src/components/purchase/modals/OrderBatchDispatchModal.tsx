'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Mail,
  Send,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import {
  buildOrderMethodGuide,
  type OrderChannelKind,
  type OrderGuideItem,
  type ResolvedOrderMethod,
} from '@/lib/gfs/orderMethodHelper';

export interface BatchDispatchSupplier {
  supplier: string;
  info: ResolvedOrderMethod;
  partnerEmail?: string;
  items: OrderGuideItem[];
  isConfirmed: boolean;
}

interface Props {
  isOpen: boolean;
  orderDate: string;
  suppliers: BatchDispatchSupplier[];
  onClose: () => void;
}

const CHANNEL_TABS: Array<{ key: 'ALL' | OrderChannelKind; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: '카톡', label: '카톡' },
  { key: '발주고', label: '발주고' },
  { key: '통합구매', label: '통합구매' },
  { key: '자사전산', label: '자사전산' },
  { key: '이메일', label: '이메일' },
  { key: '전화', label: '전화' },
  { key: '기타', label: '기타' },
];

export function OrderBatchDispatchModal({ isOpen, orderDate, suppliers, onClose }: Props) {
  const [channelTab, setChannelTab] = useState<'ALL' | OrderChannelKind>('ALL');
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);
  const [copiedSupplier, setCopiedSupplier] = useState<string | null>(null);
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  const storageKey = `gfs-dispatch-sent::${orderDate}`;

  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      setSentMap(saved ? JSON.parse(saved) : {});
    } catch {
      setSentMap({});
    }
  }, [isOpen, storageKey]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const toggleSent = (supplier: string) => {
    setSentMap((prev) => {
      const next = { ...prev, [supplier]: !prev[supplier] };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const scopedSuppliers = useMemo(() => {
    return onlyConfirmed ? suppliers.filter((s) => s.isConfirmed) : suppliers;
  }, [suppliers, onlyConfirmed]);

  const visibleSuppliers = useMemo(() => {
    const filtered =
      channelTab === 'ALL'
        ? scopedSuppliers
        : scopedSuppliers.filter((s) => s.info.channel === channelTab);

    return [...filtered].sort((a, b) => {
      const sa = sentMap[a.supplier] ? 1 : 0;
      const sb = sentMap[b.supplier] ? 1 : 0;
      if (sa !== sb) return sa - sb;
      const ca = a.info.cutoffMinutes ?? 9999;
      const cb = b.info.cutoffMinutes ?? 9999;
      return ca - cb || a.supplier.localeCompare(b.supplier, 'ko');
    });
  }, [scopedSuppliers, channelTab, sentMap]);

  if (!isOpen) return null;

  const sentCount = scopedSuppliers.filter((s) => sentMap[s.supplier]).length;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 상단 헤더 ── */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-slate-800" />
              <h2 className="text-[16px] font-black text-slate-900">
                오늘 발주 전송 모음 ({orderDate})
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[12px] font-bold bg-slate-200 text-slate-800">
                전송 완료 {sentCount} / {scopedSuppliers.length}곳
              </span>
            </div>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              발주방법별로 모아 한 번에 복사·전송하고 완료 체크로 누락을 방지합니다. (마감시각순)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12.5px] font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyConfirmed}
                onChange={(e) => setOnlyConfirmed(e.target.checked)}
                className="w-3.5 h-3.5 accent-slate-900 cursor-pointer"
              />
              <span>확정(PO)·바구니만 보기</span>
            </label>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── 채널별 탭 ── */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex items-center gap-1.5 flex-wrap">
          {CHANNEL_TABS.map((t) => {
            const cnt =
              t.key === 'ALL'
                ? scopedSuppliers.length
                : scopedSuppliers.filter((s) => s.info.channel === t.key).length;
            if (t.key !== 'ALL' && cnt === 0) return null;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setChannelTab(t.key)}
                className={`px-3 py-1 rounded-full text-[12.5px] font-bold border transition cursor-pointer ${
                  channelTab === t.key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {t.label}{' '}
                <span className={`ml-0.5 font-mono text-[11.5px] ${channelTab === t.key ? 'text-slate-300' : 'text-slate-400'}`}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── 거래처별 카드 리스트 ── */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50 space-y-3">
          {visibleSuppliers.length === 0 ? (
            <div className="py-16 text-center text-sm font-bold text-slate-400">
              표시할 발주 대상 거래처가 없습니다.
            </div>
          ) : (
            visibleSuppliers.map((s) => {
              const isSent = Boolean(sentMap[s.supplier]);
              const guide = buildOrderMethodGuide({
                info: s.info,
                supplier: s.supplier,
                orderDate,
                items: s.items,
              });
              const totalBoxes = s.items.reduce((sum, it) => sum + it.boxes, 0);

              return (
                <div
                  key={s.supplier}
                  className={`rounded-xl border p-4 transition ${
                    isSent
                      ? 'bg-slate-100/70 border-slate-200 opacity-70'
                      : 'bg-white border-slate-200 shadow-2xs'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleSent(s.supplier)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold border cursor-pointer transition ${
                          isSent
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {isSent ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span>{isSent ? '전송완료' : '전송대기'}</span>
                      </button>

                      <span className="text-[15px] font-black text-slate-900">{s.supplier}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[12px] font-bold">
                        {s.info.channelLabel || '일반'}
                        {s.info.cutoffTime ? ` · ${s.info.cutoffTime} 마감` : ''}
                        {s.info.tempTag ? ` (${s.info.tempTag})` : ''}
                      </span>
                      <span className="text-[12.5px] font-mono font-bold text-slate-600">
                        {s.items.length}품목 · 총 {totalBoxes.toLocaleString()}박스
                      </span>
                      {s.isConfirmed && (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-bold">
                          확정/담김
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {s.info.channel === '이메일' && s.partnerEmail && (
                        <a
                          href={`mailto:${s.partnerEmail}?subject=${encodeURIComponent(
                            guide.emailSubject || `[GFS 발주] ${s.supplier}`
                          )}&body=${encodeURIComponent(guide.copyText)}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[12.5px] font-bold"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          메일 열기
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(guide.copyText);
                          setCopiedSupplier(s.supplier);
                          window.setTimeout(() => {
                            setCopiedSupplier((cur) => (cur === s.supplier ? null : cur));
                          }, 1600);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12.5px] font-black cursor-pointer transition"
                      >
                        {copiedSupplier === s.supplier ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedSupplier === s.supplier ? '복사됨!' : guide.copyLabel}
                      </button>
                    </div>
                  </div>

                  {s.info.note && (
                    <div className="mb-2 text-[12px] font-bold text-amber-800 bg-amber-50/70 border border-amber-200/80 rounded-lg px-2.5 py-1">
                      ※ {s.info.note}
                    </div>
                  )}

                  <pre className="text-[12.5px] font-sans whitespace-pre-wrap text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">
                    {guide.copyText}
                  </pre>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

