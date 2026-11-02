'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { RotateCw } from 'lucide-react';
import { usePrintReport } from '@/context/PrintReportContext';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';

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
  const [delivDate, setDelivDate] = useState(kstToday());
  const [clientFilter, setClientFilter] = useState('ALL');
  const [summaries, setSummaries] = useState<StatementSummaryRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [details, setDetails] = useState<StatementDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const rawRef = React.useRef<any[]>([]);
  // 품번 → {규격, 단위} (명세서 표시용, 납품明細에 없음)
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
        setDetails(aggregateDetails(src?.details || []));
      } else {
        setDetails([]);
      }
    } catch (err) {
      console.error('Failed to load statement data', err);
      setSummaries([]); setDetails([]); setSelectedKey('');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 선택 유지를 위한 ref (loadData 내 참조용)
  const selectedKeyRef = React.useRef(selectedKey);
  selectedKeyRef.current = selectedKey;

  useEffect(() => { void loadData(delivDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSummary = (id: string) => {
    setSelectedKey(id);
    const raw = rawRef.current.find((d: any) => String(d.id) === id);
    setDetails(aggregateDetails(raw?.details || []));
  };

  const handleBatchIssue = () => {
    const selected = details.filter((d) => d.checked);
    if (selected.length === 0) {
      alert('발행할 거래명세서 품목을 선택하세요.');
      return;
    }
    const summary = summaries.find((s) => s.id === selectedKey);
    if (!summary) {
      alert('납품서를 먼저 선택하세요.');
      return;
    }
    // 선택 품목 실데이터 → 인쇄 페이로드 (샘플 아님)
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

  const centers = [...new Set(summaries.map((s) => s.clientName))];
  const visibleSummaries = clientFilter === 'ALL' ? summaries : summaries.filter((s) => s.clientName === clientFilter);

  const detailTotals = details.reduce(
    (acc, d) => ({ qty: acc.qty + d.delivQtyTotal, amt: acc.amt + d.delivAmtTotal }),
    { qty: 0, amt: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="거래명세서발행"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(delivDate) },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => { const t = kstToday(); setDelivDate(t); setClientFilter('ALL'); void loadData(t); } },
          { key: 'issue', label: '거래명세서일괄출력', icon: 'print', variant: 'success', onClick: handleBatchIssue },
        ]}
        helpContent="납품 확정분에 대해 거래명세서를 발행/출력합니다. 품목을 선택 후 일괄출력을 누르세요."
      />

      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">납품일자:</span>
            <input
              type="date"
              value={delivDate}
              onChange={(e) => setDelivDate(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs shadow-2xs h-6"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">거래처:</span>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="border border-gray-400 bg-white px-2 py-0.5 text-[11px] h-6 rounded-xs"
            >
              <option value="ALL">ALL</option>
              {centers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={() => void loadData(delivDate)}
          className="p-1 hover:bg-gray-200 rounded text-gray-600 cursor-pointer"
          title="새로고침"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        <div className="h-[44%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>요약 (납품서별)</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {visibleSummaries.length}</span>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-10 text-center text-gray-400">불러오는 중...</div>
            ) : visibleSummaries.length === 0 ? (
              <div className="py-10 text-center text-gray-400">해당 일자에 등록된 납품이 없습니다.</div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-32">납품번호</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">납품일자</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">편수</th>
                    <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">거래처명</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">수량계</th>
                    <th className="whitespace-nowrap py-1 px-1 text-right w-28">금액계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {visibleSummaries.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => handleSelectSummary(s.id)}
                      className={`cursor-pointer ${selectedKey === s.id ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'}`}
                    >
                      <td className="whitespace-nowrap py-1 px-2 text-gray-800 border-r border-gray-200">{s.deliveryNo}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{s.delivDate}</td>
                      <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{s.shift}</td>
                      <td className="whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{s.clientName}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{s.qty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-gray-900">{s.amt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table></EditableTableWrapper>
            )}
          </div>
        </div>

        <div className="h-[56%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>내역 (품목별)</span>
              <label className="flex items-center gap-1 text-[11.5px] font-normal text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDetails((prev) => prev.map((d) => ({ ...d, checked })));
                  }}
                  className="w-3 h-3 text-blue-600"
                />
                <span>전체선택</span>
              </label>
            </div>
            <span className="text-[11.5px] text-gray-500 font-mono">선택 {details.filter((d) => d.checked).length}/{details.length}건</span>
          </div>
          <div className="flex-1 overflow-auto">
            {details.length === 0 ? (
              <div className="py-10 text-center text-gray-400">납품서를 선택하세요.</div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                    <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-left">품명</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">단위</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-18">단가</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">납품수량</th>
                    <th className="whitespace-nowrap py-1 px-1 text-right w-24">납품금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {details.map((d) => (
                    <tr key={d.id} className="hover:bg-blue-50/50">
                      <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">
                        <input
                          type="checkbox"
                          checked={d.checked}
                          onChange={() => setDetails((prev) => prev.map((x) => (x.id === d.id ? { ...x, checked: !x.checked } : x)))}
                          className="w-3 h-3 text-blue-600"
                        />
                      </td>
                      <td className="whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.spec}</td>
                      <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.unit}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{d.delivQtyTotal.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-gray-900">{d.delivAmtTotal.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                  <tr>
                    <td colSpan={5} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{detailTotals.qty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right">{detailTotals.amt.toLocaleString()}</td>
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

function aggregateDetails(details: any[]): StatementDetailRow[] {
  const map = new Map<string, StatementDetailRow>();
  details.forEach((dt: any, idx: number) => {
    const code = String(dt.productCode || '');
    const key = `${code}|${dt.unitPrice || 0}`;
    const cur = map.get(key);
    const q = Number(dt.deliveryQty) || 0;
    if (cur) {
      cur.delivQtyTotal += q;
      cur.delivAmtTotal += Number(dt.amount) || Math.round(q * cur.unitPrice);
    } else {
      map.set(key, {
        id: `${dt.id ?? idx}`,
        checked: true,
        productCode: code,
        partName: dt.productName || code || '',
        spec: '',
        unit: 'ea',
        unitPrice: Number(dt.unitPrice) || 0,
        delivQtyTotal: q,
        delivAmtTotal: Number(dt.amount) || Math.round(q * (Number(dt.unitPrice) || 0)),
      });
    }
  });
  return [...map.values()];
}
