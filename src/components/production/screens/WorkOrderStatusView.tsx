'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Calendar,
  Clock,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Save,
  Printer,
  RotateCcw,
  Warehouse as WarehouseIcon,
  Search,
  GripVertical,
  ChevronDown,
  Check,
} from 'lucide-react';
import { usePrintReport } from '@/context/PrintReportContext';

interface WorkOrderItem {
  id: number;
  workOrderNo: string;
  workDate: string;
  shift: string;
  workSeq: number;
  productId: number;
  productCode: string;
  partName: string;
  productName: string;
  lineName: string;
  gyeId: string;
  gyeName: string;
  spec: string;
  unit: string;
  orderQty: number;
  prodQty: number;
  lossRate: number;
  yieldRate: number;
  warehouseName: string;
  stockQty: number;
  timeRange: string;
  status: '대기' | '진행중' | '완료';
  assignee: string;
}

// 11대 공정 라인 목록 (생산현장.xlsx 기준)
interface LineInfo {
  group: '전처리 및 조리' | '성형 및 포장' | '통합';
  id: string;
  name: string;
  desc: string;
  icon: string;
}

const ALL_LINES: LineInfo[] = [
  // 1. 전처리 및 조리 공정
  { group: '전처리 및 조리', id: '커팅실', name: '커팅실', desc: '야채 세절, 소스 배합 및 1차 전처리', icon: '✂️' },
  { group: '전처리 및 조리', id: '취반', name: '취반기', desc: '대용량 밥짓기 및 배합초 혼합 가동', icon: '🍚' },
  { group: '전처리 및 조리', id: '조리', name: '조리실', desc: '직화 볶음, 솥 가열 및 육류 조리', icon: '🍳' },
  { group: '전처리 및 조리', id: '튀김', name: '튀김실', desc: '오븐 구이 및 가스 튀김기 가동', icon: '🍗' },
  { group: '전처리 및 조리', id: '계량', name: '계량실', desc: '양념, 소스 및 분말 정밀 배합 계량', icon: '⚖️' },
  { group: '전처리 및 조리', id: '채소', name: '채소실', desc: '신선 채소 버블 세척, 살균 및 선별', icon: '🥬' },
  { group: '전처리 및 조리', id: '샐러드', name: '샐러드실', desc: '신선 토핑 믹싱 및 콜드체인 포장', icon: '🥗' },

  // 2. 성형 및 포장 공정
  { group: '성형 및 포장', id: '삼각1', name: '삼각 1호기', desc: '대표 삼각김밥 고속 자동 성형/포장', icon: '🍙' },
  { group: '성형 및 포장', id: '삼각2', name: '삼각 2호기', desc: '대표 삼각김밥 자동 성형/포장', icon: '🍙' },
  { group: '성형 및 포장', id: '삼각3', name: '삼각 3호기', desc: '더큰 삼각김밥 전용 자동 라인', icon: '🍙' },
  { group: '성형 및 포장', id: '김밥', name: '김밥 라인', desc: '줄김밥 및 사각 무스비 성형/포장', icon: '🍱' },
  { group: '성형 및 포장', id: '도시락', name: '도시락 라인', desc: '정식, 한상, 덮밥 도시락 세팅/실링', icon: '🍱' },
  { group: '성형 및 포장', id: '조리빵', name: '조리빵 라인', desc: '샌드위치, 햄버거 조립 및 포장', icon: '🥪' },

  // 3. 통합
  { group: '통합', id: 'ALL', name: '전체 공정 통합보기', desc: '전체 공정의 작업지시를 한 화면에서 통합 조회', icon: '🌟' },
];

export const WorkOrderStatusView: React.FC = () => {
  const { openPrintModal, setWorkOrderPayload } = usePrintReport();

  // 조회 조건
  const [workDate, setWorkDate] = useState('2026-11-05');
  const [shift, setShift] = useState<'1편' | '2편' | '전체'>('1편');
  const [selectedLine, setSelectedLine] = useState<string>('커팅실');
  const [isLineDropdownOpen, setIsLineDropdownOpen] = useState(false);
  const lineDropdownRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 현재 선택된 라인 정보
  const currentLine = useMemo(() => {
    return ALL_LINES.find((l) => l.id === selectedLine) || ALL_LINES[0];
  }, [selectedLine]);

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (lineDropdownRef.current && !lineDropdownRef.current.contains(e.target as Node)) {
        setIsLineDropdownOpen(false);
      }
    };
    if (isLineDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLineDropdownOpen]);

  // 작업 데이터
  const [items, setItems] = useState<WorkOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // 드래그 앤 드롭 상태
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 데이터 로드
  const fetchWorkOrders = useCallback(async (date: string, sft: string, line: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/production/work-order?workDate=${date}&shift=${sft}&line=${encodeURIComponent(line)}`
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setItems(json.data);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error('Failed to load work orders:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkOrders(workDate, shift, selectedLine);
  }, [fetchWorkOrders, workDate, shift, selectedLine]);

  // 순서 이동 핸들러 (▲ / ▼)
  const moveItem = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === items.length - 1) return;

    const newItems = [...items];
    const targetIdx = direction === 'UP' ? index - 1 : index + 1;
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;

    // workSeq 및 타임테이블 시간 재계산
    let runningHour = 6;
    let runningMin = 0;
    const reordered = newItems.map((item, idx) => {
      const startH = String(runningHour).padStart(2, '0');
      const startM = String(runningMin).padStart(2, '0');
      runningMin += 45;
      if (runningMin >= 60) {
        runningHour += Math.floor(runningMin / 60);
        runningMin = runningMin % 60;
      }
      const endH = String(runningHour).padStart(2, '0');
      const endM = String(runningMin).padStart(2, '0');

      return {
        ...item,
        workSeq: idx + 1,
        timeRange: `${startH}:${startM} ~ ${endH}:${endM}`,
      };
    });

    setItems(reordered);
  };

  // 드래그 앤 드롭 이동 핸들러
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newItems = [...items];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    // workSeq 및 타임테이블 시간 재계산
    let runningHour = 6;
    let runningMin = 0;
    const reordered = newItems.map((item, idx) => {
      const startH = String(runningHour).padStart(2, '0');
      const startM = String(runningMin).padStart(2, '0');
      runningMin += 45;
      if (runningMin >= 60) {
        runningHour += Math.floor(runningMin / 60);
        runningMin = runningMin % 60;
      }
      const endH = String(runningHour).padStart(2, '0');
      const endM = String(runningMin).padStart(2, '0');

      return {
        ...item,
        workSeq: idx + 1,
        timeRange: `${startH}:${startM} ~ ${endH}:${endM}`,
      };
    });

    setItems(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 상태 변경 토글 (대기 -> 진행중 -> 완료 -> 대기)
  const toggleStatus = (index: number) => {
    const newItems = [...items];
    const cur = newItems[index].status;
    newItems[index].status = cur === '대기' ? '진행중' : cur === '진행중' ? '완료' : '대기';
    setItems(newItems);
  };

  // 담당자 변경
  const updateAssignee = (index: number, name: string) => {
    const newItems = [...items];
    newItems[index].assignee = name;
    setItems(newItems);
  };

  // 순서 및 지시 저장
  const handleSaveOrders = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/production/work-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_save',
          workDate,
          shift,
          line: selectedLine,
          rows: items,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveToast('✨ 작업 순서가 성공적으로 저장되었습니다!');
        setTimeout(() => setSaveToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to save orders:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // [작업지시서(A4)] 인쇄 모달 열기
  const handleOpenPrint = () => {
    setWorkOrderPayload({
      lineName: selectedLine,
      workDate,
      shift,
      rows: items.map((r) => ({
        workSeq: r.workSeq,
        productName: r.productName,
        warehouseName: r.warehouseName,
        spec: r.spec,
        unit: r.unit,
        orderQty: r.orderQty,
        timeRange: r.timeRange,
        lossRate: r.lossRate,
        yieldRate: r.yieldRate,
        status: r.status,
        assignee: r.assignee,
      })),
    });
    openPrintModal('WORK_ORDER');
  };

  // 검색 필터
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(
      (i) =>
        i.productName.toLowerCase().includes(term) ||
        i.warehouseName.toLowerCase().includes(term) ||
        i.assignee.toLowerCase().includes(term)
    );
  }, [items, searchTerm]);

  // 집계 수치
  const stats = useMemo(() => {
    const totalCount = items.length;
    const totalQty = items.reduce((sum, i) => sum + (Number(i.orderQty) || 0), 0);
    const completedCount = items.filter((i) => i.status === '완료').length;
    const inProgressCount = items.filter((i) => i.status === '진행중').length;
    return { totalCount, totalQty, completedCount, inProgressCount };
  }, [items]);

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-slate-800 font-sans">
      {/* 알림 토스트 */}
      {saveToast && (
        <div className="fixed top-16 right-8 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-bold animate-bounce">
          <CheckCircle2 size={18} />
          <span>{saveToast}</span>
        </div>
      )}

      {/* 1. 메인 헤더 컨트롤 바 (시원하고 직관적인 통합 바) */}
      <div className="bg-white border-b border-slate-300 px-6 py-4 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* 좌측: 핵심 3개 필터 (라인 선택, 날짜, 시프트) */}
          <div className="flex flex-wrap items-center gap-4">
            {/* 라인 선택 커스텀 드롭다운 (넓고 시원시원한 대형 팝오버) */}
            <div className="flex items-center gap-2.5">
              <span className="text-base font-black text-slate-700">라인:</span>
              <div className="relative" ref={lineDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsLineDropdownOpen((prev) => !prev)}
                  className="bg-white hover:bg-blue-50/80 border-2 border-blue-500 hover:border-blue-600 px-5 py-2.5 rounded-2xl shadow-sm hover:shadow transition-all flex items-center gap-3.5 cursor-pointer select-none group"
                >
                  <span className="text-3xl leading-none">{currentLine.icon}</span>
                  <div className="flex flex-col text-left">
                    <span className="text-lg sm:text-xl font-black text-slate-900 group-hover:text-blue-900 leading-tight">
                      {currentLine.name}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-blue-700 leading-tight mt-0.5">
                      {currentLine.desc}
                    </span>
                  </div>
                  <ChevronDown
                    size={22}
                    className={`text-blue-600 transition-transform duration-200 ml-2 ${
                      isLineDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* 내용에 딱 맞게 정돈된 시원한 큰 글씨 팝오버 메뉴 (w-[360px] sm:w-[395px]) */}
                {isLineDropdownOpen && (
                  <div className="absolute left-0 top-full mt-2 w-[350px] sm:w-[395px] bg-white rounded-2xl shadow-2xl border-2 border-slate-200 p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-[540px] overflow-y-auto">
                    {/* 그룹 1: 전처리 및 조리 공정 */}
                    <div className="mb-2">
                      <div className="px-3 py-1.5 flex items-center justify-between text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5">
                        <span className="flex items-center gap-1.5">
                          <span className="text-lg">🥗</span>
                          <span>전처리 및 조리 공정</span>
                        </span>
                        <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-black">
                          7개
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {ALL_LINES.filter((l) => l.group === '전처리 및 조리').map((l) => {
                          const isSelected = selectedLine === l.id;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => {
                                setSelectedLine(l.id);
                                setIsLineDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-sm border-blue-600'
                                  : 'bg-white hover:bg-blue-50/70 border-transparent hover:border-blue-200 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-3xl leading-none shrink-0">{l.icon}</span>
                                <div>
                                  <div
                                    className={`text-lg font-black leading-tight ${
                                      isSelected ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {l.name}
                                  </div>
                                  <div
                                    className={`text-sm font-bold mt-0.5 leading-tight ${
                                      isSelected ? 'text-blue-100' : 'text-slate-600'
                                    }`}
                                  >
                                    {l.desc}
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center shrink-0 ml-2">
                                  <Check size={16} className="text-white" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 구분선 */}
                    <div className="border-t border-slate-200 my-2" />

                    {/* 그룹 2: 성형 및 포장 공정 */}
                    <div className="mb-2">
                      <div className="px-3 py-1.5 flex items-center justify-between text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5">
                        <span className="flex items-center gap-1.5">
                          <span className="text-lg">🍱</span>
                          <span>성형 및 포장 공정</span>
                        </span>
                        <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-black">
                          6개
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {ALL_LINES.filter((l) => l.group === '성형 및 포장').map((l) => {
                          const isSelected = selectedLine === l.id;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => {
                                setSelectedLine(l.id);
                                setIsLineDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-sm border-blue-600'
                                  : 'bg-white hover:bg-blue-50/70 border-transparent hover:border-blue-200 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-3xl leading-none shrink-0">{l.icon}</span>
                                <div>
                                  <div
                                    className={`text-lg font-black leading-tight ${
                                      isSelected ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {l.name}
                                  </div>
                                  <div
                                    className={`text-sm font-bold mt-0.5 leading-tight ${
                                      isSelected ? 'text-blue-100' : 'text-slate-600'
                                    }`}
                                  >
                                    {l.desc}
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center shrink-0 ml-2">
                                  <Check size={16} className="text-white" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 구분선 */}
                    <div className="border-t border-slate-200 my-2" />

                    {/* 그룹 3: 통합 보기 */}
                    <div>
                      {ALL_LINES.filter((l) => l.group === '통합').map((l) => {
                        const isSelected = selectedLine === l.id;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              setSelectedLine(l.id);
                              setIsLineDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-indigo-700 text-white shadow-sm border-indigo-700'
                                : 'bg-indigo-50/50 hover:bg-indigo-50 border-indigo-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-3xl leading-none shrink-0">{l.icon}</span>
                              <div>
                                <div
                                  className={`text-lg font-black leading-tight ${
                                    isSelected ? 'text-white' : 'text-indigo-950'
                                  }`}
                                >
                                  {l.name}
                                </div>
                                <div
                                  className={`text-sm font-bold mt-0.5 leading-tight ${
                                    isSelected ? 'text-indigo-100' : 'text-slate-600'
                                  }`}
                                >
                                  {l.desc}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center shrink-0 ml-2">
                                <Check size={16} className="text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 작업일자 피커 */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-300">
              <span className="text-sm font-bold text-slate-500 flex items-center gap-1">
                <Calendar size={16} className="text-blue-600" /> 월/일:
              </span>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="bg-slate-50 border border-slate-300 px-3 py-2 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* 시프트(편수) 큼직한 알약 탭 */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-300">
              <span className="text-sm font-bold text-slate-500">시프트:</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-300">
                {(['1편', '2편', '전체'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setShift(s)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-black transition-all cursor-pointer ${
                      shift === s
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* 품목 검색창 */}
            <div className="relative pl-2 border-l border-slate-300">
              <Search size={16} className="absolute left-5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="품목명 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
              />
            </div>
          </div>

          {/* 우측: 큼직하고 시원한 3대 액션 버튼 */}
          <div className="flex items-center gap-3">
            {/* 1. 작업지시서 인쇄 버튼 (대형 강조) */}
            <button
              onClick={handleOpenPrint}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Printer size={18} />
              <span>🖨️ 작업지시서 인쇄 (A4)</span>
            </button>

            {/* 2. 순서 저장 버튼 */}
            <button
              onClick={handleSaveOrders}
              disabled={saving}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl font-bold text-sm shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer"
            >
              <Save size={16} />
              <span>{saving ? '저장 중...' : '순서 저장'}</span>
            </button>

            {/* 3. 새로고침 */}
            <button
              onClick={() => void fetchWorkOrders(workDate, shift, selectedLine)}
              title="새로고침"
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl cursor-pointer transition-colors"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* 하단 요약 정보 카드 (시원하고 여유로운 배치, 큼직한 폰트) */}
        <div className="mt-4 pt-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-7">
            <div className="flex items-center gap-2.5">
              <span className="text-slate-600 font-bold text-sm sm:text-base">현재 라인:</span>
              <span className="text-base sm:text-lg font-black text-blue-900 bg-blue-50 px-3.5 py-1.5 rounded-xl border-2 border-blue-200 inline-flex items-center gap-2 shadow-2xs">
                <span className="text-xl">{currentLine.icon}</span>
                <span>{currentLine.name}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-bold text-sm sm:text-base">총 지시품목:</span>
              <span className="font-mono font-black text-slate-900 text-lg sm:text-xl">
                {stats.totalCount}
              </span>
              <span className="text-slate-600 text-sm font-bold">건</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-bold text-sm sm:text-base">총 지시량:</span>
              <span className="font-mono font-black text-indigo-950 text-xl sm:text-2xl">
                {stats.totalQty.toLocaleString()}
              </span>
              <span className="text-slate-600 text-sm font-bold">
                {selectedLine === '도시락' || selectedLine.includes('삼각') || selectedLine === '김밥'
                  ? 'ea'
                  : 'g / kg'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>
              💡 순서를 마우스로 <strong>끌어다 놓거나(드래그)</strong> 화살표(<strong>▲/▼</strong>)를 누르면 바로 바뀝니다.
            </span>
          </div>
        </div>
      </div>

      {/* 2. 메인 작업지시 테이블 (올려주신 사진 양식 100% 매칭 + 시원시원한 대형 폰트) */}
      <div className="flex-1 min-h-0 p-5 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          {/* 테이블 상단 헤더 바 */}
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-300 flex items-center justify-between">
            <div className="flex items-center gap-8 text-base">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-bold">라인명:</span>
                <span className="font-black text-blue-900 text-lg sm:text-xl inline-flex items-center gap-2">
                  <span className="text-2xl">{currentLine.icon}</span>
                  <span>{currentLine.name}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-bold">월/일:</span>
                <span className="font-black text-slate-900 text-lg sm:text-xl">{workDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-bold">시프트명:</span>
                <span className="font-black text-emerald-800 text-lg sm:text-xl bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-xl">
                  {shift}
                </span>
              </div>
            </div>

            <div className="text-sm text-slate-500 font-semibold hidden md:block">
              * BOM 기준 로스율(수율)이 자동 반영된 실제 투입 지시량입니다.
            </div>
          </div>

          {/* 테이블 본문 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="py-32 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-base font-bold text-slate-600">작업지시 목록을 불러오는 중입니다...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-32 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <AlertCircle className="w-12 h-12 text-slate-300" />
                <span className="text-lg font-bold text-slate-700">
                  선택하신 라인({currentLine.name})에 등록된 작업지시 품목이 없습니다.
                </span>
                <span className="text-sm text-slate-500">
                  상단 라인 선택에서 다른 라인(커팅실, 취반기, 조리실 등)을 선택해 보세요.
                </span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-800 font-black sticky top-0 z-10 border-b-2 border-slate-300 text-center text-base sm:text-lg">
                  <tr>
                    <th className="py-4 px-3 w-32 text-center">순서</th>
                    <th className="py-4 px-5 text-left">제품명</th>
                    <th className="py-4 px-4 w-44 text-center">창고명</th>
                    <th className="py-4 px-3 w-32 text-center">규격/단위</th>
                    <th className="py-4 px-5 text-right w-44">지시량</th>
                    <th className="py-4 px-4 w-48 text-center">작업시간</th>
                    <th className="py-4 px-4 w-36 text-center">완료여부</th>
                    <th className="py-4 px-4 w-40 text-center">담당자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredItems.map((item, idx) => {
                    // 창고 뱃지 색상 (알아보기 쉬운 큰 디자인)
                    const whColor = item.warehouseName.includes('냉장2')
                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                      : item.warehouseName.includes('냉장1')
                      ? 'bg-sky-100 text-sky-900 border-sky-300'
                      : item.warehouseName.includes('냉동')
                      ? 'bg-cyan-100 text-cyan-900 border-cyan-300'
                      : item.warehouseName.includes('상온')
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-purple-100 text-purple-900 border-purple-300';

                    // 상태 뱃지 색상
                    const isDone = item.status === '완료';
                    const isProgress = item.status === '진행중';

                    return (
                      <tr
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, idx)}
                        onDragEnd={handleDragEnd}
                        className={`transition-all select-none ${
                          draggedIndex === idx
                            ? 'opacity-40 bg-blue-100 border-2 border-dashed border-blue-400'
                            : dragOverIndex === idx
                            ? 'border-t-4 border-t-blue-600 bg-blue-50/80 shadow-md'
                            : isDone
                            ? 'bg-slate-50/80 opacity-75'
                            : 'hover:bg-blue-50/40'
                        }`}
                      >
                        {/* 1. 순서 (손잡이, 큼직한 번호, 위/아래 버튼) */}
                        <td className="py-4 px-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span
                              className="text-slate-400 hover:text-blue-600 cursor-grab active:cursor-grabbing p-1.5 rounded-lg hover:bg-slate-200/60"
                              title="마우스로 끌어서 순서 이동 (드래그 앤 드롭)"
                            >
                              <GripVertical size={20} />
                            </span>
                            <span className="font-mono font-black text-slate-900 text-lg sm:text-xl w-8">
                              {item.workSeq}
                            </span>
                            <div className="flex flex-col gap-0.5 ml-0.5">
                              <button
                                onClick={() => moveItem(idx, 'UP')}
                                disabled={idx === 0}
                                title="위로 순서 올리기"
                                className="p-1.5 hover:bg-blue-100 text-slate-600 hover:text-blue-700 disabled:opacity-20 cursor-pointer rounded-lg transition-colors"
                              >
                                <ArrowUp size={16} />
                              </button>
                              <button
                                onClick={() => moveItem(idx, 'DOWN')}
                                disabled={idx === filteredItems.length - 1}
                                title="아래로 순서 내리기"
                                className="p-1.5 hover:bg-blue-100 text-slate-600 hover:text-blue-700 disabled:opacity-20 cursor-pointer rounded-lg transition-colors"
                              >
                                <ArrowDown size={16} />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* 2. 제품명 (크고 뚜렷하게 18px Bold) */}
                        <td className="py-4 px-5 text-left">
                          <div className="flex flex-col gap-1">
                            <span className="font-black text-slate-950 text-base sm:text-lg leading-snug">
                              {item.productName}
                            </span>
                            {item.lossRate > 0 && (
                              <span className="text-sm text-slate-500 font-bold">
                                * 로스율 {item.lossRate}% (수율 {item.yieldRate}%)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. 창고명 (알아보기 쉬운 큰 뱃지) */}
                        <td className="py-4 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-black text-sm sm:text-base border shadow-2xs ${whColor}`}
                          >
                            <WarehouseIcon size={16} />
                            <span>{item.warehouseName || '냉장창고2'}</span>
                          </span>
                        </td>

                        {/* 4. 규격/단위 */}
                        <td className="py-4 px-3 text-center font-mono">
                          <span className="bg-slate-100 px-3 py-1.5 rounded-lg text-sm sm:text-base font-black text-slate-800 border border-slate-200">
                            {item.unit || 'g'}
                          </span>
                        </td>

                        {/* 5. 지시량 (굵고 큼직한 시원한 숫자 22~24px) */}
                        <td className="py-4 px-5 text-right font-mono font-black text-blue-900 text-xl sm:text-2xl tracking-tight">
                          {Number(item.orderQty || 0).toLocaleString()}
                        </td>

                        {/* 6. 작업시간 */}
                        <td className="py-4 px-4 text-center font-mono">
                          <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-900 border border-slate-300 px-3 py-1.5 rounded-xl font-extrabold text-sm sm:text-base">
                            <Clock size={16} className="text-blue-600" />
                            <span>{item.timeRange || '06:00 ~ 06:45'}</span>
                          </span>
                        </td>

                        {/* 7. 완료여부 (크고 누르기 편한 대형 버튼) */}
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => toggleStatus(idx)}
                            className={`px-4 py-2 rounded-xl text-sm sm:text-base font-black border shadow-2xs cursor-pointer transition-all flex items-center justify-center gap-2 mx-auto active:scale-95 ${
                              isDone
                                ? 'bg-emerald-600 text-white border-emerald-700'
                                : isProgress
                                ? 'bg-amber-500 text-white border-amber-600 animate-pulse'
                                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                            }`}
                          >
                            {isDone && <Check size={18} />}
                            <span>{isDone ? '완료' : isProgress ? '진행중' : '대기'}</span>
                          </button>
                        </td>

                        {/* 8. 담당자 */}
                        <td className="py-4 px-4 text-center">
                          <input
                            type="text"
                            value={item.assignee || '김반장'}
                            onChange={(e) => updateAssignee(idx, e.target.value)}
                            className="w-28 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-center text-sm sm:text-base font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 테이블 하단 합계 요약 바 (대형 폰트) */}
          <div className="bg-slate-50 px-6 py-4 border-t-2 border-slate-300 flex items-center justify-between text-base font-bold text-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-slate-600">총 지시품목: </span>
              <span className="font-mono text-blue-900 text-xl font-black">{filteredItems.length}</span>
              <span className="text-slate-600">건</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-slate-600">총 지시량 합계: </span>
                <span className="font-mono text-indigo-950 text-2xl sm:text-3xl font-black">
                  {stats.totalQty.toLocaleString()}
                </span>
                <span className="text-slate-600 text-sm font-bold ml-1">
                  {selectedLine === '도시락' || selectedLine.includes('삼각') || selectedLine === '김밥'
                    ? 'ea'
                    : 'g / kg'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
