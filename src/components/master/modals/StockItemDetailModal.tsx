'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Package,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Calendar,
  TrendingDown,
  Truck,
  Layers,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { ProductLifecycleBadge } from '@/components/common/ProductLifecycleBadge';
import { normName } from '@/lib/gfs/norm';

export interface StockDetailItem {
  id: number;
  whName: string;
  vendor: string;
  orderSupplier: string;
  orderDays: number;
  itemCode: string;
  lotNo: string;
  lotDate: string;
  burnRank: number;
  fefoWarn: boolean;
  itemType: string;
  category: string;
  itemName: string;
  spec: string;
  unit: string;
  inboundDate: string;
  expiryDate: string;
  orderDay: string;
  dailyUsage: number;
  packUnit: number;
  boxQty: number;
  pieceQty: number;
  inQty: number;
  outQty: number;
  prevStock: number;
  currentStock: number;
  diffStock?: number;
  safetyStock: number;
  status: string;
  stockDays: number | null;
  unitPrice: number;
  boxPrice?: number;
  totalAmount: number;
  productId?: number;
  productStatus?: string;
  isUsed?: boolean;
  discontinuedDate?: string;
}

interface TimelineEntry {
  date: string;
  hasSnapshot: boolean;
  qty: number;
  diffFromPrev: number | null;
  inQty: number;
  outQty: number;
  estimatedUsage: number | null;
}

interface RecentOrderEntry {
  orderNo: string;
  orderDate: string;
  deliveryDate: string;
  status: string;
  orderQty: number;
  receivedQty: number;
  remainQty: number;
  amount: number;
}

interface Props {
  item: StockDetailItem | null;
  allItems: StockDetailItem[];
  targetDate: string;
  onClose: () => void;
  onDeleteProduct: (item: StockDetailItem, reason: string) => Promise<boolean>;
  onRestoreProduct: (item: StockDetailItem) => Promise<void>;
}

export function StockItemDetailModal({
  item,
  allItems,
  targetDate,
  onClose,
  onDeleteProduct,
  onRestoreProduct,
}: Props) {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrderEntry[]>([]);
  const [recentAvgUsage, setRecentAvgUsage] = useState<number | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  // 모달 열릴 때 상태 초기화 및 7일 이력/PO 조회
  useEffect(() => {
    if (!item) return;
    setConfirmDeleteOpen(false);
    setDeleteReason('');
    setTimeline([]);
    setRecentOrders([]);
    setRecentAvgUsage(null);

    const controller = new AbortController();
    setHistoryLoading(true);
    const params = new URLSearchParams({
      name: item.itemName,
      refDate: targetDate,
      days: '7',
    });
    if (item.productId) params.set('productId', String(item.productId));

    fetch(`/api/inventory/item-history?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && json.data) {
          setTimeline(Array.isArray(json.data.timeline) ? json.data.timeline : []);
          setRecentOrders(Array.isArray(json.data.recentOrders) ? json.data.recentOrders : []);
          setRecentAvgUsage(
            typeof json.data.recentAvgUsage === 'number' ? json.data.recentAvgUsage : null
          );
        }
      })
      .catch(() => {
        // 취소 또는 일시 오류 시 기본 표 데이터만 표시
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });

    return () => controller.abort();
  }, [item, targetDate]);

  // 같은 품목의 전 창고·전체 LOT 묶기
  const siblings = useMemo(() => {
    if (!item) return [];
    const targetNorm = normName(item.itemName);
    return allItems
      .filter((d) =>
        item.productId && d.productId
          ? d.productId === item.productId
          : normName(d.itemName) === targetNorm
      )
      .sort((a, b) => {
        const expA = a.expiryDate || '9999-12-31';
        const expB = b.expiryDate || '9999-12-31';
        return expA.localeCompare(expB) || a.whName.localeCompare(b.whName, 'ko');
      });
  }, [item, allItems]);

  if (!item) return null;

  const isDeletedRow = item.productStatus === '삭제' || item.isUsed === false;
  const totalStock = siblings.reduce((s, r) => s + (Number(r.currentStock) || 0), 0);
  const totalPrevStock = siblings.reduce((s, r) => s + (Number(r.prevStock) || 0), 0);
  const totalAmount = siblings.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
  const pack = item.packUnit || 1;
  const totalBoxesApprox = pack > 0 ? Math.floor((totalStock / pack) * 10) / 10 : 0;
  const effectiveDaily = item.dailyUsage || recentAvgUsage || 0;
  const runwayDays =
    effectiveDaily > 0 ? Math.round((totalStock / effectiveDaily) * 10) / 10 : item.stockDays;
  const pendingOrders = recentOrders.filter((o) => o.remainQty > 0 && o.status !== '완료');
  const pendingBoxesTotal = pendingOrders.reduce((s, o) => s + o.remainQty, 0);

  // 삭제 전 3대 위험 신호 체크
  const safetyWarnings: string[] = [];
  if (totalStock > 0) {
    safetyWarnings.push(`현재고 ${totalStock.toLocaleString()}${item.unit || '봉'} (${totalBoxesApprox}박스) 남아 있음`);
  }
  if (pendingOrders.length > 0) {
    safetyWarnings.push(`미입고 발주서 ${pendingOrders.length}건 (${pendingBoxesTotal}박스) 대기 중`);
  }
  if (effectiveDaily > 0) {
    safetyWarnings.push(`일소진량 ${effectiveDaily.toLocaleString()}${item.unit || '봉'}/일 발생 중`);
  }

  const handleConfirmDelete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await onDeleteProduct(item, deleteReason.trim());
      if (ok) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onRestoreProduct(item);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 상단 헤더 ── */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 text-[11px] font-bold">
                <Package className="w-3 h-3" />
                {item.itemType || item.category || '원부자재'}
              </span>
              {item.itemCode && (
                <span className="font-mono text-[11.5px] font-bold text-slate-500">
                  {item.itemCode}
                </span>
              )}
              <ProductLifecycleBadge
                status={item.productStatus}
                discontinuedDate={item.discontinuedDate}
                isUsed={item.isUsed}
                name={item.itemName}
                refDate={targetDate}
              />
            </div>
            <h2
              className={`text-lg font-black tracking-tight leading-snug break-keep ${
                isDeletedRow ? 'line-through text-slate-400' : 'text-slate-900'
              }`}
            >
              {item.itemName}
            </h2>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-slate-600 font-semibold">
              <span>
                거래처: <strong className="text-slate-900">{item.orderSupplier || item.vendor || '-'}</strong>
              </span>
              {item.spec && (
                <span>
                  규격: <strong className="text-slate-800">{item.spec}</strong>
                </span>
              )}
              <span>
                발주요일: <strong className="text-slate-800">{item.orderDay || '-'}</strong>
              </span>
              <span>
                기준일수: <strong className="text-slate-800">{item.orderDays || '-'}일</strong>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer shrink-0"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── 본문 스크롤 영역 ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1) 핵심 KPI 4칸 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500">전 창고 총 현재고</div>
              <div className="mt-1 text-lg font-black font-mono text-slate-900">
                {totalStock.toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-0.5">{item.unit || '봉'}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-semibold">
                약 {totalBoxesApprox}박스 · 전일대비{' '}
                <span className={totalStock - totalPrevStock >= 0 ? 'text-blue-600' : 'text-rose-600'}>
                  {totalStock - totalPrevStock >= 0 ? '+' : ''}
                  {(totalStock - totalPrevStock).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
              <div className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" />
                예상 유지일 (Runway)
              </div>
              <div className="mt-1 text-lg font-black font-mono text-blue-950">
                {runwayDays !== null && runwayDays !== undefined ? `${runwayDays}일` : '-'}
              </div>
              <div className="text-[11px] text-blue-800/80 font-semibold">
                일소진 {effectiveDaily.toLocaleString()}
                {item.unit || '봉'}/일 · 안전재고 {item.safetyStock.toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500">입수 · 단가 · 자산</div>
              <div className="mt-1 text-lg font-black font-mono text-slate-900">
                ₩{Math.round(totalAmount).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 font-semibold">
                입수 {pack} · 봉 ₩{Math.round(item.unitPrice || 0).toLocaleString()} · 박스 ₩
                {Math.round(item.boxPrice || (item.unitPrice || 0) * pack).toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200">
              <div className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" />
                입고 예정 (미입고 PO)
              </div>
              <div className="mt-1 text-lg font-black font-mono text-amber-950">
                {pendingOrders.length > 0 ? `${pendingBoxesTotal.toLocaleString()}박스` : '없음'}
              </div>
              <div className="text-[11px] text-amber-800/80 font-semibold">
                {pendingOrders.length > 0 ? `진행 중 발주서 ${pendingOrders.length}건` : '대기 발주 없음'}
              </div>
            </div>
          </div>

          {/* 2) 전 창고 · 전체 LOT 상세 테이블 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-slate-500" />
                전 창고 · 전체 LOT 현황 ({siblings.length}건)
              </h3>
              <span className="text-[11px] text-slate-500 font-semibold">유통기한 임박순 정렬</span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">창고</th>
                    <th className="py-2 px-2">LOT번호</th>
                    <th className="py-2 px-2">입고일</th>
                    <th className="py-2 px-2">유통기한</th>
                    <th className="py-2 px-2 text-right">박스</th>
                    <th className="py-2 px-2 text-right">낱개</th>
                    <th className="py-2 px-3 text-right">현재고</th>
                    <th className="py-2 px-2 text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {siblings.map((s) => (
                    <tr
                      key={s.id}
                      className={s.id === item.id ? 'bg-blue-50/50 font-semibold' : 'bg-white'}
                    >
                      <td className="py-2 px-3 font-bold text-slate-800">{s.whName || '-'}</td>
                      <td className="py-2 px-2 font-mono text-slate-600">{s.lotNo || '-'}</td>
                      <td className="py-2 px-2 font-mono text-slate-600">{s.inboundDate || '-'}</td>
                      <td className="py-2 px-2 font-mono">
                        <span className={s.fefoWarn ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                          {s.expiryDate || '-'}
                        </span>
                        {s.fefoWarn && (
                          <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-rose-100 text-rose-700 font-black">
                            선입주의
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{s.boxQty.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono">{s.pieceQty.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                        {s.currentStock.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                            s.status === '품절'
                              ? 'bg-rose-100 text-rose-700'
                              : s.status === '부족'
                              ? 'bg-amber-100 text-amber-800'
                              : s.status === '과잉'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3) 최근 7일 재고 변화 & 최근 발주서 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-3.5 bg-white">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  최근 7일 재고 추이
                </h3>
                {historyLoading && <span className="text-[11px] text-slate-400">불러오는 중...</span>}
              </div>
              {timeline.length === 0 && !historyLoading ? (
                <div className="text-xs text-slate-400 py-4 text-center">최근 스냅샷 이력이 없습니다.</div>
              ) : (
                <div className="space-y-1">
                  {timeline.map((t) => (
                    <div
                      key={t.date}
                      className="flex items-center justify-between text-[11.5px] py-1 border-b border-slate-100 last:border-b-0"
                    >
                      <span className="font-mono text-slate-600">{t.date}</span>
                      <div className="flex items-center gap-3 font-mono">
                        {t.inQty > 0 && <span className="text-blue-600 font-bold">+{t.inQty}입고</span>}
                        {t.estimatedUsage !== null && t.estimatedUsage > 0 && (
                          <span className="text-slate-500">소진 {t.estimatedUsage}</span>
                        )}
                        <span className="font-black text-slate-900 w-16 text-right">
                          {t.hasSnapshot ? t.qty.toLocaleString() : '-'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 bg-white">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-slate-500" />
                  최근 발주 / 입고 전표
                </h3>
              </div>
              {recentOrders.length === 0 && !historyLoading ? (
                <div className="text-xs text-slate-400 py-4 text-center">최근 발주 전표가 없습니다.</div>
              ) : (
                <div className="space-y-1.5">
                  {recentOrders.slice(0, 6).map((o) => (
                    <div
                      key={o.orderNo}
                      className="flex items-center justify-between text-[11.5px] py-1 border-b border-slate-100 last:border-b-0"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-800">{o.orderNo}</span>
                        <span className="ml-2 text-slate-500">납기 {o.deliveryDate || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-700">
                          {o.receivedQty}/{o.orderQty}box
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            o.status === '완료'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4) 미사용 품목 삭제 확인 영역 (열렸을 때만 표시) */}
          {confirmDeleteOpen && !isDeletedRow && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-900 space-y-1">
                  <div className="font-black text-sm">정말 이 품목을 미사용(삭제) 처리하시겠습니까?</div>
                  <p className="text-rose-800">
                    소프트 삭제 처리되어 재고조회·자재발주 목록에서 즉시 숨겨지며, 상단{' '}
                    <strong>[삭제·이관 포함]</strong> 체크 후 언제든 복구할 수 있습니다.
                  </p>
                  {safetyWarnings.length > 0 ? (
                    <ul className="mt-1.5 list-disc list-inside font-bold text-rose-700 space-y-0.5">
                      {safetyWarnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-1 inline-flex items-center gap-1 text-emerald-700 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      현재고 0 · 미입고 발주 0 · 일소진 0 — 안전하게 정리 가능한 품목입니다.
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="삭제 사유 (선택사항: 예) 단종, 미사용 자재 정리"
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-rose-200 rounded-lg focus:outline-none focus:border-rose-400"
                />
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(false)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? '처리 중...' : '미사용 삭제 확정'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 하단 푸터 ── */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div>
            {!item.productId ? (
              <span className="text-[11px] text-slate-400">
                미등록 마스터 행은 삭제할 수 없습니다.
              </span>
            ) : isDeletedRow ? (
              <button
                type="button"
                onClick={handleRestore}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer transition disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {isSubmitting ? '복구 중...' : '정상 품목 복구'}
              </button>
            ) : (
              !confirmDeleteOpen && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold cursor-pointer transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  미사용 품목 삭제
                  {safetyWarnings.length > 0 && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  )}
                </button>
              )
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer transition"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

