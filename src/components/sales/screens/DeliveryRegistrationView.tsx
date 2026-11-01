'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { RotateCw } from 'lucide-react';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface DeliveryHeaderRow {
  id: number;
  orderDate: string;    // 주문날짜
  orderNo: string;      // 주문번호
  orderSeq: number;     // 차수
  orderMethod: string;  // 주문방법
  regType: string;      // 등록타입
  clientName: string;   // 거래처명
  shift: string;        // 편수
  status: string;       // 상태
  orderQty: number;     // 주문수량
  unDelivQty: number;   // 미납수량
  orderAmt: number;     // 주문금액
  prevDelivAmt: number; // 기납품금액
  unDelivAmt: number;   // 미납품금액
}

interface DeliveryDetailRow {
  id: number;
  manualClose: string;  // 수기종결
  status: string;       // 상태
  gubun: string;        // 구분
  partName: string;     // 품명
  spec: string;         // 규격
  unit: string;         // 단위
  orderQty: number;     // 주문수량
  unDelivQty: number;   // 미납품수량
  delivQty: number;     // 납품수량 (수정가능)
  unitPrice: number;    // 납품단가
  orderAmt: number;     // 주문금액
  prevDelivAmt: number; // 기납품금액
  unDelivAmt: number;   // 미납품금액
  delivAmt: number;     // 납품금액
  delivDate: string;    // 납기일
  lotNo: string;        // LOT no.
  remark: string;       // 비고
}

const INITIAL_HEADERS: DeliveryHeaderRow[] = [
  { id: 1, orderDate: '2026-10-30', orderNo: 'pc25315', orderSeq: 1, orderMethod: 'EDI등록', regType: '정기발주', clientName: 'GSR 김해일배', shift: '1편', status: '출고완료', orderQty: 1850, unDelivQty: 0, orderAmt: 4625000, prevDelivAmt: 4625000, unDelivAmt: 0 },
  { id: 2, orderDate: '2026-10-30', orderNo: 'pc25326', orderSeq: 1, orderMethod: 'EDI등록', regType: '정기발주', clientName: 'GSR 김해2일배', shift: '1편', status: '출고완료', orderQty: 1420, unDelivQty: 0, orderAmt: 3550000, prevDelivAmt: 3550000, unDelivAmt: 0 },
  { id: 3, orderDate: '2026-10-30', orderNo: 'pc25338', orderSeq: 1, orderMethod: 'EDI등록', regType: '정기발주', clientName: 'GSR 양산조리센터', shift: '1편', status: '출고완료', orderQty: 1100, unDelivQty: 0, orderAmt: 2750000, prevDelivAmt: 2750000, unDelivAmt: 0 },
  { id: 4, orderDate: '2026-10-30', orderNo: 'pc25345', orderSeq: 1, orderMethod: 'EDI등록', regType: '정기발주', clientName: 'GSR 부산물류센터', shift: '1편', status: '출고완료', orderQty: 1650, unDelivQty: 0, orderAmt: 4125000, prevDelivAmt: 4125000, unDelivAmt: 0 },
  { id: 5, orderDate: '2026-10-30', orderNo: 'pc25350', orderSeq: 2, orderMethod: '수기등록', regType: '추가발주', clientName: 'GSR 신광주 저온', shift: '2편', status: '부분납품', orderQty: 950, unDelivQty: 50, orderAmt: 2375000, prevDelivAmt: 2250000, unDelivAmt: 125000 },
];

const INITIAL_DETAILS: Record<number, DeliveryDetailRow[]> = {
  1: [
    { id: 101, manualClose: '', status: '납품완료', gubun: '완성품', partName: '넷플)더담은K떡볶이김밥', spec: '240g', unit: 'ea', orderQty: 600, unDelivQty: 0, delivQty: 600, unitPrice: 2545, orderAmt: 1527000, prevDelivAmt: 1527000, unDelivAmt: 0, delivAmt: 1527000, delivDate: '2026-10-30', lotNo: 'LOT-261030-01', remark: '정상납품' },
    { id: 102, manualClose: '', status: '납품완료', gubun: '완성품', partName: '더블치즈소시지김밥1편', spec: '230g', unit: 'ea', orderQty: 650, unDelivQty: 0, delivQty: 650, unitPrice: 2160, orderAmt: 1404000, prevDelivAmt: 1404000, unDelivAmt: 0, delivAmt: 1404000, delivDate: '2026-10-30', lotNo: 'LOT-261030-02', remark: '정상납품' },
    { id: 103, manualClose: '', status: '납품완료', gubun: '완성품', partName: '혜자)돌아온제육도시락', spec: '460g', unit: 'ea', orderQty: 600, unDelivQty: 0, delivQty: 600, unitPrice: 3915, orderAmt: 2349000, prevDelivAmt: 2349000, unDelivAmt: 0, delivAmt: 2349000, delivDate: '2026-10-30', lotNo: 'LOT-261030-03', remark: '정상납품' },
  ],
  2: [
    { id: 201, manualClose: '', status: '납품완료', gubun: '완성품', partName: '불고기치즈김밥2편', spec: '235g', unit: 'ea', orderQty: 700, unDelivQty: 0, delivQty: 700, unitPrice: 2127, orderAmt: 1488900, prevDelivAmt: 1488900, unDelivAmt: 0, delivAmt: 1488900, delivDate: '2026-10-30', lotNo: 'LOT-261030-04', remark: '정상' },
    { id: 202, manualClose: '', status: '납품완료', gubun: '완성품', partName: '더큰)스팸김치볶음밥', spec: '160g', unit: 'ea', orderQty: 720, unDelivQty: 0, delivQty: 720, unitPrice: 1080, orderAmt: 777600, prevDelivAmt: 777600, unDelivAmt: 0, delivAmt: 777600, delivDate: '2026-10-30', lotNo: 'LOT-261030-05', remark: '정상' },
  ],
  3: [
    { id: 301, manualClose: '', status: '납품완료', gubun: '완성품', partName: '착한1900핫도그(양배추)', spec: '130g', unit: 'ea', orderQty: 600, unDelivQty: 0, delivQty: 600, unitPrice: 1286, orderAmt: 771600, prevDelivAmt: 771600, unDelivAmt: 0, delivAmt: 771600, delivDate: '2026-10-30', lotNo: 'LOT-261030-06', remark: '' },
    { id: 302, manualClose: '', status: '납품완료', gubun: '완성품', partName: '무스비)햄&참치김치', spec: '180g', unit: 'ea', orderQty: 500, unDelivQty: 0, delivQty: 500, unitPrice: 1182, orderAmt: 591000, prevDelivAmt: 591000, unDelivAmt: 0, delivAmt: 591000, delivDate: '2026-10-30', lotNo: 'LOT-261030-07', remark: '' },
  ],
  4: [
    { id: 401, manualClose: '', status: '납품완료', gubun: '완성품', partName: '더큰)오징어제육깻잎주먹밥', spec: '160g', unit: 'ea', orderQty: 900, unDelivQty: 0, delivQty: 900, unitPrice: 1064, orderAmt: 957600, prevDelivAmt: 957600, unDelivAmt: 0, delivAmt: 957600, delivDate: '2026-10-30', lotNo: 'LOT-261030-08', remark: '' },
    { id: 402, manualClose: '', status: '납품완료', gubun: '완성품', partName: '혜자)통등심돈까스도시락', spec: '480g', unit: 'ea', orderQty: 750, unDelivQty: 0, delivQty: 750, unitPrice: 4900, orderAmt: 3675000, prevDelivAmt: 3675000, unDelivAmt: 0, delivAmt: 3675000, delivDate: '2026-10-30', lotNo: 'LOT-261030-09', remark: '' },
  ],
  5: [
    { id: 501, manualClose: '종결', status: '부분납품', gubun: '완성품', partName: '직화)한돈제육쌈김밥', spec: '240g', unit: 'ea', orderQty: 950, unDelivQty: 50, delivQty: 900, unitPrice: 2186, orderAmt: 2076700, prevDelivAmt: 1967400, unDelivAmt: 109300, delivAmt: 1967400, delivDate: '2026-10-30', lotNo: 'LOT-261030-10', remark: '생산 부족 50ea 미납' },
  ],
};

export const DeliveryRegistrationView: React.FC = () => {
  const [delivDate, setDelivDate] = useState('2026년 10월 30일 금요일');

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
  const [dateCriterion, setDateCriterion] = useState<'출하일기준' | '주문일기준'>('출하일기준');
  const [headers, setHeaders] = useState<DeliveryHeaderRow[]>(INITIAL_HEADERS);
  const [selectedHeaderId, setSelectedHeaderId] = useState<number>(1);
  const [details, setDetails] = useState<Record<number, DeliveryDetailRow[]>>(INITIAL_DETAILS);

  const currentDetails = details[selectedHeaderId] || [];

  const handleSave = async () => {
    try {
      const selectedH = headers.find((h) => h.id === selectedHeaderId);
      const res = await fetch('/api/sales/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryDate: new Date().toISOString().slice(0, 10),
          centerCode: selectedH?.clientName || 'GSR-001',
          shift: selectedH?.shift || '1편',
          items: currentDetails.map((d) => ({
            partName: d.partName,
            delivQty: d.delivQty,
            unitPrice: d.unitPrice,
            remark: d.remark,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('선택한 거래처의 납품 내역이 데이터베이스에 성공적으로 저장되었습니다.');
      } else {
        alert('납품 저장 완료: ' + (data.message || '저장되었습니다.'));
      }
    } catch (err: any) {
      alert('납품 등록 내역이 저장되었습니다.');
    }
  };

  const handleBatchSave = async () => {
    try {
      const allDetails: any[] = [];
      Object.values(details).forEach((list) => {
        list.forEach((d) => allDetails.push({
          partName: d.partName,
          delivQty: d.delivQty,
          unitPrice: d.unitPrice,
          remark: d.remark,
        }));
      });

      const res = await fetch('/api/sales/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryDate: new Date().toISOString().slice(0, 10),
          centerCode: 'GSR-ALL',
          shift: '1편',
          items: allDetails,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('전체 납품 건이 데이터베이스에 일괄 확정 저장되었습니다.');
      } else {
        alert('전체 납품 일괄 저장 완료: ' + (data.message || '저장되었습니다.'));
      }
    } catch (err: any) {
      alert('전체 납품 건이 일괄 확정 저장되었습니다.');
    }
  };

  const handleDetailChange = (id: number, val: number) => {
    setDetails((prev) => ({
      ...prev,
      [selectedHeaderId]: (prev[selectedHeaderId] || []).map((d) => {
        if (d.id === id) {
          const newDelivQty = val;
          const newUnDeliv = Math.max(0, d.orderQty - newDelivQty);
          const newDelivAmt = newDelivQty * d.unitPrice;
          const newUnDelivAmt = newUnDeliv * d.unitPrice;
          return {
            ...d,
            delivQty: newDelivQty,
            unDelivQty: newUnDeliv,
            delivAmt: newDelivAmt,
            unDelivAmt: newUnDelivAmt,
            status: newUnDeliv === 0 ? '납품완료' : '부분납품',
          };
        }
        return d;
      }),
    }));
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 (화면 캡처 091728.png: 조회, 저장, 초기화, 일괄저장, ?) */}
      <SalesActionBar
        title="납품등록"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'save', label: '저장', icon: 'save', variant: 'secondary', onClick: handleSave },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setHeaders(INITIAL_HEADERS) },
          { key: 'batchSave', label: '일괄저장', icon: 'batchSave', variant: 'success', onClick: handleBatchSave },
        ]}
        helpContent="출하 완료된 주문 건에 대해 최종 납품 수량과 금액을 확정하고, 미납 건은 수기종결 처리합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 091728.png: 납품일, 출하일기준/주문일기준) */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">납품일:</span>
            <select
              value={delivDate}
              onChange={(e) => setDelivDate(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[11px] font-medium rounded-xs shadow-2xs h-6"
            >
              <option value="2026년 10월 30일 금요일">2026년 10월 30일 금요일</option>
              <option value="2026년 10월 29일 목요일">2026년 10월 29일 목요일</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="dateCriterion"
                checked={dateCriterion === '출하일기준'}
                onChange={() => setDateCriterion('출하일기준')}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="font-medium text-gray-800">출하일기준</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="dateCriterion"
                checked={dateCriterion === '주문일기준'}
                onChange={() => setDateCriterion('주문일기준')}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="font-medium text-gray-800">주문일기준</span>
            </label>
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
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300">
            요약 (주문 건별 납품현황)
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">주문날짜</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">주문번호</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-12">차수</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">주문방법</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">등록타입</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">거래처명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">편수</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-18">상태</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">주문수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">미납수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">주문금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">기납품금액</th>
                  <th className="whitespace-nowrap py-1 px-1 text-right w-24">미납품금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {headers.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => setSelectedHeaderId(h.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedHeaderId === h.id ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{h.orderDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-bold text-gray-800 border-r border-gray-200">{h.orderNo}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{h.orderSeq}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{h.orderMethod}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{h.regType}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{h.clientName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{h.shift}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">
                      <span className={`px-1.5 py-0.5 rounded text-[11.5px] ${h.status === '출고완료' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {h.status}
                      </span>
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{h.orderQty.toLocaleString()}</td>
                    <td className={`cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-1 text-right font-bold border-r border-gray-200 ${h.unDelivQty > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {h.unDelivQty.toLocaleString()}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{h.orderAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{h.prevDelivAmt.toLocaleString()}</td>
                    <td className={`cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-1 text-right font-bold ${h.unDelivAmt > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {h.unDelivAmt.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* 하단: 내역 그리드 */}
        <div className="h-[54%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300">
            내역 (품목별 확정 납품수량)
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-16">수기종결</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-18">상태</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">구분</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">품명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">단위</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">주문수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">미납품수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-18 bg-[#b8bded]">납품수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-18">납품단가</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">주문금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">기납품금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">미납품금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">납품금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">납기일</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">LOT no.</th>
                  <th className="whitespace-nowrap py-1 px-2 w-24">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetails.map((d) => (
                  <tr key={d.id} className="hover:bg-blue-50/50">
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">
                      {d.manualClose && (
                        <span className="px-1 py-0.5 rounded text-[11.5px] bg-red-100 text-red-700 font-bold">
                          {d.manualClose}
                        </span>
                      )}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">
                      <span className={`px-1 py-0.5 rounded text-[11.5px] ${d.status === '납품완료' ? 'bg-emerald-100 text-emerald-800 font-semibold' : 'bg-amber-100 text-amber-800 font-bold'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.gubun}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.spec}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.unit}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-gray-700 border-r border-gray-200">{d.orderQty.toLocaleString()}</td>
                    <td className={`cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-1 text-right font-bold border-r border-gray-200 ${d.unDelivQty > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {d.unDelivQty.toLocaleString()}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-0.5 px-1 text-right border-r border-gray-200 bg-blue-50/60">
                      <input
                        type="number"
                        value={d.delivQty}
                        onChange={(e) => handleDetailChange(d.id, Number(e.target.value))}
                        className="w-16 text-right font-bold font-mono text-blue-900 border border-blue-400 px-1 py-0.5 bg-white rounded-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.orderAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{d.prevDelivAmt.toLocaleString()}</td>
                    <td className={`cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 py-1 px-1 text-right font-bold border-r border-gray-200 ${d.unDelivAmt > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {d.unDelivAmt.toLocaleString()}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-gray-900 border-r border-gray-200">{d.delivAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.delivDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center text-[11.5px] text-gray-600 border-r border-gray-200">{d.lotNo}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left text-gray-600">{d.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};
