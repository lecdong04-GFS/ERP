'use client';

import React, { useState, useEffect } from 'react';
import { InventoryActionBar } from '../common/InventoryActionBar';
import { InventoryDataGrid, InventoryGridColumnDef } from '../common/InventoryDataGrid';
import { Calendar } from 'lucide-react';

interface UnusedUseItem {
  id: number;
  useDate: string;
  itemCode: string;
  category: string;
  partName: string;
  partSpec: string;
  unit: string;
  unusedStock: number;
  useQty: number; // 사용수량 (editable)
  purpose: string; // 사용목적 (editable)
  targetProduct: string; // 대체투입 완제품 (editable)
}

const INITIAL_UNUSED_USE: UnusedUseItem[] = [
  { id: 1, useDate: '2026-10-30', itemCode: 'SM-OLD-01', category: '부재료', partName: '구형 샌드위치 필름(2025버전)', partSpec: '500m/롤', unit: '롤', unusedStock: 25, useQty: 5, purpose: '연구개발 테스트용', targetProduct: '시제품 개발실' },
  { id: 2, useDate: '2026-10-30', itemCode: 'RM-OLD-02', category: '원재료', partName: '계절한정 밤고구마 무스', partSpec: '1kg*10팩', unit: 'box', unusedStock: 12, useQty: 2, purpose: '대체 자재 투입', targetProduct: '고구마샐러드샌드위치' },
];

export const UnusedUseRegView: React.FC = () => {
  const [useDate, setUseDate] = useState('2026-10-30');
  const [items, setItems] = useState<UnusedUseItem[]>(INITIAL_UNUSED_USE);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/inventory/unused-material')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const mapped: UnusedUseItem[] = json.data.map((item: any, idx: number) => ({
            id: item.id || idx + 1,
            useDate: item.assignDate || '2026-10-30',
            itemCode: item.productCode || `SM-OLD-${idx + 1}`,
            category: item.category || '부재료',
            partName: item.productName || item.productCode || '불용품목',
            partSpec: '표준규격',
            unit: item.unit || 'ea',
            unusedStock: Number(item.assignQty) || 0,
            useQty: Number(item.useQty) || 0,
            purpose: item.usePurpose || '연구개발 테스트용',
            targetProduct: '대체투입처',
          }));
          setItems(mapped);
        }
      })
      .catch((err) => console.error('Fetch unused for use failed:', err));
  }, []);

  const handleCellChange = (id: number, colKey: string, val: any) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [colKey]: val } : it))
    );
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      let savedCount = 0;
      for (const item of items) {
        if (item.useQty > 0) {
          const res = await fetch('/api/inventory/unused-material', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'use',
              id: item.id,
              useQty: item.useQty,
              usePurpose: item.purpose,
            }),
          });
          const raw = await res.text();
          let json: any = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
          if (!res.ok || !json?.success) {
            throw new Error(json?.error || `저장 실패 (HTTP ${res.status})`);
          }
          savedCount++;
        }
      }
      if (savedCount === 0) {
        alert('사용 수량이 0보다 큰 항목이 없습니다.');
      } else {
        alert(`불용자재 사용 등록 ${savedCount}건이 저장되었습니다.`);
      }
    } catch (e: any) {
      alert('저장 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setItems(INITIAL_UNUSED_USE);
    alert('초기화되었습니다.');
  };

  const COLUMNS: InventoryGridColumnDef[] = [
    { key: 'useDate', label: '사용일자', width: '100px', align: 'center', format: 'date' },
    { key: 'itemCode', label: '품목코드', width: '100px', align: 'center' },
    { key: 'category', label: '구분', width: '70px', align: 'center' },
    { key: 'partName', minWidth: '260px', label: '파트명', align: 'left' },
    { key: 'partSpec', label: '파트규격', width: '110px', align: 'center' },
    { key: 'unit', label: '단위', width: '50px', align: 'center' },
    { key: 'unusedStock', label: '불용재고', width: '80px', align: 'right', format: 'number' },
    { key: 'useQty', label: '사용수량', width: '85px', align: 'right', format: 'number', editable: true },
    { key: 'purpose', label: '사용목적', width: '160px', align: 'left', editable: true },
    { key: 'targetProduct', label: '대체투입처', width: '180px', align: 'left', editable: true },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <InventoryActionBar
        title="불용자재사용등록"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', onClick: () => alert('조회 완료') },
          { key: 'save', label: '저장', icon: 'save', onClick: handleSave },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: handleReset },
        ]}
        helpContent="불용 지정된 원부자재를 연구개발, 테스트, 또는 타 제품 대체 원료로 출고/사용한 내역을 등록합니다."
      />

      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-700 flex items-center gap-1">
            <Calendar size={13} className="text-blue-700" />
            기준일자:
          </span>
          <input
            type="text"
            value={useDate}
            onChange={(e) => setUseDate(e.target.value)}
            className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] font-medium rounded-xs shadow-2xs w-[185px] text-center"
          />
        </div>
        <span className="text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-semibold shadow-2xs">
          등록건수: <span className="text-blue-700 font-bold">{items.length}</span> 건
        </span>
      </div>

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

