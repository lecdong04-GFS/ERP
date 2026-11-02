'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { exportGridToExcel } from '@/lib/excelExport';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface ItemSummary {
  code: string;
  partName: string;
  delivCount: number;
  totalQty: number;
  totalAmt: number;
  avgPrice: number;
}

interface ItemDetail {
  id: string;
  delivDate: string;
  clientName: string;
  unitPrice: number;
  delivQty: number;
  delivAmt: number;
  deliveryNo: string;
}

const SUMMARY_COLUMNS = [
  { key: 'code', label: '품번', width: '105px', align: 'center' },
  { key: 'partName', label: '품명', minWidth: '220px', align: 'left' },
  { key: 'delivCount', label: '납품횟수', width: '75px', align: 'right', format: 'number' },
  { key: 'avgPrice', label: '평균단가', width: '85px', align: 'right', format: 'currency' },
  { key: 'totalQty', label: '합계수량', width: '90px', align: 'right', format: 'number' },
  { key: 'totalAmt', label: '합계금액', width: '110px', align: 'right', format: 'currency' },
] as const;

export const ItemDeliveryStatusView: React.FC = () => {
  const [startDate, setStartDate] = useState(kstToday());
  const [endDate, setEndDate] = useState(kstToday());
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [detailsMap, setDetailsMap] = useState<Record<string, ItemDetail[]>>({});
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales/delivery', { cache: 'no-store' }).then((r) => r.json());
      let list: any[] = res.success && Array.isArray(res.data) ? res.data : [];
      list = list.filter((d: any) => d.status !== '취소' && d.deliveryDate >= s && d.deliveryDate <= e);

      const sumMap = new Map<string, ItemSummary & { qty: number; amt: number }>();
      const detMap: Record<string, ItemDetail[]> = {};
      list.forEach((d: any) => {
        (d.details || []).forEach((dt: any, idx: number) => {
          const code = (dt.productCode || '').trim() || '(미지정)';
          const q = Number(dt.deliveryQty) || 0;
          const a = Number(dt.amount) || 0;
          let agg = sumMap.get(code);
          if (!agg) {
            agg = { code, partName: dt.productName || code, delivCount: 0, totalQty: 0, totalAmt: 0, avgPrice: 0, qty: 0, amt: 0 };
            sumMap.set(code, agg);
            detMap[code] = [];
          }
          agg.delivCount += 1;
          agg.qty += q;
          agg.amt += a;
          detMap[code].push({
            id: `${d.id}-${dt.id ?? idx}`,
            delivDate: d.deliveryDate,
            clientName: d.centerCode || '-',
            unitPrice: Number(dt.unitPrice) || 0,
            delivQty: q,
            delivAmt: a,
            deliveryNo: d.deliveryNo,
          });
        });
      });
      const loaded = [...sumMap.values()]
        .map((a) => ({
          code: a.code, partName: a.partName, delivCount: a.delivCount,
          totalQty: a.qty, totalAmt: a.amt,
          avgPrice: a.qty > 0 ? Math.round(a.amt / a.qty) : 0,
        }))
        .sort((x, y) => y.totalQty - x.totalQty);
      Object.values(detMap).forEach((l) => l.sort((a, b) => (a.delivDate < b.delivDate ? 1 : -1)));
      setItems(loaded);
      setDetailsMap(detMap);
      setSelectedCode((prev) => {
        if (prev && loaded.some((x) => x.code === prev)) return prev;
        return loaded.length > 0 ? loaded[0].code : '';
      });
    } catch (err) {
      console.error('Failed to load item delivery status', err);
      setItems([]); setDetailsMap({}); setSelectedCode('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(startDate, endDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentDetails = (selectedCode && detailsMap[selectedCode]) || [];
  const totals = items.reduce(
    (acc, i) => ({ qty: acc.qty + i.totalQty, amt: acc.amt + i.totalAmt }),
    { qty: 0, amt: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="품목별납품현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => { const t = kstToday(); setStartDate(t); setEndDate(t); void loadData(t, t); } },
          {
            key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary',
            onClick: () => exportGridToExcel({ filename: '품목별납품현황', sheetName: '품목별납품현황', columns: [...SUMMARY_COLUMNS], data: items }),
          },
        ]}
        helpContent="납품明細을 품번 기준으로 집계합니다. 품목을 선택하면 납품처별 이력이 표시됩니다."
      />

      <SalesFilterBar
        label="납품일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={items.length}
      />

      <div className="flex-1 flex min-h-0 p-1 gap-1 overflow-hidden">
        <div className="w-[58%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>품목별 집계</span>
            <span className="text-[11.5px] text-gray-500 font-mono">총 {totals.qty.toLocaleString()} ea / ₩{totals.amt.toLocaleString()}</span>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-10 text-center text-gray-400">불러오는 중...</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-gray-400">해당 기간에 등록된 납품이 없습니다.</div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">품번</th>
                    <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-left">품명</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">납품횟수</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">평균단가</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">합계수량</th>
                    <th className="whitespace-nowrap py-1 px-1 text-right w-24">합계금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {items.map((it) => (
                    <tr
                      key={it.code}
                      onClick={() => setSelectedCode(it.code)}
                      className={`cursor-pointer ${selectedCode === it.code ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'}`}
                    >
                      <td className="whitespace-nowrap py-1 px-1 text-center text-gray-700 border-r border-gray-200">{it.code}</td>
                      <td className="whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{it.partName}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{it.delivCount}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{it.avgPrice.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{it.totalQty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-gray-900">{it.totalAmt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table></EditableTableWrapper>
            )}
          </div>
        </div>

        <div className="w-[42%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300">
            납품처별 이력 [{selectedCode || '-'}]
          </div>
          <div className="flex-1 overflow-auto">
            {currentDetails.length === 0 ? (
              <div className="py-10 text-center text-gray-400">품목을 선택하세요.</div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">납품일자</th>
                    <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-left">거래처</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">납품번호</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-18">수량</th>
                    <th className="whitespace-nowrap py-1 px-1 text-right w-24">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {currentDetails.map((d) => (
                    <tr key={d.id} className="hover:bg-blue-50/50">
                      <td className="whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.delivDate}</td>
                      <td className="whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{d.clientName}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-center text-[11px] text-gray-600 border-r border-gray-200">{d.deliveryNo}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{d.delivQty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-1 px-1 text-right">{d.delivAmt.toLocaleString()}</td>
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
