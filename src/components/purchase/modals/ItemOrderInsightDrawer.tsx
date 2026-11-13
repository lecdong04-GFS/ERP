'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus as MinusIcon,
  Plus,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  ShoppingCart,
  Sparkles,
  FileText,
  RefreshCw,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { DAY_CHARS, addDaysYmd, getWeekdayCharYmd } from '@/lib/gfs/orderCalc';
import { findNovLedgerRef } from '@/lib/gfs/novLedgerRef';

export interface ItemOrderInsightTarget {
  rowId: number;
  productId?: number;
  name: string;
  supplier: string;
  warehouse: string;
  pattern: string;
  pack: number;
  boxPrice: number;
  currentStock: number;
  incoming: number;
  totalStock: number;
  dailyUsage: number;
  stockDays: number;
  targetDays: number;
  targetStock: number;
  shortageBags: number;
  suggestedBoxes: number;
  autoDayQty: number;
  dayQty: number;
  pendingBoxes: number;
  pendingOrderNos: string[];
  isConfirmedOnTargetDay: boolean;
  confirmedTodayBoxes: number;
  isStaged: boolean;
  targetDayDate: string;
  targetDayIdx: number;
  auditStatus: string;
  auditLabel: string;
}

interface TimelinePoint {
  date: string;
  hasSnapshot: boolean;
  qty: number | null;
  boxQty: number | null;
  diffFromPrev: number | null;
  inQty: number;
  outQty: number;
  estimatedUsage: number | null;
  orderedBoxes: number;
  receivedBoxes: number;
  orderNos: string[];
  expiryDates: string[];
}

interface RecentOrderItem {
  orderNo: string;
  orderDate: string;
  deliveryDate: string;
  status: string;
  orderType: string;
  orderQty: number;
  receivedQty: number;
  remainQty: number;
  amount: number;
}

interface HistoryResponse {
  refDate: string;
  latestExpiryDate: string;
  recentAvgUsage: number | null;
  usageSampleDays: number;
  timeline: TimelinePoint[];
  recentOrders: RecentOrderItem[];
}

interface ItemOrderInsightDrawerProps {
  item: ItemOrderInsightTarget | null;
  refDate: string;
  onClose: () => void;
  onAdjustQty: (rowId: number, nextQty: number) => void;
  onResetToAuto: (rowId: number) => void;
  onToggleStage: (rowId: number) => void;
}

export const ItemOrderInsightDrawer: React.FC<ItemOrderInsightDrawerProps> = ({
  item,
  refDate,
  onClose,
  onAdjustQty,
  onResetToAuto,
  onToggleStage,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const isOpen = Boolean(item);

  // 마운트 직후 다음 페인트 프레임에서 translate-x-0으로 전환해 오른쪽 끝에서 스르륵 슬라이드-인
  useEffect(() => {
    if (!isOpen) {
      setIsVisible(false);
      return;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsVisible(false);
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    if (closeTimerRef.current !== null) return;
    setIsVisible(false);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 260);
  }, [onClose]);

  useEffect(() => {
    if (!item) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [item, handleClose]);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHoverIdx(null);

    const params = new URLSearchParams({
      productId: String(item.productId || item.rowId || 0),
      name: item.name,
      refDate: refDate || item.targetDayDate,
      days: '7',
    });

    fetch(`/api/inventory/item-history?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          setError(json.error || '재고 이력을 불러오지 못했습니다.');
          setHistory(null);
        } else {
          setHistory(json.data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '네트워크 오류가 발생했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item?.rowId, item?.productId, item?.name, refDate]);

  // 과거 7일 실적 + 향후 5일 발주 시뮬레이션 결합 데이터
  const chartData = useMemo(() => {
    if (!item) return null;
    const timeline = history?.timeline || [];
    const baseDaily = item.dailyUsage > 0 ? item.dailyUsage : history?.recentAvgUsage || 0;
    const pack = item.pack > 0 ? item.pack : 1;

    // 과거 7일 포인트
    const pastPoints = timeline.map((t) => ({
      date: t.date,
      label: `${t.date.slice(5)}(${getWeekdayCharYmd(t.date)})`,
      kind: 'past' as const,
      qty: t.qty,
      hasSnapshot: t.hasSnapshot,
      diffFromPrev: t.diffFromPrev,
      orderedBoxes: t.orderedBoxes,
      estimatedUsage: t.estimatedUsage,
      qtyWithoutOrder: null as number | null,
    }));

    // 오늘 기준 가용재고 (실재고 + 기발주 입고예정) vs 오늘 발주 추가 시
    const todayBaseStock = item.currentStock + item.incoming;
    const todayOrderBags = Math.max(0, item.dayQty) * pack;

    const futurePoints: typeof pastPoints = [];
    let stockWithOrder = todayBaseStock + todayOrderBags;
    let stockNoOrder = todayBaseStock;
    let stockoutDayNoOrder: string | null = null;

    for (let d = 1; d <= 5; d++) {
      const fDate = addDaysYmd(item.targetDayDate || refDate, d);
      stockWithOrder = Math.max(0, stockWithOrder - baseDaily);
      stockNoOrder = Math.max(0, stockNoOrder - baseDaily);
      if (stockNoOrder <= 0 && !stockoutDayNoOrder && baseDaily > 0) {
        stockoutDayNoOrder = `${fDate.slice(5)}(${getWeekdayCharYmd(fDate)})`;
      }
      futurePoints.push({
        date: fDate,
        label: `${fDate.slice(5)}(${getWeekdayCharYmd(fDate)})`,
        kind: 'future' as any,
        qty: Math.round(stockWithOrder),
        hasSnapshot: true,
        diffFromPrev: -Math.round(baseDaily),
        orderedBoxes: 0,
        estimatedUsage: Math.round(baseDaily),
        qtyWithoutOrder: Math.round(stockNoOrder),
      });
    }

    const allPoints = [...pastPoints, ...futurePoints];
    const maxVal = Math.max(
      item.targetStock * 1.15,
      ...allPoints.map((p) => Math.max(p.qty ?? 0, p.qtyWithoutOrder ?? 0)),
      10
    );

    return {
      pastPoints,
      futurePoints,
      allPoints,
      maxVal,
      stockoutDayNoOrder,
      baseDaily,
    };
  }, [item, history, refDate]);

  if (!item) return null;

  // 최근 7일 실소진량 vs 마스터 일소진량 괴리율 계산
  const recentAvg = history?.recentAvgUsage ?? null;
  const usageDeltaPct =
    recentAvg !== null && item.dailyUsage > 0
      ? Math.round(((recentAvg - item.dailyUsage) / item.dailyUsage) * 100)
      : null;

  const pack = item.pack > 0 ? item.pack : 1;
  const currentBoxes = item.currentStock / pack;
  const incomingBoxes = item.incoming / pack;
  const afterOrderDays =
    item.dailyUsage > 0
      ? (item.totalStock + Math.max(0, item.dayQty) * pack) / item.dailyUsage
      : item.stockDays;
  const addedDays = Math.max(0, afterOrderDays - item.stockDays);

  // SVG 차트 좌표 계산 상수
  const W = 560;
  const H = 190;
  const PAD_L = 44;
  const PAD_R = 16;
  const PAD_T = 18;
  const PAD_B = 34;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const pts = chartData?.allPoints || [];
  const maxVal = chartData?.maxVal || 100;
  const getX = (i: number) =>
    pts.length > 1 ? PAD_L + (i / (pts.length - 1)) * plotW : PAD_L + plotW / 2;
  const getY = (val: number) => PAD_T + plotH - (Math.min(val, maxVal) / maxVal) * plotH;

  const safetyY = item.targetStock > 0 ? getY(item.targetStock) : null;

  // 과거 실선 path
  const pastPath = pts
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => p.kind === 'past' && p.qty !== null)
    .map(({ p, idx }, i) => `${i === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(p.qty!).toFixed(1)}`)
    .join(' ');

  // 미래 예측선(발주 반영) path: 마지막 과거 포인트(또는 오늘)에서 연결
  const lastPastWithQty = [...pts]
    .map((p, idx) => ({ p, idx }))
    .reverse()
    .find(({ p }) => p.kind === 'past' && p.qty !== null);
  const futureStartAnchor = lastPastWithQty
    ? { idx: lastPastWithQty.idx, val: lastPastWithQty.p.qty! }
    : { idx: Math.max(0, (chartData?.pastPoints.length || 1) - 1), val: item.currentStock };

  const futureOrderPath = [
    `M ${getX(futureStartAnchor.idx).toFixed(1)} ${getY(futureStartAnchor.val).toFixed(1)}`,
    ...pts
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => (p.kind as string) === 'future' && p.qty !== null)
      .map(({ p, idx }) => `L ${getX(idx).toFixed(1)} ${getY(p.qty!).toFixed(1)}`),
  ].join(' ');

  const futureNoOrderPath = [
    `M ${getX(futureStartAnchor.idx).toFixed(1)} ${getY(futureStartAnchor.val).toFixed(1)}`,
    ...pts
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => (p.kind as string) === 'future' && p.qtyWithoutOrder !== null)
      .map(({ p, idx }) => `L ${getX(idx).toFixed(1)} ${getY(p.qtyWithoutOrder!).toFixed(1)}`),
  ].join(' ');

  const hoveredPoint = hoverIdx !== null && pts[hoverIdx] ? pts[hoverIdx] : null;
  const novRef = useMemo(() => findNovLedgerRef(item?.name || ''), [item?.name]);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-300 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* 바깥 영역 클릭 시 닫기 */}
      <div className="flex-1" onClick={handleClose} />

      {/* 우측 슬라이드 드로어 */}
      <div
        className={`w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden transform transition-transform duration-300 ease-out will-change-transform ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ── 상단 헤더 ── */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-blue-600 text-[11px] font-black tracking-tight">
                {item.supplier || '거래처 미지정'}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-700 text-slate-200 text-[11px] font-bold">
                {item.warehouse || '창고미상'} · {item.pattern}
              </span>
              {history?.latestExpiryDate && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[11px] font-bold">
                  유통기한 {history.latestExpiryDate}
                </span>
              )}
            </div>
            <h2 className="text-lg font-black tracking-tight text-white mt-1 truncate" title={item.name}>
              {item.name}
            </h2>
            <div className="text-xs text-slate-300 mt-0.5 flex items-center gap-3 flex-wrap font-mono">
              <span>입수: 1박스 = {pack.toLocaleString()}봉</span>
              <span>박스단가: ₩{Math.round(item.boxPrice).toLocaleString()}</span>
              <span>기준일: {item.targetDayDate} ({DAY_CHARS[item.targetDayIdx]}요일)</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── 본문 스크롤 영역 ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/70">
          {/* 1. 현 재고 상태 4대 핵심 지표 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                <span>현 실재고</span>
                <Package className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="text-base font-black text-slate-900 font-mono mt-1">
                {item.currentStock.toLocaleString()}
                <span className="text-xs font-sans font-bold text-slate-500 ml-0.5">봉</span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                약 {currentBoxes.toFixed(1)}박스
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                <span>입고예정(기발주)</span>
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="text-base font-black text-emerald-700 font-mono mt-1">
                +{item.incoming.toLocaleString()}
                <span className="text-xs font-sans font-bold text-emerald-600 ml-0.5">봉</span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate" title={item.pendingOrderNos.join(', ')}>
                {item.pendingBoxes > 0
                  ? `${item.pendingBoxes}박스 (${item.pendingOrderNos.length}건)`
                  : `${incomingBoxes.toFixed(1)}박스`}
              </div>
            </div>

            <div
              className={`rounded-xl p-3 border shadow-2xs ${
                item.stockDays < 1.5
                  ? 'bg-rose-50 border-rose-200'
                  : item.stockDays < item.targetDays
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                <span>버팀일수 (Runway)</span>
                {item.stockDays < 1.5 && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
              </div>
              <div className="flex items-baseline gap-1.5 flex-wrap mt-1">
                <span
                  className={`text-base font-black font-mono ${
                    item.stockDays < 1.5
                      ? 'text-rose-700'
                      : item.stockDays < item.targetDays
                      ? 'text-amber-700'
                      : 'text-slate-900'
                  }`}
                >
                  {Number.isFinite(item.stockDays) ? `${item.stockDays.toFixed(1)}일` : '-'}
                </span>
                {item.dayQty > 0 && item.dailyUsage > 0 && (
                  <span
                    className={`text-xs font-mono font-black ${
                      afterOrderDays >= item.targetDays ? 'text-blue-700' : 'text-amber-700'
                    }`}
                  >
                    ➔ {afterOrderDays.toFixed(1)}일
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                목표 {Number(item.targetDays.toFixed(1))}일 ({item.targetStock.toLocaleString()}봉)
                {item.dayQty > 0 && item.dailyUsage > 0 && (
                  <span className="ml-1 font-mono font-bold text-blue-600">
                    (+{addedDays.toFixed(1)}일)
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                <span>7일 실소진 vs 기준</span>
                {usageDeltaPct !== null && usageDeltaPct >= 20 ? (
                  <Flame className="w-3.5 h-3.5 text-rose-500" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                )}
              </div>
              <div className="text-base font-black text-slate-900 font-mono mt-1">
                {recentAvg !== null ? recentAvg.toLocaleString() : item.dailyUsage.toLocaleString()}
                <span className="text-xs font-sans font-bold text-slate-500 ml-0.5">봉/일</span>
              </div>
              <div className="text-[11px] mt-0.5 flex items-center gap-1">
                <span className="text-slate-500">기준 {item.dailyUsage.toLocaleString()}</span>
                {usageDeltaPct !== null && (
                  <span
                    className={`font-black px-1 rounded ${
                      usageDeltaPct >= 15
                        ? 'bg-rose-100 text-rose-700'
                        : usageDeltaPct <= -15
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {usageDeltaPct > 0 ? `+${usageDeltaPct}%` : `${usageDeltaPct}%`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 소진량 급증 또는 결품 경고 인사이트 배너 */}
          {((usageDeltaPct !== null && usageDeltaPct >= 20) || chartData?.stockoutDayNoOrder) && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                {chartData?.stockoutDayNoOrder && (
                  <div>
                    <strong className="text-rose-700">결품 경고:</strong> 오늘 추가 발주 없이 현재 소진 속도가 유지되면{' '}
                    <strong className="underline">{chartData.stockoutDayNoOrder}</strong>경 재고가 바닥납니다.
                    {item.dayQty > 0 && (
                      <span className="text-emerald-800 font-bold ml-1">
                        (현재 {item.dayQty}박스 발주 시 안정 유지)
                      </span>
                    )}
                  </div>
                )}
                {usageDeltaPct !== null && usageDeltaPct >= 20 && (
                  <div>
                    <strong className="text-amber-900">소진 급증 감지:</strong> 최근 7일 현장 실소진량(
                    {recentAvg?.toLocaleString()}봉/일)이 기준 소진량({item.dailyUsage.toLocaleString()}봉/일)보다{' '}
                    <strong>{usageDeltaPct}% 높습니다</strong>. 필요 시 +1~2박스 여유 발주를 검토하세요.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. 과거 7일 실적 + 향후 5일 예상 재고 추이 차트 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>최근 7일 재고 변화 & 향후 5일 발주 시뮬레이션</span>
              </div>
              <div className="flex items-center gap-3 text-[10.5px] font-bold text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-blue-600 inline-block" /> 과거 재고
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block" /> 발주({item.dayQty}b) 후
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 border-t-2 border-dashed border-rose-400 inline-block" /> 미발주 시
                </span>
                {safetyY !== null && (
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-0.5 border-t border-dotted border-amber-600 inline-block" /> 목표안전
                  </span>
                )}
              </div>
            </div>

            {loading ? (
              <div className="h-44 flex items-center justify-center text-xs text-slate-400 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                <span>최근 7일 재고 스냅샷과 발주 이력을 불러오는 중...</span>
              </div>
            ) : error ? (
              <div className="h-44 flex items-center justify-center text-xs text-rose-500">
                {error}
              </div>
            ) : (
              <div className="relative">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible select-none">
                  {/* 배경: 과거 영역 vs 미래 예측 영역 구분 */}
                  {chartData && chartData.pastPoints.length > 0 && (
                    <rect
                      x={getX(chartData.pastPoints.length - 0.5)}
                      y={PAD_T}
                      width={Math.max(0, W - PAD_R - getX(chartData.pastPoints.length - 0.5))}
                      height={plotH}
                      fill="#f0fdf4"
                      opacity={0.55}
                      rx={4}
                    />
                  )}

                  {/* 가로 가이드라인 */}
                  {[0, 0.5, 1].map((ratio) => {
                    const y = PAD_T + plotH * (1 - ratio);
                    const val = Math.round(maxVal * ratio);
                    return (
                      <g key={ratio}>
                        <line
                          x1={PAD_L}
                          y1={y}
                          x2={W - PAD_R}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeWidth={1}
                        />
                        <text
                          x={PAD_L - 6}
                          y={y + 3}
                          textAnchor="end"
                          className="fill-slate-400 text-[9.5px] font-mono"
                        >
                          {val.toLocaleString()}
                        </text>
                      </g>
                    );
                  })}

                  {/* 안전재고 목표 기준선 */}
                  {safetyY !== null && safetyY >= PAD_T && safetyY <= PAD_T + plotH && (
                    <g>
                      <line
                        x1={PAD_L}
                        y1={safetyY}
                        x2={W - PAD_R}
                        y2={safetyY}
                        stroke="#d97706"
                        strokeWidth={1.3}
                        strokeDasharray="3 3"
                      />
                      <text
                        x={W - PAD_R}
                        y={safetyY - 4}
                        textAnchor="end"
                        className="fill-amber-700 text-[9.5px] font-bold"
                      >
                        목표 {item.targetStock.toLocaleString()}봉
                      </text>
                    </g>
                  )}

                  {/* 미발주 시 예측선 */}
                  {futureNoOrderPath && (
                    <path
                      d={futureNoOrderPath}
                      fill="none"
                      stroke="#fb7185"
                      strokeWidth={1.8}
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* 발주 반영 시 예측선 */}
                  {futureOrderPath && (
                    <path
                      d={futureOrderPath}
                      fill="none"
                      stroke="#059669"
                      strokeWidth={2.2}
                      strokeDasharray="5 3"
                    />
                  )}

                  {/* 과거 실적 선 */}
                  {pastPath && (
                    <path
                      d={pastPath}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* 포인트 & 발주 마커 & X축 라벨 */}
                  {pts.map((p, idx) => {
                    const x = getX(idx);
                    const isPast = p.kind === 'past';
                    const y = p.qty !== null ? getY(p.qty) : null;
                    const isHovered = hoverIdx === idx;
                    return (
                      <g
                        key={p.date}
                        onMouseEnter={() => setHoverIdx(idx)}
                        onMouseLeave={() => setHoverIdx(null)}
                        className="cursor-pointer"
                      >
                        {/* 호버 히트박스 */}
                        <rect
                          x={x - plotW / Math.max(pts.length * 2, 2)}
                          y={PAD_T}
                          width={plotW / Math.max(pts.length, 1)}
                          height={plotH + PAD_B}
                          fill="transparent"
                        />
                        {isHovered && (
                          <line
                            x1={x}
                            y1={PAD_T}
                            x2={x}
                            y2={PAD_T + plotH}
                            stroke="#94a3b8"
                            strokeWidth={1}
                            strokeDasharray="2 2"
                          />
                        )}
                        {y !== null && (
                          <circle
                            cx={x}
                            cy={y}
                            r={isHovered ? 5 : 3.5}
                            fill={isPast ? '#2563eb' : '#059669'}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                        )}
                        {p.orderedBoxes > 0 && (
                          <g transform={`translate(${x}, ${PAD_T + 4})`}>
                            <rect
                              x={-14}
                              y={-9}
                              width={28}
                              height={13}
                              rx={6}
                              fill="#eff6ff"
                              stroke="#3b82f6"
                              strokeWidth={0.8}
                            />
                            <text
                              textAnchor="middle"
                              y={0}
                              className="fill-blue-700 text-[8.5px] font-black font-mono"
                            >
                              +{p.orderedBoxes}b
                            </text>
                          </g>
                        )}
                        <text
                          x={x}
                          y={H - 12}
                          textAnchor="middle"
                          className={`text-[9px] font-mono ${
                            isPast ? 'fill-slate-600 font-semibold' : 'fill-emerald-700 font-bold'
                          }`}
                        >
                          {p.label.slice(0, 5)}
                        </text>
                        <text
                          x={x}
                          y={H - 2}
                          textAnchor="middle"
                          className={`text-[8.5px] ${
                            isPast ? 'fill-slate-400' : 'fill-emerald-600 font-bold'
                          }`}
                        >
                          {p.label.slice(6, 7)}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* 호버 상세 툴팁 */}
                {hoveredPoint && (
                  <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] flex items-center justify-between gap-3">
                    <span className="font-bold">
                      {hoveredPoint.date} ({getWeekdayCharYmd(hoveredPoint.date)}) ·{' '}
                      {hoveredPoint.kind === 'past' ? '실적' : '예상'}
                    </span>
                    <div className="flex items-center gap-3 font-mono">
                      <span>
                        재고:{' '}
                        <strong>
                          {hoveredPoint.qty !== null ? `${hoveredPoint.qty.toLocaleString()}봉` : '스냅샷 없음'}
                        </strong>
                      </span>
                      {hoveredPoint.qtyWithoutOrder !== null && (
                        <span className="text-rose-300">
                          미발주 시: {hoveredPoint.qtyWithoutOrder.toLocaleString()}봉
                        </span>
                      )}
                      {hoveredPoint.orderedBoxes > 0 && (
                        <span className="text-blue-300">당일발주: {hoveredPoint.orderedBoxes}박스</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2-B. 11/1~11/12 현장 수불 관리대장 실적 레퍼런스 */}
          {novRef && (
            <div className="bg-white rounded-2xl border border-indigo-200 overflow-hidden shadow-2xs">
              <div className="px-4 py-2.5 border-b border-indigo-100 flex items-center justify-between flex-wrap gap-2 bg-indigo-50/60">
                <div className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>11/1~11/12 현장 수불대장 실제 발주·입고 리듬</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-indigo-700 border border-indigo-200">
                    #{novRef.no} 참고
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                    총 입고 {novRef.totalIn}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                    총 발주 {novRef.totalOrder}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-white font-black">
                    현장 일평균 발주 {novRef.dailyAvgOrder}
                  </span>
                </div>
              </div>

              {novRef.totalIn === 0 && novRef.totalOrder === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-500 bg-slate-50/50 flex items-center gap-2">
                  <span>💤</span>
                  <span>2026-11-01 ~ 11-12 기간 동안 현장 수불대장상 입고·발주 실적이 0건입니다. (미사용/휴면 여부 확인)</span>
                </div>
              ) : (
                <div className="p-3 grid grid-cols-4 sm:grid-cols-6 gap-1.5 bg-white">
                  {novRef.days.map((d) => {
                    const wd = getWeekdayCharYmd(d.date);
                    const isFri = wd === '금';
                    const hasAny = d.inQty > 0 || d.orderQty > 0 || d.stockQty > 0;
                    return (
                      <div
                        key={d.date}
                        className={`rounded-lg border px-2 py-1.5 text-center transition ${
                          isFri && d.orderQty > 0
                            ? 'bg-amber-50/80 border-amber-300'
                            : hasAny
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-white border-slate-100 opacity-50'
                        }`}
                      >
                        <div className="text-[10px] font-mono font-bold text-slate-500">
                          {d.date.slice(5)}({wd})
                        </div>
                        <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-mono">
                          <span
                            className={d.orderQty > 0 ? 'text-blue-700 font-black' : 'text-slate-300'}
                            title="발주"
                          >
                            발{d.orderQty}
                          </span>
                          <span className="text-slate-300">/</span>
                          <span
                            className={d.inQty > 0 ? 'text-emerald-700 font-black' : 'text-slate-300'}
                            title="입고"
                          >
                            입{d.inQty}
                          </span>
                        </div>
                        {d.stockQty > 0 && (
                          <div className="text-[9.5px] font-mono text-indigo-600 font-bold mt-0.5">
                            재고 {d.stockQty}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. 지난 7일 일자별 재고 변화 테이블 */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>최근 7일 일자별 재고 변동 상세</span>
              </span>
              <span className="text-[11px] text-slate-500">스냅샷 + 수불/발주 기준</span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[11px]">
                  <th className="py-2 px-3 font-bold">일자</th>
                  <th className="py-2 px-2 text-right font-bold">재고수량</th>
                  <th className="py-2 px-2 text-right font-bold">전일대비</th>
                  <th className="py-2 px-2 text-right font-bold">추정소진</th>
                  <th className="py-2 px-3 text-right font-bold">발주/입고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(history?.timeline || []).length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      최근 7일간 저장된 재고 스냅샷이 없습니다.
                    </td>
                  </tr>
                ) : (
                  [...(history?.timeline || [])].reverse().map((row) => {
                    const diff = row.diffFromPrev;
                    return (
                      <tr key={row.date} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 font-mono font-bold text-slate-700">
                          {row.date.slice(5)}{' '}
                          <span className="text-slate-400 font-sans font-normal">
                            ({getWeekdayCharYmd(row.date)})
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                          {row.hasSnapshot && row.qty !== null ? (
                            <>
                              {row.qty.toLocaleString()}봉
                              <span className="text-[10.5px] text-slate-400 font-normal ml-1">
                                ({(row.qty / pack).toFixed(1)}b)
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {diff === null ? (
                            <span className="text-slate-300">-</span>
                          ) : diff > 0 ? (
                            <span className="text-emerald-600 font-bold">+{diff.toLocaleString()}</span>
                          ) : diff < 0 ? (
                            <span className="text-rose-600 font-bold">{diff.toLocaleString()}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600">
                          {row.estimatedUsage !== null ? `${row.estimatedUsage.toLocaleString()}봉` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {row.orderedBoxes > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10.5px] font-bold">
                              발주 {row.orderedBoxes}b
                            </span>
                          ) : row.inQty > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10.5px] font-bold">
                              입고 +{row.inQty}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 4. 최근 발주 전표 내역 (중복 발주 방지) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>최근 발주 전표 내역 (중복 발주 확인)</span>
              </span>
              <span className="text-[11px] text-slate-500">최근 14일</span>
            </div>
            {(history?.recentOrders || []).length === 0 ? (
              <div className="py-5 text-center text-xs text-slate-400">
                최근 14일간 발행된 발주 전표가 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {history!.recentOrders.map((po) => (
                  <div key={po.orderNo} className="px-4 py-2 flex items-center justify-between text-xs hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-700">{po.orderDate}</span>
                      <span className="font-mono text-[11px] text-slate-500">{po.orderNo}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                          po.status === '입고완료'
                            ? 'bg-emerald-100 text-emerald-700'
                            : po.status === '부분입고'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {po.status}
                      </span>
                    </div>
                    <div className="font-mono font-bold text-slate-900">
                      {po.orderQty}박스
                      {po.remainQty > 0 && (
                        <span className="ml-1.5 text-[11px] text-rose-600">(미입고 {po.remainQty}b)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 하단 원스톱 발주 수량 제어 액션 바 ── */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div>
            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-2 flex-wrap">
              <span>{DAY_CHARS[item.targetDayIdx]}요일({item.targetDayDate}) 발주 수량 즉시 조절</span>
              {item.dailyUsage > 0 && Number.isFinite(item.stockDays) && (
                <span
                  className={`px-1.5 py-0.5 rounded font-mono font-black text-[10.5px] border ${
                    afterOrderDays >= item.targetDays
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  유지일: {item.stockDays.toFixed(1)}일 ➔ {afterOrderDays.toFixed(1)}일
                  {addedDays > 0 ? ` (+${addedDays.toFixed(1)}일)` : ''}
                </span>
              )}
            </div>
            <div className="text-xs font-mono font-black text-slate-900 mt-0.5 flex items-center gap-2">
              <span>추천: {item.autoDayQty}박스</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
              <span className="text-blue-700">
                확정: {item.dayQty}박스 ({(item.dayQty * pack).toLocaleString()}봉 ·{' '}
                ₩{Math.round(item.dayQty * item.boxPrice).toLocaleString()})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-50">
              <button
                type="button"
                onClick={() => onAdjustQty(item.rowId, Math.max(0, item.dayQty - 1))}
                className="px-2.5 py-1.5 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                title="1박스 감소"
              >
                <MinusIcon className="w-3.5 h-3.5" />
              </button>
              <span className="px-3 py-1 font-mono font-black text-sm text-slate-900 bg-white min-w-[44px] text-center">
                {item.dayQty}
              </span>
              <button
                type="button"
                onClick={() => onAdjustQty(item.rowId, item.dayQty + 1)}
                className="px-2.5 py-1.5 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                title="1박스 증가"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {item.dayQty !== item.autoDayQty && (
              <button
                type="button"
                onClick={() => onResetToAuto(item.rowId)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                추천값
              </button>
            )}

            <button
              type="button"
              onClick={() => onToggleStage(item.rowId)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer shadow-xs ${
                item.isStaged
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {item.isStaged ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>바구니 담김</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  <span>바구니 담기</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

