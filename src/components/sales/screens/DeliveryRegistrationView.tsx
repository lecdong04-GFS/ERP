'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { SalesActionBar } from '../common/SalesActionBar';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';
import { erpConfirm } from '@/context/ConfirmContext';
import { RotateCw } from 'lucide-react';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 N일 전 YYYY-MM-DD */
function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

interface DeliveryHeaderRow {
  id: number;
  checked: boolean;
  orderDate: string;
  orderNo: string;
  orderKind: string;
  clientName: string;
  shift: string;
  status: '완납' | '부분납품' | '미납';
  orderQty: number;
  unDelivQty: number;
  orderAmt: number;
  prevDelivAmt: number;
  unDelivAmt: number;
}

interface DeliveryDetailRow {
  id: string | number;
  gubun: string;
  productCode: string;
  partName: string;
  spec: string;
  unit: string;
  orderQty: number;
  prevDelivQty: number;
  maxQty: number;
  delivQty: number;
  unitPrice: number;
  orderAmt: number;
  delivAmt: number;
  remark: string;
}

const STATUS_META: Record<string, string> = {
  '완납': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  '부분납품': 'bg-amber-100 text-amber-800 border-amber-300',
  '미납': 'bg-rose-100 text-rose-800 border-rose-300',
};

export const DeliveryRegistrationView: React.FC = () => {
  const { data: session } = useSession();
  const me = session?.user as any;
  const [startDate, setStartDate] = useState(() => kstDaysAgo(29));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [delivDate, setDelivDate] = useState(() => kstToday());
  const [onlyUnDelivered, setOnlyUnDelivered] = useState(true);
  const [headers, setHeaders] = useState<DeliveryHeaderRow[]>([]);
  const [selectedHeaderId, setSelectedHeaderId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, DeliveryDetailRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      // 주문별 미납 맵
      const unMap = new Map<number, { qty: number; amt: number }>();
      const unRows: any[] = undelRes.success && Array.isArray(undelRes.data?.rows) ? undelRes.data.rows : [];
      const delivMap = new Map<string, number>();
      unRows.forEach((r: any) => {
        const cur = unMap.get(r.salesOrderId) || { qty: 0, amt: 0 };
        cur.qty += Number(r.unDelivQty) || 0;
        cur.amt += Number(r.unDelivAmt) || 0;
        unMap.set(r.salesOrderId, cur);
        const key = `${r.salesOrderId}:${r.productId}`;
        delivMap.set(key, (delivMap.get(key) || 0) + (Number(r.deliveredQty) || 0));
      });

      const newHeaders: DeliveryHeaderRow[] = [];
      const newDetails: Record<number, DeliveryDetailRow[]> = {};
      const sorted = [...orderRes.data]
        .filter((o: any) => o.status !== '취소')
        .sort((a: any, b: any) => (a.orderDate === b.orderDate ? b.id - a.id : (a.orderDate < b.orderDate ? 1 : -1)));

      sorted.forEach((so: any) => {
        const un = unMap.get(so.id) || { qty: 0, amt: 0 };
        const prevAmt = Math.max(0, Number(so.totalAmount || 0) - un.amt);
        const statusKind: '완납' | '부분납품' | '미납' = un.qty === 0 ? '완납' : (prevAmt > 0 ? '부분납품' : '미납');

        newHeaders.push({
          id: so.id,
          checked: false,
          orderDate: so.orderDate,
          orderNo: so.orderNo,
          orderKind: so.orderType || '정규',
          clientName: so.centerCode ? (so.remark ? `${so.centerCode} (${so.remark})` : so.centerCode) : (so.remark || '-'),
          shift: so.shift || '-',
          status: statusKind,
          orderQty: Number(so.totalQty) || 0,
          unDelivQty: un.qty,
          orderAmt: Number(so.totalAmount) || 0,
          prevDelivAmt: prevAmt,
          unDelivAmt: un.amt,
        });

        newDetails[so.id] = (so.details || []).map((dt: any, idx: number) => {
          const oQ = Number(dt.totalQty) || 0;
          const price = Number(dt.unitPrice) || 0;
          const key = `${so.id}:${dt.productId}`;
          const already = Math.min(oQ, Number(delivMap.get(key) || 0));
          const remain = Math.max(0, oQ - already);
          return {
            id: dt.id ?? `${so.id}-${idx}`,
            gubun: dt.product?.category || '완성품',
            productCode: dt.product?.productCode || '',
            partName: dt.product?.name || '',
            spec: dt.product?.spec || '',
            unit: dt.product?.unit || 'ea',
            orderQty: oQ,
            prevDelivQty: already,
            maxQty: remain,
            delivQty: remain,
            unitPrice: price,
            orderAmt: Math.round(oQ * price),
            delivAmt: Math.round(remain * price),
            remark: dt.remark || '',
          };
        });
      });

      setHeaders(newHeaders);
      setDetails(newDetails);
      setSelectedHeaderId((prev) => {
        if (prev !== null && newHeaders.some((h) => h.id === prev)) return prev;
        const withShort = newHeaders.find((h) => h.unDelivQty > 0);
        return withShort ? withShort.id : (newHeaders.length > 0 ? newHeaders[0].id : null);
      });
    } catch (err) {
      console.error('Failed to load delivery targets', err);
      setHeaders([]); setDetails({}); setSelectedHeaderId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(startDate, endDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleHeaders = useMemo(() => {
    return onlyUnDelivered ? headers.filter((h) => h.unDelivQty > 0) : headers;
  }, [headers, onlyUnDelivered]);

  const selectedHeader = useMemo(() => {
    return headers.find((h) => h.id === selectedHeaderId) || null;
  }, [headers, selectedHeaderId]);

  const currentDetails = useMemo(() => {
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

  const handleDetailChange = (id: number | string, val: number) => {
    if (selectedHeaderId === null) return;
    setDetails((prev) => ({
      ...prev,
      [selectedHeaderId]: (prev[selectedHeaderId] || []).map((d) => {
        if (d.id !== id) return d;
        const safeVal = Math.max(0, Math.min(Math.round(Number(val) || 0), d.maxQty));
        return { ...d, delivQty: safeVal, delivAmt: safeVal * d.unitPrice };
      }),
    }));
  };

  const handleFillAllMax = () => {
    if (selectedHeaderId === null) return;
    setDetails((prev) => ({
      ...prev,
      [selectedHeaderId]: (prev[selectedHeaderId] || []).map((d) => ({
        ...d,
        delivQty: d.maxQty,
        delivAmt: d.maxQty * d.unitPrice,
      })),
    }));
  };

  const handleClearAll = () => {
    if (selectedHeaderId === null) return;
    setDetails((prev) => ({
      ...prev,
      [selectedHeaderId]: (prev[selectedHeaderId] || []).map((d) => ({
        ...d,
        delivQty: 0,
        delivAmt: 0,
      })),
    }));
  };

  const postDelivery = async (headerId: number, list: DeliveryDetailRow[]) => {
    const h = headers.find((x) => x.id === headerId);
    if (!h) return false;
    const items = list
      .filter((d) => Number(d.delivQty) > 0)
      .map((d) => ({
        productCode: d.productCode || '',
        productName: d.partName,
        deliveryQty: Math.round(Number(d.delivQty)),
        unitPrice: d.unitPrice,
        boxQty: 0,
        remark: d.remark,
      }));
    if (items.length === 0) return true;

    const res = await fetch('/api/sales/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliveryDate: delivDate,
        centerCode: h.clientName,
        shift: h.shift !== '-' ? h.shift : '1편',
        salesOrderId: h.id,
        createdBy: me?.name || me?.loginId || '담당자',
        items,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      alert(`납품 저장 실패 (${h.orderNo}): ${json.error || '알 수 없는 오류'}`);
      return false;
    }
    return true;
  };

  // ── 단일 주문 납품 저장 ──
  const handleSave = async () => {
    if (selectedHeaderId === null) {
      alert('납품할 주문을 선택하세요.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(delivDate)) {
      alert('납품일자를 올바르게 입력하세요.');
      return;
    }
    const list = (details[selectedHeaderId] || []).filter((d) => Number(d.delivQty) > 0);
    if (list.length === 0) {
      alert('납품수량을 1개 이상 입력하세요.');
      return;
    }
    const h = headers.find((x) => x.id === selectedHeaderId);
    const totalDelivQty = list.reduce((s, d) => s + d.delivQty, 0);
    const totalDelivAmt = list.reduce((s, d) => s + d.delivAmt, 0);

    const ok = await erpConfirm(
      `주문 [${h?.orderNo}] ${list.length}개 품목을 납품 등록하시겠습니까?\n\n• 거래처/센터: ${h?.clientName}\n• 납품일자: ${delivDate}\n• 총 납품수량: ${totalDelivQty.toLocaleString()} ea\n• 총 납품금액: ${totalDelivAmt.toLocaleString()} 원\n\n저장 즉시 미출현황에 실시간 차감 반영됩니다.`,
      '납품 등록 확인',
      'primary'
    );
    if (!ok) return;

    setSaving(true);
    try {
      const ok = await postDelivery(selectedHeaderId, details[selectedHeaderId] || []);
      if (ok) {
        alert('납품이 성공적으로 등록되었습니다. 미출현황에 즉시 반영되었습니다.');
        void loadData(startDate, endDate);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── 일괄/선택 납품 저장 ──
  const handleBatchSave = async () => {
    const checkedHeaders = visibleHeaders.filter((h) => h.checked);
    const targetHeaders = checkedHeaders.length > 0
      ? checkedHeaders
      : visibleHeaders.filter((h) => {
          const list = details[h.id] || [];
          return list.some((d) => Number(d.delivQty) > 0);
        });

    if (targetHeaders.length === 0) {
      alert('납품수량이 입력된 주문이 없거나 체크된 주문이 없습니다.');
      return;
    }

    const totalOrders = targetHeaders.length;
    const totalItems = targetHeaders.reduce((sum, h) => {
      return sum + (details[h.id] || []).filter((d) => Number(d.delivQty) > 0).length;
    }, 0);

    const ok = await erpConfirm(
      `선택된 ${totalOrders}건의 주문 (총 ${totalItems}개 품목)을 일괄 납품 등록하시겠습니까?\n\n• 납품일자: ${delivDate}\n• 등록 즉시 미출현황에 실시간 차감 반영됩니다.`,
      '일괄 납품 등록 확인',
      'primary'
    );
    if (!ok) return;

    setSaving(true);
    try {
      let successCount = 0;
      for (const h of targetHeaders) {
        const ok = await postDelivery(h.id, details[h.id] || []);
        if (ok) successCount++;
        else break;
      }
      alert(`${successCount}건의 주문 납품 등록이 완료되었습니다.`);
      void loadData(startDate, endDate);
    } finally {
      setSaving(false);
    }
  };

  // ── 엑셀 내보내기 ──
  const handleExportExcel = () => {
    if (visibleHeaders.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    exportGridToExcel({
      filename: `납품대상목록_${startDate}_${endDate}`,
      sheetName: '납품대상주문',
      columns: [
        { key: 'orderDate', label: '주문날짜', format: 'date' },
        { key: 'orderNo', label: '주문번호' },
        { key: 'orderKind', label: '주문유형' },
        { key: 'clientName', label: '거래처/센터명' },
        { key: 'shift', label: '편수' },
        { key: 'status', label: '상태' },
        { key: 'orderQty', label: '주문수량', format: 'number' },
        { key: 'unDelivQty', label: '미납수량', format: 'number' },
        { key: 'orderAmt', label: '주문금액', format: 'currency' },
        { key: 'prevDelivAmt', label: '기납품금액', format: 'currency' },
        { key: 'unDelivAmt', label: '미납품금액', format: 'currency' },
      ],
      data: visibleHeaders,
    });
  };

  const handleReset = () => {
    const s = kstDaysAgo(29);
    const t = kstToday();
    setStartDate(s);
    setEndDate(t);
    setDelivDate(t);
    setOnlyUnDelivered(true);
    void loadData(s, t);
  };

  const headerTotals = useMemo(() => visibleHeaders.reduce(
    (acc, h) => ({
      qty: acc.qty + h.orderQty,
      unQ: acc.unQ + h.unDelivQty,
      amt: acc.amt + h.orderAmt,
      prev: acc.prev + h.prevDelivAmt,
      unA: acc.unA + h.unDelivAmt,
    }),
    { qty: 0, unQ: 0, amt: 0, prev: 0, unA: 0 }
  ), [visibleHeaders]);

  const currentDetailTotals = useMemo(() => currentDetails.reduce(
    (acc, d) => ({
      orderQty: acc.orderQty + d.orderQty,
      prevDelivQty: acc.prevDelivQty + d.prevDelivQty,
      delivQty: acc.delivQty + d.delivQty,
      remainQty: acc.remainQty + (d.maxQty - d.delivQty),
      orderAmt: acc.orderAmt + d.orderAmt,
      delivAmt: acc.delivAmt + d.delivAmt,
    }),
    { orderQty: 0, prevDelivQty: 0, delivQty: 0, remainQty: 0, orderAmt: 0, delivAmt: 0 }
  ), [currentDetails]);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[13px]">
      <SalesActionBar
        title="납품등록"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'save', label: saving ? '저장 중...' : '선택주문 저장', icon: 'save', variant: 'primary', onClick: () => void handleSave() },
          { key: 'batchSave', label: '일괄/선택저장', icon: 'batchSave', variant: 'success', onClick: () => void handleBatchSave() },
          { key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: handleExportExcel },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
        ]}
        helpContent="미납 잔량이 있는 주문을 불러와 납품수량을 입력하고 확정합니다. 저장 즉시 수주와 1:1 연결되어 미출현황에서 실시간 차감됩니다."
      />

      {/* 조건 및 필터 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-4 py-2 flex flex-wrap items-center justify-between gap-y-2 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[13px] text-gray-800">주문일자:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white border border-gray-400 px-2.5 py-1 text-[13px] font-mono font-bold rounded h-7 text-gray-900 shadow-2xs focus:border-blue-500 focus:outline-hidden"
            />
            <span className="text-gray-500 font-bold">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white border border-gray-400 px-2.5 py-1 text-[13px] font-mono font-bold rounded h-7 text-gray-900 shadow-2xs focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-gray-300">
            <span className="font-bold text-[13px] text-blue-900">납품일자:</span>
            <input
              type="date"
              value={delivDate}
              onChange={(e) => setDelivDate(e.target.value)}
              className="bg-white border-2 border-blue-500 px-2.5 py-1 text-[13px] font-mono font-black rounded h-7 text-blue-950 shadow-2xs focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-gray-300">
            <label className="flex items-center gap-1.5 cursor-pointer text-[12px] font-bold text-gray-700 bg-white px-2.5 py-1 border border-gray-300 rounded shadow-2xs hover:bg-gray-50">
              <input
                type="checkbox"
                checked={onlyUnDelivered}
                onChange={(e) => setOnlyUnDelivered(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded-xs cursor-pointer"
              />
              <span>미납 잔량 주문만 보기</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-gray-600 bg-gray-200/80 px-2.5 py-1 rounded-sm">
            납품수량은 잔여 미납수량 이하로만 입력 가능 (초과 입력 방지)
          </span>
          <button
            onClick={() => void loadData(startDate, endDate)}
            className="p-1.5 hover:bg-gray-200 rounded text-gray-600 cursor-pointer transition-colors"
            title="새로고침"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-1.5 gap-1.5 overflow-hidden">
        {/* 상단: 납품 대상 주문 요약 */}
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>납품 대상 주문 요약</span>
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
              <div className="py-14 text-center text-gray-500 font-medium text-[13.5px]">
                {onlyUnDelivered ? '조회 기간에 미납 잔량이 있는 수주가 없습니다.' : '조회 기간에 등록된 수주가 없습니다.'}
              </div>
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
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[95px]">주문날짜</th>
                  <th className="whitespace-nowrap py-2 px-2.5 border-r border-[#dbe3ee] min-w-[130px]">주문번호</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[75px]">주문유형</th>
                  <th className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee]">거래처/센터명</th>
                  <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] min-w-[55px]">편수</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[70px]">상태</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[85px]">주문수량</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[85px]">미납수량</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[105px]">주문금액</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[105px]">기납품금액</th>
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
                    <td className="whitespace-nowrap py-2 px-2.5 font-bold text-gray-900 border-r border-gray-200">{h.orderNo}</td>
                    <td className="whitespace-nowrap py-2 px-2 font-sans text-center text-gray-700 border-r border-gray-200">{h.orderKind}</td>
                    <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200">{h.clientName}</td>
                    <td className="whitespace-nowrap py-2 px-1.5 font-sans font-bold text-center text-gray-700 border-r border-gray-200">{h.shift}</td>
                    <td className="whitespace-nowrap py-2 px-2 font-sans text-center border-r border-gray-200">
                      <span className={`px-2 py-0.5 rounded text-[11.5px] font-black border ${STATUS_META[h.status] || 'bg-gray-100 text-gray-600'}`}>
                        {h.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[14px] text-blue-900 border-r border-gray-200 bg-blue-50/30">{h.orderQty.toLocaleString()}</td>
                    <td className={`whitespace-nowrap py-2 px-2 text-right font-black text-[14px] border-r border-gray-200 bg-rose-50/30 ${h.unDelivQty > 0 ? 'text-rose-700' : 'text-gray-400'}`}>
                      {h.unDelivQty.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[13.5px] text-gray-900 border-r border-gray-200">{h.orderAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-[13.5px] text-emerald-800 border-r border-gray-200 bg-emerald-50/30">{h.prevDelivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right text-[13.5px] text-rose-700 font-black">{h.unDelivAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                <tr>
                  <td colSpan={7} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[14px] border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15px] font-black text-blue-950 border-r border-gray-300">{headerTotals.qty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15px] font-black text-rose-800 border-r border-gray-300">{headerTotals.unQ.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-gray-950 border-r border-gray-300">{headerTotals.amt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-emerald-950 border-r border-gray-300">{headerTotals.prev.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-rose-800">{headerTotals.unA.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>

        {/* 하단: 품목별 납품수량 입력 그리드 */}
        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>내역 (품목별 납품수량 입력)</span>
              {selectedHeader && (
                <span className="text-[12px] font-bold text-gray-700 font-mono">
                  선택 주문: <strong className="text-blue-900">{selectedHeader.orderNo}</strong> ({selectedHeader.clientName}) · 총 {currentDetails.length}개 품목
                </span>
              )}
            </div>
            {selectedHeader && currentDetails.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFillAllMax}
                  className="px-2.5 py-0.5 text-[12px] font-bold bg-blue-100 text-blue-900 border border-blue-400 rounded hover:bg-blue-200 cursor-pointer shadow-2xs transition-colors"
                  title="모든 품목의 납품수량을 잔여 미납수량으로 채웁니다"
                >
                  잔여 전량 채우기
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-2.5 py-0.5 text-[12px] font-bold bg-gray-100 text-gray-800 border border-gray-400 rounded hover:bg-gray-200 cursor-pointer shadow-2xs transition-colors"
                  title="모든 품목의 납품수량을 0으로 초기화합니다"
                >
                  전체 0으로 비우기
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {selectedHeaderId === null ? (
              <div className="py-14 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
                <span className="text-sm font-bold text-gray-600">상단 주문 목록에서 납품 등록할 주문을 클릭하세요.</span>
              </div>
            ) : currentDetails.length === 0 ? (
              <div className="py-10 text-center text-gray-400 font-medium">선택된 주문의 미납 품목이 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] min-w-[65px]">구분</th>
                  <th className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee]">품명</th>
                  <th className="whitespace-nowrap py-2 px-1.5 border-r border-[#dbe3ee] min-w-[65px]">규격</th>
                  <th className="whitespace-nowrap py-2 px-1 border-r border-[#dbe3ee] min-w-[50px]">단위</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[80px]">주문수량</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[80px]">기납품</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[95px] bg-[#b5baf0]">납품수량</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[80px]">잔여</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[85px]">납품단가</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[95px]">주문금액</th>
                  <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[95px]">납품금액</th>
                  <th className="whitespace-nowrap py-2 px-2.5 min-w-[110px]">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetails.map((d) => (
                  <tr key={d.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="whitespace-nowrap py-2 px-1.5 font-sans text-center text-gray-700 border-r border-gray-200">{d.gubun}</td>
                    <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200">{d.partName}</td>
                    <td className="whitespace-nowrap py-2 px-1.5 text-center text-gray-600 border-r border-gray-200">{d.spec}</td>
                    <td className="whitespace-nowrap py-2 px-1 font-sans text-center text-gray-600 border-r border-gray-200">{d.unit}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right text-gray-700 border-r border-gray-200">{d.orderQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right text-emerald-800 font-bold border-r border-gray-200 bg-emerald-50/20">{d.prevDelivQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-right border-r border-gray-200 bg-blue-50/70">
                      <input
                        type="number"
                        value={d.delivQty}
                        min={0}
                        max={d.maxQty}
                        onChange={(e) => handleDetailChange(d.id, Number(e.target.value))}
                        className="w-20 text-right font-black font-mono text-[14px] text-blue-900 border-2 border-blue-500 px-1.5 py-0.5 bg-white rounded shadow-2xs focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                      />
                    </td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[13.5px] text-rose-700 border-r border-gray-200 bg-rose-50/20">
                      {(d.maxQty - d.delivQty).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap py-2 px-2 text-right text-gray-700 border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-gray-900 border-r border-gray-200">{d.orderAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[13.5px] text-blue-900 border-r border-gray-200 bg-blue-50/20">{d.delivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2 px-2.5 font-sans text-left text-gray-600 truncate">{d.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                <tr>
                  <td colSpan={4} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[14px] border-r border-gray-300">
                    선택 주문 품목 합계 ({currentDetails.length}건)
                  </td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-gray-900 border-r border-gray-300">{currentDetailTotals.orderQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14px] font-black text-emerald-950 border-r border-gray-300">{currentDetailTotals.prevDelivQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15.5px] font-black text-blue-950 border-r border-gray-300 bg-blue-100/50">{currentDetailTotals.delivQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-rose-800 border-r border-gray-300">{currentDetailTotals.remainQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 border-r border-gray-300"></td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-gray-900 border-r border-gray-300">{currentDetailTotals.orderAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15px] font-black text-blue-950 border-r border-gray-300 bg-blue-100/50">{currentDetailTotals.delivAmt.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>
      </div>

      {saving && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center text-white text-[14px] font-bold">
          <div className="bg-slate-900/90 px-6 py-4 rounded-lg shadow-xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>납품을 등록하고 미출현황을 갱신 중입니다...</span>
          </div>
        </div>
      )}
    </div>
  );
};
