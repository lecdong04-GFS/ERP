'use client';

import React, { useState } from 'react';
import { InventoryActionBar } from '../common/InventoryActionBar';
import { InventoryDataGrid, InventoryGridColumnDef } from '../common/InventoryDataGrid';
import { VENDOR_OPTIONS } from '../data/inventoryMasterData';
import { Calendar } from 'lucide-react';

interface ReturnRegRow {
  id: number;
  orderNo: string;
  category: string;
  variety: string;
  itemName: string;
  spec: string;
  unit: string;
  returnQty: number; // 반품수량 (editable)
  unitPrice: number; // 단가 (editable)
  returnAmount: number; // 반품금액 = 수량 * 단가
  returnReason: string; // 반품사유 (editable)
  remark: string; // 비고 (editable)
}

const INITIAL_RETURN_ITEMS: ReturnRegRow[] = [
  { id: 1, orderNo: 'ORD-261030-01', category: '원재료', variety: '수산가공', itemName: '가공 참치플레이크(오일)', spec: '1.8kg*6캔', unit: 'box', returnQty: 2, unitPrice: 68000, returnAmount: 136000, returnReason: '캔 파손 및 오일 누유', remark: '입고 검수 반품' },
  { id: 2, orderNo: 'ORD-261030-02', category: '원재료', variety: '채소류', itemName: '[냉장]대파(세척절단)', spec: '10kg/상자', unit: 'kg', returnQty: 20, unitPrice: 4200, returnAmount: 84000, returnReason: '신선도 저하(무름 현상)', remark: '공급사 교환 요청' },
  { id: 3, orderNo: 'ORD-261030-03', category: '부재료', variety: '용기류', itemName: '두레)ET-30 용기', spec: '50ea*2줄', unit: 'box', returnQty: 5, unitPrice: 42000, returnAmount: 210000, returnReason: '규격 오배송', remark: '정규격 재입고 예정' },
];

export const ReturnRegView: React.FC = () => {
  const [baseDate, setBaseDate] = useState('2026년 10월 30일 금요일');
  const [vendor, setVendor] = useState('[네트웍스]광주식품');
  const [items, setItems] = useState<ReturnRegRow[]>(INITIAL_RETURN_ITEMS);

  const handleCellChange = (id: number, colKey: string, val: any) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.id === id) {
          const updated = { ...row, [colKey]: val };
          if (colKey === 'returnQty' || colKey === 'unitPrice') {
            const q = colKey === 'returnQty' ? Number(val) || 0 : row.returnQty;
            const p = colKey === 'unitPrice' ? Number(val) || 0 : row.unitPrice;
            updated.returnAmount = q * p;
          }
          return updated;
        }
        return row;
      })
    );
  };

  const handleNew = () => {
    const newItem: ReturnRegRow = {
      id: Date.now(),
      orderNo: `ORD-261030-${String(items.length + 1).padStart(2, '0')}`,
      category: '원재료',
      variety: '기타',
      itemName: '신규 반품 자재(입력)',
      spec: '표준규격',
      unit: 'ea',
      returnQty: 1,
      unitPrice: 10000,
      returnAmount: 10000,
      returnReason: '품질 불량',
      remark: '',
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleSave = async () => {
    try {
      const res = await fetch('/api/inventory/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnDate: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
          partnerName: vendor,
          items,
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
        alert(`반품등록이 완료되었습니다!\n(${data.message || '현재고 및 자재수불부에 반영되었습니다.'})`);
      } else {
        alert('반품등록 실패: ' + (data?.error || `HTTP ${res.status}`));
      }
    } catch (err: any) {
      alert('반품등록 중 오류가 발생했습니다: ' + (err?.message || '네트워크 오류'));
    }
  };

  const handleReset = () => {
    setItems(INITIAL_RETURN_ITEMS);
    alert('반품등록 내용이 초기화되었습니다.');
  };

  const COLUMNS: InventoryGridColumnDef[] = [
    { key: 'orderNo', label: '주문번호', width: '110px', align: 'center' },
    { key: 'category', label: '구분', width: '65px', align: 'center' },
    { key: 'variety', label: '품종', width: '80px', align: 'center' },
    { key: 'itemName', minWidth: '260px', label: '품명', align: 'left' },
    { key: 'spec', label: '규격', width: '100px', align: 'center' },
    { key: 'unit', label: '단위', width: '50px', align: 'center' },
    { key: 'returnQty', label: '반품수량', width: '80px', align: 'right', format: 'number', editable: true },
    { key: 'unitPrice', label: '단가', width: '85px', align: 'right', format: 'currency', editable: true },
    { key: 'returnAmount', label: '반품금액', width: '105px', align: 'right', format: 'currency' },
    { key: 'returnReason', label: '반품사유', width: '180px', align: 'left', editable: true },
    { key: 'remark', label: '비고', width: '140px', align: 'left', editable: true },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <InventoryActionBar
        title="반품등록"
        buttons={[
          { key: 'new', label: '신규', icon: 'new', onClick: handleNew },
          { key: 'search', label: '조회', icon: 'search', onClick: () => alert('반품 대상 자재가 조회되었습니다.') },
          { key: 'save', label: '저장', icon: 'save', onClick: handleSave },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: handleReset },
        ]}
        helpContent="불량, 파손, 규격 오배송 등 공급사 매입처로 반품할 원부자재 항목과 수량 및 단가를 등록합니다."
      />

      {/* 2. 조회 조건바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700 flex items-center gap-1">
              <Calendar size={13} className="text-blue-700" />
              기준일자:
            </span>
            <input
              type="text"
              value={baseDate}
              onChange={(e) => setBaseDate(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] font-medium rounded-xs shadow-2xs w-[185px] text-center"
            />
          </div>

          <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
            <span className="font-semibold text-gray-700">매입처:</span>
            <select
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] rounded-xs shadow-2xs focus:outline-blue-500 font-medium"
            >
              {VENDOR_OPTIONS.filter((v) => v !== 'ALL').map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-mono font-bold shadow-2xs">
            LblCnt_M: <span className="text-blue-700">{items.length}</span> 건
          </span>
        </div>
      </div>

      {/* 3. 단일 입력 그리드 */}
      <div className="flex-1 min-h-0 p-2">
        <div className="h-full flex flex-col bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="flex-1 min-h-0">
            <InventoryDataGrid
              columns={COLUMNS}
              data={items}
              onCellChange={handleCellChange}
              summaryRowTitle="합계"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

