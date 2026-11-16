'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Mail,
  Download,
  CheckCircle2,
  RotateCcw,
  RefreshCw,
  Phone,
  AlertTriangle,
  Send,
  Zap,
  FileSpreadsheet,
  ArrowRight,
  Radar,
} from 'lucide-react';
import {
  ORDER_PLATFORM_OPTIONS,
  ORDER_WAVE_OPTIONS,
  getCutoffStatus,
  parseCutoffMinutes,
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
  remark?: string;
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
  cutoffStatus: ReturnType<typeof getCutoffStatus>;
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
  onJumpToOrderSheet?: (filter: { supplier?: string; wave?: OrderWaveCode | 'ALL'; platform?: OrderPlatformCode | 'ALL' }) => void;
  onDispatched?: () => void;
}

function toSafeHttpUrl(raw?: string | null): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return `https://${s}`;
  return null;
}

export const OrderDispatchDrawer: React.FC<OrderDispatchDrawerProps> = ({
  isOpen,
  onClose,
  defaultDate,
  partnerProfiles = [],
  initialSupplierFilter = '',
  initialWaveFilter = 'ALL',
  initialPlatformFilter = 'ALL',
  initialTab = 'watchtower',
  onJumpToOrderSheet,
  onDispatched,
}) => {
  const [activeTab, setActiveTab] = useState<'watchtower' | 'dispatch'>(initialTab);
  const [targetDate, setTargetDate] = useState(defaultDate);
  const [orders, setOrders] = useState<DispatchableOrder[]>([]);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [weekdayChar, setWeekdayChar] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'DONE'>('ALL');
  const [onlyActionableSlots, setOnlyActionableSlots] = useState(true);
  const [waveFilter, setWaveFilter] = useState<OrderWaveCode | 'ALL'>(initialWaveFilter);
  const [platformFilter, setPlatformFilter] = useState<OrderPlatformCode | 'ALL'>(initialPlatformFilter);
  const [searchKw, setSearchKw] = useState(initialSupplierFilter);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  useEffect(() => {
    if (isOpen) {
      setTargetDate(defaultDate);
      setSearchKw(initialSupplierFilter || '');
      setWaveFilter(initialWaveFilter || 'ALL');
      setPlatformFilter(initialPlatformFilter || 'ALL');
      setActiveTab(initialTab);
    }
  }, [isOpen, defaultDate, initialSupplierFilter, initialWaveFilter, initialPlatformFilter, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const profileByName = useMemo(() => {
    const map = new Map<string, PartnerOrderProfile>();
    partnerProfiles.forEach((p) => {
      if (p.name) map.set(p.name.trim(), p);
    });
    return map;
  }, [partnerProfiles]);

  const loadData = useCallback(async () => {
    if (!targetDate) return;
    setLoading(true);
    try {
      const [poRes, schedRes] = await Promise.all([
        fetch(
          `/api/purchase/order?startDate=${encodeURIComponent(targetDate)}&endDate=${encodeURIComponent(targetDate)}`,
          { cache: 'no-store' }
        ),
        fetch(`/api/purchase/order-schedule?date=${encodeURIComponent(targetDate)}`, {
          cache: 'no-store',
        }),
      ]);
      const [poJson, schedJson] = await Promise.all([poRes.json(), schedRes.json()]);
      if (poJson.success && Array.isArray(poJson.data)) {
        setOrders(poJson.data.filter((o: DispatchableOrder) => o.status !== '취소'));
      }
      if (schedJson.success && schedJson.data) {
        setScheduleSlots(Array.isArray(schedJson.data.slots) ? schedJson.data.slots : []);
        setWeekdayChar(schedJson.data.weekdayChar || '');
      }
    } catch (e) {
      console.error('발주 관제 데이터 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen, loadData]);

  const enrichedOrders = useMemo(() => {
    return orders
      .map((po) => {
        const fallbackProfile = profileByName.get((po.partnerName || '').trim());
        const mergedPartner = {
          ...fallbackProfile,
          ...po.partner,
        };
        const tempHint = po.details.map((d) => d.productName).join(' ');
        const resolved = resolveOrderPlatformAndCutoff({
          partnerName: po.partnerName,
          orderChannel: mergedPartner.orderChannel,
          orderMethod: mergedPartner.orderMethod,
          orderCutoffTime: mergedPartner.orderCutoffTime,
          tempHint,
        });
        const cutoff = getCutoffStatus(resolved.cutoffTime, nowTick);
        const isDone = po.dispatchStatus === '발송완료';
        return {
          po,
          partner: mergedPartner,
          platform: resolved.platform,
          platformMeta: resolved.platformMeta,
          platformDetail: resolved.platformDetail,
          cutoffTime: resolved.cutoffTime,
          wave: resolved.wave,
          cutoff,
          isDone,
        };
      })
      .sort((a, b) => {
        if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
        const am = parseCutoffMinutes(a.cutoffTime);
        const bm = parseCutoffMinutes(b.cutoffTime);
        if (am !== null && bm !== null && am !== bm) return am - bm;
        if (am !== null && bm === null) return -1;
        if (am === null && bm !== null) return 1;
        return a.po.partnerName.localeCompare(b.po.partnerName, 'ko');
      });
  }, [orders, profileByName, nowTick]);

  const filteredSlots = useMemo(() => {
    const kw = searchKw.trim().toLowerCase();
    return scheduleSlots.filter((s) => {
      if (onlyActionableSlots && s.slotStatus === 'NO_NEED') return false;
      if (waveFilter !== 'ALL' && s.wave !== waveFilter) return false;
      if (platformFilter !== 'ALL' && s.platform !== platformFilter) return false;
      if (kw && !s.slotLabel.toLowerCase().includes(kw) && !s.partnerName.toLowerCase().includes(kw)) {
        return false;
      }
      return true;
    });
  }, [scheduleSlots, onlyActionableSlots, waveFilter, platformFilter, searchKw]);

  const filteredOrders = useMemo(() => {
    const kw = searchKw.trim().toLowerCase();
    return enrichedOrders.filter((item) => {
      if (statusFilter === 'PENDING' && item.isDone) return false;
      if (statusFilter === 'DONE' && !item.isDone) return false;
      if (waveFilter !== 'ALL' && item.wave !== waveFilter) return false;
      if (platformFilter !== 'ALL' && item.platform !== platformFilter) return false;
      if (
        kw &&
        !item.po.partnerName.toLowerCase().includes(kw) &&
        !item.po.orderNo.toLowerCase().includes(kw)
      ) {
        return false;
      }
      return true;
    });
  }, [enrichedOrders, statusFilter, waveFilter, platformFilter, searchKw]);

  const waveBadgeCounts = useMemo(() => {
    const map = new Map<OrderWaveCode | 'ALL', number>();
    map.set('ALL', 0);
    ORDER_WAVE_OPTIONS.forEach((w) => map.set(w.code, 0));
    if (activeTab === 'watchtower') {
      scheduleSlots.forEach((s) => {
        if (s.slotStatus === 'NEEDS_ORDER' || s.slotStatus === 'CONFIRMED_PENDING') {
          map.set('ALL', (map.get('ALL') || 0) + 1);
          map.set(s.wave, (map.get(s.wave) || 0) + 1);
        }
      });
    } else {
      enrichedOrders.forEach((it) => {
        if (!it.isDone) {
          map.set('ALL', (map.get('ALL') || 0) + 1);
          map.set(it.wave, (map.get(it.wave) || 0) + 1);
        }
      });
    }
    return map;
  }, [activeTab, scheduleSlots, enrichedOrders]);

  const handleCopyMessage = async (item: (typeof enrichedOrders)[number]) => {
    const text = formatOrderMessageText({
      partnerName: item.po.partnerName,
      orderDate: item.po.orderDate,
      deliveryDate: item.po.deliveryDate,
      orderNote: item.partner.orderNote,
      items: item.po.details.map((d) => ({
        name: d.productName,
        qty: d.expectedBoxQty && d.expectedBoxQty > 0 ? d.expectedBoxQty : d.orderQty,
        unit: d.expectedBoxQty && d.expectedBoxQty > 0 ? 'BOX' : d.unit || 'EA',
      })),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.po.id);
      setTimeout(() => setCopiedId((prev) => (prev === item.po.id ? null : prev)), 2000);
      return true;
    } catch {
      alert('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
      return false;
    }
  };

  const handleCopyAndDispatch = async (item: (typeof enrichedOrders)[number]) => {
    const copied = await handleCopyMessage(item);
    if (copied && !item.isDone) {
      await handleToggleDispatch(item.po, '발송완료', item.platform);
    }
  };

  const handleOpenMail = (item: (typeof enrichedOrders)[number]) => {
    const to = item.partner.email || '';
    const subject = `[GFS 발주서] ${item.po.partnerName} (${item.po.orderDate} / ${item.po.orderNo})`;
    const body = formatOrderMessageText({
      partnerName: item.po.partnerName,
      orderDate: item.po.orderDate,
      deliveryDate: item.po.deliveryDate,
      orderNote: item.partner.orderNote,
      items: item.po.details.map((d) => ({
        name: d.productName,
        qty: d.expectedBoxQty && d.expectedBoxQty > 0 ? d.expectedBoxQty : d.orderQty,
        unit: d.expectedBoxQty && d.expectedBoxQty > 0 ? 'BOX' : d.unit || 'EA',
      })),
    });
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleDownloadExcel = (item: (typeof enrichedOrders)[number]) => {
    const rows = item.po.details.map((d, idx) => ({
      순번: idx + 1,
      발주번호: item.po.orderNo,
      거래처명: item.po.partnerName,
      품목코드: d.productCode,
      품명: d.productName,
      단위: d.unit || 'EA',
      발주수량: d.orderQty,
      박스환산: d.expectedBoxQty || 0,
      단가: d.unitPrice,
      금액: d.amount,
    }));
    exportGridToExcel({
      filename: `발주서_${item.po.partnerName}_${item.po.orderDate}`,
      sheetName: '발주서',
      columns: [
        { key: '순번', label: '순번', format: 'number' },
        { key: '발주번호', label: '발주번호' },
        { key: '거래처명', label: '거래처명' },
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

  const handleBatchDownloadExcel = () => {
    if (filteredOrders.length === 0) return;
    const rows: any[] = [];
    let seq = 1;
    filteredOrders.forEach((item) => {
      item.po.details.forEach((d) => {
        rows.push({
          순번: seq++,
          마감시간: item.cutoffTime || '-',
          플랫폼: item.platformDetail || item.platformMeta.label,
          거래처명: item.po.partnerName,
          발주번호: item.po.orderNo,
          입고예정일: item.po.deliveryDate || '-',
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
    const waveTag = waveFilter === 'ALL' ? '전체시간대' : waveFilter;
    const platTag =
      platformFilter === 'ALL'
        ? '전체플랫폼'
        : ORDER_PLATFORM_OPTIONS.find((p) => p.code === platformFilter)?.shortLabel || platformFilter;
    exportGridToExcel({
      filename: `일괄발주_${targetDate}_${waveTag}_${platTag}`,
      sheetName: '일괄발주목록',
      columns: [
        { key: '순번', label: '순번', format: 'number' },
        { key: '마감시간', label: '마감시간' },
        { key: '플랫폼', label: '발주처/플랫폼' },
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

  const handleToggleDispatch = async (
    po: DispatchableOrder,
    nextStatus: '발송완료' | '미발송',
    channelCode: string
  ) => {
    setUpdatingId(po.id);
    try {
      const res = await fetch('/api/purchase/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dispatch',
          id: po.id,
          dispatchStatus: nextStatus,
          dispatchChannel: channelCode,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === po.id
              ? {
                  ...o,
                  dispatchStatus: nextStatus,
                  dispatchChannel: nextStatus === '발송완료' ? channelCode : '',
                  dispatchedAt: nextStatus === '발송완료' ? new Date().toISOString() : null,
                  dispatchedBy: json.dispatchedBy || '',
                }
              : o
          )
        );
        void loadData();
        onDispatched?.();
      } else {
        alert(json.error || '발송 상태 변경 실패');
      }
    } catch (e: any) {
      alert(e.message || '네트워크 오류');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBatchDispatchDone = async () => {
    const pendingIds = filteredOrders.filter((it) => !it.isDone).map((it) => it.po.id);
    if (pendingIds.length === 0) return;
    if (!confirm(`현재 표시된 미발송 ${pendingIds.length}건을 모두 [발송완료] 처리할까요?`)) return;
    setBatchUpdating(true);
    try {
      const res = await fetch('/api/purchase/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dispatch',
          ids: pendingIds,
          dispatchStatus: '발송완료',
          dispatchChannel: platformFilter === 'ALL' ? 'BATCH' : platformFilter,
        }),
      });
      const json = await res.json();
      if (json.success) {
        void loadData();
        onDispatched?.();
      } else {
        alert(json.error || '일괄 발송완료 처리 실패');
      }
    } catch (e: any) {
      alert(e.message || '네트워크 오류');
    } finally {
      setBatchUpdating(false);
    }
  };

  if (!isOpen) return null;

  const filteredPendingCount = filteredOrders.filter((x) => !x.isDone).length;
  const needsOrderTotal = scheduleSlots.filter((s) => s.slotStatus === 'NEEDS_ORDER').length;
  const confirmedPendingTotal = scheduleSlots.filter((s) => s.slotStatus === 'CONFIRMED_PENDING').length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-[1px]">
      <div className="w-full max-w-[900px] h-full bg-slate-50 shadow-2xl border-l border-slate-200 flex flex-col">
        {/* 헤더 */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Radar className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-[15px] font-bold leading-tight">
                오늘의 발주 마감 관제 · 채널별 실행 센터
              </h2>
              <p className="text-[11px] text-slate-300 mt-0.5">
                오늘 요일({weekdayChar || '-'}) · 실시간 시각 · 필요 재고를 교차 판정해 11시~16시 발주할 곳을 안내합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 상단 모드 탭 + 날짜 */}
        <div className="bg-white border-b border-slate-200 px-5 py-3 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('watchtower')}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-extrabold transition cursor-pointer inline-flex items-center gap-1.5 ${
                  activeTab === 'watchtower'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>시간대별 발주 관제표</span>
                {needsOrderTotal + confirmedPendingTotal > 0 && (
                  <span className="px-1.5 rounded-full bg-rose-500 text-white text-[10px]">
                    {needsOrderTotal + confirmedPendingTotal}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('dispatch')}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-extrabold transition cursor-pointer inline-flex items-center gap-1.5 ${
                  activeTab === 'dispatch'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>확정 발주서 실행 큐</span>
                {enrichedOrders.filter((o) => !o.isDone).length > 0 && (
                  <span className="px-1.5 rounded-full bg-amber-400 text-slate-950 text-[10px]">
                    {enrichedOrders.filter((o) => !o.isDone).length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-[12px] font-bold text-slate-800"
              />
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                새로고침
              </button>
            </div>
          </div>

          {/* 1) 마감 시간대 웨이브 탭 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setWaveFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition cursor-pointer ${
                waveFilter === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              전체 웨이브 ({waveBadgeCounts.get('ALL') || 0})
            </button>
            {ORDER_WAVE_OPTIONS.map((w) => {
              const cnt = waveBadgeCounts.get(w.code) || 0;
              const active = waveFilter === w.code;
              return (
                <button
                  key={w.code}
                  type="button"
                  onClick={() => setWaveFilter(w.code)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    active
                      ? 'bg-rose-600 text-white border-rose-700'
                      : cnt > 0
                        ? 'bg-rose-50/70 text-rose-900 border-rose-200 hover:bg-rose-100'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>{w.label}</span>
                  <span
                    className={`px-1.5 rounded-full text-[10px] font-black ${
                      active ? 'bg-white/25 text-white' : cnt > 0 ? 'bg-rose-200 text-rose-900' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 2) 플랫폼 필터 & 검색 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPlatformFilter('ALL')}
              className={`px-2 py-1 rounded-md text-[11px] font-bold border transition cursor-pointer ${
                platformFilter === 'ALL'
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              전체 플랫폼
            </button>
            {ORDER_PLATFORM_OPTIONS.filter((p) => p.code !== 'OTHER').map((p) => {
              const active = platformFilter === p.code;
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPlatformFilter(p.code)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border transition cursor-pointer ${
                    active ? 'bg-indigo-600 text-white border-indigo-700' : `${p.badgeClass} hover:opacity-85`
                  }`}
                >
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              );
            })}

            {activeTab === 'watchtower' ? (
              <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyActionableSlots}
                  onChange={(e) => setOnlyActionableSlots(e.target.checked)}
                  className="rounded border-slate-300"
                />
                오늘 발주 필요·진행건만 보기
              </label>
            ) : (
              <div className="flex rounded-md border border-slate-200 overflow-hidden text-[11px] font-bold ml-auto">
                {([
                  ['ALL', '전체'],
                  ['PENDING', '미발송'],
                  ['DONE', '완료'],
                ] as const).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStatusFilter(k)}
                    className={`px-2 py-1 transition-colors cursor-pointer ${
                      statusFilter === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            )}

            <input
              type="text"
              value={searchKw}
              onChange={(e) => setSearchKw(e.target.value)}
              placeholder="거래처 검색..."
              className="w-[140px] border border-slate-200 rounded px-2 py-1 text-[11px]"
            />
          </div>

          {/* 실행 큐 묶음 액션 바 */}
          {activeTab === 'dispatch' && filteredOrders.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-semibold text-slate-600">
                표시: <strong className="text-slate-900">{filteredOrders.length}건</strong> (미발송{' '}
                <strong className="text-amber-700">{filteredPendingCount}건</strong>)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleBatchDownloadExcel}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  현재 목록 통합 엑셀 ({filteredOrders.length}건)
                </button>
                {filteredPendingCount > 0 && (
                  <button
                    type="button"
                    disabled={batchUpdating}
                    onClick={() => void handleBatchDispatchDone()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    미발송 {filteredPendingCount}건 일괄 발송완료
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-[13px]">
              오늘의 발주 시간표와 재고 현황을 분석하는 중...
            </div>
          ) : activeTab === 'watchtower' ? (
            filteredSlots.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-500 text-[13px]">
                선택한 조건에서 오늘 발주가 필요한 거래처가 없습니다.
                <div className="text-[11px] text-slate-400 mt-1">
                  우측 상단 &ldquo;오늘 발주 필요·진행건만 보기&rdquo; 체크를 해제하면 재고 충분·비발주일 거래처도 모두 볼 수 있습니다.
                </div>
              </div>
            ) : (
              filteredSlots.map((slot) => {
                const platMeta =
                  ORDER_PLATFORM_OPTIONS.find((p) => p.code === slot.platform) || ORDER_PLATFORM_OPTIONS[5];
                const isUrgent =
                  (slot.slotStatus === 'NEEDS_ORDER' || slot.slotStatus === 'CONFIRMED_PENDING') &&
                  (slot.cutoffStatus.status === 'overdue' || slot.cutoffStatus.status === 'urgent');
                return (
                  <div
                    key={slot.slotKey}
                    className={`rounded-xl border p-3.5 bg-white shadow-2xs transition ${
                      slot.slotStatus === 'DISPATCHED'
                        ? 'border-emerald-200 bg-emerald-50/20 opacity-85'
                        : isUrgent
                          ? 'border-rose-300 ring-1 ring-rose-100'
                          : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[14px] font-extrabold text-slate-900">{slot.slotLabel}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${platMeta.badgeClass}`}>
                            <span>{platMeta.emoji}</span>
                            <span>{slot.platformDetail || platMeta.label}</span>
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${slot.cutoffStatus.badgeClass}`}>
                            <Clock className="w-3 h-3" />
                            <span>{slot.cutoffStatus.label}</span>
                          </span>
                          {slot.slotStatus === 'NEEDS_ORDER' && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black">
                              발주필요 ({slot.orderableCount}품목 / {slot.orderableBoxes}b)
                            </span>
                          )}
                          {slot.slotStatus === 'CONFIRMED_PENDING' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
                              PO확정 · 미발송 ({slot.confirmedOrders.length}건)
                            </span>
                          )}
                          {slot.slotStatus === 'DISPATCHED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black">
                              <CheckCircle2 className="w-3 h-3" /> 발송완료
                            </span>
                          )}
                          {slot.slotStatus === 'NO_NEED' && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">
                              {slot.isOrderDayToday ? '금일 재고충분' : `비발주일 (${slot.orderDay})`}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
                          {slot.orderDay && <span>발주요일: {slot.orderDay}</span>}
                          {slot.contactPerson && (
                            <span>
                              담당: {slot.contactPerson} {slot.contactTel || slot.tel || ''}
                            </span>
                          )}
                          {!slot.contactPerson && slot.tel && <span>연락처: {slot.tel}</span>}
                          {slot.email && <span>이메일: {slot.email}</span>}
                        </div>
                        {slot.orderNote && (
                          <div className="mt-1.5 text-[11px] bg-amber-50 text-amber-900 border border-amber-200 rounded px-2 py-0.5 inline-block">
                            📌 {slot.orderNote}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {slot.slotStatus === 'CONFIRMED_PENDING' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchKw(slot.partnerName);
                              setActiveTab('dispatch');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" /> 바로 전송하기
                          </button>
                        ) : (
                          onJumpToOrderSheet && (
                            <button
                              type="button"
                              onClick={() => {
                                onJumpToOrderSheet({
                                  supplier: slot.partnerName,
                                  wave: slot.wave,
                                  platform: slot.platform,
                                });
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer"
                            >
                              <span>발주시트 열기</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-500 text-[13px]">
              해당 웨이브/플랫폼 조건의 확정 발주서가 없습니다.
              <div className="text-[11px] text-slate-400 mt-1">
                [시간대별 발주 관제표]에서 &ldquo;발주시트 열기&rdquo;로 발주서를 확정 저장하면 이곳에서 일괄 전송·복사할 수 있습니다.
              </div>
            </div>
          ) : (
            filteredOrders.map((item) => {
              const { po, partner, platformMeta, platformDetail, cutoff, isDone } = item;
              const isExpanded = expandedId === po.id;
              return (
                <div
                  key={po.id}
                  className={`rounded-xl border transition-all bg-white shadow-sm ${
                    isDone
                      ? 'border-emerald-200 bg-emerald-50/20 opacity-85'
                      : cutoff.status === 'overdue' || cutoff.status === 'urgent'
                        ? 'border-rose-300 ring-1 ring-rose-100'
                        : 'border-slate-200'
                  }`}
                >
                  <div className="p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[14px] font-extrabold text-slate-900">{po.partnerName}</span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${platformMeta.badgeClass}`}
                          >
                            <span>{platformMeta.emoji}</span>
                            <span>{platformDetail || platformMeta.label}</span>
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cutoff.badgeClass}`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>{cutoff.label}</span>
                          </span>
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" /> 발송완료
                              {po.dispatchedBy ? ` (${po.dispatchedBy})` : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                              미발송
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          <span className="font-mono">{po.orderNo}</span>
                          <span>
                            입고예정: <strong className="text-slate-700">{po.deliveryDate || '-'}</strong>
                          </span>
                          <span>
                            품목: <strong className="text-slate-700">{po.details.length}건</strong>
                          </span>
                          <span>
                            합계:{' '}
                            <strong className="text-slate-800">₩{Math.round(po.totalAmount).toLocaleString()}</strong>
                          </span>
                          {partner.contactPerson && (
                            <span>
                              담당: {partner.contactPerson} {partner.contactTel || partner.tel || ''}
                            </span>
                          )}
                          {!partner.contactPerson && partner.tel && (
                            <span className="inline-flex items-center gap-0.5">
                              <Phone className="w-3 h-3" /> {partner.tel}
                            </span>
                          )}
                        </div>
                        {partner.orderNote && (
                          <div className="mt-1.5 text-[11px] bg-amber-50 text-amber-900 border border-amber-200 rounded px-2 py-0.5 inline-block">
                            📌 {partner.orderNote}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={updatingId === po.id}
                        onClick={() =>
                          void handleToggleDispatch(po, isDone ? '미발송' : '발송완료', item.platform)
                        }
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer ${
                          isDone
                            ? 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                        }`}
                      >
                        {isDone ? (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" /> 미발송으로
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> 발송완료 처리
                          </>
                        )}
                      </button>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.platform === 'KAKAO' && !isDone && (
                          <button
                            type="button"
                            disabled={updatingId === po.id}
                            onClick={() => void handleCopyAndDispatch(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-amber-500 text-white border border-amber-600 hover:bg-amber-600 transition-colors cursor-pointer"
                          >
                            <Zap className="w-3.5 h-3.5" /> 카톡 복사 &amp; 완료
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleCopyMessage(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border bg-white text-slate-700 border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          {copiedId === po.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" /> 복사됨!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> 문구 복사
                            </>
                          )}
                        </button>

                        {(() => {
                          const safeUrl = toSafeHttpUrl(partner.orderPortalUrl);
                          return safeUrl ? (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> 포털 열기
                            </a>
                          ) : null;
                        })()}

                        {(item.platform === 'EMAIL' || partner.email) && (
                          <button
                            type="button"
                            onClick={() => handleOpenMail(item)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                              item.platform === 'EMAIL'
                                ? 'bg-sky-600 text-white border-sky-700 hover:bg-sky-700'
                                : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'
                            }`}
                          >
                            <Mail className="w-3.5 h-3.5" /> 메일 작성
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDownloadExcel(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" /> 엑셀
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : po.id)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                      >
                        {isExpanded ? '품목 접기' : `품목 ${po.details.length}건 보기`}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-2.5 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-[11px]">
                          <thead className="bg-slate-100 text-slate-600">
                            <tr>
                              <th className="py-1.5 px-2.5 text-left">품명</th>
                              <th className="py-1.5 px-2 text-right">발주수량</th>
                              <th className="py-1.5 px-2 text-right">박스환산</th>
                              <th className="py-1.5 px-2.5 text-right">금액</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/70">
                            {po.details.map((d) => (
                              <tr key={d.id}>
                                <td className="py-1 px-2.5 font-medium text-slate-800">{d.productName}</td>
                                <td className="py-1 px-2 text-right tabular-nums text-slate-700">
                                  {d.orderQty.toLocaleString()} {d.unit}
                                </td>
                                <td className="py-1 px-2 text-right tabular-nums font-bold text-indigo-700">
                                  {d.expectedBoxQty ? `${d.expectedBoxQty} BOX` : '-'}
                                </td>
                                <td className="py-1 px-2.5 text-right tabular-nums text-slate-700">
                                  ₩{Math.round(d.amount).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

