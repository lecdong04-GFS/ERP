'use client';

import React, { useState, useMemo } from 'react';
import { STANDARD_PRODUCT_SPEEDS, ProductSpeed } from '@/lib/production/ganttData';
import {
  Gauge,
  Calculator,
  Search,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Download,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';

interface SimRow extends ProductSpeed {
  curShift2Qty: number;
  curShift1Qty: number;
}

export const SpeedSimulatorView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  // 시뮬레이션 수량 상태
  const [simData, setSimData] = useState<SimRow[]>(() =>
    STANDARD_PRODUCT_SPEEDS.map((s) => ({
      ...s,
      curShift2Qty: s.shift2Qty,
      curShift1Qty: s.shift1Qty,
    }))
  );

  // 수량 변경 핸들러
  const updateQty = (item: string, shift: 'shift2' | 'shift1', val: number) => {
    const qty = Math.max(0, Math.round(val));
    setSimData((prev) =>
      prev.map((r) => {
        if (r.item === item) {
          return shift === 'shift2' ? { ...r, curShift2Qty: qty } : { ...r, curShift1Qty: qty };
        }
        return r;
      })
    );
  };

  // 소요시간 계산 함수 (분 $\rightarrow$ HH:mm:ss)
  const calcDuration = (qty: number, speed: number) => {
    if (speed <= 0 || qty <= 0) return { min: 0, text: '00:00:00' };
    const totalMinutes = (qty / speed) * 60;
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.floor(totalMinutes % 60);
    const secs = Math.round((totalMinutes * 60) % 60);
    return {
      min: Math.round(totalMinutes * 10) / 10,
      text: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    };
  };

  // 프리셋 일괄 적용
  const applyPreset = (multiplier: number) => {
    setSimData((prev) =>
      prev.map((r) => ({
        ...r,
        curShift2Qty: Math.round(r.shift2Qty * multiplier),
        curShift1Qty: Math.round(r.shift1Qty * multiplier),
      }))
    );
  };

  // 초기화
  const handleReset = () => {
    setSimData(
      STANDARD_PRODUCT_SPEEDS.map((s) => ({
        ...s,
        curShift2Qty: s.shift2Qty,
        curShift1Qty: s.shift1Qty,
      }))
    );
  };

  // 필터링된 행
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return simData;
    const q = searchTerm.toLowerCase();
    return simData.filter((r) => r.item.toLowerCase().includes(q));
  }, [simData, searchTerm]);

  // 종합 KPI 요약 통계
  const stats = useMemo(() => {
    let totalQty = 0;
    let totalMinutes = 0;
    let totalSpeed = 0;

    simData.forEach((r) => {
      const q = r.curShift2Qty + r.curShift1Qty;
      totalQty += q;
      if (r.speed > 0) {
        totalMinutes += (q / r.speed) * 60;
        totalSpeed += r.speed;
      }
    });

    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    const avgSpeed = simData.length > 0 ? Math.round(totalSpeed / simData.length) : 0;

    return {
      totalItems: simData.length,
      totalQty,
      totalHoursStr: `${hours}시간 ${mins}분`,
      avgSpeed,
    };
  }, [simData]);

  // CSV 다운로드
  const handleExportCsv = () => {
    const headers = ['완제품명', '표준생산속도(UPH)', '2편수량(EA)', '2편소요시간', '1편수량(EA)', '1편소요시간', '총수량(EA)'];
    const rows = simData.map((r) => {
      const d2 = calcDuration(r.curShift2Qty, r.speed).text;
      const d1 = calcDuration(r.curShift1Qty, r.speed).text;
      return [r.item, r.speed, r.curShift2Qty, d2, r.curShift1Qty, d1, r.curShift2Qty + r.curShift1Qty].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GFS_생산속도_시뮬레이션_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 1. 상단 KPI 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Gauge size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500">표준 UPH 등록 품목</span>
            <div className="text-xl font-black text-slate-900">{stats.totalItems} 개 완제품</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <TrendingUp size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500">총 시뮬레이션 수주량</span>
            <div className="text-xl font-black text-emerald-800">
              {stats.totalQty.toLocaleString()} <span className="text-xs font-bold">EA</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <Clock size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500">총 가동 소요시간</span>
            <div className="text-xl font-black text-purple-900">{stats.totalHoursStr}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Calculator size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500">평균 생산 속도</span>
            <div className="text-xl font-black text-slate-900">
              {stats.avgSpeed.toLocaleString()} <span className="text-xs font-bold">UPH</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 컨트롤 바 (검색 + 프리셋 버튼) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* 검색 */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="품목명 검색 (예: 전주비빔, 스팸, 고진많...)"
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-[240px]"
          />
        </div>

        {/* 프리셋 버튼 그룹 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RotateCcw size={13} />
            <span>정본 기준 복원</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset(1.1)}
            className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
          >
            <TrendingUp size={13} />
            <span>+10% 증량</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset(0.9)}
            className="px-3 py-1.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
          >
            <TrendingDown size={13} />
            <span>-10% 감량</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <Download size={13} />
            <span>엑셀(CSV) 다운로드</span>
          </button>
        </div>
      </div>

      {/* 3. 시뮬레이션 계산 테이블 */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900 text-white uppercase text-[11px] font-black tracking-wider">
              <tr>
                <th className="px-4 py-3 text-center w-12 border-r border-slate-800">NO</th>
                <th className="px-4 py-3 border-r border-slate-800">완제품 품목명</th>
                <th className="px-4 py-3 text-right w-28 border-r border-slate-800">표준속도 (UPH)</th>
                <th className="px-4 py-3 text-right w-24 border-r border-slate-800">분당속도</th>
                <th className="px-4 py-3 text-center w-36 border-r border-slate-800 bg-blue-950/60">
                  2편 지시수량 (EA)
                </th>
                <th className="px-4 py-3 text-center w-32 border-r border-slate-800 bg-blue-950/60">
                  2편 가동 소요시간
                </th>
                <th className="px-4 py-3 text-center w-36 border-r border-slate-800 bg-indigo-950/60">
                  1편 지시수량 (EA)
                </th>
                <th className="px-4 py-3 text-center w-32 border-r border-slate-800 bg-indigo-950/60">
                  1편 가동 소요시간
                </th>
                <th className="px-4 py-3 text-right w-28 bg-slate-950">합계 수량</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredData.map((r, idx) => {
                const dur2 = calcDuration(r.curShift2Qty, r.speed);
                const dur1 = calcDuration(r.curShift1Qty, r.speed);
                const total = r.curShift2Qty + r.curShift1Qty;

                return (
                  <tr key={r.item} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-2 text-center text-slate-400 font-bold border-r border-slate-100">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-2 font-black text-slate-900 border-r border-slate-100">
                      {r.item}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-blue-700 border-r border-slate-100">
                      {r.speed.toLocaleString()} <span className="text-[10px] text-slate-400">ea/h</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600 border-r border-slate-100">
                      {(r.speed / 60).toFixed(1)} <span className="text-[10px] text-slate-400">ea/m</span>
                    </td>

                    {/* 2편 수량 및 계산 소요시간 */}
                    <td className="px-3 py-1.5 text-center border-r border-slate-100 bg-blue-50/20">
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={r.curShift2Qty || ''}
                        onChange={(e) => updateQty(r.item, 'shift2', Number(e.target.value) || 0)}
                        className="w-full text-center px-2 py-1 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-blue-900 border-r border-slate-100 bg-blue-50/20">
                      {dur2.text} <span className="text-[10px] text-slate-500">({dur2.min}분)</span>
                    </td>

                    {/* 1편 수량 및 계산 소요시간 */}
                    <td className="px-3 py-1.5 text-center border-r border-slate-100 bg-indigo-50/20">
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={r.curShift1Qty || ''}
                        onChange={(e) => updateQty(r.item, 'shift1', Number(e.target.value) || 0)}
                        className="w-full text-center px-2 py-1 font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-indigo-900 border-r border-slate-100 bg-indigo-50/20">
                      {dur1.text} <span className="text-[10px] text-slate-500">({dur1.min}분)</span>
                    </td>

                    {/* 합계 */}
                    <td className="px-4 py-2 text-right font-mono font-black text-slate-900 bg-slate-50">
                      {total.toLocaleString()} <span className="text-[10px] text-slate-500">개</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

