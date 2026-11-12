'use client';

import React, { useState } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '@/components/purchase/common/PurchaseDataGrid';
import { Calendar, ChevronLeft, ChevronRight, ArrowRightLeft } from 'lucide-react';

interface WarehouseMoveRow {
  id: number;
  category: string; // 구분
  variety: string; // 품종
  itemName: string; // 품명
  spec: string; // 규격
  unit: string; // 단위
  unitPrice: number; // 단가
  currentStock: number; // 현재고
  expiryDate: string; // 유통기한
  currentWarehouse: string; // 현재창고
  targetWarehouse: string; // 이동창고
  moveQty: number; // 이동수량
}

const SAMPLE_MOVE_DATA: WarehouseMoveRow[] = [
  { id: 1, category: '원재료', variety: '곡류', itemName: '국내산 경기미 20kg', spec: '20kg/포', unit: '포', unitPrice: 52000, currentStock: 250, expiryDate: '2027-10-25', currentWarehouse: '상온', targetWarehouse: '취반실(계량)', moveQty: 50 },
  { id: 2, category: '원재료', variety: '김류', itemName: '[상온]삼각김밥김', spec: '100매*32ea', unit: 'box', unitPrice: 52000, currentStock: 35, expiryDate: '2027-10-20', currentWarehouse: '상온', targetWarehouse: '성형장(삼각김밥)', moveQty: 10 },
  { id: 3, category: '원재료', variety: '수산가공', itemName: '[냉장]다진맛살', spec: '10kg*2ea', unit: 'box', unitPrice: 52000, currentStock: 20, expiryDate: '2026-11-15', currentWarehouse: '냉장1', targetWarehouse: '조리실(볶음)', moveQty: 5 },
  { id: 4, category: '원재료', variety: '절임류', itemName: '[냉장]볶음김치', spec: '5kg*3ea', unit: 'box', unitPrice: 42000, currentStock: 45, expiryDate: '2026-11-25', currentWarehouse: '냉장2', targetWarehouse: '성형장(김밥)', moveQty: 15 },
  { id: 5, category: '원재료', variety: '난가공', itemName: '[냉장]계란구이', spec: '1020g*12ea', unit: 'box', unitPrice: 78000, currentStock: 18, expiryDate: '2026-11-20', currentWarehouse: '냉장1', targetWarehouse: '성형장(도시락)', moveQty: 6 },
  { id: 6, category: '부재료', variety: '용기', itemName: '두레)ET-30 용기', spec: '50ea*2줄', unit: 'box', unitPrice: 38000, currentStock: 50, expiryDate: '2028-10-29', currentWarehouse: '부자재', targetWarehouse: '성형장(도시락)', moveQty: 20 },
  { id: 7, category: '원재료', variety: '가공육', itemName: '스팸 클래식 1.81kg', spec: '1.81kg*6ea', unit: 'box', unitPrice: 84000, currentStock: 30, expiryDate: '2027-08-15', currentWarehouse: '상온', targetWarehouse: '조리실(볶음)', moveQty: 8 },
  { id: 8, category: '원재료', variety: '소스', itemName: '골드마요네즈 3.2kg', spec: '3.2kg*4통', unit: 'box', unitPrice: 38000, currentStock: 25, expiryDate: '2027-04-10', currentWarehouse: '상온', targetWarehouse: '계량실(소스류)', moveQty: 5 },
];

const COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'category', label: '구분', width: '65px', align: 'center', sticky: true, leftOffset: '36px' },
  { key: 'variety', label: '품종', width: '80px', align: 'center', sticky: true, leftOffset: '101px' },
  { key: 'itemName', minWidth: '260px', label: '품명', align: 'left', sticky: true, leftOffset: '181px' },
  { key: 'spec', label: '규격', width: '110px', align: 'center' },
  { key: 'unit', label: '단위', width: '45px', align: 'center' },
  { key: 'unitPrice', label: '단가', width: '80px', align: 'right', format: 'currency' },
  { key: 'currentStock', label: '현재고', width: '75px', align: 'right', format: 'number' },
  { key: 'expiryDate', label: '유통기한', width: '90px', align: 'center', format: 'date' },
  { key: 'currentWarehouse', label: '현재창고', width: '110px', align: 'center' },
  { key: 'targetWarehouse', label: '이동창고', width: '120px', align: 'center', editable: true },
  { key: 'moveQty', label: '이동수량', width: '85px', align: 'right', format: 'number', editable: true },
];

export const WarehouseMoveView: React.FC = () => {
  const [moveDate, setMoveDate] = useState('2026-10-30');
  const [whFilter, setWhFilter] = useState('ALL');
  const [rows, setRows] = useState(SAMPLE_MOVE_DATA);

  const filteredRows = rows.filter((r) => {
    if (whFilter !== 'ALL' && r.currentWarehouse !== whFilter) return false;
    return true;
  });

  const handleCellChange = (id: any, key: string, val: any) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: key === 'moveQty' ? Number(val) || 0 : val } : r))
    );
  };

  const handleSave = async () => {
    try {
      const itemsToMove = rows.filter((r) => r.moveQty > 0);
      if (itemsToMove.length === 0) {
        alert('이동할 수량이 입력된 품목이 없습니다.');
        return;
      }

      const res = await fetch('/api/inventory/warehouse-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moveDate,
          items: itemsToMove,
          createdBy: 'admin',
        }),
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (res.ok && data?.success) {
        alert(`창고간 재고 이동이 성공적으로 완료되었습니다!\n(${data.message || '현재고 및 자재수불부에 반영되었습니다.'})`);
      } else {
        alert('창고이동 실패: ' + (data?.error || `HTTP ${res.status}`));
      }
    } catch (err: any) {
      alert('창고이동 처리 중 오류가 발생했습니다: ' + (err?.message || '네트워크 오류'));
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <SalesActionBar
        title="창고이동"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'save', label: '저장', icon: 'save', variant: 'secondary', onClick: handleSave },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setRows(SAMPLE_MOVE_DATA) },
        ]}
        helpContent="보관 창고(상온, 냉장, 냉동)에서 생산 공정 라인 창고(성형장, 조리실, 취반실 등)로의 재고 이동을 등록합니다."
      />

      {/* 2. 조건 검색 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-gray-700 flex items-center gap-1">
              <Calendar size={13} className="text-blue-700" />
              이동일자:
            </span>
            <input
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] font-medium rounded-xs shadow-2xs w-[130px]"
            />
          </div>

          <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
            <span className="font-semibold text-gray-700">현재창고:</span>
            <select
              value={whFilter}
              onChange={(e) => setWhFilter(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] rounded-xs shadow-2xs"
            >
              <option value="ALL">전체 창고 (ALL)</option>
              <option value="냉장1">냉장1</option>
              <option value="냉장2">냉장2</option>
              <option value="냉동">냉동</option>
              <option value="상온">상온</option>
              <option value="부자재">부자재</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-gray-600 font-semibold bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
          데이터수: <span className="font-bold text-blue-700">{filteredRows.length}</span> 건
        </div>
      </div>

      {/* 3. 데이터 그리드 */}
      <div className="flex-1 p-2 min-h-0 overflow-hidden flex flex-col">
        <PurchaseDataGrid
          columns={COLUMNS}
          data={filteredRows}
          onCellChange={handleCellChange}
          summaryRowTitle="합계"
        />
      </div>
    </div>
  );
};

