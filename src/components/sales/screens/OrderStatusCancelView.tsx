'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { erpConfirm } from '@/context/ConfirmContext';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
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
  const [startDate, setStartDate] = useState(kstToday());
  const [endDate, setEndDate] = useState(kstToday());
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
      // 납품수량 맵 (orderId:productId → deliveredQty)
      const delivMap = new Map<string, number>();
      const undelRows: any[] = undelRes.success && Array.isArray(undelRes.data?.rows) ? undelRes.data.rows : [];
      undelRows.forEach((r: any) => {
        delivMap.set(`${r.salesOrderId}:${r.productId}`, Number(r.deliveredQty) || 0);
      });

      const newHeaders: OrderHeaderRow[] = [];
      const newDetails: Record<number, OrderDetailRow[]> = {};
      const sorted = [...orderRes.data].sort((a: any, b: any) =>
        a.orderDate === b.orderDate ? (a.id - b.id) : (a.orderDate < b.orderDate ? -1 : 1)
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
          const oA = Math.round(oQ * price);
          const dA = Math.round(dQ * price);
          const uA = Math.round(uQ * price);
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
        newHeaders.push({
          id: hId,
          checked: false,
          orderDate: so.orderDate,
          orderId: so.orderNo,
          regType: so.uploadMethod || '-',
          orderKind: so.orderType || '정규',
          clientName: so.centerCode || '-',
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

  const visibleHeaders = includeCanceled ? headers : headers.filter((h) => h.status !== '취소');
  const currentDetailList = (selectedHeaderId !== null && details[selectedHeaderId]) || [];

  const handleToggleHeader = (id: number) => {
    setHeaders((prev) => prev.map((h) => (h.id === id ? { ...h, checked: !h.checked } : h)));
  };

  const handleSelectAllHeaders = (checked: boolean) => {
    setHeaders((prev) => prev.map((h) => ({ ...h, checked })));
  };

  const handleCancelSelected = async () => {
    const toCancel = headers.filter((h) => h.checked && h.status !== '취소');
    if (toCancel.length === 0) {
      alert('취소할 주문을 선택하세요. (이미 취소된 건 제외)');
      return;
    }
    const ok = await erpConfirm(
      `선택된 ${toCancel.length}건의 주문을 취소하시겠습니까?\n(${toCancel.map((h) => h.orderId).join(', ')})`,
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

  const headerTotals = visibleHeaders.reduce(
    (acc, h) => ({
      qty: acc.qty + h.orderQty,
      orderAmt: acc.orderAmt + h.orderAmt,
      delivAmt: acc.delivAmt + h.delivAmt,
      unDelivAmt: acc.unDelivAmt + h.unDelivAmt,
    }),
    { qty: 0, orderAmt: 0, delivAmt: 0, unDelivAmt: 0 }
  );

  const detailTotals = currentDetailList.reduce(
    (acc, d) => ({
      orderQty: acc.orderQty + d.orderQty,
      delivQty: acc.delivQty + d.delivQty,
      unDelivQty: acc.unDelivQty + d.unDelivQty,
      orderAmt: acc.orderAmt + d.orderAmt,
      delivAmt: acc.delivAmt + d.delivAmt,
      unDelivAmt: acc.unDelivAmt + d.unDelivAmt,
    }),
    { orderQty: 0, delivQty: 0, unDelivQty: 0, orderAmt: 0, delivAmt: 0, unDelivAmt: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="주문현황/취소"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'cancel', label: '주문취소', icon: 'delete', variant: 'danger', onClick: () => void handleCancelSelected() },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => { const t = kstToday(); setStartDate(t); setEndDate(t); setIncludeCanceled(false); void loadData(t, t); } },
        ]}
        helpContent="접수된 GS리테일 주문 건의 현황을 조회하고, 선택 건을 취소합니다. 취소된 수주는 집계·파이프라인에서 제외됩니다."
      />

      <SalesFilterBar
        label="주문일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={visibleHeaders.length}
      >
        <div className="flex items-center gap-2 pl-2 border-l border-gray-300">
          <label className="flex items-center gap-1 cursor-pointer text-[11px] font-medium text-gray-700">
            <input
              type="checkbox"
              checked={includeCanceled}
              onChange={(e) => setIncludeCanceled(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded-xs"
            />
            <span>주문취소포함</span>
          </label>
        </div>
      </SalesFilterBar>

      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>요약</span>
              <label className="flex items-center gap-1 text-[11.5px] font-normal text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  onChange={(e) => handleSelectAllHeaders(e.target.checked)}
                  className="w-3 h-3 text-blue-600"
                />
                <span>전체선택</span>
              </label>
            </div>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {visibleHeaders.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-10 text-center text-gray-400">불러오는 중...</div>
            ) : visibleHeaders.length === 0 ? (
              <div className="py-10 text-center text-gray-400">해당 기간에 등록된 수주가 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">주문일</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">주문번호</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">등록타입</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">주문유형</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">거래처명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">편수</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-16">상태</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">주문수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">주문금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">납품금액</th>
                  <th className="whitespace-nowrap py-1 px-1 text-right w-24">미납품금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {visibleHeaders.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => setSelectedHeaderId(h.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedHeaderId === h.id ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={h.checked}
                        onChange={() => handleToggleHeader(h.id)}
                        className="w-3 h-3 text-blue-600 rounded-xs"
                      />
                    </td>
                    <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{h.orderDate}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-bold text-gray-800 border-r border-gray-200">{h.orderId}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{h.regType}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{h.orderKind}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{h.clientName}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{h.shift}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">
                      <span className={`chip border ${STATUS_META[h.status] || STATUS_META['접수']}`}>{h.status}</span>
                    </td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{h.orderQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{h.orderAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{h.delivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-rose-700 font-bold">{h.unDelivAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={8} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{headerTotals.qty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{headerTotals.orderAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{headerTotals.delivAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-rose-700">{headerTotals.unDelivAmt.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>

        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>내역 (품목별 주문·납품·미납)</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {currentDetailList.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            {currentDetailList.length === 0 ? (
              <div className="py-10 text-center text-gray-400">선택된 주문의 품목이 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">구분</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-16">품종</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">품명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">단위</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">주문수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">납품수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">미납품수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-18">납품단가</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">주문금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">납품금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">미납품금액</th>
                  <th className="whitespace-nowrap py-1 px-2 w-24">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetailList.map((d) => (
                  <tr key={d.id} className="hover:bg-blue-50/50">
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.gubun}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.kind}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.spec}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.unit}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{d.orderQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{d.delivQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-rose-700 font-bold border-r border-gray-200">{d.unDelivQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.orderAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.delivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-rose-700 font-bold border-r border-gray-200">{d.unDelivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-left text-gray-600">{d.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={5} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{detailTotals.orderQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{detailTotals.delivQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-rose-700 border-r border-gray-300">{detailTotals.unDelivQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 border-r border-gray-300"></td>
                  <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{detailTotals.orderAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{detailTotals.delivAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-rose-700 border-r border-gray-300">{detailTotals.unDelivAmt.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>
      </div>
      {acting && (
        <div className="fixed inset-0 z-[300] bg-black/30 flex items-center justify-center text-white text-[13px] font-bold">
          처리 중...
        </div>
      )}
    </div>
  );
};
