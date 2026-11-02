'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { displayRemark } from '@/lib/gfs/docKey';

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
  tradeDate: string;
  orderNo: string;
  gubun: string;
  kind: string;
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
  const [startDate, setStartDate] = useState(() => kstDaysAgo(29));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [summaries, setSummaries] = useState<UndelivSummaryRow[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>('');
  const [details, setDetails] = useState<Record<string, UndelivDetailRow[]>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/undelivered?startDate=${s}&endDate=${e}&onlyShort=1`, { cache: 'no-store' });
      const json = await res.json();
      const rows: any[] = json.success && Array.isArray(json.data?.rows) ? json.data.rows : [];

      const sumMap = new Map<string, UndelivSummaryRow>();
      const detMap: Record<string, UndelivDetailRow[]> = {};
      rows.forEach((r: any, idx: number) => {
        const center = r.centerCode || '미지정';
        let sum = sumMap.get(center);
        if (!sum) {
          sum = { id: center, clientName: center, shift1Qty: 0, shift2Qty: 0, totalQty: 0, shift1Amt: 0, shift2Amt: 0, totalAmt: 0 };
          sumMap.set(center, sum);
        }
        // 편수 판정: 주문 shift가 1편/2편이면 그대로, '전체'면明細 편수량 기준 1편 우선 배분
        // (1편분부터 납품된 것으로 가정: 미납 = 잔여분, 합계는 미납총량과 일치)
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
        //明細 단위 납품은 편수 구분이 없으므로, 주문明細의 편수별 잔량으로 계산
        if (!detMap[center]) detMap[center] = [];
        detMap[center].push({
          id: `${r.salesOrderId}:${r.productId}:${idx}`,
          tradeDate: r.orderDate,
          orderNo: r.orderNo,
          gubun: r.category || '완성품',
          kind: r.kind || '-',
          partName: r.productName,
          spec: r.spec || '',
          unit: r.unit || 'ea',
          shift: r.shift || '-',
          unitPrice: r.unitPrice || 0,
          unDelivQty: r.unDelivQty || 0,
          unDelivAmt: r.unDelivAmt || 0,
          remark: displayRemark(r.storeName || ''),
        });
        sum.totalQty += r.unDelivQty || 0;
        sum.totalAmt += r.unDelivAmt || 0;
        sum.shift1Qty += u1;
        sum.shift1Amt += ua1;
        sum.shift2Qty += u2;
        sum.shift2Amt += ua2;
      });

      const loaded = [...sumMap.values()].sort((a, b) => b.totalQty - a.totalQty);
      setSummaries(loaded);
      setDetails(detMap);
      setSelectedCenter((prev) => {
        if (prev && loaded.some((x) => x.id === prev)) return prev;
        return loaded.length > 0 ? loaded[0].id : '';
      });
    } catch (err) {
      console.error('Failed to load undelivered', err);
      setSummaries([]); setDetails({}); setSelectedCenter('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(startDate, endDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentDetails = (selectedCenter && details[selectedCenter]) || [];

  const sumTotals = summaries.reduce(
    (acc, s) => ({
      s1Q: acc.s1Q + s.shift1Qty, s2Q: acc.s2Q + s.shift2Qty, tQ: acc.tQ + s.totalQty,
      s1A: acc.s1A + s.shift1Amt, s2A: acc.s2A + s.shift2Amt, tA: acc.tA + s.totalAmt,
    }),
    { s1Q: 0, s2Q: 0, tQ: 0, s1A: 0, s2A: 0, tA: 0 }
  );

  const detailTotals = currentDetails.reduce(
    (acc, d) => ({ qty: acc.qty + d.unDelivQty, amt: acc.amt + d.unDelivAmt }),
    { qty: 0, amt: 0 }
  );

  const handleReset = () => {
    const s = kstDaysAgo(29);
    const t = kstToday();
    setStartDate(s); setEndDate(t);
    void loadData(s, t);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="미출현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
        ]}
        helpContent="주문 대비 미출고/미납품된 수량을 집계합니다. (미출 = 수주 − 납품, 수주·납품 등록이 실시간 반영)"
      />

      <SalesFilterBar
        label="일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={summaries.length}
      />

      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>요약 (미출 있는 거래처만 표시)</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {summaries.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-10 text-center text-gray-400">불러오는 중...</div>
            ) : summaries.length === 0 ? (
              <div className="py-10 text-center text-emerald-700 font-semibold">미출이 없습니다. 전량 정상 출고되었습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr className="border-b border-[#dbe3ee]">
                  <th rowSpan={2} className="py-1 px-3 border-r border-[#dbe3ee] text-left">거래처명</th>
                  <th colSpan={3} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#e8edf4]">미출수량</th>
                  <th colSpan={3} className="whitespace-nowrap py-1 px-1 bg-[#b5baf0]">미출금액</th>
                </tr>
                <tr className="border-b border-[#dbe3ee] text-[11.5px]">
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">1편</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">2편</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-24 bg-[#b2b7ec]">합계</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-24">1편</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-24">2편</th>
                  <th className="whitespace-nowrap py-0.5 px-1 bg-[#b2b7ec] w-28">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {summaries.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedCenter(s.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedCenter === s.id ? 'bg-[#b2ebf2] font-semibold' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="py-1 px-3 font-sans text-left border-r border-gray-200 font-medium">{s.clientName}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200 text-amber-800">{s.shift1Qty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200 text-indigo-800">{s.shift2Qty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-extrabold text-red-600 border-r border-gray-200 bg-red-50/20">{s.totalQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{s.shift1Amt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{s.shift2Amt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-right font-extrabold text-red-600 bg-red-50/20">{s.totalAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-amber-900 border-r border-gray-300">{sumTotals.s1Q.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-indigo-900 border-r border-gray-300">{sumTotals.s2Q.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-red-600 font-black border-r border-gray-300">{sumTotals.tQ.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{sumTotals.s1A.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{sumTotals.s2A.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-1 text-right text-red-600 font-black">{sumTotals.tA.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
            )}
          </div>
        </div>

        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>세부데이터 [{selectedCenter || '-'}]</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {currentDetails.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            {currentDetails.length === 0 ? (
              <div className="py-10 text-center text-gray-400">미출 내역이 없습니다.</div>
            ) : (
            <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">거래일</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">주문번호</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">구분</th>
                  <th className="py-1 px-3 border-r border-[#dbe3ee] text-left">품명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">단위</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-12">편수</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-18">단가</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20 bg-[#e8edf4]">미출수량</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-24">미출금액</th>
                  <th className="whitespace-nowrap py-1 px-2 text-left">비고(점포)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetails.map((d) => (
                  <tr key={d.id} className="hover:bg-blue-50/50">
                    <td className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-200">{d.tradeDate}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-center text-[11px] text-gray-600 border-r border-gray-200">{d.orderNo}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.gubun}</td>
                    <td className="py-1 px-3 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.spec}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.unit}</td>
                    <td className="whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.shift}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-right font-extrabold text-red-600 border-r border-gray-200 bg-red-50/20">{d.unDelivQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 text-right font-bold text-gray-900 border-r border-gray-200">{d.unDelivAmt.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-1 px-2 font-sans text-left text-gray-600">{d.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={8} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="whitespace-nowrap py-1 px-2 text-right text-red-600 font-black border-r border-gray-300">{detailTotals.qty.toLocaleString()}</td>
                  <td className="whitespace-nowrap py-1 px-2 text-right text-gray-900 border-r border-gray-300">{detailTotals.amt.toLocaleString()}</td>
                  <td></td>
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
