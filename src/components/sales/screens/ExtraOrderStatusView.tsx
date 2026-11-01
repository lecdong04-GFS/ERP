'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { Plus } from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface ExtraOrderSummaryRow {
  id: number;
  orderDate: string;    // 주문날짜
  delivDate: string;    // 납품날짜
  shift: string;        // 편수
  clientName: string;   // 거래처명
  storeName: string;    // 편의점명
  extraCount: number;   // 추가주문건수
  orderQtyTotal: number;// 주문수량계
  orderAmtTotal: number;// 주문금액계
  delivQtyTotal: number;// 납품수량계
  delivAmtTotal: number;// 납품금액계
}

interface ExtraOrderDetailRow {
  id: number;
  kind: string;         // 품종
  partName: string;     // 품명
  unitPrice: number;    // 단가
  orderQty: number;     // 주문수량
  orderAmt: number;     // 주문금액
  delivQty: number;     // 납품수량
  delivAmt: number;     // 납품금액
}

const INITIAL_SUMMARIES: ExtraOrderSummaryRow[] = [
  { id: 1, orderDate: '2026-10-30', delivDate: '2026-10-30', shift: '1편', clientName: '(주)영풍', storeName: 'GS25 역삼스타점', extraCount: 2, orderQtyTotal: 80, orderAmtTotal: 172800, delivQtyTotal: 80, delivAmtTotal: 172800 },
  { id: 2, orderDate: '2026-10-30', delivDate: '2026-10-30', shift: '1편', clientName: '(주)영풍', storeName: 'GS25 강남중앙점', extraCount: 3, orderQtyTotal: 120, orderAmtTotal: 264000, delivQtyTotal: 120, delivAmtTotal: 264000 },
  { id: 3, orderDate: '2026-10-30', delivDate: '2026-10-30', shift: '2편', clientName: '(주)해인', storeName: 'GS25 부산서면점', extraCount: 1, orderQtyTotal: 50, orderAmtTotal: 195750, delivQtyTotal: 50, delivAmtTotal: 195750 },
  { id: 4, orderDate: '2026-10-30', delivDate: '2026-10-30', shift: '2편', clientName: '(주)영풍', storeName: 'GS25 종로타워점', extraCount: 2, orderQtyTotal: 65, orderAmtTotal: 140400, delivQtyTotal: 60, delivAmtTotal: 129600 },
];

const INITIAL_DETAILS: Record<number, ExtraOrderDetailRow[]> = {
  1: [
    { id: 101, kind: '김밥', partName: '더블치즈소시지김밥1편', unitPrice: 2160, orderQty: 50, orderAmt: 108000, delivQty: 50, delivAmt: 108000 },
    { id: 102, kind: '주먹밥', partName: '더큰)스팸김치볶음밥', unitPrice: 2160, orderQty: 30, orderAmt: 64800, delivQty: 30, delivAmt: 64800 },
  ],
  2: [
    { id: 201, kind: '김밥', partName: '넷플)더담은K떡볶이김밥', unitPrice: 2545, orderQty: 60, orderAmt: 152700, delivQty: 60, delivAmt: 152700 },
    { id: 202, kind: '햄버거', partName: '착한1900핫도그(양배추)', unitPrice: 1286, orderQty: 40, orderAmt: 51440, delivQty: 40, delivAmt: 51440 },
    { id: 203, kind: '주먹밥', partName: '더큰)오징어제육깻잎주먹밥', unitPrice: 1064, orderQty: 20, orderAmt: 21280, delivQty: 20, delivAmt: 21280 },
  ],
  3: [
    { id: 301, kind: '도시락', partName: '혜자)돌아온제육도시락', unitPrice: 3915, orderQty: 50, orderAmt: 195750, delivQty: 50, delivAmt: 195750 },
  ],
  4: [
    { id: 401, kind: '김밥', partName: '직화)한돈제육쌈김밥', unitPrice: 2186, orderQty: 35, orderAmt: 76510, delivQty: 35, delivAmt: 76510 },
    { id: 402, kind: '무스비', partName: '무스비)햄&참치김치', unitPrice: 2127, orderQty: 30, orderAmt: 63810, delivQty: 25, delivAmt: 53175 },
  ],
};

export const ExtraOrderStatusView: React.FC = () => {
  const [startDate, setStartDate] = useState('2026-10-30');
  const [endDate, setEndDate] = useState('2026-10-30');
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [summaries, setSummaries] = useState<ExtraOrderSummaryRow[]>(INITIAL_SUMMARIES);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number>(1);
  const [details, setDetails] = useState<Record<number, ExtraOrderDetailRow[]>>(INITIAL_DETAILS);

  useEffect(() => {
    fetch('/api/sales/order?orderType=추가')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loadedSummaries: ExtraOrderSummaryRow[] = json.data.map((o: any, idx: number) => ({
            id: o.id || idx + 1,
            orderDate: o.orderDate,
            delivDate: o.orderDate,
            shift: o.shift || '1편',
            clientName: o.centerCode || '(주)영풍',
            storeName: o.remark || 'GS25 지정점',
            extraCount: o.details?.length || 1,
            orderQtyTotal: o.totalQty || 0,
            orderAmtTotal: o.totalAmount || 0,
            delivQtyTotal: o.totalQty || 0,
            delivAmtTotal: o.totalAmount || 0,
          }));
          setSummaries(loadedSummaries);
        }
      })
      .catch((err) => console.error('Failed to load extra orders', err));
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

  const handleAddDetail = () => {
    const newId = Date.now();
    const newItem: ExtraOrderDetailRow = {
      id: newId,
      kind: '김밥',
      partName: '추가등록김밥',
      unitPrice: 2000,
      orderQty: 20,
      orderAmt: 40000,
      delivQty: 20,
      delivAmt: 40000,
    };
    setDetails((prev) => ({
      ...prev,
      [selectedSummaryId]: [...(prev[selectedSummaryId] || []), newItem],
    }));
  };

  const summaryTotals = summaries.reduce(
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
      {/* 1. 상단 액션 바 (화면 캡처 091554.png: 조회, 초기화, 엑셀다운로드, ?) */}
      <SalesActionBar
        title="추가주문현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setSummaries(INITIAL_SUMMARIES) },
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
                  { key: 'delivDate', label: '납품일자', format: 'date' },
                  { key: 'shift', label: '편수' },
                  { key: 'clientName', label: '거래처명' },
                  { key: 'storeName', label: '편의점명' },
                  { key: 'extraCount', label: '추가주문건수', format: 'number' },
                  { key: 'orderQtyTotal', label: '주문수량계', format: 'number' },
                  { key: 'orderAmtTotal', label: '주문금액계', format: 'currency' },
                  { key: 'delivQtyTotal', label: '납품수량계', format: 'number' },
                  { key: 'delivAmtTotal', label: '납품금액계', format: 'currency' },
                ],
                data: summaries,
              }),
          },
        ]}
        helpContent="유선이나 메신저로 접수된 점포별 추가 주문 내역 및 추가분에 대한 출하/납품 상태를 조회합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 091554.png: 주문일자, [<][>], 일간~연간, [ ]주문취소포함) */}
      <SalesFilterBar
        label="주문일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={summaries.length}
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

      {/* 3. 상하 2단 분할 레이아웃 */}
      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        {/* 상단: 요약 그리드 */}
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>요약</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {summaries.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">주문날짜</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">납품날짜</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">편수</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">거래처명</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">편의점명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-center w-24">추가주문건수</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">주문수량계</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-28">주문금액계</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">납품수량계</th>
                  <th className="whitespace-nowrap py-1 px-1 text-right w-28">납품금액계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {summaries.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSummaryId(s.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedSummaryId === s.id ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{s.orderDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{s.delivDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{s.shift}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{s.clientName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200 font-medium">{s.storeName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{s.extraCount}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{s.orderQtyTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{s.orderAmtTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{s.delivQtyTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-gray-900">{s.delivAmtTotal.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={5} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-300">{summaryTotals.count}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{summaryTotals.orderQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{summaryTotals.orderAmt.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{summaryTotals.delivQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-gray-900">{summaryTotals.delivAmt.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* 하단: 내역 그리드 */}
        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span>내역 (개별품목삭제는 마우스 우측버튼클릭)</span>
              <span className="text-red-600 font-bold">▶ 삭제 후 반드시 저장하시기 바랍니다.</span>
            </div>
            <button
              onClick={handleAddDetail}
              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11.5px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>추가</span>
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
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
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{d.kind}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-blue-900 border-r border-gray-200">{d.orderQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{d.orderAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-emerald-800 border-r border-gray-200">{d.delivQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-gray-900">{d.delivAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={3} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-blue-900 border-r border-gray-300">{detailTotals.orderQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-300">{detailTotals.orderAmt.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-emerald-900 border-r border-gray-300">{detailTotals.delivQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-gray-900">{detailTotals.delivAmt.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};
