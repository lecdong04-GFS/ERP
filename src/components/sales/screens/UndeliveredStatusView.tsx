'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
const CENTER_NAMES: Record<string, string> = {
  'GSR-001': 'GSR 김해일배',
  'GSR-002': 'GSR 김해2일배',
  'GSR-003': 'GSR 양산조리센터',
  'GSR-004': 'GSR 부산물류센터',
  'GSR-005': 'GSR 신광주 저온',
};

interface UndelivSummaryRow {
  id: number;
  checked: boolean;
  clientName: string;     // 거래처명
  shift1Qty: number;      // 미출수량 1편
  shift2Qty: number;      // 미출수량 2편
  totalQty: number;       // 미출수량 합계
  shift1Amt: number;      // 미출금액 1편
  shift2Amt: number;      // 미출금액 2편
  totalAmt: number;       // 미출금액 합계
}

interface UndelivDetailRow {
  id: number;
  checked: boolean;
  tradeDate: string;      // 거래일
  gubun: string;          // 구분
  kind: string;           // 품종
  partName: string;       // 품명
  spec: string;           // 규격
  unit: string;           // 단위
  shift: string;          // 편수
  unitPrice: number;      // 단가
  unDelivQty: number;     // 미출수량
  unDelivAmt: number;     // 미출금액
  unDelivReason: string;  // 미납사유
  remark: string;         // 비고
}

const INITIAL_SUMMARIES: UndelivSummaryRow[] = [
  { id: 1, checked: false, clientName: 'GSR 김해일배', shift1Qty: 25, shift2Qty: 10, totalQty: 35, shift1Amt: 62500, shift2Amt: 21600, totalAmt: 84100 },
  { id: 2, checked: false, clientName: 'GSR 양산조리센터', shift1Qty: 15, shift2Qty: 0, totalQty: 15, shift1Amt: 58725, shift2Amt: 0, totalAmt: 58725 },
  { id: 3, checked: false, clientName: 'GSR 부산물류센터', shift1Qty: 0, shift2Qty: 20, totalQty: 20, shift1Amt: 0, shift2Amt: 43720, totalAmt: 43720 },
  { id: 4, checked: false, clientName: 'GSR 신광주 저온', shift1Qty: 10, shift2Qty: 5, totalQty: 15, shift1Amt: 49000, shift2Amt: 10800, totalAmt: 59800 },
];

const INITIAL_DETAILS: Record<number, UndelivDetailRow[]> = {
  1: [
    { id: 101, checked: false, tradeDate: '2026-10-30', gubun: '완성품', kind: '김밥', partName: '더블치즈소시지김밥1편', spec: '230g', unit: 'ea', shift: '1편', unitPrice: 2160, unDelivQty: 15, unDelivAmt: 32400, unDelivReason: '성형기 포장 불량', remark: '폐기처리' },
    { id: 102, checked: false, tradeDate: '2026-10-30', gubun: '완성품', kind: '김밥', partName: '넷플)더담은K떡볶이김밥', spec: '240g', unit: 'ea', shift: '1편', unitPrice: 2545, unDelivQty: 10, unDelivAmt: 25450, unDelivReason: '재료 소진 지연', remark: '' },
    { id: 103, checked: false, tradeDate: '2026-10-30', gubun: '완성품', kind: '김밥', partName: '불고기치즈김밥2편', spec: '235g', unit: 'ea', shift: '2편', unitPrice: 2160, unDelivQty: 10, unDelivAmt: 21600, unDelivReason: '배차시간 마감', remark: '' },
  ],
  2: [
    { id: 201, checked: false, tradeDate: '2026-10-30', gubun: '완성품', kind: '도시락', partName: '혜자)돌아온제육도시락', spec: '460g', unit: 'ea', shift: '1편', unitPrice: 3915, unDelivQty: 15, unDelivAmt: 58725, unDelivReason: '패티 토핑 부족', remark: '' },
  ],
  3: [
    { id: 301, checked: false, tradeDate: '2026-10-30', gubun: '완성품', kind: '김밥', partName: '직화)한돈제육쌈김밥', spec: '240g', unit: 'ea', shift: '2편', unitPrice: 2186, unDelivQty: 20, unDelivAmt: 43720, unDelivReason: '취반기 고온 경보 정지', remark: '' },
  ],
  4: [
    { id: 401, checked: false, tradeDate: '2026-10-30', gubun: '완성품', kind: '도시락', partName: '혜자)통등심돈까스도시락', spec: '480g', unit: 'ea', shift: '1편', unitPrice: 4900, unDelivQty: 10, unDelivAmt: 49000, unDelivReason: '수축포장기 센서 오류', remark: '' },
    { id: 402, checked: false, tradeDate: '2026-10-30', gubun: '완성품', kind: '주먹밥', partName: '더큰)스팸김치볶음밥', spec: '160g', unit: 'ea', shift: '2편', unitPrice: 1080, unDelivQty: 10, unDelivAmt: 10800, unDelivReason: '성형기 금속검출 탈락', remark: '' },
  ],
};

export const UndeliveredStatusView: React.FC = () => {
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(kstToday);
  const [endDate, setEndDate] = useState(kstToday);
  const [summaries, setSummaries] = useState<UndelivSummaryRow[]>(INITIAL_SUMMARIES);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number>(1);
  const [details, setDetails] = useState<Record<number, UndelivDetailRow[]>>(INITIAL_DETAILS);

  useEffect(() => {
    fetch('/api/sales/order?status=미출')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loadedSummaries: UndelivSummaryRow[] = [];
          const loadedDetails: Record<number, UndelivDetailRow[]> = {};

          json.data.forEach((o: any, idx: number) => {
            const id = o.id || idx + 1;
            const dets: UndelivDetailRow[] = (o.details || []).map((d: any, di: number) => ({
              id: d.id || id * 1000 + di,
              checked: false,
              tradeDate: o.orderDate,
              gubun: '완성품',
              kind: d.product?.kind || '',
              partName: d.product?.name || '',
              spec: d.product?.spec || '',
              unit: d.product?.unit || 'ea',
              shift: o.shift || '1편',
              unitPrice: Number(d.unitPrice) || 0,
              unDelivQty: Number(d.totalQty) || 0,
              unDelivAmt: Number(d.amount) || 0,
              unDelivReason: '미출',
              remark: o.remark || '',
            }));

            const q1 = (o.details || []).reduce((s: number, d: any) => s + (Number(d.orderQty1) || 0), 0);
            const q2 = (o.details || []).reduce((s: number, d: any) => s + (Number(d.orderQty2) || 0), 0);
            const a1 = (o.details || []).reduce(
              (s: number, d: any) => s + (Number(d.orderQty1) || 0) * (Number(d.unitPrice) || 0),
              0
            );
            const a2 = (o.details || []).reduce(
              (s: number, d: any) => s + (Number(d.orderQty2) || 0) * (Number(d.unitPrice) || 0),
              0
            );

            loadedSummaries.push({
              id,
              checked: false,
              clientName: CENTER_NAMES[o.centerCode] || o.centerCode || '',
              shift1Qty: q1,
              shift2Qty: q2,
              totalQty: q1 + q2,
              shift1Amt: a1,
              shift2Amt: a2,
              totalAmt: a1 + a2,
            });
            loadedDetails[id] = dets;
          });

          setSummaries(loadedSummaries);
          setDetails(loadedDetails);
          if (loadedSummaries.length > 0) setSelectedSummaryId(loadedSummaries[0].id);
        }
      })
      .catch((err) => console.error('Failed to load undelivered orders', err));
  }, []);

  // ── 인라인 편집 ──
  const { editingCell, editValue, setEditValue, startEditing, cancelEditing, isEditing } = useInlineEdit();
  const saveEdit = (rowId: string | number, colKey: string, rows: any[], setRows: (r: any[]) => void) => {
    setRows(rows.map(r => {
      const id = r.id ?? r.no ?? r.idx ?? r.index;
      if (id === rowId) {
        const numVal = Number(editValue);
        return { ...r, [colKey]: isNaN(numVal) || editValue.trim() === '' ? editValue : numVal };
      }
      return r;
    }));
    cancelEditing();
  };

  const currentDetails = details[selectedSummaryId] || [];

  const handleDeleteSelected = () => {
    setDetails((prev) => ({
      ...prev,
      [selectedSummaryId]: (prev[selectedSummaryId] || []).filter((d) => !d.checked),
    }));
    alert('선택된 미출 상세 데이터가 삭제되었습니다.');
  };

  const handleSave = () => {
    alert('미출현황 변경사항이 저장되었습니다.');
  };

  // Summary Totals
  const sumTotals = summaries.reduce(
    (acc, s) => ({
      s1Q: acc.s1Q + s.shift1Qty,
      s2Q: acc.s2Q + s.shift2Qty,
      tQ: acc.tQ + s.totalQty,
      s1A: acc.s1A + s.shift1Amt,
      s2A: acc.s2A + s.shift2Amt,
      tA: acc.tA + s.totalAmt,
    }),
    { s1Q: 0, s2Q: 0, tQ: 0, s1A: 0, s2A: 0, tA: 0 }
  );

  // Detail Totals
  const detailTotals = currentDetails.reduce(
    (acc, d) => ({
      qty: acc.qty + d.unDelivQty,
      amt: acc.amt + d.unDelivAmt,
    }),
    { qty: 0, amt: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 (화면 캡처 092204.png: 조회, 저장, 삭제, 초기화, ?) */}
      <SalesActionBar
        title="미출현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'save', label: '저장', icon: 'save', variant: 'secondary', onClick: handleSave },
          { key: 'delete', label: '삭제', icon: 'delete', variant: 'danger', onClick: handleDeleteSelected },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setSummaries(INITIAL_SUMMARIES) },
        ]}
        helpContent="GS리테일 주문 대비 미출고/미납품된 수량 및 사유(라인 지연, 원료 부족, 기계 고장 등)를 파악하고 이력을 관리합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 092204.png: 일자, [<][>], 라디오) */}
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

      {/* 3. 상하 2단 분할 레이아웃 (상단 요약 46% / 하단 세부데이터 54%) */}
      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        {/* 상단: 거래처별 요약 그리드 */}
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>요약</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {summaries.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                {/* 1st Tier */}
                <tr className="border-b border-[#dbe3ee]">
                  <th rowSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                  <th rowSpan={2} className="py-1 px-3 border-r border-[#dbe3ee] text-left">거래처명</th>
                  <th colSpan={3} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#e8edf4]">미출수량</th>
                  <th colSpan={3} className="whitespace-nowrap py-1 px-1 bg-[#b5baf0]">미출금액</th>
                </tr>
                {/* 2nd Tier */}
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
                    onClick={() => setSelectedSummaryId(s.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedSummaryId === s.id ? 'bg-[#b2ebf2] font-semibold' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={s.checked}
                        onChange={() =>
                          setSummaries((prev) =>
                            prev.map((r) => (r.id === s.id ? { ...r, checked: !r.checked } : r))
                          )
                        }
                        className="w-3.5 h-3.5 text-blue-600 rounded-xs"
                      />
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-3 font-sans text-left border-r border-gray-200 font-medium">{s.clientName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200 text-amber-800">{s.shift1Qty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200 text-indigo-800">{s.shift2Qty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-extrabold text-red-600 border-r border-gray-200 bg-red-50/20">{s.totalQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{s.shift1Amt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{s.shift2Amt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-extrabold text-red-600 bg-red-50/20">{s.totalAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={2} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-amber-900 border-r border-gray-300">{sumTotals.s1Q.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-indigo-900 border-r border-gray-300">{sumTotals.s2Q.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-red-600 font-black border-r border-gray-300">{sumTotals.tQ.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{sumTotals.s1A.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{sumTotals.s2A.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-red-600 font-black">{sumTotals.tA.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* 하단: 세부데이터 그리드 */}
        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>세부데이터</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {currentDetails.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">거래일</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">구분</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">품종</th>
                  <th className="py-1 px-3 border-r border-[#dbe3ee] text-left">품명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">단위</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-12">편수</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-18">단가</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20 bg-[#e8edf4]">미출수량</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-24">미출금액</th>
                  <th className="py-1 px-3 border-r border-[#dbe3ee] text-left w-36">미납사유</th>
                  <th className="whitespace-nowrap py-1 px-2 text-left">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetails.map((d) => (
                  <tr key={d.id} className="hover:bg-blue-50/50">
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">
                      <input
                        type="checkbox"
                        checked={d.checked}
                        onChange={() =>
                          setDetails((prev) => ({
                            ...prev,
                            [selectedSummaryId]: (prev[selectedSummaryId] || []).map((item) =>
                              item.id === d.id ? { ...item, checked: !item.checked } : item
                            ),
                          }))
                        }
                        className="w-3.5 h-3.5 text-blue-600 rounded-xs"
                      />
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center border-r border-gray-200">{d.tradeDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.gubun}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.kind}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-3 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.spec}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.unit}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.shift}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-extrabold text-red-600 border-r border-gray-200 bg-red-50/20">{d.unDelivQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-gray-900 border-r border-gray-200">{d.unDelivAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-3 font-sans text-left text-rose-700 font-medium border-r border-gray-200">{d.unDelivReason}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left text-gray-600">{d.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={9} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-red-600 font-black border-r border-gray-300">{detailTotals.qty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-gray-900 border-r border-gray-300">{detailTotals.amt.toLocaleString()}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};
