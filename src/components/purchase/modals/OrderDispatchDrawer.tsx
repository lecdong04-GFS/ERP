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
} from 'lucide-react';
import {
  ORDER_CHANNEL_OPTIONS,
  getOrderChannelMeta,
  getCutoffStatus,
  parseCutoffMinutes,
  formatOrderMessageText,
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

interface OrderDispatchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: string;
  partnerProfiles?: PartnerOrderProfile[];
  initialSupplierFilter?: string;
  onDispatched?: () => void;
}

export const OrderDispatchDrawer: React.FC<OrderDispatchDrawerProps> = ({
  isOpen,
  onClose,
  defaultDate,
  partnerProfiles = [],
  initialSupplierFilter = '',
  onDispatched,
}) => {
  const [targetDate, setTargetDate] = useState(defaultDate);
  const [orders, setOrders] = useState<DispatchableOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'DONE'>('ALL');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [searchKw, setSearchKw] = useState(initialSupplierFilter);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  useEffect(() => {
    if (isOpen) {
      setTargetDate(defaultDate);
      setSearchKw(initialSupplierFilter || '');
    }
  }, [isOpen, defaultDate, initialSupplierFilter]);

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

  const loadOrders = useCallback(async () => {
    if (!targetDate) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/purchase/order?startDate=${encodeURIComponent(targetDate)}&endDate=${encodeURIComponent(targetDate)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setOrders(json.data.filter((o: DispatchableOrder) => o.status !== '취소'));
      }
    } catch (e) {
      console.error('발주 실행 목록 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    if (isOpen) {
      void loadOrders();
    }
  }, [isOpen, loadOrders]);

  const enrichedOrders = useMemo(() => {
    return orders
      .map((po) => {
        const fallbackProfile = profileByName.get((po.partnerName || '').trim());
        const mergedPartner = {
          ...fallbackProfile,
          ...po.partner,
        };
        const channelMeta = getOrderChannelMeta(mergedPartner.orderChannel, mergedPartner.orderMethod);
        const cutoff = getCutoffStatus(mergedPartner.orderCutoffTime, nowTick);
        const isDone = po.dispatchStatus === '발송완료';
        return {
          po,
          partner: mergedPartner,
          channelMeta,
          cutoff,
          isDone,
        };
      })
      .sort((a, b) => {
        if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
        const am = parseCutoffMinutes(a.partner.orderCutoffTime);
        const bm = parseCutoffMinutes(b.partner.orderCutoffTime);
        if (am !== null && bm !== null && am !== bm) return am - bm;
        if (am !== null && bm === null) return -1;
        if (am === null && bm !== null) return 1;
        return a.po.partnerName.localeCompare(b.po.partnerName, 'ko');
      });
  }, [orders, profileByName, nowTick]);

  const filteredOrders = useMemo(() => {
    const kw = searchKw.trim().toLowerCase();
    return enrichedOrders.filter((item) => {
      if (statusFilter === 'PENDING' && item.isDone) return false;
      if (statusFilter === 'DONE' && !item.isDone) return false;
      if (channelFilter !== 'ALL' && item.channelMeta.value !== channelFilter) return false;
      if (
        kw &&
        !item.po.partnerName.toLowerCase().includes(kw) &&
        !item.po.orderNo.toLowerCase().includes(kw)
      ) {
        return false;
      }
      return true;
    });
  }, [enrichedOrders, statusFilter, channelFilter, searchKw]);

  const stats = useMemo(() => {
    const total = enrichedOrders.length;
    const done = enrichedOrders.filter((x) => x.isDone).length;
    const pending = total - done;
    const urgent = enrichedOrders.filter(
      (x) => !x.isDone && (x.cutoff.status === 'overdue' || x.cutoff.status === 'urgent')
    ).length;
    return { total, done, pending, urgent };
  }, [enrichedOrders]);

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
    } catch {
      alert('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
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
                }
              : o
          )
        );
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
      <div className="w-full max-w-[780px] h-full bg-slate-50 shadow-2xl border-l border-slate-200 flex flex-col">
        {/* 헤더 */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Send className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-[15px] font-bold leading-tight">채널별 · 마감시간별 발주 실행 큐</h2>
              <p className="text-[11px] text-slate-300 mt-0.5">
                발주처별 마감시간 순으로 정렬되며, 카톡 복사 · 웹포털 열기 · 메일 · 엑셀 후 발송완료를 체크합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 요약 & 필터 바 */}
        <div className="bg-white border-b border-slate-200 px-5 py-3 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-600">발주일자</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-[12px] font-bold text-slate-800"
              />
              <button
                type="button"
                onClick={() => void loadOrders()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                새로고침
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">전체 {stats.total}</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">미발송 {stats.pending}</span>
              {stats.urgent > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> 마감임박/초과 {stats.urgent}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">완료 {stats.done}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-slate-200 overflow-hidden text-[11px] font-bold">
              {([
                ['ALL', '전체'],
                ['PENDING', '미발송'],
                ['DONE', '발송완료'],
              ] as const).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusFilter(k)}
                  className={`px-2.5 py-1 transition-colors ${
                    statusFilter === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="border border-slate-200 rounded px-2 py-1 text-[11px] font-bold text-slate-700 bg-white"
            >
              <option value="ALL">전체 채널</option>
              {ORDER_CHANNEL_OPTIONS.map((ch) => (
                <option key={ch.value} value={ch.value}>
                  {ch.emoji} {ch.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={searchKw}
              onChange={(e) => setSearchKw(e.target.value)}
              placeholder="거래처명 또는 발주번호 검색..."
              className="flex-1 min-w-[160px] border border-slate-200 rounded px-2.5 py-1 text-[11px]"
            />
          </div>
        </div>

        {/* 본문 카드 리스트 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-[13px]">발주서를 불러오는 중...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-500 text-[13px]">
              해당 조건의 발주서가 없습니다.
              <div className="text-[11px] text-slate-400 mt-1">
                먼저 [자재발주(요일별)]에서 발주서를 저장하면 이곳에서 채널·시간대별로 일괄 전송할 수 있습니다.
              </div>
            </div>
          ) : (
            filteredOrders.map((item) => {
              const { po, partner, channelMeta, cutoff, isDone } = item;
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
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${channelMeta.badgeClass}`}>
                            <span>{channelMeta.emoji}</span>
                            <span>{channelMeta.label}</span>
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cutoff.badgeClass}`}>
                            <Clock className="w-3 h-3" />
                            <span>{cutoff.label}</span>
                          </span>
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" /> 발송완료
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                              미발송
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          <span className="font-mono">{po.orderNo}</span>
                          <span>입고예정: <strong className="text-slate-700">{po.deliveryDate || '-'}</strong></span>
                          <span>품목: <strong className="text-slate-700">{po.details.length}건</strong></span>
                          <span>합계: <strong className="text-slate-800">₩{Math.round(po.totalAmount).toLocaleString()}</strong></span>
                          {partner.contactPerson && (
                            <span>담당: {partner.contactPerson} {partner.contactTel || partner.tel || ''}</span>
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

                      {/* 발송완료 토글 버튼 */}
                      <button
                        type="button"
                        disabled={updatingId === po.id}
                        onClick={() =>
                          void handleToggleDispatch(
                            po,
                            isDone ? '미발송' : '발송완료',
                            channelMeta.value
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors shrink-0 ${
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

                    {/* 채널별 원클릭 액션 바 */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleCopyMessage(item)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                            channelMeta.value === 'KAKAO' || channelMeta.value === 'PHONE'
                              ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {copiedId === po.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" /> 복사됨!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> 카톡/문자 복사
                            </>
                          )}
                        </button>

                        {partner.orderPortalUrl ? (
                          <a
                            href={partner.orderPortalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                              channelMeta.value === 'WEB'
                                ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                                : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                            }`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> 웹포털 열기
                          </a>
                        ) : channelMeta.value === 'WEB' ? (
                          <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                            ※ 거래처관리에서 포털 URL 등록 시 바로가기 활성화
                          </span>
                        ) : null}

                        {(channelMeta.value === 'EMAIL' || partner.email) && (
                          <button
                            type="button"
                            onClick={() => handleOpenMail(item)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                              channelMeta.value === 'EMAIL'
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="w-3.5 h-3.5" /> 엑셀
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : po.id)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline"
                      >
                        {isExpanded ? '품목 접기' : `품목 ${po.details.length}건 보기`}
                      </button>
                    </div>

                    {/* 품목 상세 접기/펼치기 */}
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
