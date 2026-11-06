'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { displayRemark } from '@/lib/gfs/docKey';
import { usePipeline } from '@/context/PipelineContext';
import { exportGridToExcel } from '@/lib/excelExport';
import { RotateCw, Search, FileSpreadsheet, CheckCircle2 } from 'lucide-react';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 N일 전 YYYY-MM-DD */
function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

interface UndelivSummaryRow {
  id: string;
  clientName: string;
  shift1Qty: number;
  shift2Qty: number;
  totalQty: number;
  shift1Amt: number;
  shift2Amt: number;
  totalAmt: number;
}

interface UndelivDetailRow {
  id: string;
  centerCode: string;
  tradeDate: string;
  orderNo: string;
  gubun: string;
  kind: string;
  productCode: string;
  partName: string;
  spec: string;
  unit: string;
  shift: string;
  unitPrice: number;
  unDelivQty: number;
  unDelivAmt: number;
  remark: string;
}

export const UndeliveredStatusView: React.FC = () => {
  const { openExcelOrderModal } = usePipeline();
  const [startDate, setStartDate] = useState(() => kstDaysAgo(29));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [summaries, setSummaries] = useState<UndelivSummaryRow[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>('');
  const [details, setDetails] = useState<Record<string, UndelivDetailRow[]>>({});
  const [allDetailRows, setAllDetailRows] = useState<UndelivDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/undelivered?startDate=${s}&endDate=${e}&onlyShort=1`, { cache: 'no-store' });
      const json = await res.json();
      const rows: any[] = json.success && Array.isArray(json.data?.rows) ? json.data.rows : [];

      const sumMap = new Map<string, UndelivSummaryRow>();
      const detMap: Record<string, UndelivDetailRow[]> = {};
      const allList: UndelivDetailRow[] = [];

      rows.forEach((r: any, idx: number) => {
        const center = r.centerCode || '미지정';
        let sum = sumMap.get(center);
        if (!sum) {
          sum = { id: center, clientName: center, shift1Qty: 0, shift2Qty: 0, totalQty: 0, shift1Amt: 0, shift2Amt: 0, totalAmt: 0 };
          sumMap.set(center, sum);
        }

        const un = Number(r.unDelivQty) || 0;
        const unAmt = Number(r.unDelivAmt) || 0;
        const q1 = Number(r.orderQty1) || 0;
        const q2 = Number(r.orderQty2) || 0;
        let u1 = 0;
        let u2 = 0;
        if ((r.shift || '') === '2편') {
          u2 = un;
        } else if ((r.shift || '') === '1편' || q1 + q2 <= 0) {
          u1 = un;
        } else {
          const delivered = Math.max(0, q1 + q2 - un);
          const d1 = Math.min(delivered, q1);
          u1 = Math.max(0, Math.round(q1 - d1));
          u2 = Math.max(0, un - u1);
        }
        const ua1 = un > 0 ? Math.round((unAmt * u1) / un) : 0;
        const ua2 = unAmt - ua1;

        if (!detMap[center]) detMap[center] = [];
        const detailItem: UndelivDetailRow = {
          id: `${r.salesOrderId}:${r.productId}:${idx}`,
          centerCode: center,
          tradeDate: r.orderDate,
          orderNo: r.orderNo,
          gubun: r.category || '완성품',
          kind: r.kind || '-',
          productCode: r.productCode || '-',
          partName: r.productName,
          spec: r.spec || '',
          unit: r.unit || 'ea',
          shift: r.shift || '-',
          unitPrice: Number(r.unitPrice) || 0,
          unDelivQty: un,
          unDelivAmt: unAmt,
          remark: displayRemark(r.storeName || ''),
        };

        detMap[center].push(detailItem);
        allList.push(detailItem);

        sum.totalQty += un;
        sum.totalAmt += unAmt;
        sum.shift1Qty += u1;
        sum.shift1Amt += ua1;
        sum.shift2Qty += u2;
        sum.shift2Amt += ua2;
      });

      const loaded = [...sumMap.values()].sort((a, b) => b.totalQty - a.totalQty);
      setSummaries(loaded);
      setDetails(detMap);
      setAllDetailRows(allList);
      setSelectedCenter((prev) => {
        if (prev && loaded.some((x) => x.id === prev)) return prev;
        return loaded.length > 0 ? loaded[0].id : '';
      });
    } catch (err) {
      console.error('Failed to load undelivered', err);
      setSummaries([]);
      setDetails({});
      setAllDetailRows([]);
      setSelectedCenter('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(startDate, endDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setQuickRange = (days: number) => {
    const s = days === 0 ? kstToday() : kstDaysAgo(days);
    const e = kstToday();
    setStartDate(s);
    setEndDate(e);
    void loadData(s, e);
  };

  const rawCurrentDetails = useMemo(() => {
    return (selectedCenter && details[selectedCenter]) || [];
  }, [selectedCenter, details]);

  const filteredDetails = useMemo(() => {
    if (!searchTerm.trim()) return rawCurrentDetails;
    const term = searchTerm.trim().toLowerCase();
    return rawCurrentDetails.filter(
      (d) =>
        d.partName.toLowerCase().includes(term) ||
        d.productCode.toLowerCase().includes(term) ||
        d.orderNo.toLowerCase().includes(term) ||
        d.remark.toLowerCase().includes(term)
    );
  }, [rawCurrentDetails, searchTerm]);

  const sumTotals = useMemo(
    () =>
      summaries.reduce(
        (acc, s) => ({
          s1Q: acc.s1Q + s.shift1Qty,
          s2Q: acc.s2Q + s.shift2Qty,
          tQ: acc.tQ + s.totalQty,
          s1A: acc.s1A + s.shift1Amt,
          s2A: acc.s2A + s.shift2Amt,
          tA: acc.tA + s.totalAmt,
        }),
        { s1Q: 0, s2Q: 0, tQ: 0, s1A: 0, s2A: 0, tA: 0 }
      ),
    [summaries]
  );

  const detailTotals = useMemo(
    () =>
      filteredDetails.reduce(
        (acc, d) => ({ qty: acc.qty + d.unDelivQty, amt: acc.amt + d.unDelivAmt }),
        { qty: 0, amt: 0 }
      ),
    [filteredDetails]
  );

  const handleReset = () => {
    const s = kstDaysAgo(29);
    const t = kstToday();
    setStartDate(s);
    setEndDate(t);
    setSearchTerm('');
    void loadData(s, t);
  };

  const handleExportExcel = () => {
    if (filteredDetails.length === 0 && summaries.length === 0) {
      alert('내보낼 미출 데이터가 없습니다.');
      return;
    }

    const dataToExport = filteredDetails.length > 0 ? filteredDetails : allDetailRows;
    exportGridToExcel({
      filename: `미출현황_${selectedCenter || '전체'}_${startDate}_${endDate}`,
      sheetName: '미출세부내역',
      columns: [
        { key: 'centerCode', label: '거래처(센터)' },
        { key: 'tradeDate', label: '주문일자', format: 'date' },
        { key: 'orderNo', label: '주문번호' },
        { key: 'productCode', label: '품번' },
        { key: 'partName', label: '품명' },
        { key: 'spec', label: '규격' },
        { key: 'unit', label: '단위' },
        { key: 'shift', label: '배송차수' },
        { key: 'unitPrice', label: '단가', format: 'currency' },
        { key: 'unDelivQty', label: '미출수량', format: 'number' },
        { key: 'unDelivAmt', label: '미출금액', format: 'currency' },
        { key: 'remark', label: '비고(점포/사유)' },
      ],
      data: dataToExport,
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[13px]">
      <SalesActionBar
        title="미출현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'success', onClick: handleExportExcel },
          { key: 'upload', label: '미출 엑셀 업로드', icon: 'excel', variant: 'secondary', onClick: openExcelOrderModal },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
        ]}
        helpContent="주문 대비 미출고/미납품된 수량을 센터 및 편수별로 정밀 집계합니다. (미출 = 수주 − 납품, 수주·납품 등록 데이터가 실시간 자동 반영)"
      />

      {/* Filter Bar with Quick Date Range & Product Search */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-inner">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-gray-700">조회기간:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] font-mono rounded-xs shadow-2xs h-7"
          />
          <span className="text-gray-500 font-bold">~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] font-mono rounded-xs shadow-2xs h-7"
          />

          {/* Quick Date Range Buttons */}
          <div className="flex items-center gap-1 border-l border-gray-300 pl-2">
            <button
              type="button"
              onClick={() => setQuickRange(0)}
              className="px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-[11.5px] font-medium h-7"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setQuickRange(3)}
              className="px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-[11.5px] font-medium h-7"
            >
              3일
            </button>
            <button
              type="button"
              onClick={() => setQuickRange(7)}
              className="px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-[11.5px] font-medium h-7"
            >
              7일
            </button>
            <button
              type="button"
              onClick={() => setQuickRange(29)}
              className="px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-[11.5px] font-medium h-7"
            >
              30일
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadData(startDate, endDate)}
            className="flex items-center gap-1 px-3 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold text-[12px] h-7 shadow-xs"
          >
            <RotateCw className="w-3.5 h-3.5" />
            조회
          </button>
        </div>

        {/* Quick Search in Detail Table */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-gray-400" />
            <input
              type="text"
              placeholder="품명 / 품번 / 점포명 빠른검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0.5 bg-white border border-gray-400 rounded text-[12px] w-56 h-7 focus:outline-none focus:border-blue-500"
            />
          </div>
          <span className="text-[12px] text-gray-600 font-medium">
            미출 센터: <strong className="text-red-700 font-bold">{summaries.length}</strong>곳
          </span>
        </div>
      </div>

      {/* Main split tables */}
      <div className="flex-1 flex flex-col min-h-0 p-1.5 gap-1.5 overflow-hidden">
        {/* Upper Table: Summary by Center */}
        <div className="h-[43%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden rounded-xs">
          <div className="bg-[#eef2f7] px-3 py-1 font-bold text-gray-800 text-[12px] border-b border-gray-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-600" />
              거래처별 미출 요약 (미출 발생 센터만 자동 집계)
            </span>
            <span className="text-[12px] text-gray-600 font-mono">
              센터 수: <strong className="text-gray-900">{summaries.length}</strong>곳
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-12 text-center text-gray-400 font-medium">데이터를 분석 및 집계하는 중입니다...</div>
            ) : summaries.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                <span className="text-base font-bold">지정된 기간 동안 발생한 미출(미납) 내역이 없습니다.</span>
                <span className="text-xs text-gray-500">GS리테일 수주 전량이 정상적으로 100% 출하 및 납품 완료되었습니다.</span>
              </div>
            ) : (
              <EditableTableWrapper readOnly>
                <table className="w-full min-w-full text-[13px] border-collapse font-sans">
                  <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#cbd5e1] z-10 text-center font-bold whitespace-nowrap">
                    <tr className="border-b border-[#cbd5e1]">
                      <th rowSpan={2} className="py-2 px-3 border-r border-[#cbd5e1] text-left">거래처명 (센터)</th>
                      <th colSpan={3} className="py-1 px-1 border-r border-[#cbd5e1] bg-[#e2e8f0]/80">미출 수량</th>
                      <th colSpan={3} className="py-1 px-1 bg-[#ede9fe]/80 text-indigo-950">미출 금액 (원)</th>
                    </tr>
                    <tr className="border-b border-[#cbd5e1] text-[12px]">
                      <th className="py-1 px-2 border-r border-[#cbd5e1] w-24 text-amber-900">1편</th>
                      <th className="py-1 px-2 border-r border-[#cbd5e1] w-24 text-indigo-900">2편</th>
                      <th className="py-1 px-2 border-r border-[#cbd5e1] w-28 bg-[#fee2e2] text-red-900">합계 수량</th>
                      <th className="py-1 px-2 border-r border-[#cbd5e1] w-28">1편</th>
                      <th className="py-1 px-2 border-r border-[#cbd5e1] w-28">2편</th>
                      <th className="py-1 px-2 bg-[#fee2e2] text-red-900 w-32">합계 금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-mono">
                    {summaries.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => setSelectedCenter(s.id)}
                        className={`cursor-pointer transition-colors ${
                          selectedCenter === s.id ? 'bg-[#cffafe] font-bold shadow-inner' : 'hover:bg-blue-50/50'
                        }`}
                      >
                        <td className="py-2 px-3 font-sans text-left border-r border-gray-200 font-bold text-gray-900">
                          {selectedCenter === s.id && <span className="text-blue-600 mr-1.5">▶</span>}
                          {s.clientName}
                        </td>
                        <td className="whitespace-nowrap py-2 px-2.5 text-right border-r border-gray-200 text-amber-900 font-bold">
                          {s.shift1Qty.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap py-2 px-2.5 text-right border-r border-gray-200 text-indigo-900 font-bold">
                          {s.shift2Qty.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap py-2 px-3 text-right font-black text-[14px] text-red-600 border-r border-gray-200 bg-red-50/40">
                          {s.totalQty.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap py-2 px-2.5 text-right border-r border-gray-200 text-gray-800">
                          {s.shift1Amt.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap py-2 px-2.5 text-right border-r border-gray-200 text-gray-800">
                          {s.shift2Amt.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap py-2 px-3 text-right font-black text-[13.5px] text-red-600 bg-red-50/40">
                          {s.totalAmt.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-400 sticky bottom-0 z-10 shadow-xs">
                    <tr>
                      <td className="whitespace-nowrap py-2.5 px-3 font-sans text-center border-r border-gray-300 font-black text-[13.5px]">
                        전체 거래처 총합계 ({summaries.length}개 센터)
                      </td>
                      <td className="whitespace-nowrap py-2.5 px-2.5 text-right text-amber-950 font-black border-r border-gray-300 text-[13.5px]">
                        {sumTotals.s1Q.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap py-2.5 px-2.5 text-right text-indigo-950 font-black border-r border-gray-300 text-[13.5px]">
                        {sumTotals.s2Q.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap py-2.5 px-3 text-right text-red-700 font-black border-r border-gray-300 text-[15px] bg-red-100/60">
                        {sumTotals.tQ.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap py-2.5 px-2.5 text-right border-r border-gray-300 text-gray-900 text-[13.5px]">
                        {sumTotals.s1A.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap py-2.5 px-2.5 text-right border-r border-gray-300 text-gray-900 text-[13.5px]">
                        {sumTotals.s2A.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap py-2.5 px-3 text-right text-red-700 font-black text-[14.5px] bg-red-100/60">
                        {sumTotals.tA.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </EditableTableWrapper>
            )}
          </div>
        </div>

        {/* Lower Table: Details for Selected Center */}
        <div className="h-[57%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden rounded-xs">
          <div className="bg-[#eef2f7] px-3 py-1 font-bold text-gray-800 text-[12px] border-b border-gray-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
              세부 미출 내역: <span className="text-blue-900 font-black text-[13px]">[{selectedCenter || '센터 선택 안됨'}]</span>
              {searchTerm && <span className="text-amber-800 text-xs font-normal">(검색어 &apos;{searchTerm}&apos; 필터 적용 중)</span>}
            </span>
            <span className="text-[12px] text-gray-600 font-mono">
              품목 건수: <strong className="text-gray-900">{filteredDetails.length}</strong>건
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {filteredDetails.length === 0 ? (
              <div className="py-12 text-center text-gray-400 font-medium">
                {selectedCenter ? '선택된 센터의 미출 내역이 없습니다.' : '상단에서 거래처를 선택하세요.'}
              </div>
            ) : (
              <EditableTableWrapper readOnly>
                <table className="w-full min-w-full text-[13px] border-collapse font-sans">
                  <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#cbd5e1] z-10 text-center font-bold whitespace-nowrap">
                    <tr>
                      <th className="py-2 px-2 border-r border-[#cbd5e1] w-24">주문일자</th>
                      <th className="py-2 px-2 border-r border-[#cbd5e1] w-32">주문번호</th>
                      <th className="py-2 px-1 border-r border-[#cbd5e1] w-16">구분</th>
                      <th className="py-2 px-2 border-r border-[#cbd5e1] w-24">품번</th>
                      <th className="py-2 px-3 border-r border-[#cbd5e1] text-left min-w-[200px]">품명</th>
                      <th className="py-2 px-1 border-r border-[#cbd5e1] w-16">규격</th>
                      <th className="py-2 px-1 border-r border-[#cbd5e1] w-12">단위</th>
                      <th className="py-2 px-1 border-r border-[#cbd5e1] w-14">배송차수</th>
                      <th className="py-2 px-2 border-r border-[#cbd5e1] text-right w-20">단가</th>
                      <th className="py-2 px-2 border-r border-[#cbd5e1] text-right w-24 bg-[#fee2e2] text-red-900">미출수량</th>
                      <th className="py-2 px-2.5 border-r border-[#cbd5e1] text-right w-28 bg-[#fee2e2] text-red-900">미출금액</th>
                      <th className="py-2 px-2 text-left min-w-[120px]">비고(점포)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-mono">
                    {filteredDetails.map((d) => (
                      <tr key={d.id} className="hover:bg-blue-50/50">
                        <td className="whitespace-nowrap py-2 px-2 text-center border-r border-gray-200 text-gray-700">{d.tradeDate}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-center text-[12px] text-gray-600 border-r border-gray-200">{d.orderNo}</td>
                        <td className="whitespace-nowrap py-2 px-1 font-sans text-center border-r border-gray-200 text-gray-700">{d.gubun}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-center font-mono text-gray-700 border-r border-gray-200">{d.productCode}</td>
                        <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200 truncate">
                          {d.partName}
                        </td>
                        <td className="whitespace-nowrap py-2 px-1 text-center border-r border-gray-200 text-gray-600">{d.spec || '-'}</td>
                        <td className="whitespace-nowrap py-2 px-1 font-sans text-center border-r border-gray-200 text-gray-600">{d.unit || 'ea'}</td>
                        <td className="whitespace-nowrap py-2 px-1 font-sans text-center font-bold text-blue-900 border-r border-gray-200">{d.shift}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-right border-r border-gray-200 text-gray-700">{d.unitPrice.toLocaleString()}</td>
                        <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[14px] text-red-600 border-r border-gray-200 bg-red-50/40">
                          {d.unDelivQty.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap py-2 px-2.5 text-right font-black text-[13.5px] text-gray-900 border-r border-gray-200">
                          {d.unDelivAmt.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap py-2 px-2 font-sans text-left text-gray-600 truncate">{d.remark || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-400 sticky bottom-0 z-10 shadow-xs">
                    <tr>
                      <td colSpan={9} className="whitespace-nowrap py-2.5 px-3 font-sans text-center border-r border-gray-300 font-black text-[13.5px]">
                        [{selectedCenter}] 미출 합계 ({filteredDetails.length}건)
                      </td>
                      <td className="whitespace-nowrap py-2.5 px-2 text-right text-red-700 font-black text-[15.5px] border-r border-gray-300 bg-red-100/60">
                        {detailTotals.qty.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap py-2.5 px-2.5 text-right text-gray-950 font-black text-[14.5px] border-r border-gray-300">
                        {detailTotals.amt.toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </EditableTableWrapper>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
