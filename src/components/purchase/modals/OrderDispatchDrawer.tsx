'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Mail,
  CheckCircle2,
  RefreshCw,
  FileSpreadsheet,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  ORDER_PLATFORM_OPTIONS,
  ORDER_WAVE_OPTIONS,
  formatOrderMessageText,
  resolveOrderPlatformAndCutoff,
  type OrderPlatformCode,
  type OrderWaveCode,
  type PartnerOrderProfile,
} from '@/lib/gfs/orderChannel';
import { exportGridToExcel } from '@/lib/excelExport';

export interface DispatchableOrder {
  id: number;
  orderNo: string;
  orderDate: string;
  deliveryDate: string;
  partnerId: string;
  partnerName: string;
  status: string;
  dispatchStatus?: string;
  dispatchChannel?: string;
  dispatchedAt?: string | null;
  dispatchedBy?: string;
  totalAmount: number;
  partner?: Partial<PartnerOrderProfile> | null;
  details: Array<{
    id: number;
    productCode: string;
    productName: string;
    unit: string;
    orderQty: number;
    unitPrice: number;
    amount: number;
    expectedBoxQty?: number;
  }>;
}

interface ScheduleSlot {
  slotKey: string;
  partnerId: string;
  partnerName: string;
  slotLabel: string;
  platform: OrderPlatformCode;
  platformDetail: string;
  cutoffTime: string;
  wave: OrderWaveCode;
  orderDay: string;
  isOrderDayToday: boolean;
  orderNote: string;
  orderPortalUrl: string;
  email: string;
  tel: string;
  contactPerson: string;
  contactTel: string;
  orderableCount: number;
  orderableBoxes: number;
  confirmedOrders: Array<{
    id: number;
    orderNo: string;
    deliveryDate: string;
    totalAmount: number;
    dispatchStatus: string;
    dispatchChannel: string;
    dispatchedAt: string | null;
    dispatchedBy: string;
    itemCount: number;
  }>;
  slotStatus: 'DISPATCHED' | 'CONFIRMED_PENDING' | 'NEEDS_ORDER' | 'NO_NEED';
}

interface OrderDispatchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: string;
  partnerProfiles?: PartnerOrderProfile[];
  initialSupplierFilter?: string;
  initialWaveFilter?: OrderWaveCode | 'ALL';
  initialPlatformFilter?: OrderPlatformCode | 'ALL';
  initialTab?: 'watchtower' | 'dispatch';
  onJumpToOrderSheet?: (filter: { supplier?: string }) => void;
  onDispatched?: () => void;
}

function toSafeHttpUrl(raw?: string | null): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return `https://${s}`;
  return null;
}

function pickDefaultWave(slots: ScheduleSlot[]): OrderWaveCode {
  const actionable = (w: OrderWaveCode) =>
    slots.some(
      (s) => s.wave === w && (s.slotStatus === 'NEEDS_ORDER' || s.slotStatus === 'CONFIRMED_PENDING')
    );
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const mins = nowKst.getUTCHours() * 60 + nowKst.getUTCMinutes();

  const order: OrderWaveCode[] =
    mins <= 11 * 60 + 15
      ? ['11:00', '12:00', '13:00', '14:00+', 'UNSET']
      : mins <= 12 * 60 + 15
        ? ['11:00', '12:00', '13:00', '14:00+', 'UNSET']
        : mins <= 13 * 60 + 30
          ? ['13:00', '11:00', '12:00', '14:00+', 'UNSET']
          : ['14:00+', '13:00', '11:00', '12:00', 'UNSET'];

  for (const w of order) {
    if (actionable(w)) return w;
  }
  return mins <= 11 * 60 ? '11:00' : mins <= 13 * 60 ? '13:00' : '14:00+';
}

export const OrderDispatchDrawer: React.FC<OrderDispatchDrawerProps> = ({
  isOpen,
  onClose,
  defaultDate,
  partnerProfiles = [],
  onJumpToOrderSheet,
  onDispatched,
}) => {
  const [targetDate, setTargetDate] = useState(defaultDate);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [orders, setOrders] = useState<DispatchableOrder[]>([]);
  const [weekdayChar, setWeekdayChar] = useState('');
  const [selectedWave, setSelectedWave] = useState<OrderWaveCode>('11:00');
  const [showAllInWave, setShowAllInWave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setTargetDate(defaultDate);
  }, [isOpen, defaultDate]);

  const loadData = useCallback(async () => {
    if (!targetDate) return;
    setLoading(true);
    try {
      const [schedRes, poRes] = await Promise.all([
        fetch(`/api/purchase/order-schedule?date=${encodeURIComponent(targetDate)}`, {
          cache: 'no-store',
        }),
        fetch(
          `/api/purchase/order?startDate=${encodeURIComponent(targetDate)}&endDate=${encodeURIComponent(targetDate)}`,
          { cache: 'no-store' }
        ),
      ]);
      const [schedJson, poJson] = await Promise.all([schedRes.json(), poRes.json()]);
      if (schedJson.success && schedJson.data) {
        const loadedSlots: ScheduleSlot[] = Array.isArray(schedJson.data.slots)
          ? schedJson.data.slots
          : [];
        setSlots(loadedSlots);
        setWeekdayChar(schedJson.data.weekdayChar || '');
        setSelectedWave((prev) => {
          const hasAny = loadedSlots.some((s) => s.wave === prev);
          return hasAny ? prev : pickDefaultWave(loadedSlots);
        });
      }
      if (poJson.success && Array.isArray(poJson.data)) {
        setOrders(poJson.data.filter((o: DispatchableOrder) => o.status !== '취소'));
      }
    } catch (e) {
      console.error('발주 시간표 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    if (isOpen) void loadData();
  }, [isOpen, loadData]);

  // First load auto-focus wave
  useEffect(() => {
    if (isOpen && slots.length > 0) {
      setSelectedWave(pickDefaultWave(slots));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const profileByName = useMemo(() => {
    const map = new Map<string, PartnerOrderProfile>();
    partnerProfiles.forEach((p) => {
      if (p.name) map.set(p.name.trim(), p);
    });
    return map;
  }, [partnerProfiles]);

  // Map PO id -> full DispatchableOrder
  const poById = useMemo(() => {
    const map = new Map<number, DispatchableOrder>();
    orders.forEach((o) => map.set(o.id, o));
    return map;
  }, [orders]);

  // Wave counts (remaining actionable slots)
  const waveCounts = useMemo(() => {
    const map = new Map<OrderWaveCode, { todo: number; done: number }>();
    ORDER_WAVE_OPTIONS.forEach((w) => map.set(w.code, { todo: 0, done: 0 }));
    slots.forEach((s) => {
      const cur = map.get(s.wave) || { todo: 0, done: 0 };
      if (s.slotStatus === 'NEEDS_ORDER' || s.slotStatus === 'CONFIRMED_PENDING') {
        cur.todo += 1;
      } else if (s.slotStatus === 'DISPATCHED') {
        cur.done += 1;
      }
      map.set(s.wave, cur);
    });
    return map;
  }, [slots]);

  // Slots in selected wave, grouped by platform
  const platformGroups = useMemo(() => {
    const inWave = slots.filter((s) => {
      if (s.wave !== selectedWave) return false;
      if (!showAllInWave && s.slotStatus === 'NO_NEED') return false;
      return true;
    });

    const groups = new Map<OrderPlatformCode, ScheduleSlot[]>();
    ORDER_PLATFORM_OPTIONS.forEach((p) => groups.set(p.code, []));
    inWave.forEach((s) => {
      const arr = groups.get(s.platform) || [];
      arr.push(s);
      groups.set(s.platform, arr);
    });

    return ORDER_PLATFORM_OPTIONS.map((meta) => ({
      meta,
      items: groups.get(meta.code) || [],
    })).filter((g) => g.items.length > 0);
  }, [slots, selectedWave, showAllInWave]);

  const handleDispatchIds = async (ids: number[], nextStatus: '발송완료' | '미발송', channel: string, key: string) => {
    if (ids.length === 0) return;
    setBusyKey(key);
    try {
      const res = await fetch('/api/purchase/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dispatch',
          ids,
          dispatchStatus: nextStatus,
          dispatchChannel: channel,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await loadData();
        onDispatched?.();
      } else {
        alert(json.error || '상태 변경 실패');
      }
    } catch (e: any) {
      alert(e.message || '네트워크 오류');
    } finally {
      setBusyKey(null);
    }
  };

  const handleCopySlotMessage = async (slot: ScheduleSlot, alsoComplete: boolean) => {
    const poIds = slot.confirmedOrders.map((c) => c.id);
    const fullPos = poIds.map((id) => poById.get(id)).filter((x): x is DispatchableOrder => Boolean(x));
    if (fullPos.length === 0) {
      // No PO yet -> jump to order sheet
      if (onJumpToOrderSheet) {
        onJumpToOrderSheet({ supplier: slot.partnerName });
        onClose();
      }
      return;
    }
    const items = fullPos.flatMap((po) =>
      po.details.map((d) => ({
        name: d.productName,
        qty: d.expectedBoxQty && d.expectedBoxQty > 0 ? d.expectedBoxQty : d.orderQty,
        unit: d.expectedBoxQty && d.expectedBoxQty > 0 ? 'BOX' : d.unit || 'EA',
      }))
    );
    const text = formatOrderMessageText({
      partnerName: slot.partnerName,
      orderDate: targetDate,
      deliveryDate: fullPos[0]?.deliveryDate || '',
      orderNote: slot.orderNote,
      items,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(slot.slotKey);
      setTimeout(() => setCopiedKey((prev) => (prev === slot.slotKey ? null : prev)), 2000);
      if (alsoComplete && slot.slotStatus === 'CONFIRMED_PENDING') {
        await handleDispatchIds(poIds, '발송완료', slot.platform, slot.slotKey);
      }
    } catch {
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  const handleExportPlatformExcel = (platformLabel: string, groupSlots: ScheduleSlot[]) => {
    const rows: any[] = [];
    let seq = 1;
    groupSlots.forEach((slot) => {
      slot.confirmedOrders.forEach((c) => {
        const po = poById.get(c.id);
        if (!po) return;
        const prof = profileByName.get(po.partnerName.trim());
        const resolved = resolveOrderPlatformAndCutoff({
          partnerName: po.partnerName,
          orderChannel: prof?.orderChannel,
          orderMethod: prof?.orderMethod,
          orderCutoffTime: prof?.orderCutoffTime,
          tempHint: po.details.map((d) => d.productName).join(' '),
        });
        po.details.forEach((d) => {
          rows.push({
            순번: seq++,
            마감시간: resolved.cutoffTime || '-',
            발주처: resolved.platformDetail || platformLabel,
            거래처명: po.partnerName,
            발주번호: po.orderNo,
            입고예정일: po.deliveryDate || '-',
            품목코드: d.productCode,
            품명: d.productName,
            단위: d.unit || 'EA',
            발주수량: d.orderQty,
            박스환산: d.expectedBoxQty || 0,
            단가: d.unitPrice,
            금액: d.amount,
          });
        });
      });
    });
    if (rows.length === 0) {
      alert('먼저 발주시트에서 발주 확정(PO 생성)을 진행해주세요.');
      return;
    }
    exportGridToExcel({
      filename: `${platformLabel}_${selectedWave}_${targetDate}`,
      sheetName: platformLabel,
      columns: [
        { key: '순번', label: '순번', format: 'number' },
        { key: '마감시간', label: '마감시간' },
        { key: '발주처', label: '발주처' },
        { key: '거래처명', label: '거래처명' },
        { key: '발주번호', label: '발주번호' },
        { key: '입고예정일', label: '입고예정일' },
        { key: '품목코드', label: '품목코드' },
        { key: '품명', label: '품명' },
        { key: '단위', label: '단위' },
        { key: '발주수량', label: '발주수량', format: 'number' },
        { key: '박스환산', label: '박스환산', format: 'number' },
        { key: '단가', label: '단가', format: 'currency' },
        { key: '금액', label: '금액', format: 'currency' },
      ],
      data: rows,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-[820px] h-[620px] max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* 상단 심플 헤더 */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-slate-700" />
            <h2 className="text-[15px] font-extrabold text-slate-900">
              시간대별 발주 체크리스트
            </h2>
            <span className="text-[12px] text-slate-500 font-medium">
              ({targetDate} · {weekdayChar || '-'}요일)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-[12px] font-semibold text-slate-800 bg-white"
            />
            <button
              type="button"
              onClick={() => void loadData()}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 본문: 좌측 5개 시간대 / 우측 플랫폼별 묶음 */}
        <div className="flex-1 flex min-h-0">
          {/* 좌측 시간대 사이드바 */}
          <div className="w-[175px] border-r border-slate-200 bg-slate-50/70 p-2.5 space-y-1 shrink-0">
            <div className="px-2 py-1 text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
              마감 시간대
            </div>
            {ORDER_WAVE_OPTIONS.map((w) => {
              const cnt = waveCounts.get(w.code) || { todo: 0, done: 0 };
              const active = selectedWave === w.code;
              return (
                <button
                  key={w.code}
                  type="button"
                  onClick={() => setSelectedWave(w.code)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[12.5px] font-bold transition cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  <span>{w.shortLabel} 마감</span>
                  {cnt.todo > 0 ? (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-black ${
                        active ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {cnt.todo}
                    </span>
                  ) : cnt.done > 0 ? (
                    <CheckCircle2 className={`w-3.5 h-3.5 ${active ? 'text-emerald-400' : 'text-emerald-600'}`} />
                  ) : (
                    <span className="text-[10.5px] opacity-40">0</span>
                  )}
                </button>
              );
            })}

            <div className="pt-3 mt-3 border-t border-slate-200 px-2">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAllInWave}
                  onChange={(e) => setShowAllInWave(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>재고충분 포함</span>
              </label>
            </div>
          </div>

          {/* 우측: 선택된 시간대만 플랫폼별 묶음으로 깔끔히 표시 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
            {loading ? (
              <div className="py-20 text-center text-[13px] text-slate-400">
                시간표를 불러오는 중...
              </div>
            ) : platformGroups.length === 0 ? (
              <div className="py-20 text-center text-[13px] text-slate-400">
                이 시간대에 오늘 발주할 곳이 없습니다.
              </div>
            ) : (
              platformGroups.map(({ meta, items }) => {
                const pendingPoIds = items
                  .filter((s) => s.slotStatus === 'CONFIRMED_PENDING')
                  .flatMap((s) => s.confirmedOrders.map((c) => c.id));
                const anyConfirmed = items.some((s) => s.confirmedOrders.length > 0);
                return (
                  <div key={meta.code} className="rounded-xl border border-slate-200 overflow-hidden">
                    {/* 플랫폼 묶음 헤더 */}
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px]">{meta.emoji}</span>
                        <span className="text-[13px] font-extrabold text-slate-900">{meta.label}</span>
                        <span className="text-[11.5px] font-bold text-slate-500">({items.length}곳)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {anyConfirmed && (
                          <button
                            type="button"
                            onClick={() => handleExportPlatformExcel(meta.label, items)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                            엑셀 1개로 받기
                          </button>
                        )}
                        {pendingPoIds.length > 0 && (
                          <button
                            type="button"
                            disabled={busyKey === meta.code}
                            onClick={() => void handleDispatchIds(pendingPoIds, '발송완료', meta.code, meta.code)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            모두 완료 ({pendingPoIds.length})
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 심플 단일행 리스트 */}
                    <div className="divide-y divide-slate-100">
                      {items.map((slot) => {
                        const isDone = slot.slotStatus === 'DISPATCHED';
                        const isPending = slot.slotStatus === 'CONFIRMED_PENDING';
                        const isNeed = slot.slotStatus === 'NEEDS_ORDER';
                        const poIds = slot.confirmedOrders.map((c) => c.id);
                        const safeUrl = toSafeHttpUrl(slot.orderPortalUrl);

                        return (
                          <div
                            key={slot.slotKey}
                            className={`px-4 py-2.5 flex items-center justify-between gap-3 transition ${
                              isDone ? 'bg-slate-50/50 opacity-55' : 'hover:bg-slate-50/60'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[13px] font-bold truncate ${
                                    isDone ? 'line-through text-slate-400' : 'text-slate-900'
                                  }`}
                                >
                                  {slot.slotLabel}
                                </span>
                                {isNeed && (
                                  <span className="text-[11px] font-bold text-rose-600">
                                    발주필요 · {slot.orderableCount}품목 ({slot.orderableBoxes}b)
                                  </span>
                                )}
                                {isPending && (
                                  <span className="text-[11px] font-bold text-amber-600">
                                    PO확정 · 미발송
                                  </span>
                                )}
                                {isDone && (
                                  <span className="text-[11px] font-semibold text-emerald-600">
                                    발송완료
                                  </span>
                                )}
                                {slot.slotStatus === 'NO_NEED' && (
                                  <span className="text-[11px] text-slate-400">
                                    {slot.isOrderDayToday ? '재고충분' : `비발주일 (${slot.orderDay})`}
                                  </span>
                                )}
                              </div>
                              {slot.orderNote && !isDone && (
                                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                  ※ {slot.orderNote}
                                </div>
                              )}
                            </div>

                            {/* 딱 1개의 주 액션 버튼 */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {safeUrl && !isDone && (
                                <a
                                  href={safeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200"
                                  title="발주 사이트 열기"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}

                              {isNeed && onJumpToOrderSheet && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onJumpToOrderSheet({ supplier: slot.partnerName });
                                    onClose();
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  <span>시트에서 확정</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}

                              {isPending && slot.platform === 'KAKAO' && (
                                <button
                                  type="button"
                                  disabled={busyKey === slot.slotKey}
                                  onClick={() => void handleCopySlotMessage(slot, true)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  {copiedKey === slot.slotKey ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" /> 복사됨
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" /> 복사 &amp; 완료
                                    </>
                                  )}
                                </button>
                              )}

                              {isPending && slot.platform === 'EMAIL' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const po = poById.get(poIds[0]);
                                    if (!po) return;
                                    const body = formatOrderMessageText({
                                      partnerName: slot.partnerName,
                                      orderDate: targetDate,
                                      deliveryDate: po.deliveryDate,
                                      orderNote: slot.orderNote,
                                      items: po.details.map((d) => ({
                                        name: d.productName,
                                        qty: d.expectedBoxQty || d.orderQty,
                                        unit: d.expectedBoxQty ? 'BOX' : d.unit || 'EA',
                                      })),
                                    });
                                    window.location.href = `mailto:${encodeURIComponent(slot.email || '')}?subject=${encodeURIComponent(`[GFS 발주서] ${slot.partnerName} (${targetDate})`)}&body=${encodeURIComponent(body)}`;
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  <Mail className="w-3.5 h-3.5" /> 메일
                                </button>
                              )}

                              {isPending && slot.platform !== 'KAKAO' && (
                                <button
                                  type="button"
                                  disabled={busyKey === slot.slotKey}
                                  onClick={() => void handleDispatchIds(poIds, '발송완료', slot.platform, slot.slotKey)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> 완료
                                </button>
                              )}

                              {isDone && (
                                <button
                                  type="button"
                                  disabled={busyKey === slot.slotKey}
                                  onClick={() => void handleDispatchIds(poIds, '미발송', '', slot.slotKey)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 text-[10.5px] font-semibold cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" /> 취소
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
