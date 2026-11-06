'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { exportGridToExcel } from '@/lib/excelExport';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { Search, RotateCw } from 'lucide-react';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 N일 전 YYYY-MM-DD */
function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
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
  const [startDate, setStartDate] = useState(() => kstDaysAgo(29));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [detailsMap, setDetailsMap] = useState<Record<string, ItemDetail[]>>({});
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      const res = await fetch(`/api/sales/delivery?${params}`, { cache: 'no-store' }).then((r) => r.json());
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
          code: a.code,
          partName: a.partName,
          delivCount: a.delivCount,
          totalQty: a.qty,
          totalAmt: a.amt,
          avgPrice: a.qty > 0 ? Math.round(a.amt / a.qty) : 0,
        }))
        .sort((x, y) => y.totalQty - x.totalQty);

      Object.values(detMap).forEach((l) => l.sort((a, b) => (a.delivDate === b.delivDate ? 0 : (a.delivDate < b.delivDate ? 1 : -1))));
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

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.trim().toLowerCase();
    return items.filter((it) => it.code.toLowerCase().includes(term) || it.partName.toLowerCase().includes(term));
  }, [items, searchTerm]);

  const selectedItem = useMemo(() => {
    return items.find((it) => it.code === selectedCode) || null;
  }, [items, selectedCode]);

  const currentDetails = useMemo(() => {
    return (selectedCode && detailsMap[selectedCode]) || [];
  }, [detailsMap, selectedCode]);

  const leftTotals = useMemo(() => filteredItems.reduce(
    (acc, it) => ({
      delivCount: acc.delivCount + it.delivCount,
      totalQty: acc.totalQty + it.totalQty,
      totalAmt: acc.totalAmt + it.totalAmt,
    }),
    { delivCount: 0, totalQty: 0, totalAmt: 0 }
  ), [filteredItems]);

  const avgUnitPrice = leftTotals.totalQty > 0 ? Math.round(leftTotals.totalAmt / leftTotals.totalQty) : 0;

  const rightTotals = useMemo(() => currentDetails.reduce(
    (acc, d) => ({
      qty: acc.qty + d.delivQty,
      amt: acc.amt + d.delivAmt,
    }),
    { qty: 0, amt: 0 }
  ), [currentDetails]);

  const handleReset = () => {
    const s = kstDaysAgo(29);
    const t = kstToday();
    setStartDate(s);
    setEndDate(t);
    setSearchTerm('');
    void loadData(s, t);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[13px]">
      <SalesActionBar
        title="품목별납품현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: () => exportGridToExcel({
              filename: `품목별납품현황_${startDate}_${endDate}`,
              sheetName: '품목별납품현황',
              columns: [...SUMMARY_COLUMNS],
              data: filteredItems,
            }),
          },
        ]}
        helpContent="납품 내역을 품목 기준으로 집계합니다. 좌측에서 품목을 선택하면 우측에 납품처(GS센터)별 상세 출하 이력이 실시간 표시됩니다."
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
        dataCount={filteredItems.length}
      >
        <div className="flex items-center gap-2 pl-3 border-l border-gray-300">
          <span className="font-bold text-gray-700 text-[12px]">품목 검색:</span>
          <div className="relative flex items-center">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="품번 또는 품명 입력..."
              className="border border-gray-400 bg-white px-2.5 py-1 text-[12px] font-bold h-7 w-48 rounded shadow-2xs focus:border-blue-500 focus:outline-hidden pr-7"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-1.5 text-gray-400 hover:text-gray-600 font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </SalesFilterBar>

      <div className="flex-1 flex min-h-0 p-1.5 gap-1.5 overflow-hidden">
        {/* 좌측 패널: 품목별 집계 그리드 */}
        <div className="w-[58%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>품목별 납품 집계 (수량순 정렬)</span>
              {searchTerm && <span className="text-[11.5px] text-blue-700 font-bold">'{searchTerm}' 필터링</span>}
            </div>
            <span className="text-[12px] text-gray-600 font-bold font-mono">
              총 {filteredItems.length}개 품목 · {leftTotals.totalQty.toLocaleString()} ea / ₩{leftTotals.totalAmt.toLocaleString()}
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-14 text-center text-gray-500 font-bold text-[14px]">불러오는 중...</div>
            ) : filteredItems.length === 0 ? (
              <div className="py-14 text-center text-gray-500 font-medium text-[13.5px]">
                {searchTerm ? '검색된 품목이 없습니다.' : '해당 기간에 등록된 납품 내역이 없습니다.'}
              </div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[95px]">품번</th>
                    <th className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee] text-left">품명</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[75px]">납품횟수</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[85px]">평균단가</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[90px]">합계수량</th>
                    <th className="whitespace-nowrap py-2 px-2.5 text-right min-w-[110px]">합계금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {filteredItems.map((it) => (
                    <tr
                      key={it.code}
                      onClick={() => setSelectedCode(it.code)}
                      className={`cursor-pointer transition-colors ${selectedCode === it.code ? 'bg-blue-100/80 font-bold' : 'hover:bg-blue-50/50'}`}
                      title="클릭 시 우측에 납품처별 출하 이력 표시"
                    >
                      <td className="whitespace-nowrap py-2 px-2 text-center text-gray-700 font-mono border-r border-gray-200">{it.code}</td>
                      <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200 truncate">{it.partName}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-center text-gray-700 border-r border-gray-200">{it.delivCount}회</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-gray-700 border-r border-gray-200">{it.avgPrice.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[14px] text-blue-900 border-r border-gray-200 bg-blue-50/30">{it.totalQty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-2 px-2.5 text-right font-black text-[13.5px] text-gray-900">{it.totalAmt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                  <tr>
                    <td colSpan={2} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[14px] border-r border-gray-300">
                      총 {filteredItems.length}개 품목 합계
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-center text-[13.5px] font-bold border-r border-gray-300">{leftTotals.delivCount}회</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[13.5px] text-gray-800 border-r border-gray-300">{avgUnitPrice.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15.5px] font-black text-blue-950 border-r border-gray-300 bg-blue-100/40">{leftTotals.totalQty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2.5 px-2.5 text-right text-[14.5px] font-black text-gray-950">{leftTotals.totalAmt.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table></EditableTableWrapper>
            )}
          </div>
        </div>

        {/* 우측 패널: 납품처별 이력 그리드 */}
        <div className="w-[42%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          <div className="bg-[#e2e8f0] px-3 py-1 font-black text-gray-800 text-[13px] border-b border-gray-300 flex items-center justify-between">
            <span>
              납품처별 출하 이력 {selectedItem ? `[${selectedItem.partName}]` : ''}
            </span>
            <span className="text-[12px] font-bold text-blue-800 font-mono bg-blue-100 px-2 py-0.5 rounded">
              총 {currentDetails.length}건
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {selectedCode === '' ? (
              <div className="py-14 text-center text-gray-400 font-medium text-[13px]">
                좌측에서 확인하실 품목을 선택하세요.
              </div>
            ) : currentDetails.length === 0 ? (
              <div className="py-10 text-center text-gray-400 font-medium">선택된 품목의 납품 이력이 없습니다.</div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[13px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[90px]">납품일자</th>
                    <th className="whitespace-nowrap py-2 px-3 border-r border-[#dbe3ee] text-left">거래처/센터</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] min-w-[120px]">납품번호</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[75px]">단가</th>
                    <th className="whitespace-nowrap py-2 px-2 border-r border-[#dbe3ee] text-right min-w-[80px]">수량</th>
                    <th className="whitespace-nowrap py-2 px-2 text-right min-w-[95px]">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {currentDetails.map((d) => (
                    <tr key={d.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="whitespace-nowrap py-2 px-2 text-center text-gray-700 border-r border-gray-200">{d.delivDate}</td>
                      <td className="whitespace-nowrap py-2 px-3 font-sans font-bold text-left text-gray-900 border-r border-gray-200">{d.clientName}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-center text-gray-600 font-bold border-r border-gray-200">{d.deliveryNo}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right text-gray-700 border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right font-black text-[14px] text-blue-900 border-r border-gray-200 bg-blue-50/30">{d.delivQty.toLocaleString()}</td>
                      <td className="whitespace-nowrap py-2 px-2 text-right font-bold text-gray-900">{d.delivAmt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-300 sticky bottom-0 z-10 shadow-sm">
                  <tr>
                    <td colSpan={4} className="whitespace-nowrap py-2.5 px-3 font-sans font-black text-center text-[13.5px] border-r border-gray-300">
                      선택 품목 이력 합계 ({currentDetails.length}건)
                    </td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[15px] font-black text-blue-950 border-r border-gray-300 bg-blue-100/40">{rightTotals.qty.toLocaleString()}</td>
                    <td className="whitespace-nowrap py-2.5 px-2 text-right text-[14.5px] font-black text-gray-950">{rightTotals.amt.toLocaleString()}</td>
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
