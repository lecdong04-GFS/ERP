'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { RotateCw, Search } from 'lucide-react';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';

interface KindSummary {
  kind: string;
  itemCount: number;
  totalQty: number;
  totalAmt: number;
  reg1Qty: number; reg1Amt: number;
  ext1Qty: number; ext1Amt: number;
  reg2Qty: number; reg2Amt: number;
  ext2Qty: number; ext2Amt: number;
}

interface CenterSummary {
  centerName: string;
  itemCount: number;
  totalQty: number;
  totalAmt: number;
  sub1Qty: number; sub1Amt: number;
  sub2Qty: number; sub2Amt: number;
}

interface CenterItem {
  partNo: string;
  partName: string;
  qty: number;
  amt: number;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function num(n: any): number {
  return Number(n) || 0;
}

function fmt(n: number): string {
  return n ? n.toLocaleString('ko-KR') : '-';
}

function shiftDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}

export const OrderSummaryGsrView: React.FC = () => {
  const [startDate, setStartDate] = useState(kstToday);
  const [endDate, setEndDate] = useState(kstToday);
  const [appliedRange, setAppliedRange] = useState({ start: kstToday(), end: kstToday() });
  const [orders, setOrders] = useState<any[]>([]);
  const [prevKindQty, setPrevKindQty] = useState<Record<string, number>>({});
  const [aggAt, setAggAt] = useState('');
  const [drillKind, setDrillKind] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCenter, setSelectedCenter] = useState<string>('');

  const loadOrders = useCallback(async (s: string, e: string) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      const res = await fetch(`/api/sales/order?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
      }
      const cType = res.headers.get('content-type') || '';
      if (!cType.includes('application/json')) {
        throw new Error('응답 데이터가 올바른 JSON 형식이 아닙니다.');
      }
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const list = json.data.filter((o: any) => o.status !== '취소');
        setOrders(list);
        setSelectedCenter((prev) => {
          if (prev && list.some((o: any) => (o.centerCode || '') === prev)) return prev;
          return list.length > 0 ? (list[0].centerCode || '') : '';
        });
        const now = new Date(Date.now() + 9 * 3600 * 1000);
        const pad = (n: number) => String(n).padStart(2, '0');
        setAggAt(`${pad(now.getUTCMonth() + 1)}/${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`);
      } else {
        setError(json.error || '수주 데이터를 불러오지 못했습니다.');
        setOrders([]);
      }
      // 직전 동일 기간 품목별 합계 (전일비 계산용)
      try {
        const len = diffDays(s, e) + 1;
        const ps = shiftDays(s, -len);
        const pe = shiftDays(s, -1);
        const pParams = new URLSearchParams({ startDate: ps, endDate: pe });
        const pResponse = await fetch(`/api/sales/order?${pParams}`, { cache: 'no-store' });
        const pRes = pResponse.ok && (pResponse.headers.get('content-type') || '').includes('application/json')
          ? await pResponse.json()
          : null;
        const prevMap: Record<string, number> = {};
        if (pRes && pRes.success && Array.isArray(pRes.data)) {
          pRes.data
            .filter((o: any) => o.status !== '취소')
            .forEach((o: any) => {
              (o.details || []).forEach((dt: any) => {
                const kind = (dt.product?.kind || '').trim() || '기타';
                prevMap[kind] = (prevMap[kind] || 0) + num(dt.totalQty);
              });
            });
        }
        setPrevKindQty(prevMap);
      } catch {
        setPrevKindQty({});
      }
    } catch (err: any) {
      console.error('Failed to load order summaries', err);
      setError(err?.message || '수주 데이터를 불러오지 못했습니다.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrders(appliedRange.start, appliedRange.end); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    if (startDate > endDate) {
      alert('시작일이 종료일보다 늦을 수 없습니다.');
      return;
    }
    setAppliedRange({ start: startDate, end: endDate });
    void loadOrders(startDate, endDate);
  };

  const handleReset = () => {
    const t = kstToday();
    setStartDate(t); setEndDate(t);
    setAppliedRange({ start: t, end: t });
    void loadOrders(t, t);
  };

  // ── 품목(품종)별 집계: 정기(업로드) vs 추가 × 1편/2편 실값 ──
  const kindSummary = useMemo<KindSummary[]>(() => {
    const map = new Map<string, { items: Set<number>; totalQty: number; totalAmt: number;
      reg1Qty: number; reg1Amt: number; ext1Qty: number; ext1Amt: number;
      reg2Qty: number; reg2Amt: number; ext2Qty: number; ext2Amt: number }>();
    orders.forEach((o: any) => {
      const isExtra = o.orderType === '추가';
      (o.details || []).forEach((dt: any) => {
        const kind = (dt.product?.kind || '').trim() || '기타';
        let agg = map.get(kind);
        if (!agg) {
          agg = { items: new Set(), totalQty: 0, totalAmt: 0, reg1Qty: 0, reg1Amt: 0, ext1Qty: 0, ext1Amt: 0, reg2Qty: 0, reg2Amt: 0, ext2Qty: 0, ext2Amt: 0 };
          map.set(kind, agg);
        }
        const q1 = num(dt.orderQty1), q2 = num(dt.orderQty2);
        const price = num(dt.unitPrice);
        agg.items.add(dt.productId);
        agg.totalQty += num(dt.totalQty);
        agg.totalAmt += num(dt.amount);
        if (isExtra) {
          agg.ext1Qty += q1; agg.ext1Amt += Math.round(q1 * price);
          agg.ext2Qty += q2; agg.ext2Amt += Math.round(q2 * price);
        } else {
          agg.reg1Qty += q1; agg.reg1Amt += Math.round(q1 * price);
          agg.reg2Qty += q2; agg.reg2Amt += Math.round(q2 * price);
        }
      });
    });
    return [...map.entries()]
      .map(([kind, a]) => ({ kind, itemCount: a.items.size, totalQty: a.totalQty, totalAmt: a.totalAmt,
        reg1Qty: a.reg1Qty, reg1Amt: a.reg1Amt, ext1Qty: a.ext1Qty, ext1Amt: a.ext1Amt,
        reg2Qty: a.reg2Qty, reg2Amt: a.reg2Amt, ext2Qty: a.ext2Qty, ext2Amt: a.ext2Amt }))
      .sort((a, b) => b.totalQty - a.totalQty);
  }, [orders]);

  // ── 센터별 집계 ──
  const centerSummary = useMemo<CenterSummary[]>(() => {
    const map = new Map<string, { items: Set<number>; totalQty: number; totalAmt: number;
      sub1Qty: number; sub1Amt: number; sub2Qty: number; sub2Amt: number }>();
    orders.forEach((o: any) => {
      const c = (o.centerCode || '미지정').trim() || '미지정';
      let agg = map.get(c);
      if (!agg) {
        agg = { items: new Set(), totalQty: 0, totalAmt: 0, sub1Qty: 0, sub1Amt: 0, sub2Qty: 0, sub2Amt: 0 };
        map.set(c, agg);
      }
      agg.totalQty += num(o.totalQty);
      agg.totalAmt += num(o.totalAmount);
      (o.details || []).forEach((dt: any) => {
        const q1 = num(dt.orderQty1), q2 = num(dt.orderQty2);
        const price = num(dt.unitPrice);
        agg!.items.add(dt.productId);
        agg!.sub1Qty += q1; agg!.sub1Amt += Math.round(q1 * price);
        agg!.sub2Qty += q2; agg!.sub2Amt += Math.round(q2 * price);
      });
    });
    return [...map.entries()]
      .map(([centerName, a]) => ({ centerName, itemCount: a.items.size, totalQty: a.totalQty, totalAmt: a.totalAmt,
        sub1Qty: a.sub1Qty, sub1Amt: a.sub1Amt, sub2Qty: a.sub2Qty, sub2Amt: a.sub2Amt }))
      .sort((a, b) => b.totalQty - a.totalQty);
  }, [orders]);

  // ── 선택 센터 품목별 실明細 ──
  const centerItems = useMemo<CenterItem[]>(() => {
    if (!selectedCenter) return [];
    const map = new Map<number, CenterItem>();
    orders
      .filter((o: any) => (o.centerCode || '') === selectedCenter)
      .forEach((o: any) => {
        (o.details || []).forEach((dt: any) => {
          const cur = map.get(dt.productId) || {
            partNo: dt.product?.productCode || '',
            partName: dt.product?.name || '',
            qty: 0, amt: 0,
          };
          cur.qty += num(dt.totalQty);
          cur.amt += num(dt.amount);
          map.set(dt.productId, cur);
        });
      });
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  }, [orders, selectedCenter]);

  // ── 드릴다운: 선택 품목의 구성 수주 목록 ──
  const drillRows = useMemo(() => {
    if (!drillKind) return [];
    const rows: { orderNo: string; orderDate: string; centerCode: string; qty: number; amt: number }[] = [];
    orders.forEach((o: any) => {
      let q = 0;
      let a = 0;
      (o.details || []).forEach((dt: any) => {
        const kind = (dt.product?.kind || '').trim() || '기타';
        if (kind === drillKind) {
          q += num(dt.totalQty);
          a += num(dt.amount);
        }
      });
      if (q > 0) rows.push({ orderNo: o.orderNo, orderDate: o.orderDate, centerCode: o.centerCode || '-', qty: q, amt: a });
    });
    return rows.sort((a, b) => (a.orderDate === b.orderDate ? 0 : (a.orderDate < b.orderDate ? -1 : 1)));
  }, [orders, drillKind]);

  const kindTotals = useMemo(() => kindSummary.reduce(
    (acc, r) => ({
      itemCount: acc.itemCount + r.itemCount, totalQty: acc.totalQty + r.totalQty, totalAmt: acc.totalAmt + r.totalAmt,
      reg1Qty: acc.reg1Qty + r.reg1Qty, reg1Amt: acc.reg1Amt + r.reg1Amt,
      ext1Qty: acc.ext1Qty + r.ext1Qty, ext1Amt: acc.ext1Amt + r.ext1Amt,
      reg2Qty: acc.reg2Qty + r.reg2Qty, reg2Amt: acc.reg2Amt + r.reg2Amt,
      ext2Qty: acc.ext2Qty + r.ext2Qty, ext2Amt: acc.ext2Amt + r.ext2Amt,
    }),
    { itemCount: 0, totalQty: 0, totalAmt: 0, reg1Qty: 0, reg1Amt: 0, ext1Qty: 0, ext1Amt: 0, reg2Qty: 0, reg2Amt: 0, ext2Qty: 0, ext2Amt: 0 }
  ), [kindSummary]);

  const centerTotals = useMemo(() => centerSummary.reduce(
    (acc, c) => ({
      itemCount: acc.itemCount + c.itemCount,
      totalQty: acc.totalQty + c.totalQty,
      totalAmt: acc.totalAmt + c.totalAmt,
      sub1Qty: acc.sub1Qty + c.sub1Qty,
      sub1Amt: acc.sub1Amt + c.sub1Amt,
      sub2Qty: acc.sub2Qty + c.sub2Qty,
      sub2Amt: acc.sub2Amt + c.sub2Amt,
    }),
    { itemCount: 0, totalQty: 0, totalAmt: 0, sub1Qty: 0, sub1Amt: 0, sub2Qty: 0, sub2Amt: 0 }
  ), [centerSummary]);

  const centerItemsTotalQty = useMemo(() => centerItems.reduce((acc, it) => acc + it.qty, 0), [centerItems]);

  const rangeLabel = appliedRange.start === appliedRange.end
    ? appliedRange.start
    : `${appliedRange.start} ~ ${appliedRange.end}`;

  const orderCount = orders.length;

  function dayOverDay(kind: string, qty: number): { text: string; up: boolean | null; title: string } {
    const prev = prevKindQty[kind] || 0;
    if (prev <= 0) return { text: '신규', up: null, title: '직전 기간 수주 없음' };
    if (qty === prev) return { text: '±0%', up: null, title: `직전 ${prev.toLocaleString('ko-KR')} ea → 동일` };
    const pct = ((qty - prev) / prev) * 100;
    const sign = pct > 0 ? '▲' : '▼';
    return { text: `${sign}${Math.abs(pct).toFixed(1)}%`, up: pct > 0, title: `직전 ${prev.toLocaleString('ko-KR')} ea → ${qty.toLocaleString('ko-KR')} ea` };
  }

  const cellCls = 'whitespace-nowrap py-1.5 px-2 text-right border-r border-gray-200 text-[13.5px] font-mono';

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[13px]">
      <SalesActionBar
        title="주문집계현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: handleSearch },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
        ]}
        helpContent="GS리테일 정기 및 추가 발주 데이터를 품목별, 납품 센터별, 1편/2편별로 실데이터 집계합니다. (정기=업로드분, 추가=추가주문분)"
      />

      {/* 조건 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-4 py-1.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-[13px] text-gray-800">주문일자:</span>
          <input
            type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="bg-white border border-gray-400 px-2.5 py-1 text-[13px] font-mono font-bold rounded h-7 text-gray-900 shadow-2xs focus:border-blue-500 focus:outline-hidden"
          />
          <span className="text-gray-500 font-bold">~</span>
          <input
            type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="bg-white border border-gray-400 px-2.5 py-1 text-[13px] font-mono font-bold rounded h-7 text-gray-900 shadow-2xs focus:border-blue-500 focus:outline-hidden"
          />
          <span className="text-[12px] font-bold text-gray-600 bg-gray-200/80 px-2 py-0.5 rounded-sm ml-1">
            집계 기준: {rangeLabel}
          </span>
        </div>

        <button
          onClick={() => void loadOrders(appliedRange.start, appliedRange.end)}
          className="p-1.5 hover:bg-gray-200 rounded text-gray-600 cursor-pointer transition-colors"
          title="새로고침"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 flex flex-col min-h-0 p-1.5 gap-1.5 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-white text-gray-500 font-bold text-[14px]">불러오는 중...</div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center bg-white text-rose-600 font-bold text-[14px]">{error}</div>
        ) : orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-white text-gray-400">
            <div className="text-center">
              <Search className="w-10 h-10 mx-auto mb-2.5 opacity-40 text-gray-500" />
              <div className="text-[14.5px] font-bold text-gray-700">{rangeLabel} 기간에 등록된 수주가 없습니다.</div>
              <div className="mt-1 text-[12px] text-gray-500">주문등록GSR 또는 추가주문등록에서 먼저 수주를 등록하세요.</div>
            </div>
          </div>
        ) : (
          <>
            {/* 상단: 품목별 요약 그리드 */}
            <div className="h-[48%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
              <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between gap-2">
                <span className="shrink-0">요약 (품목별 1편/2편 집계 · 정기/추가 구분)</span>
                <span className="text-[11.5px] font-semibold text-gray-600 truncate">
                  정기=발주현황 업로드분 · 추가=추가주문등록분 · 기준 {rangeLabel} · 수주 {orderCount}건{aggAt ? ` · ${aggAt} 집계` : ''}
                </span>
                <span className="text-[12px] font-bold text-gray-600 shrink-0">단위: EA, 원</span>
              </div>

              <div className="flex-1 overflow-auto">
                <EditableTableWrapper readOnly enableColumnResize={false}><table className="w-full min-w-full text-[13.5px] border-collapse font-sans">
                  <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                    <tr className="border-b border-[#dbe3ee]">
                      <th rowSpan={2} className="whitespace-nowrap py-2 px-2.5 border-r border-[#dbe3ee] min-w-[70px]">품목</th>
                      <th rowSpan={2} className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[55px]">품목수</th>
                      <th colSpan={2} className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] bg-[#e8edf4]">합계</th>
                      <th colSpan={6} className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] bg-[#b5baf0]">1편</th>
                      <th colSpan={6} className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] bg-[#e8edf4]">2편</th>
                      <th rowSpan={2} className="whitespace-nowrap py-2 px-2 min-w-[65px]" title="직전 동일 기간 대비">전일비</th>
                    </tr>
                    <tr className="border-b border-[#dbe3ee] text-[12.5px]">
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[75px]">수량</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[95px]">금액</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[75px]">정기수량</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[85px]">정기금액</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[70px]">추가수량</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[80px]">추가금액</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[80px] bg-[#b2b7ec]">소계수량</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[90px] bg-[#b2b7ec]">소계금액</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[75px]">정기수량</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[85px]">정기금액</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[70px]">추가수량</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[80px]">추가금액</th>
                      <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[80px] bg-[#b2b7ec]">소계수량</th>
                      <th className="whitespace-nowrap py-1.5 px-2 bg-[#b2b7ec] min-w-[90px]">소계금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-mono">
                    {kindSummary.map((row) => {
                      const dod = dayOverDay(row.kind, row.totalQty);
                      return (
                      <tr
                        key={row.kind}
                        onClick={() => setDrillKind(row.kind)}
                        className="hover:bg-blue-50/70 cursor-pointer transition-colors"
                        title="클릭하면 구성 수주 목록 표시"
                      >
                        <td className="whitespace-nowrap py-2 px-2.5 font-sans font-black text-center text-[14px] text-gray-900 border-r border-gray-200 bg-slate-50/50">{row.kind}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-center text-[13.5px] text-gray-700 border-r border-gray-200">{row.itemCount}</td>
                        <td className={`${cellCls} font-black text-[14.5px] text-blue-900 bg-blue-50/40`}>{fmt(row.totalQty)}</td>
                        <td className={`${cellCls} font-black text-[14px] text-gray-900 bg-blue-50/20`}>{fmt(row.totalAmt)}</td>
                        <td className={cellCls}>{fmt(row.reg1Qty)}</td>
                        <td className={cellCls}>{fmt(row.reg1Amt)}</td>
                        <td className={`${cellCls} text-amber-800 font-semibold`}>{fmt(row.ext1Qty)}</td>
                        <td className={`${cellCls} text-amber-800 font-semibold`}>{fmt(row.ext1Amt)}</td>
                        <td className={`${cellCls} font-black text-[14px] text-emerald-900 bg-emerald-100/40`}>{fmt(row.reg1Qty + row.ext1Qty)}</td>
                        <td className={`${cellCls} font-black text-[13.5px] text-emerald-900 bg-emerald-100/40`}>{fmt(row.reg1Amt + row.ext1Amt)}</td>
                        <td className={cellCls}>{fmt(row.reg2Qty)}</td>
                        <td className={cellCls}>{fmt(row.reg2Amt)}</td>
                        <td className={`${cellCls} text-amber-800 font-semibold`}>{fmt(row.ext2Qty)}</td>
                        <td className={`${cellCls} text-amber-800 font-semibold`}>{fmt(row.ext2Amt)}</td>
                        <td className={`${cellCls} font-black text-[14px] text-indigo-900 bg-indigo-100/40`}>{fmt(row.reg2Qty + row.ext2Qty)}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[13.5px] text-indigo-900 bg-indigo-100/40 border-r border-gray-200">{fmt(row.reg2Amt + row.ext2Amt)}</td>
                        <td
                          className={`whitespace-nowrap py-2 px-2 text-center text-[12.5px] font-black ${
                            dod.up === true ? 'text-rose-600' : dod.up === false ? 'text-blue-600' : 'text-gray-400'
                          }`}
                          title={dod.title}
                        >
                          {dod.text}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                    <tr>
                      <td className="whitespace-nowrap py-2 px-2.5 font-sans font-black text-center text-[14.5px] border-r border-gray-300">합계</td>
                      <td className="whitespace-nowrap py-2 px-2 text-center text-[13.5px] font-bold border-r border-gray-300">{kindTotals.itemCount}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[15.5px] font-black text-blue-950 border-r border-gray-300">{fmt(kindTotals.totalQty)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[14.5px] font-black text-gray-950 border-r border-gray-300">{fmt(kindTotals.totalAmt)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] border-r border-gray-300">{fmt(kindTotals.reg1Qty)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] border-r border-gray-300">{fmt(kindTotals.reg1Amt)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] text-amber-800 font-bold border-r border-gray-300">{fmt(kindTotals.ext1Qty)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] text-amber-800 font-bold border-r border-gray-300">{fmt(kindTotals.ext1Amt)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[14.5px] font-black text-emerald-950 border-r border-gray-300">{fmt(kindTotals.reg1Qty + kindTotals.ext1Qty)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[14px] font-black text-emerald-950 border-r border-gray-300">{fmt(kindTotals.reg1Amt + kindTotals.ext1Amt)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] border-r border-gray-300">{fmt(kindTotals.reg2Qty)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] border-r border-gray-300">{fmt(kindTotals.reg2Amt)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] text-amber-800 font-bold border-r border-gray-300">{fmt(kindTotals.ext2Qty)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] text-amber-800 font-bold border-r border-gray-300">{fmt(kindTotals.ext2Amt)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[14.5px] font-black text-indigo-950 border-r border-gray-300">{fmt(kindTotals.reg2Qty + kindTotals.ext2Qty)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-[14px] font-black text-indigo-950 border-r border-gray-300">{fmt(kindTotals.reg2Amt + kindTotals.ext2Amt)}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-center text-gray-400 font-normal">-</td>
                    </tr>
                  </tfoot>
                </table></EditableTableWrapper>
              </div>
            </div>

            {/* 하단 2분할 */}
            <div className="h-[52%] flex gap-1.5 min-h-0 overflow-hidden">
              <div className="w-[70%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
                <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
                  <span>세부내용 (납품 센터별)</span>
                  <span className="text-[12px] font-bold text-gray-600">총 {centerSummary.length}개 센터</span>
                </div>

                <div className="flex-1 overflow-auto">
                  <EditableTableWrapper readOnly enableColumnResize={false}><table className="w-full min-w-full text-[13.5px] border-collapse font-sans">
                    <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                      <tr className="border-b border-[#dbe3ee]">
                        <th rowSpan={2} className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee] min-w-[120px]">센터명</th>
                        <th rowSpan={2} className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[60px]">품목수</th>
                        <th colSpan={2} className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] bg-[#e8edf4]">합계</th>
                        <th colSpan={2} className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] bg-[#b5baf0]">1편 소계</th>
                        <th colSpan={2} className="whitespace-nowrap py-2 px-2 bg-[#e8edf4]">2편 소계</th>
                      </tr>
                      <tr className="border-b border-[#dbe3ee] text-[12.5px]">
                        <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[85px]">수량</th>
                        <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[105px]">금액</th>
                        <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[85px]">수량</th>
                        <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[105px]">금액</th>
                        <th className="whitespace-nowrap py-1.5 px-2 border-r border-[#dbe3ee] min-w-[85px]">수량</th>
                        <th className="whitespace-nowrap py-1.5 px-2 min-w-[105px]">금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-mono">
                      {centerSummary.map((c) => (
                        <tr
                          key={c.centerName}
                          onClick={() => setSelectedCenter(c.centerName)}
                          className={`cursor-pointer transition-colors ${
                            selectedCenter === c.centerName ? 'bg-blue-100/80 font-semibold' : 'hover:bg-blue-50/50'
                          }`}
                        >
                          <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-[14px] text-gray-900 border-r border-gray-200">{c.centerName}</td>
                          <td className="whitespace-nowrap py-2 px-2 text-center text-[13.5px] border-r border-gray-200 text-gray-700">{c.itemCount}</td>
                          <td className="whitespace-nowrap py-2 px-2.5 text-right font-black text-[14.5px] text-blue-900 border-r border-gray-200 bg-blue-50/30">{c.totalQty.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-2 px-2.5 text-right font-black text-[14px] text-gray-900 border-r border-gray-200">{c.totalAmt.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-[13.5px] text-emerald-900 border-r border-gray-200 bg-emerald-50/30">{c.sub1Qty.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-[13.5px] text-emerald-900 border-r border-gray-200 bg-emerald-50/30">{c.sub1Amt.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-[13.5px] text-indigo-900 border-r border-gray-200 bg-indigo-50/30">{c.sub2Qty.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-[13.5px] text-indigo-900 bg-indigo-50/30">{c.sub2Amt.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                      <tr>
                        <td className="whitespace-nowrap py-2 px-3 font-sans font-black text-center text-[14.5px] border-r border-gray-300">합계</td>
                        <td className="whitespace-nowrap py-2 px-2 text-center text-[13.5px] font-bold border-r border-gray-300">{centerTotals.itemCount}</td>
                        <td className="whitespace-nowrap py-2 px-2.5 text-right text-[15.5px] font-black text-blue-950 border-r border-gray-300">{centerTotals.totalQty.toLocaleString()}</td>
                        <td className="whitespace-nowrap py-2 px-2.5 text-right text-[14.5px] font-black text-gray-950 border-r border-gray-300">{centerTotals.totalAmt.toLocaleString()}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-right text-[14px] font-black text-emerald-950 border-r border-gray-300">{centerTotals.sub1Qty.toLocaleString()}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-right text-[14px] font-black text-emerald-950 border-r border-gray-300">{centerTotals.sub1Amt.toLocaleString()}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-right text-[14px] font-black text-indigo-950 border-r border-gray-300">{centerTotals.sub2Qty.toLocaleString()}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-right text-[14px] font-black text-indigo-950">{centerTotals.sub2Amt.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table></EditableTableWrapper>
                </div>
              </div>

              {/* 우하단: 선택 센터 품목별 실明細 */}
              <div className="w-[30%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
                <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
                  <span>품목 [{selectedCenter || '-'}]</span>
                  <span className="text-[12px] font-black text-blue-800 font-mono bg-blue-100 px-2 py-0.5 rounded">총 {centerItems.length}건</span>
                </div>

                <div className="flex-1 overflow-auto">
                  <EditableTableWrapper readOnly enableColumnResize={false}><table className="w-full min-w-full text-[13.5px] border-collapse font-sans">
                    <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                      <tr>
                        <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[85px]">품번</th>
                        <th className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee]">품명</th>
                        <th className="whitespace-nowrap py-2 px-2.5 text-right min-w-[80px]">수량</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-mono">
                      {centerItems.length === 0 ? (
                        <tr><td colSpan={3} className="py-8 text-center text-gray-400 font-sans text-[13px]">품목이 없습니다</td></tr>
                      ) : (
                        centerItems.map((it, idx) => (
                          <tr key={`${it.partNo}-${idx}`} className="hover:bg-blue-50/60 transition-colors">
                            <td className="whitespace-nowrap py-2 px-2 text-center text-gray-700 font-mono text-[13px] border-r border-gray-200">{it.partNo}</td>
                            <td className="whitespace-nowrap py-2 px-3 font-sans text-left font-bold text-[13.5px] text-gray-900 truncate border-r border-gray-200">{it.partName}</td>
                            <td className="whitespace-nowrap py-2 px-2.5 text-right font-black text-[14.5px] text-blue-900">{it.qty.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {centerItems.length > 0 && (
                      <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                        <tr>
                          <td colSpan={2} className="whitespace-nowrap py-2 px-3 font-sans font-black text-center text-[13.5px] border-r border-gray-300">
                            센터 품목 합계 ({centerItems.length}건)
                          </td>
                          <td className="whitespace-nowrap py-2 px-2.5 text-right font-black text-[15px] text-blue-950">
                            {centerItemsTotalQty.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table></EditableTableWrapper>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 드릴다운: 품목 구성 수주 목록 */}
      {drillKind !== null && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-[640px] max-w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-[#e2e8f0] border-b border-gray-300 flex items-center justify-between">
              <span className="font-black text-[15px] text-gray-900">
                [{drillKind}] 구성 수주 ({drillRows.length}건)
              </span>
              <button
                type="button" onClick={() => setDrillKind(null)}
                className="px-3 py-1 border border-gray-400 rounded bg-white hover:bg-gray-100 font-bold text-[13px] text-gray-800 shadow-2xs cursor-pointer transition-colors"
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="py-2 px-3 border-r border-[#dbe3ee]">주문번호</th>
                    <th className="py-2 px-2 border-r border-[#dbe3ee]">일자</th>
                    <th className="py-2 px-3 border-r border-[#dbe3ee] text-left">거래처</th>
                    <th className="py-2 px-2.5 border-r border-[#dbe3ee] text-right">수량</th>
                    <th className="py-2 px-2.5 text-right">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {drillRows.map((r, i) => (
                    <tr key={`${r.orderNo}-${i}`} className="hover:bg-blue-50/60 transition-colors">
                      <td className="py-2 px-3 border-r border-gray-200 text-gray-700">{r.orderNo}</td>
                      <td className="py-2 px-2 text-center border-r border-gray-200">{r.orderDate}</td>
                      <td className="py-2 px-3 font-sans font-bold text-left border-r border-gray-200 text-gray-900">{r.centerCode}</td>
                      <td className="py-2 px-2.5 text-right font-black text-[14px] text-blue-900 border-r border-gray-200">{r.qty.toLocaleString('ko-KR')}</td>
                      <td className="py-2 px-2.5 text-right font-bold text-gray-900">{r.amt.toLocaleString('ko-KR')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fef9c3] font-mono font-bold border-t-2 border-slate-300 sticky bottom-0">
                  <tr>
                    <td colSpan={3} className="py-2.5 px-3 font-sans font-black text-center text-[14px] border-r border-gray-300">합계</td>
                    <td className="py-2.5 px-2.5 text-right text-[15px] font-black text-blue-950 border-r border-gray-300">
                      {drillRows.reduce((s, r) => s + r.qty, 0).toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-[14.5px] font-black text-gray-950">
                      {drillRows.reduce((s, r) => s + r.amt, 0).toLocaleString('ko-KR')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
