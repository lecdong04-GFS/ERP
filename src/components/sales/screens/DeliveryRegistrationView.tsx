'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface DeliveryHeaderRow {
  id: number;
  orderDate: string;
  orderNo: string;
  orderKind: string;
  clientName: string;
  shift: string;
  status: string;
  orderQty: number;
  unDelivQty: number;
  orderAmt: number;
  prevDelivAmt: number;
  unDelivAmt: number;
}

interface DeliveryDetailRow {
  id: string | number;
  gubun: string;
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
  '완납': 'bg-emerald-100 text-emerald-800',
  '부분미납': 'bg-amber-100 text-amber-800',
};

export const DeliveryRegistrationView: React.FC = () => {
  const [startDate, setStartDate] = useState(kstToday());
  const [endDate, setEndDate] = useState(kstToday());
  const [delivDate, setDelivDate] = useState(kstToday());
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
        delivMap.set(`${r.salesOrderId}:${r.productId}`, Number(r.deliveredQty) || 0);
      });

      const newHeaders: DeliveryHeaderRow[] = [];
      const newDetails: Record<number, DeliveryDetailRow[]> = {};
      const sorted = [...orderRes.data]
        .filter((o: any) => o.status !== '취소')
        .sort((a: any, b: any) => (a.orderDate === b.orderDate ? a.id - b.id : (a.orderDate < b.orderDate ? -1 : 1)));
      sorted.forEach((so: any) => {
        const un = unMap.get(so.id) || { qty: 0, amt: 0 };
        const prevAmt = Number(so.totalAmount || 0) - un.amt;
        newHeaders.push({
          id: so.id,
          orderDate: so.orderDate,
          orderNo: so.orderNo,
          orderKind: so.orderType || '정규',
          clientName: so.centerCode || '-',
          shift: so.shift || '-',
          status: un.qty > 0 ? '부분미납' : '완납',
          orderQty: Number(so.totalQty) || 0,
          unDelivQty: un.qty,
          orderAmt: Number(so.totalAmount) || 0,
          prevDelivAmt: Math.max(0, prevAmt),
          unDelivAmt: un.amt,
        });
        newDetails[so.id] = (so.details || []).map((dt: any, idx: number) => {
          const oQ = Number(dt.totalQty) || 0;
          const price = Number(dt.unitPrice) || 0;
          const already = Math.min(oQ, Number(delivMap.get(`${so.id}:${dt.productId}`) || 0));
          const remain = Math.max(0, oQ - already);
          return {
            id: dt.id ?? `${so.id}-${idx}`,
            gubun: dt.product?.category || '완성품',
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

  const currentDetails = (selectedHeaderId !== null && details[selectedHeaderId]) || [];

  const handleDetailChange = (id: number | string, val: number) => {
    setDetails((prev) => ({
      ...prev,
      [selectedHeaderId!]: (prev[selectedHeaderId!] || []).map((d) => {
        if (d.id !== id) return d;
        const newDelivQty = Math.max(0, Math.min(Math.round(Number(val) || 0), d.maxQty));
        return { ...d, delivQty: newDelivQty, delivAmt: newDelivQty * d.unitPrice };
      }),
    }));
  };

  const postDelivery = async (headerId: number, list: DeliveryDetailRow[]) => {
    const h = headers.find((x) => x.id === headerId);
    if (!h) return false;
    const items = list
      .filter((d) => Number(d.delivQty) > 0)
      .map((d) => ({
        productCode: '',
        productName: d.partName,
        deliveryQty: Math.round(Number(d.delivQty)),
        unitPrice: d.unitPrice,
        boxQty: 0,
        remark: d.remark,
      }));
    if (items.length === 0) return true;
    // 품번 매칭:明細에서 품번 조회
    const res = await fetch('/api/sales/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliveryDate: delivDate,
        centerCode: h.clientName,
        shift: h.shift !== '-' ? h.shift : '1편',
        salesOrderId: h.id,
        createdBy: '담당자',
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

  const handleSave = async () => {
    if (selectedHeaderId === null) {
      alert('납품할 주문을 선택하세요.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(delivDate)) {
      alert('납품일자를 입력하세요.');
      return;
    }
    const list = (details[selectedHeaderId] || []).filter((d) => Number(d.delivQty) > 0);
    if (list.length === 0) {
      alert('납품수량을 입력하세요.');
      return;
    }
    const h = headers.find((x) => x.id === selectedHeaderId);
    if (!window.confirm(`${h?.orderNo} ${list.length}개 품목 납품 등록할까요? (납품일 ${delivDate})`)) return;
    setSaving(true);
    try {
      const ok = await postDelivery(selectedHeaderId, (details[selectedHeaderId] || []));
      if (ok) {
        alert('납품이 등록되었습니다. 미출현황에 즉시 반영됩니다.');
        void loadData(startDate, endDate);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBatchSave = async () => {
    const targets = headers.filter((h) => {
      const list = details[h.id] || [];
      return list.some((d) => Number(d.delivQty) > 0);
    });
    if (targets.length === 0) {
      alert('납품수량이 입력된 주문이 없습니다.');
      return;
    }
    if (!window.confirm(`${targets.length}건 주문 일괄 납품 등록할까요? (납품일 ${delivDate})`)) return;
    setSaving(true);
    try {
      for (const h of targets) {
        const ok = await postDelivery(h.id, details[h.id] || []);
        if (!ok) break;
      }
      alert('일괄 납품 등록 완료.');
      void loadData(startDate, endDate);
    } finally {
      setSaving(false);
    }
  };

  const headerTotals = headers.reduce(
    (acc, h) => ({
      qty: acc.qty + h.orderQty, unQ: acc.unQ + h.unDelivQty,
      amt: acc.amt + h.orderAmt, prev: acc.prev + h.prevDelivAmt, unA: acc.unA + h.unDelivAmt,
    }),
    { qty: 0, unQ: 0, amt: 0, prev: 0, unA: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="납품등록"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'save', label: saving ? '저장 중...' : '저장', icon: 'save', variant: 'secondary', onClick: () => void handleSave() },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => { const t = kstToday(); setStartDate(t); setEndDate(t); void loadData(t, t); } },
          { key: 'batchSave', label: '일괄저장', icon: 'batchSave', variant: 'success', onClick: () => void handleBatchSave() },
        ]}
        helpContent="미납 잔량이 있는 주문을 불러와 납품수량을 입력하고 확정합니다. 저장 즉시 수주와 연결되어 미출현황에 반영됩니다."
      />

      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700">주문일자:</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs h-6" />
          <span className="text-gray-500">~</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs h-6" />
          <span className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-300">
            <span className="font-semibold text-gray-700">납품일자:</span>
            <input type="date" value={delivDate} onChange={(e) => setDelivDate(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs h-6" />
          </span>
        </div>
        <span className="text-[11px] text-gray-500">납품수량은 미납 잔량 이하로 입력 (초과분 자동 절삭)</span>
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>요약 (미납 잔량 있는 주문)</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {headers.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-10 text-center text-gray-400">불러오는 중...</div>
            ) : headers.length === 0 ? (
              <div className="py-10 text-center text-gray-400">해당 기간에 등록된 수주가 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">주문날짜</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-28">주문번호</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">주문유형</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">거래처명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">편수</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-18">상태</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">주문수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">미납수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">주문금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">기납품금액</th>
                  <th className="whitespace-nowrap py-1 px-1 text-right w-24">미납품금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {headers.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => setSelectedHeaderId(h.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedHeaderId === h.id ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{h.orderDate}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-bold text-gray-800 border-r border-gray-200">{h.orderNo}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{h.orderKind}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{h.clientName}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{h.shift}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${STATUS_META[h.status] || 'bg-gray-100 text-gray-600'}`}>
                        {h.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{h.orderQty.toLocaleString()}</td>
                    <td className={`whitespace-nowrap py-1 px-1 text-right font-bold border-r border-gray-200 ${h.unDelivQty > 0 ? 'text-red-600' : 'text-gray-400'}`}>{h.unDelivQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{h.orderAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{h.prevDelivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-gray-900">{h.unDelivAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={6} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{headerTotals.qty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-red-600 border-r border-gray-300">{headerTotals.unQ.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{headerTotals.amt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{headerTotals.prev.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right">{headerTotals.unA.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>

        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300">
            내역 (품목별 납품수량 입력)
          </div>

          <div className="flex-1 overflow-auto">
            {currentDetails.length === 0 ? (
              <div className="py-10 text-center text-gray-400">선택된 주문의 미납 품목이 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">구분</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">품명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">단위</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">주문수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">기납품</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-18 bg-[#b8bded]">납품수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">잔여</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-18">납품단가</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">주문금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">납품금액</th>
                  <th className="whitespace-nowrap py-1 px-2 w-24">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetails.map((d) => (
                  <tr key={d.id} className="hover:bg-blue-50/50">
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.gubun}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.spec}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.unit}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-gray-700 border-r border-gray-200">{d.orderQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{d.prevDelivQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-0.5 px-1 text-right border-r border-gray-200 bg-blue-50/60">
                      <input
                        type="number"
                        value={d.delivQty}
                        min={0}
                        max={d.maxQty}
                        onChange={(e) => handleDetailChange(d.id, Number(e.target.value))}
                        className="w-16 text-right font-bold font-mono text-blue-900 border border-blue-400 px-1 py-0.5 bg-white rounded-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-red-600 border-r border-gray-200">{(d.maxQty - d.delivQty).toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.orderAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-gray-900 border-r border-gray-200">{d.delivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-left text-gray-600">{d.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
