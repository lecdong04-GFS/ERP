'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { exportGridToExcel } from '@/lib/excelExport';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface ExtraOrderSummaryRow {
  id: number;
  orderDate: string;
  shift: string;
  orderNo: string;
  clientName: string;
  storeName: string;
  status: string;
  extraCount: number;
  orderQtyTotal: number;
  orderAmtTotal: number;
  delivQtyTotal: number;
  delivAmtTotal: number;
}

interface ExtraOrderDetailRow {
  id: number;
  kind: string;
  partName: string;
  unitPrice: number;
  orderQty: number;
  orderAmt: number;
  delivQty: number;
  delivAmt: number;
}

export const ExtraOrderStatusView: React.FC = () => {
  const [startDate, setStartDate] = useState(kstToday());
  const [endDate, setEndDate] = useState(kstToday());
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [summaries, setSummaries] = useState<ExtraOrderSummaryRow[]>([]);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, ExtraOrderDetailRow[]>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const [orderRes, undelRes] = await Promise.all([
        fetch(`/api/sales/order?startDate=${s}&endDate=${e}&orderType=${encodeURIComponent('추가')}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/sales/undelivered?startDate=${s}&endDate=${e}`, { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (!orderRes.success || !Array.isArray(orderRes.data)) {
        setSummaries([]); setDetails({}); setSelectedSummaryId(null);
        return;
      }
      const delivMap = new Map<string, number>();
      const undelRows: any[] = undelRes.success && Array.isArray(undelRes.data?.rows) ? undelRes.data.rows : [];
      undelRows.forEach((r: any) => {
        if (r.orderType === '추가') delivMap.set(`${r.salesOrderId}:${r.productId}`, Number(r.deliveredQty) || 0);
      });

      const loadedSummaries: ExtraOrderSummaryRow[] = [];
      const loadedDetails: Record<number, ExtraOrderDetailRow[]> = {};
      orderRes.data.forEach((o: any) => {
        let dQ = 0;
        let dA = 0;
        loadedDetails[o.id] = (o.details || []).map((dt: any, idx: number) => {
          const oQ = Number(dt.totalQty) || 0;
          const price = Number(dt.unitPrice) || 0;
          const ddQ = Math.min(oQ, Number(delivMap.get(`${o.id}:${dt.productId}`) || 0));
          const ddA = Math.round(ddQ * price);
          dQ += ddQ;
          dA += ddA;
          return {
            id: dt.id ?? `${o.id}-${idx}`,
            kind: dt.product?.kind || '-',
            partName: dt.product?.name || '',
            unitPrice: price,
            orderQty: oQ,
            orderAmt: Math.round(oQ * price),
            delivQty: ddQ,
            delivAmt: ddA,
          };
        });
        loadedSummaries.push({
          id: o.id,
          orderDate: o.orderDate,
          shift: o.shift || '-',
          orderNo: o.orderNo,
          clientName: o.centerCode || '-',
          storeName: o.remark || '-',
          status: o.status || '접수',
          extraCount: (o.details || []).length,
          orderQtyTotal: Number(o.totalQty) || 0,
          orderAmtTotal: Number(o.totalAmount) || 0,
          delivQtyTotal: dQ,
          delivAmtTotal: dA,
        });
      });
      setSummaries(loadedSummaries);
      setDetails(loadedDetails);
      setSelectedSummaryId((prev) => {
        if (prev !== null && loadedSummaries.some((x) => x.id === prev)) return prev;
        return loadedSummaries.length > 0 ? loadedSummaries[0].id : null;
      });
    } catch (err) {
      console.error('Failed to load extra orders', err);
      setSummaries([]); setDetails({}); setSelectedSummaryId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(startDate, endDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSummaries = includeCanceled ? summaries : summaries.filter((s) => s.status !== '취소');
  const currentDetails = (selectedSummaryId !== null && details[selectedSummaryId]) || [];

  const handleReset = () => {
    const t = kstToday();
    setStartDate(t); setEndDate(t); setIncludeCanceled(false);
    void loadData(t, t);
  };

  const summaryTotals = visibleSummaries.reduce(
    (acc, s) => ({
      count: acc.count + s.extraCount,
      orderQty: acc.orderQty + s.orderQtyTotal,
      orderAmt: acc.orderAmt + s.orderAmtTotal,
      delivQty: acc.delivQty + s.delivQtyTotal,
      delivAmt: acc.delivAmt + s.delivAmtTotal,
    }),
    { count: 0, orderQty: 0, orderAmt: 0, delivQty: 0, delivAmt: 0 }
  );

  const detailTotals = currentDetails.reduce(
    (acc, d) => ({
      orderQty: acc.orderQty + d.orderQty,
      orderAmt: acc.orderAmt + d.orderAmt,
      delivQty: acc.delivQty + d.delivQty,
      delivAmt: acc.delivAmt + d.delivAmt,
    }),
    { orderQty: 0, orderAmt: 0, delivQty: 0, delivAmt: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="추가주문현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: () =>
              exportGridToExcel({
                filename: '추가주문현황',
                sheetName: '추가주문',
                columns: [
                  { key: 'orderDate', label: '주문일자', format: 'date' },
                  { key: 'shift', label: '편수' },
                  { key: 'orderNo', label: '주문번호' },
                  { key: 'clientName', label: '거래처명' },
                  { key: 'storeName', label: '편의점명' },
                  { key: 'extraCount', label: '추가주문건수', format: 'number' },
                  { key: 'orderQtyTotal', label: '주문수량계', format: 'number' },
                  { key: 'orderAmtTotal', label: '주문금액계', format: 'currency' },
                  { key: 'delivQtyTotal', label: '납품수량계', format: 'number' },
                  { key: 'delivAmtTotal', label: '납품금액계', format: 'currency' },
                ],
                data: visibleSummaries,
              }),
          },
        ]}
        helpContent="유선이나 메신저로 접수된 점포별 추가 주문 내역 및 추가분에 대한 출하/납품 상태를 조회합니다."
      />

      <SalesFilterBar
        label="주문일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={visibleSummaries.length}
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
            <span>요약</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {visibleSummaries.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-10 text-center text-gray-400">불러오는 중...</div>
            ) : visibleSummaries.length === 0 ? (
              <div className="py-10 text-center text-gray-400">해당 기간에 등록된 추가주문이 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">주문날짜</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">편수</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">주문번호</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">거래처명</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">편의점명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-16">상태</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-center w-24">추가주문건수</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">주문수량계</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-28">주문금액계</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">납품수량계</th>
                  <th className="whitespace-nowrap py-1 px-1 text-right w-28">납품금액계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {visibleSummaries.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSummaryId(s.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedSummaryId === s.id ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{s.orderDate}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{s.shift}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-bold text-gray-800 border-r border-gray-200">{s.orderNo}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{s.clientName}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-left font-medium border-r border-gray-200">{s.storeName}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{s.status}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{s.extraCount}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{s.orderQtyTotal.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{s.orderAmtTotal.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{s.delivQtyTotal.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-gray-900">{s.delivAmtTotal.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={6} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-300">{summaryTotals.count}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{summaryTotals.orderQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{summaryTotals.orderAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{summaryTotals.delivQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-gray-900">{summaryTotals.delivAmt.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>

        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>내역</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {currentDetails.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            {currentDetails.length === 0 ? (
              <div className="py-10 text-center text-gray-400">선택된 추가주문의 품목이 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-24">품종</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">품명</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-24">단가</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-24">주문수량</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-28">주문금액</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-24">납품수량</th>
                  <th className="whitespace-nowrap py-1 px-2 text-right w-28">납품금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetails.map((d) => (
                  <tr key={d.id} className="hover:bg-blue-50/50">
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{d.kind}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-right font-bold text-blue-900 border-r border-gray-200">{d.orderQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{d.orderAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-right text-emerald-800 border-r border-gray-200">{d.delivQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-right font-bold text-gray-900">{d.delivAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={3} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-1 px-2 text-right text-blue-900 border-r border-gray-300">{detailTotals.orderQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-2 text-right border-r border-gray-300">{detailTotals.orderAmt.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-2 text-right text-emerald-900 border-r border-gray-300">{detailTotals.delivQty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-2 text-right text-gray-900">{detailTotals.delivAmt.toLocaleString()}</td>
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
