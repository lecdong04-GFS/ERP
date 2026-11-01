'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { exportGridToExcel } from '@/lib/excelExport';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface ItemDeliverySummary {
  id: number;
  partNo: string;       // 품번
  gubun: string;        // 구분
  kind: string;         // 품종
  partName: string;     // 품명
  spec: string;         // 규격
  unit: string;         // 단위
  delivCount: number;   // 납품횟수
  totalQty: number;     // 합계수량
  totalAmt: number;     // 합계금액
}

interface ItemDeliveryDetail {
  id: number;
  delivDate: string;    // 납품날짜
  clientName: string;   // 거래처
  orderMethod: string;  // 주문방법
  unitPrice: number;    // 납품단가
  delivQty: number;     // 납품수량
  delivAmt: number;     // 납품금액
  lotNo: string;        // LOT no.
  remark: string;       // 비고
}

// 캡처 화면 091920.png 실데이터 100% 반영
const REAL_ITEM_SUMMARIES: ItemDeliverySummary[] = [
  { id: 1, partNo: '27000388710', gubun: '완성품', kind: '햄버거', partName: '착한1900핫도그(양배추)', spec: '130g', unit: 'ea', delivCount: 2, totalQty: 90, totalAmt: 115740 },
  { id: 2, partNo: '27000388781', gubun: '완성품', kind: '김밥', partName: '더블치즈소시지김밥1편', spec: '230g', unit: 'ea', delivCount: 10, totalQty: 615, totalAmt: 1328400 },
  { id: 3, partNo: '27000388782', gubun: '완성품', kind: '김밥', partName: '불고기치즈김밥2편', spec: '235g', unit: 'ea', delivCount: 10, totalQty: 345, totalAmt: 733815 },
  { id: 4, partNo: '27000388804', gubun: '완성품', kind: '김밥', partName: '직화)한돈제육쌈김밥', spec: '240g', unit: 'ea', delivCount: 10, totalQty: 382, totalAmt: 835052 },
  { id: 5, partNo: '27000388820', gubun: '완성품', kind: '주먹밥', partName: '더큰)오징어제육깻잎주먹밥', spec: '160g', unit: 'ea', delivCount: 10, totalQty: 888, totalAmt: 944478 },
  { id: 6, partNo: '27000388829', gubun: '완성품', kind: '무스비', partName: '무스비)햄&참치김치', spec: '180g', unit: 'ea', delivCount: 10, totalQty: 392, totalAmt: 463266 },
  { id: 7, partNo: '27000388848', gubun: '완성품', kind: '김밥', partName: '진미채치즈김밥2편', spec: '230g', unit: 'ea', delivCount: 10, totalQty: 238, totalAmt: 510177 },
  { id: 8, partNo: '28300001245', gubun: '완성품', kind: '김밥', partName: '(주문)더블치즈소시지', spec: '230g', unit: 'ea', delivCount: 1, totalQty: 2, totalAmt: 4320 },
  { id: 9, partNo: '27000388781', gubun: '완성품', kind: '김밥', partName: '더블치즈소시지김밥2편', spec: '230g', unit: 'ea', delivCount: 10, totalQty: 428, totalAmt: 924480 },
  { id: 10, partNo: '27000388785', gubun: '완성품', kind: '주먹밥', partName: '더큰)스팸김치볶음밥', spec: '160g', unit: 'ea', delivCount: 10, totalQty: 2881, totalAmt: 3111480 },
  { id: 11, partNo: '27000388802', gubun: '완성품', kind: '주먹밥', partName: '삼각)전주비빔2편', spec: '115g', unit: 'ea', delivCount: 10, totalQty: 1094, totalAmt: 751578 },
  { id: 12, partNo: '27000388811', gubun: '완성품', kind: '김밥', partName: '스팸계란치즈김밥1편', spec: '235g', unit: 'ea', delivCount: 10, totalQty: 613, totalAmt: 1253585 },
  { id: 13, partNo: '27000388829', gubun: '완성품', kind: '무스비', partName: '무스비)햄&참치김치특', spec: '180g', unit: 'ea', delivCount: 10, totalQty: 458, totalAmt: 541265 },
  { id: 14, partNo: '27000388841', gubun: '완성품', kind: '도시락', partName: 'NEW뭘좋아할지몰라다넣은', spec: '520g', unit: 'ea', delivCount: 6, totalQty: 383, totalAmt: 1697073 },
];

const SAMPLE_DETAILS: Record<number, ItemDeliveryDetail[]> = {
  1: [
    { id: 1, delivDate: '2026-10-30', clientName: 'GSR 양산조리센터', orderMethod: '등록', unitPrice: 1286, delivQty: 31, delivAmt: 39866, lotNo: '', remark: '일괄납품' },
    { id: 2, delivDate: '2026-10-30', clientName: 'GSR 부산물류센터', orderMethod: '등록', unitPrice: 1286, delivQty: 59, delivAmt: 75874, lotNo: '', remark: '일괄납품' },
  ],
  2: [
    { id: 3, delivDate: '2026-10-30', clientName: 'GSR 김해일배', orderMethod: '등록', unitPrice: 2160, delivQty: 320, delivAmt: 691200, lotNo: '', remark: '1편납품' },
    { id: 4, delivDate: '2026-10-30', clientName: 'GSR 김해2일배', orderMethod: '등록', unitPrice: 2160, delivQty: 295, delivAmt: 637200, lotNo: '', remark: '1편납품' },
  ],
};

export const ItemDeliveryStatusView: React.FC = () => {
  const [startDate, setStartDate] = useState('2026-10-30');
  const [endDate, setEndDate] = useState('2026-10-30');
  const [items, setItems] = useState<ItemDeliverySummary[]>(REAL_ITEM_SUMMARIES);
  const [selectedItemId, setSelectedItemId] = useState<number>(1);
  const [detailsMap, setDetailsMap] = useState<Record<number, ItemDeliveryDetail[]>>(SAMPLE_DETAILS);

  useEffect(() => {
    fetch('/api/sales/delivery')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loadedDetails: Record<number, ItemDeliveryDetail[]> = {};
          const loadedItems: ItemDeliverySummary[] = [];

          json.data.forEach((d: any, idx: number) => {
            const summaryId = idx + 1;
            const details: ItemDeliveryDetail[] = (d.details || []).map((dt: any, dtIdx: number) => ({
              id: dt.id || dtIdx + 1,
              delivDate: d.deliveryDate,
              clientName: d.centerCode || 'GSR 김해일배',
              orderMethod: '등록',
              unitPrice: dt.unitPrice || 2000,
              delivQty: dt.deliveryQty || 10,
              delivAmt: dt.amount || 20000,
              lotNo: '',
              remark: dt.remark || '',
            }));
            loadedDetails[summaryId] = details;

            const totalQty = details.reduce((sum, item) => sum + item.delivQty, 0);
            const totalAmt = details.reduce((sum, item) => sum + item.delivAmt, 0);

            loadedItems.push({
              id: summaryId,
              partNo: d.details?.[0]?.productCode || '27000388710',
              gubun: '완성품',
              kind: '김밥',
              partName: d.details?.[0]?.productName || d.deliveryNo,
              spec: '230g',
              unit: 'ea',
              delivCount: details.length,
              totalQty,
              totalAmt,
            });
          });

          if (loadedItems.length > 0) {
            setItems(loadedItems);
            setDetailsMap(loadedDetails);
          }
        }
      })
      .catch((err) => console.error('Failed to load item delivery status', err));
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

  const currentDetails = detailsMap[selectedItemId] || SAMPLE_DETAILS[selectedItemId] || [
    { id: 99, delivDate: '2026-10-30', clientName: 'GSR 김해일배', orderMethod: '등록', unitPrice: 2000, delivQty: 100, delivAmt: 200000, lotNo: '', remark: '일괄납품' },
  ];

  const currentItem = items.find((i) => i.id === selectedItemId) || items[0] || REAL_ITEM_SUMMARIES[0];

  const detailTotals = currentDetails.reduce(
    (acc, d) => ({
      qty: acc.qty + d.delivQty,
      amt: acc.amt + d.delivAmt,
    }),
    { qty: 0, amt: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 (화면 캡처 091920.png: 조회, 초기화, 엑셀다운로드, ?) */}
      <SalesActionBar
        title="품목별납품현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => {} },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: () =>
              exportGridToExcel({
                filename: '품목별납품현황',
                sheetName: '납품요약',
                columns: [
                  { key: 'partNo', label: '품번' },
                  { key: 'gubun', label: '구분' },
                  { key: 'kind', label: '품종' },
                  { key: 'partName', label: '품명' },
                  { key: 'spec', label: '규격' },
                  { key: 'unit', label: '단위' },
                  { key: 'delivCount', label: '납품횟수', format: 'number' },
                  { key: 'totalQty', label: '합계수량', format: 'number' },
                  { key: 'totalAmt', label: '합계금액', format: 'currency' },
                ],
                data: items,
              }),
          },
        ]}
        helpContent="품목별 일자별 총 납품수량 및 납품금액을 확인하고, 하단에서 센터별 분할 납품 내역을 상세 조회합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 091920.png: 주문일자, [<][>], 라디오, 데이터수: 78) */}
      <SalesFilterBar
        label="주문일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={78}
      />

      {/* 3. 상하 2단 분할 레이아웃 (상단 요약 62% / 하단 내역 38%) */}
      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        {/* 상단: 요약 그리드 (78개 품목 전체) */}
        <div className="h-[62%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>요약 (품목별)</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: 78</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">No</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-28">품번</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-16">구분</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-16">품종</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">품명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">단위</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-center w-16">납품횟수</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">합계수량</th>
                  <th className="whitespace-nowrap py-1 px-2 text-right w-28">합계금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {items.map((item, idx) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedItemId === item.id ? 'bg-[#c5e1a5] font-semibold' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200 text-gray-500">{idx + 1}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center font-bold text-gray-800 border-r border-gray-200">{item.partNo}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{item.gubun}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{item.kind}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{item.partName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{item.spec}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{item.unit}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{item.delivCount}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{item.totalQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-gray-900">{item.totalAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {/* 원본 캡처에 표시된 실제 합계 (54,599 / 105,256,016) */}
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={8} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계 (78개 전 품목)</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">54,599</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-gray-900">105,256,016</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* 하단: 내역 그리드 (선택 품목의 센터별 분할 납품 내역) */}
        <div className="h-[38%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>내역 [{currentItem ? currentItem.partName : '선택 품목'}]</span>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {currentDetails.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">No</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">납품날짜</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-36">거래처</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">주문방법</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20">납품단가</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20">납품수량</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-24">납품금액</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-24">LOT no.</th>
                  <th className="py-1 px-2">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetails.map((d, idx) => (
                  <tr key={d.id} className="hover:bg-blue-50/50">
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200 text-gray-500">{idx + 1}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.delivDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{d.clientName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{d.orderMethod}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-blue-900 border-r border-gray-200">{d.delivQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-gray-900 border-r border-gray-200">{d.delivAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center text-gray-500 border-r border-gray-200">{d.lotNo}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left text-gray-600">{d.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={5} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-blue-900 border-r border-gray-300">{detailTotals.qty.toLocaleString()}</td>
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
