'use client';

import React from 'react';
import { CostActionBar } from '../common/CostActionBar';
import { useCost } from '../context/CostContext';
import { RotateCw, CheckCircle2 } from 'lucide-react';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { readJsonSafe } from '@/lib/http';
const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// Helper to get day-of-week string for given year, month (1-based), day
function getDayHeader(year: number, month: number, day: number): string {
  const date = new Date(year, month - 1, day);
  const dow = DAYS_OF_WEEK[date.getDay()];
  return `${day}(${dow})`;
}

export const OverheadRegView: React.FC = () => {
  const {
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    fixedOverheads,
    updateFixedOverhead,
    totalFixedOverhead,
    dailyVariableOverheads,
    updateDailyVariableOverhead,
    totalVariableOverhead,
    totalOverhead,
    allocateOverheadToProducts,
  } = useCost();

  const [allocResult, setAllocResult] = React.useState<string | null>(null);

  // 31 days in October (or days in month)
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const dayIndices = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Daily totals for bottom summary row
  const dailyTotals = React.useMemo(() => {
    const totals = new Array(daysInMonth).fill(0);
    dailyVariableOverheads.forEach((item) => {
      item.dailyValues.forEach((val, dIdx) => {
        if (dIdx < daysInMonth) {
          totals[dIdx] += val || 0;
        }
      });
    });
    return totals;
  }, [dailyVariableOverheads, daysInMonth]);

  const handleAllocate = () => {
    const res = allocateOverheadToProducts();
    setAllocResult(
      `총 간접비 ${res.totalAllocated.toLocaleString()}원이 ${selectedMonth}월 ${res.count}개 제품에 매출비중 기준으로 자동 배분되었습니다.`
    );
  };

  const handleSave = async () => {
    try {
      const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const variableCosts = dailyVariableOverheads.flatMap((item) =>
        item.dailyValues.slice(0, daysInMonth).map((val, dIdx) => ({
          costItem: item.costItem,
          costDate: `${monthStr}-${String(dIdx + 1).padStart(2, '0')}`,
          dailyCost: Number(val || 0),
          remark: '',
        }))
      );
      const res = await fetch('/api/cost/overhead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          costMonth: monthStr,
          fixedCosts: fixedOverheads.map((f) => ({
            costItem: f.costItem,
            totalCost: f.totalCost,
            remark: f.remark,
          })),
          variableCosts,
        }),
      });
      const parsed = await readJsonSafe(res, '간접비 저장에 실패했습니다.');
      if (parsed.ok) {
        alert(`${selectedYear}년 ${selectedMonth}월 간접비 등록 내역(고정비·변동비)이 데이터베이스에 저장되었습니다.`);
      } else {
        alert('간접비 저장 실패: ' + parsed.errorMessage);
      }
    } catch (err: any) {
      alert('간접비 저장 중 오류가 발생했습니다: ' + (err?.message || '네트워크 오류'));
    }
  };

  const handleReset = () => {
    alert('조회 조건 및 입력창을 새로고침했습니다.');
  };

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


  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] text-[12.5px] select-none">
      {/* 1. Header Action Bar */}
      <CostActionBar
        title="간접비등록"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', onClick: () => {} },
          { key: 'save', label: '저장', icon: 'save', onClick: handleSave },
          { key: 'allocate', label: '원가배분', icon: 'allocate', onClick: handleAllocate },
        ]}
        helpContent="월간 고정간접비(전기요금, 운송비, 간접노무비, 상수도요금) 및 일별 변동간접비(직접노무비, 컴플레인 처리비용)를 등록합니다. [원가배분] 버튼 클릭 시 등록된 총 간접비가 각 제품별 매출비중에 따라 '제품별손익현황'으로 자동 배부 처리됩니다."
      />

      {/* 2. Filter Bar */}
      <div className="bg-[#e4e8ee] border-b border-[#b0b8c2] px-3 py-1.5 flex items-center justify-between gap-4 text-[12.5px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">연도</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-white border border-gray-400 rounded px-2 py-0.5 text-[12.5px] focus:outline-none focus:border-blue-600"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 ml-2">
            <span className="font-semibold text-gray-700">월</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-white border border-gray-400 rounded px-2 py-0.5 text-[12.5px] focus:outline-none focus:border-blue-600"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {allocResult && (
            <div className="flex items-center gap-1.5 ml-4 bg-emerald-50 border border-emerald-300 text-emerald-800 px-2.5 py-0.5 rounded text-[11px] animate-fadeIn">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{allocResult}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[12.5px] font-bold text-gray-700">
            데이터수: <span className="text-blue-700">{dailyVariableOverheads.length}</span>
          </span>
          <button
            onClick={handleReset}
            title="새로고침"
            className="p-1 text-gray-600 hover:text-black rounded hover:bg-gray-200 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Main Split Content (Top 35% : Bottom 65%) */}
      <div className="flex-1 p-2 bg-[#d8dde5] overflow-hidden flex flex-col gap-2">
        {/* TOP: 월간 고정간접비 집계 (35% height) */}
        <div className="h-[35%] bg-white border border-[#9aa2ad] shadow-sm flex flex-col overflow-hidden">
          <div className="bg-[#dde3ea] px-3 py-1 border-b border-[#b8c1cc] flex items-center justify-between">
            <span className="font-bold text-gray-800 text-[12.5px]">
              월간 간접비 집계 ({selectedYear}년 {selectedMonth}월 고정항목)
            </span>
            <span className="text-[11px] text-gray-600">
              고정 간접비 소계: <span className="font-bold text-blue-700">{totalFixedOverhead.toLocaleString()}</span> 원
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full border-collapse text-[12.5px]">
              <thead className="whitespace-nowrap sticky top-0 bg-[#c0c7ea] text-gray-900 border-b border-[#9aa2ad] z-10 shadow-sm">
                <tr className="h-[27px]">
                  <th className="w-16 border-r border-[#a0a8be] text-center font-bold">순번</th>
                  <th className="w-56 border-r border-[#a0a8be] text-center font-bold">
                    원가항목
                  </th>
                  <th className="w-52 border-r border-[#a0a8be] text-center font-bold">
                    원가합계
                  </th>
                  <th className="border-r border-[#a0a8be] text-center font-bold">비고</th>
                </tr>
              </thead>
              <tbody>
                {fixedOverheads.map((item, index) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-200 hover:bg-blue-50/50 transition-colors h-[27px]"
                  >
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center bg-[#f2f2f2] border-r border-gray-300 font-semibold text-gray-600">
                      {index + 1}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 border-r border-gray-300 font-medium text-gray-800">
                      {item.costItem}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 p-0 border-r border-gray-300 text-right">
                      <input
                        type="number"
                        value={item.totalCost || ''}
                        placeholder="0"
                        onChange={(e) => updateFixedOverhead(item.id, Number(e.target.value) || 0)}
                        className="w-full h-full px-2 text-right bg-white focus:bg-yellow-50 focus:outline-none font-semibold text-gray-900"
                      />
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 text-gray-600">{item.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-[#ffffcc] font-bold border-t-2 border-[#9aa2ad] z-10">
                <tr className="h-[28px]">
                  <td colSpan={2} className="text-center border-r border-[#c8c890] text-gray-900">
                    합계
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 text-right border-r border-[#c8c890] text-blue-900">
                    {totalFixedOverhead.toLocaleString()}
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 text-gray-700"></td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* BOTTOM: 일별 변동간접비 매트릭스 (65% height) */}
        <div className="flex-1 bg-white border border-[#9aa2ad] shadow-sm flex flex-col overflow-hidden">
          <div className="bg-[#dde3ea] px-3 py-1 border-b border-[#b8c1cc] flex items-center justify-between">
            <span className="font-bold text-gray-800 text-[12.5px]">
              일별 변동간접비 ({selectedYear}년 {selectedMonth}월 일자별 매트릭스)
            </span>
            <span className="text-[11px] text-gray-600">
              변동 간접비 소계: <span className="font-bold text-blue-700">{totalVariableOverhead.toLocaleString()}</span> 원 |
              총 간접비: <span className="font-bold text-purple-700">{totalOverhead.toLocaleString()}</span> 원
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full border-collapse text-[12.5px]">
              <thead className="whitespace-nowrap sticky top-0 bg-[#c0c7ea] text-gray-900 border-b border-[#9aa2ad] z-10 shadow-sm">
                <tr className="h-[27px]">
                  <th className="w-14 border-r border-[#a0a8be] text-center font-bold sticky left-0 bg-[#b0b8dc] z-20">
                    순번
                  </th>
                  <th className="w-48 border-r border-[#a0a8be] text-center font-bold sticky left-14 bg-[#b0b8dc] z-20">
                    원가항목
                  </th>
                  <th className="w-32 border-r border-[#a0a8be] text-center font-bold sticky left-[248px] bg-[#b0b8dc] z-20">
                    합계
                  </th>
                  {dayIndices.map((day) => {
                    const dowStr = getDayHeader(selectedYear, selectedMonth, day);
                    const isWeekend = dowStr.includes('(토)') || dowStr.includes('(일)');
                    return (
                      <th
                        key={day}
                        className={`min-w-[85px] border-r border-[#a0a8be] text-center font-semibold text-[11px] px-1 ${
                          isWeekend ? 'bg-[#adb6df] text-blue-900' : ''
                        }`}
                      >
                        {dowStr}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {dailyVariableOverheads.map((item, index) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-200 hover:bg-blue-50/50 transition-colors h-[27px]"
                  >
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center bg-[#f2f2f2] border-r border-gray-300 font-semibold text-gray-600 sticky left-0 z-10">
                      {index + 1}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-2 border-r border-gray-300 font-medium text-gray-800 bg-white sticky left-14 z-10 whitespace-nowrap">
                      {item.costItem}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-2 text-right border-r border-gray-300 font-bold text-blue-800 bg-[#f9fafc] sticky left-[248px] z-10">
                      {item.total.toLocaleString()}
                    </td>
                    {dayIndices.map((day, dIdx) => (
                      <td key={day} className="p-0 border-r border-gray-300 text-right">
                        <input
                          type="number"
                          value={item.dailyValues[dIdx] || ''}
                          placeholder="0"
                          onChange={(e) =>
                            updateDailyVariableOverhead(
                              item.id,
                              dIdx,
                              Number(e.target.value) || 0
                            )
                          }
                          className="w-full h-full px-1.5 text-right bg-white focus:bg-yellow-50 focus:outline-none text-[11px]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-[#ffffcc] font-bold border-t-2 border-[#9aa2ad] z-20">
                <tr className="h-[28px]">
                  <td
                    colSpan={2}
                    className="text-center border-r border-[#c8c890] text-gray-900 sticky left-0 bg-[#fbfbb8] z-30"
                  >
                    합계
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-2 text-right border-r border-[#c8c890] text-blue-900 sticky left-[248px] bg-[#fbfbb8] z-30 font-bold">
                    {totalVariableOverhead.toLocaleString()}
                  </td>
                  {dailyTotals.map((tot, idx) => (
                    <td
                      key={idx}
                      className="px-1.5 text-right border-r border-[#c8c890] text-gray-900 text-[11px]"
                    >
                      {tot.toLocaleString()}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};

