'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { Printer, RotateCw } from 'lucide-react';
import { GS_CENTERS_MASTER } from '../data/salesMasterData';
import { usePrintReport } from '@/context/PrintReportContext';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface TagSummaryRow {
  id: number;
  checked: boolean;
  clientName: string;   // 거래처명
  orderMethod: string;  // 주문방법
  shift: string;        // 편수
  orderAmtTotal: number;// 주문금액계
  delivQtyTotal: number;// 납품수량계
  delivAmtTotal: number;// 납품금액계
  abbrevName: string;   // 축약명 (예: 김해1, 양산1 등)
}

interface TagDetailRow {
  id: number;
  checked: boolean;
  kind: string;         // 품종
  partName: string;     // 품명
  delivQty: number;     // 납품수량
  excludeQty: number;   // 제외수량
  actualQty: number;    // 출력수량 = 납품수량 - 제외수량
  boxInQty: number;     // 박스내입수량
  boxQty: number;       // 박스수량 = Math.floor(출력수량 / 박스내입수량)
  pieceQty: number;     // 낱개수량 = 출력수량 % 박스내입수량
}

const INITIAL_SUMMARIES: TagSummaryRow[] = GS_CENTERS_MASTER.map((c, idx) => ({
  id: idx + 1,
  checked: false,
  clientName: c.centerName,
  orderMethod: '등록',
  shift: c.shift,
  orderAmtTotal: 4500000 + idx * 250000,
  delivQtyTotal: 1800 + idx * 120,
  delivAmtTotal: 4500000 + idx * 250000,
  abbrevName: c.abbrevName,
}));

const INITIAL_DETAILS: Record<number, TagDetailRow[]> = {
  1: [
    { id: 101, checked: false, kind: '김밥', partName: '넷플)더담은K떡볶이김밥', delivQty: 82, excludeQty: 0, actualQty: 82, boxInQty: 28, boxQty: 2, pieceQty: 26 },
    { id: 102, checked: false, kind: '김밥', partName: '더블치즈소시지김밥', delivQty: 36, excludeQty: 0, actualQty: 36, boxInQty: 40, boxQty: 0, pieceQty: 36 },
    { id: 103, checked: false, kind: '김밥', partName: '디팡)에그햄꼬마김밥', delivQty: 108, excludeQty: 0, actualQty: 108, boxInQty: 28, boxQty: 3, pieceQty: 24 },
    { id: 104, checked: false, kind: '도시락', partName: '혜자)돌아온부대찌개도시락', delivQty: 105, excludeQty: 0, actualQty: 105, boxInQty: 9, boxQty: 11, pieceQty: 6 },
    { id: 105, checked: false, kind: '도시락', partName: '혜자)통등심돈까스도시락', delivQty: 103, excludeQty: 0, actualQty: 103, boxInQty: 6, boxQty: 17, pieceQty: 1 },
    { id: 106, checked: false, kind: '주먹밥', partName: '더큰)들기름막국수주먹밥', delivQty: 181, excludeQty: 0, actualQty: 181, boxInQty: 40, boxQty: 4, pieceQty: 21 },
  ],
  2: [
    { id: 201, checked: false, kind: '김밥', partName: '불고기치즈김밥2편', delivQty: 31, excludeQty: 0, actualQty: 31, boxInQty: 40, boxQty: 0, pieceQty: 31 },
    { id: 202, checked: false, kind: '주먹밥', partName: '삼각)전주비빔2편', delivQty: 260, excludeQty: 0, actualQty: 260, boxInQty: 40, boxQty: 6, pieceQty: 20 },
  ],
};

export const TagPrintView: React.FC = () => {
  const { openPrintModal } = usePrintReport();
  const [orderDate, setOrderDate] = useState('2026-10-30');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [summaries, setSummaries] = useState<TagSummaryRow[]>(INITIAL_SUMMARIES);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number>(1);
  const [details, setDetails] = useState<Record<number, TagDetailRow[]>>(INITIAL_DETAILS);

  useEffect(() => {
    fetch('/api/sales/delivery')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const map: Record<number, TagDetailRow[]> = {};
          json.data.forEach((d: any, idx: number) => {
            const sumId = idx + 1;
            map[sumId] = (d.details || []).map((dt: any, dtIdx: number) => {
              const boxIn = dt.boxQty > 0 ? Math.round(dt.deliveryQty / dt.boxQty) : 24;
              return {
                id: dt.id || dtIdx + 1,
                checked: true,
                kind: '완성품',
                partName: dt.productName || '제품',
                delivQty: dt.deliveryQty || 10,
                excludeQty: 0,
                actualQty: dt.deliveryQty || 10,
                boxInQty: boxIn,
                boxQty: Math.floor(dt.deliveryQty / boxIn),
                pieceQty: dt.deliveryQty % boxIn,
              };
            });
          });
          if (Object.keys(map).length > 0) {
            setDetails((prev) => ({ ...prev, ...map }));
          }
        }
      })
      .catch((err) => console.error('Failed to load tag details', err));
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

  const handleSelectAllSummaries = (checked: boolean) => {
    setSummaries((prev) => prev.map((s) => ({ ...s, checked })));
  };

  const handleSelectAllDetails = (checked: boolean) => {
    setDetails((prev) => ({
      ...prev,
      [selectedSummaryId]: (prev[selectedSummaryId] || []).map((d) => ({ ...d, checked })),
    }));
  };

  const handlePrintTags = () => {
    const selectedSummaries = summaries.filter((s) => s.checked);
    if (selectedSummaries.length === 0) {
      alert('꼬리표를 출력할 거래처 요약 항목을 선택하세요.');
      return;
    }
    openPrintModal('DELIVERY_BOX_LABEL');
  };

  const handlePrintSingle = () => {
    const selected = currentDetails.filter((d) => d.checked);
    if (selected.length === 0) {
      alert('개별 인쇄할 품목을 선택하세요.');
      return;
    }
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
      {/* 1. 상단 액션 바 (화면 캡처 092105.png: 조회, 저장, 초기화, 꼬리표출력, ?) */}
      <SalesActionBar
        title="꼬리표출력"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'save', label: '저장', icon: 'save', variant: 'secondary', onClick: () => alert('저장 완료') },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setSummaries(INITIAL_SUMMARIES) },
          { key: 'printTag', label: '꼬리표출력', icon: 'print', variant: 'success', onClick: handlePrintTags },
        ]}
        helpContent="물류 출하 파레트 및 배송 박스에 부착할 표준 꼬리표 라벨을 박스수량/낱개수량별로 자동 분할 출력합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 092105.png: [ ]전체선택, 주문일자, 매출처: ALL) */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1 cursor-pointer text-[11px] font-medium text-gray-700">
            <input
              type="checkbox"
              onChange={(e) => handleSelectAllSummaries(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded-xs"
            />
            <span>전체선택</span>
          </label>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">주문일자:</span>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs shadow-2xs h-6"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">매출처:</span>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="border border-gray-400 bg-white px-2 py-0.5 text-[11px] h-6 rounded-xs"
            >
              <option value="ALL">ALL</option>
              <option value="GSR 김해일배">GSR 김해일배</option>
              <option value="GSR 양산조리센터">GSR 양산조리센터</option>
              <option value="GSR 부산물류센터">GSR 부산물류센터</option>
              <option value="GSR 신광주 저온">GSR 신광주 저온</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => alert('새로고침')}
          className="p-1 hover:bg-gray-200 rounded text-gray-600 cursor-pointer"
          title="새로고침"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3. 상하 2단 분할 레이아웃 */}
      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        {/* 상단: 요약 그리드 */}
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>요약 (거래처별)</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {summaries.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                  <th className="py-1 px-3 border-r border-[#dbe3ee] text-left">거래처명</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">주문방법</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-16">편수</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-24">주문금액계</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-24">납품수량계</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-28">납품금액계</th>
                  <th className="whitespace-nowrap py-1 px-2 w-20">축약명</th>
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
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{s.orderMethod}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{s.shift}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{s.orderAmtTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-blue-900 border-r border-gray-200">{s.delivQtyTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-gray-900 border-r border-gray-200">{s.delivAmtTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center text-gray-700">{s.abbrevName}</td>
                  </tr>
                ))}
              </tbody>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* 하단: 내역 그리드 */}
        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>내역</span>
              <label className="flex items-center gap-1 text-[11.5px] font-normal text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  onChange={(e) => handleSelectAllDetails(e.target.checked)}
                  className="w-3 h-3 text-blue-600"
                />
                <span>전체선택</span>
              </label>
              <button
                onClick={handlePrintSingle}
                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11.5px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-3 h-3" />
                <span>개별인쇄</span>
              </button>
            </div>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {currentDetails.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-18">품종</th>
                  <th className="py-1 px-3 border-r border-[#dbe3ee] text-left">품명</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20">납품수량</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-18">제외수량</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20 bg-[#e8edf4]">출력수량</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-center w-22">박스내입수량</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20 font-bold">박스수량</th>
                  <th className="whitespace-nowrap py-1 px-2 text-right w-20 font-bold">낱개수량</th>
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
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{d.kind}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-3 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{d.delivQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200 text-gray-500">{d.excludeQty}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-blue-900 border-r border-gray-200 bg-blue-50/20">{d.actualQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center border-r border-gray-200 text-gray-600">{d.boxInQty}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-emerald-800 border-r border-gray-200">{d.boxQty} Box</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-indigo-900">{d.pieceQty} ea</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={3} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-blue-900 border-r border-gray-300">{detailTotals.delivQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-gray-500 border-r border-gray-300">{detailTotals.excludeQty}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-blue-900 border-r border-gray-300">{detailTotals.actualQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 border-r border-gray-300"></td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-emerald-900 border-r border-gray-300">{detailTotals.boxQty} Box</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-indigo-900">{detailTotals.pieceQty} ea</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};
