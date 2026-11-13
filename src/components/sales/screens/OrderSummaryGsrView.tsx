'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import {
  RotateCw,
  Search,
  Building2,
  PackageCheck,
  Calendar,
  Layers,
  Grid3X3,
  TrendingUp,
  TrendingDown,
  Printer,
  Download,
  CheckCircle2,
  ChevronRight,
  Filter,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';

interface KindSummary {
  kind: string;
  itemCount: number;
  totalQty: number;
  totalAmt: number;
  reg1Qty: number;
  reg1Amt: number;
  ext1Qty: number;
  ext1Amt: number;
  reg2Qty: number;
  reg2Amt: number;
  ext2Qty: number;
  ext2Amt: number;
}

interface CenterSummary {
  centerName: string;
  itemCount: number;
  totalQty: number;
  totalAmt: number;
  sub1Qty: number;
  sub1Amt: number;
  sub2Qty: number;
  sub2Amt: number;
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

  // 뷰 모드 탭 (센터 중심 vs 품종 중심 vs 교차 매트릭스)
  const [activeTab, setActiveTab] = useState<'CENTER' | 'KIND' | 'MATRIX'>('CENTER');
  const [centerSearchTerm, setCenterSearchTerm] = useState('');
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  const loadOrders = useCallback(async (s: string, e: string) => {
    setLoading(true);
    setError(null);
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
        setAggAt(
          `${pad(now.getUTCMonth() + 1)}/${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`
        );
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
        const pRes =
          pResponse.ok && (pResponse.headers.get('content-type') || '').includes('application/json')
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

  useEffect(() => {
    void loadOrders(appliedRange.start, appliedRange.end);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setStartDate(t);
    setEndDate(t);
    setAppliedRange({ start: t, end: t });
    void loadOrders(t, t);
  };

  // 빠른 날짜 선택기
  const setQuickDate = (type: 'TODAY' | 'YESTERDAY' | 'TOMORROW' | 'DAYS3' | 'DAYS7') => {
    const today = kstToday();
    let s = today;
    let e = today;
    if (type === 'YESTERDAY') {
      s = shiftDays(today, -1);
      e = s;
    } else if (type === 'TOMORROW') {
      s = shiftDays(today, 1);
      e = s;
    } else if (type === 'DAYS3') {
      s = shiftDays(today, -2);
      e = today;
    } else if (type === 'DAYS7') {
      s = shiftDays(today, -6);
      e = today;
    }
    setStartDate(s);
    setEndDate(e);
    setAppliedRange({ start: s, end: e });
    void loadOrders(s, e);
  };

  // ── 품목(품종)별 집계: 정기(업로드) vs 추가 × 1편/2편 실값 ──
  const kindSummary = useMemo<KindSummary[]>(() => {
    const map = new Map<
      string,
      {
        items: Set<number>;
        totalQty: number;
        totalAmt: number;
        reg1Qty: number;
        reg1Amt: number;
        ext1Qty: number;
        ext1Amt: number;
        reg2Qty: number;
        reg2Amt: number;
        ext2Qty: number;
        ext2Amt: number;
      }
    >();
    orders.forEach((o: any) => {
      const isExtra = o.orderType === '추가';
      (o.details || []).forEach((dt: any) => {
        const kind = (dt.product?.kind || '').trim() || '기타';
        let agg = map.get(kind);
        if (!agg) {
          agg = {
            items: new Set(),
            totalQty: 0,
            totalAmt: 0,
            reg1Qty: 0,
            reg1Amt: 0,
            ext1Qty: 0,
            ext1Amt: 0,
            reg2Qty: 0,
            reg2Amt: 0,
            ext2Qty: 0,
            ext2Amt: 0,
          };
          map.set(kind, agg);
        }
        const q1 = num(dt.orderQty1);
        const q2 = num(dt.orderQty2);
        const price = num(dt.unitPrice);
        agg.items.add(dt.productId);
        agg.totalQty += num(dt.totalQty);
        agg.totalAmt += num(dt.amount);
        if (isExtra) {
          agg.ext1Qty += q1;
          agg.ext1Amt += Math.round(q1 * price);
          agg.ext2Qty += q2;
          agg.ext2Amt += Math.round(q2 * price);
        } else {
          agg.reg1Qty += q1;
          agg.reg1Amt += Math.round(q1 * price);
          agg.reg2Qty += q2;
          agg.reg2Amt += Math.round(q2 * price);
        }
      });
    });
    return [...map.entries()]
      .map(([kind, a]) => ({
        kind,
        itemCount: a.items.size,
        totalQty: a.totalQty,
        totalAmt: a.totalAmt,
        reg1Qty: a.reg1Qty,
        reg1Amt: a.reg1Amt,
        ext1Qty: a.ext1Qty,
        ext1Amt: a.ext1Amt,
        reg2Qty: a.reg2Qty,
        reg2Amt: a.reg2Amt,
        ext2Qty: a.ext2Qty,
        ext2Amt: a.ext2Amt,
      }))
      .sort((a, b) => b.totalQty - a.totalQty);
  }, [orders]);

  // ── 센터별 집계 ──
  const centerSummary = useMemo<CenterSummary[]>(() => {
    const map = new Map<
      string,
      {
        items: Set<number>;
        totalQty: number;
        totalAmt: number;
        sub1Qty: number;
        sub1Amt: number;
        sub2Qty: number;
        sub2Amt: number;
      }
    >();
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
        const q1 = num(dt.orderQty1);
        const q2 = num(dt.orderQty2);
        const price = num(dt.unitPrice);
        agg!.items.add(dt.productId);
        agg!.sub1Qty += q1;
        agg!.sub1Amt += Math.round(q1 * price);
        agg!.sub2Qty += q2;
        agg!.sub2Amt += Math.round(q2 * price);
      });
    });
    return [...map.entries()]
      .map(([centerName, a]) => ({
        centerName,
        itemCount: a.items.size,
        totalQty: a.totalQty,
        totalAmt: a.totalAmt,
        sub1Qty: a.sub1Qty,
        sub1Amt: a.sub1Amt,
        sub2Qty: a.sub2Qty,
        sub2Amt: a.sub2Amt,
      }))
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
            qty: 0,
            amt: 0,
          };
          cur.qty += num(dt.totalQty);
          cur.amt += num(dt.amount);
          map.set(dt.productId, cur);
        });
      });
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  }, [orders, selectedCenter]);

  // ── 센터 × 품목군 교차 매트릭스 데이터 ──
  const crossMatrixMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    orders.forEach((o: any) => {
      const c = (o.centerCode || '미지정').trim() || '미지정';
      if (!map[c]) map[c] = {};
      (o.details || []).forEach((dt: any) => {
        const kind = (dt.product?.kind || '').trim() || '기타';
        map[c][kind] = (map[c][kind] || 0) + num(dt.totalQty);
      });
    });
    return map;
  }, [orders]);

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
      if (q > 0)
        rows.push({
          orderNo: o.orderNo,
          orderDate: o.orderDate,
          centerCode: o.centerCode || '-',
          qty: q,
          amt: a,
        });
    });
    return rows.sort((a, b) => (a.orderDate === b.orderDate ? 0 : a.orderDate < b.orderDate ? -1 : 1));
  }, [orders, drillKind]);

  // 합계 계산
  const kindTotals = useMemo(
    () =>
      kindSummary.reduce(
        (acc, r) => ({
          itemCount: acc.itemCount + r.itemCount,
          totalQty: acc.totalQty + r.totalQty,
          totalAmt: acc.totalAmt + r.totalAmt,
          reg1Qty: acc.reg1Qty + r.reg1Qty,
          reg1Amt: acc.reg1Amt + r.reg1Amt,
          ext1Qty: acc.ext1Qty + r.ext1Qty,
          ext1Amt: acc.ext1Amt + r.ext1Amt,
          reg2Qty: acc.reg2Qty + r.reg2Qty,
          reg2Amt: acc.reg2Amt + r.reg2Amt,
          ext2Qty: acc.ext2Qty + r.ext2Qty,
          ext2Amt: acc.ext2Amt + r.ext2Amt,
        }),
        {
          itemCount: 0,
          totalQty: 0,
          totalAmt: 0,
          reg1Qty: 0,
          reg1Amt: 0,
          ext1Qty: 0,
          ext1Amt: 0,
          reg2Qty: 0,
          reg2Amt: 0,
          ext2Qty: 0,
          ext2Amt: 0,
        }
      ),
    [kindSummary]
  );

  const centerTotals = useMemo(
    () =>
      centerSummary.reduce(
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
      ),
    [centerSummary]
  );

  const centerItemsTotalQty = useMemo(() => centerItems.reduce((acc, it) => acc + it.qty, 0), [centerItems]);
  const centerItemsTotalAmt = useMemo(() => centerItems.reduce((acc, it) => acc + it.amt, 0), [centerItems]);

  // 검색 필터링된 센터 목록
  const filteredCenterSummary = useMemo(() => {
    if (!centerSearchTerm.trim()) return centerSummary;
    const kw = centerSearchTerm.trim().toLowerCase();
    return centerSummary.filter((c) => c.centerName.toLowerCase().includes(kw));
  }, [centerSummary, centerSearchTerm]);

  // 검색 필터링된 센터 품목 목록
  const filteredCenterItems = useMemo(() => {
    if (!itemSearchTerm.trim()) return centerItems;
    const kw = itemSearchTerm.trim().toLowerCase();
    return centerItems.filter(
      (it) => it.partName.toLowerCase().includes(kw) || it.partNo.toLowerCase().includes(kw)
    );
  }, [centerItems, itemSearchTerm]);

  // 4대 핵심 지표 계산
  const totalQty = kindTotals.totalQty;
  const totalAmt = kindTotals.totalAmt;
  const s1Qty = kindTotals.reg1Qty + kindTotals.ext1Qty;
  const s2Qty = kindTotals.reg2Qty + kindTotals.ext2Qty;
  const s1Pct = totalQty > 0 ? Math.round((s1Qty / totalQty) * 100) : 50;
  const s2Pct = totalQty > 0 ? 100 - s1Pct : 50;
  const topCenter = centerSummary.length > 0 ? centerSummary[0] : null;
  const topCenterPct = topCenter && totalQty > 0 ? ((topCenter.totalQty / totalQty) * 100).toFixed(1) : '0';

  const rangeLabel =
    appliedRange.start === appliedRange.end ? appliedRange.start : `${appliedRange.start} ~ ${appliedRange.end}`;
  const orderCount = orders.length;

  function dayOverDay(kind: string, qty: number): { text: string; up: boolean | null; title: string } {
    const prev = prevKindQty[kind] || 0;
    if (prev <= 0) return { text: '신규', up: null, title: '직전 기간 수주 없음' };
    if (qty === prev) return { text: '±0%', up: null, title: `직전 ${prev.toLocaleString('ko-KR')} ea → 동일` };
    const pct = ((qty - prev) / prev) * 100;
    const sign = pct > 0 ? '▲' : '▼';
    return {
      text: `${sign}${Math.abs(pct).toFixed(1)}%`,
      up: pct > 0,
      title: `직전 ${prev.toLocaleString('ko-KR')} ea → ${qty.toLocaleString('ko-KR')} ea`,
    };
  }

  // 엑셀(CSV) 다운로드 핸들러
  const handleExportCsv = () => {
    let csv = '\uFEFF'; // UTF-8 BOM
    if (activeTab === 'CENTER') {
      csv += '순위,센터명,품목수,총수량(ea),총금액(원),1편소계(ea),1편금액(원),2편소계(ea),2편금액(원),출하비중(%)\n';
      centerSummary.forEach((c, idx) => {
        const pct = totalQty > 0 ? ((c.totalQty / totalQty) * 100).toFixed(1) : '0';
        csv += `"${idx + 1}","${c.centerName}","${c.itemCount}","${c.totalQty}","${c.totalAmt}","${c.sub1Qty}","${c.sub1Amt}","${c.sub2Qty}","${c.sub2Amt}","${pct}%"\n`;
      });
    } else if (activeTab === 'KIND') {
      csv +=
        '품목군,품목수,총수량(ea),총금액(원),1편정기수량,1편정기금액,1편추가수량,1편추가금액,1편소계수량,1편소계금액,2편정기수량,2편정기금액,2편추가수량,2편추가금액,2편소계수량,2편소계금액\n';
      kindSummary.forEach((k) => {
        csv += `"${k.kind}","${k.itemCount}","${k.totalQty}","${k.totalAmt}","${k.reg1Qty}","${k.reg1Amt}","${k.ext1Qty}","${k.ext1Amt}","${k.reg1Qty + k.ext1Qty}","${k.reg1Amt + k.ext1Amt}","${k.reg2Qty}","${k.reg2Amt}","${k.ext2Qty}","${k.ext2Amt}","${k.reg2Qty + k.ext2Qty}","${k.reg2Amt + k.ext2Amt}"\n`;
      });
    } else {
      const allKinds = kindSummary.map((k) => k.kind);
      csv += `"센터명",${allKinds.map((k) => `"${k}"`).join(',')},"총합계"\n`;
      centerSummary.forEach((c) => {
        const rowVals = allKinds.map((k) => crossMatrixMap[c.centerName]?.[k] || 0);
        csv += `"${c.centerName}",${rowVals.join(',')},"${c.totalQty}"\n`;
      });
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GS25_센터별수주집계_${appliedRange.start}_${appliedRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cellCls = 'whitespace-nowrap py-2 px-2.5 text-right border-r border-slate-200 text-xs sm:text-[13px] font-mono';

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-slate-800 font-sans">
      {/* 0. 상단 액션 바 */}
      <SalesActionBar
        title="센터별 수주 집계 (GS25)"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: handleSearch },
          { key: 'reset', label: '새로고침', icon: 'reset', variant: 'secondary', onClick: handleReset },
          { key: 'excel', label: '엑셀 다운로드', icon: 'excel', variant: 'secondary', onClick: handleExportCsv },
          { key: 'print', label: '인쇄', icon: 'print', variant: 'secondary', onClick: () => window.print() },
        ]}
        helpContent="GS리테일 정기 및 추가 발주 데이터를 납품 센터별, 품목별, 1편/2편별로 실시간 집계합니다. (정기=업로드분, 추가=추가주문분)"
      />

      {/* 1. 조건 검색 바 및 빠른 날짜 버튼 */}
      <div className="bg-white border-b border-slate-300 px-6 py-2.5 shadow-xs shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* 날짜 선택 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Calendar size={15} className="text-blue-600" /> 수주일자:
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-50 border border-slate-300 px-2.5 py-1 text-xs font-mono font-bold rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-slate-400 font-bold">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-50 border border-slate-300 px-2.5 py-1 text-xs font-mono font-bold rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          {/* 빠른 날짜 칩 */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setQuickDate('TODAY')}
              className="px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-blue-700 transition cursor-pointer"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setQuickDate('TOMORROW')}
              className="px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-blue-700 transition cursor-pointer"
            >
              내일
            </button>
            <button
              type="button"
              onClick={() => setQuickDate('YESTERDAY')}
              className="px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-blue-700 transition cursor-pointer"
            >
              어제
            </button>
            <button
              type="button"
              onClick={() => setQuickDate('DAYS3')}
              className="px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-blue-700 transition cursor-pointer"
            >
              3일간
            </button>
            <button
              type="button"
              onClick={() => setQuickDate('DAYS7')}
              className="px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-blue-700 transition cursor-pointer"
            >
              7일간
            </button>
          </div>

          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex items-center gap-1 px-3.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-xs transition cursor-pointer active:scale-95"
          >
            <Search size={13} />
            <span>조회</span>
          </button>
        </div>

        {/* 우측 수주 연동 상태 */}
        <div className="flex items-center gap-2">
          {orderCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>실 수주 연동 정상 ({orderCount}건 등록)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-200 text-slate-600">
              수주 데이터 대기
            </span>
          )}
          {aggAt && <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">최근 집계: {aggAt}</span>}
          <button
            type="button"
            onClick={() => void loadOrders(appliedRange.start, appliedRange.end)}
            title="새로고침"
            className="p-1.5 hover:bg-slate-200 rounded-xl text-slate-600 transition cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. 눈에 확 들어오는 4대 핵심 KPI 카드 바 */}
      <div className="bg-white border-b border-slate-300 px-6 py-2.5 shrink-0 shadow-2xs">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 카드 1: 총 수주 수량 */}
          <div className="bg-gradient-to-br from-blue-50/90 via-white to-blue-50/40 border border-blue-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-black text-blue-700 tracking-tight flex items-center gap-1.5">
                <PackageCheck size={14} className="text-blue-600" />
                <span>총 수주 수량</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-blue-950 font-mono tracking-tight my-0.5">
                {fmt(totalQty)} <span className="text-xs font-bold text-slate-600">EA</span>
              </div>
              <div className="text-[10.5px] font-bold text-slate-500 truncate">
                정기 {fmt(kindTotals.reg1Qty + kindTotals.reg2Qty)} / 추가 {fmt(kindTotals.ext1Qty + kindTotals.ext2Qty)} (
                {totalQty > 0 ? ((kindTotals.ext1Qty + kindTotals.ext2Qty) / totalQty * 100).toFixed(1) : 0}%)
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <PackageCheck size={20} />
            </div>
          </div>

          {/* 카드 2: 총 수주 금액 */}
          <div className="bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 border border-emerald-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-black text-emerald-800 tracking-tight flex items-center gap-1.5">
                <Sparkles size={14} className="text-emerald-600" />
                <span>총 수주 금액 (VAT별도)</span>
              </div>
              <div className="text-lg sm:text-xl font-black text-emerald-950 font-mono tracking-tight my-0.5">
                ₩{fmt(totalAmt)} <span className="text-xs font-bold text-slate-600">원</span>
              </div>
              <div className="text-[10.5px] font-bold text-slate-500 truncate">
                평균 단가: ₩{totalQty > 0 ? Math.round(totalAmt / totalQty).toLocaleString() : 0}원 / EA
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <FileSpreadsheet size={20} />
            </div>
          </div>

          {/* 카드 3: 1편 vs 2편 출하 비중 */}
          <div className="bg-gradient-to-br from-indigo-50/90 via-white to-indigo-50/40 border border-indigo-200/90 rounded-2xl p-3 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-black text-indigo-800 tracking-tight flex items-center gap-1.5">
                <Layers size={14} className="text-indigo-600" />
                <span>출하 편차 (1편 vs 2편)</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-600">
                1편 {s1Pct}% : 2편 {s2Pct}%
              </span>
            </div>
            {/* 듀얼 프로그레스 바 */}
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex my-1.5">
              <div style={{ width: `${s1Pct}%` }} className="bg-emerald-600 h-full" title={`1편: ${fmt(s1Qty)} ea`} />
              <div style={{ width: `${s2Pct}%` }} className="bg-indigo-600 h-full" title={`2편: ${fmt(s2Qty)} ea`} />
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-emerald-800">1편: {fmt(s1Qty)} EA</span>
              <span className="text-indigo-800">2편: {fmt(s2Qty)} EA</span>
            </div>
          </div>

          {/* 카드 4: 납품 물류센터 현황 */}
          <div className="bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 border border-amber-200/90 rounded-2xl p-3 shadow-2xs flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-black text-amber-900 tracking-tight flex items-center gap-1.5">
                <Building2 size={14} className="text-amber-700" />
                <span>납품 물류센터 ({centerSummary.length}개소)</span>
              </div>
              <div className="text-lg sm:text-xl font-black text-amber-950 truncate my-0.5">
                {topCenter ? (
                  <span>
                    🥇 {topCenter.centerName}{' '}
                    <span className="text-xs font-mono font-bold text-amber-800">({topCenterPct}%)</span>
                  </span>
                ) : (
                  '-'
                )}
              </div>
              <div className="text-[10.5px] font-bold text-slate-500 truncate">
                1위 센터 출하량: {topCenter ? fmt(topCenter.totalQty) : 0} EA
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Building2 size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. 3대 뷰 탭 네비게이션 (센터별 상세 vs 품종별 종합 vs 교차 매트릭스) */}
      <div className="px-6 pt-2.5 shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-slate-200/60">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('CENTER')}
            className={`px-4 py-2 rounded-t-xl font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
              activeTab === 'CENTER'
                ? 'bg-white text-blue-900 border-blue-600 shadow-xs'
                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Building2 size={15} className={activeTab === 'CENTER' ? 'text-blue-600' : 'text-slate-400'} />
            <span>🏢 센터별 출하 집계 & 상세 품목</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'CENTER' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              {centerSummary.length}개 센터
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('KIND')}
            className={`px-4 py-2 rounded-t-xl font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
              activeTab === 'KIND'
                ? 'bg-white text-indigo-900 border-indigo-600 shadow-xs'
                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Layers size={15} className={activeTab === 'KIND' ? 'text-indigo-600' : 'text-slate-400'} />
            <span>🍱 품목군별 종합 집계 (1편/2편 · 정기/추가)</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'KIND' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              {kindSummary.length}개 군
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MATRIX')}
            className={`px-4 py-2 rounded-t-xl font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
              activeTab === 'MATRIX'
                ? 'bg-white text-purple-900 border-purple-600 shadow-xs'
                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Grid3X3 size={15} className={activeTab === 'MATRIX' ? 'text-purple-600' : 'text-slate-400'} />
            <span>📊 센터 × 품목 교차 매트릭스 (피벗)</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-bold hidden md:block">
          기준일자: <strong className="text-slate-800 font-mono">{rangeLabel}</strong> • 단위: EA, 원(VAT별도)
        </div>
      </div>

      {/* 4. 본문 테이블 영역 */}
      <div className="flex-1 min-h-0 p-3 overflow-hidden flex flex-col bg-[#f1f5f9]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-300 text-slate-500 font-bold gap-2">
            <RotateCw size={24} className="animate-spin text-blue-600" />
            <span>수주 데이터를 집계 중입니다...</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center bg-white rounded-2xl border border-rose-300 text-rose-600 font-bold text-sm">
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-300 text-slate-400 p-8">
            <Search className="w-12 h-12 mb-3 opacity-30 text-slate-500" />
            <div className="text-base font-black text-slate-700">{rangeLabel} 기간에 등록된 수주가 없습니다.</div>
            <div className="mt-1 text-xs text-slate-500">
              [주문등록GSR] 또는 [추가주문등록]에서 수주를 먼저 등록하거나, 상단 일자를 변경해 주세요.
            </div>
          </div>
        ) : (
          <>
            {/* ── 탭 1: 센터별 집계 + 선택 센터 품목 상세 2분할 ── */}
            {activeTab === 'CENTER' && (
              <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
                {/* 좌측 (65%): 센터별 랭킹 & 출하 집계 */}
                <div className="w-[62%] flex flex-col bg-white border border-slate-300 rounded-2xl shadow-xs overflow-hidden">
                  <div className="bg-slate-100/90 px-4 py-2 border-b border-slate-300 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-blue-600" />
                      <span className="font-black text-sm text-slate-900">납품 센터별 출하 집계</span>
                      <span className="text-xs bg-blue-100 text-blue-800 font-black px-2 py-0.5 rounded-full">
                        총 {filteredCenterSummary.length}개 센터
                      </span>
                    </div>

                    {/* 센터 검색창 */}
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="센터명 검색..."
                        value={centerSearchTerm}
                        onChange={(e) => setCenterSearchTerm(e.target.value)}
                        className="pl-7 pr-3 py-1 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    <EditableTableWrapper readOnly enableColumnResize={false}>
                      <table className="w-full min-w-full text-xs sm:text-[13px] border-collapse font-sans">
                        <thead className="bg-slate-100 text-slate-800 sticky top-0 border-b border-slate-300 z-10 font-bold whitespace-nowrap text-center">
                          <tr>
                            <th className="py-2.5 px-2 border-r border-slate-200 min-w-[50px]">순위</th>
                            <th className="py-2.5 px-3 border-r border-slate-200 min-w-[120px] text-left">센터명</th>
                            <th className="py-2.5 px-2 border-r border-slate-200 min-w-[55px]">품목수</th>
                            <th className="py-2.5 px-2.5 border-r border-slate-200 min-w-[90px] bg-blue-50/60">
                              총 수량 (EA)
                            </th>
                            <th className="py-2.5 px-2.5 border-r border-slate-200 min-w-[75px]">점유율</th>
                            <th className="py-2.5 px-2.5 border-r border-slate-200 min-w-[80px] bg-emerald-50/60 text-emerald-900">
                              1편 소계
                            </th>
                            <th className="py-2.5 px-2.5 border-r border-slate-200 min-w-[80px] bg-indigo-50/60 text-indigo-900">
                              2편 소계
                            </th>
                            <th className="py-2.5 px-2.5 min-w-[100px] text-right">총 금액 (원)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 font-mono">
                          {filteredCenterSummary.map((c, idx) => {
                            const isSelected = selectedCenter === c.centerName;
                            const sharePct =
                              totalQty > 0 ? parseFloat(((c.totalQty / totalQty) * 100).toFixed(1)) : 0;
                            return (
                              <tr
                                key={c.centerName}
                                onClick={() => setSelectedCenter(c.centerName)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-blue-100/90 font-bold ring-1 ring-blue-500'
                                    : 'hover:bg-blue-50/60'
                                }`}
                              >
                                <td className="py-2 px-2 text-center border-r border-slate-200">
                                  {idx === 0 ? (
                                    <span className="inline-block px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-black text-[11px]">
                                      🥇 1
                                    </span>
                                  ) : idx === 1 ? (
                                    <span className="inline-block px-1.5 py-0.2 rounded bg-slate-200 text-slate-800 font-black text-[11px]">
                                      🥈 2
                                    </span>
                                  ) : idx === 2 ? (
                                    <span className="inline-block px-1.5 py-0.2 rounded bg-amber-200/60 text-amber-950 font-black text-[11px]">
                                      🥉 3
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">{idx + 1}</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-sans font-black text-left text-slate-900 border-r border-slate-200">
                                  <div className="flex items-center gap-1.5">
                                    <span>{c.centerName}</span>
                                    {isSelected && (
                                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping shrink-0" />
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-200">
                                  {c.itemCount}
                                </td>
                                <td className="py-2 px-2.5 text-right font-black text-sm text-blue-950 border-r border-slate-200 bg-blue-50/30">
                                  {fmt(c.totalQty)}
                                </td>
                                <td className="py-2 px-2.5 border-r border-slate-200 text-center font-sans">
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                      <div style={{ width: `${sharePct}%` }} className="bg-blue-600 h-full" />
                                    </div>
                                    <span className="text-[10.5px] font-mono text-slate-600 font-bold shrink-0">
                                      {sharePct}%
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-right font-bold text-emerald-900 border-r border-slate-200 bg-emerald-50/20">
                                  {fmt(c.sub1Qty)}
                                </td>
                                <td className="py-2 px-2.5 text-right font-bold text-indigo-900 border-r border-slate-200 bg-indigo-50/20">
                                  {fmt(c.sub2Qty)}
                                </td>
                                <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                                  {fmt(c.totalAmt)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-[#fef9c3] font-mono font-bold text-slate-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                          <tr>
                            <td colSpan={2} className="py-2 px-3 font-sans font-black text-center border-r border-slate-300">
                              합계 ({centerTotals.itemCount}개 센터)
                            </td>
                            <td className="py-2 px-2 text-center border-r border-slate-300">{centerTotals.itemCount}</td>
                            <td className="py-2 px-2.5 text-right text-sm font-black text-blue-950 border-r border-slate-300">
                              {fmt(centerTotals.totalQty)}
                            </td>
                            <td className="py-2 px-2.5 text-center border-r border-slate-300 text-xs font-sans">
                              100%
                            </td>
                            <td className="py-2 px-2.5 text-right font-black text-emerald-950 border-r border-slate-300">
                              {fmt(centerTotals.sub1Qty)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-black text-indigo-950 border-r border-slate-300">
                              {fmt(centerTotals.sub2Qty)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-black text-slate-950">
                              {fmt(centerTotals.totalAmt)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </EditableTableWrapper>
                  </div>
                </div>

                {/* 우측 (38%): 선택 센터 품목별 출하 내역 */}
                <div className="w-[38%] flex flex-col bg-white border border-slate-300 rounded-2xl shadow-xs overflow-hidden">
                  <div className="bg-slate-100/90 px-4 py-2 border-b border-slate-300 flex items-center justify-between gap-2 shrink-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-black text-sm text-slate-900 truncate">
                        <Building2 size={15} className="text-amber-600 shrink-0" />
                        <span className="truncate">[{selectedCenter || '센터 선택'}] 품목 출하</span>
                      </div>
                      <div className="text-[11px] font-bold text-slate-500 font-mono">
                        총 {filteredCenterItems.length}종 • {fmt(centerItemsTotalQty)} EA • ₩{fmt(centerItemsTotalAmt)}원
                      </div>
                    </div>

                    {/* 품목 검색창 */}
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="품명/품번 검색..."
                        value={itemSearchTerm}
                        onChange={(e) => setItemSearchTerm(e.target.value)}
                        className="pl-7 pr-2.5 py-1 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    <EditableTableWrapper readOnly enableColumnResize={false}>
                      <table className="w-full min-w-full text-xs sm:text-[13px] border-collapse font-sans">
                        <thead className="bg-slate-100 text-slate-800 sticky top-0 border-b border-slate-300 z-10 font-bold whitespace-nowrap text-center">
                          <tr>
                            <th className="py-2.5 px-2 border-r border-slate-200 min-w-[70px]">품번</th>
                            <th className="py-2.5 px-3 border-r border-slate-200 text-left">품명</th>
                            <th className="py-2.5 px-2.5 border-r border-slate-200 text-right min-w-[75px]">수량</th>
                            <th className="py-2.5 px-2.5 text-right min-w-[85px]">금액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 font-mono">
                          {filteredCenterItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-12 text-center text-slate-400 font-sans text-xs">
                                등록된 품목이 없습니다.
                              </td>
                            </tr>
                          ) : (
                            filteredCenterItems.map((it, idx) => {
                              const itemPct =
                                centerItemsTotalQty > 0
                                  ? parseFloat(((it.qty / centerItemsTotalQty) * 100).toFixed(1))
                                  : 0;
                              return (
                                <tr key={`${it.partNo}-${idx}`} className="hover:bg-blue-50/60 transition-colors">
                                  <td className="py-2 px-2 text-center text-slate-600 font-mono text-xs border-r border-slate-200">
                                    {it.partNo}
                                  </td>
                                  <td className="py-2 px-3 font-sans text-left font-bold text-slate-900 border-r border-slate-200">
                                    <div className="truncate max-w-[150px]" title={it.partName}>
                                      {it.partName}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <div className="w-16 bg-slate-200 h-1 rounded-full overflow-hidden">
                                        <div style={{ width: `${itemPct}%` }} className="bg-amber-500 h-full" />
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono">{itemPct}%</span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-black text-sm text-blue-950 border-r border-slate-200 bg-blue-50/20">
                                    {fmt(it.qty)}
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                                    {fmt(it.amt)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {filteredCenterItems.length > 0 && (
                          <tfoot className="bg-[#fef9c3] font-mono font-bold text-slate-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                            <tr>
                              <td colSpan={2} className="py-2 px-3 font-sans font-black text-center border-r border-slate-300">
                                센터 합계 ({filteredCenterItems.length}종)
                              </td>
                              <td className="py-2 px-2.5 text-right text-sm font-black text-blue-950 border-r border-slate-300">
                                {fmt(centerItemsTotalQty)}
                              </td>
                              <td className="py-2 px-2.5 text-right font-black text-slate-950">
                                {fmt(centerItemsTotalAmt)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </EditableTableWrapper>
                  </div>
                </div>
              </div>
            )}

            {/* ── 탭 2: 품목군별 종합 집계 (상세표) ── */}
            {activeTab === 'KIND' && (
              <div className="flex-1 flex flex-col bg-white border border-slate-300 rounded-2xl shadow-xs overflow-hidden">
                <div className="bg-slate-100/90 px-4 py-2 border-b border-slate-300 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-indigo-600" />
                    <span className="font-black text-sm text-slate-900">
                      품목군별 종합 집계 (정기 vs 추가 · 1편 vs 2편)
                    </span>
                    <span className="text-xs bg-indigo-100 text-indigo-800 font-black px-2 py-0.5 rounded-full">
                      클릭 시 해당 품목 수주 목록 드릴다운
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">단위: EA, 원</span>
                </div>

                <div className="flex-1 overflow-auto">
                  <EditableTableWrapper readOnly enableColumnResize={false}>
                    <table className="w-full min-w-full text-xs sm:text-[13px] border-collapse font-sans">
                      <thead className="bg-slate-100 text-slate-800 sticky top-0 border-b border-slate-300 z-10 font-bold whitespace-nowrap text-center">
                        <tr className="border-b border-slate-200">
                          <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 min-w-[90px]">
                            품목군
                          </th>
                          <th rowSpan={2} className="py-2.5 px-2 border-r border-slate-200 min-w-[55px]">
                            품목수
                          </th>
                          <th colSpan={2} className="py-2 px-2 border-r border-slate-200 bg-blue-50/70 text-blue-950">
                            총합계
                          </th>
                          <th colSpan={6} className="py-2 px-2 border-r border-slate-200 bg-emerald-50/70 text-emerald-950">
                            1편 (야간)
                          </th>
                          <th colSpan={6} className="py-2 px-2 border-r border-slate-200 bg-indigo-50/70 text-indigo-950">
                            2편 (주간)
                          </th>
                          <th rowSpan={2} className="py-2.5 px-2.5 min-w-[70px]" title="직전 동일 기간 대비 증감률">
                            전일비
                          </th>
                        </tr>
                        <tr className="border-b border-slate-200 text-xs">
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[80px] bg-blue-50/50">수량</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[100px] bg-blue-50/50">금액</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[75px]">정기수량</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[85px]">정기금액</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[70px] text-amber-800">추가수량</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[85px] text-amber-800">추가금액</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[80px] bg-emerald-100/50 text-emerald-900 font-black">
                            1편 소계
                          </th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[90px] bg-emerald-100/50 text-emerald-900 font-black">
                            1편 금액
                          </th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[75px]">정기수량</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[85px]">정기금액</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[70px] text-amber-800">추가수량</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[85px] text-amber-800">추가금액</th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[80px] bg-indigo-100/50 text-indigo-900 font-black">
                            2편 소계
                          </th>
                          <th className="py-1.5 px-2 border-r border-slate-200 min-w-[90px] bg-indigo-100/50 text-indigo-900 font-black">
                            2편 금액
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono">
                        {kindSummary.map((row) => {
                          const dod = dayOverDay(row.kind, row.totalQty);
                          return (
                            <tr
                              key={row.kind}
                              onClick={() => setDrillKind(row.kind)}
                              className="hover:bg-blue-50/70 cursor-pointer transition-colors"
                              title="클릭하면 구성 수주 목록 표시"
                            >
                              <td className="py-2 px-3 font-sans font-black text-center text-sm text-slate-900 border-r border-slate-200 bg-slate-50/50">
                                {row.kind}
                              </td>
                              <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-200">
                                {row.itemCount}
                              </td>
                              <td className={`${cellCls} font-black text-sm text-blue-950 bg-blue-50/40`}>
                                {fmt(row.totalQty)}
                              </td>
                              <td className={`${cellCls} font-black text-slate-900 bg-blue-50/20`}>
                                {fmt(row.totalAmt)}
                              </td>
                              <td className={cellCls}>{fmt(row.reg1Qty)}</td>
                              <td className={cellCls}>{fmt(row.reg1Amt)}</td>
                              <td className={`${cellCls} text-amber-800 font-bold bg-amber-50/30`}>
                                {fmt(row.ext1Qty)}
                              </td>
                              <td className={`${cellCls} text-amber-800 font-bold bg-amber-50/30`}>
                                {fmt(row.ext1Amt)}
                              </td>
                              <td className={`${cellCls} font-black text-emerald-950 bg-emerald-100/40`}>
                                {fmt(row.reg1Qty + row.ext1Qty)}
                              </td>
                              <td className={`${cellCls} font-black text-emerald-950 bg-emerald-100/40`}>
                                {fmt(row.reg1Amt + row.ext1Amt)}
                              </td>
                              <td className={cellCls}>{fmt(row.reg2Qty)}</td>
                              <td className={cellCls}>{fmt(row.reg2Amt)}</td>
                              <td className={`${cellCls} text-amber-800 font-bold bg-amber-50/30`}>
                                {fmt(row.ext2Qty)}
                              </td>
                              <td className={`${cellCls} text-amber-800 font-bold bg-amber-50/30`}>
                                {fmt(row.ext2Amt)}
                              </td>
                              <td className={`${cellCls} font-black text-indigo-950 bg-indigo-100/40`}>
                                {fmt(row.reg2Qty + row.ext2Qty)}
                              </td>
                              <td className={`${cellCls} font-black text-indigo-950 bg-indigo-100/40`}>
                                {fmt(row.reg2Amt + row.ext2Amt)}
                              </td>
                              <td
                                className={`py-2 px-2 text-center text-xs font-black ${
                                  dod.up === true
                                    ? 'text-rose-600 bg-rose-50/50'
                                    : dod.up === false
                                    ? 'text-blue-600 bg-blue-50/50'
                                    : 'text-slate-400'
                                }`}
                                title={dod.title}
                              >
                                {dod.text}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-[#fef9c3] font-mono font-bold text-slate-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                        <tr>
                          <td className="py-2.5 px-3 font-sans font-black text-center text-sm border-r border-slate-300">
                            합계
                          </td>
                          <td className="py-2.5 px-2 text-center border-r border-slate-300">{kindTotals.itemCount}</td>
                          <td className="py-2.5 px-2.5 text-right text-base font-black text-blue-950 border-r border-slate-300">
                            {fmt(kindTotals.totalQty)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right text-sm font-black text-slate-950 border-r border-slate-300">
                            {fmt(kindTotals.totalAmt)}
                          </td>
                          <td className="py-2.5 px-2 text-right border-r border-slate-300">{fmt(kindTotals.reg1Qty)}</td>
                          <td className="py-2.5 px-2 text-right border-r border-slate-300">{fmt(kindTotals.reg1Amt)}</td>
                          <td className="py-2.5 px-2 text-right text-amber-900 font-bold border-r border-slate-300">
                            {fmt(kindTotals.ext1Qty)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-amber-900 font-bold border-r border-slate-300">
                            {fmt(kindTotals.ext1Amt)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-sm font-black text-emerald-950 border-r border-slate-300">
                            {fmt(kindTotals.reg1Qty + kindTotals.ext1Qty)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-sm font-black text-emerald-950 border-r border-slate-300">
                            {fmt(kindTotals.reg1Amt + kindTotals.ext1Amt)}
                          </td>
                          <td className="py-2.5 px-2 text-right border-r border-slate-300">{fmt(kindTotals.reg2Qty)}</td>
                          <td className="py-2.5 px-2 text-right border-r border-slate-300">{fmt(kindTotals.reg2Amt)}</td>
                          <td className="py-2.5 px-2 text-right text-amber-900 font-bold border-r border-slate-300">
                            {fmt(kindTotals.ext2Qty)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-amber-900 font-bold border-r border-slate-300">
                            {fmt(kindTotals.ext2Amt)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-sm font-black text-indigo-950 border-r border-slate-300">
                            {fmt(kindTotals.reg2Qty + kindTotals.ext2Qty)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-sm font-black text-indigo-950 border-r border-slate-300">
                            {fmt(kindTotals.reg2Amt + kindTotals.ext2Amt)}
                          </td>
                          <td className="py-2.5 px-2 text-center text-slate-400 font-normal">-</td>
                        </tr>
                      </tfoot>
                    </table>
                  </EditableTableWrapper>
                </div>
              </div>
            )}

            {/* ── 탭 3: 센터 × 품목 교차 매트릭스 (피벗) ── */}
            {activeTab === 'MATRIX' && (
              <div className="flex-1 flex flex-col bg-white border border-slate-300 rounded-2xl shadow-xs overflow-hidden">
                <div className="bg-slate-100/90 px-4 py-2 border-b border-slate-300 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Grid3X3 size={16} className="text-purple-600" />
                    <span className="font-black text-sm text-slate-900">
                      센터 × 품목군 교차 매트릭스 (어느 센터에 어떤 품목이 얼마나 나가는가?)
                    </span>
                    <span className="text-xs bg-purple-100 text-purple-800 font-black px-2 py-0.5 rounded-full">
                      히트맵 자동 적용
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">단위: EA</span>
                </div>

                <div className="flex-1 overflow-auto">
                  <EditableTableWrapper readOnly enableColumnResize={false}>
                    <table className="w-full min-w-full text-xs sm:text-[13px] border-collapse font-sans">
                      <thead className="bg-slate-100 text-slate-800 sticky top-0 border-b border-slate-300 z-10 font-bold whitespace-nowrap text-center">
                        <tr>
                          <th className="py-2.5 px-3 border-r border-slate-200 min-w-[130px] text-left">
                            물류센터명
                          </th>
                          {kindSummary.map((k) => (
                            <th key={k.kind} className="py-2.5 px-3 border-r border-slate-200 min-w-[85px]">
                              {k.kind}
                            </th>
                          ))}
                          <th className="py-2.5 px-3 bg-blue-100/80 text-blue-950 font-black min-w-[100px]">
                            센터 총합계
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono">
                        {centerSummary.map((c) => (
                          <tr key={c.centerName} className="hover:bg-blue-50/60 transition-colors">
                            <td className="py-2.5 px-3 font-sans font-black text-left text-slate-900 border-r border-slate-200 bg-slate-50/50">
                              {c.centerName}
                            </td>
                            {kindSummary.map((k) => {
                              const val = crossMatrixMap[c.centerName]?.[k.kind] || 0;
                              return (
                                <td
                                  key={k.kind}
                                  className={`py-2 px-3 text-right border-r border-slate-200 ${
                                    val > 0
                                      ? val > 2000
                                        ? 'bg-blue-100/70 font-black text-blue-950'
                                        : 'font-bold text-slate-800'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {val > 0 ? val.toLocaleString() : '-'}
                                </td>
                              );
                            })}
                            <td className="py-2.5 px-3 text-right font-black text-sm text-blue-950 bg-blue-50/50">
                              {c.totalQty.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-[#fef9c3] font-mono font-bold text-slate-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                        <tr>
                          <td className="py-2.5 px-3 font-sans font-black text-center border-r border-slate-300">
                            품목군별 총합계
                          </td>
                          {kindSummary.map((k) => (
                            <td
                              key={k.kind}
                              className="py-2.5 px-3 text-right font-black text-slate-950 border-r border-slate-300"
                            >
                              {k.totalQty.toLocaleString()}
                            </td>
                          ))}
                          <td className="py-2.5 px-3 text-right text-base font-black text-blue-950 bg-amber-200/50">
                            {totalQty.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </EditableTableWrapper>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 드릴다운 팝업 모달 (품목 구성 수주 목록) */}
      {drillKind !== null && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-[680px] max-w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-4 bg-blue-500 rounded-2xs inline-block" />
                <span className="font-black text-base">
                  [{drillKind}] 구성 수주 상세 내역 ({drillRows.length}건)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrillKind(null)}
                className="px-3 py-1 rounded-xl bg-white/15 hover:bg-rose-500 font-bold text-xs text-white transition cursor-pointer"
              >
                닫기 (ESC)
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs sm:text-[13px] border-collapse font-sans">
                <thead className="bg-slate-100 text-slate-800 sticky top-0 border-b border-slate-300 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="py-2 px-3 border-r border-slate-200">주문번호</th>
                    <th className="py-2 px-2 border-r border-slate-200">일자</th>
                    <th className="py-2 px-3 border-r border-slate-200 text-left">납품 센터</th>
                    <th className="py-2 px-2.5 border-r border-slate-200 text-right">수량 (EA)</th>
                    <th className="py-2 px-2.5 text-right">금액 (원)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {drillRows.map((r, i) => (
                    <tr key={`${r.orderNo}-${i}`} className="hover:bg-blue-50/60 transition-colors">
                      <td className="py-2 px-3 border-r border-slate-200 text-slate-600">{r.orderNo}</td>
                      <td className="py-2 px-2 text-center border-r border-slate-200">{r.orderDate}</td>
                      <td className="py-2 px-3 font-sans font-bold text-left border-r border-slate-200 text-slate-900">
                        {r.centerCode}
                      </td>
                      <td className="py-2 px-2.5 text-right font-black text-sm text-blue-950 border-r border-slate-200 bg-blue-50/20">
                        {r.qty.toLocaleString('ko-KR')}
                      </td>
                      <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                        {r.amt.toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fef9c3] font-mono font-bold border-t-2 border-slate-300 sticky bottom-0">
                  <tr>
                    <td colSpan={3} className="py-2.5 px-3 font-sans font-black text-center border-r border-slate-300">
                      합계 ({drillRows.length}건)
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-base font-black text-blue-950 border-r border-slate-300">
                      {drillRows.reduce((s, r) => s + r.qty, 0).toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-sm font-black text-slate-950">
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
