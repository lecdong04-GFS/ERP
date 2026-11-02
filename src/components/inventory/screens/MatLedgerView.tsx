'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { InventoryActionBar } from '../common/InventoryActionBar';
import { InventoryDataGrid, InventoryGridColumnDef } from '../common/InventoryDataGrid';
import { Calendar } from 'lucide-react';
import { usePipeline } from '@/context/PipelineContext';
import { usePrintReport } from '@/context/PrintReportContext';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 N일 전 YYYY-MM-DD */
function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

/** 로컬 자정 기준 Date → YYYY-MM-DD (UTC 변환 오차 방지) */
function toLocalISODate(d: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface MatLedgerRow {
  id: number;
  ledgerDate: string;
  category: string;
  partName: string;
  partSpec: string;
  unit: string;
  warehouse: string;
  carriedOverQty: number; // 이월재고량
  inQty: number; // 입고량
  outQty: number; // 출고량
  currentStock: number; // 현재고 = 이월 + 입고 - 출고
}

export const MatLedgerView: React.FC = () => {
  const { depletedMaterials, openPipelineModal } = usePipeline();
  const { openPrintModal } = usePrintReport();
  const [startDate, setStartDate] = useState(() => kstDaysAgo(29));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [periodType, setPeriodType] = useState('일간');
  const [ledgerData, setLedgerData] = useState<MatLedgerRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadLedger = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/inventory/ledger', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setLedgerData(json.data.map((item: any, idx: number) => ({
          id: item.id ?? idx + 1,
          ledgerDate: item.ledgerDate || String(item.createdAt || '').slice(0, 10),
          category: item.category || '원재료',
          partName: item.productName || item.product?.name || '',
          partSpec: item.product?.spec || '',
          unit: item.unit || 'ea',
          warehouse: item.warehouse || '',
          carriedOverQty: Number(item.carryOverQty) || 0,
          inQty: Number(item.inQty) || 0,
          outQty: Number(item.outQty) || 0,
          currentStock: Number(item.currentQty) || 0,
        })));
      } else {
        setLedgerData([]);
      }
    } catch (err) {
      console.error('Fetch ledger failed:', err);
      setLedgerData([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  // Live integration with Pipeline Material Depletions
  const activeLedgerData: MatLedgerRow[] =
    depletedMaterials.length > 0
      ? depletedMaterials.map((m) => ({
          id: m.id,
          ledgerDate: m.ledgerDate,
          category: m.category,
          partName: m.partName,
          partSpec: m.partSpec,
          unit: m.unit,
          warehouse: m.warehouse,
          carriedOverQty: m.carriedOverQty,
          inQty: m.inQty,
          outQty: m.outQty,
        currentStock: m.currentStock,
      }))
    : ledgerData;

  // 기간 필터 (API는 전체 조회 → 화면에서 구간 필터)
  const visibleLedgerData = useMemo(
    () => activeLedgerData.filter((r) => (r.ledgerDate || '') >= startDate && (r.ledgerDate || '') <= endDate),
    [activeLedgerData, startDate, endDate]
  );

  const handleShiftDay = (direction: -1 | 1) => {
    const cur = new Date(startDate + 'T00:00:00');
    cur.setDate(cur.getDate() + direction);
    const newStr = toLocalISODate(cur);
    setStartDate(newStr);
    setEndDate(newStr);
  };

  const handlePeriodChange = (val: string) => {
    setPeriodType(val);
    const cur = new Date(startDate + 'T00:00:00');
    if (val === '일간') {
      setEndDate(startDate);
    } else if (val === '주간') {
      const end = new Date(cur);
      end.setDate(end.getDate() + 6);
        setEndDate(toLocalISODate(end));
    } else if (val === '월간') {
      const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
        setEndDate(toLocalISODate(end));
    }
  };

  const COLUMNS: InventoryGridColumnDef[] = [
    { key: 'ledgerDate', label: '수불일자', width: '90px', align: 'center', format: 'date' },
    { key: 'category', label: '구분', width: '65px', align: 'center' },
    { key: 'partName', minWidth: '260px', label: '파트명', align: 'left' },
    { key: 'partSpec', label: '파트규격', width: '110px', align: 'center' },
    { key: 'unit', label: '단위', width: '50px', align: 'center' },
    { key: 'warehouse', label: '창고', width: '100px', align: 'center' },
    { key: 'carriedOverQty', label: '이월재고량', width: '90px', align: 'right', format: 'number' },
    { key: 'inQty', label: '입고량', width: '85px', align: 'right', format: 'number' },
    { key: 'outQty', label: '출고량', width: '85px', align: 'right', format: 'number' },
    {
      key: 'currentStock',
      label: '현재고',
      width: '95px',
      align: 'right',
      render: (val, row) => {
        // Automatic calculation: carriedOver + inQty - outQty
        const calcStock = (row.carriedOverQty || 0) + (row.inQty || 0) - (row.outQty || 0);
        return (
          <span className={`font-mono font-bold ${calcStock < 0 ? 'text-red-600' : 'text-blue-800'}`}>
            {calcStock.toLocaleString()}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <InventoryActionBar
        title="자재수불부"
        buttons={[
          { key: 'pipeline', label: '⚡자동파이프라인', icon: 'search', onClick: openPipelineModal },
          { key: 'print', label: '수불부인쇄(A4)', icon: 'print', onClick: () => openPrintModal('MATERIAL_LEDGER') },
          { key: 'search', label: '조회', icon: 'search', onClick: () => void loadLedger() },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: () => { const s = kstDaysAgo(29); const t = kstToday(); setStartDate(s); setEndDate(t); setPeriodType('일간'); void loadLedger(); } },
        ]}
        helpContent="원재료 및 부재료의 일자별 기초 이월재고, 입고량, 생산출고량 및 기말 현재고 수불 변동을 추적합니다."
      />

      {/* 2. 조회 조건바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex flex-wrap items-center justify-between gap-3 shadow-inner">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700 flex items-center gap-1">
              <Calendar size={13} className="text-blue-700" />
              기간:
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-0.5 text-[12px] font-mono rounded-xs shadow-2xs"
            />
            <span className="text-gray-500">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-0.5 text-[12px] font-mono rounded-xs shadow-2xs"
            />
            <div className="flex items-center ml-0.5">
              <button
                type="button"
                onClick={() => handleShiftDay(-1)}
                className="px-1.5 py-0.5 bg-[#4a72b2] hover:bg-[#3b5e96] text-white rounded-l-xs text-[11px] font-bold"
                title="이전일"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={() => handleShiftDay(1)}
                className="px-1.5 py-0.5 bg-[#4a72b2] hover:bg-[#3b5e96] text-white rounded-r-xs text-[11px] font-bold border-l border-blue-400"
                title="다음일"
              >
                &gt;
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-gray-300 text-[11px]">
            {['일간', '주간', '월간', '분기', '반기', '연간'].map((mode) => (
              <label key={mode} className="flex items-center gap-1 cursor-pointer font-medium text-gray-800">
                <input
                  type="radio"
                  name="periodType"
                  value={mode}
                  checked={periodType === mode}
                  onChange={() => handlePeriodChange(mode)}
                  className="accent-blue-600 cursor-pointer"
                />
                {mode}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-semibold shadow-2xs">
            데이터수: <span className="text-blue-700 font-bold">{visibleLedgerData.length}</span> 건
          </span>
        </div>
      </div>

      {/* 3. 전체 폭 단일 그리드 */}
      <div className="flex-1 min-h-0 p-2">
        <div className="h-full flex flex-col bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="flex-1 min-h-0">
            {loadingList ? (
              <div className="h-full flex items-center justify-center bg-white text-gray-400 text-[12px]">
                불러오는 중...
              </div>
            ) : (
              <InventoryDataGrid
                columns={COLUMNS}
                data={visibleLedgerData}
                summaryRowTitle="합계"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
