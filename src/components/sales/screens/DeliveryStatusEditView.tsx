'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { GridColumnDef } from '../common/SalesDataGrid';
import { exportGridToExcel } from '@/lib/excelExport';
import { erpConfirm } from '@/context/ConfirmContext';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 N일 전 YYYY-MM-DD */
function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
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
  { key: 'centerCode', label: '거래처/센터', width: '120px', align: 'left' },
  { key: 'shift', label: '편수', width: '55px', align: 'center' },
  { key: 'status', label: '상태', width: '70px', align: 'center' },
  { key: 'orderNo', label: '연결수주', width: '140px', align: 'center' },
  { key: 'totalQty', label: '납품수량계', width: '85px', align: 'right', format: 'number' },
  { key: 'totalAmt', label: '납품금액계', width: '100px', align: 'right', format: 'currency' },
];

const STATUS_OPTIONS = ['대기', '출하', '완료', '취소'] as const;

const STATUS_COLORS: Record<string, string> = {
  '완료': 'bg-emerald-50 text-emerald-800 border-emerald-300 font-black',
  '출하': 'bg-blue-50 text-blue-800 border-blue-300 font-bold',
  '대기': 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
  '취소': 'bg-rose-50 text-rose-800 border-rose-300 font-bold',
};

export const DeliveryStatusEditView: React.FC = () => {
  const [startDate, setStartDate] = useState(() => kstDaysAgo(29));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [clientFilter, setClientFilter] = useState('ALL');
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [leftDetails, setLeftDetails] = useState<Record<number, LeftDetailRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [historyProduct, setHistoryProduct] = useState<string>('');

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      const res = await fetch(`/api/sales/delivery?${params}`, { cache: 'no-store' }).then((r) => r.json());
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

  const visibleSummaries = useMemo(() => {
    return clientFilter === 'ALL' ? summaries : summaries.filter((s) => s.centerCode === clientFilter);
  }, [summaries, clientFilter]);

  const centerOptions = useMemo(() => {
    return [...new Set(summaries.map((s) => s.centerCode))];
  }, [summaries]);

  const currentLeftRows = (selectedId !== null && leftDetails[selectedId]) || [];
  const selectedSummary = summaries.find((s) => s.id === selectedId);

  // 선택 품목의 납품 이력 (같은 품번, 기간 내 전체 납품에서)
  const historyRows: RightDetailRow[] = useMemo(() => {
    if (!historyProduct) return [];
    const rows: RightDetailRow[] = [];
    summaries.forEach((s) => {
      (leftDetails[s.id] || []).forEach((dt) => {
        if (dt.productCode === historyProduct) {
          rows.push({
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
    return rows.sort((a, b) => (a.deliveryDate === b.deliveryDate ? 0 : (a.deliveryDate < b.deliveryDate ? 1 : -1)));
  }, [historyProduct, summaries, leftDetails]);

  const changeStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/sales/delivery/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        void loadData(startDate, endDate);
      } else {
        alert(`상태 변경 실패: ${json.error || '알 수 없는 오류'}`);
      }
    } catch (err: any) {
      alert('상태 변경 중 오류: ' + err.message);
    }
  };

  const toggleCheck = (id: number) => {
    setSummaries((prev) => prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s)));
  };

  const allVisibleChecked = visibleSummaries.length > 0 && visibleSummaries.every((s) => s.checked);

  const toggleAllVisible = (checked: boolean) => {
    const visibleIds = new Set(visibleSummaries.map((s) => s.id));
    setSummaries((prev) => prev.map((s) => (visibleIds.has(s.id) ? { ...s, checked } : s)));
  };

  const cancelChecked = async () => {
    const targets = visibleSummaries.filter((s) => s.checked && s.status !== '취소');
    if (targets.length === 0) {
      alert('취소할 납품을 선택하세요. (이미 취소된 건 제외)');
      return;
    }
    const ok = await erpConfirm(
      `선택된 ${targets.length}건의 납품을 '취소' 상태로 변경하시겠습니까?\n(${targets.map((t) => t.deliveryNo).join(', ')})\n\n취소 시 미출현황에서 차감되었던 수량이 다시 미납 수량으로 복구됩니다.`,
      '납품 취소 확인',
      'danger'
    );
    if (!ok) return;
    for (const t of targets) {
      const res = await fetch(`/api/sales/delivery/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

  const completeChecked = async () => {
    const targets = visibleSummaries.filter((s) => s.checked && s.status !== '완료');
    if (targets.length === 0) {
      alert('완료 처리할 납품을 선택하세요. (이미 완료된 건 제외)');
      return;
    }
    const ok = await erpConfirm(
      `선택된 ${targets.length}건의 납품을 '완료' 상태로 변경하시겠습니까?\n(${targets.map((t) => t.deliveryNo).join(', ')})`,
      '납품 완료 처리 확인',
      'primary'
    );
    if (!ok) return;
    for (const t of targets) {
      const res = await fetch(`/api/sales/delivery/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '완료' }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(`완료 처리 실패 (${t.deliveryNo}): ${json.error}`);
        break;
      }
    }
    void loadData(startDate, endDate);
  };

  const summaryTotals = useMemo(() => visibleSummaries.reduce(
    (acc, s) => ({
      qty: acc.qty + s.totalQty,
      amt: acc.amt + s.totalAmt,
    }),
    { qty: 0, amt: 0 }
  ), [visibleSummaries]);

  const leftDetailTotals = useMemo(() => currentLeftRows.reduce(
    (acc, d) => ({
      qty: acc.qty + d.deliveryQty,
      amt: acc.amt + d.amount,
    }),
    { qty: 0, amt: 0 }
  ), [currentLeftRows]);

  const historyTotals = useMemo(() => historyRows.reduce(
    (acc, r) => ({
      qty: acc.qty + r.deliveryQty,
      amt: acc.amt + r.amount,
    }),
    { qty: 0, amt: 0 }
  ), [historyRows]);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[13px]">
      <SalesActionBar
        title="납품현황/수정"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'complete', label: '선택건 완료처리', icon: 'save', variant: 'success', onClick: () => void completeChecked() },
          { key: 'cancel', label: '선택건 납품취소', icon: 'delete', variant: 'danger', onClick: () => void cancelChecked() },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: () => exportGridToExcel({
              filename: `납품현황_${startDate}_${endDate}`,
              sheetName: '납품현황',
              columns: SUMMARY_COLUMNS,
              data: visibleSummaries,
            }),
          },
          {
            key: 'reset',
            label: '초기화',
            icon: 'reset',
            variant: 'secondary',
            onClick: () => {
              const s = kstDaysAgo(29);
              const t = kstToday();
              setStartDate(s);
              setEndDate(t);
              setClientFilter('ALL');
              void loadData(s, t);
            },
          },
        ]}
        helpContent="등록된 납품 내역을 일자별로 조회하고 상태를 변경(대기/출하/완료/취소)합니다. 납품 취소 시 미출현황에 차감되었던 수량이 실시간으로 다시 복구됩니다."
      />

      <SalesFilterBar
        label="납품일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
          void loadData(s, e);
        }}
        onRefresh={() => void loadData(startDate, endDate)}
        dataCount={visibleSummaries.length}
      >
        <div className="flex items-center gap-2 pl-3 border-l border-gray-300">
          <span className="font-bold text-gray-700 text-[12px]">거래처/센터:</span>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="border border-gray-400 bg-white px-2.5 py-1 text-[12px] font-bold h-7 rounded shadow-2xs focus:border-blue-500 focus:outline-hidden"
          >
            <option value="ALL">전체 거래처</option>
            {centerOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </SalesFilterBar>

      <div className="flex-1 flex min-h-0 p-1.5 gap-1.5 overflow-hidden">
        {/* 좌측 패널: 납품 목록 */}
        <div className="w-[48%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>납품 목록 (상태 변경 관제)</span>
              <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
                />
                <span>전체선택 ({visibleSummaries.filter((s) => s.checked).length}건)</span>
              </label>
            </div>
            <span className="text-[12px] text-gray-600 font-bold font-mono">총 {visibleSummaries.length}건</span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-14 text-center text-gray-500 font-bold text-[14px]">불러오는 중...</div>
            ) : visibleSummaries.length === 0 ? (
              <div className="py-14 text-center text-gray-500 font-medium text-[13.5px]">해당 기간에 등록된 납품 내역이 없습니다.</div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="py-2 px-1.5 border-r border-[#dbe3ee] w-12 text-center">
                      <input
                        type="checkbox"
                        checked={allVisibleChecked}
                        onChange={(e) => toggleAllVisible(e.target.checked)}
                        className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
                        title="전체 선택/해제"
                      />
                    </th>
                    <th className="py-2 px-2 border-r border-[#dbe3ee] min-w-[130px]">납품번호</th>
                    <th className="py-2 px-2 border-r border-[#dbe3ee] min-w-[90px]">납품일자</th>
                    <th className="py-2 px-3 border-r border-[#dbe3ee]">거래처/센터</th>
                    <th className="py-2 px-1.5 border-r border-[#dbe3ee] min-w-[55px]">편수</th>
                    <th className="py-2 px-2 border-r border-[#dbe3ee] min-w-[85px]">상태</th>
                    <th className="py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[85px]">수량계</th>
                    <th className="py-2 px-2 text-right min-w-[105px]">금액계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {visibleSummaries.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => { setSelectedId(s.id); setHistoryProduct(''); }}
                      className={`cursor-pointer transition-colors ${selectedId === s.id ? 'bg-blue-100/80 font-semibold' : 'hover:bg-blue-50/50'}`}
                    >
                      <td className="py-2 px-1.5 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={s.checked}
                          onChange={() => toggleCheck(s.id)}
                          className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2 text-center text-gray-900 font-bold border-r border-gray-200">{s.deliveryNo}</td>
                      <td className="py-2 px-2 text-center text-gray-700 border-r border-gray-200">{s.deliveryDate}</td>
                      <td className="py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200">{s.centerCode}</td>
                      <td className="py-2 px-1.5 font-sans font-bold text-center text-gray-700 border-r border-gray-200">{s.shift}</td>
                      <td className="py-1 px-1.5 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={s.status}
                          onChange={(e) => void changeStatus(s.id, e.target.value)}
                          className={`border rounded px-1.5 py-0.5 text-[12px] font-bold shadow-2xs cursor-pointer ${STATUS_COLORS[s.status] || 'bg-white border-gray-300'}`}
                        >
                          {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-2 text-right font-black text-[14px] text-blue-900 border-r border-gray-200 bg-blue-50/30">{s.totalQty.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-black text-[13.5px] text-gray-900">{s.totalAmt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                  <tr>
                    <td colSpan={6} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[14px] border-r border-gray-300">합계</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15px] font-black text-blue-950 border-r border-gray-300">{summaryTotals.qty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-gray-950">{summaryTotals.amt.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table></EditableTableWrapper>
            )}
          </div>
        </div>

        {/* 중간 패널: 품목明細 */}
        <div className="w-[32%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <span>품목明細 {selectedSummary ? `(${selectedSummary.deliveryNo})` : ''}</span>
            <span className="text-[12px] font-bold text-gray-600 font-mono">총 {currentLeftRows.length}개 품목</span>
          </div>
          <div className="flex-1 overflow-auto">
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="py-2 px-2 border-r border-[#dbe3ee] min-w-[75px]">품번</th>
                  <th className="py-2 px-3 border-r border-[#dbe3ee] text-left">품명</th>
                  <th className="py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[70px]">수량</th>
                  <th className="py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[75px]">단가</th>
                  <th className="py-2 px-2 text-right min-w-[85px]">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentLeftRows.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-gray-400 font-medium">품목 내역이 없습니다</td></tr>
                ) : (
                  currentLeftRows.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setHistoryProduct(d.productCode || '')}
                      className={`cursor-pointer transition-colors ${historyProduct && historyProduct === d.productCode ? 'bg-blue-100/80 font-bold' : 'hover:bg-blue-50/50'}`}
                      title="클릭 시 우측에 이 품목의 전체 납품 이력 표시"
                    >
                      <td className="py-2 px-2 text-center text-gray-600 border-r border-gray-200">{d.productCode}</td>
                      <td className="py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200 truncate">{d.productName}</td>
                      <td className="py-2 px-2 text-right font-black text-[14px] text-blue-900 border-r border-gray-200">{d.deliveryQty.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-gray-700 border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-bold text-gray-900">{d.amount.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {currentLeftRows.length > 0 && (
                <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                  <tr>
                    <td colSpan={2} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[13.5px] border-r border-gray-300">소계</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-blue-950 border-r border-gray-300">{leftDetailTotals.qty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2.5 px-2 border-r border-gray-300"></td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-gray-950">{leftDetailTotals.amt.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* 우측 패널: 품목 납품이력 */}
        <div className="w-[20%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <span>품목 납품이력</span>
            {historyProduct && (
              <span className="text-[12px] font-black text-blue-800 font-mono bg-blue-100 px-2 py-0.5 rounded">
                총 {historyRows.length}건
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {historyRows.length === 0 ? (
              <div className="py-14 text-center text-[12.5px] text-gray-400 font-medium">
                좌측 품목을 클릭하시면<br />기간 내 전체 납품 이력이 표시됩니다
              </div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="py-2 px-2 border-r border-[#dbe3ee]">납품일</th>
                    <th className="py-2 px-2 text-right">수량</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {historyRows.map((r) => (
                    <tr key={r.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="py-2 px-2 text-center text-gray-700 border-r border-gray-200">{r.deliveryDate}</td>
                      <td className="py-2 px-2 text-right font-black text-[14px] text-blue-900">{r.deliveryQty.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                  <tr>
                    <td className="whitespace-nowrap py-2.5 px-2 font-sans font-black text-center text-[13px] border-r border-gray-300">합계</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-blue-950">{historyTotals.qty.toLocaleString()}</td>
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
