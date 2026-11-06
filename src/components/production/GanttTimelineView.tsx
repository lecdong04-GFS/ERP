'use client';

import React, { useState, useMemo } from 'react';
import {
  GANTT_ALL_LINES,
  GANTT_SEONGHYEONG_LINES,
  GANTT_JEONCHEORI_LINES,
  GanttLine,
  GanttBlock,
  STANDARD_PRODUCT_SPEEDS,
} from '@/lib/production/ganttData';
import {
  Search,
  Filter,
  Clock,
  Layers,
  Sparkles,
  Info,
  Maximize2,
  ChevronRight,
  X,
  Printer,
  Calendar,
} from 'lucide-react';

interface GanttTimelineViewProps {
  onSelectLine?: (lineName: string) => void;
}

export const GanttTimelineView: React.FC<GanttTimelineViewProps> = ({ onSelectLine }) => {
  // 필터 상태
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'SEONGHYEONG' | 'JEONCHEORI'>('ALL');
  const [timeRange, setTimeRange] = useState<'FULL' | 'DAY' | 'NIGHT' | 'PREP'>('FULL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBlock, setSelectedBlock] = useState<{ block: GanttBlock; line: GanttLine } | null>(null);

  // 시간 축 설정 (1시간당 120px, 10분당 20px, 1분당 2px)
  const PX_PER_MIN = 2.0;

  // 타임라인 시작 시간 & 종료 시간 (분 단위)
  const { startHour, endHour, startMin, totalMin } = useMemo(() => {
    switch (timeRange) {
      case 'DAY': // 주간 (08:00 ~ 16:00)
        return { startHour: 8, endHour: 16, startMin: 8 * 60, totalMin: 8 * 60 };
      case 'NIGHT': // 야간 (16:00 ~ 24:00)
        return { startHour: 16, endHour: 24, startMin: 16 * 60, totalMin: 8 * 60 };
      case 'PREP': // 전처리 중심 (04:00 ~ 14:00)
        return { startHour: 4, endHour: 14, startMin: 4 * 60, totalMin: 10 * 60 };
      case 'FULL': // 전체 (04:00 ~ 02:00 익일, 22시간)
      default:
        return { startHour: 4, endHour: 26, startMin: 4 * 60, totalMin: 22 * 60 };
    }
  }, [timeRange]);

  const timelineWidth = totalMin * PX_PER_MIN;

  // 필터링된 라인 목록
  const filteredLines = useMemo(() => {
    let lines = GANTT_ALL_LINES;
    if (categoryFilter === 'SEONGHYEONG') lines = GANTT_SEONGHYEONG_LINES;
    if (categoryFilter === 'JEONCHEORI') lines = GANTT_JEONCHEORI_LINES;

    if (!searchTerm.trim()) return lines;
    const q = searchTerm.toLowerCase();
    return lines.filter(
      (l) => l.name.toLowerCase().includes(q) || l.blocks.some((b) => b.name.toLowerCase().includes(q))
    );
  }, [categoryFilter, searchTerm]);

  // 시간 눈금 목록 (1시간 단위 주 눈금)
  const hourTicks = useMemo(() => {
    const ticks: { hour: number; label: string; leftPx: number }[] = [];
    for (let h = startHour; h <= endHour; h++) {
      const leftPx = (h * 60 - startMin) * PX_PER_MIN;
      const displayH = h >= 24 ? h - 24 : h;
      ticks.push({
        hour: h,
        label: `${String(displayH).padStart(2, '0')}:00`,
        leftPx,
      });
    }
    return ticks;
  }, [startHour, endHour, startMin]);

  // 블록 스타일 매핑
  const getBlockStyle = (type: GanttBlock['type']) => {
    switch (type) {
      case '청소':
        return 'bg-amber-500 hover:bg-amber-600 border-amber-600 text-white shadow-amber-200';
      case '휴게':
        return 'bg-purple-600 hover:bg-purple-700 border-purple-700 text-white shadow-purple-200';
      case '준비':
        return 'bg-teal-600 hover:bg-teal-700 border-teal-700 text-white shadow-teal-200';
      case '생산':
      default:
        return 'bg-blue-600 hover:bg-blue-700 border-blue-700 text-white shadow-blue-200';
    }
  };

  // 선택된 블록의 표준 UPH 조회
  const matchedSpeed = useMemo(() => {
    if (!selectedBlock) return null;
    const name = selectedBlock.block.name;
    return (
      STANDARD_PRODUCT_SPEEDS.find((s) => name.includes(s.item) || s.item.includes(name)) || null
    );
  }, [selectedBlock]);

  return (
    <div className="flex flex-col gap-4">
      {/* 1. 상단 컨트롤 바: 카테고리 필터, 시간 범위 필터, 검색 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* 공정 카테고리 필터 */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              categoryFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200/80'
            }`}
          >
            전체 공정 (30라인)
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('SEONGHYEONG')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
              categoryFilter === 'SEONGHYEONG'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200/80'
            }`}
          >
            <span>🍱</span>
            <span>성형장 (9개 라인)</span>
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter('JEONCHEORI')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
              categoryFilter === 'JEONCHEORI'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200/80'
            }`}
          >
            <span>🍳</span>
            <span>전처리실 (21개 설비)</span>
          </button>
        </div>

        {/* 시간대 범위 선택 */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <span className="text-slate-500 pl-2 pr-1 flex items-center gap-1">
            <Clock size={13} />
            <span>시간축:</span>
          </span>
          <button
            type="button"
            onClick={() => setTimeRange('FULL')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              timeRange === 'FULL' ? 'bg-white text-blue-900 shadow-xs font-black' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            전체 (04~02시)
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('DAY')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              timeRange === 'DAY' ? 'bg-white text-blue-900 shadow-xs font-black' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            주간 2편 (08~16시)
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('NIGHT')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              timeRange === 'NIGHT' ? 'bg-white text-blue-900 shadow-xs font-black' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            야간 1편 (16~24시)
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('PREP')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              timeRange === 'PREP' ? 'bg-white text-blue-900 shadow-xs font-black' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            새벽 전처리 (04~14시)
          </button>
        </div>

        {/* 검색 및 범례 */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="품목·설비 검색 (예: 전주비빔, 제육...)"
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-[220px]"
            />
          </div>

          {/* 범례 */}
          <div className="hidden lg:flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block" />
              <span>생산</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
              <span>청소/소독</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-xs bg-purple-600 inline-block" />
              <span>중식/석식</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-xs bg-teal-600 inline-block" />
              <span>준비/교대</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. 대형 가로 스크롤 간트 타임라인 매트릭스 */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* 상단 안내 정보 배너 */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-bold">
            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-[11px] font-black">
              정본 10분 단위 타임테이블 (11월 28일 마스터 기반)
            </span>
            <span>• 가로 눈금: 1시간(120px) / 10분 눈금선(20px) • 블록 클릭 시 상세 스펙 및 UPH 표시</span>
          </div>
          <div className="text-slate-500 font-bold text-[11px]">
            표시 라인: <strong className="text-blue-900">{filteredLines.length}개</strong> 설비/라인
          </div>
        </div>

        {/* 간트 차트 본체 (가로 스크롤) */}
        <div className="relative overflow-x-auto overflow-y-auto max-h-[680px]">
          <div style={{ minWidth: `${timelineWidth + 240}px` }} className="relative select-none">
            {/* ── 타임라인 헤더 (시간 눈금) ── */}
            <div className="sticky top-0 z-30 flex bg-slate-900 text-white border-b-2 border-slate-700 shadow-sm">
              {/* 좌측 고정 헤더 셀 */}
              <div className="sticky left-0 z-40 w-[240px] shrink-0 bg-slate-950 px-4 py-3 font-black text-xs uppercase tracking-wider text-slate-300 flex items-center justify-between border-r border-slate-800">
                <span>공정 및 라인 / 설비명</span>
                <span className="text-[10px] text-slate-400">구분</span>
              </div>

              {/* 시간대 눈금 바 */}
              <div className="relative h-11 flex-1">
                {hourTicks.map((t) => (
                  <div
                    key={t.hour}
                    style={{ left: `${t.leftPx}px` }}
                    className="absolute top-0 bottom-0 border-l border-slate-700/80 px-2 py-1 text-xs font-mono font-black text-slate-200 flex items-center"
                  >
                    <span>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 각 라인별 타임라인 행 ── */}
            <div className="divide-y divide-slate-100">
              {filteredLines.map((line) => {
                const isForming = line.category === '성형';
                return (
                  <div
                    key={line.id}
                    className="flex hover:bg-blue-50/30 transition-colors group relative"
                  >
                    {/* 좌측 라인 헤더 (Sticky Left) */}
                    <div className="sticky left-0 z-20 w-[240px] shrink-0 bg-white group-hover:bg-blue-50/80 px-4 py-2.5 flex items-center justify-between border-r-2 border-slate-200 shadow-xs transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{isForming ? '🍱' : '🍳'}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 truncate leading-tight">
                            {line.name}
                          </div>
                          <div className="text-[10px] font-bold text-slate-500 leading-tight mt-0.5">
                            총 {line.totalBlocks}개 작업 블록
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-black shrink-0 ${
                          isForming
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                        }`}
                      >
                        {line.category}
                      </span>
                    </div>

                    {/* 우측 블록 타임라인 캔버스 */}
                    <div className="relative h-12 flex-1 bg-white">
                      {/* 배경 수직 눈금선 (1시간 단위 실선 + 30분 단위 점선) */}
                      {hourTicks.map((t) => (
                        <div
                          key={t.hour}
                          style={{ left: `${t.leftPx}px` }}
                          className="absolute top-0 bottom-0 border-l border-slate-200 pointer-events-none"
                        >
                          {/* 30분 보조선 */}
                          <div
                            style={{ left: `${60 * PX_PER_MIN}px` }}
                            className="absolute top-0 bottom-0 border-l border-slate-100 border-dashed pointer-events-none"
                          />
                        </div>
                      ))}

                      {/* 작업 블록들 */}
                      {line.blocks.map((b) => {
                        // 현재 시간 범위 안에 걸치는 블록인지 계산
                        if (b.endMin <= startMin || b.startMin >= startMin + totalMin) {
                          return null;
                        }

                        const blockLeftPx = Math.max(0, (b.startMin - startMin) * PX_PER_MIN);
                        const blockWidthPx = Math.max(
                          20,
                          (Math.min(startMin + totalMin, b.endMin) - Math.max(startMin, b.startMin)) * PX_PER_MIN
                        );

                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBlock({ block: b, line })}
                            style={{
                              left: `${blockLeftPx}px`,
                              width: `${blockWidthPx}px`,
                              top: '6px',
                              bottom: '6px',
                            }}
                            title={`${b.name}\n${b.startTime} ~ ${b.endTime} (${b.durationMin}분)\n유형: ${b.type}`}
                            className={`absolute rounded-lg border px-1.5 py-0.5 cursor-pointer shadow-xs transition-all hover:scale-[1.02] hover:z-20 flex flex-col justify-center overflow-hidden ${getBlockStyle(
                              b.type
                            )}`}
                          >
                            <span className="text-[11px] font-black leading-tight truncate">
                              {b.name}
                            </span>
                            {blockWidthPx >= 45 && (
                              <span className="text-[9px] font-mono leading-none opacity-90 truncate mt-0.5">
                                {b.startTime}~{b.endTime} ({b.durationMin}m)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. 작업 블록 상세 클릭 팝업 모달 */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-slate-200 max-w-lg w-full p-6 relative">
            <button
              type="button"
              onClick={() => setSelectedBlock(null)}
              className="absolute right-5 top-5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">
                {selectedBlock.line.category === '성형' ? '🍱' : '🍳'}
              </span>
              <div>
                <span
                  className={`text-[11px] font-black px-2 py-0.5 rounded-full uppercase ${
                    selectedBlock.line.category === '성형'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-indigo-100 text-indigo-800'
                  }`}
                >
                  {selectedBlock.line.category} 라인
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  {selectedBlock.block.name}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs mb-4">
              <div>
                <span className="text-slate-500 font-bold block mb-0.5">라인 / 설비명</span>
                <span className="font-black text-slate-900 text-sm">{selectedBlock.line.name}</span>
              </div>
              <div>
                <span className="text-slate-500 font-bold block mb-0.5">작업 유형</span>
                <span
                  className={`font-black inline-block px-2 py-0.5 rounded-md text-white ${
                    selectedBlock.block.type === '청소'
                      ? 'bg-amber-500'
                      : selectedBlock.block.type === '휴게'
                      ? 'bg-purple-600'
                      : 'bg-blue-600'
                  }`}
                >
                  {selectedBlock.block.type}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-bold block mb-0.5">가동 시간</span>
                <span className="font-mono font-black text-slate-900 text-sm">
                  {selectedBlock.block.startTime} ~ {selectedBlock.block.endTime}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-bold block mb-0.5">소요 시간</span>
                <span className="font-black text-blue-700 text-sm">
                  {selectedBlock.block.durationMin} 분간
                </span>
              </div>
            </div>

            {/* 참고자료 속도 매칭 정보 */}
            {matchedSpeed ? (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 text-xs">
                <div className="flex items-center gap-1.5 text-blue-900 font-black text-sm mb-2">
                  <Sparkles size={16} className="text-blue-600" />
                  <span>표준 생산속도 (UPH) 참고자료 매칭</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-slate-700 font-bold">
                  <div>
                    <span className="text-blue-700 block text-[11px]">시간당 생산능력</span>
                    <strong className="text-slate-900 text-base">{matchedSpeed.speed.toLocaleString()}</strong> ea/h
                  </div>
                  <div>
                    <span className="text-blue-700 block text-[11px]">2편 기준 수량</span>
                    <strong className="text-slate-900 text-sm">{matchedSpeed.shift2Qty.toLocaleString()}</strong> 개
                  </div>
                  <div>
                    <span className="text-blue-700 block text-[11px]">분당 생산속도</span>
                    <strong className="text-slate-900 text-sm">{(matchedSpeed.speed / 60).toFixed(1)}</strong> 개/분
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-4 text-xs text-slate-600 flex items-center gap-2">
                <Info size={15} className="text-slate-400 shrink-0" />
                <span>청소, 소독, 휴게 또는 비표준 품목으로 표준 UPH가 적용되지 않습니다.</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedBlock(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

