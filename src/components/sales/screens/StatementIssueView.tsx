'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { RotateCw } from 'lucide-react';
import { GS_CENTERS_MASTER } from '../data/salesMasterData';
import { usePrintReport } from '@/context/PrintReportContext';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface StatementSummaryRow {
  id: number;
  status: string;       // 상태 (출고완료)
  delivDate: string;    // 납품날짜
  shift: string;        // 편수
  clientName: string;   // 거래처명
  shiftNum: number;     // 편수 숫자 (1, 2)
}

interface StatementDetailRow {
  id: number;
  checked: boolean;     // 선택
  isIssued: string;     // 발행여부
  kind: string;         // 품종
  partName: string;     // 품명
  spec: string;         // 규격
  unit: string;         // 단위
  unitPrice: number;    // 단가
  delivQtyTotal: number;// 납품수량계
  delivAmtTotal: number;// 납품금액계
}

const INITIAL_SUMMARIES: StatementSummaryRow[] = GS_CENTERS_MASTER.map((c, idx) => ({
  id: idx + 1,
  status: c.status,
  delivDate: '2026-10-30',
  shift: c.shift,
  clientName: c.centerName,
  shiftNum: c.shift === '1편' ? 1 : 2,
}));

// 캡처 화면 091958.png 실제 데이터 100% 매칭
const INITIAL_DETAILS: StatementDetailRow[] = [
  { id: 1, checked: true, isIssued: '', kind: '김밥', partName: '넷플)더담은K떡볶이김밥', spec: '', unit: '개', unitPrice: 2545, delivQtyTotal: 82, delivAmtTotal: 208690 },
  { id: 2, checked: true, isIssued: '', kind: '김밥', partName: '더블치즈소시지김밥', spec: '', unit: 'ea', unitPrice: 2160, delivQtyTotal: 36, delivAmtTotal: 77760 },
  { id: 3, checked: true, isIssued: '', kind: '김밥', partName: '디팡)시장꼬마김밥', spec: '', unit: '개', unitPrice: 1636, delivQtyTotal: 30, delivAmtTotal: 49080 },
  { id: 4, checked: true, isIssued: '', kind: '김밥', partName: '디팡)에그햄꼬마김밥', spec: '', unit: '개', unitPrice: 1830, delivQtyTotal: 108, delivAmtTotal: 197640 },
  { id: 5, checked: true, isIssued: '', kind: '김밥', partName: '불고기치즈김밥2편', spec: '', unit: '개', unitPrice: 2127, delivQtyTotal: 31, delivAmtTotal: 65937 },
  { id: 6, checked: true, isIssued: '', kind: '김밥', partName: '스팸계란치즈김밥', spec: '', unit: '개', unitPrice: 2045, delivQtyTotal: 40, delivAmtTotal: 81800 },
  { id: 7, checked: true, isIssued: '', kind: '김밥', partName: '왕돈까스김밥1편', spec: '', unit: '개', unitPrice: 2141, delivQtyTotal: 50, delivAmtTotal: 107050 },
  { id: 8, checked: true, isIssued: '', kind: '김밥', partName: '직화)한돈제육쌈김밥', spec: '', unit: '개', unitPrice: 2186, delivQtyTotal: 44, delivAmtTotal: 96184 },
  { id: 9, checked: true, isIssued: '', kind: '김밥', partName: '진미채치즈김밥2편', spec: '', unit: '개', unitPrice: 2143, delivQtyTotal: 28, delivAmtTotal: 60021 },
  { id: 10, checked: true, isIssued: '', kind: '김밥', partName: '참치김치볶음김밥', spec: '', unit: '개', unitPrice: 2084, delivQtyTotal: 77, delivAmtTotal: 160468 },
  { id: 11, checked: true, isIssued: '', kind: '김밥', partName: 'THE근본김밥 1편', spec: '', unit: '개', unitPrice: 1660, delivQtyTotal: 115, delivAmtTotal: 190900 },
  { id: 12, checked: true, isIssued: '', kind: '도시락', partName: '(주문)혜자)돌아온제육', spec: '', unit: 'ea', unitPrice: 3915, delivQtyTotal: 10, delivAmtTotal: 39150 },
  { id: 13, checked: true, isIssued: '', kind: '도시락', partName: '혜자)돌아온제육도시락', spec: '', unit: 'ea', unitPrice: 3915, delivQtyTotal: 45, delivAmtTotal: 176175 },
  { id: 14, checked: true, isIssued: '', kind: '도시락', partName: '혜자)돌아온부대찌개도시락', spec: '', unit: 'ea', unitPrice: 4200, delivQtyTotal: 105, delivAmtTotal: 441000 },
  { id: 15, checked: true, isIssued: '', kind: '도시락', partName: '혜자)두부김치제육한상', spec: '', unit: 'ea', unitPrice: 4300, delivQtyTotal: 75, delivAmtTotal: 322500 },
  { id: 16, checked: true, isIssued: '', kind: '도시락', partName: '혜자)통등심돈까스도시락', spec: '', unit: 'ea', unitPrice: 4900, delivQtyTotal: 103, delivAmtTotal: 504700 },
  { id: 17, checked: true, isIssued: '', kind: '주먹밥', partName: '더큰)들기름막국수주먹밥', spec: '', unit: 'ea', unitPrice: 1100, delivQtyTotal: 181, delivAmtTotal: 199100 },
  { id: 18, checked: true, isIssued: '', kind: '주먹밥', partName: '더큰)리챔참치마요', spec: '', unit: 'ea', unitPrice: 1150, delivQtyTotal: 139, delivAmtTotal: 159850 },
  { id: 19, checked: true, isIssued: '', kind: '주먹밥', partName: '더큰)스팸계란볶음', spec: '', unit: 'ea', unitPrice: 1180, delivQtyTotal: 209, delivAmtTotal: 246620 },
  { id: 20, checked: true, isIssued: '', kind: '주먹밥', partName: '더큰)스팸김치볶음밥', spec: '', unit: 'ea', unitPrice: 1080, delivQtyTotal: 242, delivAmtTotal: 261360 },
  { id: 21, checked: true, isIssued: '', kind: '주먹밥', partName: '더큰)오징어제육깻잎', spec: '', unit: 'ea', unitPrice: 1064, delivQtyTotal: 84, delivAmtTotal: 89376 },
  { id: 22, checked: true, isIssued: '', kind: '주먹밥', partName: '삼각)전주비빔2편', spec: '', unit: 'ea', unitPrice: 687, delivQtyTotal: 260, delivAmtTotal: 178620 },
  { id: 23, checked: true, isIssued: '', kind: '햄버거', partName: '착한1900핫도그(양배추)', spec: '', unit: 'ea', unitPrice: 1286, delivQtyTotal: 90, delivAmtTotal: 115740 },
  { id: 24, checked: true, isIssued: '', kind: '무스비', partName: '무스비)햄&참치김치', spec: '', unit: 'ea', unitPrice: 1182, delivQtyTotal: 82, delivAmtTotal: 96924 },
  { id: 25, checked: true, isIssued: '', kind: '무스비', partName: 'NEW스팸무스비', spec: '', unit: 'ea', unitPrice: 1450, delivQtyTotal: 82, delivAmtTotal: 118900 },
];

export const StatementIssueView: React.FC = () => {
  const { openPrintModal } = usePrintReport();
  const [delivDate, setDelivDate] = useState('2026-10-30');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [summaries, setSummaries] = useState<StatementSummaryRow[]>(INITIAL_SUMMARIES);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number>(1);
  const [details, setDetails] = useState<StatementDetailRow[]>(INITIAL_DETAILS);

  useEffect(() => {
    fetch('/api/sales/delivery')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loadedDetails: StatementDetailRow[] = [];
          json.data.forEach((d: any) => {
            (d.details || []).forEach((dt: any, dtIdx: number) => {
              loadedDetails.push({
                id: dt.id || dtIdx + 1,
                checked: true,
                isIssued: '발행',
                kind: '완성품',
                partName: dt.productName || '제품',
                spec: '',
                unit: 'ea',
                unitPrice: dt.unitPrice || 2000,
                delivQtyTotal: dt.deliveryQty || 10,
                delivAmtTotal: dt.amount || 20000,
              });
            });
          });
          if (loadedDetails.length > 0) {
            setDetails(loadedDetails);
          }
        }
      })
      .catch((err) => console.error('Failed to load statement details', err));
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

  const handleSelectAllDetails = (checked: boolean) => {
    setDetails((prev) => prev.map((d) => ({ ...d, checked })));
  };

  const handleToggleDetail = (id: number) => {
    setDetails((prev) =>
      prev.map((d) => (d.id === id ? { ...d, checked: !d.checked } : d))
    );
  };

  const handleBatchIssue = () => {
    const selected = details.filter((d) => d.checked);
    if (selected.length === 0) {
      alert('발행할 거래명세서 품목을 선택하세요.');
      return;
    }
    setDetails((prev) =>
      prev.map((d) => (d.checked ? { ...d, isIssued: '발행완료' } : d))
    );
    openPrintModal('DELIVERY_STATEMENT');
  };

  // Detail totals
  const detailTotals = details.reduce(
    (acc, d) => ({
      qty: acc.qty + d.delivQtyTotal,
      amt: acc.amt + d.delivAmtTotal,
    }),
    { qty: 0, amt: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 (화면 캡처 091958.png: 조회, 초기화, 거래명세서일괄출력, ?) */}
      <SalesActionBar
        title="거래명세서발행"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setDetails(INITIAL_DETAILS) },
          { key: 'issue', label: '거래명세서일괄출력', icon: 'print', variant: 'success', onClick: handleBatchIssue },
        ]}
        helpContent="물류센터별 최종 출하된 완성품에 대해 거래명세서를 일괄 또는 건별로 발행/출력합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 091958.png: 납품일자, 거래처: ALL) */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-4">
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

      {/* 3. 상하 2단 분할 레이아웃 (상단 센터목록 44% / 하단 내역 56%) */}
      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        {/* 상단: 요약 센터 그리드 */}
        <div className="h-[44%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>요약 (센터별 납품 현황)</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {summaries.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">No</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">상태</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">납품날짜</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-16">편수</th>
                  <th className="py-1 px-3 border-r border-[#dbe3ee] text-left">거래처명</th>
                  <th className="whitespace-nowrap py-1 px-2 w-16">편수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {summaries.map((s, idx) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSummaryId(s.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedSummaryId === s.id ? 'bg-[#b2ebf2] font-semibold' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200 text-gray-500">{idx + 1}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200 text-emerald-800 font-semibold">{s.status}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center border-r border-gray-200">{s.delivDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{s.shift}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-3 font-sans text-left border-r border-gray-200 font-medium">{s.clientName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center">{s.shiftNum}</td>
                  </tr>
                ))}
              </tbody>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* 하단: 내역 그리드 (선택 센터의 품목 및 발행여부) */}
        <div className="h-[56%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>내역</span>
              <label className="flex items-center gap-1 text-[11.5px] font-normal text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={true}
                  onChange={(e) => handleSelectAllDetails(e.target.checked)}
                  className="w-3 h-3 text-blue-600"
                />
                <span>전체선택</span>
              </label>
            </div>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {details.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">No</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">발행여부</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-16">품종</th>
                  <th className="py-1 px-3 border-r border-[#dbe3ee] text-left">품명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-12">단위</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20">단가</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-24">납품수량계</th>
                  <th className="py-1 px-3 text-right w-28">납품금액계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {details.map((d, idx) => (
                  <tr key={d.id} className="hover:bg-blue-50/50">
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200 text-gray-500">{idx + 1}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">
                      <input
                        type="checkbox"
                        checked={d.checked}
                        onChange={() => handleToggleDetail(d.id)}
                        className="w-3.5 h-3.5 text-blue-600 rounded-xs"
                      />
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200 text-emerald-700 font-semibold">{d.isIssued}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{d.kind}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-3 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.spec}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.unit}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-blue-900 border-r border-gray-200">{d.delivQtyTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-3 text-right font-bold text-gray-900">{d.delivAmtTotal.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={8} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-blue-900 border-r border-gray-300">{detailTotals.qty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-3 text-right text-gray-900">{detailTotals.amt.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};
