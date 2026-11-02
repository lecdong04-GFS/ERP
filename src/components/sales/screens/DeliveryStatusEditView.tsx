'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { SalesDataGrid, GridColumnDef } from '../common/SalesDataGrid';
import { exportGridToExcel } from '@/lib/excelExport';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface SummaryRow {
  id: number;
  checked: boolean;
  deliveryNo: string;
  deliveryDate: string;
  centerCode: string;
  shift: string;
  status: string;
  orderNo: string;
  totalQty: number;
  totalAmt: number;
}

interface LeftDetailRow {
  id: number;
  productCode: string;
  productName: string;
  deliveryQty: number;
  unitPrice: number;
  amount: number;
  boxQty: number;
  remark: string;
}

interface RightDetailRow {
  id: string;
  deliveryNo: string;
  deliveryDate: string;
  centerCode: string;
  deliveryQty: number;
  amount: number;
}

const SUMMARY_COLUMNS: GridColumnDef[] = [
  { key: 'deliveryNo', label: '납품번호', width: '130px', align: 'center' },
  { key: 'deliveryDate', label: '납품일자', width: '90px', align: 'center', format: 'date' },
  { key: 'centerCode', label: '거래처', width: '120px', align: 'left' },
  { key: 'shift', label: '편수', width: '55px', align: 'center' },
  { key: 'status', label: '상태', width: '70px', align: 'center' },
  { key: 'orderNo', label: '연결수주', width: '140px', align: 'center' },
  { key: 'totalQty', label: '납품수량계', width: '85px', align: 'right', format: 'number' },
  { key: 'totalAmt', label: '납품금액계', width: '100px', align: 'right', format: 'currency' },
];

const STATUS_OPTIONS = ['대기', '출하', '완료', '취소'] as const;

export const DeliveryStatusEditView: React.FC = () => {
  const [startDate, setStartDate] = useState(kstToday());
  const [endDate, setEndDate] = useState(kstToday());
  const [clientFilter, setClientFilter] = useState('ALL');
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [leftDetails, setLeftDetails] = useState<Record<number, LeftDetailRow[]>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ deliveryDate: '' });
      void params;
      const res = await fetch('/api/sales/delivery', { cache: 'no-store' }).then((r) => r.json());
      let list: any[] = res.success && Array.isArray(res.data) ? res.data : [];
      list = list.filter((d: any) => d.deliveryDate >= s && d.deliveryDate <= e);
      const mapped: SummaryRow[] = list
        .sort((a: any, b: any) => (a.deliveryDate === b.deliveryDate ? b.id - a.id : (a.deliveryDate < b.deliveryDate ? 1 : -1)))
        .map((d: any) => ({
          id: d.id,
          checked: false,
          deliveryNo: d.deliveryNo,
          deliveryDate: d.deliveryDate,
          centerCode: d.centerCode || '-',
          shift: d.shift || '-',
          status: d.status || '완료',
          orderNo: d.salesOrder?.orderNo || '-',
          totalQty: Number(d.totalQty) || 0,
          totalAmt: Number(d.totalAmount) || 0,
        }));
      const detMap: Record<number, LeftDetailRow[]> = {};
      list.forEach((d: any) => {
        detMap[d.id] = (d.details || []).map((dt: any) => ({
          id: dt.id,
          productCode: dt.productCode || '',
          productName: dt.productName || '',
          deliveryQty: Number(dt.deliveryQty) || 0,
          unitPrice: Number(dt.unitPrice) || 0,
          amount: Number(dt.amount) || 0,
          boxQty: Number(dt.boxQty) || 0,
          remark: dt.remark || '',
        }));
      });
      setSummaries(mapped);
      setLeftDetails(detMap);
      setSelectedId((prev) => {
        if (prev !== null && mapped.some((x) => x.id === prev)) return prev;
        return mapped.length > 0 ? mapped[0].id : null;
      });
    } catch (err) {
      console.error('Failed to load deliveries', err);
      setSummaries([]); setLeftDetails({}); setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(startDate, endDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSummaries = clientFilter === 'ALL' ? summaries : summaries.filter((s) => s.centerCode === clientFilter);
  const centerOptions = [...new Set(summaries.map((s) => s.centerCode))];
  const currentLeftRows = (selectedId !== null && leftDetails[selectedId]) || [];
  const selectedSummary = summaries.find((s) => s.id === selectedId);

  // 선택 품목의 납품 이력 (같은 품번, 기간 내 전체 납품에서)
  const [historyProduct, setHistoryProduct] = useState<string>('');
  const historyRows: RightDetailRow[] = [];
  if (historyProduct) {
    summaries.forEach((s) => {
      (leftDetails[s.id] || []).forEach((dt) => {
        if (dt.productCode === historyProduct) {
          historyRows.push({
            id: `${s.id}-${dt.id}`,
            deliveryNo: s.deliveryNo,
            deliveryDate: s.deliveryDate,
            centerCode: s.centerCode,
            deliveryQty: dt.deliveryQty,
            amount: dt.amount,
          });
        }
      });
    });
  }

  const changeStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/sales/delivery/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) void loadData(startDate, endDate);
      else alert(`상태 변경 실패: ${json.error || '알 수 없는 오류'}`);
    } catch (err: any) {
      alert('상태 변경 중 오류: ' + err.message);
    }
  };

  const toggleCheck = (id: number) => {
    setSummaries((prev) => prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s)));
  };

  const cancelChecked = async () => {
    const targets = summaries.filter((s) => s.checked && s.status !== '취소');
    if (targets.length === 0) {
      alert('취소할 납품을 선택하세요. (이미 취소된 건 제외)');
      return;
    }
    if (!window.confirm(`선택된 ${targets.length}건 납품을 취소할까요?`)) return;
    for (const t of targets) {
      const res = await fetch(`/api/sales/delivery/${t.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '취소' }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(`취소 실패 (${t.deliveryNo}): ${json.error}`);
        break;
      }
    }
    void loadData(startDate, endDate);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="납품현황/수정"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'cancel', label: '납품취소', icon: 'delete', variant: 'danger', onClick: () => void cancelChecked() },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => { const t = kstToday(); setStartDate(t); setEndDate(t); setClientFilter('ALL'); void loadData(t, t); } },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: () => exportGridToExcel({ filename: '납품현황', sheetName: '납품현황', columns: SUMMARY_COLUMNS, data: visibleSummaries }),
          },
        ]}
        helpContent="등록된 납품 내역을 일자별로 조회하고 상태를 변경(대기/출하/완료/취소)합니다."
      />

      <SalesFilterBar
        label="납품일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={visibleSummaries.length}
      >
        <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
          <span className="font-semibold text-gray-700 text-[11px]">거래처:</span>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="border border-gray-400 bg-white px-2 py-0.5 text-[11px] h-6 rounded-xs"
          >
            <option value="ALL">전체</option>
            {centerOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </SalesFilterBar>

      <div className="flex-1 flex min-h-0 p-1 gap-1 overflow-hidden">
        <div className="w-[46%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>납품 목록 (선택 시 상태 변경)</span>
            <span className="text-[11.5px] text-gray-500 font-mono">{visibleSummaries.length}건</span>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-10 text-center text-gray-400">불러오는 중...</div>
            ) : visibleSummaries.length === 0 ? (
              <div className="py-10 text-center text-gray-400">해당 기간에 등록된 납품이 없습니다.</div>
            ) : (
              <table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] w-28">납품번호</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] w-20">납품일자</th>
                    <th className="py-1 px-2 border-r border-[#dbe3ee] w-24">거래처</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] w-12">편수</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] w-20">상태</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] text-right w-20">수량계</th>
                    <th className="py-1 px-1 text-right w-24">금액계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {visibleSummaries.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => { setSelectedId(s.id); setHistoryProduct(''); }}
                      className={`cursor-pointer ${selectedId === s.id ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'}`}
                    >
                      <td className="py-1 px-1 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={s.checked} onChange={() => toggleCheck(s.id)} className="w-3 h-3" />
                      </td>
                      <td className="py-1 px-1 text-center text-[11px] border-r border-gray-200">{s.deliveryNo}</td>
                      <td className="py-1 px-1 text-center border-r border-gray-200">{s.deliveryDate}</td>
                      <td className="py-1 px-2 font-sans text-left border-r border-gray-200">{s.centerCode}</td>
                      <td className="py-1 px-1 font-sans text-center border-r border-gray-200">{s.shift}</td>
                      <td className="py-1 px-1 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={s.status}
                          onChange={(e) => void changeStatus(s.id, e.target.value)}
                          className="bg-white border border-gray-300 rounded-xs text-[11px] py-0.5 outline-none"
                        >
                          {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      <td className="py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{s.totalQty.toLocaleString()}</td>
                      <td className="py-1 px-2 text-right font-bold text-gray-900">{s.totalAmt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="w-[32%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300">
            품목明細 {selectedSummary ? `(${selectedSummary.deliveryNo})` : ''}
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-full text-[12px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="py-1 px-2 border-r border-[#dbe3ee] text-left">품명</th>
                  <th className="py-1 px-1 border-r border-[#dbe3ee] text-right w-16">수량</th>
                  <th className="py-1 px-1 text-right w-20">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentLeftRows.length === 0 ? (
                  <tr><td colSpan={3} className="py-8 text-center text-gray-400">품목이 없습니다</td></tr>
                ) : (
                  currentLeftRows.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setHistoryProduct(d.productCode)}
                      className={`cursor-pointer ${historyProduct === d.productCode ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'}`}
                    >
                      <td className="py-1 px-2 font-sans text-left border-r border-gray-200" title={d.productCode}>{d.productName}</td>
                      <td className="py-1 px-1 text-right border-r border-gray-200">{d.deliveryQty.toLocaleString()}</td>
                      <td className="py-1 px-1 text-right">{d.amount.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-[22%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300">
            품목 납품이력
          </div>
          <div className="flex-1 overflow-auto">
            {historyRows.length === 0 ? (
              <div className="py-8 text-center text-[11px] text-gray-400">좌측 품목을 선택하세요</div>
            ) : (
              <table className="w-full min-w-full text-[12px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="py-1 px-1 border-r border-[#dbe3ee]">납품일</th>
                    <th className="py-1 px-1 text-right">수량</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {historyRows.map((r) => (
                    <tr key={r.id} className="hover:bg-blue-50/40">
                      <td className="py-1 px-1 text-center border-r border-gray-200">{r.deliveryDate}</td>
                      <td className="py-1 px-1 text-right font-bold text-blue-900">{r.deliveryQty.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
