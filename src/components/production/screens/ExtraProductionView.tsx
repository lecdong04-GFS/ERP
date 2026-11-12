'use client';

import React, { useState, useEffect } from 'react';
import { ProductionActionBar } from '../common/ProductionActionBar';
import { ProductionDataGrid, ProductionGridColumnDef } from '../common/ProductionDataGrid';
import { GYE_MASTER_LIST } from '../data/productionMasterData';
import { Calendar, RotateCw, Plus } from 'lucide-react';

interface ExtraProdItem {
  id: number;
  gyeId: string;
  category: string;
  partName: string;
  partSpec: string;
  unit: string;
  extraQty: number;
  shift: string;
}

const SAMPLE_EXTRA_PROD: ExtraProdItem[] = [
  // 성형장(김밥)
  { id: 1, gyeId: 'GFS005', category: '완제품', partName: '참치마요김밥(밥김)', partSpec: '230g*1줄', unit: 'ea', extraQty: 200, shift: '1편' },
  { id: 2, gyeId: 'GFS005', category: '완제품', partName: '매콤제육김밥', partSpec: '240g*1줄', unit: 'ea', extraQty: 150, shift: '1편' },
  { id: 3, gyeId: 'GFS005', category: '반제품', partName: '김밥용 볶음김치토핑', partSpec: '5kg*1통', unit: 'kg', extraQty: 25, shift: '2편' },
  // 성형장(삼각김밥)
  { id: 4, gyeId: 'GFS007', category: '완제품', partName: '참치마요삼각김밥', partSpec: '110g*1개', unit: 'ea', extraQty: 500, shift: '1편' },
  { id: 5, gyeId: 'GFS007', category: '완제품', partName: '전주비빔삼각김밥', partSpec: '115g*1개', unit: 'ea', extraQty: 300, shift: '2편' },
  // 성형장(도시락)
  { id: 6, gyeId: 'GFS004', category: '완제품', partName: '11가지찬많은도시락', partSpec: '460g*1팩', unit: 'ea', extraQty: 100, shift: '1편' },
  { id: 7, gyeId: 'GFS004', category: '완제품', partName: '치킨마요덮밥도시락', partSpec: '410g*1팩', unit: 'ea', extraQty: 80, shift: '2편' },
  // 조리실(볶음)
  { id: 8, gyeId: 'GFS552', category: '반제품', partName: '제육볶음 토핑소스', partSpec: '20kg/배치', unit: 'kg', extraQty: 40, shift: '1편' },
  { id: 9, gyeId: 'GFS552', category: '반제품', partName: '간장불고기 토핑', partSpec: '20kg/배치', unit: 'kg', extraQty: 30, shift: '2편' },
];

export const ExtraProductionView: React.FC = () => {
  const [baseDate, setBaseDate] = useState('2026년 10월 30일 금요일');
  const [selectedGyeId, setSelectedGyeId] = useState<string>('GFS005');
  const [extraList, setExtraList] = useState<ExtraProdItem[]>(SAMPLE_EXTRA_PROD);

  useEffect(() => {
    fetch('/api/production/extra')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loaded: ExtraProdItem[] = json.data.map((r: any) => ({
            id: r.id,
            gyeId: r.gyeId || 'GFS005',
            category: '완제품',
            partName: r.productName,
            partSpec: r.spec,
            unit: 'ea',
            extraQty: r.extraQty,
            shift: (r.shift as '1편' | '2편') || '1편',
          }));
          setExtraList(loaded);
        }
      })
      .catch((err) => console.error('Failed to load extra productions', err));
  }, []);

  const selectedGye = GYE_MASTER_LIST.find((g) => g.id === selectedGyeId) || GYE_MASTER_LIST[0];

  // Filtered right items
  const currentItems = extraList.filter((item) => item.gyeId === selectedGyeId);
  const displayItems = currentItems.length > 0 ? currentItems : [
    { id: 991, gyeId: selectedGyeId, category: '반제품', partName: `${selectedGye.name} 추가생산품`, partSpec: '규격미정', unit: 'ea', extraQty: 0, shift: '1편' },
  ];

  const handleCellChange = (id: number, colKey: string, val: any) => {
    if (colKey === 'extraQty') {
      const num = Number(val) || 0;
      setExtraList((prev) =>
        prev.map((item) => (item.id === id ? { ...item, extraQty: num } : item))
      );
    }
  };

  const handleSave = async () => {
    try {
      for (const item of currentItems) {
        const res = await fetch('/api/production/extra', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gyeId: selectedGyeId,
            gyeName: selectedGye.name,
            productName: item.partName,
            spec: item.partSpec,
            extraQty: item.extraQty,
            shift: item.shift,
            reason: '긴급 추가생산',
          }),
        });
        const raw = await res.text();
        let json: any = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `저장 실패 (HTTP ${res.status})`);
        }
      }
      alert('추가생산 요청이 데이터베이스에 성공적으로 저장되었습니다.');
    } catch (err: any) {
      alert('저장 중 오류: ' + err.message);
    }
  };

  const handleReset = () => {
    setExtraList(SAMPLE_EXTRA_PROD);
    alert('추가생산 데이터가 초기화되었습니다.');
  };

  // Left columns
  const LEFT_COLUMNS: ProductionGridColumnDef[] = [
    { key: 'name', label: '계명칭', width: '170px', align: 'left', filterable: false },
  ];

  // Right columns
  const RIGHT_COLUMNS: ProductionGridColumnDef[] = [
    { key: 'category', label: '구분', width: '70px', align: 'center' },
    { key: 'partName', minWidth: '260px', label: '파트명', align: 'left' },
    { key: 'partSpec', label: '파트규격', width: '110px', align: 'center' },
    { key: 'unit', label: '단위', width: '50px', align: 'center' },
    { key: 'extraQty', label: '추가생산량', width: '95px', align: 'right', format: 'number', editable: true },
    { key: 'shift', label: '편수', width: '70px', align: 'center' },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <ProductionActionBar
        title="추가생산(GSR)"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', onClick: () => alert('추가생산 내역이 조회되었습니다.') },
          { key: 'save', label: '저장', icon: 'save', onClick: handleSave },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: handleReset },
        ]}
        helpContent="긴급 발주나 결품 대응을 위한 일일 추가생산 계획을 계별로 등록하고 생산지시를 생성합니다."
      />

      {/* 2. 조회 조건바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
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

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-semibold shadow-2xs">
            선택 공정: <span className="text-blue-700 font-bold">{selectedGye.id} - {selectedGye.name}</span>
          </span>
          <button
            type="button"
            onClick={() => alert('새로고침 완료')}
            className="p-1 text-gray-600 hover:text-blue-700 hover:bg-gray-200 rounded border border-gray-300 bg-white cursor-pointer shadow-2xs"
            title="새로고침"
          >
            <RotateCw size={13} />
          </button>
        </div>
      </div>

      {/* 3. 좌우 2분할 레이아웃 (좌측 약 28% : 우측 약 72%) */}
      <div className="flex-1 flex min-h-0 p-2 gap-2">
        {/* 좌측: 계 목록 */}
        <div className="w-[280px] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs shrink-0">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <span className="font-bold text-gray-800">계</span>
            <span className="text-[11px] font-mono text-gray-600 font-bold bg-white px-1.5 py-0.2 rounded border border-gray-300">
              46
            </span>
          </div>

          <div className="flex-1 min-h-0">
            <ProductionDataGrid
              columns={LEFT_COLUMNS}
              data={GYE_MASTER_LIST}
              selectedRowId={selectedGye.no}
              onRowClick={(row) => setSelectedGyeId(row.id)}
              summaryRow={false}
            />
          </div>
        </div>

        {/* 우측: 내역 그리드 */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">내역 ▶</span>
              <span className="text-[11px] text-blue-900 bg-blue-100 px-2 py-0.2 rounded border border-blue-300 font-semibold">
                {selectedGye.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-600 font-medium">
                등록품목: <span className="font-bold text-blue-700">{displayItems.length}</span> 건
              </span>
              <button
                type="button"
                onClick={() => {
                  const newItem: ExtraProdItem = {
                    id: Date.now(),
                    gyeId: selectedGyeId,
                    category: '완제품',
                    partName: '신규 추가품목',
                    partSpec: '규격입력',
                    unit: 'ea',
                    extraQty: 50,
                    shift: '1편',
                  };
                  setExtraList((prev) => [...prev, newItem]);
                }}
                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded text-[11px] flex items-center gap-1 shadow-2xs"
              >
                <Plus size={12} /> 품목 추가
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <ProductionDataGrid
              columns={RIGHT_COLUMNS}
              data={displayItems}
              onCellChange={handleCellChange}
              summaryValues={{}}
              summaryRowTitle=""
            />
          </div>
        </div>
      </div>
    </div>
  );
};

