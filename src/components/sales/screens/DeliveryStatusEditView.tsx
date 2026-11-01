'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { exportGridToExcel } from '@/lib/excelExport';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface SummaryRow {
  id: number;
  checked: boolean;
  lastShipDate: string;   // 최종출고일
  orderDate: string;      // 주문일
  status: string;         // 상태
  orderId: string;        // 주문id
  orderMethod: string;    // 주문방법
  regType: string;        // 등록타입
  clientName: string;     // 거래처명
  shift: string;          // 편수
  delivQtyTotal: number;  // 납품수량계
  orderAmtTotal: number;  // 주문금액계
  delivAmtTotal: number;  // 납품금액계
  unDelivAmtTotal: number;// 미납품금액계
  poNo: string;           // po_no
}

interface LeftDetailRow {
  id: number;
  checked: boolean;
  status: string;         // 상태
  kind: string;           // 품종
  partName: string;       // 품명
  spec: string;           // 규격
  unit: string;           // 단위
  orderQty: number;       // 주문수량
  delivQty: number;       // 납품수량
  delivCount: number;     // 납품횟수
  unitPrice: number;      // 납품단가
  orderAmt: number;       // 주문금액
  delivAmt: number;       // 납품금액
  unDelivAmt: number;     // 미납품금액
}

interface RightDetailRow {
  id: number;
  checked: boolean;
  delivDate: string;      // 납품일자
  delivQty: number;       // 납품수량
  delivAmt: number;       // 납품금액
}

const INITIAL_SUMMARIES: SummaryRow[] = [
  { id: 1, checked: false, lastShipDate: '2026-10-30', orderDate: '2026-10-29', status: '출고완료', orderId: 'ORD-261029-01', orderMethod: 'EDI등록', regType: '정기발주', clientName: 'GSR 김해일배', shift: '1편', delivQtyTotal: 2450, orderAmtTotal: 5880000, delivAmtTotal: 5880000, unDelivAmtTotal: 0, poNo: 'PO-261029-G01' },
  { id: 2, checked: false, lastShipDate: '2026-10-30', orderDate: '2026-10-29', status: '출고완료', orderId: 'ORD-261029-02', orderMethod: 'EDI등록', regType: '정기발주', clientName: 'GSR 양산조리센터', shift: '1편', delivQtyTotal: 1800, orderAmtTotal: 4320000, delivAmtTotal: 4320000, unDelivAmtTotal: 0, poNo: 'PO-261029-G02' },
  { id: 3, checked: false, lastShipDate: '2026-10-30', orderDate: '2026-10-29', status: '출고완료', orderId: 'ORD-261029-03', orderMethod: 'EDI등록', regType: '정기발주', clientName: 'GSR 부산물류센터', shift: '1편', delivQtyTotal: 3200, orderAmtTotal: 7680000, delivAmtTotal: 7680000, unDelivAmtTotal: 0, poNo: 'PO-261029-G03' },
  { id: 4, checked: false, lastShipDate: '2026-10-30', orderDate: '2026-10-29', status: '출고완료', orderId: 'ORD-261029-04', orderMethod: 'EDI등록', regType: '정기발주', clientName: 'GSR 신광주 저온', shift: '2편', delivQtyTotal: 1450, orderAmtTotal: 3480000, delivAmtTotal: 3480000, unDelivAmtTotal: 0, poNo: 'PO-261029-G04' },
];

const INITIAL_LEFT_DETAILS: Record<number, LeftDetailRow[]> = {
  1: [
    { id: 101, checked: false, status: '완료', kind: '김밥', partName: '넷플)더담은K떡볶이김밥', spec: '240g', unit: 'ea', orderQty: 800, delivQty: 800, delivCount: 1, unitPrice: 2545, orderAmt: 2036000, delivAmt: 2036000, unDelivAmt: 0 },
    { id: 102, checked: false, status: '완료', kind: '김밥', partName: '더블치즈소시지김밥1편', spec: '230g', unit: 'ea', orderQty: 850, delivQty: 850, delivCount: 1, unitPrice: 2160, orderAmt: 1836000, delivAmt: 1836000, unDelivAmt: 0 },
    { id: 103, checked: false, status: '완료', kind: '도시락', partName: '혜자)돌아온제육도시락', spec: '460g', unit: 'ea', orderQty: 800, delivQty: 800, delivCount: 1, unitPrice: 3915, orderAmt: 3132000, delivAmt: 3132000, unDelivAmt: 0 },
  ],
  2: [
    { id: 201, checked: false, status: '완료', kind: '햄버거', partName: '착한1900핫도그(양배추)', spec: '130g', unit: 'ea', orderQty: 900, delivQty: 900, delivCount: 1, unitPrice: 1286, orderAmt: 1157400, delivAmt: 1157400, unDelivAmt: 0 },
    { id: 202, checked: false, status: '완료', kind: '주먹밥', partName: '더큰)오징어제육깻잎주먹밥', spec: '160g', unit: 'ea', orderQty: 900, delivQty: 900, delivCount: 1, unitPrice: 1064, orderAmt: 957600, delivAmt: 957600, unDelivAmt: 0 },
  ],
  3: [
    { id: 301, checked: false, status: '완료', kind: '김밥', partName: '불고기치즈김밥2편', spec: '235g', unit: 'ea', orderQty: 1600, delivQty: 1600, delivCount: 1, unitPrice: 2127, orderAmt: 3403200, delivAmt: 3403200, unDelivAmt: 0 },
    { id: 302, checked: false, status: '완료', kind: '도시락', partName: '혜자)통등심돈까스도시락', spec: '480g', unit: 'ea', orderQty: 1600, delivQty: 1600, delivCount: 1, unitPrice: 4900, orderAmt: 7840000, delivAmt: 7840000, unDelivAmt: 0 },
  ],
  4: [
    { id: 401, checked: false, status: '완료', kind: '주먹밥', partName: '더큰)스팸김치볶음밥', spec: '160g', unit: 'ea', orderQty: 1450, delivQty: 1450, delivCount: 1, unitPrice: 1080, orderAmt: 1566000, delivAmt: 1566000, unDelivAmt: 0 },
  ],
};

const INITIAL_RIGHT_DETAILS: Record<number, RightDetailRow[]> = {
  101: [{ id: 1, checked: false, delivDate: '2026-10-30', delivQty: 800, delivAmt: 2036000 }],
  102: [{ id: 2, checked: false, delivDate: '2026-10-30', delivQty: 850, delivAmt: 1836000 }],
  103: [{ id: 3, checked: false, delivDate: '2026-10-30', delivQty: 800, delivAmt: 3132000 }],
  201: [{ id: 4, checked: false, delivDate: '2026-10-30', delivQty: 900, delivAmt: 1157400 }],
  202: [{ id: 5, checked: false, delivDate: '2026-10-30', delivQty: 900, delivAmt: 957600 }],
};

export const DeliveryStatusEditView: React.FC = () => {
  const [startDate, setStartDate] = useState('2026-10-30');
  const [endDate, setEndDate] = useState('2026-10-30');
  const [clientFilter, setClientFilter] = useState('ALL');

  const [summaries, setSummaries] = useState<SummaryRow[]>(INITIAL_SUMMARIES);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number>(1);

  const [leftDetails, setLeftDetails] = useState<Record<number, LeftDetailRow[]>>(INITIAL_LEFT_DETAILS);
  const [selectedLeftDetailId, setSelectedLeftDetailId] = useState<number>(101);

  const [rightDetails, setRightDetails] = useState<Record<number, RightDetailRow[]>>(INITIAL_RIGHT_DETAILS);

  useEffect(() => {
    fetch('/api/sales/delivery')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const newSummaries: SummaryRow[] = [];
          const newLeftDetails: Record<number, LeftDetailRow[]> = {};

          res.data.forEach((deliv: any, idx: number) => {
            const dId = deliv.id || idx + 1;
            const items = deliv.details || [];
            const totalAmt = deliv.totalAmount || items.reduce((s: number, i: any) => s + (i.amount || 0), 0);
            const totalQty = deliv.totalQty || items.reduce((s: number, i: any) => s + (i.deliveryQty || 0), 0);

            newSummaries.push({
              id: dId,
              checked: false,
              lastShipDate: deliv.deliveryDate,
              orderDate: deliv.deliveryDate,
              status: deliv.status === '완료' ? '출고완료' : '진행중',
              orderId: deliv.deliveryNo,
              orderMethod: 'EDI등록',
              regType: '정기발주',
              clientName: deliv.centerCode,
              shift: deliv.shift || '1편',
              delivQtyTotal: totalQty,
              orderAmtTotal: totalAmt,
              delivAmtTotal: totalAmt,
              unDelivAmtTotal: 0,
              poNo: `PO-${deliv.deliveryNo.slice(-6)}`,
            });

            newLeftDetails[dId] = items.map((it: any, itIdx: number) => ({
              id: it.id || itIdx + 1,
              checked: false,
              status: '완료',
              kind: '완제품',
              partName: it.productName || it.productCode,
              spec: '규격',
              unit: 'ea',
              orderQty: it.deliveryQty,
              delivQty: it.deliveryQty,
              delivCount: 1,
              unitPrice: it.unitPrice,
              orderAmt: it.amount,
              delivAmt: it.amount,
              unDelivAmt: 0,
            }));
          });

          setSummaries(newSummaries);
          setLeftDetails(newLeftDetails);
          if (newSummaries.length > 0) {
            setSelectedSummaryId(newSummaries[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to load deliveries from DB:', err));
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

  const currentLeftList = leftDetails[selectedSummaryId] || [];
  const currentRightList = rightDetails[selectedLeftDetailId] || [
    { id: 999, checked: false, delivDate: '2026-10-30', delivQty: 500, delivAmt: 1250000 },
  ];

  const handleDeleteSummary = () => {
    setSummaries((prev) => prev.filter((s) => !s.checked));
    alert('선택된 주문 요약 항목이 삭제되었습니다.');
  };

  const handleDeleteLeftDetail = () => {
    setLeftDetails((prev) => ({
      ...prev,
      [selectedSummaryId]: (prev[selectedSummaryId] || []).filter((d) => !d.checked),
    }));
    alert('선택된 품목 내역이 삭제되었습니다.');
  };

  const handleDeleteRightDetail = () => {
    setRightDetails((prev) => ({
      ...prev,
      [selectedLeftDetailId]: (prev[selectedLeftDetailId] || []).filter((d) => !d.checked),
    }));
    alert('선택된 납품 일자 내역이 삭제되었습니다.');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 (화면 캡처 091807.png: 조회, 저장, 초기화, 엑셀다운로드, ?) */}
      <SalesActionBar
        title="납품현황/수정"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'save', label: '저장', icon: 'save', variant: 'secondary', onClick: () => alert('납품 수정내역이 저장되었습니다.') },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setSummaries(INITIAL_SUMMARIES) },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: () =>
              exportGridToExcel({
                filename: '납품현황_주문별요약',
                sheetName: '납품현황',
                columns: [
                  { key: 'orderId', label: '주문ID' },
                  { key: 'orderDate', label: '주문일', format: 'date' },
                  { key: 'lastShipDate', label: '최종출고일', format: 'date' },
                  { key: 'status', label: '상태' },
                  { key: 'clientName', label: '거래처' },
                  { key: 'totalQty', label: '총수량', format: 'number' },
                  { key: 'totalAmt', label: '총금액', format: 'currency' },
                ],
                data: summaries,
              }),
          },
        ]}
        helpContent="기 등록된 납품 내역을 주문별, 품목별, 납품 차수별로 3단 분할 조회하고 수량 및 납품금액을 수정합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 091807.png: 납품일자, [<][>], 라디오, 거래처: ALL) */}
      <SalesFilterBar
        label="납품일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={summaries.length}
      >
        <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
          <span className="font-semibold text-gray-700 text-[11px]">거래처:</span>
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
      </SalesFilterBar>

      {/* 3. 3-Panel Split View (상단 요약 48% / 하단 2분할 52%) */}
      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        {/* 상단: 요약 그리드 */}
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>요약</span>
              <button
                onClick={handleDeleteSummary}
                className="px-2 py-0.5 bg-gray-200 hover:bg-red-50 hover:text-red-700 text-gray-700 border border-gray-400 rounded text-[11.5px] font-semibold cursor-pointer"
              >
                선택항목삭제
              </button>
            </div>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {summaries.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">최종출고일</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">주문일</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-18">상태</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">주문id</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">주문방법</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">등록타입</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">거래처명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">편수</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">납품수량계</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">주문금액계</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">납품금액계</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">미납품금액계</th>
                  <th className="whitespace-nowrap py-1 px-2 w-28">po_no</th>
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
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={s.checked}
                        onChange={() =>
                          setSummaries((prev) =>
                            prev.map((r) => (r.id === s.id ? { ...r, checked: !r.checked } : r))
                          )
                        }
                        className="w-3 h-3 text-blue-600 rounded-xs"
                      />
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{s.lastShipDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{s.orderDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">
                      <span className="px-1.5 py-0.5 rounded text-[11.5px] bg-emerald-100 text-emerald-800">
                        {s.status}
                      </span>
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-bold text-gray-800 border-r border-gray-200">{s.orderId}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{s.orderMethod}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{s.regType}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{s.clientName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{s.shift}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{s.delivQtyTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{s.orderAmtTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{s.delivAmtTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-gray-500 border-r border-gray-200">{s.unDelivAmtTotal.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center text-gray-700">{s.poNo}</td>
                  </tr>
                ))}
              </tbody>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* 하단 2분할 (좌측: 품목별 내역 68% / 우측: 일자별 납품수량 32%) */}
        <div className="h-[54%] flex gap-1 min-h-0 overflow-hidden">
          {/* 좌하단: 품목별 내역 */}
          <div className="w-[68%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
            <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>내역 (품목별)</span>
                <button
                  onClick={handleDeleteLeftDetail}
                  className="px-2 py-0.5 bg-gray-200 hover:bg-red-50 hover:text-red-700 text-gray-700 border border-gray-400 rounded text-[11.5px] font-semibold cursor-pointer"
                >
                  선택항목삭제
                </button>
              </div>
              <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {currentLeftList.length}</span>
            </div>

            <div className="flex-1 overflow-auto">
              <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">상태</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">품종</th>
                    <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">품명</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">단위</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">주문수량</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">납품수량</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-center w-14">납품횟수</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">납품단가</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">주문금액</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">납품금액</th>
                    <th className="whitespace-nowrap py-1 px-1 text-right w-20">미납품금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {currentLeftList.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedLeftDetailId(d.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedLeftDetailId === d.id ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'
                      }`}
                    >
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={d.checked}
                          onChange={() =>
                            setLeftDetails((prev) => ({
                              ...prev,
                              [selectedSummaryId]: (prev[selectedSummaryId] || []).map((r) =>
                                r.id === d.id ? { ...r, checked: !r.checked } : r
                              ),
                            }))
                          }
                          className="w-3 h-3 text-blue-600 rounded-xs"
                        />
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.status}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.kind}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.spec}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.unit}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-gray-700 border-r border-gray-200">{d.orderQty.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{d.delivQty.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.delivCount}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.orderAmt.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{d.delivAmt.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-gray-400">{d.unDelivAmt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table></EditableTableWrapper>
            </div>
          </div>

          {/* 우하단: 선택 품목의 납품일자별 내역 */}
          <div className="w-[32%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
            <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>내역 (출하일자별)</span>
                <button
                  onClick={handleDeleteRightDetail}
                  className="px-2 py-0.5 bg-gray-200 hover:bg-red-50 hover:text-red-700 text-gray-700 border border-gray-400 rounded text-[11.5px] font-semibold cursor-pointer"
                >
                  선택항목삭제
                </button>
              </div>
              <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {currentRightList.length}</span>
            </div>

            <div className="flex-1 overflow-auto">
              <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">납품일자</th>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">납품수량</th>
                    <th className="whitespace-nowrap py-1 px-2 text-right">납품금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {currentRightList.map((r) => (
                    <tr key={r.id} className="hover:bg-blue-50/50">
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={() =>
                            setRightDetails((prev) => ({
                              ...prev,
                              [selectedLeftDetailId]: (prev[selectedLeftDetailId] || []).map((item) =>
                                item.id === r.id ? { ...item, checked: !item.checked } : item
                              ),
                            }))
                          }
                          className="w-3 h-3 text-blue-600 rounded-xs"
                        />
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{r.delivDate}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{r.delivQty.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-gray-900">{r.delivAmt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table></EditableTableWrapper>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
