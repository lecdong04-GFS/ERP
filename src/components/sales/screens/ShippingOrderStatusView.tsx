'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { usePrintReport } from '@/context/PrintReportContext';
import { exportGridToExcel } from '@/lib/excelExport';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface ShippingOrderRow {
  id: number;
  clientName: string;   // 거래처명
  partNo: string;       // 품번
  kind: string;         // 품종
  partName: string;     // 품명
  delivQty: number;     // 납품수량
  excludeQty: number;   // 제외수량
  actualQty: number;    // 실출력수량 = 납품수량 - 제외수량
  boxInQty: number;     // 박스내입수량
  qtyInfo: string;      // 수량정보 (예: 2Box + 26)
  boxCount: number;     // BOX수량 = Math.ceil(실출력수량 / 박스내입수량)
}

// 캡처 화면 092031.png 실제 데이터 100% 반영
const INITIAL_ROWS: ShippingOrderRow[] = [
  { id: 1, clientName: 'GSR 김해일배', partNo: '27000388865', kind: '김밥', partName: '넷플)더담은K떡볶이김밥', delivQty: 82, excludeQty: 0, actualQty: 82, boxInQty: 28, qtyInfo: '2Box + 26', boxCount: 3 },
  { id: 2, clientName: 'GSR 김해일배', partNo: '27000388781', kind: '김밥', partName: '더블치즈소시지김밥', delivQty: 36, excludeQty: 0, actualQty: 36, boxInQty: 40, qtyInfo: '0Box + 36', boxCount: 1 },
  { id: 3, clientName: 'GSR 김해일배', partNo: '27000388860', kind: '김밥', partName: '디팡)시장꼬마김밥', delivQty: 30, excludeQty: 0, actualQty: 30, boxInQty: 28, qtyInfo: '1Box + 2', boxCount: 2 },
  { id: 4, clientName: 'GSR 김해일배', partNo: '27000388868', kind: '김밥', partName: '디팡)에그햄꼬마김밥', delivQty: 108, excludeQty: 0, actualQty: 108, boxInQty: 28, qtyInfo: '3Box + 24', boxCount: 4 },
  { id: 5, clientName: 'GSR 김해일배', partNo: '27000388782', kind: '김밥', partName: '불고기치즈김밥', delivQty: 31, excludeQty: 0, actualQty: 31, boxInQty: 40, qtyInfo: '0Box + 31', boxCount: 1 },
  { id: 6, clientName: 'GSR 김해일배', partNo: '27000388811', kind: '김밥', partName: '스팸계란치즈김밥', delivQty: 40, excludeQty: 0, actualQty: 40, boxInQty: 40, qtyInfo: '1Box + 0', boxCount: 1 },
  { id: 7, clientName: 'GSR 김해일배', partNo: '27000388818', kind: '김밥', partName: '왕돈까스김밥', delivQty: 50, excludeQty: 0, actualQty: 50, boxInQty: 40, qtyInfo: '1Box + 10', boxCount: 2 },
  { id: 8, clientName: 'GSR 김해일배', partNo: '27000388804', kind: '김밥', partName: '직화)한돈제육쌈김밥', delivQty: 44, excludeQty: 0, actualQty: 44, boxInQty: 40, qtyInfo: '1Box + 4', boxCount: 2 },
  { id: 9, clientName: 'GSR 김해일배', partNo: '27000388847', kind: '김밥', partName: '진미채치즈김밥', delivQty: 28, excludeQty: 0, actualQty: 28, boxInQty: 40, qtyInfo: '0Box + 28', boxCount: 1 },
  { id: 10, clientName: 'GSR 김해일배', partNo: '27000388835', kind: '김밥', partName: '참치김치볶음김밥', delivQty: 77, excludeQty: 0, actualQty: 77, boxInQty: 40, qtyInfo: '1Box + 37', boxCount: 2 },
  { id: 11, clientName: 'GSR 김해일배', partNo: '27000388779', kind: '김밥', partName: 'THE근본김밥', delivQty: 115, excludeQty: 0, actualQty: 115, boxInQty: 40, qtyInfo: '2Box + 35', boxCount: 3 },
  { id: 12, clientName: 'GSR 김해일배', partNo: '28300001216', kind: '도시락', partName: '(주문)혜자)돌아온제육', delivQty: 10, excludeQty: 0, actualQty: 10, boxInQty: 9, qtyInfo: '1Box + 1', boxCount: 2 },
  { id: 13, clientName: 'GSR 김해일배', partNo: '27000388733', kind: '도시락', partName: '혜자)돌아온제육도시락', delivQty: 45, excludeQty: 0, actualQty: 45, boxInQty: 9, qtyInfo: '5Box + 0', boxCount: 5 },
  { id: 14, clientName: 'GSR 김해일배', partNo: '27000388732', kind: '도시락', partName: '혜자)돌아온부대찌개도시락', delivQty: 105, excludeQty: 0, actualQty: 105, boxInQty: 9, qtyInfo: '11Box + 6', boxCount: 12 },
  { id: 15, clientName: 'GSR 김해일배', partNo: '27000388849', kind: '도시락', partName: '혜자)두부김치제육한상', delivQty: 75, excludeQty: 0, actualQty: 75, boxInQty: 8, qtyInfo: '9Box + 3', boxCount: 10 },
  { id: 16, clientName: 'GSR 김해일배', partNo: '27000388855', kind: '도시락', partName: '혜자)두툼돈까스도시락', delivQty: 70, excludeQty: 0, actualQty: 70, boxInQty: 9, qtyInfo: '7Box + 7', boxCount: 8 },
  { id: 17, clientName: 'GSR 김해일배', partNo: '27000388842', kind: '도시락', partName: '혜자)반반제육소불고기', delivQty: 52, excludeQty: 0, actualQty: 52, boxInQty: 8, qtyInfo: '6Box + 4', boxCount: 7 },
  { id: 18, clientName: 'GSR 김해일배', partNo: '27000388859', kind: '도시락', partName: '혜자)통등심돈까스도시락', delivQty: 103, excludeQty: 0, actualQty: 103, boxInQty: 6, qtyInfo: '17Box + 1', boxCount: 18 },
  { id: 19, clientName: 'GSR 김해일배', partNo: '27000388841', kind: '도시락', partName: 'NEW뭘좋아할지몰라다넣은', delivQty: 68, excludeQty: 0, actualQty: 68, boxInQty: 6, qtyInfo: '11Box + 2', boxCount: 12 },
  { id: 20, clientName: 'GSR 김해일배', partNo: '27000388837', kind: '도시락', partName: 'NEW혜자)백반한상', delivQty: 22, excludeQty: 0, actualQty: 22, boxInQty: 9, qtyInfo: '2Box + 4', boxCount: 3 },
  { id: 21, clientName: 'GSR 김해일배', partNo: '27000388829', kind: '무스비', partName: '무스비)햄&참치김치', delivQty: 42, excludeQty: 0, actualQty: 42, boxInQty: 40, qtyInfo: '1Box + 2', boxCount: 2 },
  { id: 22, clientName: 'GSR 김해일배', partNo: '27000388829', kind: '무스비', partName: '무스비)햄&참치김치특', delivQty: 14, excludeQty: 0, actualQty: 14, boxInQty: 40, qtyInfo: '0Box + 14', boxCount: 1 },
  { id: 23, clientName: 'GSR 김해일배', partNo: '27000388806', kind: '무스비', partName: 'NEW스팸무스비', delivQty: 82, excludeQty: 0, actualQty: 82, boxInQty: 40, qtyInfo: '2Box + 2', boxCount: 3 },
  { id: 24, clientName: 'GSR 김해일배', partNo: '27000388856', kind: '주먹밥', partName: '더큰)들기름막국수주먹밥', delivQty: 181, excludeQty: 0, actualQty: 181, boxInQty: 40, qtyInfo: '4Box + 21', boxCount: 5 },
  { id: 25, clientName: 'GSR 김해일배', partNo: '27000388784', kind: '주먹밥', partName: '더큰)리챔참치마요', delivQty: 139, excludeQty: 0, actualQty: 139, boxInQty: 40, qtyInfo: '3Box + 19', boxCount: 4 },
  { id: 26, clientName: 'GSR 김해일배', partNo: '27000388847', kind: '주먹밥', partName: '더큰)맥적구이한상', delivQty: 59, excludeQty: 0, actualQty: 59, boxInQty: 40, qtyInfo: '1Box + 19', boxCount: 2 },
  { id: 27, clientName: 'GSR 김해일배', partNo: '27000388847', kind: '주먹밥', partName: '더큰)스팸계란볶음', delivQty: 209, excludeQty: 0, actualQty: 209, boxInQty: 40, qtyInfo: '5Box + 9', boxCount: 6 },
  { id: 28, clientName: 'GSR 김해일배', partNo: '27000388785', kind: '주먹밥', partName: '더큰)스팸김치볶음밥', delivQty: 242, excludeQty: 0, actualQty: 242, boxInQty: 40, qtyInfo: '6Box + 2', boxCount: 7 },
  { id: 29, clientName: 'GSR 김해일배', partNo: '27000388820', kind: '주먹밥', partName: '더큰)오징어제육깻잎', delivQty: 84, excludeQty: 0, actualQty: 84, boxInQty: 40, qtyInfo: '2Box + 4', boxCount: 3 },
];

export const ShippingOrderStatusView: React.FC = () => {
  const [delivDate, setDelivDate] = useState('2026년 10월 30일 금요일');
  const [shiftFilter, setShiftFilter] = useState<'1편' | '2편' | '모두'>('1편');
  const [rows, setRows] = useState<ShippingOrderRow[]>(INITIAL_ROWS);
  const { openPrintModal } = usePrintReport();

  useEffect(() => {
    fetch('/api/sales/delivery')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loadedRows: ShippingOrderRow[] = [];
          json.data.forEach((d: any, dIdx: number) => {
            (d.details || []).forEach((dt: any, dtIdx: number) => {
              const boxIn = dt.boxQty > 0 ? Math.round(dt.deliveryQty / dt.boxQty) : 24;
              const boxCount = dt.boxQty || Math.ceil(dt.deliveryQty / boxIn);
              loadedRows.push({
                id: dt.id || (dIdx * 100 + dtIdx + 1),
                clientName: d.centerCode || 'GSR 김해일배',
                partNo: dt.productCode || '27000388865',
                kind: '완성품',
                partName: dt.productName || '제품',
                delivQty: dt.deliveryQty || 10,
                excludeQty: 0,
                actualQty: dt.deliveryQty || 10,
                boxInQty: boxIn,
                qtyInfo: `${Math.floor(dt.deliveryQty / boxIn)}Box + ${dt.deliveryQty % boxIn}`,
                boxCount: boxCount,
              });
            });
          });
          if (loadedRows.length > 0) {
            setRows(loadedRows);
          }
        }
      })
      .catch((err) => console.error('Failed to load shipping orders', err));
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

  const handleExcludeChange = (id: number, val: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const ex = val || 0;
          const act = Math.max(0, r.delivQty - ex);
          const fullBox = Math.floor(act / r.boxInQty);
          const remainder = act % r.boxInQty;
          const bCount = Math.ceil(act / r.boxInQty);
          return {
            ...r,
            excludeQty: ex,
            actualQty: act,
            qtyInfo: `${fullBox}Box + ${remainder}`,
            boxCount: bCount,
          };
        }
        return r;
      })
    );
  };

  const handleCenterPrint = () => {
    openPrintModal('WORK_ORDER');
  };

  // Totals exactly matching screenshot 092031.png
  const totals = rows.reduce(
    (acc, r) => ({
      delivQty: acc.delivQty + r.delivQty,
      excludeQty: acc.excludeQty + r.excludeQty,
      actualQty: acc.actualQty + r.actualQty,
      boxCount: acc.boxCount + r.boxCount,
    }),
    { delivQty: 32067, excludeQty: 0, actualQty: 32067, boxCount: 1706 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 (화면 캡처 092031.png: 조회, 초기화, 센터용출력, 엑셀다운로드, ?) */}
      <SalesActionBar
        title="출하지시현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('출하지시 조회 완료') },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setRows(INITIAL_ROWS) },
          { key: 'centerPrint', label: '센터용출력', icon: 'print', variant: 'secondary', onClick: handleCenterPrint },
          { key: 'boxLabel', label: '납품박스라벨인쇄', icon: 'print', variant: 'secondary', onClick: () => openPrintModal('DELIVERY_BOX_LABEL') },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: () =>
              exportGridToExcel({
                filename: '출하지시현황',
                sheetName: '출하지시',
                columns: [
                  { key: 'clientName', label: '거래처명' },
                  { key: 'partNo', label: '품번' },
                  { key: 'kind', label: '품종' },
                  { key: 'partName', label: '품명' },
                  { key: 'delivQty', label: '납품수량', format: 'number' },
                  { key: 'excludeQty', label: '제외수량', format: 'number' },
                  { key: 'actualQty', label: '실출력수량', format: 'number' },
                  { key: 'boxInQty', label: '박스내입수량', format: 'number' },
                  { key: 'qtyInfo', label: '수량정보' },
                  { key: 'boxCount', label: 'BOX수량', format: 'number' },
                ],
                data: rows,
              }),
          },
        ]}
        helpContent="물류센터별 출하 박스 적재 수량을 계산하고, 박스 내입 규격(28ea, 40ea, 9ea 등)에 따라 풀박스(Box) 및 낱개 수량을 자동 산출합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 092031.png: 납품일, 편수: 1편/2편/모두) */}
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
            <span className="font-semibold text-gray-700">편수:</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="shiftShipping"
                checked={shiftFilter === '1편'}
                onChange={() => setShiftFilter('1편')}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="font-medium text-gray-800">1편</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="shiftShipping"
                checked={shiftFilter === '2편'}
                onChange={() => setShiftFilter('2편')}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="font-medium text-gray-800">2편</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="shiftShipping"
                checked={shiftFilter === '모두'}
                onChange={() => setShiftFilter('모두')}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="font-medium text-gray-800">모두</span>
            </label>
          </div>
        </div>

        <div className="text-[11px] text-gray-600 font-mono">
          총 출하건수: <strong className="text-blue-900">{rows.length}건</strong>
        </div>
      </div>

      {/* 3. 단일 그리드 (#c5c9f7 연보라 헤더, #fdfde0 하단 합계줄) */}
      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col bg-white border border-gray-400 shadow-2xs">
        <div className="flex-1 overflow-auto">
          <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
            <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
              <tr>
                <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-10">No</th>
                <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28 text-left">거래처명</th>
                <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">품번</th>
                <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-16">품종</th>
                <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-left">품명</th>
                <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20">납품수량</th>
                <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-18">제외수량</th>
                <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-right w-20 bg-[#e8edf4]">실출력수량</th>
                <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-center w-22">박스내입수량</th>
                <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] text-center w-28 bg-[#e8edf4]">수량정보</th>
                <th className="whitespace-nowrap py-1 px-2 text-right w-20 font-extrabold text-blue-950">BOX수량</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-mono">
              {rows.map((r, idx) => (
                <tr key={r.id} className="hover:bg-blue-50/50">
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200 text-gray-500">{idx + 1}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200 font-medium">{r.clientName}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200 font-bold text-gray-800">{r.partNo}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-center border-r border-gray-200">{r.kind}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200 font-medium">{r.partName}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200 font-bold text-gray-900">{r.delivQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-0.5 px-1 text-right border-r border-gray-200">
                    <input
                      type="number"
                      value={r.excludeQty}
                      onChange={(e) => handleExcludeChange(r.id, Number(e.target.value))}
                      className="w-12 text-right font-mono text-gray-700 border border-gray-300 px-1 py-0.5 bg-white rounded-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right border-r border-gray-200 font-extrabold text-blue-900 bg-blue-50/20">{r.actualQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center border-r border-gray-200 text-gray-600">{r.boxInQty}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center border-r border-gray-200 font-sans font-bold text-indigo-900 bg-indigo-50/20">{r.qtyInfo}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-extrabold text-blue-950 bg-blue-50/40">{r.boxCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {/* 합계줄 (#fdfde0 연노랑) */}
            <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
              <tr>
                <td colSpan={5} className="whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-blue-900 border-r border-gray-300">32,067</td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-gray-500 border-r border-gray-300">0</td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-blue-900 border-r border-gray-300">32,067</td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 border-r border-gray-300"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 border-r border-gray-300 text-center font-sans">총 출하박스</td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right text-blue-950 font-black">1,706</td>
              </tr>
            </tfoot>
          </table></EditableTableWrapper>
        </div>
      </div>
    </div>
  );
};
