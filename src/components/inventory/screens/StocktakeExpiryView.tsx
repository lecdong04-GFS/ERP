'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '@/components/purchase/common/PurchaseDataGrid';
import { Calendar } from 'lucide-react';
import { readJsonSafe } from '@/lib/http';

interface StocktakeExpiryRow {
  id: number;
  warehouse: string; // 창고
  productCode?: string; // 품번
  itemName: string; // 품명
  spec: string; // 규격
  unit: string; // 단위
  expiryDate: string; // 유통기한
  currentStock: number; // 현재고
  actualStock: number; // 실사수량 (입력 가능)
  diffQty: number; // 차이수량 (실사수량 - 현재고)
}

const SAMPLE_STOCKTAKE_DATA: StocktakeExpiryRow[] = [
  { id: 1, warehouse: '상온', itemName: '국내산 경기미 20kg', spec: '20kg/포', unit: '포', expiryDate: '2027-10-25', currentStock: 250, actualStock: 248, diffQty: -2 },
  { id: 2, warehouse: '상온', itemName: '[상온]삼각김밥김', spec: '100매*32ea', unit: 'box', expiryDate: '2027-10-20', currentStock: 35, actualStock: 35, diffQty: 0 },
  { id: 3, warehouse: '냉장1', itemName: '[냉장]다진맛살', spec: '10kg*2ea', unit: 'box', expiryDate: '2026-11-15', currentStock: 20, actualStock: 19, diffQty: -1 },
  { id: 4, warehouse: '냉장2', itemName: '[냉장]볶음김치', spec: '5kg*3ea', unit: 'box', expiryDate: '2026-11-25', currentStock: 45, actualStock: 45, diffQty: 0 },
  { id: 5, warehouse: '냉장1', itemName: '[냉장]계란구이', spec: '1020g*12ea', unit: 'box', expiryDate: '2026-11-20', currentStock: 18, actualStock: 17, diffQty: -1 },
  { id: 6, warehouse: '부자재', itemName: '두레)ET-30 용기', spec: '50ea*2줄', unit: 'box', expiryDate: '2028-10-29', currentStock: 50, actualStock: 50, diffQty: 0 },
  { id: 7, warehouse: '냉동', itemName: '[냉동]궁채나물', spec: '1kg*10ea', unit: 'box', expiryDate: '2027-10-10', currentStock: 40, actualStock: 40, diffQty: 0 },
  { id: 8, warehouse: '상온', itemName: '골드마요네즈 3.2kg', spec: '3.2kg*4통', unit: 'box', expiryDate: '2027-04-10', currentStock: 25, actualStock: 25, diffQty: 0 },
];

const COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'warehouse', label: '창고', width: '110px', align: 'center', sticky: true, leftOffset: '36px' },
  { key: 'itemName', minWidth: '260px', label: '품명', align: 'left', sticky: true, leftOffset: '146px' },
  { key: 'spec', label: '규격', width: '120px', align: 'center' },
  { key: 'unit', label: '단위', width: '50px', align: 'center' },
  { key: 'expiryDate', label: '유통기한', width: '95px', align: 'center', format: 'date' },
  { key: 'currentStock', label: '현재고', width: '85px', align: 'right', format: 'number' },
  { key: 'actualStock', label: '실사수량', width: '90px', align: 'right', format: 'number', editable: true },
  { key: 'diffQty', label: '차이수량', width: '85px', align: 'right', format: 'number', dangerIfNegative: true },
];

export const StocktakeExpiryView: React.FC = () => {
  const [takeDate, setTakeDate] = useState('2026-10-30');
  const [selectedWh, setSelectedWh] = useState('ALL');
  const [rows, setRows] = useState(SAMPLE_STOCKTAKE_DATA);

  useEffect(() => {
    fetch('/api/inventory/stocktake')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loaded: StocktakeExpiryRow[] = json.data.map((s: any, idx: number) => ({
            id: s.id || idx + 1,
            warehouse: s.warehouse || '상온',
            productCode: s.productCode || '',
            itemName: s.productName || s.productCode,
            spec: '',
            unit: s.unit || 'box',
            expiryDate: s.expiryDate || '2027-10-25',
            currentStock: Number(s.bookQty ?? 0),
            actualStock: Number(s.actualQty ?? 0),
            diffQty: Number(s.diffQty ?? 0),
          }));
          setRows(loaded);
        }
      })
      .catch((err) => console.error('Failed to load expiry stocktake records', err));
  }, []);

  const filteredRows = rows.filter((r) => {
    if (selectedWh !== 'ALL' && r.warehouse !== selectedWh) return false;
    return true;
  });

  const handleCellChange = (id: any, key: string, val: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const actual = Number(val) || 0;
          return {
            ...r,
            actualStock: actual,
            diffQty: actual - r.currentStock,
          };
        }
        return r;
      })
    );
  };

  const handleSave = async () => {
    try {
      if (filteredRows.length === 0) {
        alert('현재 화면에 저장할 재고실사 내역이 없습니다.');
        return;
      }
      const res = await fetch('/api/inventory/stocktake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch',
          stocktakeDate: takeDate,
          rows: filteredRows.map((r) => ({
            stocktakeDate: takeDate,
            itemCode: r.productCode || '',
            productCode: r.productCode || '',
            itemName: r.itemName,
            productName: r.itemName,
            warehouse: r.warehouse,
            expiryDate: r.expiryDate,
            bookQty: r.currentStock,
            actualQty: r.actualStock,
            currentStock: r.actualStock,
            diffQty: r.diffQty,
            unit: r.unit,
            status: '확정',
          })),
        }),
      });
      const parsed = await readJsonSafe(res, '유통기한 재고실사 저장에 실패했습니다.');
      if (parsed.ok) {
        alert('유통기한 적용 재고실사 내역이 데이터베이스에 정상 반영되었습니다.');
      } else {
        alert('저장 실패: ' + parsed.errorMessage);
      }
    } catch (err: any) {
      alert('저장 중 오류: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <SalesActionBar
        title="재고실사(유통기한적용)"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'save', label: '저장', icon: 'save', variant: 'secondary', onClick: handleSave },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => setRows(SAMPLE_STOCKTAKE_DATA) },
        ]}
        helpContent="유통기한별 LOT 단위 전산 재고와 실제 실물 재고를 대조 실사하고 재고 차이를 전산에 반영합니다."
      />

      {/* 2. 조건 검색 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-gray-700 flex items-center gap-1">
              <Calendar size={13} className="text-blue-700" />
              기준일자:
            </span>
            <input
              type="date"
              value={takeDate}
              onChange={(e) => setTakeDate(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] font-medium rounded-xs shadow-2xs w-[130px]"
            />
          </div>

          <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
            <span className="font-semibold text-gray-700">창고:</span>
            <select
              value={selectedWh}
              onChange={(e) => setSelectedWh(e.target.value)}
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

