'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';
import { erpConfirm } from '@/context/ConfirmContext';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 N일 전 YYYY-MM-DD */
function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

function kstDaysLater(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10);
}

interface OrderHeaderRow {
  id: number;
  checked: boolean;
  orderDate: string;
  orderId: string;
  regType: string;
  orderKind: string;
  clientName: string;
  shift: string;
  status: string;
  orderQty: number;
  orderAmt: number;
  delivAmt: number;
  unDelivAmt: number;
}

interface OrderDetailRow {
  id: number;
  gubun: string;
  kind: string;
  partName: string;
  spec: string;
  unit: string;
  orderQty: number;
  delivQty: number;
  unDelivQty: number;
  unitPrice: number;
  orderAmt: number;
  delivAmt: number;
  unDelivAmt: number;
  remark: string;
}

const STATUS_META: Record<string, string> = {
  '접수': 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]',
  '확정': 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
  '취소': 'bg-[#fff1f2] text-[#be123c] border-[#fecdd3]',
};

export const OrderStatusCancelView: React.FC = () => {
  const [startDate, setStartDate] = useState(() => kstDaysAgo(29));
  const [endDate, setEndDate] = useState(() => kstDaysLater(7));
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [headers, setHeaders] = useState<OrderHeaderRow[]>([]);
  const [selectedHeaderId, setSelectedHeaderId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, OrderDetailRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const [orderRes, undelRes] = await Promise.all([
        fetch(`/api/sales/order?startDate=${s}&endDate=${e}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/sales/undelivered?startDate=${s}&endDate=${e}`, { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (!orderRes.success || !Array.isArray(orderRes.data)) {
        setHeaders([]); setDetails({}); setSelectedHeaderId(null);
        return;
      }
      // 납품수량 맵 (orderId:productId → deliveredQty 누적)
      const delivMap = new Map<string, number>();
      const undelRows: any[] = undelRes.success && Array.isArray(undelRes.data?.rows) ? undelRes.data.rows : [];
      undelRows.forEach((r: any) => {
        const key = `${r.salesOrderId}:${r.productId}`;
        delivMap.set(key, (delivMap.get(key) || 0) + (Number(r.deliveredQty) || 0));
      });

      const newHeaders: OrderHeaderRow[] = [];
      const newDetails: Record<number, OrderDetailRow[]> = {};
      const sorted = [...orderRes.data].sort((a: any, b: any) =>
        a.orderDate === b.orderDate ? (b.id - a.id) : (a.orderDate < b.orderDate ? 1 : -1)
      );
      sorted.forEach((so: any) => {
        const hId = so.id;
        const items = so.details || [];
        let hDelivAmt = 0;
        let hUnDelivAmt = 0;
        newDetails[hId] = items.map((it: any, itIdx: number) => {
          const oQ = Number(it.totalQty) || 0;
          const price = Number(it.unitPrice) || 0;
          const dQ = Math.min(oQ, Number(delivMap.get(`${so.id}:${it.productId}`) || 0));
          const uQ = Math.max(0, oQ - dQ);
          const rawAmt = Number(it.amount);
          const oA = !isNaN(rawAmt) && rawAmt > 0 ? Math.round(rawAmt) : Math.round(oQ * price);
          const dA = oQ > 0 ? Math.round(dQ * (oA / oQ)) : Math.round(dQ * price);
          const uA = Math.max(0, oA - dA);
          hDelivAmt += dA;
          hUnDelivAmt += uA;
          return {
            id: it.id || `${hId}-${itIdx}`,
            gubun: it.product?.category || '완성품',
            kind: it.product?.kind || '-',
            partName: it.product?.name || '',
            spec: it.product?.spec || '',
            unit: it.product?.unit || 'ea',
            orderQty: oQ,
            delivQty: dQ,
            unDelivQty: uQ,
            unitPrice: price,
            orderAmt: oA,
            delivAmt: dA,
            unDelivAmt: uA,
            remark: it.remark || '',
          };
        });
        const clientLabel = so.remark?.startsWith('DOC:')
          ? (so.orderType === '슈퍼' ? 'GS슈퍼' : 'GS25 편의점')
          : (so.centerCode ? (so.remark ? `${so.centerCode} (${so.remark})` : so.centerCode) : (so.remark || 'GS25'));
        newHeaders.push({
          id: hId,
          checked: false,
          orderDate: so.orderDate,
          orderId: so.orderNo,
          regType: so.uploadMethod || '-',
          orderKind: so.orderType || '정규',
          clientName: clientLabel,
          shift: so.shift || '-',
          status: so.status || '접수',
          orderQty: Number(so.totalQty) || 0,
          orderAmt: Number(so.totalAmount) || 0,
          delivAmt: hDelivAmt,
          unDelivAmt: hUnDelivAmt,
        });
      });

      setHeaders(newHeaders);
      setDetails(newDetails);
      setSelectedHeaderId((prev) => {
        if (prev !== null && newHeaders.some((h) => h.id === prev)) return prev;
        return newHeaders.length > 0 ? newHeaders[0].id : null;
      });
    } catch (err) {
      console.error('Failed to load sales orders', err);
      setHeaders([]); setDetails({}); setSelectedHeaderId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(startDate, endDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleHeaders = useMemo(() => {
    return includeCanceled ? headers : headers.filter((h) => h.status !== '취소');
  }, [headers, includeCanceled]);

  const selectedHeader = useMemo(() => {
    return headers.find((h) => h.id === selectedHeaderId) || null;
  }, [headers, selectedHeaderId]);

  const currentDetailList = useMemo(() => {
    return (selectedHeaderId !== null && details[selectedHeaderId]) || [];
  }, [details, selectedHeaderId]);

  const allVisibleChecked = visibleHeaders.length > 0 && visibleHeaders.every((h) => h.checked);

  const handleToggleHeader = (id: number) => {
    setHeaders((prev) => prev.map((h) => (h.id === id ? { ...h, checked: !h.checked } : h)));
  };

  const handleSelectAllVisible = (checked: boolean) => {
    const visibleIds = new Set(visibleHeaders.map((h) => h.id));
    setHeaders((prev) => prev.map((h) => (visibleIds.has(h.id) ? { ...h, checked } : h)));
  };

  // ── 주문 취소 ──
  const handleCancelSelected = async () => {
    const toCancel = headers.filter((h) => h.checked && h.status !== '취소');
    if (toCancel.length === 0) {
      alert('취소할 주문을 선택하세요. (이미 취소된 건 제외)');
      return;
    }
    const ok = await erpConfirm(
      `선택된 ${toCancel.length}건의 주문을 취소하시겠습니까?\n(${toCancel.map((h) => h.orderId).join(', ')})\n\n취소된 수주는 주문집계 및 발주/작업지시 파이프라인에서 자동 제외됩니다.`,
      '주문 취소 확인',
      'danger'
    );
    if (!ok) return;
    setActing(true);
    try {
      for (const h of toCancel) {
        const res = await fetch(`/api/sales/order/${h.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: '취소', cancelReason: '주문현황에서 취소' }),
        });
        const json = await res.json();
        if (!json.success) {
          alert(`취소 실패 (${h.orderId}): ${json.error || '알 수 없는 오류'}`);
          break;
        }
      }
      void loadData(startDate, endDate);
    } finally {
      setActing(false);
    }
  };

  // ── 주문 확정 ──
  const handleConfirmSelected = async () => {
    const toConfirm = headers.filter((h) => h.checked && h.status !== '확정' && h.status !== '취소');
    if (toConfirm.length === 0) {
      alert('확정할 주문을 선택하세요. (이미 확정되었거나 취소된 건 제외)');
      return;
    }
    const ok = await erpConfirm(
      `선택된 ${toConfirm.length}건의 주문을 '확정' 상태로 변경하시겠습니까?\n(${toConfirm.map((h) => h.orderId).join(', ')})`,
      '주문 확정 확인',
      'primary'
    );
    if (!ok) return;
    setActing(true);
    try {
      for (const h of toConfirm) {
        const res = await fetch(`/api/sales/order/${h.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: '확정' }),
        });
        const json = await res.json();
        if (!json.success) {
          alert(`확정 실패 (${h.orderId}): ${json.error || '알 수 없는 오류'}`);
          break;
        }
      }
      void loadData(startDate, endDate);
    } finally {
      setActing(false);
    }
  };

  // ── 취소 주문 복구 ──
  const handleRestoreSelected = async () => {
    const toRestore = headers.filter((h) => h.checked && h.status === '취소');
    if (toRestore.length === 0) {
      alert('복구할 취소 주문을 선택하세요. (상단 "주문취소포함"을 체크하여 취소 건을 선택하세요)');
      return;
    }
    const ok = await erpConfirm(
      `선택된 ${toRestore.length}건의 취소 주문을 정상 '접수' 상태로 복구하시겠습니까?\n(${toRestore.map((h) => h.orderId).join(', ')})\n\n복구 즉시 주문집계 및 발주/작업지시 파이프라인에 다시 포함됩니다.`,
      '주문 복구 확인',
      'primary'
    );
    if (!ok) return;
    setActing(true);
    try {
      for (const h of toRestore) {
        const res = await fetch(`/api/sales/order/${h.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: '접수', cancelReason: '' }),
        });
        const json = await res.json();
        if (!json.success) {
          alert(`복구 실패 (${h.orderId}): ${json.error || '알 수 없는 오류'}`);
          break;
        }
      }
      void loadData(startDate, endDate);
    } finally {
      setActing(false);
    }
  };

  // ── 엑셀 내보내기 ──
  const handleExportExcel = () => {
    if (visibleHeaders.length === 0) {
      alert('내보낼 주문 데이터가 없습니다.');
      return;
    }
    exportGridToExcel({
      filename: `주문현황_${startDate}_${endDate}`,
      sheetName: '주문현황',
      columns: [
        { key: 'orderDate', label: '주문일자', format: 'date' },
        { key: 'orderId', label: '주문번호' },
        { key: 'regType', label: '등록타입' },
        { key: 'orderKind', label: '주문유형' },
        { key: 'clientName', label: '거래처/센터명' },
        { key: 'shift', label: '편수' },
        { key: 'status', label: '상태' },
        { key: 'orderQty', label: '주문수량', format: 'number' },
        { key: 'orderAmt', label: '주문금액', format: 'currency' },
        { key: 'delivAmt', label: '납품금액', format: 'currency' },
        { key: 'unDelivAmt', label: '미납품금액', format: 'currency' },
      ],
      data: visibleHeaders,
    });
  };

  const handleReset = () => {
    const s = kstDaysAgo(29);
    const t = kstDaysLater(7);
    setStartDate(s);
    setEndDate(t);
    setIncludeCanceled(false);
    void loadData(s, t);
  };

  const headerTotals = useMemo(() => visibleHeaders.reduce(
    (acc, h) => ({
      qty: acc.qty + h.orderQty,
      orderAmt: acc.orderAmt + h.orderAmt,
      delivAmt: acc.delivAmt + h.delivAmt,
      unDelivAmt: acc.unDelivAmt + h.unDelivAmt,
    }),
    { qty: 0, orderAmt: 0, delivAmt: 0, unDelivAmt: 0 }
  ), [visibleHeaders]);

  const detailTotals = useMemo(() => currentDetailList.reduce(
    (acc, d) => ({
      orderQty: acc.orderQty + d.orderQty,
      delivQty: acc.delivQty + d.delivQty,
      unDelivQty: acc.unDelivQty + d.unDelivQty,
      orderAmt: acc.orderAmt + d.orderAmt,
      delivAmt: acc.delivAmt + d.delivAmt,
      unDelivAmt: acc.unDelivAmt + d.unDelivAmt,
    }),
    { orderQty: 0, delivQty: 0, unDelivQty: 0, orderAmt: 0, delivAmt: 0, unDelivAmt: 0 }
  ), [currentDetailList]);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[13px]">
      <SalesActionBar
        title="주문현황/취소"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'confirm', label: '주문확정', icon: 'save', variant: 'primary', onClick: () => void handleConfirmSelected() },
          { key: 'cancel', label: '주문취소', icon: 'delete', variant: 'danger', onClick: () => void handleCancelSelected() },
          { key: 'restore', label: '취소복구', icon: 'reset', variant: 'secondary', onClick: () => void handleRestoreSelected() },
          { key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: handleExportExcel },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
        ]}
        helpContent="접수된 GS리테일 주문 건의 현황을 조회하고, 선택 건을 확정 또는 취소/복구합니다. 취소된 수주는 집계·파이프라인에서 자동 제외되며, 복구 시 다시 반영됩니다."
      />

      <SalesFilterBar
        label="주문일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
          void loadData(s, e);
        }}
        onRefresh={() => void loadData(startDate, endDate)}
        dataCount={visibleHeaders.length}
      >
        <div className="flex items-center gap-2 pl-3 border-l border-gray-300">
          <label className="flex items-center gap-1.5 cursor-pointer text-[12px] font-bold text-gray-700 bg-white px-2 py-1 border border-gray-300 rounded shadow-2xs hover:bg-gray-50">
            <input
              type="checkbox"
              checked={includeCanceled}
              onChange={(e) => setIncludeCanceled(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
            />
            <span>주문취소포함</span>
          </label>
        </div>
      </SalesFilterBar>

      <div className="flex-1 flex flex-col min-h-0 p-1.5 gap-1.5 overflow-hidden">
        {/* 상단: 주문 요약 목록 */}
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>주문 요약 목록</span>
              <label className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={(e) => handleSelectAllVisible(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
                />
                <span>전체선택 ({visibleHeaders.filter((h) => h.checked).length}건 선택)</span>
              </label>
            </div>
            <span className="text-[12px] text-gray-600 font-bold font-mono">총 {visibleHeaders.length}건</span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-14 text-center text-gray-500 font-bold text-[14px]">불러오는 중...</div>
            ) : visibleHeaders.length === 0 ? (
              <div className="py-14 text-center text-gray-500 font-medium text-[13.5px]">해당 기간에 등록된 수주가 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] w-12 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      onChange={(e) => handleSelectAllVisible(e.target.checked)}
                      className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
                      title="전체 선택/해제"
                    />
                  </th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[95px]">주문일</th>
                  <th className="whitespace-nowrap py-2 px-2.5 border-r border-[#dbe3ee] min-w-[130px]">주문번호</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[75px]">등록타입</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[75px]">주문유형</th>
                  <th className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee]">거래처/센터명</th>
                  <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] min-w-[55px]">편수</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[65px]">상태</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[85px]">주문수량</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[105px]">주문금액</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[105px]">납품금액</th>
                  <th className="whitespace-nowrap py-2 px-2 text-right min-w-[105px]">미납품금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {visibleHeaders.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => setSelectedHeaderId(h.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedHeaderId === h.id ? 'bg-blue-100/80 font-semibold' : 'hover:bg-blue-50/50'
                    }`}
                  >
                    <td className="whitespace-nowrap py-2 px-1.5 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={h.checked}
                        onChange={() => handleToggleHeader(h.id)}
                        className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
                      />
                    </td>
                    <td className="whitespace-nowrap py-2 px-2 text-center text-gray-700 border-r border-gray-200">{h.orderDate}</td>
                    <td className="whitespace-nowrap py-2 px-2.5 font-bold text-gray-900 border-r border-gray-200">{h.orderId}</td>
                    <td className="whitespace-nowrap py-2 px-2 font-sans text-center text-gray-700 border-r border-gray-200">{h.regType}</td>
                    <td className="whitespace-nowrap py-2 px-2 font-sans text-center text-gray-700 border-r border-gray-200">{h.orderKind}</td>
                    <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200">{h.clientName}</td>
                    <td className="whitespace-nowrap py-2 px-1.5 font-sans font-bold text-center text-gray-700 border-r border-gray-200">{h.shift}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-center border-r border-gray-200">
                      <span className={`chip border px-2 py-0.5 rounded text-[11.5px] font-black ${STATUS_META[h.status] || STATUS_META['접수']}`}>{h.status}</span>
                    </td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[14px] text-blue-900 border-r border-gray-200 bg-blue-50/30">{h.orderQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[13.5px] text-gray-900 border-r border-gray-200">{h.orderAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-[13.5px] text-emerald-800 border-r border-gray-200 bg-emerald-50/30">{h.delivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] text-rose-700 font-black bg-rose-50/30">{h.unDelivAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                <tr>
                  <td colSpan={8} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[14px] border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15px] font-black text-blue-950 border-r border-gray-300">{headerTotals.qty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-gray-950 border-r border-gray-300">{headerTotals.orderAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-emerald-950 border-r border-gray-300">{headerTotals.delivAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-rose-800">{headerTotals.unDelivAmt.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>

        {/* 하단: 품목별 상세 내역 */}
        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <span>내역 (품목별 주문 · 납품 · 미납 상세)</span>
            <span className="text-[12px] font-bold text-gray-700 font-mono">
              {selectedHeader ? (
                <span>
                  선택 주문: <strong className="text-blue-900">{selectedHeader.orderId}</strong> ({selectedHeader.clientName}) · 총 {currentDetailList.length}개 품목
                </span>
              ) : '주문 미선택'}
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {selectedHeaderId === null ? (
              <div className="py-14 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
                <svg className="w-9 h-9 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-sm font-bold text-gray-600">상단 주문 목록에서 확인하실 주문을 클릭하시면 상세 품목 내역이 표시됩니다.</span>
                <span className="text-xs text-gray-400">상단 [엑셀 수주 GS25] 버튼을 통해 당일 엑셀 발주서를 업로드할 수 있습니다.</span>
              </div>
            ) : currentDetailList.length === 0 ? (
              <div className="py-10 text-center text-gray-400 font-medium">해당 주문에 등록된 품목 내역이 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] min-w-[65px]">구분</th>
                  <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] min-w-[70px]">품종</th>
                  <th className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee]">품명</th>
                  <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] min-w-[65px]">규격</th>
                  <th className="whitespace-nowrap py-2 px-1 border-r border-[#dbe3ee] min-w-[50px]">단위</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[80px]">주문수량</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[80px]">납품수량</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[80px]">미납품수량</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[85px]">납품단가</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[95px]">주문금액</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[95px]">납품금액</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[95px]">미납품금액</th>
                  <th className="whitespace-nowrap py-2 px-2.5 min-w-[110px]">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetailList.map((d) => (
                  <tr key={d.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="whitespace-nowrap py-2 px-1.5 font-sans text-center text-gray-700 border-r border-gray-200">{d.gubun}</td>
                    <td className="whitespace-nowrap py-2 px-1.5 font-sans font-bold text-center text-gray-800 border-r border-gray-200">{d.kind}</td>
                    <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200">{d.partName}</td>
                    <td className="whitespace-nowrap py-2 px-1.5 text-center text-gray-600 border-r border-gray-200">{d.spec}</td>
                    <td className="whitespace-nowrap py-2 px-1 font-sans text-center text-gray-600 border-r border-gray-200">{d.unit}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[14px] text-blue-900 border-r border-gray-200 bg-blue-50/20">{d.orderQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-[13.5px] text-emerald-800 border-r border-gray-200 bg-emerald-50/20">{d.delivQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] text-rose-700 font-black border-r border-gray-200 bg-rose-50/20">{d.unDelivQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right text-gray-700 border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-gray-900 border-r border-gray-200">{d.orderAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-emerald-800 border-r border-gray-200">{d.delivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right text-rose-700 font-black border-r border-gray-200">{d.unDelivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2.5 font-sans text-left text-gray-600 truncate">{d.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                <tr>
                  <td colSpan={5} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[14px] border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15px] font-black text-blue-950 border-r border-gray-300">{detailTotals.orderQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-emerald-950 border-r border-gray-300">{detailTotals.delivQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-rose-800 border-r border-gray-300">{detailTotals.unDelivQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 border-r border-gray-300"></td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-gray-950 border-r border-gray-300">{detailTotals.orderAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-emerald-950 border-r border-gray-300">{detailTotals.delivAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-rose-800 border-r border-gray-300">{detailTotals.unDelivAmt.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>
      </div>
      {acting && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center text-white text-[14px] font-bold">
          <div className="bg-slate-900/90 px-6 py-4 rounded-lg shadow-xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>처리 중입니다...</span>
          </div>
        </div>
      )}
    </div>
  );
};
