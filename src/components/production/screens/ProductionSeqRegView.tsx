'use client';

import React, { useState, useEffect } from 'react';
import { ProductionActionBar } from '../common/ProductionActionBar';
import { ProductionDataGrid, ProductionGridColumnDef } from '../common/ProductionDataGrid';
import { GYE_MASTER_LIST } from '../data/productionMasterData';
import { MoveUp, MoveDown, Plus, Trash2 } from 'lucide-react';

interface ProdSeqItem {
  id: number;
  gyeId: string;
  workSeq: number;
  category: string;
  partName: string;
  partSpec: string;
  unit: string;
  nextProcess: string;
}

const SAMPLE_SEQ_DATA: ProdSeqItem[] = [
  // 성형장(김밥) - GFS005
  { id: 1, gyeId: 'GFS005', workSeq: 1, category: '완제품', partName: '참치마요김밥(밥김)', partSpec: '230g*1줄', unit: 'ea', nextProcess: '포장/금검' },
  { id: 2, gyeId: 'GFS005', workSeq: 2, category: '완제품', partName: '매콤제육김밥', partSpec: '240g*1줄', unit: 'ea', nextProcess: '포장/금검' },
  { id: 3, gyeId: 'GFS005', workSeq: 3, category: '완제품', partName: '소고기전주비빔김밥', partSpec: '235g*1줄', unit: 'ea', nextProcess: '포장/금검' },
  { id: 4, gyeId: 'GFS005', workSeq: 4, category: '완제품', partName: '유부우엉우엉김밥', partSpec: '220g*1줄', unit: 'ea', nextProcess: '포장/금검' },
  // 성형장(삼각김밥) - GFS007
  { id: 5, gyeId: 'GFS007', workSeq: 1, category: '완제품', partName: '참치마요삼각김밥', partSpec: '110g*1개', unit: 'ea', nextProcess: '포장/금검' },
  { id: 6, gyeId: 'GFS007', workSeq: 2, category: '완제품', partName: '전주비빔삼각김밥', partSpec: '115g*1개', unit: 'ea', nextProcess: '포장/금검' },
  { id: 7, gyeId: 'GFS007', workSeq: 3, category: '완제품', partName: '스팸김치볶음삼각', partSpec: '110g*1개', unit: 'ea', nextProcess: '포장/금검' },
  // 성형장(도시락) - GFS004
  { id: 8, gyeId: 'GFS004', workSeq: 1, category: '완제품', partName: '11가지찬많은도시락', partSpec: '460g*1팩', unit: 'ea', nextProcess: '수축/포장' },
  { id: 9, gyeId: 'GFS004', workSeq: 2, category: '완제품', partName: '치킨마요덮밥도시락', partSpec: '410g*1팩', unit: 'ea', nextProcess: '수축/포장' },
  { id: 10, gyeId: 'GFS004', workSeq: 3, category: '완제품', partName: '고추장불고기정식도시락', partSpec: '430g*1팩', unit: 'ea', nextProcess: '수축/포장' },
  // 취반(미반류) - GFS152
  { id: 11, gyeId: 'GFS152', workSeq: 1, category: '반제품', partName: '백미 초밥미반(김밥용)', partSpec: '50kg*1통', unit: 'kg', nextProcess: '성형장(김밥)' },
  { id: 12, gyeId: 'GFS152', workSeq: 2, category: '반제품', partName: '전주비빔 조미밥', partSpec: '50kg*1통', unit: 'kg', nextProcess: '성형장(삼각)' },
  { id: 13, gyeId: 'GFS152', workSeq: 3, category: '반제품', partName: '도시락용 쌀밥', partSpec: '50kg*1통', unit: 'kg', nextProcess: '성형장(도시락)' },
  // 조리실(볶음) - GFS552
  { id: 14, gyeId: 'GFS552', workSeq: 1, category: '반제품', partName: '제육볶음 토핑(도시락용)', partSpec: '20kg/배치', unit: 'kg', nextProcess: '냉각실(급랭)' },
  { id: 15, gyeId: 'GFS552', workSeq: 2, category: '반제품', partName: '간장소불고기(김밥용)', partSpec: '20kg/배치', unit: 'kg', nextProcess: '냉각실(급랭)' },
];

export const ProductionSeqRegView: React.FC = () => {
  const [selectedGyeId, setSelectedGyeId] = useState<string>('GFS005');
  const [seqList, setSeqList] = useState<ProdSeqItem[]>(SAMPLE_SEQ_DATA);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(1);

  useEffect(() => {
    fetch(`/api/production/seq?gyeId=${selectedGyeId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loaded: ProdSeqItem[] = json.data.map((item: any) => ({
            id: item.id,
            gyeId: item.gyeId,
            workSeq: item.processOrder,
            category: '완제품',
            partName: item.productName || '제품',
            partSpec: '',
            unit: 'ea',
            nextProcess: item.nextProcess || '',
          }));
          setSeqList(loaded);
        }
      })
      .catch((err) => console.error('Failed to load production seq', err));
  }, [selectedGyeId]);

  const selectedGye = GYE_MASTER_LIST.find((g) => g.id === selectedGyeId) || GYE_MASTER_LIST[0];

  const currentItems = seqList
    .filter((item) => item.gyeId === selectedGyeId)
    .sort((a, b) => a.workSeq - b.workSeq);

  const displayItems = currentItems.length > 0 ? currentItems : [
    { id: 991, gyeId: selectedGyeId, workSeq: 1, category: '반제품', partName: `${selectedGye.name} 공정품 1`, partSpec: '표준규격', unit: 'ea', nextProcess: '다음공정' },
  ];

  const handleMove = (direction: -1 | 1) => {
    if (!selectedItemId) return;
    const idx = displayItems.findIndex((it) => it.id === selectedItemId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= displayItems.length) return;

    const curItem = displayItems[idx];
    const targetItem = displayItems[targetIdx];

    // Swap workSeq
    const curSeq = curItem.workSeq;
    const targetSeq = targetItem.workSeq;

    setSeqList((prev) =>
      prev.map((it) => {
        if (it.id === curItem.id) return { ...it, workSeq: targetSeq };
        if (it.id === targetItem.id) return { ...it, workSeq: curSeq };
        return it;
      })
    );
  };

  const handleSave = async () => {
    try {
      for (const item of currentItems) {
        const res = await fetch('/api/production/seq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gyeId: selectedGyeId,
            gyeName: selectedGye.name,
            productName: item.partName,
            processOrder: item.workSeq,
            nextProcess: item.nextProcess,
          }),
        });
        const raw = await res.text();
        let json: any = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `저장 실패 (HTTP ${res.status})`);
        }
      }
      alert(`[${selectedGye.name}] 생산순서 변경사항이 데이터베이스에 안전하게 저장되었습니다.`);
    } catch (err: any) {
      alert('저장 중 오류: ' + err.message);
    }
  };

  // Left columns
  const LEFT_COLUMNS: ProductionGridColumnDef[] = [
    { key: 'id', label: '계id', width: '85px', align: 'center' },
    { key: 'name', label: '계명칭', width: '140px', align: 'left' },
  ];

  // Right columns
  const RIGHT_COLUMNS: ProductionGridColumnDef[] = [
    { key: 'workSeq', label: '작업순서', width: '70px', align: 'center', format: 'number' },
    { key: 'category', label: '구분', width: '70px', align: 'center' },
    { key: 'partName', minWidth: '260px', label: '파트명', align: 'left' },
    { key: 'partSpec', label: '파트규격', width: '120px', align: 'center' },
    { key: 'unit', label: '단위', width: '55px', align: 'center' },
    { key: 'nextProcess', label: '다음공정', width: '140px', align: 'left' },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <ProductionActionBar
        title="생산순서등록(GSR)"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', onClick: () => alert('생산순서가 조회되었습니다.') },
          { key: 'save', label: '저장', icon: 'save', onClick: handleSave },
        ]}
        helpContent="각 작업장 계별 당일 생산 투입 순서를 정의하고 우선순위 배치(Batch) 순서를 조정합니다."
      />

      {/* 2. 빈 조건바 영역 (높이 유지) */}
      <div className="h-[32px] bg-[#efefef] border-b border-[#c0c0c0] px-3 flex items-center justify-between shadow-inner">
        <span className="text-[11px] text-gray-600 font-medium">
          작업장 계 선택 후 우측에서 생산 품목의 우선순위 순서를 조정할 수 있습니다.
        </span>
        <span className="text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-semibold shadow-2xs">
          선택 계: <span className="text-blue-700 font-bold">{selectedGye.id} - {selectedGye.name}</span>
        </span>
      </div>

      {/* 3. 좌우 2분할 레이아웃 (좌측 약 26% : 우측 약 74%) */}
      <div className="flex-1 flex min-h-0 p-2 gap-2">
        {/* 좌측: 계 그리드 */}
        <div className="w-[270px] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs shrink-0">
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

        {/* 우측: 생산품목 그리드 */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">생산품목 ▶</span>
              <span className="text-[11px] text-blue-900 bg-blue-100 px-2 py-0.2 rounded border border-blue-300 font-semibold">
                {selectedGye.name}
              </span>
            </div>

            {/* 순서 조정 버튼들 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleMove(-1)}
                className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded text-[11px] flex items-center gap-1 border border-gray-400 cursor-pointer shadow-2xs"
                title="위로 이동"
              >
                <MoveUp size={12} /> 위로
              </button>
              <button
                type="button"
                onClick={() => handleMove(1)}
                className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded text-[11px] flex items-center gap-1 border border-gray-400 cursor-pointer shadow-2xs"
                title="아래로 이동"
              >
                <MoveDown size={12} /> 아래로
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <ProductionDataGrid
              columns={RIGHT_COLUMNS}
              data={displayItems}
              selectedRowId={selectedItemId}
              onRowClick={(row) => setSelectedItemId(row.id)}
              summaryRow={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

