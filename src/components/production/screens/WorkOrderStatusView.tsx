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
  FileText,
  Layers,
  ExternalLink,
  PackageCheck,
  Users,
  Gauge,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { usePrintReport } from '@/context/PrintReportContext';
import {
  TIMETABLE_LINES,
  ALL_LINE_ITEM,
  getLineDef,
  LineWorkOrderDef,
  ScheduleTask,
  MaterialRequirement,
} from '@/lib/production/workOrderTimetable';
import { GanttTimelineView } from '@/components/production/GanttTimelineView';
import { SpeedSimulatorView } from '@/components/production/SpeedSimulatorView';
import { kstToday } from '@/lib/kst';

export const WorkOrderStatusView: React.FC = () => {
  const { openPrintModal, setWorkOrderPayload } = usePrintReport();

  // 조회 조건
  const [workDate, setWorkDate] = useState(kstToday() || '2026-11-06');
  const [shift, setShift] = useState<'전체' | '1편' | '2편'>('전체');
  const [selectedLine, setSelectedLine] = useState<string>('도시락');
  const [isLineDropdownOpen, setIsLineDropdownOpen] = useState(false);
  const lineDropdownRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'GANTT' | 'TIMETABLE' | 'MATERIALS' | 'SIMULATOR'>('GANTT');
  const [materialWhFilter, setMaterialWhFilter] = useState<string>('전체');

  // 현재 라인 정본 정의
  const currentLine = useMemo(() => {
    return getLineDef(selectedLine);
  }, [selectedLine]);

  // 스케줄 상태 (순서 이동, 상태 토글, 담당자 입력)
  const [scheduleTasks, setScheduleTasks] = useState<ScheduleTask[]>([]);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // 드래그 앤 드롭 상태
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 라인 변경 시 해당 라인 기본 스케줄 및 원부자재 로드
  useEffect(() => {
    setScheduleTasks(currentLine.schedule.map((s) => ({ ...s })));
    setMaterials(currentLine.materials.map((m) => ({ ...m })));
  }, [currentLine]);

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

  // 서버 DB 작업지시 저장 데이터 병합 로드
  const fetchServerWorkOrders = useCallback(async (date: string, sft: string, line: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/production/work-order?workDate=${date}&shift=${sft}&line=${encodeURIComponent(line)}`
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        // DB 저장 상태가 있으면 상태/담당자 병합
        const serverMap = new Map<string, any>();
        json.data.forEach((d: any) => {
          if (d.productName) serverMap.set(d.productName, d);
        });

        setScheduleTasks((prev) =>
          prev.map((task) => {
            const matched = serverMap.get(task.item);
            if (matched) {
              return {
                ...task,
                status: matched.status || task.status,
                assignee: matched.assignee || task.assignee,
              };
            }
            return task;
          })
        );
      }
    } catch (err) {
      console.error('Failed to load work orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchServerWorkOrders(workDate, shift, selectedLine);
  }, [fetchServerWorkOrders, workDate, shift, selectedLine]);

  // 순서 이동 핸들러 (▲ / ▼)
  const moveTask = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === scheduleTasks.length - 1) return;

    const newTasks = [...scheduleTasks];
    const targetIdx = direction === 'UP' ? index - 1 : index + 1;
    const temp = newTasks[index];
    newTasks[index] = newTasks[targetIdx];
    newTasks[targetIdx] = temp;

    // seq 재계산
    const reordered = newTasks.map((t, idx) => ({
      ...t,
      seq: idx + 1,
    }));

    setScheduleTasks(reordered);
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

    const newTasks = [...scheduleTasks];
    const [draggedItem] = newTasks.splice(draggedIndex, 1);
    newTasks.splice(targetIndex, 0, draggedItem);

    const reordered = newTasks.map((t, idx) => ({
      ...t,
      seq: idx + 1,
    }));

    setScheduleTasks(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 상태 변경 토글 (대기 -> 진행중 -> 완료 -> 대기)
  const toggleStatus = (id: string) => {
    setScheduleTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const next = t.status === '대기' ? '진행중' : t.status === '진행중' ? '완료' : '대기';
          return { ...t, status: next };
        }
        return t;
      })
    );
  };

  // 담당자 변경
  const updateAssignee = (id: string, name: string) => {
    setScheduleTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, assignee: name } : t))
    );
  };

  // 원부자재 불출 체크 토글
  const toggleMaterialCheck = (id: string) => {
    setMaterials((prev) =>
      prev.map((m) => (m.id === id ? { ...m, checked: !m.checked } : m))
    );
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
          rows: scheduleTasks.map((s) => ({
            workOrderNo: `WO-${(workDate || '20261106').replace(/-/g, '')}-${selectedLine}-${s.seq}`,
            workSeq: s.seq,
            productName: s.item,
            orderQty: typeof s.qty === 'number' ? s.qty : 0,
            completeTime: s.time,
            status: s.status,
            assignee: s.assignee,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveToast('✨ 작업 순서 및 상태가 성공적으로 저장되었습니다!');
        setTimeout(() => setSaveToast(null), 3000);
      } else {
        alert('저장 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err: any) {
      console.error('Failed to save orders:', err);
      alert('저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // PDF 인쇄 (새 창 직접 열람 및 인쇄)
  const handleOpenPdf = (pdfUrl?: string) => {
    const target = pdfUrl || currentLine.pdfUrl;
    window.open(target, '_blank');
  };

  // 전체 통합 마스터 종합본 PDF 인쇄
  const handleOpenMasterPdf = () => {
    window.open('/reports/work-orders/00_GFS_전라인_통합작업지시서_종합본_최신.pdf', '_blank');
  };

  // 필터된 스케줄 항목
  const filteredSchedule = useMemo(() => {
    let list = scheduleTasks;

    // 시프트 필터
    if (shift !== '전체') {
      list = list.filter((item) => item.shift.includes(shift));
    }

    // 검색어 필터
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (item) =>
          item.item.toLowerCase().includes(term) ||
          item.bom.toLowerCase().includes(term) ||
          item.ccp.toLowerCase().includes(term) ||
          item.assignee.toLowerCase().includes(term) ||
          item.time.includes(term)
      );
    }

    return list;
  }, [scheduleTasks, shift, searchTerm]);

  // 필터된 원부자재 목록
  const filteredMaterials = useMemo(() => {
    let list = materials;
    if (materialWhFilter !== '전체') {
      list = list.filter((m) => m.warehouse === materialWhFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(term));
    }
    return list;
  }, [materials, materialWhFilter, searchTerm]);

  // 집계 수치
  const stats = useMemo(() => {
    const totalCount = scheduleTasks.length;
    const completedCount = scheduleTasks.filter((i) => i.status === '완료').length;
    const inProgressCount = scheduleTasks.filter((i) => i.status === '진행중').length;
    const pendingCount = scheduleTasks.filter((i) => i.status === '대기').length;
    const matTotal = materials.length;
    const matChecked = materials.filter((m) => m.checked).length;
    return { totalCount, completedCount, inProgressCount, pendingCount, matTotal, matChecked };
  }, [scheduleTasks, materials]);

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-slate-800 font-sans">
      {/* 알림 토스트 */}
      {saveToast && (
        <div className="fixed top-16 right-8 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-bold animate-bounce">
          <CheckCircle2 size={18} />
          <span>{saveToast}</span>
        </div>
      )}

      {/* 1. 상단 메인 컨트롤 바 (12개 라인 선택 + 일자 + 시프트 + 인쇄 액션) */}
      <div className="bg-white border-b border-slate-300 px-6 py-3.5 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* 좌측: 핵심 3개 필터 (라인 선택, 날짜, 시프트) */}
          <div className="flex flex-wrap items-center gap-4">
            {/* 라인 선택 커스텀 드롭다운 (12개 최신 공정 지원) */}
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-slate-700">라인:</span>
              <div className="relative" ref={lineDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsLineDropdownOpen((prev) => !prev)}
                  className="bg-white hover:bg-blue-50/80 border-2 border-blue-500 hover:border-blue-600 px-4 py-2 rounded-2xl shadow-sm hover:shadow transition-all flex items-center gap-3 cursor-pointer select-none group"
                >
                  <span className="text-2xl leading-none">{currentLine.icon}</span>
                  <div className="flex flex-col text-left">
                    <span className="text-base sm:text-lg font-black text-slate-900 group-hover:text-blue-900 leading-tight">
                      {currentLine.name}
                    </span>
                    <span className="text-[11px] sm:text-xs font-bold text-blue-700 leading-tight mt-0.5 max-w-[210px] truncate">
                      {currentLine.desc}
                    </span>
                  </div>
                  <ChevronDown
                    size={20}
                    className={`text-blue-600 transition-transform duration-200 ml-1 ${
                      isLineDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* 12대 라인 팝오버 메뉴 */}
                {isLineDropdownOpen && (
                  <div className="absolute left-0 top-full mt-2 w-[370px] sm:w-[410px] bg-white rounded-2xl shadow-2xl border-2 border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-[580px] overflow-y-auto">
                    {/* 그룹 1: 성형 및 포장 공정 (9대 라인) */}
                    <div className="mb-2">
                      <div className="px-3 py-1 flex items-center justify-between text-sm font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-base">🍱</span>
                          <span>성형 및 포장 공정</span>
                        </span>
                        <span className="bg-emerald-100 text-emerald-800 text-[11px] px-2 py-0.5 rounded-full font-black">
                          9개 라인
                        </span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {TIMETABLE_LINES.filter((l) => l.group === '성형 및 포장').map((l) => {
                          const isSelected = selectedLine === l.id;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => {
                                setSelectedLine(l.id);
                                setIsLineDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-sm border-blue-600'
                                  : 'bg-white hover:bg-blue-50/70 border-transparent hover:border-blue-200 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-2xl leading-none shrink-0">{l.icon}</span>
                                <div>
                                  <div
                                    className={`text-base font-black leading-tight ${
                                      isSelected ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {l.name}
                                  </div>
                                  <div
                                    className={`text-xs font-bold mt-0.5 leading-tight ${
                                      isSelected ? 'text-blue-100' : 'text-slate-600'
                                    }`}
                                  >
                                    {l.desc}
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center shrink-0 ml-2">
                                  <Check size={14} className="text-white" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 구분선 */}
                    <div className="border-t border-slate-200 my-2" />

                    {/* 그룹 2: 전처리 및 가공 공정 (3대 라인) */}
                    <div className="mb-2">
                      <div className="px-3 py-1 flex items-center justify-between text-sm font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-base">🍳</span>
                          <span>전처리 및 가공 공정</span>
                        </span>
                        <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 rounded-full font-black">
                          3대 공정
                        </span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {TIMETABLE_LINES.filter((l) => l.group === '전처리 및 가공').map((l) => {
                          const isSelected = selectedLine === l.id;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => {
                                setSelectedLine(l.id);
                                setIsLineDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-sm border-blue-600'
                                  : 'bg-white hover:bg-blue-50/70 border-transparent hover:border-blue-200 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-2xl leading-none shrink-0">{l.icon}</span>
                                <div>
                                  <div
                                    className={`text-base font-black leading-tight ${
                                      isSelected ? 'text-white' : 'text-slate-900'
                                    }`}
                                  >
                                    {l.name}
                                  </div>
                                  <div
                                    className={`text-xs font-bold mt-0.5 leading-tight ${
                                      isSelected ? 'text-blue-100' : 'text-slate-600'
                                    }`}
                                  >
                                    {l.desc}
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center shrink-0 ml-2">
                                  <Check size={14} className="text-white" />
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
                      {(() => {
                        const isSelected = selectedLine === 'ALL';
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLine('ALL');
                              setIsLineDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-indigo-700 text-white shadow-sm border-indigo-700'
                                : 'bg-indigo-50/70 hover:bg-indigo-100/70 border-indigo-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-2xl leading-none shrink-0">🌟</span>
                              <div>
                                <div
                                  className={`text-base font-black leading-tight ${
                                    isSelected ? 'text-white' : 'text-indigo-950'
                                  }`}
                                >
                                  전체 공정 통합보기 (ALL)
                                </div>
                                <div
                                  className={`text-xs font-bold mt-0.5 leading-tight ${
                                    isSelected ? 'text-indigo-100' : 'text-slate-600'
                                  }`}
                                >
                                  12대 공정 전체 작업지시서 종합 스케줄 모니터링
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center shrink-0 ml-2">
                                <Check size={14} className="text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })()}
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
                className="bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* 시프트 필터 */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-300">
              <span className="text-sm font-bold text-slate-500">시프트:</span>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-300">
                {(['전체', '2편', '1편'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setShift(s)}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
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

            {/* 검색창 */}
            <div className="relative pl-2 border-l border-slate-300">
              <Search size={15} className="absolute left-4 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="품목명, BOM, CCP 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-3 py-1 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
              />
            </div>
          </div>

          {/* 우측: 핵심 액션 버튼들 (PDF 즉시 인쇄, 종합본 인쇄, 저장, 새로고침) */}
          <div className="flex items-center gap-2.5">
            {/* 1. 해당 라인 PDF 열기/인쇄 (A4 가로 표준) */}
            <button
              type="button"
              onClick={() => handleOpenPdf()}
              title="이 라인의 A4 가로 일일 작업지시서 PDF를 새 탭에서 열어 인쇄합니다."
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <FileText size={16} />
              <span>📄 라인 PDF 인쇄</span>
              <ExternalLink size={13} className="opacity-75" />
            </button>

            {/* 2. 전 라인 마스터 종합본 PDF 인쇄 */}
            <button
              type="button"
              onClick={handleOpenMasterPdf}
              title="12개 라인 전체가 수록된 전라인 마스터 작업지시서 종합본(12페이지) PDF를 인쇄합니다."
              className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl font-black text-xs shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Printer size={16} />
              <span>📑 전라인 종합본 인쇄</span>
            </button>

            {/* 3. 순서 및 상태 저장 */}
            <button
              type="button"
              onClick={handleSaveOrders}
              disabled={saving}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Save size={15} />
              <span>{saving ? '저장 중...' : '순서 저장'}</span>
            </button>

            {/* 4. 새로고침 */}
            <button
              type="button"
              onClick={() => {
                setScheduleTasks(currentLine.schedule.map((s) => ({ ...s })));
                setMaterials(currentLine.materials.map((m) => ({ ...m })));
                void fetchServerWorkOrders(workDate, shift, selectedLine);
              }}
              title="원래 타임테이블 스케줄로 새로고침"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl cursor-pointer transition-colors"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        {/* 2. 상단 라인 핵심 KPI 카드 바 (생산계획, 가동시간, UPH속도, 투입인원, 공정책임자) */}
        <div className="mt-3.5 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* KPI 1: 일일 총 생산계획 */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl px-3.5 py-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <PackageCheck size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-blue-700 truncate">일일 총 생산계획</div>
              <div className="text-sm font-black text-blue-950 truncate">{currentLine.totalPlan}</div>
            </div>
          </div>

          {/* KPI 2: 가동 시간대 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-slate-600 truncate">라인 가동 시간대</div>
              <div className="text-sm font-black text-slate-900 truncate">{currentLine.totalTime}</div>
            </div>
          </div>

          {/* KPI 3: 생산속도 (UPH / 분당) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Gauge size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-emerald-800 truncate">라인 생산속도 (UPH)</div>
              <div className="text-xs font-black text-slate-900 truncate">{currentLine.speed}</div>
            </div>
          </div>

          {/* KPI 4: 소인화 투입인원 */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl px-3.5 py-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Users size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-amber-800 truncate">소인화 투입인원</div>
              <div className="text-xs font-black text-amber-950 truncate">{currentLine.personnel}</div>
            </div>
          </div>

          {/* KPI 5: 공정 책임자 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-3 col-span-2 sm:col-span-1">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-indigo-700 truncate">공정 책임자</div>
              <div className="text-sm font-black text-slate-900 truncate">{currentLine.leadWorker}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 4대 멀티 탭 네비게이션 (타임테이블 간트 vs 작업지시서 vs 소요 원부자재 vs 속도 시뮬레이터) */}
      <div className="px-6 pt-3 shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 탭 1: 10분 단위 타임테이블 간트 */}
          <button
            type="button"
            onClick={() => setActiveTab('GANTT')}
            className={`px-4 py-2.5 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
              activeTab === 'GANTT'
                ? 'bg-white text-blue-900 border-blue-600 shadow-xs'
                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Clock size={17} className={activeTab === 'GANTT' ? 'text-blue-600' : 'text-slate-400'} />
            <span>🕒 타임테이블 간트 (10분 그리드)</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-black ${
                activeTab === 'GANTT' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              30라인/설비
            </span>
          </button>

          {/* 탭 2: 일일 작업지시서 스케줄 */}
          <button
            type="button"
            onClick={() => setActiveTab('TIMETABLE')}
            className={`px-4 py-2.5 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
              activeTab === 'TIMETABLE'
                ? 'bg-white text-blue-900 border-blue-600 shadow-xs'
                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <FileText size={17} className={activeTab === 'TIMETABLE' ? 'text-blue-600' : 'text-slate-400'} />
            <span>📋 일일 작업지시서 (세로 상세표 & 드래그)</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-black ${
                activeTab === 'TIMETABLE' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              {filteredSchedule.length}건
            </span>
          </button>

          {/* 탭 3: 소요 원부자재 불출/계량표 */}
          <button
            type="button"
            onClick={() => setActiveTab('MATERIALS')}
            className={`px-4 py-2.5 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
              activeTab === 'MATERIALS'
                ? 'bg-white text-indigo-900 border-indigo-600 shadow-xs'
                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Layers size={17} className={activeTab === 'MATERIALS' ? 'text-indigo-600' : 'text-slate-400'} />
            <span>📦 소요 원부자재 (BOM 배합·불출)</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-black ${
                activeTab === 'MATERIALS' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              {materials.length}종
            </span>
          </button>

          {/* 탭 4: 생산속도 시뮬레이터 */}
          <button
            type="button"
            onClick={() => setActiveTab('SIMULATOR')}
            className={`px-4 py-2.5 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
              activeTab === 'SIMULATOR'
                ? 'bg-white text-purple-900 border-purple-600 shadow-xs'
                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Gauge size={17} className={activeTab === 'SIMULATOR' ? 'text-purple-600' : 'text-slate-400'} />
            <span>⚡ 수주량 연동 속도 시뮬레이터</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-black ${
                activeTab === 'SIMULATOR' ? 'bg-purple-100 text-purple-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              71품목 UPH
            </span>
          </button>
        </div>

        {/* 탭 3일 때 창고별 필터 버튼 */}
        {activeTab === 'MATERIALS' && (
          <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-xl border border-slate-300 text-xs font-bold">
            <span className="text-slate-500">창고:</span>
            {['전체', '상온', '냉장1', '냉장2', '냉동', '부자재'].map((wh) => (
              <button
                key={wh}
                onClick={() => setMaterialWhFilter(wh)}
                className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                  materialWhFilter === wh ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {wh}
              </button>
            ))}
          </div>
        )}

        {/* 탭 2일 때 완료 카운트 표시 */}
        {activeTab === 'TIMETABLE' && (
          <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>완료: <strong className="text-emerald-700 font-mono">{stats.completedCount}</strong>건</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <span>진행중: <strong className="text-blue-700 font-mono">{stats.inProgressCount}</strong>건</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
              <span>대기: <strong className="text-slate-700 font-mono">{stats.pendingCount}</strong>건</span>
            </span>
          </div>
        )}
      </div>

      {/* 4. 메인 콘텐츠 영역 (선택된 탭에 따라 렌더링) */}
      <div className="flex-1 min-h-0 px-6 pb-5 pt-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 bg-white border border-slate-300 rounded-b-2xl rounded-tr-2xl shadow-sm overflow-hidden flex flex-col">
          {/* TAB 1: 10분 단위 타임테이블 간트차트 뷰 */}
          {activeTab === 'GANTT' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50/40">
              <GanttTimelineView
                onSelectLine={(lineName) => {
                  setSelectedLine(lineName);
                  setActiveTab('TIMETABLE');
                }}
              />
            </div>
          )}

          {/* TAB 4: 수주량 연동 속도 시뮬레이터 뷰 */}
          {activeTab === 'SIMULATOR' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50/40">
              <SpeedSimulatorView />
            </div>
          )}
          {/* TAB 1: 타임테이블 스케줄 테이블 (일일 작업지시서) */}
          {activeTab === 'TIMETABLE' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-left border-collapse text-sm sm:text-base">
                <thead className="bg-slate-100 text-slate-800 font-black sticky top-0 z-10 border-b-2 border-slate-300 text-center text-sm sm:text-base">
                  <tr>
                    <th className="py-3.5 px-2.5 w-24 text-center font-black">순서</th>
                    <th className="py-3.5 px-2.5 w-28 text-center font-black">구분</th>
                    <th className="py-3.5 px-3 w-40 text-center font-black">작업시간</th>
                    <th className="py-3.5 px-2.5 w-24 text-center font-black">유형</th>
                    <th className="py-3.5 px-4 text-left font-black">지시 제품명</th>
                    <th className="py-3.5 px-4 w-36 text-right font-black">지시수량</th>
                    <th className="py-3.5 px-3 w-28 text-center font-black">소요시간</th>
                    <th className="py-3.5 px-2.5 w-24 text-center font-black">인원</th>
                    <th className="py-3.5 px-4 text-left font-black">주요 원부자재 배합 기준 (BOM)</th>
                    <th className="py-3.5 px-4 w-52 text-left font-black">HACCP & CCP 핵심 관리기준</th>
                    <th className="py-3.5 px-3 w-32 text-center font-black">진행상태</th>
                    <th className="py-3.5 px-3 w-32 text-center font-black">담당자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredSchedule.map((task, idx) => {
                    const isDone = task.status === '완료';
                    const isProgress = task.status === '진행중';
                    const isClean = task.type === '청소';
                    const isMeal = task.type === '휴게';
                    const isSupport = task.type === '지원';

                    // 시프트 뱃지 색상
                    let shiftBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                    if (task.shift.includes('2편')) shiftBadgeClass = 'bg-blue-100 text-blue-900 border-blue-300 font-black';
                    else if (task.shift.includes('1편')) shiftBadgeClass = 'bg-pink-100 text-pink-900 border-pink-300 font-black';
                    else if (task.shift.includes('지원')) shiftBadgeClass = 'bg-indigo-100 text-indigo-900 border-indigo-300 font-black';
                    else shiftBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 font-black';

                    return (
                      <tr
                        key={task.id}
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
                            : isClean
                            ? 'bg-amber-50/60'
                            : isMeal
                            ? 'bg-slate-100/70'
                            : isSupport
                            ? 'bg-indigo-50/50'
                            : isDone
                            ? 'bg-slate-50 opacity-80'
                            : 'hover:bg-blue-50/40'
                        }`}
                      >
                        {/* 1. 순서 핸들러 & 순번 */}
                        <td className="py-3.5 px-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span
                              className="text-slate-400 hover:text-blue-600 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200/60"
                              title="마우스로 끌어서 순서 이동 (드래그 앤 드롭)"
                            >
                              <GripVertical size={18} />
                            </span>
                            <span className="font-mono font-black text-slate-900 text-base sm:text-lg w-7">
                              {task.seq}
                            </span>
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => moveTask(idx, 'UP')}
                                disabled={idx === 0}
                                title="위로 순서 올리기"
                                className="p-0.5 hover:bg-blue-100 text-slate-600 hover:text-blue-700 disabled:opacity-20 cursor-pointer rounded"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveTask(idx, 'DOWN')}
                                disabled={idx === filteredSchedule.length - 1}
                                title="아래로 순서 내리기"
                                className="p-0.5 hover:bg-blue-100 text-slate-600 hover:text-blue-700 disabled:opacity-20 cursor-pointer rounded"
                              >
                                <ArrowDown size={14} />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* 2. 구분 (시프트 뱃지) */}
                        <td className="py-3.5 px-2.5 text-center">
                          <span className={`inline-block px-3 py-1 rounded-lg text-xs sm:text-sm font-black border ${shiftBadgeClass}`}>
                            {task.shift}
                          </span>
                        </td>

                        {/* 3. 작업시간 */}
                        <td className="py-3.5 px-3 text-center font-mono font-black text-slate-900 text-sm sm:text-base whitespace-nowrap">
                          {task.time}
                        </td>

                        {/* 4. 유형 */}
                        <td className="py-3.5 px-2.5 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-xs sm:text-sm font-black ${
                              task.type === '생산'
                                ? 'bg-blue-100 text-blue-900 font-black'
                                : task.type === '청소'
                                ? 'bg-amber-100 text-amber-900 font-black'
                                : task.type === '지원'
                                ? 'bg-indigo-100 text-indigo-900 font-black'
                                : 'bg-slate-200 text-slate-700 font-bold'
                            }`}
                          >
                            {task.type}
                          </span>
                        </td>

                        {/* 5. 지시 제품명 */}
                        <td className="py-3.5 px-4 font-black text-slate-950 text-base sm:text-lg tracking-tight">
                          {task.item}
                        </td>

                        {/* 6. 지시수량 */}
                        <td className="py-3.5 px-4 text-right font-mono font-black text-indigo-950 text-base sm:text-lg whitespace-nowrap">
                          {typeof task.qty === 'number' ? task.qty.toLocaleString() + ' ea' : task.qty}
                        </td>

                        {/* 7. 소요시간 */}
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-800 text-sm sm:text-base">
                          {task.duration}
                        </td>

                        {/* 8. 인원 */}
                        <td className="py-3.5 px-2.5 text-center font-black text-slate-900 text-sm sm:text-base">
                          {task.workers}
                        </td>

                        {/* 9. 주요 원부자재 배합 기준 (BOM) */}
                        <td className="py-3.5 px-4 text-sm sm:text-base text-slate-800 leading-relaxed font-medium">
                          {task.bom}
                        </td>

                        {/* 10. HACCP & CCP 핵심 관리기준 */}
                        <td className="py-3.5 px-4 text-sm sm:text-base font-black text-red-700 leading-snug">
                          {task.ccp}
                        </td>

                        {/* 11. 진행상태 버튼 토글 */}
                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleStatus(task.id)}
                            className={`px-3.5 py-1.5 rounded-xl font-black text-xs sm:text-sm shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 mx-auto ${
                              isDone
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : isProgress
                                ? 'bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-300'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {isDone ? (
                              <>
                                <CheckCircle2 size={15} />
                                <span>완료</span>
                              </>
                            ) : isProgress ? (
                              <>
                                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                                <span>진행중</span>
                              </>
                            ) : (
                              <span>대기</span>
                            )}
                          </button>
                        </td>

                        {/* 12. 담당자 인풋 */}
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="text"
                            value={task.assignee}
                            onChange={(e) => updateAssignee(task.id, e.target.value)}
                            placeholder="담당자"
                            className="w-24 text-center font-black text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: 소요 원부자재 불출·계량표 */}
          {activeTab === 'MATERIALS' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-left border-collapse text-sm sm:text-base">
                <thead className="bg-slate-100 text-slate-800 font-black sticky top-0 z-10 border-b-2 border-slate-300 text-center text-sm sm:text-base">
                  <tr>
                    <th className="py-3.5 px-3 w-20 text-center">불출확인</th>
                    <th className="py-3.5 px-4 text-left">원부자재 품명</th>
                    <th className="py-3.5 px-3 w-40 text-center">규격/포장단위</th>
                    <th className="py-3.5 px-4 w-40 text-right">소요 요구량</th>
                    <th className="py-3.5 px-3 w-28 text-center">단위</th>
                    <th className="py-3.5 px-3 w-36 text-center">보관창고</th>
                    <th className="py-3.5 px-4 w-40 text-right">현재 창고재고</th>
                    <th className="py-3.5 px-3 w-32 text-center">재고상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredMaterials.map((m) => {
                    // 창고 뱃지 색상
                    let whBadge = 'bg-amber-100 text-amber-900 border-amber-300';
                    if (m.warehouse === '냉장1') whBadge = 'bg-sky-100 text-sky-900 border-sky-300';
                    else if (m.warehouse === '냉장2') whBadge = 'bg-blue-100 text-blue-900 border-blue-300';
                    else if (m.warehouse === '냉동') whBadge = 'bg-cyan-100 text-cyan-900 border-cyan-300';
                    else if (m.warehouse === '부자재') whBadge = 'bg-purple-100 text-purple-900 border-purple-300';

                    const isSufficient = m.currentStock >= m.requiredQty;

                    return (
                      <tr
                        key={m.id}
                        onClick={() => toggleMaterialCheck(m.id)}
                        className={`cursor-pointer transition-colors ${
                          m.checked ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* 1. 체크박스 */}
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={m.checked}
                            onChange={() => toggleMaterialCheck(m.id)}
                            className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* 2. 품명 */}
                        <td className="py-3.5 px-4 font-black text-slate-900 text-base sm:text-lg flex items-center gap-2">
                          <span>{m.name}</span>
                          {m.checked && (
                            <span className="text-xs bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded">
                              계량완료
                            </span>
                          )}
                        </td>

                        {/* 3. 규격 */}
                        <td className="py-3.5 px-3 text-center text-slate-700 font-mono text-sm sm:text-base font-bold">
                          {m.spec}
                        </td>

                        {/* 4. 소요량 */}
                        <td className="py-3.5 px-4 text-right font-mono font-black text-indigo-950 text-base sm:text-lg">
                          {m.requiredQty.toLocaleString()}
                        </td>

                        {/* 5. 단위 */}
                        <td className="py-3.5 px-3 text-center font-black text-slate-800 text-sm sm:text-base">
                          {m.unit}
                        </td>

                        {/* 6. 창고 뱃지 */}
                        <td className="py-3.5 px-3 text-center">
                          <span className={`inline-block px-3 py-1 rounded-lg text-xs sm:text-sm font-black border ${whBadge}`}>
                            {m.warehouse}
                          </span>
                        </td>

                        {/* 7. 현재고 */}
                        <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900 text-sm sm:text-base">
                          {m.currentStock.toLocaleString()} {m.unit}
                        </td>

                        {/* 8. 재고 상태 */}
                        <td className="py-3.5 px-3 text-center">
                          {isSufficient ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-black text-xs sm:text-sm">
                              <CheckCircle2 size={16} />
                              <span>충분</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 font-black text-xs sm:text-sm">
                              <AlertCircle size={16} />
                              <span>부족</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 테이블 하단 푸터 바 (현장 필수 준수사항 및 발행 정보) */}
          <div className="bg-slate-50 px-6 py-2.5 border-t border-slate-300 flex flex-wrap items-center justify-between text-xs text-slate-600 font-medium">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                현장 필수 준수
              </span>
              <span>1. 알레르기 교차오염 방지 알코올 70% 세척 &nbsp;|&nbsp; 2. 금속검출기 30분 주기 점검 &nbsp;|&nbsp; 3. 품온 기준 10℃ 이하 엄수 (가열육 ≥75℃)</span>
            </div>
            <div className="font-mono text-slate-500">
              문서번호: <strong>{currentLine.docNo}</strong> &nbsp;|&nbsp; 시스템 자동 연동 완료
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
