'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { RotateCw, Printer, FileSpreadsheet } from 'lucide-react';
import { usePrintReport } from '@/context/PrintReportContext';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface StatementSummaryRow {
  id: string;
  deliveryNo: string;
  delivDate: string;
  shift: string;
  clientName: string;
  qty: number;
  amt: number;
}

interface StatementDetailRow {
  id: string;
  checked: boolean;
  productCode: string;
  partName: string;
  spec: string;
  unit: string;
  unitPrice: number;
  delivQtyTotal: number;
  delivAmtTotal: number;
}

export const StatementIssueView: React.FC = () => {
  const { openPrintModal, setPrintPayload } = usePrintReport();
  const [delivDate, setDelivDate] = useState(() => kstToday());
  const [clientFilter, setClientFilter] = useState('ALL');
  const [summaries, setSummaries] = useState<StatementSummaryRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [details, setDetails] = useState<StatementDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const rawRef = React.useRef<any[]>([]);
  const prodMapRef = React.useRef<Map<string, { spec: string; unit: string }>>(new Map());

  const loadData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [delivRes, prodRes] = await Promise.all([
        fetch(`/api/sales/delivery?deliveryDate=${date}`, { cache: 'no-store' }).then((r) => r.json()),
        prodMapRef.current.size > 0
          ? Promise.resolve(null)
          : fetch('/api/master/product', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);
      if (prodRes?.success && Array.isArray(prodRes.data)) {
        const m = new Map<string, { spec: string; unit: string }>();
        prodRes.data.forEach((p: any) => {
          if (p.productCode) m.set(String(p.productCode), { spec: String(p.spec || ''), unit: String(p.unit || 'ea') });
        });
        prodMapRef.current = m;
      }
      let list: any[] = delivRes.success && Array.isArray(delivRes.data) ? delivRes.data : [];
      list = list.filter((d: any) => d.status !== '취소');
      rawRef.current = list;

      const sums: StatementSummaryRow[] = list.map((d: any) => ({
        id: String(d.id),
        deliveryNo: d.deliveryNo,
        delivDate: d.deliveryDate,
        shift: d.shift || '-',
        clientName: d.centerCode || '-',
        qty: Number(d.totalQty) || 0,
        amt: Number(d.totalAmount) || 0,
      }));
      setSummaries(sums);

      const first = sums.length > 0 ? sums[0] : null;
      const keepId = selectedKeyRef.current && sums.some((s) => s.id === selectedKeyRef.current)
        ? selectedKeyRef.current
        : (first ? first.id : '');
      setSelectedKey(keepId);
      const target = sums.find((s) => s.id === keepId);
      if (target) {
        const src = list.find((d: any) => String(d.id) === target.id);
        setDetails(aggregateDetails(src?.details || [], prodMapRef.current));
      } else {
        setDetails([]);
      }
    } catch (err) {
      console.error('Failed to load statement data', err);
      setSummaries([]); setDetails([]); setSelectedKey('');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectedKeyRef = React.useRef(selectedKey);
  selectedKeyRef.current = selectedKey;

  useEffect(() => { void loadData(delivDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSummary = (id: string) => {
    setSelectedKey(id);
    const raw = rawRef.current.find((d: any) => String(d.id) === id);
    setDetails(aggregateDetails(raw?.details || [], prodMapRef.current));
  };

  const handleBatchIssue = () => {
    const selected = details.filter((d) => d.checked);
    if (selected.length === 0) {
      alert('발행할 거래명세서 품목을 1개 이상 선택하세요.');
      return;
    }
    const summary = summaries.find((s) => s.id === selectedKey);
    if (!summary) {
      alert('납품서를 먼저 선택하세요.');
      return;
    }
    // 선택 품목 실데이터 → 인쇄 페이로드
    setPrintPayload({
      deliveryNo: summary.deliveryNo,
      deliveryDate: summary.delivDate,
      centerCode: summary.clientName,
      shift: summary.shift,
      items: selected.map((d) => {
        const su = prodMapRef.current.get(d.productCode) || { spec: d.spec || '', unit: d.unit || 'ea' };
        return {
          code: d.productCode,
          name: d.partName,
          spec: su.spec,
          unit: su.unit,
          qty: d.delivQtyTotal,
          price: d.unitPrice,
        };
      }),
    });
    openPrintModal('DELIVERY_STATEMENT');
  };

  const centers = useMemo(() => [...new Set(summaries.map((s) => s.clientName))], [summaries]);
  const visibleSummaries = useMemo(() => {
    return clientFilter === 'ALL' ? summaries : summaries.filter((s) => s.clientName === clientFilter);
  }, [summaries, clientFilter]);

  const selectedSummary = useMemo(() => {
    return summaries.find((s) => s.id === selectedKey) || null;
  }, [summaries, selectedKey]);

  const allDetailsChecked = details.length > 0 && details.every((d) => d.checked);

  const toggleAllDetails = (checked: boolean) => {
    setDetails((prev) => prev.map((d) => ({ ...d, checked })));
  };

  const summaryTotals = useMemo(() => visibleSummaries.reduce(
    (acc, s) => ({ qty: acc.qty + s.qty, amt: acc.amt + s.amt }),
    { qty: 0, amt: 0 }
  ), [visibleSummaries]);

  const detailTotals = useMemo(() => details.reduce(
    (acc, d) => ({ qty: acc.qty + d.delivQtyTotal, amt: acc.amt + d.delivAmtTotal }),
    { qty: 0, amt: 0 }
  ), [details]);

  const checkedDetailTotals = useMemo(() => details.filter((d) => d.checked).reduce(
    (acc, d) => ({ qty: acc.qty + d.delivQtyTotal, amt: acc.amt + d.delivAmtTotal }),
    { qty: 0, amt: 0 }
  ), [details]);

  const handleExportExcel = () => {
    if (visibleSummaries.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    exportGridToExcel({
      filename: `거래명세서_납품목록_${delivDate}`,
      sheetName: '납품목록',
      columns: [
        { key: 'deliveryNo', label: '납품번호' },
        { key: 'delivDate', label: '납품일자', format: 'date' },
        { key: 'shift', label: '편수' },
        { key: 'clientName', label: '거래처/센터명' },
        { key: 'qty', label: '수량계', format: 'number' },
        { key: 'amt', label: '금액계', format: 'currency' },
      ],
      data: visibleSummaries,
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[13px]">
      <SalesActionBar
        title="거래명세서발행"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(delivDate) },
          { key: 'issue', label: '거래명세서 출력', icon: 'print', variant: 'success', onClick: handleBatchIssue },
          { key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: handleExportExcel },
          {
            key: 'reset',
            label: '초기화',
            icon: 'reset',
            variant: 'secondary',
            onClick: () => {
              const t = kstToday();
              setDelivDate(t);
              setClientFilter('ALL');
              void loadData(t);
            },
          },
        ]}
        helpContent="납품 확정분에 대해 공인 규격 거래명세표를 발행 및 A4 인쇄합니다. 납품서를 선택하고 품목 체크 후 [거래명세서 출력]을 누르세요."
      />

      {/* 조건 필터 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-4 py-2 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[13px] text-gray-800">납품일자:</span>
            <input
              type="date"
              value={delivDate}
              onChange={(e) => {
                setDelivDate(e.target.value);
                void loadData(e.target.value);
              }}
              className="bg-white border border-gray-400 px-2.5 py-1 text-[13px] font-mono font-bold rounded h-7 text-gray-900 shadow-2xs focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-gray-300">
            <span className="font-bold text-[13px] text-gray-800">거래처/센터:</span>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="border border-gray-400 bg-white px-2.5 py-1 text-[12px] font-bold h-7 rounded shadow-2xs focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">전체 거래처</option>
              {centers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-gray-600 bg-gray-200/80 px-2.5 py-1 rounded-sm">
            납품서 선택 후 품목을 체크하여 공인 A4 거래명세표를 출력하세요
          </span>
          <button
            onClick={() => void loadData(delivDate)}
            className="p-1.5 hover:bg-gray-200 rounded text-gray-600 cursor-pointer transition-colors"
            title="새로고침"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-1.5 gap-1.5 overflow-hidden">
        {/* 상단: 납품서별 요약 */}
        <div className="h-[44%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <span>요약 (납품서별 목록 · 클릭 시 상세 내역 조회)</span>
            <span className="text-[12px] text-gray-600 font-bold font-mono">총 {visibleSummaries.length}건 납품서</span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-14 text-center text-gray-500 font-bold text-[14px]">불러오는 중...</div>
            ) : visibleSummaries.length === 0 ? (
              <div className="py-14 text-center text-gray-500 font-medium text-[13.5px]">해당 일자에 등록된 납품 내역이 없습니다.</div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-2 px-2.5 border-r border-[#dbe3ee] min-w-[140px]">납품번호</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[95px]">납품일자</th>
                    <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] min-w-[60px]">편수</th>
                    <th className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee]">거래처/센터명</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[90px]">수량계</th>
                    <th className="whitespace-nowrap py-2 px-2.5 text-right min-w-[110px]">금액계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {visibleSummaries.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => handleSelectSummary(s.id)}
                      className={`cursor-pointer transition-colors ${selectedKey === s.id ? 'bg-blue-100/80 font-semibold' : 'hover:bg-blue-50/50'}`}
                    >
                      <td className="whitespace-nowrap py-2 px-2.5 text-gray-900 font-bold border-r border-gray-200">{s.deliveryNo}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-center text-gray-700 border-r border-gray-200">{s.delivDate}</td>
                      <td className="whitespace-nowrap py-2 px-1.5 font-sans font-bold text-center text-gray-700 border-r border-gray-200">{s.shift}</td>
                      <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200">{s.clientName}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[14px] text-blue-900 border-r border-gray-200 bg-blue-50/30">{s.qty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-2 px-2.5 text-right font-black text-[13.5px] text-gray-900">{s.amt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                  <tr>
                    <td colSpan={4} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[14px] border-r border-gray-300">
                      총 {visibleSummaries.length}건 납품서 합계
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15px] font-black text-blue-950 border-r border-gray-300">{summaryTotals.qty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2.5 px-2.5 text-right text-[14.5px] font-black text-gray-950">{summaryTotals.amt.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table></EditableTableWrapper>
            )}
          </div>
        </div>

        {/* 하단: 품목별 내역 */}
        <div className="h-[56%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>내역 (품목별 거래명세서 출력 대상)</span>
              {selectedSummary && (
                <span className="text-[12px] font-bold text-gray-700 font-mono">
                  선택 납품서: <strong className="text-blue-900">{selectedSummary.deliveryNo}</strong> ({selectedSummary.clientName})
                </span>
              )}
              <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allDetailsChecked}
                  onChange={(e) => toggleAllDetails(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
                />
                <span>전체선택</span>
              </label>
            </div>
            <span className="text-[12px] text-gray-600 font-bold font-mono">
              선택 {details.filter((d) => d.checked).length}건 / 총 {details.length}건 · 선택금액: ₩{checkedDetailTotals.amt.toLocaleString()}
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {selectedKey === '' ? (
              <div className="py-14 text-center text-gray-400 font-medium text-[13px]">
                상단에서 거래명세서를 발행할 납품서를 클릭하세요.
              </div>
            ) : details.length === 0 ? (
              <div className="py-10 text-center text-gray-400 font-medium">선택된 납품서에 품목 내역이 없습니다.</div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] w-12 text-center">
                      <input
                        type="checkbox"
                        checked={allDetailsChecked}
                        onChange={(e) => toggleAllDetails(e.target.checked)}
                        className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
                        title="전체 선택/해제"
                      />
                    </th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[85px]">품번</th>
                    <th className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee] text-left">품명</th>
                    <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] min-w-[65px]">규격</th>
                    <th className="whitespace-nowrap py-2 px-1 border-r border-[#dbe3ee] min-w-[50px]">단위</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[85px]">단가</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[90px]">납품수량</th>
                    <th className="whitespace-nowrap py-2 px-2.5 text-right min-w-[105px]">납품금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {details.map((d) => (
                    <tr key={d.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="whitespace-nowrap py-2 px-1.5 text-center border-r border-gray-200">
                        <input
                          type="checkbox"
                          checked={d.checked}
                          onChange={() => setDetails((prev) => prev.map((x) => (x.id === d.id ? { ...x, checked: !x.checked } : x)))}
                          className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
                        />
                      </td>
                      <td className="whitespace-nowrap py-2 px-2 text-center text-gray-700 border-r border-gray-200">{d.productCode}</td>
                      <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200 truncate">{d.partName}</td>
                      <td className="whitespace-nowrap py-2 px-1.5 text-center text-gray-600 border-r border-gray-200">{d.spec || '-'}</td>
                      <td className="whitespace-nowrap py-2 px-1 font-sans text-center text-gray-600 border-r border-gray-200">{d.unit || 'ea'}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-gray-700 border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[14px] text-blue-900 border-r border-gray-200 bg-blue-50/30">{d.delivQtyTotal.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-2 px-2.5 text-right font-black text-[13.5px] text-gray-900">{d.delivAmtTotal.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                  <tr>
                    <td colSpan={6} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[14px] border-r border-gray-300">
                      선택 품목 합계 ({details.filter((d) => d.checked).length}건 선택)
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15.5px] font-black text-blue-950 border-r border-gray-300 bg-blue-100/40">
                      {checkedDetailTotals.qty.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2.5 text-right text-[14.5px] font-black text-gray-950">
                      {checkedDetailTotals.amt.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table></EditableTableWrapper>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function aggregateDetails(details: any[], prodMap: Map<string, { spec: string; unit: string }>): StatementDetailRow[] {
  const map = new Map<string, StatementDetailRow>();
  details.forEach((dt: any, idx: number) => {
    const code = String(dt.productCode || '');
    const key = `${code}|${dt.unitPrice || 0}`;
    const cur = map.get(key);
    const q = Number(dt.deliveryQty) || 0;
    const su = prodMap.get(code) || { spec: '', unit: 'ea' };
    if (cur) {
      cur.delivQtyTotal += q;
      cur.delivAmtTotal += Number(dt.amount) || Math.round(q * cur.unitPrice);
    } else {
      map.set(key, {
        id: `${dt.id ?? idx}`,
        checked: true,
        productCode: code,
        partName: dt.productName || code || '',
        spec: su.spec,
        unit: su.unit,
        unitPrice: Number(dt.unitPrice) || 0,
        delivQtyTotal: q,
        delivAmtTotal: Number(dt.amount) || Math.round(q * (Number(dt.unitPrice) || 0)),
      });
    }
  });
  return [...map.values()];
}
