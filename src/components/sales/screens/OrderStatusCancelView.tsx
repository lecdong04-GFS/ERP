'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { Plus } from 'lucide-react';
import { SALES_PRODUCT_MASTER } from '../data/salesMasterData';
import { erpConfirm } from '@/context/ConfirmContext';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface OrderHeaderRow {
  id: number;
  checked: boolean;
  orderDate: string;    // 주문일
  delivDate: string;    // 납품날짜
  orderSeq: number;     // 차수
  orderId: string;      // 주문id
  regType: string;      // 등록타입
  clientName: string;   // 거래처명
  shift: string;        // 편수
  orderQty: number;     // 주문수량
  orderAmt: number;     // 주문금액
  delivAmt: number;     // 납품금액
  unDelivAmt: number;   // 미납품금액
}

interface OrderDetailRow {
  id: number;
  gubun: string;        // 구분
  kind: string;         // 품종
  partName: string;     // 품명
  spec: string;         // 규격
  unit: string;         // 단위
  orderQty: number;     // 주문수량
  delivQty: number;     // 납품수량
  unDelivQty: number;   // 미납품수량
  unitPrice: number;    // 납품단가
  orderAmt: number;     // 주문금액
  delivAmt: number;     // 납품금액
  unDelivAmt: number;   // 미납품금액
  delivDate: string;    // 납품일
  lotNo: string;        // LOT no.
  remark: string;       // 비고
}

const INITIAL_HEADERS: OrderHeaderRow[] = [
  { id: 1, checked: false, orderDate: '2026-10-30', delivDate: '2026-10-30', orderSeq: 1, orderId: 'ORD-20261030-01', regType: 'EDI정기', clientName: 'GSR 김해일배', shift: '1편', orderQty: 1250, orderAmt: 3125000, delivAmt: 3125000, unDelivAmt: 0 },
  { id: 2, checked: false, orderDate: '2026-10-30', delivDate: '2026-10-30', orderSeq: 1, orderId: 'ORD-20261030-02', regType: 'EDI정기', clientName: 'GSR 양산조리센터', shift: '1편', orderQty: 850, orderAmt: 2125000, delivAmt: 2125000, unDelivAmt: 0 },
  { id: 3, checked: false, orderDate: '2026-10-30', delivDate: '2026-10-30', orderSeq: 2, orderId: 'ORD-20261030-03', regType: '개별추가', clientName: 'GSR 부산물류센터', shift: '1편', orderQty: 450, orderAmt: 980000, delivAmt: 980000, unDelivAmt: 0 },
  { id: 4, checked: false, orderDate: '2026-10-30', delivDate: '2026-10-30', orderSeq: 1, orderId: 'ORD-20261030-04', regType: 'EDI정기', clientName: 'GSR 신광주 저온', shift: '2편', orderQty: 920, orderAmt: 2300000, delivAmt: 2300000, unDelivAmt: 0 },
  { id: 5, checked: false, orderDate: '2026-10-30', delivDate: '2026-10-30', orderSeq: 2, orderId: 'ORD-20261030-05', regType: '개별추가', clientName: 'GSR 해인 CVS', shift: '2편', orderQty: 320, orderAmt: 800000, delivAmt: 750000, unDelivAmt: 50000 },
];

const INITIAL_DETAILS: Record<number, OrderDetailRow[]> = {
  1: [
    { id: 101, gubun: '완성품', kind: '김밥', partName: '넷플)더담은K떡볶이김밥', spec: '240g', unit: 'ea', orderQty: 500, delivQty: 500, unDelivQty: 0, unitPrice: 2545, orderAmt: 1272500, delivAmt: 1272500, unDelivAmt: 0, delivDate: '2026-10-30', lotNo: 'LOT-261030-01', remark: '정상출고' },
    { id: 102, gubun: '완성품', kind: '김밥', partName: '더블치즈소시지김밥1편', spec: '230g', unit: 'ea', orderQty: 450, delivQty: 450, unDelivQty: 0, unitPrice: 2160, orderAmt: 972000, delivAmt: 972000, unDelivAmt: 0, delivDate: '2026-10-30', lotNo: 'LOT-261030-02', remark: '정상출고' },
    { id: 103, gubun: '완성품', kind: '도시락', partName: '혜자)돌아온제육도시락', spec: '460g', unit: 'ea', orderQty: 300, delivQty: 300, unDelivQty: 0, unitPrice: 3915, orderAmt: 1174500, delivAmt: 1174500, unDelivAmt: 0, delivDate: '2026-10-30', lotNo: 'LOT-261030-03', remark: '정상출고' },
  ],
  2: [
    { id: 201, gubun: '완성품', kind: '햄버거', partName: '착한1900핫도그(양배추)', spec: '130g', unit: 'ea', orderQty: 400, delivQty: 400, unDelivQty: 0, unitPrice: 1286, orderAmt: 514400, delivAmt: 514400, unDelivAmt: 0, delivDate: '2026-10-30', lotNo: 'LOT-261030-04', remark: '정상' },
    { id: 202, gubun: '완성품', kind: '주먹밥', partName: '더큰)오징어제육깻잎주먹밥', spec: '160g', unit: 'ea', orderQty: 450, delivQty: 450, unDelivQty: 0, unitPrice: 1064, orderAmt: 478800, delivAmt: 478800, unDelivAmt: 0, delivDate: '2026-10-30', lotNo: 'LOT-261030-05', remark: '정상' },
  ],
  3: [
    { id: 301, gubun: '완성품', kind: '김밥', partName: '불고기치즈김밥2편', spec: '235g', unit: 'ea', orderQty: 250, delivQty: 250, unDelivQty: 0, unitPrice: 2127, orderAmt: 531750, delivAmt: 531750, unDelivAmt: 0, delivDate: '2026-10-30', lotNo: 'LOT-261030-06', remark: '' },
    { id: 302, gubun: '완성품', kind: '무스비', partName: '무스비)햄&참치김치', spec: '180g', unit: 'ea', orderQty: 200, delivQty: 200, unDelivQty: 0, unitPrice: 1182, orderAmt: 236400, delivAmt: 236400, unDelivAmt: 0, delivDate: '2026-10-30', lotNo: 'LOT-261030-07', remark: '' },
  ],
  4: [
    { id: 401, gubun: '완성품', kind: '주먹밥', partName: '더큰)스팸김치볶음밥', spec: '160g', unit: 'ea', orderQty: 500, delivQty: 500, unDelivQty: 0, unitPrice: 1080, orderAmt: 540000, delivAmt: 540000, unDelivAmt: 0, delivDate: '2026-10-30', lotNo: 'LOT-261030-08', remark: '' },
    { id: 402, gubun: '완성품', kind: '도시락', partName: '혜자)통등심돈까스도시락', spec: '480g', unit: 'ea', orderQty: 420, delivQty: 420, unDelivQty: 0, unitPrice: 4900, orderAmt: 2058000, delivAmt: 2058000, unDelivAmt: 0, delivDate: '2026-10-30', lotNo: 'LOT-261030-09', remark: '' },
  ],
  5: [
    { id: 501, gubun: '완성품', kind: '김밥', partName: '직화)한돈제육쌈김밥', spec: '240g', unit: 'ea', orderQty: 320, delivQty: 300, unDelivQty: 20, unitPrice: 2186, orderAmt: 699520, delivAmt: 655800, unDelivAmt: 43720, delivDate: '2026-10-30', lotNo: 'LOT-261030-10', remark: '부분납품' },
  ],
};

export const OrderStatusCancelView: React.FC = () => {
  const [startDate, setStartDate] = useState('2026-10-30');
  const [endDate, setEndDate] = useState('2026-10-30');
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [headers, setHeaders] = useState<OrderHeaderRow[]>(INITIAL_HEADERS);
  const [selectedHeaderId, setSelectedHeaderId] = useState<number>(1);
  const [details, setDetails] = useState<Record<number, OrderDetailRow[]>>(INITIAL_DETAILS);

  useEffect(() => {
    fetch('/api/sales/order')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const newHeaders: OrderHeaderRow[] = [];
          const newDetails: Record<number, OrderDetailRow[]> = {};

          res.data.forEach((so: any, idx: number) => {
            const hId = so.id || idx + 1;
            const items = so.details || [];
            const totalAmt = so.totalAmount || items.reduce((s: number, i: any) => s + (i.amount || 0), 0);
            const totalQty = so.totalQty || items.reduce((s: number, i: any) => s + (i.totalQty || 0), 0);

            newHeaders.push({
              id: hId,
              checked: false,
              orderDate: so.orderDate,
              delivDate: so.orderDate,
              orderSeq: idx + 1,
              orderId: so.orderNo,
              regType: so.uploadMethod || 'EDI정기',
              clientName: so.centerCode === 'GSR-001' ? 'GSR 김해일배' : so.centerCode,
              shift: so.shift || '1편',
              orderQty: totalQty,
              orderAmt: totalAmt,
              delivAmt: totalAmt,
              unDelivAmt: 0,
            });

            newDetails[hId] = items.map((it: any, itIdx: number) => ({
              id: it.id || itIdx + 1,
              gubun: it.product?.category || '완성품',
              kind: it.product?.kind || '김밥',
              partName: it.product?.name || '제품',
              spec: it.product?.spec || '-',
              unit: it.product?.unit || 'ea',
              orderQty: it.totalQty || 0,
              delivQty: it.totalQty || 0,
              unDelivQty: 0,
              unitPrice: it.unitPrice || 0,
              orderAmt: it.amount || 0,
              delivAmt: it.amount || 0,
              unDelivAmt: 0,
              delivDate: so.orderDate,
              lotNo: `LOT-${so.orderDate.replace(/-/g, '')}-${itIdx + 1}`,
              remark: it.remark || '',
            }));
          });

          setHeaders(newHeaders);
          setDetails(newDetails);
          if (newHeaders.length > 0) {
            setSelectedHeaderId(newHeaders[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to load sales orders from DB:', err));
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

  const currentDetailList = details[selectedHeaderId] || [];

  const handleSelectAllHeaders = (checked: boolean) => {
    setHeaders((prev) => prev.map((h) => ({ ...h, checked })));
  };

  const handleToggleHeader = (id: number) => {
    setHeaders((prev) =>
      prev.map((h) => (h.id === id ? { ...h, checked: !h.checked } : h))
    );
  };

  const handleDeleteSelected = async () => {
    const toDelete = headers.filter((h) => h.checked);
    if (toDelete.length === 0) {
      alert('삭제할 주문 항목을 선택하세요.');
      return;
    }
    const ok = await erpConfirm(`선택된 ${toDelete.length}건의 주문을 삭제하시겠습니까?`, '주문 삭제 확인', 'danger');
    if (ok) {
      setHeaders((prev) => prev.filter((h) => !h.checked));
      alert('선택된 주문이 삭제되었습니다. 삭제 후 [저장]을 눌러주세요.');
    }
  };

  const handleSave = () => {
    alert('주문현황 변경사항이 성공적으로 저장되었습니다.');
  };

  const handleAddDetail = () => {
    const newId = Date.now();
    const newItem: OrderDetailRow = {
      id: newId,
      gubun: '완성품',
      kind: '김밥',
      partName: '신규추가품목',
      spec: '200g',
      unit: 'ea',
      orderQty: 50,
      delivQty: 50,
      unDelivQty: 0,
      unitPrice: 2000,
      orderAmt: 100000,
      delivAmt: 100000,
      unDelivAmt: 0,
      delivDate: '2026-10-30',
      lotNo: `LOT-261030-${newId.toString().slice(-2)}`,
      remark: '수기추가',
    };
    setDetails((prev) => ({
      ...prev,
      [selectedHeaderId]: [...(prev[selectedHeaderId] || []), newItem],
    }));
  };

  // Header sum
  const headerTotals = headers.reduce(
    (acc, h) => ({
      qty: acc.qty + h.orderQty,
      orderAmt: acc.orderAmt + h.orderAmt,
      delivAmt: acc.delivAmt + h.delivAmt,
      unDelivAmt: acc.unDelivAmt + h.unDelivAmt,
    }),
    { qty: 0, orderAmt: 0, delivAmt: 0, unDelivAmt: 0 }
  );

  // Detail sum
  const detailTotals = currentDetailList.reduce(
    (acc, d) => ({
      orderQty: acc.orderQty + d.orderQty,
      delivQty: acc.delivQty + d.delivQty,
      unDelivQty: acc.unDelivQty + d.unDelivQty,
      orderAmt: acc.orderAmt + d.orderAmt,
      delivAmt: acc.delivAmt + d.delivAmt,
      unDelivAmt: acc.unDelivAmt + d.unDelivAmt,
    }),
    { orderQty: 0, delivQty: 0, unDelivQty: 0, orderAmt: 0, delivAmt: 0, unDelivAmt: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 (화면 캡처 091521.png: 조회, 저장, 주문삭제, 초기화, ?) */}
      <SalesActionBar
        title="주문현황/취소"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'save', label: '저장', icon: 'save', variant: 'secondary', onClick: handleSave },
          { key: 'delete', label: '주문삭제', icon: 'delete', variant: 'danger', onClick: handleDeleteSelected },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setHeaders(INITIAL_HEADERS) },
        ]}
        helpContent="접수된 전체 GS리테일 주문 건의 현황을 모니터링하고, 취소 및 개별 품목 삭제를 처리합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 091521.png: 주문일자 [<][>] 라디오 [ ]주문취소포함) */}
      <SalesFilterBar
        label="주문일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={headers.length}
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

      {/* 3. 상하 2단 분할 레이아웃 (상단 요약 45% / 하단 내역 55%) */}
      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        {/* 상단: 요약 그리드 */}
        <div className="h-[46%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>요약</span>
              <label className="flex items-center gap-1 text-[11.5px] font-normal text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  onChange={(e) => handleSelectAllHeaders(e.target.checked)}
                  className="w-3 h-3 text-blue-600"
                />
                <span>전체선택</span>
              </label>
            </div>
            <span className="text-[11.5px] text-gray-500 font-mono">데이터수: {headers.length}</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                <tr>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">선택</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">주문일</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">납품날짜</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-12">차수</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">주문id</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">등록타입</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">거래처명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">편수</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">주문수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">주문금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-24">납품금액</th>
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
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={h.checked}
                        onChange={() => handleToggleHeader(h.id)}
                        className="w-3 h-3 text-blue-600 rounded-xs"
                      />
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{h.orderDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{h.delivDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{h.orderSeq}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-bold text-gray-800 border-r border-gray-200">{h.orderId}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{h.regType}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{h.clientName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{h.shift}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{h.orderQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{h.orderAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{h.delivAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-rose-700 font-bold">{h.unDelivAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={8} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{headerTotals.qty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{headerTotals.orderAmt.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{headerTotals.delivAmt.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-rose-700">{headerTotals.unDelivAmt.toLocaleString()}</td>
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
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">구분</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-16">품종</th>
                  <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">품명</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">규격</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">단위</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">주문수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">납품수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-16">미납품수량</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-18">납품단가</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">주문금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">납품금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] text-right w-20">미납품금액</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-20">납품일</th>
                  <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">LOT no.</th>
                  <th className="whitespace-nowrap py-1 px-2 w-24">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {currentDetailList.map((d) => (
                  <tr key={d.id} className="hover:bg-blue-50/50">
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.gubun}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.kind}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans font-medium text-left border-r border-gray-200">{d.partName}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.spec}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 font-sans text-center border-r border-gray-200">{d.unit}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{d.orderQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{d.delivQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-rose-700 font-bold border-r border-gray-200">{d.unDelivQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.unitPrice.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.orderAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{d.delivAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-rose-700 font-bold border-r border-gray-200">{d.unDelivAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{d.delivDate}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center text-[11.5px] text-gray-600 border-r border-gray-200">{d.lotNo}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left text-gray-600">{d.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td colSpan={5} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{detailTotals.orderQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{detailTotals.delivQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-rose-700 border-r border-gray-300">{detailTotals.unDelivQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 border-r border-gray-300"></td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{detailTotals.orderAmt.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{detailTotals.delivAmt.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-rose-700 border-r border-gray-300">{detailTotals.unDelivAmt.toLocaleString()}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};
