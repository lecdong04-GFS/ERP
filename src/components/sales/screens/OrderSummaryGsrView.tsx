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

export const OrderSummaryGsrView: React.FC = () => {
  const [startDate, setStartDate] = useState(kstToday);
  const [endDate, setEndDate] = useState(kstToday);
  const [appliedRange, setAppliedRange] = useState({ start: kstToday(), end: kstToday() });
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCenter, setSelectedCenter] = useState<string>('');

  const loadOrders = useCallback(async (s: string, e: string) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      const res = await fetch(`/api/sales/order?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const list = json.data.filter((o: any) => o.status !== '취소');
        setOrders(list);
        setSelectedCenter((prev) => {
          if (prev && list.some((o: any) => (o.centerCode || '') === prev)) return prev;
          return list.length > 0 ? (list[0].centerCode || '') : '';
        });
      } else {
        setError(json.error || '수주 데이터를 불러오지 못했습니다.');
        setOrders([]);
      }
    } catch (err) {
      console.error('Failed to load order summaries', err);
      setError('수주 데이터를 불러오지 못했습니다.');
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

  const rangeLabel = appliedRange.start === appliedRange.end
    ? appliedRange.start
    : `${appliedRange.start} ~ ${appliedRange.end}`;

  const cellCls = 'whitespace-nowrap py-1 px-1 text-right border-r border-gray-200';

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="주문집계현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: handleSearch },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
        ]}
        helpContent="GS리테일 정기 및 추가 발주 데이터를 품목별, 납품 센터별, 1편/2편별로 실데이터 집계합니다. (정기=업로드분, 추가=추가주문분)"
      />

      {/* 조건 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700">주문일자:</span>
          <input
            type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs h-6"
          />
          <span className="text-gray-500">~</span>
          <input
            type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs h-6"
          />
          <span className="text-[11px] text-gray-500">집계 기준: {rangeLabel}</span>
        </div>

        <button
          onClick={() => void loadOrders(appliedRange.start, appliedRange.end)}
          className="p-1 hover:bg-gray-200 rounded text-gray-600 cursor-pointer"
          title="새로고침"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-white text-gray-400">불러오는 중...</div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center bg-white text-rose-600">{error}</div>
        ) : orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-white text-gray-400">
            <div className="text-center">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <div>{rangeLabel} 기간에 등록된 수주가 없습니다.</div>
              <div className="mt-1 text-[11px]">주문등록GSR 또는 추가주문등록에서 먼저 수주를 등록하세요.</div>
            </div>
          </div>
        ) : (
          <>
            {/* 상단: 품목별 요약 그리드 */}
            <div className="h-[48%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
              <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
                <span>요약 (품목별 1편/2편 집계 · 정기/추가 구분)</span>
                <span className="text-[11.5px] text-gray-500">단위: EA, 원</span>
              </div>

              <div className="flex-1 overflow-auto">
                <EditableTableWrapper readOnly enableColumnResize={false}><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                  <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                    <tr className="border-b border-[#dbe3ee]">
                      <th rowSpan={2} className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">품목</th>
                      <th rowSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">품목수</th>
                      <th colSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#e8edf4]">합계</th>
                      <th colSpan={6} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#b5baf0]">1편</th>
                      <th colSpan={6} className="whitespace-nowrap py-1 px-1 bg-[#e8edf4]">2편</th>
                    </tr>
                    <tr className="border-b border-[#dbe3ee] text-[11.5px]">
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">수량</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">금액</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">업로드수량</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-18">업로드금액</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-14">추가수량</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">추가금액</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16 bg-[#b2b7ec]">소계수량</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-18 bg-[#b2b7ec]">소계금액</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">업로드수량</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-18">업로드금액</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-14">추가수량</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">추가금액</th>
                      <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16 bg-[#b2b7ec]">소계수량</th>
                      <th className="whitespace-nowrap py-0.5 px-1 bg-[#b2b7ec] w-18">소계금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-mono">
                    {kindSummary.map((row) => (
                      <tr key={row.kind} className="hover:bg-blue-50/50">
                        <td className="whitespace-nowrap py-1 px-2 font-sans font-bold text-center border-r border-gray-200">{row.kind}</td>
                        <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{row.itemCount}</td>
                        <td className={`${cellCls} font-bold text-blue-900`}>{row.totalQty.toLocaleString()}</td>
                        <td className={`${cellCls} font-bold text-gray-900`}>{row.totalAmt.toLocaleString()}</td>
                        <td className={cellCls}>{row.reg1Qty.toLocaleString()}</td>
                        <td className={cellCls}>{row.reg1Amt.toLocaleString()}</td>
                        <td className={`${cellCls} text-amber-700`}>{row.ext1Qty.toLocaleString()}</td>
                        <td className={`${cellCls} text-amber-700`}>{row.ext1Amt.toLocaleString()}</td>
                        <td className={`${cellCls} font-bold text-emerald-800 bg-emerald-50/30`}>{(row.reg1Qty + row.ext1Qty).toLocaleString()}</td>
                        <td className={`${cellCls} font-bold text-emerald-800 bg-emerald-50/30`}>{(row.reg1Amt + row.ext1Amt).toLocaleString()}</td>
                        <td className={cellCls}>{row.reg2Qty.toLocaleString()}</td>
                        <td className={cellCls}>{row.reg2Amt.toLocaleString()}</td>
                        <td className={`${cellCls} text-amber-700`}>{row.ext2Qty.toLocaleString()}</td>
                        <td className={`${cellCls} text-amber-700`}>{row.ext2Amt.toLocaleString()}</td>
                        <td className={`${cellCls} font-bold text-indigo-800 bg-indigo-50/30`}>{(row.reg2Qty + row.ext2Qty).toLocaleString()}</td>
                        <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-indigo-800 bg-indigo-50/30">{(row.reg2Amt + row.ext2Amt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                    <tr>
                      <td className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                      <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-300">{kindTotals.itemCount}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{kindTotals.totalQty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{kindTotals.totalAmt.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{kindTotals.reg1Qty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{kindTotals.reg1Amt.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right text-amber-700 border-r border-gray-300">{kindTotals.ext1Qty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right text-amber-700 border-r border-gray-300">{kindTotals.ext1Amt.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{(kindTotals.reg1Qty + kindTotals.ext1Qty).toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{(kindTotals.reg1Amt + kindTotals.ext1Amt).toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{kindTotals.reg2Qty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{kindTotals.reg2Amt.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right text-amber-700 border-r border-gray-300">{kindTotals.ext2Qty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right text-amber-700 border-r border-gray-300">{kindTotals.ext2Amt.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right text-indigo-900 border-r border-gray-300">{(kindTotals.reg2Qty + kindTotals.ext2Qty).toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right text-indigo-900">{(kindTotals.reg2Amt + kindTotals.ext2Amt).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table></EditableTableWrapper>
              </div>
            </div>

            {/* 하단 2분할 */}
            <div className="h-[52%] flex gap-1 min-h-0 overflow-hidden">
              <div className="w-[70%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
                <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300">
                  세부내용 (납품 센터별)
                </div>

                <div className="flex-1 overflow-auto">
                  <EditableTableWrapper readOnly enableColumnResize={false}><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                    <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                      <tr className="border-b border-[#dbe3ee]">
                        <th rowSpan={2} className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">센터명</th>
                        <th rowSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">품목수</th>
                        <th colSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#e8edf4]">합계</th>
                        <th colSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#b5baf0]">1편 소계</th>
                        <th colSpan={2} className="whitespace-nowrap py-1 px-1 bg-[#e8edf4]">2편 소계</th>
                      </tr>
                      <tr className="border-b border-[#dbe3ee] text-[11.5px]">
                        <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">수량</th>
                        <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-24">금액</th>
                        <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">수량</th>
                        <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-24">금액</th>
                        <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">수량</th>
                        <th className="whitespace-nowrap py-0.5 px-1 w-24">금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-mono">
                      {centerSummary.map((c) => (
                        <tr
                          key={c.centerName}
                          onClick={() => setSelectedCenter(c.centerName)}
                          className={`cursor-pointer transition-colors ${
                            selectedCenter === c.centerName ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'
                          }`}
                        >
                          <td className="whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{c.centerName}</td>
                          <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{c.itemCount}</td>
                          <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{c.totalQty.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-1 px-1 text-right text-gray-900 border-r border-gray-200">{c.totalAmt.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{c.sub1Qty.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{c.sub1Amt.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-1 px-1 text-right text-indigo-800 border-r border-gray-200">{c.sub2Qty.toLocaleString()}</td>
                          <td className="whitespace-nowrap py-1 px-1 text-right text-indigo-800">{c.sub2Amt.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></EditableTableWrapper>
                </div>
              </div>

              {/* 우하단: 선택 센터 품목별 실明細 */}
              <div className="w-[30%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
                <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
                  <span>품목 [{selectedCenter || '-'}]</span>
                  <span className="text-[11.5px] text-blue-700 font-mono">총 {centerItems.length}건</span>
                </div>

                <div className="flex-1 overflow-auto">
                  <EditableTableWrapper readOnly enableColumnResize={false}><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                    <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                      <tr>
                        <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">품번</th>
                        <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">품명</th>
                        <th className="whitespace-nowrap py-1 px-2 text-right w-16">수량</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-mono">
                      {centerItems.length === 0 ? (
                        <tr><td colSpan={3} className="py-6 text-center text-gray-400 font-sans">품목이 없습니다</td></tr>
                      ) : (
                        centerItems.map((it, idx) => (
                          <tr key={`${it.partNo}-${idx}`} className="hover:bg-blue-50/50">
                            <td className="whitespace-nowrap py-1 px-1 text-center text-gray-700 border-r border-gray-200">{it.partNo}</td>
                            <td className="whitespace-nowrap py-1 px-2 font-sans text-left font-medium text-gray-900 truncate border-r border-gray-200">{it.partName}</td>
                            <td className="whitespace-nowrap py-1 px-2 text-right font-bold text-blue-900">{it.qty.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table></EditableTableWrapper>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
