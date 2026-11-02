'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { usePrintReport } from '@/context/PrintReportContext';
import type { DeliveryBoxLabelData } from '@/components/print/labels/DeliveryBoxLabel';
import { exportGridToExcel } from '@/lib/excelExport';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';

/** 박스라벨 최대 출력 매수 (과다 출력 방지) */
const MAX_BOX_LABELS = 200;

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface TagSummaryRow {
  id: number;
  checked: boolean;
  clientName: string;
  shift: string;
  orderAmtTotal: number;
  delivQtyTotal: number;
  delivAmtTotal: number;
}

interface TagDetailRow {
  id: string;
  checked: boolean;
  partNo: string;
  partName: string;
  delivQty: number;
  excludeQty: number;
  actualQty: number;
  boxInQty: number;
  boxQty: number;
  pieceQty: number;
}

const SUMMARY_COLUMNS = [
  { key: 'clientName', label: '거래처명' },
  { key: 'shift', label: '편수' },
  { key: 'delivQtyTotal', label: '납품수량계', format: 'number' },
  { key: 'delivAmtTotal', label: '납품금액계', format: 'currency' },
] as const;

export const TagPrintView: React.FC = () => {
  const { openPrintModal, setBoxPayload } = usePrintReport();
  const [delivDate, setDelivDate] = useState(kstToday());
  const [clientFilter, setClientFilter] = useState('ALL');
  const [summaries, setSummaries] = useState<TagSummaryRow[]>([]);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, TagDetailRow[]>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      // 납품일자 서버 필터 (전체 조회 후 잘라내기 방지)
      const params = new URLSearchParams({ deliveryDate: date });
      const [delivRes, prodRes] = await Promise.all([
        fetch(`/api/sales/delivery?${params}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/master/product', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
      ]);
      const boxMap = new Map<string, number>();
      if (prodRes.success && Array.isArray(prodRes.data)) {
        prodRes.data.forEach((p: any) => {
          if (p.productCode && Number(p.boxQty) > 0) boxMap.set(String(p.productCode), Number(p.boxQty));
        });
      }
      let list: any[] = delivRes.success && Array.isArray(delivRes.data) ? delivRes.data : [];
      list = list.filter((d: any) => d.deliveryDate === date && d.status !== '취소');

      const sums: TagSummaryRow[] = [];
      const detMap: Record<number, TagDetailRow[]> = {};
      list.forEach((d: any) => {
        const items: TagDetailRow[] = (d.details || []).map((dt: any, idx: number) => {
          const code = (dt.productCode || '').trim();
          const q = Math.max(0, Math.round(Number(dt.deliveryQty) || 0));
          const boxIn = boxMap.get(code) || (q > 0 ? q : 1);
          return {
            id: `${d.id}-${dt.id ?? idx}`,
            checked: true,
            partNo: code || '-',
            partName: dt.productName || code || '-',
            delivQty: q,
            excludeQty: 0,
            actualQty: q,
            boxInQty: boxIn,
            boxQty: Math.floor(q / boxIn),
            pieceQty: q % boxIn,
          };
        });
        sums.push({
          id: d.id,
          checked: false,
          clientName: d.centerCode || '-',
          shift: d.shift || '-',
          orderAmtTotal: Number(d.totalAmount) || 0,
          delivQtyTotal: items.reduce((s, i) => s + i.delivQty, 0),
          delivAmtTotal: items.reduce((s, i) => s + i.delivQty * 0, 0),
        });
        detMap[d.id] = items;
        const last = sums[sums.length - 1];
        last.delivAmtTotal = items.reduce((s, i) => s + i.delivQty * 0, 0);
      });
      // 금액계는 납품서 합계 사용
      sums.forEach((s) => {
        const src = list.find((d: any) => d.id === s.id);
        s.delivAmtTotal = Number(src?.totalAmount) || 0;
        s.orderAmtTotal = s.delivAmtTotal;
      });

      setSummaries(sums);
      setDetails(detMap);
      setSelectedSummaryId((prev) => {
        if (prev !== null && sums.some((x) => x.id === prev)) return prev;
        return sums.length > 0 ? sums[0].id : null;
      });
    } catch (err) {
      console.error('Failed to load tag data', err);
      setSummaries([]); setDetails({}); setSelectedSummaryId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(delivDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSummaries = clientFilter === 'ALL' ? summaries : summaries.filter((s) => s.clientName === clientFilter);
  const centers = [...new Set(summaries.map((s) => s.clientName))];
  const currentDetails = (selectedSummaryId !== null && details[selectedSummaryId]) || [];

  const toggleExclude = (id: string, val: number) => {
    if (selectedSummaryId === null) return;
    setDetails((prev) => ({
      ...prev,
      [selectedSummaryId]: (prev[selectedSummaryId] || []).map((d) => {
        if (d.id !== id) return d;
        const ex = Math.max(0, Math.min(Math.round(Number(val) || 0), d.delivQty));
        const act = d.delivQty - ex;
        return {
          ...d,
          excludeQty: ex,
          actualQty: act,
          boxQty: Math.floor(act / d.boxInQty),
          pieceQty: act % d.boxInQty,
        };
      }),
    }));
  };

  const toggleDetailCheck = (id: string) => {
    if (selectedSummaryId === null) return;
    setDetails((prev) => ({
      ...prev,
      [selectedSummaryId]: (prev[selectedSummaryId] || []).map((d) =>
        d.id === id ? { ...d, checked: !d.checked } : d
      ),
    }));
  };

  const handlePrintTags = () => {
    const selectedSummaries = summaries.filter((s) => s.checked);
    if (selectedSummaries.length === 0) {
      alert('꼬리표를 출력할 거래처를 선택하세요.');
      return;
    }
    const stamp = delivDate.replace(/-/g, '');
    const items: DeliveryBoxLabelData[] = [];
    selectedSummaries.forEach((s, si) => {
      (details[s.id] || [])
        .filter((d) => d.checked && d.actualQty > 0)
        .forEach((d, di) => {
          const per = Math.max(1, Math.round(d.boxInQty) || 1);
          const full = Math.floor(d.actualQty / per);
          const rem = d.actualQty % per;
          const tag = `C${String(si + 1).padStart(2, '0')}-P${String(di + 1).padStart(2, '0')}`;
          for (let i = 0; i < full && items.length < MAX_BOX_LABELS; i++) {
            items.push({
              boxNo: `BOX-${stamp}-${tag}-${String(i + 1).padStart(2, '0')}`,
              orderNo: '',
              centerName: s.clientName,
              centerCode: s.clientName,
              productCode: d.partNo === '-' ? '' : d.partNo,
              productName: `${d.partName} ${per}입`,
              boxQty: per,
              unit: 'ea/Box',
              shippingDate: `${delivDate} 출하`,
              deliveryDate: delivDate,
              coldChainTemp: '저온냉장 (0~10℃)',
            });
          }
          if (rem > 0 && items.length < MAX_BOX_LABELS) {
            items.push({
              boxNo: `BOX-${stamp}-${tag}-${String(full + 1).padStart(2, '0')}`,
              orderNo: '',
              centerName: s.clientName,
              centerCode: s.clientName,
              productCode: d.partNo === '-' ? '' : d.partNo,
              productName: `${d.partName} ${per}입`,
              boxQty: rem,
              unit: 'ea/Box',
              shippingDate: `${delivDate} 출하`,
              deliveryDate: delivDate,
              coldChainTemp: '저온냉장 (0~10℃)',
            });
          }
        });
    });
    if (items.length === 0) {
      alert('출력할 박스라벨이 없습니다. (품목 선택·실출고 수량 확인)');
      return;
    }
    setBoxPayload(items);
    openPrintModal('DELIVERY_BOX_LABEL');
  };

  const handlePrintSingle = () => {
    const selected = currentDetails.filter((d) => d.checked);
    if (selected.length === 0) {
      alert('개별 인쇄할 품목을 선택하세요.');
      return;
    }
    const s = summaries.find((x) => x.id === selectedSummaryId);
    const stamp = delivDate.replace(/-/g, '');
    const items: DeliveryBoxLabelData[] = [];
    selected.forEach((d, di) => {
      if (d.actualQty <= 0) return;
      const per = Math.max(1, Math.round(d.boxInQty) || 1);
      const full = Math.floor(d.actualQty / per);
      const rem = d.actualQty % per;
      for (let i = 0; i < full && items.length < MAX_BOX_LABELS; i++) {
        items.push({
          boxNo: `BOX-${stamp}-S01-P${String(di + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
          orderNo: '',
          centerName: s?.clientName || '-',
          centerCode: s?.clientName || '-',
          productCode: d.partNo === '-' ? '' : d.partNo,
          productName: `${d.partName} ${per}입`,
          boxQty: per,
          unit: 'ea/Box',
          shippingDate: `${delivDate} 출하`,
          deliveryDate: delivDate,
          coldChainTemp: '저온냉장 (0~10℃)',
        });
      }
      if (rem > 0 && items.length < MAX_BOX_LABELS) {
        items.push({
          boxNo: `BOX-${stamp}-S01-P${String(di + 1).padStart(2, '0')}-${String(full + 1).padStart(2, '0')}`,
          orderNo: '',
          centerName: s?.clientName || '-',
          centerCode: s?.clientName || '-',
          productCode: d.partNo === '-' ? '' : d.partNo,
          productName: `${d.partName} ${per}입`,
          boxQty: rem,
          unit: 'ea/Box',
          shippingDate: `${delivDate} 출하`,
          deliveryDate: delivDate,
          coldChainTemp: '저온냉장 (0~10℃)',
        });
      }
    });
    if (items.length === 0) {
      alert('출력할 박스라벨이 없습니다. (실출고 수량 확인)');
      return;
    }
    setBoxPayload(items);
    openPrintModal('DELIVERY_BOX_LABEL');
  };

  const detailTotals = currentDetails.reduce(
    (acc, d) => ({
      delivQty: acc.delivQty + d.delivQty,
      excludeQty: acc.excludeQty + d.excludeQty,
      actualQty: acc.actualQty + d.actualQty,
      boxQty: acc.boxQty + d.boxQty,
      pieceQty: acc.pieceQty + d.pieceQty,
    }),
    { delivQty: 0, excludeQty: 0, actualQty: 0, boxQty: 0, pieceQty: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="꼬리표출력"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(delivDate) },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => { const t = kstToday(); setDelivDate(t); setClientFilter('ALL'); void loadData(t); } },
          { key: 'printTag', label: '꼬리표출력', icon: 'print', variant: 'success', onClick: handlePrintTags },
          { key: 'printSingle', label: '개별인쇄', icon: 'print', variant: 'secondary', onClick: handlePrintSingle },
          {
            key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary',
            onClick: () => exportGridToExcel({ filename: '꼬리표출력', sheetName: '꼬리표', columns: [...SUMMARY_COLUMNS], data: visibleSummaries }),
          },
        ]}
        helpContent="납품 확정분을 거래처별로 모아 꼬리표(박스 라벨) 출력 단위로 보여줍니다. 제외수량을 입력하면 출력수량·박스수가 자동 재계산됩니다."
      />

      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center gap-4 shadow-inner">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-700">납품일자:</span>
          <input
            type="date"
            value={delivDate}
            onChange={(e) => setDelivDate(e.target.value)}
            className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs shadow-2xs h-6"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-700">거래처:</span>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="border border-gray-400 bg-white px-2 py-0.5 text-[11px] h-6 rounded-xs"
          >
            <option value="ALL">ALL</option>
            {centers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 p-1 gap-1 overflow-hidden">
        <div className="w-[38%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>거래처별 납품</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {visibleSummaries.length}</span>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="py-10 text-center text-gray-400">불러오는 중...</div>
            ) : visibleSummaries.length === 0 ? (
              <div className="py-10 text-center text-gray-400">해당 일자에 등록된 납품이 없습니다.</div>
            ) : (
              <table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                    <th className="py-1 px-2 border-r border-[#dbe3ee] text-left">거래처명</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] w-14">편수</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] text-right w-20">수량계</th>
                    <th className="py-1 px-1 text-right w-24">금액계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {visibleSummaries.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSummaryId(s.id)}
                      className={`cursor-pointer ${selectedSummaryId === s.id ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'}`}
                    >
                      <td className="py-1 px-1 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox" checked={s.checked}
                          onChange={() => setSummaries((prev) => prev.map((x) => (x.id === s.id ? { ...x, checked: !x.checked } : x)))}
                          className="w-3 h-3 text-blue-600"
                        />
                      </td>
                      <td className="py-1 px-2 font-sans text-left border-r border-gray-200">{s.clientName}</td>
                      <td className="py-1 px-1 font-sans text-center border-r border-gray-200">{s.shift}</td>
                      <td className="py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{s.delivQtyTotal.toLocaleString()}</td>
                      <td className="py-1 px-1 text-right font-bold text-gray-900">{s.delivAmtTotal.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="w-[62%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>품목별 박스 분할 (제외수량 입력 가능)</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {currentDetails.length}</span>
          </div>
          <div className="flex-1 overflow-auto">
            {currentDetails.length === 0 ? (
              <div className="py-10 text-center text-gray-400">거래처를 선택하세요.</div>
            ) : (
              <EditableTableWrapper readOnly><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                    <th className="py-1 px-2 border-r border-[#dbe3ee] text-left">품명</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] text-right w-16">납품수량</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] text-right w-16">제외수량</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] text-right w-16">출력수량</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] text-right w-16">박스내입수</th>
                    <th className="py-1 px-1 border-r border-[#dbe3ee] text-right w-14">박스수</th>
                    <th className="py-1 px-1 text-right w-14">낱개</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {currentDetails.map((d) => (
                    <tr key={d.id} className="hover:bg-blue-50/50">
                      <td className="py-1 px-1 text-center border-r border-gray-200">
                        <input type="checkbox" checked={d.checked} onChange={() => toggleDetailCheck(d.id)} className="w-3 h-3 text-blue-600" />
                      </td>
                      <td className="py-1 px-2 font-sans text-left border-r border-gray-200">{d.partName} <span className="text-gray-400 text-[10px]">[{d.partNo}]</span></td>
                      <td className="py-1 px-1 text-right border-r border-gray-200">{d.delivQty.toLocaleString()}</td>
                      <td className="py-0.5 px-1 text-right border-r border-gray-200 bg-blue-50/60">
                        <input
                          type="number" value={d.excludeQty} min={0} max={d.delivQty}
                          onChange={(e) => toggleExclude(d.id, Number(e.target.value))}
                          className="w-14 text-right font-mono border border-gray-300 px-1 py-0.5 bg-white rounded-xs outline-none"
                        />
                      </td>
                      <td className="py-1 px-1 text-right font-bold text-emerald-800 border-r border-gray-200">{d.actualQty.toLocaleString()}</td>
                      <td className="py-1 px-1 text-right border-r border-gray-200">{d.boxInQty.toLocaleString()}</td>
                      <td className="py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{d.boxQty}</td>
                      <td className="py-1 px-1 text-right">{d.pieceQty}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                  <tr>
                    <td colSpan={2} className="py-1 px-2 text-center border-r border-gray-300">합계</td>
                    <td className="py-1 px-1 text-right border-r border-gray-300">{detailTotals.delivQty.toLocaleString()}</td>
                    <td className="py-1 px-1 text-right border-r border-gray-300">{detailTotals.excludeQty.toLocaleString()}</td>
                    <td className="py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{detailTotals.actualQty.toLocaleString()}</td>
                    <td className="py-1 px-1 border-r border-gray-300"></td>
                    <td className="py-1 px-1 text-right text-blue-900 border-r border-gray-300">{detailTotals.boxQty.toLocaleString()}</td>
                    <td className="py-1 px-1 text-right">{detailTotals.pieceQty.toLocaleString()}</td>
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
