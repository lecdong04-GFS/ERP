'use client';

import React, { useState, useMemo } from 'react';
import { HelpCircle, Search, RotateCcw } from 'lucide-react';

import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
export interface OrderReqConfirmItem {
  id: number;
  category: string; // 구분 (원재료 / 부자재)
  itemName: string; // 품명
  spec: string; // 규격
  unit: string; // 단위
  supplier: string; // 거래처
  orderUnit: string; // 발주단위
  minOrderQty: number; // 최소발주수량
  orderQty: number; // 발주수량
  unitPrice: number; // 발주단가
  orderAmt: number; // 발주금액
  calcQty: number; // 발주계산수량
  unitQty: number; // Unit 수량
  orderUnitQty: number; // 발주단위수량
  leadTime: number; // 조달기간
  clientStock: number; // 거래처재고
  safetyStock: number; // 안전재고
  currentStock: number; // 현재고
  incomingScheduledBox: number; // 입고예정량(BOX)
  incomingScheduled: number; // 입고예정량
  stockQty: number; // 재고수량
}


/** KST 오늘 YYYY-MM-DD */
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export const OrderReqConfirmView: React.FC = () => {
  const [selectedSupplier, setSelectedSupplier] = useState('ALL');
  const [rows, setRows] = useState<OrderReqConfirmItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editVal, setEditVal] = useState<string>('');

  const handleGenericChange = (id: number, field: string, val: any) => {
    setRows((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: val };
          if (field === 'unitPrice' || field === 'orderQty') {
            const q = Number(updated.orderQty) || 0;
            const p = Number(updated.unitPrice) || 0;
            updated.orderAmt = Math.round(q * p);
          }
          return updated;
        }
        return item;
      })
    );
  };

  const renderEditableCell = (row: any, field: string, align: 'left' | 'center' | 'right' = 'left', isNumber = false) => {
    const isEditing = editingCell?.id === row.id && editingCell?.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          type="text"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => {
            const val = isNumber ? (editVal === '' ? 0 : Number(editVal.replace(/,/g, '')) || 0) : editVal;
            handleGenericChange(row.id, field, val);
            setEditingCell(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = isNumber ? (editVal === '' ? 0 : Number(editVal.replace(/,/g, '')) || 0) : editVal;
              handleGenericChange(row.id, field, val);
              setEditingCell(null);
            } else if (e.key === 'Escape') {
              setEditingCell(null);
            }
          }}
          className={`w-full h-full min-h-[22px] bg-white text-gray-900 border-2 border-blue-600 rounded-none px-1 py-0.5 text-[12.5px] outline-none shadow-inner ${align === 'right' ? 'text-right font-mono' : align === 'center' ? 'text-center' : 'text-left'}`}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.target.select()}
        />
      );
    }

    const raw = row[field];
    const display = isNumber ? (Number(raw) || 0).toLocaleString() : (raw !== undefined && raw !== null ? String(raw) : '');

    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          setEditingCell({ id: row.id, field });
          setEditVal(raw !== undefined && raw !== null ? String(raw) : '');
        }}
        className={`w-full h-full cursor-text hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-1 py-0.5 transition-colors ${align === 'right' ? 'text-right font-mono' : align === 'center' ? 'text-center' : 'text-left'}`}
      >
        {display}
      </div>
    );
  };

  // 실시간 DB 소요량 조회 (DB 그대로 표시 — 빈 결과도 그대로 반영, 샘플 표시 없음)
  const fetchOrderReqs = async () => {
    setIsLoading(true);
    try {
      const today = kstToday();
      const res = await fetch(`/api/purchase/order-req-confirm?date=${today}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRows(json.data);
      } else {
        setRows([]);
      }
    } catch (e) {
      console.warn('DB 소요량 조회 실패:', e);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchOrderReqs();
  }, []);

  // Filter by 매입처 (DB 실데이터 기준 동적 옵션)
  const suppliers = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const name = String(r.supplier || '').trim();
      if (name) s.add(name);
    });
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [rows]);
  const filteredRows = useMemo(() => {
    if (selectedSupplier === 'ALL') return rows;
    return rows.filter((r) => r.supplier.includes(selectedSupplier));
  }, [rows, selectedSupplier]);

  // Grand totals
  const totalAmt = useMemo(() => {
    return filteredRows.reduce((acc, r) => acc + r.orderAmt, 0);
  }, [filteredRows]);

  const totalQty = useMemo(() => {
    return filteredRows.reduce((acc, r) => acc + r.orderQty, 0);
  }, [filteredRows]);

  const handleQtyChange = (id: number, val: string) => {
    const num = Number(val) || 0;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          return {
            ...r,
            orderQty: num,
            orderAmt: num * r.unitPrice,
          };
        }
        return r;
      })
    );
  };

  // 계산수량을 발주수량으로 일괄 적용
  const handleApplyCalcQtyAll = () => {
    setRows((prev) =>
      prev.map((r) => {
        const targetQty = r.calcQty > 0 ? Math.ceil(r.calcQty) : 0;
        return {
          ...r,
          orderQty: targetQty,
          orderAmt: targetQty * r.unitPrice,
        };
      })
    );
  };

  // 발주수량 전체 0으로 초기화
  const handleClearQtyAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        orderQty: 0,
        orderAmt: 0,
      }))
    );
  };

  const handleReset = () => {
    fetchOrderReqs();
    setSelectedSupplier('ALL');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f0f2f5] select-none text-[12.5px] font-sans">
      {/* 1. 상단 다크 헤더 바 (화면 캡처 2026-10-30 155746.png 정확 일치) */}
      <div className="h-[32px] bg-[#333333] border-b border-[#222222] px-3 flex items-center justify-between text-white shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 bg-[#4caf50] rounded-2xs inline-block" />
          <h1 className="text-[13px] font-bold tracking-tight text-white">발주소요량확정</h1>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleApplyCalcQtyAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xs text-[11px] font-bold transition-colors shadow-2xs cursor-pointer border border-amber-700"
            title="시스템이 계산한 순부족량을 발주수량에 일괄 적용합니다."
          >
            추천수량 일괄적용
          </button>
          <button
            type="button"
            onClick={handleClearQtyAll}
            className="flex items-center gap-1 px-2 py-1 bg-gray-600 hover:bg-gray-500 text-gray-200 rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-gray-700"
            title="발주수량을 전체 0으로 초기화하여 원하는 항목만 입력합니다."
          >
            수량 비우기
          </button>
          <button
            type="button"
            onClick={fetchOrderReqs}
            disabled={isLoading}
            className="flex items-center gap-1 px-3 py-1 bg-[#607d8b] hover:bg-[#546e7a] disabled:bg-gray-600 text-white rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-[#455a64]"
          >
            <Search size={12} className="stroke-[2.5]" />
            {isLoading ? '조회중...' : '조회'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-1 bg-[#607d8b] hover:bg-[#546e7a] text-white rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-[#455a64]"
          >
            <RotateCcw size={12} className="stroke-[2.5]" />
            새로고침
          </button>
          <button
            type="button"
            onClick={() => alert('도움말: 발주소요량확정 화면')}
            className="w-5 h-5 flex items-center justify-center rounded-full bg-black hover:bg-gray-800 text-white cursor-pointer ml-1 text-[11px] font-bold"
          >
            <HelpCircle size={13} />
          </button>
        </div>
      </div>

      {/* 안내: 발주 확정은 스마트발주(GFS) 메뉴에서 — 이 화면은 소요량 검토용 */}
      <div className="bg-amber-50 border-b border-amber-200 px-3 py-1 text-[11px] text-amber-800 shrink-0">
        이 화면은 소요량 검토용입니다. 실제 발주 확정은 <b>스마트발주(GFS)</b> 메뉴에서 해주세요.
      </div>

      {/* 2. 조건 검색 바 (매입처 ALL + 우측 데이터수: 76) */}
      <div className="bg-[#f5f6f8] border-b border-[#cccccc] px-3 py-1 flex items-center justify-between shrink-0 h-[30px]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-700 text-[11px]">매입처</span>
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="bg-white border border-gray-300 px-2 py-0.5 text-[11px] font-medium rounded-xs shadow-2xs w-[180px] h-[22px] outline-none focus:border-blue-500"
          >
            <option value="ALL">ALL</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="text-[11px] text-gray-700 font-semibold bg-white px-2.5 py-0.5 rounded-xs border border-gray-300 shadow-2xs">
          데이터수: <span className="font-bold text-blue-700">{filteredRows.length}</span>
        </div>
      </div>

      {/* 3. 대형 데이터 그리드 (화면 캡처 2026-10-30 155746.png 정확 일치 21개 헤더 및 데이터) */}
      <div className="flex-1 p-0.5 min-h-0 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 min-h-0 overflow-auto border border-[#a4abb6]">
          <EditableTableWrapper><table className="w-full min-w-full border-collapse text-[12.5px] font-sans">
            <thead className="sticky top-0 z-20 bg-[#c5cbf0] text-gray-900 font-semibold border-b border-[#9098aa]">
              <tr className="h-[32px] leading-tight text-center whitespace-nowrap font-bold">
                {/* 행 인덱스 헤더 */}
                <th className="border border-[#9098aa] px-1 py-0.5 bg-[#e2e6f3] w-[32px] min-w-[32px]"></th>

                {/* 구분 */}
                <th className="border border-[#9098aa] px-1 py-0.5 w-[55px] min-w-[55px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>구분</span>
                    
                  </div>
                </th>

                {/* 품명 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[280px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>품명</span>
                    
                  </div>
                </th>

                {/* 규격 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[120px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>규격</span>
                    
                  </div>
                </th>

                {/* 단위 */}
                <th className="border border-[#9098aa] px-1 py-0.5 w-[45px] min-w-[45px] text-center">
                  단위
                </th>

                {/* 거래처 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[160px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>거래처</span>
                    
                  </div>
                </th>

                {/* 발주단위 ∨ */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>발주단위</span>
                    
                  </div>
                </th>

                {/* 최소발주수량 (2줄) */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-center">
                  <span>최소발주수량</span>
                </th>

                {/* 발주수량 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-center">
                  발주수량
                </th>

                {/* 발주단가 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[75px] text-center">
                  발주단가
                </th>

                {/* 발주금액 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[90px] text-center">
                  발주금액
                </th>

                {/* 발주계산수량 (2줄) */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-center">
                  <span>발주계산수량</span>
                </th>

                {/* Unit 수량 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-center">
                  Unit 수량
                </th>

                {/* 발주단위수량 (2줄) */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-center">
                  <span>발주단위수량</span>
                </th>

                {/* 조달기간 (2줄) */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[55px] text-center">
                  <span>조달기간</span>
                </th>

                {/* 거래처재고 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>거래처재고</span>
                    
                  </div>
                </th>

                {/* 안전재고 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-center">
                  안전재고
                </th>

                {/* 현재고 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[75px] text-center">
                  현재고
                </th>

                {/* 입고예정량(BOX) (2줄) */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[80px] text-center">
                  <span>입고예정량(BOX)</span>
                </th>

                {/* 입고예정량 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-center">
                  입고예정량
                </th>

                {/* 재고수량 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[75px] text-center">
                  재고수량
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={21} className="py-10 text-center text-gray-400">불러오는 중...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={21} className="py-10 text-center text-gray-500">
                    해당 일자 소요량이 없습니다. (소요량은 파이프라인 실행 시 자동 계산됩니다)
                  </td>
                </tr>
              ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="h-[21px] border-b border-gray-300 hover:bg-[#eef3fb] bg-white text-gray-900"
                >
                  {/* 행 인덱스 번호 */}
                  <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center text-gray-700 bg-[#f4f5f8] font-mono text-[10px]">
                    {row.id}
                  </td>

                  {/* 구분 (원재료 / 부자재) */}
                  <td className="border border-gray-300 whitespace-nowrap px-1.5 py-0.5 text-center font-medium">
                    {row.category}
                  </td>

                  {/* 품명 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left font-medium ">
                    {row.itemName}
                  </td>

                  {/* 규격 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left text-gray-800 ">
                    {row.spec}
                  </td>

                  {/* 단위 */}
                  <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center text-gray-700">
                    {row.unit}
                  </td>

                  {/* 거래처 (스크린샷처럼 빈값이거나 [네트웍스]대림 등 표시 + 드롭다운 화살표 느낌) */}
                  <td className="border border-gray-300 whitespace-nowrap px-1.5 py-0.5 text-left ">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{row.supplier}</span>
                      
                    </div>
                  </td>

                  {/* 발주단위 (box ∨) */}
                  <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center text-gray-700">
                    <div className="flex items-center justify-center gap-0.5">
                      <span>{row.orderUnit}</span>
                      
                    </div>
                  </td>

                  {/* 최소발주수량 */}
                  <td className="border border-gray-300 whitespace-nowrap px-1.5 py-0.5 text-right font-mono text-gray-800">
                    {row.minOrderQty}
                  </td>

                  {/* 발주수량 (입력 가능 화이트 셀) */}
                  <td className="border border-gray-300 whitespace-nowrap p-0 text-right font-mono bg-white">
                    <input
                      type="number"
                      value={row.orderQty}
                      onChange={(e) => handleQtyChange(row.id, e.target.value)}
                      className="w-full h-full text-right font-bold text-gray-900 border-none outline-none focus:ring-1 focus:ring-blue-500 bg-transparent px-1.5"
                    />
                  </td>

                  {/* 발주단가 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-800">
                    {row.unitPrice.toLocaleString()}
                  </td>

                  {/* 발주금액 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono font-medium text-gray-900">
                    {row.orderAmt.toLocaleString()}
                  </td>

                  {/* 발주계산수량 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                    {row.calcQty.toLocaleString()}
                  </td>

                  {/* Unit 수량 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                    {row.unitQty}
                  </td>

                  {/* 발주단위수량 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                    {row.orderUnitQty.toLocaleString()}
                  </td>

                  {/* 조달기간 */}
                  <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center font-mono text-gray-700">
                    {row.leadTime}
                  </td>

                  {/* 거래처재고 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                    {row.clientStock > 0 ? row.clientStock.toLocaleString() : '0'}
                  </td>

                  {/* 안전재고 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                    {row.safetyStock.toLocaleString()}
                  </td>

                  {/* 현재고 (음수 적색 볼드) */}
                  <td
                    className={`border border-gray-300 px-2 py-0.5 text-right font-mono ${
                      row.currentStock < 0 ? 'text-red-600 font-bold' : 'text-gray-800'
                    }`}
                  >
                    {row.currentStock.toLocaleString()}
                  </td>

                  {/* 입고예정량(BOX) */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                    {row.incomingScheduledBox}
                  </td>

                  {/* 입고예정량 */}
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                    {row.incomingScheduled}
                  </td>

                  {/* 재고수량 (음수 적색 볼드) */}
                  <td
                    className={`border border-gray-300 px-2 py-0.5 text-right font-mono ${
                      row.stockQty < 0 ? 'text-red-600 font-bold' : 'text-gray-800'
                    }`}
                  >
                    {row.stockQty.toLocaleString()}
                  </td>
                </tr>
              )))}
            </tbody>

            {/* 하단 요약 합계 행 (화면 캡처 2026-10-30 155746.png 일치: 연노랑 배경, 52,381,640원) */}
            <tfoot className="sticky bottom-0 z-20 bg-[#ffffcc] border-t-2 border-[#9098aa] font-bold text-gray-900 shadow-inner">
              <tr className="h-[25px]">
                {/* 인덱스 열 빈칸 */}
                <td className="border border-[#9098aa] px-1 py-1 bg-[#ffffcc]"></td>

                {/* 구분 */}
                <td className="border border-[#9098aa] px-1.5 py-1 text-center font-bold">합계</td>

                {/* 품명 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 규격 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 단위 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 거래처 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 발주단위 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 최소발주수량 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 발주수량 합계 */}
                <td className="border border-[#9098aa] px-1.5 py-1 text-right font-mono font-bold text-blue-900">
                  {totalQty.toLocaleString()}
                </td>

                {/* 발주단가 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 발주금액 총합계 */}
                <td className="border border-[#9098aa] px-2 py-1 text-right font-mono text-gray-900 font-bold text-[12px]">
                  {totalAmt.toLocaleString()}
                </td>

                {/* 발주계산수량 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* Unit 수량 */}
                <td className="border border-[#9098aa] px-2 py-1 bg-[#ffffcc]"></td>

                {/* 발주단위수량 */}
                <td className="border border-[#9098aa] px-2 py-1 bg-[#ffffcc]"></td>

                {/* 조달기간 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 거래처재고 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 안전재고 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 현재고 */}
                <td className="border border-[#9098aa] px-1.5 py-1 bg-[#ffffcc]"></td>

                {/* 입고예정량(BOX) */}
                <td className="border border-[#9098aa] px-2 py-1 bg-[#ffffcc]"></td>

                {/* 입고예정량 */}
                <td className="border border-[#9098aa] px-2 py-1 bg-[#ffffcc]"></td>

                {/* 재고수량 */}
                <td className="border border-[#9098aa] px-2 py-1 bg-[#ffffcc]"></td>
              </tr>
            </tfoot>
          </table></EditableTableWrapper>
        </div>
      </div>
    </div>
  );
};
