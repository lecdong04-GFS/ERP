'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { InventoryActionBar } from '../common/InventoryActionBar';
import { InventoryDataGrid, InventoryGridColumnDef } from '../common/InventoryDataGrid';
import { Calendar, RotateCw } from 'lucide-react';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function toLocalISODate(d: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface FoodWasteSummaryRow {
  id: number;
  dischargeDate: string;
  wasteQty: number;
}

interface FoodWasteDetailRow {
  id: number;
  dischargeDate: string;
  gyeName: string;
  wasteQty: number;
}


export const FoodWasteStatusView: React.FC = () => {
  const [startDate, setStartDate] = useState(kstToday);
  const [endDate, setEndDate] = useState(kstToday);
  const [periodType, setPeriodType] = useState('일간');
  const [selectedDate, setSelectedDate] = useState<string>(kstToday());
  const [details, setDetails] = useState<FoodWasteDetailRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadFoodWaste = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/production/food-waste', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: FoodWasteDetailRow[] = json.data.map((item: any, idx: number) => ({
          id: item.id ?? idx + 1,
          dischargeDate: String(item.wasteDate || '').slice(0, 10) || kstToday(),
          gyeName: String(item.gyeName || item.gyeId || '미지정'),
          wasteQty: Number(item.wasteQty) || 0,
        }));
        setDetails(mapped);
        const dates = [...new Set(mapped.map((d) => d.dischargeDate))].sort();
        if (dates.length > 0) {
          const latest = dates[dates.length - 1];
          setStartDate(latest);
          setEndDate(latest);
          setSelectedDate(latest);
        }
      } else {
        setDetails([]);
      }
    } catch (err) {
      console.error('Fetch food-waste failed:', err);
      setDetails([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadFoodWaste();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기간 내 일자별 합계 (요약 그리드용 — 실측 집계)
  const summaries = useMemo(() => {
    const map = new Map<string, number>();
    details.forEach((d) => {
      if (d.dischargeDate < startDate || d.dischargeDate > endDate) return;
      map.set(d.dischargeDate, (map.get(d.dischargeDate) || 0) + (Number(d.wasteQty) || 0));
    });
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([dischargeDate, wasteQty], idx) => ({ id: idx + 1, dischargeDate, wasteQty: Math.round(wasteQty) }));
  }, [details, startDate, endDate]);

  const handleShiftDay = (direction: -1 | 1) => {
    const cur = new Date(startDate + 'T00:00:00');
    cur.setDate(cur.getDate() + direction);
    const newStr = toLocalISODate(cur);
    setStartDate(newStr);
    setEndDate(newStr);
    setSelectedDate(newStr);
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

    const filteredDetails = details.filter((d) => d.dischargeDate === selectedDate);
    const displayDetails = filteredDetails;

  const SUMMARY_COLUMNS: InventoryGridColumnDef[] = [
    { key: 'dischargeDate', label: '배출일', width: '120px', align: 'center', format: 'date' },
    { key: 'wasteQty', label: '폐기량(kg)', width: '120px', align: 'right', format: 'number' },
  ];

  const DETAIL_COLUMNS: InventoryGridColumnDef[] = [
    { key: 'gyeName', label: '계명칭', width: '160px', align: 'left' },
    { key: 'wasteQty', label: '폐기량(kg)', width: '130px', align: 'right', format: 'number' },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <InventoryActionBar
        title="음식물쓰레기현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', onClick: () => void loadFoodWaste() },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: () => { const t = kstToday(); setStartDate(t); setEndDate(t); setSelectedDate(t); setPeriodType('일간'); void loadFoodWaste(); } },
        ]}
        helpContent="일자별 음식물쓰레기 총 배출량 및 각 공정/작업장 계별 배출 비중을 분석합니다."
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
          <button
            type="button"
            onClick={() => void loadFoodWaste()}
            className="p-1 text-gray-600 hover:text-blue-700 hover:bg-gray-200 rounded border border-gray-300 bg-white cursor-pointer shadow-2xs"
            title="새로고침"
          >
            <RotateCw size={13} />
          </button>
        </div>
      </div>

      {/* 3. 좌우 2분할 레이아웃 (좌측 약 30% : 우측 약 70%) */}
      <div className="flex-1 flex min-h-0 p-2 gap-2">
        {/* 좌측: 요약 그리드 */}
        <div className="w-[300px] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs shrink-0">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <span className="font-bold text-gray-800">요약</span>
            <span className="text-[11px] text-gray-600 font-medium">
              데이터수: <span className="font-bold text-blue-700">{summaries.length}</span>
            </span>
          </div>

          <div className="flex-1 min-h-0">
            <InventoryDataGrid
              columns={SUMMARY_COLUMNS}
              data={summaries}
              selectedRowId={summaries.find((x) => x.dischargeDate === selectedDate)?.id}
              onRowClick={(row) => setSelectedDate(row.dischargeDate)}
              summaryValues={{
                wasteQty: 0,
              }}
              summaryRowTitle="합계"
            />
          </div>
        </div>

        {/* 우측: 내역 그리드 */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">공정별 내역 ▶</span>
              <span className="text-[11px] text-blue-900 bg-blue-100 px-2 py-0.2 rounded border border-blue-300 font-semibold">
                배출일: {selectedDate}
              </span>
            </div>
            <span className="text-[11px] text-gray-600 font-medium">
              공정수: <span className="font-bold text-blue-700">{displayDetails.length}</span> 개소
            </span>
          </div>

          <div className="flex-1 min-h-0">
            <InventoryDataGrid
              columns={DETAIL_COLUMNS}
              data={displayDetails}
              summaryValues={{
                wasteQty: 0,
              }}
              summaryRowTitle="합계"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

