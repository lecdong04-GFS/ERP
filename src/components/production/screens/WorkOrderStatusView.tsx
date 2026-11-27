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
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import { usePrintReport } from '@/context/PrintReportContext';
import { escapeHtml } from '@/lib/sanitize';
import { kstToday } from '@/lib/kst';
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
import {
  ProductionConfigModal,
  loadProductionConfig,
} from '@/components/production/modals/ProductionConfigModal';
import { RiceWorkOrderTabsPanel } from '@/components/production/RiceWorkOrderTabsPanel';
import { GFS_SALES_ORDER_CHANGED_EVENT } from '@/lib/gfs/orderSyncEvent';
import { buildMasterWorkOrderPrintHtml } from '@/lib/production/printMasterWorkOrder';
import { applyWorkersOverride } from '@/lib/production/riceScheduleEngine';

const SEONGHYEONG_LINES = [
  { id: 'ALL_SEONGHYEONG', name: '전체 성형장 (9개 라인 종합)', icon: '🌟', count: 9 },
  { id: '도시락 1', name: '도시락 1', icon: '🍱', count: 55 },
  { id: '김밥성형', name: '김밥성형', icon: '🍙', count: 39 },
  { id: '김밥포장', name: '김밥포장', icon: '📦', count: 39 },
  { id: '햄버거', name: '햄버거', icon: '🍔', count: 31 },
  { id: '샌드위치', name: '샌드위치', icon: '🥪', count: 39 },
  { id: '커플 포장기', name: '커플 포장기', icon: '🎁', count: 4 },
  { id: '삼각김밥 1호기', name: '삼각김밥 1호기', icon: '🔺', count: 27 },
  { id: '삼각김밥 2호기', name: '삼각김밥 2호기', icon: '🔺', count: 33 },
  { id: '삼각김밥(더큰)', name: '삼각김밥(더큰)', icon: '🍙', count: 40 },
];

const JEONCHEORI_EQUIPMENT = [
  { id: 'ALL_JEONCHEORI', name: '전체 전처리실 (20개 설비 종합)', icon: '🌟', count: 20 },
  { id: '취반실', name: '취반실', icon: '🍚', count: 26 },
  { id: '취반실(로터리 1호)', name: '취반실(로터리 1호)', icon: '🍚', count: 20 },
  { id: '취반실(로터리 2호)', name: '취반실(로터리 2호)', icon: '🍚', count: 22 },
  { id: '스팀솥 1번', name: '스팀솥 1번', icon: '🍲', count: 24 },
  { id: '스팀솥 2번', name: '스팀솥 2번', icon: '🍲', count: 26 },
  { id: '자동스팀솥 1호기', name: '자동스팀솥 1호기', icon: '🍲', count: 18 },
  { id: '자동스팀솥 2호기', name: '자동스팀솥 2호기', icon: '🍲', count: 20 },
  { id: '오토후라이어1', name: '오토후라이어1', icon: '🍗', count: 22 },
  { id: '오토후라이어2', name: '오토후라이어2', icon: '🍗', count: 16 },
  { id: '제트오븐', name: '제트오븐', icon: '♨️', count: 30 },
  { id: '콤비오븐', name: '콤비오븐', icon: '♨️', count: 28 },
  { id: '샐러드실(믹서1)', name: '샐러드실(믹서1)', icon: '🥗', count: 32 },
  { id: '샐러드실(믹서2)', name: '샐러드실(믹서2)', icon: '🥗', count: 38 },
  { id: '커팅실(후드)', name: '커팅실(후드)', icon: '🔪', count: 6 },
  { id: '커팅실(푸드커터)', name: '커팅실(푸드커터)', icon: '🔪', count: 2 },
  { id: '채소작업실(슬라이스)', name: '채소작업실(슬라이스)', icon: '🥬', count: 8 },
  { id: '채소작업실(후드)', name: '채소작업실(후드)', icon: '🥬', count: 14 },
  { id: '계량실(계량)', name: '계량실(계량)', icon: '⚖️', count: 2 },
  { id: '계량실(냉동)', name: '계량실(냉동)', icon: '❄️', count: 2 },
  { id: '빵슬라이스실(슬라이서)', name: '빵슬라이스실', icon: '🍞', count: 4 },
];

/**
 * 밥 색상 식별 헬퍼 (BOM 원재료 우선 + 품목명 보조 — 백미 ➔ 흑미 ➔ 빨간 볶음밥 시퀀싱 표시)
 */
function getRiceColorBadge(name: string, bomText?: string) {
  const n = (name || '').toLowerCase();
  const b = (bomText || '').toLowerCase();

  // 1. BOM 원재료 기반 우선 판별 (riceScheduleEngine.classifyRiceColor와 동일 기준)
  if (b && b !== '-') {
    if (/김치볶음밥용소스|뉴비빔밥용고추장소스|파프리카소스|비빔밥용고추장/.test(b)) {
      return { label: '빨간밥', bg: 'bg-rose-100 text-rose-800 border-rose-300' };
    }
    if (/흑미|잡곡|보리|현미/.test(b)) {
      return { label: '흑미/잡곡', bg: 'bg-purple-100 text-purple-800 border-purple-300' };
    }
    if (/백미|쌀|초밥|스시|김밥/.test(b)) {
      return { label: '백미', bg: 'bg-slate-100 text-slate-800 border-slate-300' };
    }
  }

  // 2. 품목명 기반 흑미 도시락 예외 우선 (반반제육/두부김치제육/갈비양념제육 등은 흑미밥)
  if (
    n.includes('흑미') ||
    n.includes('잡곡') ||
    n.includes('보리') ||
    n.includes('현미') ||
    n.includes('옥수수') ||
    n.includes('파프리카') ||
    n.includes('반반제육') ||
    n.includes('두부김치제육') ||
    n.includes('갈비양념제육') ||
    n.includes('순창제육')
  ) {
    return { label: '흑미/잡곡', bg: 'bg-purple-100 text-purple-800 border-purple-300' };
  }

  // 3. 품목명 기반 빨간밥(볶음/양념)
  if (
    n.includes('김치볶음') ||
    n.includes('전주비빔') ||
    n.includes('떡갈비김밥') ||
    n.includes('비빔') ||
    n.includes('고추장') ||
    n.includes('불닭') ||
    n.includes('빨간') ||
    n.includes('감자탕') ||
    n.includes('팔도') ||
    n.includes('매콤') ||
    n.includes('스팸김치') ||
    n.includes('종가')
  ) {
    if (n.includes('계란볶음밥') || n.includes('간장계란')) {
      return { label: '백미/담색', bg: 'bg-amber-100 text-amber-800 border-amber-300' };
    }
    return { label: '빨간밥', bg: 'bg-rose-100 text-rose-800 border-rose-300' };
  }

  if (
    n.includes('도시락') ||
    n.includes('김밥') ||
    n.includes('삼각') ||
    n.includes('밥') ||
    n.includes('초밥') ||
    n.includes('백미') ||
    n.includes('참치') ||
    n.includes('스팸') ||
    n.includes('명불허전') ||
    n.includes('돈까스') ||
    n.includes('치킨까스') ||
    n.includes('한상')
  ) {
    return { label: '백미', bg: 'bg-slate-100 text-slate-800 border-slate-300' };
  }
  return null;
}

/**
 * 시간 및 소요시간 파싱/연산 헬퍼 (스마트 연쇄 재계산)
 */
function parseTimeStr(t: string): { start: string; end: string; startMin: number; endMin: number } {
  const parts = (t || '').split('~').map((s) => s.trim());
  const start = parts[0] || '09:00';
  const end = parts[1] || '09:45';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = (isNaN(sh) ? 9 : sh) * 60 + (isNaN(sm) ? 0 : sm);
  const endMin = (isNaN(eh) ? 9 : eh) * 60 + (isNaN(em) ? 45 : em);
  return { start, end, startMin, endMin };
}

function minToTimeStr(min: number): string {
  const normalized = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseDurationMin(dur: string, fallback: number = 30): number {
  const match = String(dur || '').match(/(\d+(?:\.\d+)?)/);
  if (match) return Math.max(1, Math.round(parseFloat(match[1])));
  return fallback;
}

export const WorkOrderStatusView: React.FC = () => {
  const { openPrintModal, setWorkOrderPayload } = usePrintReport();

  // 조회 조건
  const [workDate, setWorkDate] = useState(kstToday() || '2026-11-06');
  const [shift, setShift] = useState<'전체' | '1편' | '2편'>('전체');
  const [department, setDepartment] = useState<'SEONGHYEONG' | 'JEONCHEORI'>('SEONGHYEONG');
  const [selectedLine, setSelectedLine] = useState<string>('도시락 1');
  const [isLineDropdownOpen, setIsLineDropdownOpen] = useState(false);
  const lineDropdownRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'AUTO_5TAB' | 'GANTT' | 'TIMETABLE' | 'MATERIALS' | 'SIMULATOR'>('TIMETABLE');
  const [isSimpleFieldView, setIsSimpleFieldView] = useState<boolean>(false);
  const [materialWhFilter, setMaterialWhFilter] = useState<string>('전체');

  // 큰 팝업 모달 상태
  const [isLargeModalOpen, setIsLargeModalOpen] = useState(false);
  const [modalFontSize, setModalFontSize] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const [modalActiveTab, setModalActiveTab] = useState<'AUTO_5TAB' | 'GANTT' | 'TIMETABLE' | 'MATERIALS' | 'SIMULATOR'>('TIMETABLE');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  const openLargeModal = (tab?: 'AUTO_5TAB' | 'GANTT' | 'TIMETABLE' | 'MATERIALS' | 'SIMULATOR') => {
    setModalActiveTab(tab || activeTab);
    setIsLargeModalOpen(true);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLargeModalOpen) setIsLargeModalOpen(false);
        if (isLineDropdownOpen) setIsLineDropdownOpen(false);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (
        isLineDropdownOpen &&
        lineDropdownRef.current &&
        !lineDropdownRef.current.contains(e.target as Node)
      ) {
        setIsLineDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    if (isLargeModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
      document.body.style.overflow = '';
    };
  }, [isLargeModalOpen, isLineDropdownOpen]);

  // 작업시간 연쇄 자동 계산 활성화 플래그
  const [autoCascadeTime, setAutoCascadeTime] = useState(true);
  const [autoCascadeOnReorder, setAutoCascadeOnReorder] = useState(true);

  // 실시간 라인별 작업 건수 (API 응답 기반)
  const [liveLineCounts, setLiveLineCounts] = useState<Record<string, number> | null>(null);

  // 활성 공정에 따른 라인/설비 목록
  const activeLineList = useMemo(() => {
    const base = department === 'SEONGHYEONG' ? SEONGHYEONG_LINES : JEONCHEORI_EQUIPMENT;
    if (!liveLineCounts) return base;
    return base.map((item) => ({
      ...item,
      count: liveLineCounts[item.id] ?? 0,
    }));
  }, [department, liveLineCounts]);

  // 공정 변경 핸들러
  const handleDepartmentChange = (dept: 'SEONGHYEONG' | 'JEONCHEORI') => {
    setDepartment(dept);
    setSelectedLine(dept === 'SEONGHYEONG' ? '도시락 1' : '취반실');
  };

  // 현재 라인 정본 정의
  const currentLine = useMemo(() => {
    return getLineDef(selectedLine, department);
  }, [selectedLine, department]);

  // 스케줄 상태 (순서 이동, 상태 토글, 담당자 입력)
  const [scheduleTasks, setScheduleTasks] = useState<ScheduleTask[]>([]);
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [realOrderMeta, setRealOrderMeta] = useState<{
    hasRealOrders: boolean;
    totalOrdersCount: number;
    totalDayQty: number;
    totalDayAmount?: number;
    shift2Qty?: number;
    shift1Qty?: number;
    distinctItemCount: number;
    lineTotalPlan?: string;
  } | null>(null);

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
  const fetchServerWorkOrders = useCallback(async (date: string, sft: string, line: string, forceRefresh = false) => {
    setLoading(true);
    try {
      const refreshParam = forceRefresh ? '&refresh=true' : '';
      const res = await fetch(
        `/api/production/work-order?workDate=${date}&shift=${sft}&line=${encodeURIComponent(line)}${refreshParam}`
      );
      const json = await res.json();
      if (json.success && json.lineCounts && typeof json.lineCounts === 'object') {
        setLiveLineCounts(json.lineCounts);
      } else {
        setLiveLineCounts(null);
      }
      if (json.success && Array.isArray(json.data) && (json.data.length > 0 || (json.totalOrdersCount || 0) > 0)) {
        setScheduleTasks(json.data);
        setMaterials(Array.isArray(json.materials) ? json.materials : []);
        setRealOrderMeta({
          hasRealOrders: Boolean(json.hasRealOrders),
          totalOrdersCount: json.totalOrdersCount || 0,
          totalDayQty: json.totalDayQty || 0,
          totalDayAmount: json.totalDayAmount || 0,
          shift2Qty: json.shift2Qty || 0,
          shift1Qty: json.shift1Qty || 0,
          distinctItemCount: json.distinctItemCount || json.data.length,
          lineTotalPlan: json.lineTotalPlan,
        });
        if (forceRefresh) {
          setSaveToast(
            json.data.length > 0
              ? '🔄 최신 수주 데이터를 즉시 반영하여 작업지시서를 재계산했습니다!'
              : 'ℹ️ 해당 라인의 금일 수주 물량이 없습니다.'
          );
          setTimeout(() => setSaveToast(null), 3500);
        }
      } else {
        setScheduleTasks(currentLine.schedule.map((s) => ({ ...s })));
        setMaterials(currentLine.materials.map((m) => ({ ...m })));
        setRealOrderMeta(null);
        if (forceRefresh) {
          setSaveToast('ℹ️ 해당 일자의 등록된 수주 데이터가 없습니다.');
          setTimeout(() => setSaveToast(null), 3000);
        }
      }
    } catch (err) {
      console.error('Failed to load work orders:', err);
      setScheduleTasks(currentLine.schedule.map((s) => ({ ...s })));
      setMaterials(currentLine.materials.map((m) => ({ ...m })));
      setRealOrderMeta(null);
    } finally {
      setLoading(false);
    }
  }, [currentLine]);

  useEffect(() => {
    const onOrderChanged = () => {
      void fetchServerWorkOrders(workDate, shift, selectedLine, true);
    };
    window.addEventListener(GFS_SALES_ORDER_CHANGED_EVENT, onOrderChanged);
    return () => window.removeEventListener(GFS_SALES_ORDER_CHANGED_EVENT, onOrderChanged);
  }, [workDate, shift, selectedLine, fetchServerWorkOrders]);

  useEffect(() => {
    void fetchServerWorkOrders(workDate, shift, selectedLine);
  }, [fetchServerWorkOrders, workDate, shift, selectedLine]);

  // 순서 변경 시 원래 라인 시작 시각을 유지한 채 전체 시간 연쇄 재계산
  const cascadeScheduleTimes = (
    reordered: ScheduleTask[],
    anchorStartTime: string
  ): ScheduleTask[] => {
    if (!autoCascadeOnReorder || reordered.length === 0) return reordered;
    const [sh, sm] = anchorStartTime.split(':').map(Number);
    let curStartMin = (isNaN(sh) ? 9 : sh) * 60 + (isNaN(sm) ? 30 : sm);
    return reordered.map((task) => {
      const dur = parseDurationMin(task.duration, 30);
      const endMin = curStartMin + dur;
      const nextTime = `${minToTimeStr(curStartMin)} ~ ${minToTimeStr(endMin)}`;
      const gap = task.type === '휴게' || task.type === '청소' ? 0 : 5;
      curStartMin = endMin + gap;
      return {
        ...task,
        time: nextTime,
      };
    });
  };

  // 순서 이동 핸들러 (▲ / ▼)
  const moveTask = (filteredIdx: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && filteredIdx === 0) return;
    if (direction === 'DOWN' && filteredIdx >= filteredSchedule.length - 1) return;

    const fromTask = filteredSchedule[filteredIdx];
    const toTask = filteredSchedule[direction === 'UP' ? filteredIdx - 1 : filteredIdx + 1];
    if (!fromTask || !toTask) return;

    const fromIdx = scheduleTasks.findIndex((t) => t.id === fromTask.id);
    const toIdx = scheduleTasks.findIndex((t) => t.id === toTask.id);
    if (fromIdx === -1 || toIdx === -1) return;

    const anchorStart =
      (scheduleTasks[0] && parseTimeStr(scheduleTasks[0].time).start) || '09:30';

    const newTasks = [...scheduleTasks];
    const temp = newTasks[fromIdx];
    newTasks[fromIdx] = newTasks[toIdx];
    newTasks[toIdx] = temp;

    const reordered = newTasks.map((t, idx) => ({
      ...t,
      seq: idx + 1,
    }));

    setScheduleTasks(cascadeScheduleTimes(reordered, anchorStart));
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

  const handleDrop = (e: React.DragEvent, targetFilteredIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetFilteredIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const fromTask = filteredSchedule[draggedIndex];
    const toTask = filteredSchedule[targetFilteredIndex];
    if (!fromTask || !toTask) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const fromIdx = scheduleTasks.findIndex((t) => t.id === fromTask.id);
    const toIdx = scheduleTasks.findIndex((t) => t.id === toTask.id);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const anchorStart =
      (scheduleTasks[0] && parseTimeStr(scheduleTasks[0].time).start) || '09:30';

    const newTasks = [...scheduleTasks];
    const [draggedItem] = newTasks.splice(fromIdx, 1);
    newTasks.splice(toIdx, 0, draggedItem);

    const reordered = newTasks.map((t, idx) => ({
      ...t,
      seq: idx + 1,
    }));

    setScheduleTasks(cascadeScheduleTimes(reordered, anchorStart));
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // ── 스마트 편집 핸들러 (작업시간 연쇄 계산 및 제품명/수량 수정) ──

  // 1. 작업 시작시각 변경 및 연쇄 자동 계산
  const updateTaskStartTime = (id: string, newStart: string) => {
    setScheduleTasks((prev) => {
      const list = prev.map((t) => ({ ...t }));
      const idx = list.findIndex((t) => t.id === id);
      if (idx === -1) return prev;

      const [sh, sm] = newStart.split(':').map(Number);
      if (isNaN(sh) || isNaN(sm) || sh < 0 || sh > 23 || sm < 0 || sm > 59) {
        list[idx].time = `${newStart} ~ ${parseTimeStr(list[idx].time).end}`;
        return list;
      }

      let curStartMin = sh * 60 + sm;

      for (let i = idx; i < list.length; i++) {
        const task = list[i];
        const dur = parseDurationMin(task.duration, 30);
        const endMin = curStartMin + dur;
        list[i].time = `${minToTimeStr(curStartMin)} ~ ${minToTimeStr(endMin)}`;

        if (!autoCascadeTime) break;

        const gap = task.type === '휴게' || task.type === '청소' ? 0 : 5;
        curStartMin = endMin + gap;
      }

      return list;
    });
  };

  // 2. 작업 종료시각 변경
  const updateTaskEndTime = (id: string, newEnd: string) => {
    setScheduleTasks((prev) => {
      const list = prev.map((t) => ({ ...t }));
      const idx = list.findIndex((t) => t.id === id);
      if (idx === -1) return prev;

      const [eh, em] = newEnd.split(':').map(Number);
      if (isNaN(eh) || isNaN(em) || eh < 0 || eh > 23 || em < 0 || em > 59) {
        list[idx].time = `${parseTimeStr(list[idx].time).start} ~ ${newEnd}`;
        return list;
      }

      const { startMin, start } = parseTimeStr(list[idx].time);
      const endMin = eh * 60 + em;
      let dur = endMin - startMin;
      if (dur < 0) dur += 1440;
      if (dur === 0) dur = 5;

      list[idx].duration = `${dur}분`;
      list[idx].time = `${start} ~ ${minToTimeStr(endMin)}`;

      if (autoCascadeTime) {
        let curStartMin = endMin + (list[idx].type === '휴게' || list[idx].type === '청소' ? 0 : 5);
        for (let i = idx + 1; i < list.length; i++) {
          const task = list[i];
          const taskDur = parseDurationMin(task.duration, 30);
          const nextEndMin = curStartMin + taskDur;
          list[i].time = `${minToTimeStr(curStartMin)} ~ ${minToTimeStr(nextEndMin)}`;
          const gap = task.type === '휴게' || task.type === '청소' ? 0 : 5;
          curStartMin = nextEndMin + gap;
        }
      }

      return list;
    });
  };

  // 3. 소요시간 변경 및 연쇄 자동 계산
  const updateTaskDuration = (id: string, newDuration: string) => {
    setScheduleTasks((prev) => {
      const list = prev.map((t) => ({ ...t }));
      const idx = list.findIndex((t) => t.id === id);
      if (idx === -1) return prev;

      const dur = parseDurationMin(newDuration, 30);
      list[idx].duration = `${dur}분`;

      const { startMin, start } = parseTimeStr(list[idx].time);
      const endMin = startMin + dur;
      list[idx].time = `${start} ~ ${minToTimeStr(endMin)}`;

      if (autoCascadeTime) {
        let curStartMin = endMin + (list[idx].type === '휴게' || list[idx].type === '청소' ? 0 : 5);
        for (let i = idx + 1; i < list.length; i++) {
          const task = list[i];
          const taskDur = parseDurationMin(task.duration, 30);
          const nextEndMin = curStartMin + taskDur;
          list[i].time = `${minToTimeStr(curStartMin)} ~ ${minToTimeStr(nextEndMin)}`;
          const gap = task.type === '휴게' || task.type === '청소' ? 0 : 5;
          curStartMin = nextEndMin + gap;
        }
      }

      return list;
    });
  };

  // 4. 지시 제품명 변경
  const updateTaskItem = (id: string, newItem: string) => {
    setScheduleTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, item: newItem } : t))
    );
  };

  // 5. 지시 수량 변경
  const updateTaskQty = (id: string, newQty: string | number) => {
    const num = typeof newQty === 'number' ? newQty : Number(newQty) || 0;
    setScheduleTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, qty: num } : t))
    );
  };

  // 6. 인원 변경
  const updateTaskWorkers = (id: string, workers: string) => {
    setScheduleTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, workers } : t))
    );
  };

  // 7. BOM 텍스트 변경
  const updateTaskBom = (id: string, bom: string) => {
    setScheduleTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, bom } : t))
    );
  };

  // 8. CCP 텍스트 변경
  const updateTaskCcp = (id: string, ccp: string) => {
    setScheduleTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ccp } : t))
    );
  };

  // 9. 시프트 변경 토글
  const updateTaskShift = (id: string, newShift: any) => {
    setScheduleTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, shift: newShift } : t))
    );
  };

  // 10. 전체 시간 순차 자동 정렬
  const handleRecalculateAll = (firstStart?: string) => {
    setScheduleTasks((prev) => {
      if (prev.length === 0) return prev;
      const list = prev.map((t) => ({ ...t }));
      const baseStart = firstStart || parseTimeStr(list[0].time).start || '09:00';
      const [sh, sm] = baseStart.split(':').map(Number);
      let curStartMin = (isNaN(sh) ? 9 : sh) * 60 + (isNaN(sm) ? 0 : sm);

      for (let i = 0; i < list.length; i++) {
        const task = list[i];
        const dur = parseDurationMin(task.duration, 30);
        const endMin = curStartMin + dur;
        list[i].time = `${minToTimeStr(curStartMin)} ~ ${minToTimeStr(endMin)}`;
        const gap = task.type === '휴게' || task.type === '청소' ? 0 : 5;
        curStartMin = endMin + gap;
      }
      return list;
    });
  };

  // 11. 전체 시간 일괄 넛지 (+10분 / -10분)
  const handleNudgeAll = (deltaMin: number) => {
    setScheduleTasks((prev) => {
      if (prev.length === 0) return prev;
      const list = prev.map((t) => {
        const { startMin, endMin } = parseTimeStr(t.time);
        const newStart = startMin + deltaMin;
        const newEnd = endMin + deltaMin;
        return {
          ...t,
          time: `${minToTimeStr(newStart)} ~ ${minToTimeStr(newEnd)}`,
        };
      });
      return list;
    });
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

  // 1. A4 큰글씨·고대비 현장 작업지시서 즉시 브라우저 인쇄 & PDF 저장 (실 수주량 반영)
  const handlePrintLiveWorkOrder = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.open(currentLine.pdfUrl || `/reports/work-orders/${encodeURIComponent(selectedLine)}.pdf`, '_blank');
      return;
    }

    const safeWorkDate = workDate || kstToday();
    const dateParts = safeWorkDate.split('-');
    const year = dateParts[0] || safeWorkDate.slice(0, 4);
    const month = dateParts[1] || safeWorkDate.slice(5, 7);
    const day = dateParts[2] || safeWorkDate.slice(8, 10);
    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = isNaN(dateObj.getTime()) ? '목' : dayNames[dateObj.getDay()];
    const formattedDateKo = `${year}년 ${Number(month)}월 ${Number(day)}일 (${dayOfWeek}요일)`;
    const docNumber = `GFS-WO-${year}${month}${day}-${selectedLine.replace(/\s+/g, '')}`;

    const totalRunTimeStr =
      filteredSchedule.length > 0
        ? `${filteredSchedule[0].time.split('~')[0].trim()} ~ ${
            filteredSchedule[filteredSchedule.length - 1].time.split('~')[1]?.trim() || '종료'
          }`
        : currentLine.totalTime;

    // 밥 종류별 생산 수량/건수 집계
    let whiteRiceQty = 0;
    let blackRiceQty = 0;
    let redRiceQty = 0;
    let prodTaskCount = 0;
    let totalOrderQtyNum = 0;

    filteredSchedule.forEach((t) => {
      const q = typeof t.qty === 'number' ? t.qty : 0;
      if (t.type === '생산' && q > 0) {
        prodTaskCount += 1;
        totalOrderQtyNum += q;
        const rBadge = getRiceColorBadge(t.item, t.bom);
        if (rBadge?.label === '빨간밥') {
          redRiceQty += q;
        } else if (rBadge?.label?.includes('흑미')) {
          blackRiceQty += q;
        } else {
          whiteRiceQty += q;
        }
      }
    });

    // 첫 번째 생산 품목 기준으로 표 맨 위(<thead> 첫 줄) 섹션 배너 결정
    const firstProdTask = filteredSchedule.find((t) => {
      const isClean = t.type === '청소' || t.item.includes('세척') || t.item.includes('CIP') || t.item.includes('소독');
      const isMeal = t.type === '휴게' || t.item.includes('중식') || t.item.includes('석식') || t.item.includes('점심');
      return !isClean && !isMeal;
    });
    const initialSec: 'NONE' | 'S2' | 'S1' = firstProdTask
      ? firstProdTask.shift.includes('1편')
        ? 'S1'
        : 'S2'
      : 'NONE';
    const topSectionTitle =
      initialSec === 'S2'
        ? '▶ 1부: 2편 생산 (당일 오후 출하 — 백미 ➔ 흑미 ➔ 빨간양념 순서 엄수)'
        : initialSec === 'S1'
        ? '▶ 2부: 1편 생산 (익일 새벽 출하 — 품목 교체 시 알코올 소독 필수)'
        : '';

    // 1부(2편 생산) / 2부(1편 생산) 섹션 헤더 자동 삽입 + 6열 큰글씨 행 렌더링
    let lastSection: 'NONE' | 'S2' | 'S1' = initialSec;
    let prodSeq = 0;

    const rowsHtml = filteredSchedule
      .map((t, idx) => {
        const isClean = t.type === '청소' || t.item.includes('세척') || t.item.includes('CIP') || t.item.includes('소독');
        const isMeal = t.type === '휴게' || t.item.includes('중식') || t.item.includes('석식') || t.item.includes('점심');

        let sectionBannerHtml = '';
        if (!isClean && !isMeal) {
          const curSec: 'S2' | 'S1' = t.shift.includes('1편') ? 'S1' : 'S2';
          if (curSec !== lastSection) {
            lastSection = curSec;
            const secTitle =
              curSec === 'S2'
                ? '▶ 1부: 2편 생산 (당일 오후 출하 — 백미 ➔ 흑미 ➔ 빨간양념 순서 엄수)'
                : '▶ 2부: 1편 생산 (익일 새벽 출하 — 품목 교체 시 알코올 소독 필수)';
            sectionBannerHtml = `
              <tr class="section-banner-row">
                <td colspan="6" class="section-banner-cell ${curSec === 'S1' ? 'section-s1' : 'section-s2'}">${escapeHtml(secTitle)}</td>
              </tr>
            `;
          }
        }

        if (isClean || isMeal) {
          const breakLabel = isMeal
            ? `🍱 ${t.item || '중식 및 라인 세척·소독'} (${t.duration || '60분'})`
            : `🧹 ${t.item || '작업장 세척·소독 및 금속검출기 점검'} (${t.duration || '30분'})`;
          return `
            ${sectionBannerHtml}
            <tr class="row-break">
              <td class="col-center col-seq">-</td>
              <td class="col-center col-time">${escapeHtml(t.time)}</td>
              <td class="col-center"><span class="rice-box rice-box-break">[휴게/세척]</span></td>
              <td colspan="2" class="col-break-title">${escapeHtml(breakLabel)}</td>
              <td class="col-center col-check-cell">□ 세척·소독 확인</td>
            </tr>
          `;
        }

        prodSeq += 1;
        const formattedQty = typeof t.qty === 'number' ? `${t.qty.toLocaleString()} 개` : t.qty || '-';
        const rBadge = getRiceColorBadge(t.item, t.bom);
        const riceLabel =
          rBadge?.label === '빨간밥'
            ? '볶음/양념'
            : rBadge?.label?.includes('흑미')
            ? '흑미/잡곡'
            : rBadge?.label
            ? '백미'
            : t.type || '생산';
        const riceBoxClass =
          rBadge?.label === '빨간밥'
            ? 'rice-box-red'
            : rBadge?.label?.includes('흑미')
            ? 'rice-box-purple'
            : 'rice-box-white';

        return `
          ${sectionBannerHtml}
          <tr class="${idx % 2 === 1 ? 'row-alt' : ''}">
            <td class="col-center col-seq">${prodSeq}</td>
            <td class="col-center col-time">${escapeHtml(t.time)}</td>
            <td class="col-center">
              <span class="rice-box ${riceBoxClass}">[${escapeHtml(riceLabel)}]</span>
            </td>
            <td class="col-item">
              <div class="item-main-name">${escapeHtml(t.item)}</div>
              ${
                t.bom && t.bom !== '-'
                  ? `<div class="item-sub-note">배합/규격: ${escapeHtml(t.bom)} | 소요: ${escapeHtml(t.duration)} (${escapeHtml(t.workers || currentLine.personnel.split('(')[0])})</div>`
                  : `<div class="item-sub-note">소요시간: ${escapeHtml(t.duration)} | 투입인원: ${escapeHtml(t.workers || currentLine.personnel.split('(')[0])}</div>`
              }
            </td>
            <td class="col-right col-qty">${escapeHtml(formattedQty)}</td>
            <td class="col-center col-check-cell">
              <span class="pen-check-box">□</span> 완료 (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
            </td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <title>[GFS 현장큰글씨] ${escapeHtml(selectedLine)}_일일작업지시서_${escapeHtml(safeWorkDate)}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 9mm 8mm 9mm;
          }
          * {
            box-sizing: border-box;
            font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif;
          }
          body {
            margin: 0;
            padding: 0;
            color: #000000;
            background: #ffffff;
            font-size: 13px;
            line-height: 1.35;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-toolbar {
            background: #0f172a;
            color: #ffffff;
            padding: 10px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            border-radius: 8px;
          }
          /* 1. 상단 굵은 검정 테두리 헤더 박스 */
          .top-header-box {
            border: 3px solid #000000;
            padding: 12px 16px;
            margin-bottom: 10px;
            background: #ffffff;
          }
          .top-header-row1 {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            border-bottom: 2px solid #000000;
            padding-bottom: 10px;
            margin-bottom: 10px;
          }
          .doc-kicker {
            font-size: 12px;
            font-weight: 900;
            color: #1e293b;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
          }
          .doc-big-title {
            font-size: 26px;
            font-weight: 900;
            color: #000000;
            letter-spacing: -0.8px;
            line-height: 1.15;
          }
          .sign-box {
            border: 2px solid #000000;
            padding: 8px 14px;
            font-size: 15px;
            font-weight: 900;
            background: #f8fafc;
            white-space: nowrap;
            text-align: right;
          }
          .top-header-meta-grid {
            display: grid;
            grid-template-columns: 1.3fr 1.1fr 1.2fr;
            gap: 8px;
            font-size: 14px;
            font-weight: 900;
          }
          .meta-pill {
            background: #f1f5f9;
            border: 1.5px solid #334155;
            padding: 6px 10px;
            border-radius: 4px;
          }
          .meta-pill strong {
            font-size: 15px;
            color: #000000;
          }

          /* 2. 현장 큰글씨 6열 메인 작업지시 표 */
          .work-table {
            width: 100%;
            border-collapse: collapse;
            border: 2.5px solid #000000;
            margin-bottom: 12px;
          }
          .work-table th {
            background: #e2e8f0;
            color: #000000;
            font-weight: 900;
            font-size: 14px;
            text-align: center;
            padding: 9px 6px;
            border: 1.5px solid #000000;
          }
          .work-table td {
            border: 1.5px solid #000000;
            padding: 9px 8px;
            vertical-align: middle;
          }
          .work-table tr.row-alt {
            background: #f8fafc;
          }
          .section-banner-row td.section-banner-cell {
            background: #1d4ed8 !important;
            color: #ffffff !important;
            font-size: 15px;
            font-weight: 900;
            padding: 9px 12px;
            letter-spacing: -0.2px;
            border: 2px solid #000000;
            text-align: left;
          }
          .section-banner-row td.section-banner-cell.section-s1 {
            background: #6d28d9 !important;
          }
          .row-break {
            background: #e2e8f0 !important;
            font-weight: 900;
          }
          .col-break-title {
            font-size: 15px;
            font-weight: 900;
            color: #0f172a;
            text-align: center;
          }
          .col-center { text-align: center; }
          .col-right { text-align: right; }
          .col-seq {
            font-family: monospace;
            font-size: 19px;
            font-weight: 900;
            width: 48px;
          }
          .col-time {
            font-family: monospace;
            font-size: 15px;
            font-weight: 900;
            width: 132px;
            white-space: nowrap;
          }
          .rice-box {
            display: inline-block;
            font-size: 13px;
            font-weight: 900;
            padding: 3px 6px;
            border-radius: 4px;
            border: 2px solid #000000;
            white-space: nowrap;
          }
          .rice-box-white { background: #ffffff; color: #000000; }
          .rice-box-purple { background: #f3e8ff; color: #3b0764; border-style: double; }
          .rice-box-red { background: #ffe4e6; color: #881337; border-width: 2.5px; }
          .rice-box-break { background: #cbd5e1; color: #0f172a; }
          .col-item {
            text-align: left;
          }
          .item-main-name {
            font-size: 17px;
            font-weight: 900;
            color: #000000;
            line-height: 1.25;
            word-break: keep-all;
          }
          .item-sub-note {
            font-size: 11.5px;
            font-weight: 700;
            color: #334155;
            margin-top: 2px;
          }
          .col-qty {
            font-family: monospace;
            font-size: 18px;
            font-weight: 900;
            color: #000000;
            width: 115px;
            white-space: nowrap;
          }
          .col-check-cell {
            width: 145px;
            font-size: 14px;
            font-weight: 900;
            color: #000000;
            white-space: nowrap;
          }
          .pen-check-box {
            font-size: 18px;
            font-weight: 900;
            vertical-align: middle;
          }

          /* 3. 하단 필수 위생·CCP 확인 & 밥 구분별 요약 박스 */
          .bottom-summary-grid {
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            gap: 10px;
            margin-bottom: 8px;
          }
          .summary-box {
            border: 2.5px solid #000000;
            padding: 10px 12px;
            background: #ffffff;
          }
          .summary-box-title {
            font-size: 15px;
            font-weight: 900;
            color: #000000;
            border-bottom: 2px solid #000000;
            padding-bottom: 5px;
            margin-bottom: 7px;
          }
          .ccp-check-list {
            margin: 0;
            padding: 0;
            list-style: none;
            font-size: 13px;
            font-weight: 800;
            line-height: 1.55;
          }
          .rice-sum-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            font-size: 13.5px;
            font-weight: 900;
          }
          .rice-sum-item {
            border: 1.5px solid #334155;
            padding: 5px 8px;
            background: #f8fafc;
            display: flex;
            justify-content: space-between;
          }
          .footer-line {
            border-top: 1.5px solid #000000;
            padding-top: 5px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            font-weight: 700;
            color: #334155;
          }
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; padding: 0; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="print-toolbar no-print">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-weight:900; font-size:14px;">🖨️ 현장 큰글씨·고대비 A4 작업지시서 인쇄 미리보기</span>
            <span style="background:#0284c7; color:#fff; padding:3px 10px; border-radius:4px; font-size:12px; font-weight:800;">
              ${escapeHtml(formattedDateKo)} · ${escapeHtml(selectedLine)}
            </span>
          </div>
          <div style="display:flex; gap:8px;">
            <button onclick="window.print()" style="padding:7px 18px; background:#16a34a; color:#fff; border:none; border-radius:6px; font-weight:900; font-size:13px; cursor:pointer;">
              🖨️ 지금 A4 인쇄 / PDF 저장
            </button>
            <button onclick="window.close()" style="padding:7px 14px; background:#475569; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:13px; cursor:pointer;">
              창 닫기
            </button>
          </div>
        </div>

        <!-- 1. 상단 고대비 타이틀 & 반장 서명란 -->
        <div class="top-header-box">
          <div class="top-header-row1">
            <div>
              <div class="doc-kicker">GFS 스마트 생산관제 · 식약처 HACCP 현장 게시용 정본 (${escapeHtml(docNumber)})</div>
              <div class="doc-big-title">[${escapeHtml(selectedLine)}] 일일 작업지시서</div>
            </div>
            <div class="sign-box">
              담당 반장 서명: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인)
            </div>
          </div>
          <div class="top-header-meta-grid">
            <div class="meta-pill">📅 작업일자: <strong>${escapeHtml(formattedDateKo)}</strong></div>
            <div class="meta-pill">⏰ 가동시간: <strong>${escapeHtml(totalRunTimeStr)}</strong></div>
            <div class="meta-pill">📦 총 지시량: <strong>${prodTaskCount}품목 / ${
      totalOrderQtyNum > 0
        ? `${totalOrderQtyNum.toLocaleString()} 개`
        : escapeHtml(realOrderMeta?.lineTotalPlan || currentLine.totalPlan)
    }</strong></div>
          </div>
        </div>

        <!-- 2. 6열 큰글씨 작업지시 표 (흑백 프린터 완벽 대비 + 볼펜 체크 공간) -->
        <table class="work-table">
          <thead>
            ${
              topSectionTitle
                ? `<tr class="section-banner-row">
                    <td colspan="6" class="section-banner-cell ${initialSec === 'S1' ? 'section-s1' : 'section-s2'}">${escapeHtml(topSectionTitle)}</td>
                  </tr>`
                : ''
            }
            <tr>
              <th style="width:34px;">순서</th>
              <th style="width:92px;">작업시간</th>
              <th style="width:70px;">밥/공정</th>
              <th>지시 제품명 (배합·소요시간)</th>
              <th style="width:98px;">지시수량</th>
              <th style="width:94px;">현장 체크 (V)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <!-- 3. 하단 필수 위생·CCP 확인 & 오늘 밥 구분별 요약 -->
        <div class="bottom-summary-grid">
          <div class="summary-box">
            <div class="summary-box-title">⚠️ 필수 위생 · CCP 현장 볼펜 체크</div>
            <ul class="ccp-check-list">
              <li>□ 작업 시작 전 및 품목 교체 시 컨베이어·성형틀 70% 알코올 소독 완료</li>
              <li>□ 금속검출기 테스트피스(Fe 2.0mm / SUS 3.0mm) 30분 주기 정상 통과</li>
              <li>□ 백미 ➔ 흑미 ➔ 빨간양념밥 작업 순서 준수 및 알레르기 교차오염 차단</li>
            </ul>
          </div>
          <div class="summary-box">
            <div class="summary-box-title">🍚 오늘 밥 구분별 생산 요약</div>
            <div class="rice-sum-grid">
              <div class="rice-sum-item">
                <span>[백미 제품]</span>
                <span>${whiteRiceQty.toLocaleString()} 개</span>
              </div>
              <div class="rice-sum-item">
                <span>[흑미/잡곡]</span>
                <span>${blackRiceQty.toLocaleString()} 개</span>
              </div>
              <div class="rice-sum-item">
                <span>[볶음/양념]</span>
                <span>${redRiceQty.toLocaleString()} 개</span>
              </div>
              <div class="rice-sum-item" style="background:#e2e8f0;">
                <span>총 생산합계</span>
                <span>${totalOrderQtyNum.toLocaleString()} 개</span>
              </div>
            </div>
          </div>
        </div>

        <div class="footer-line">
          <span>* 현장 반장님께서는 각 품목 완료 시 우측 [현장 체크(V)] 칸에 볼펜으로 체크(V) 및 완료 시각을 기입해 주십시오.</span>
          <span>GFS ERP 현장 맞춤 큰글씨 양식 | 인쇄일: ${new Date().toLocaleDateString('ko-KR')}</span>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 350);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // 1-2. 전부서(성형장 + 전처리실) 모든 가동 라인/설비 일괄 PDF 인쇄 (라인 PDF 양식 동일)
  const buildLiveWorkOrderPageSection = (opts: {
    lineId: string;
    deptLabel: string;
    tasks: ScheduleTask[];
    lineDef: LineWorkOrderDef;
    year: string;
    month: string;
    day: string;
    formattedDateKo: string;
    lineTotalPlan?: string;
  }) => {
    const { lineId, deptLabel, tasks, lineDef, year, month, day, formattedDateKo, lineTotalPlan } = opts;
    const docNumber = `GFS-WO-${year}${month}${day}-${lineId.replace(/\s+/g, '')}`;
    const totalRunTimeStr =
      tasks.length > 0
        ? `${tasks[0].time.split('~')[0].trim()} ~ ${
            tasks[tasks.length - 1].time.split('~')[1]?.trim() || '종료'
          }`
        : lineDef.totalTime;

    let whiteRiceQty = 0;
    let blackRiceQty = 0;
    let redRiceQty = 0;
    let prodTaskCount = 0;
    let totalOrderQtyNum = 0;

    tasks.forEach((t) => {
      const q = typeof t.qty === 'number' ? t.qty : 0;
      if (t.type === '생산' && q > 0) {
        prodTaskCount += 1;
        totalOrderQtyNum += q;
        const rBadge = getRiceColorBadge(t.item, t.bom);
        if (rBadge?.label === '빨간밥') {
          redRiceQty += q;
        } else if (rBadge?.label?.includes('흑미')) {
          blackRiceQty += q;
        } else {
          whiteRiceQty += q;
        }
      }
    });

    const firstProdTask = tasks.find((t) => {
      const isClean = t.type === '청소' || t.item.includes('세척') || t.item.includes('CIP') || t.item.includes('소독');
      const isMeal = t.type === '휴게' || t.item.includes('중식') || t.item.includes('석식') || t.item.includes('점심');
      return !isClean && !isMeal;
    });
    const initialSec: 'NONE' | 'S2' | 'S1' = firstProdTask
      ? firstProdTask.shift.includes('1편')
        ? 'S1'
        : 'S2'
      : 'NONE';
    const topSectionTitle =
      initialSec === 'S2'
        ? '▶ 1부: 2편 생산 (당일 오후 출하 — 백미 ➔ 흑미 ➔ 빨간양념 순서 엄수)'
        : initialSec === 'S1'
        ? '▶ 2부: 1편 생산 (익일 새벽 출하 — 품목 교체 시 알코올 소독 필수)'
        : '';

    let lastSection: 'NONE' | 'S2' | 'S1' = initialSec;
    let prodSeq = 0;

    const rowsHtml = tasks
      .map((t, idx) => {
        const isClean = t.type === '청소' || t.item.includes('세척') || t.item.includes('CIP') || t.item.includes('소독');
        const isMeal = t.type === '휴게' || t.item.includes('중식') || t.item.includes('석식') || t.item.includes('점심');

        let sectionBannerHtml = '';
        if (!isClean && !isMeal) {
          const curSec: 'S2' | 'S1' = t.shift.includes('1편') ? 'S1' : 'S2';
          if (curSec !== lastSection) {
            lastSection = curSec;
            const secTitle =
              curSec === 'S2'
                ? '▶ 1부: 2편 생산 (당일 오후 출하 — 백미 ➔ 흑미 ➔ 빨간양념 순서 엄수)'
                : '▶ 2부: 1편 생산 (익일 새벽 출하 — 품목 교체 시 알코올 소독 필수)';
            sectionBannerHtml = `
              <tr class="section-banner-row">
                <td colspan="6" class="section-banner-cell ${curSec === 'S1' ? 'section-s1' : 'section-s2'}">${escapeHtml(secTitle)}</td>
              </tr>
            `;
          }
        }

        if (isClean || isMeal) {
          const breakLabel = isMeal
            ? `🍱 ${t.item || '중식 및 라인 세척·소독'} (${t.duration || '60분'})`
            : `🧹 ${t.item || '작업장 세척·소독 및 금속검출기 점검'} (${t.duration || '30분'})`;
          return `
            ${sectionBannerHtml}
            <tr class="row-break">
              <td class="col-center col-seq">-</td>
              <td class="col-center col-time">${escapeHtml(t.time)}</td>
              <td class="col-center"><span class="rice-box rice-box-break">[휴게/세척]</span></td>
              <td colspan="2" class="col-break-title">${escapeHtml(breakLabel)}</td>
              <td class="col-center col-check-cell">□ 세척·소독 확인</td>
            </tr>
          `;
        }

        prodSeq += 1;
        const formattedQty = typeof t.qty === 'number' ? `${t.qty.toLocaleString()} 개` : t.qty || '-';
        const rBadge = getRiceColorBadge(t.item, t.bom);
        const riceLabel =
          rBadge?.label === '빨간밥'
            ? '볶음/양념'
            : rBadge?.label?.includes('흑미')
            ? '흑미/잡곡'
            : rBadge?.label
            ? '백미'
            : t.type || '생산';
        const riceBoxClass =
          rBadge?.label === '빨간밥'
            ? 'rice-box-red'
            : rBadge?.label?.includes('흑미')
            ? 'rice-box-purple'
            : 'rice-box-white';

        return `
          ${sectionBannerHtml}
          <tr class="${idx % 2 === 1 ? 'row-alt' : ''}">
            <td class="col-center col-seq">${prodSeq}</td>
            <td class="col-center col-time">${escapeHtml(t.time)}</td>
            <td class="col-center">
              <span class="rice-box ${riceBoxClass}">[${escapeHtml(riceLabel)}]</span>
            </td>
            <td class="col-item">
              <div class="item-main-name">${escapeHtml(t.item)}</div>
              ${
                t.bom && t.bom !== '-'
                  ? `<div class="item-sub-note">배합/규격: ${escapeHtml(t.bom)} | 소요: ${escapeHtml(t.duration)} (${escapeHtml(t.workers || lineDef.personnel.split('(')[0])})</div>`
                  : `<div class="item-sub-note">소요시간: ${escapeHtml(t.duration)} | 투입인원: ${escapeHtml(t.workers || lineDef.personnel.split('(')[0])}</div>`
              }
            </td>
            <td class="col-right col-qty">${escapeHtml(formattedQty)}</td>
            <td class="col-center col-check-cell">
              <span class="pen-check-box">□</span> 완료 (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
            </td>
          </tr>
        `;
      })
      .join('');

    return `
      <section class="wo-page">
        <div class="top-header-box">
          <div class="top-header-row1">
            <div>
              <div class="doc-kicker">GFS 스마트 생산관제 · ${escapeHtml(deptLabel)} · 식약처 HACCP 현장 게시용 정본 (${escapeHtml(docNumber)})</div>
              <div class="doc-big-title">[${escapeHtml(lineId)}] 일일 작업지시서</div>
            </div>
            <div class="sign-box">
              담당 반장 서명: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인)
            </div>
          </div>
          <div class="top-header-meta-grid">
            <div class="meta-pill">📅 작업일자: <strong>${escapeHtml(formattedDateKo)}</strong></div>
            <div class="meta-pill">⏰ 가동시간: <strong>${escapeHtml(totalRunTimeStr)}</strong></div>
            <div class="meta-pill">📦 총 지시량: <strong>${prodTaskCount}품목 / ${
              totalOrderQtyNum > 0
                ? `${totalOrderQtyNum.toLocaleString()} 개`
                : escapeHtml(lineTotalPlan || lineDef.totalPlan)
            }</strong></div>
          </div>
        </div>

        <table class="work-table">
          <thead>
            ${
              topSectionTitle
                ? `<tr class="section-banner-row">
                    <td colspan="6" class="section-banner-cell ${initialSec === 'S1' ? 'section-s1' : 'section-s2'}">${escapeHtml(topSectionTitle)}</td>
                  </tr>`
                : ''
            }
            <tr>
              <th style="width:34px;">순서</th>
              <th style="width:92px;">작업시간</th>
              <th style="width:70px;">밥/공정</th>
              <th>지시 제품명 (배합·소요시간)</th>
              <th style="width:98px;">지시수량</th>
              <th style="width:94px;">현장 체크 (V)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="bottom-summary-grid">
          <div class="summary-box">
            <div class="summary-box-title">⚠️ 필수 위생 · CCP 현장 볼펜 체크</div>
            <ul class="ccp-check-list">
              <li>□ 작업 시작 전 및 품목 교체 시 컨베이어·성형틀 70% 알코올 소독 완료</li>
              <li>□ 금속검출기 테스트피스(Fe 2.0mm / SUS 3.0mm) 30분 주기 정상 통과</li>
              <li>□ 백미 ➔ 흑미 ➔ 빨간양념밥 작업 순서 준수 및 알레르기 교차오염 차단</li>
            </ul>
          </div>
          <div class="summary-box">
            <div class="summary-box-title">🍚 오늘 밥 구분별 생산 요약</div>
            <div class="rice-sum-grid">
              <div class="rice-sum-item">
                <span>[백미 제품]</span>
                <span>${whiteRiceQty.toLocaleString()} 개</span>
              </div>
              <div class="rice-sum-item">
                <span>[흑미/잡곡]</span>
                <span>${blackRiceQty.toLocaleString()} 개</span>
              </div>
              <div class="rice-sum-item">
                <span>[볶음/양념]</span>
                <span>${redRiceQty.toLocaleString()} 개</span>
              </div>
              <div class="rice-sum-item" style="background:#e2e8f0;">
                <span>총 생산합계</span>
                <span>${totalOrderQtyNum.toLocaleString()} 개</span>
              </div>
            </div>
          </div>
        </div>

        <div class="footer-line">
          <span>* 현장 반장님께서는 각 품목 완료 시 우측 [현장 체크(V)] 칸에 볼펜으로 체크(V) 및 완료 시각을 기입해 주십시오.</span>
          <span>GFS ERP 현장 맞춤 큰글씨 양식 | 인쇄일: ${new Date().toLocaleDateString('ko-KR')}</span>
        </div>
      </section>
    `;
  };

  const handlePrintAllLinesPdf = async () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('팝업이 차단되어 일괄 PDF 인쇄 창을 열 수 없습니다. 브라우저 팝업 차단을 해제해 주세요.');
      return;
    }

    const safeWorkDate = workDate || kstToday();
    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>전부서 일괄 작업지시서 생성 중...</title></head>
      <body style="font-family:'Malgun Gothic',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#1e293b;">
        <div style="text-align:center;">
          <div style="font-size:19px;font-weight:900;margin-bottom:8px;">🖨️ 성형장 · 전처리실 전체 작업지시서(라인 PDF 양식) 생성 중...</div>
          <div style="font-size:13px;color:#64748b;">${escapeHtml(safeWorkDate)} 기준 모든 가동 라인·설비 데이터를 수집하고 있습니다. 잠시만 기다려 주세요.</div>
        </div>
      </body></html>
    `);
    printWindow.document.close();

    try {
      const targets = [
        ...SEONGHYEONG_LINES.slice(1).map((x) => ({ id: x.id, deptLabel: '성형장' })),
        ...JEONCHEORI_EQUIPMENT.slice(1).map((x) => ({ id: x.id, deptLabel: '전처리실' })),
      ];

      const results: Array<{
        id: string;
        deptLabel: string;
        tasks: ScheduleTask[];
        lineTotalPlan?: string;
      }> = [];

      for (let i = 0; i < targets.length; i += 6) {
        const batch = targets.slice(i, i + 6);
        const batchRes = await Promise.all(
          batch.map(async (t) => {
            try {
              const res = await fetch(
                `/api/production/work-order?workDate=${encodeURIComponent(safeWorkDate)}&shift=${encodeURIComponent(shift)}&line=${encodeURIComponent(t.id)}`
              );
              const json = await res.json();
              const hasAnyOrder = (json.totalOrdersCount || 0) > 0;
              const rawTasks: ScheduleTask[] =
                json.success && Array.isArray(json.data) && json.data.length > 0
                  ? json.data
                  : !hasAnyOrder
                  ? getLineDef(t.id).schedule
                  : [];
              return {
                id: t.id,
                deptLabel: t.deptLabel,
                tasks: rawTasks,
                lineTotalPlan: json.lineTotalPlan as string | undefined,
              };
            } catch {
              return { id: t.id, deptLabel: t.deptLabel, tasks: [] as ScheduleTask[] };
            }
          })
        );
        results.push(...batchRes);
      }

      const activePages = results.filter((r) => r.tasks.length > 0);
      if (activePages.length === 0) {
        printWindow.document.open();
        printWindow.document.write(
          `<div style="font-family:sans-serif;padding:40px;text-align:center;"><h3>${escapeHtml(safeWorkDate)} 일자에 출력할 가동 라인·설비 작업지시서가 없습니다.</h3></div>`
        );
        printWindow.document.close();
        return;
      }

      const dateParts = safeWorkDate.split('-');
      const year = dateParts[0] || safeWorkDate.slice(0, 4);
      const month = dateParts[1] || safeWorkDate.slice(5, 7);
      const day = dateParts[2] || safeWorkDate.slice(8, 10);
      const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      const dayOfWeek = isNaN(dateObj.getTime()) ? '목' : dayNames[dateObj.getDay()];
      const formattedDateKo = `${year}년 ${Number(month)}월 ${Number(day)}일 (${dayOfWeek}요일)`;

      const pagesHtml = activePages
        .map((p) =>
          buildLiveWorkOrderPageSection({
            lineId: p.id,
            deptLabel: p.deptLabel,
            tasks: p.tasks,
            lineDef: getLineDef(p.id),
            year,
            month,
            day,
            formattedDateKo,
            lineTotalPlan: p.lineTotalPlan,
          })
        )
        .join('');

      const html = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="UTF-8" />
          <title>[GFS 전부서 일괄 작업지시서] (${escapeHtml(safeWorkDate)})</title>
          <style>
            @page { size: A4 portrait; margin: 7mm 7mm; }
            * {
              box-sizing: border-box;
              font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body { margin: 0; padding: 10px; color: #000000; background: #ffffff; }
            .wo-page { break-after: page; page-break-after: always; }
            .wo-page:last-of-type { break-after: auto; page-break-after: auto; }
            .no-print-bar {
              display: flex; justify-content: space-between; align-items: center;
              background: #0f172a; color: #ffffff; padding: 10px 16px; border-radius: 8px;
              margin-bottom: 12px; font-size: 13px; font-weight: 700;
            }
            .no-print-btn { padding: 7px 15px; border: none; border-radius: 6px; font-weight: 900; font-size: 13px; cursor: pointer; }
            .top-header-box {
              border: 2px solid #000000; padding: 8px 11px; margin-bottom: 8px; background: #ffffff;
              break-inside: avoid; page-break-inside: avoid;
            }
            .top-header-row1 {
              display: flex; justify-content: space-between; align-items: center; gap: 8px;
              border-bottom: 1.5px solid #000000; padding-bottom: 6px; margin-bottom: 6px;
            }
            .doc-kicker { font-size: 10px; font-weight: 900; color: #334155; letter-spacing: 0.2px; margin-bottom: 2px; }
            .doc-big-title { font-size: 21px; font-weight: 900; color: #000000; letter-spacing: -0.6px; line-height: 1.15; }
            .sign-box { border: 1.5px solid #000000; padding: 6px 10px; font-size: 13px; font-weight: 900; background: #f8fafc; white-space: nowrap; text-align: right; }
            .top-header-meta-grid { display: grid; grid-template-columns: 1.25fr 1fr 1.15fr; gap: 6px; font-size: 12px; font-weight: 900; }
            .meta-pill { background: #f1f5f9; border: 1px solid #334155; padding: 4px 8px; border-radius: 4px; }
            .meta-pill strong { font-size: 12.5px; color: #000000; }
            .work-table { width: 100%; border-collapse: collapse; border: 2px solid #000000; margin-bottom: 10px; table-layout: fixed; }
            .work-table thead { display: table-header-group; }
            .work-table th {
              background: #e2e8f0; color: #000000; font-weight: 900; font-size: 12px;
              text-align: center; padding: 7px 4px; border: 1.5px solid #000000;
            }
            .work-table td { border: 1.5px solid #000000; padding: 6px 5px; vertical-align: middle; }
            .work-table tr { break-inside: avoid; page-break-inside: avoid; }
            .work-table tr.row-alt { background: #f8fafc; }
            .section-banner-row td.section-banner-cell {
              background: #1d4ed8 !important; color: #ffffff !important; font-size: 12.5px; font-weight: 900;
              padding: 6px 10px; letter-spacing: -0.2px; border: 1.5px solid #000000; text-align: left;
            }
            .section-banner-row td.section-banner-cell.section-s1 { background: #6d28d9 !important; }
            .row-break { background: #e2e8f0 !important; font-weight: 900; }
            .col-break-title { font-size: 12.5px; font-weight: 900; color: #0f172a; text-align: center; }
            .col-center { text-align: center; }
            .col-right { text-align: right; }
            .col-seq { font-family: monospace; font-size: 14px; font-weight: 900; width: 34px; }
            .col-time { font-family: monospace; font-size: 12px; font-weight: 900; width: 92px; white-space: nowrap; }
            .rice-box {
              display: inline-block; font-size: 11px; font-weight: 900; padding: 2px 4px;
              border-radius: 3px; border: 1.5px solid #000000; white-space: nowrap;
            }
            .rice-box-white { background: #ffffff; color: #000000; }
            .rice-box-purple { background: #f3e8ff; color: #3b0764; border-style: double; }
            .rice-box-red { background: #ffe4e6; color: #881337; border-width: 2px; }
            .rice-box-break { background: #cbd5e1; color: #0f172a; }
            .col-item { text-align: left; word-break: keep-all; overflow-wrap: anywhere; }
            .item-main-name { font-size: 13.5px; font-weight: 900; color: #000000; line-height: 1.25; word-break: keep-all; }
            .item-sub-note { font-size: 10px; font-weight: 700; color: #334155; margin-top: 2px; line-height: 1.25; }
            .col-qty { font-family: monospace; font-size: 17.5px; font-weight: 900; color: #000000; width: 98px; white-space: nowrap; letter-spacing: -0.3px; }
            .col-check-cell { width: 94px; font-size: 11px; font-weight: 900; color: #000000; white-space: nowrap; }
            .pen-check-box { font-size: 14px; font-weight: 900; vertical-align: middle; }
            .bottom-summary-grid {
              display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 8px; margin-bottom: 6px;
              break-inside: avoid; page-break-inside: avoid;
            }
            .summary-box { border: 2px solid #000000; padding: 8px 10px; background: #ffffff; break-inside: avoid; page-break-inside: avoid; }
            .summary-box-title {
              font-size: 12.5px; font-weight: 900; color: #000000;
              border-bottom: 1.5px solid #000000; padding-bottom: 4px; margin-bottom: 5px;
            }
            .ccp-check-list { margin: 0; padding-left: 0; list-style: none; font-size: 11px; font-weight: 800; line-height: 1.55; }
            .rice-sum-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 11.5px; font-weight: 900; }
            .rice-sum-item { border: 1px solid #334155; padding: 4px 6px; display: flex; justify-content: space-between; background: #f8fafc; }
            .footer-line {
              display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: #334155;
              border-top: 1px solid #94a3b8; padding-top: 4px; break-inside: avoid; page-break-inside: avoid;
            }
            @media print {
              .no-print-bar { display: none !important; }
              body { padding: 0; }
              tr { break-inside: avoid !important; page-break-inside: avoid !important; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-bar">
            <div>🖨️ 성형장 · 전처리실 전체 일괄 작업지시서 (${escapeHtml(safeWorkDate)} · 총 ${activePages.length}개 라인/설비)</div>
            <div style="display:flex;gap:8px;">
              <button class="no-print-btn" style="background:#2563eb;color:#fff;" onclick="window.print()">전체 인쇄 / PDF 저장</button>
              <button class="no-print-btn" style="background:#475569;color:#fff;" onclick="window.close()">닫기</button>
            </div>
          </div>
          ${pagesHtml}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 450);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err: any) {
      printWindow.document.open();
      printWindow.document.write(
        `<div style="font-family:sans-serif;padding:40px;color:#b91c1c;"><h3>일괄 PDF 생성 실패</h3><p>${escapeHtml(err?.message || '오류가 발생했습니다.')}</p></div>`
      );
      printWindow.document.close();
    }
  };

  // 전체 통합 마스터 종합본 PDF 인쇄 (작업지시서 & 취반 타임테이블과 100% 동일한 라인·작업장별 집계)
  const handleOpenMasterPdf = async () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('팝업이 차단되어 종합본 인쇄 창을 열 수 없습니다. 브라우저 팝업 차단을 해제해 주세요.');
      return;
    }

    const safeWorkDate = workDate || kstToday();
    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>종합본 생성 중...</title></head>
      <body style="font-family:'Malgun Gothic',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#1e293b;">
        <div style="text-align:center;">
          <div style="font-size:18px;font-weight:900;margin-bottom:8px;">📋 전라인 · 전작업장 통합 작업지시서 종합본 생성 중...</div>
          <div style="font-size:13px;color:#64748b;">${escapeHtml(safeWorkDate)} 실수주 및 BOM 데이터를 타임테이블 기준으로 집계하고 있습니다.</div>
        </div>
      </body></html>
    `);
    printWindow.document.close();

    try {
      const res = await fetch(
        `/api/production/rice-work-order?date=${encodeURIComponent(safeWorkDate)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!json?.success || !json?.data) {
        throw new Error(json?.error || '작업지시서 데이터 조회 실패');
      }

      const targetResult =
        json.data.hasConfirmedOrders && json.data.post10?.tab1Master?.length > 0
          ? json.data.post10
          : json.data.pre10;

      if (!targetResult || !Array.isArray(targetResult.tab1Master) || targetResult.tab1Master.length === 0) {
        printWindow.document.open();
        printWindow.document.write(`
          <!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>종합본 안내</title></head>
          <body style="font-family:'Malgun Gothic',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#1e293b;">
            <div style="text-align:center;max-width:440px;padding:24px;background:#fff;border:1px solid #cbd5e1;border-radius:12px;">
              <div style="font-size:16px;font-weight:900;margin-bottom:8px;">⚠️ 조회된 수주 데이터가 없습니다</div>
              <div style="font-size:13px;color:#64748b;margin-bottom:16px;">${escapeHtml(safeWorkDate)} 기준 등록된 수주 내역이 없습니다.</div>
              <button onclick="window.close()" style="padding:8px 18px;border:none;border-radius:8px;background:#1e293b;color:#fff;font-weight:800;cursor:pointer;">창 닫기</button>
            </div>
          </body></html>
        `);
        printWindow.document.close();
        return;
      }

      const cfg = loadProductionConfig();
      const resultWithWorkers = applyWorkersOverride(
        targetResult,
        cfg.lineWorkers,
        cfg.roomWorkers
      );
      const masterHtml = buildMasterWorkOrderPrintHtml(resultWithWorkers, { scope: 'ALL' });
      printWindow.document.open();
      printWindow.document.write(masterHtml);
      printWindow.document.close();
    } catch (err: any) {
      printWindow.document.open();
      printWindow.document.write(`
        <!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>종합본 오류</title></head>
        <body style="font-family:'Malgun Gothic',sans-serif;padding:40px;text-align:center;">
          <h3>종합본 생성 중 오류가 발생했습니다</h3>
          <p>${escapeHtml(err?.message || '알 수 없는 오류')}</p>
        </body></html>
      `);
      printWindow.document.close();
    }
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

  // ── 글자 크기 유틸 ──
  const getFontClass = (type: 'th' | 'td' | 'input' | 'badge' | 'sub', isModal: boolean) => {
    if (!isModal) {
      if (type === 'th') return 'py-2.5 px-2 text-[13.5px]';
      if (type === 'td') return 'py-2 px-2 text-[13.5px]';
      if (type === 'input') return 'text-[13.5px]';
      if (type === 'badge') return 'text-[12.5px] px-2 py-0.5';
      return 'text-[12.5px]';
    }
    if (modalFontSize === 'xlarge') {
      if (type === 'th') return 'py-4 px-3 text-base sm:text-lg';
      if (type === 'td') return 'py-3.5 px-2.5 text-base sm:text-lg';
      if (type === 'input') return 'text-base sm:text-lg';
      if (type === 'badge') return 'text-sm sm:text-base px-3 py-1';
      return 'text-sm sm:text-base';
    }
    if (modalFontSize === 'large') {
      if (type === 'th') return 'py-3.5 px-2.5 text-sm sm:text-base';
      if (type === 'td') return 'py-3 px-2 text-sm sm:text-base';
      if (type === 'input') return 'text-sm sm:text-base';
      if (type === 'badge') return 'text-xs sm:text-sm px-2.5 py-0.5';
      return 'text-xs sm:text-sm';
    }
    // normal
    if (type === 'th') return 'py-2.5 px-2 text-xs sm:text-sm';
    if (type === 'td') return 'py-2.5 px-2 text-xs sm:text-sm';
    if (type === 'input') return 'text-xs sm:text-sm';
    if (type === 'badge') return 'text-xs sm:text-sm px-2 py-0.5';
    return 'text-xs';
  };

  // 현장 전광판 원클릭 작업 완료 처리 (완료 후 다음 대기 작업을 자동으로 '진행중'으로 승격)
  const completeFieldTask = (id: string) => {
    setScheduleTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const cur = prev[idx];
      if (cur.status === '완료') {
        // 다시 누르면 진행중으로 복구
        return prev.map((t, i) => (i === idx ? { ...t, status: '진행중' } : t));
      }
      const nextList = prev.map((t, i) => (i === idx ? { ...t, status: '완료' as const } : { ...t }));
      const hasAnyInProgress = nextList.some((t) => t.status === '진행중');
      if (!hasAnyInProgress) {
        const nextPendingIdx = nextList.findIndex(
          (t, i) => i > idx && t.status === '대기' && t.type !== '휴게' && t.type !== '청소'
        );
        const fallbackIdx =
          nextPendingIdx !== -1
            ? nextPendingIdx
            : nextList.findIndex((t) => t.status === '대기');
        if (fallbackIdx !== -1) {
          nextList[fallbackIdx] = { ...nextList[fallbackIdx], status: '진행중' };
        }
      }
      return nextList;
    });
  };

  // ── 일일 작업지시서 렌더러 (📋 현장 큰글씨 키오스크 모드 vs 📊 관리자 12열 상세 표 모드) ──
  const renderTimetableContent = (isModal: boolean = false) => {
    // 현재 진행중 작업 & 다음 대기 작업 추출
    const activeHeroIdx = (() => {
      const progIdx = filteredSchedule.findIndex((t) => t.status === '진행중');
      if (progIdx !== -1) return progIdx;
      const pendProdIdx = filteredSchedule.findIndex(
        (t) => t.status !== '완료' && t.type !== '휴게' && t.type !== '청소'
      );
      if (pendProdIdx !== -1) return pendProdIdx;
      return filteredSchedule.findIndex((t) => t.status !== '완료');
    })();

    const activeHeroTask = activeHeroIdx !== -1 ? filteredSchedule[activeHeroIdx] : null;
    const nextHeroTask =
      activeHeroIdx !== -1
        ? filteredSchedule
            .slice(activeHeroIdx + 1)
            .find((t) => t.status !== '완료' && t.type !== '휴게') ||
          filteredSchedule[activeHeroIdx + 1] ||
          null
        : null;

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* 상단 뷰 전환 & 스마트 편집 액션 바 */}
        <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 flex items-center justify-between gap-2.5 flex-wrap shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* 표 보기 vs 큰글씨(현장) 토글 */}
            <div className="inline-flex items-center bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
              <button
                type="button"
                onClick={() => setIsSimpleFieldView(false)}
                className={`px-3 py-1.5 rounded-md font-bold text-[13px] flex items-center gap-1 transition-all cursor-pointer ${
                  !isSimpleFieldView
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📊 표 보기</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSimpleFieldView(true)}
                className={`px-3 py-1.5 rounded-md font-bold text-[13px] flex items-center gap-1 transition-all cursor-pointer ${
                  isSimpleFieldView
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📋 현장 카드</span>
              </button>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-[13px] text-slate-600 bg-white px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={autoCascadeOnReorder}
                onChange={(e) => setAutoCascadeOnReorder(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded cursor-pointer"
              />
              <span>순서이동 연쇄</span>
            </label>

            {!isSimpleFieldView && (
              <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-[13px] text-slate-600 bg-white px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={autoCascadeTime}
                  onChange={(e) => setAutoCascadeTime(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
                <span>시간수정 연쇄</span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleNudgeAll(-10)}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-bold text-[13px] transition-colors cursor-pointer"
              title="전체 스케줄 시간을 10분 앞당깁니다"
            >
              -10분
            </button>
            <button
              type="button"
              onClick={() => handleNudgeAll(10)}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-bold text-[13px] transition-colors cursor-pointer"
              title="전체 스케줄 시간을 10분 늦춥니다"
            >
              +10분
            </button>
            <button
              type="button"
              onClick={() => handleRecalculateAll()}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-md font-bold text-[13px] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="시작 시각부터 모든 작업을 5분 갭으로 순차 자동 정렬합니다"
            >
              <Clock size={14} />
              <span>시간 자동정렬</span>
            </button>
            <button
              type="button"
              onClick={handlePrintLiveWorkOrder}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-bold text-[13px] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="현장 게시용 A4 큰글씨·고대비 작업지시서를 즉시 인쇄합니다"
            >
              <Printer size={14} />
              <span>A4 인쇄</span>
            </button>
            <button
              type="button"
              onClick={handleSaveOrders}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-bold text-[13px] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save size={14} />
              <span>{saving ? '저장중...' : '저장'}</span>
            </button>
            {!isModal && (
              <button
                type="button"
                onClick={() => openLargeModal('TIMETABLE')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-bold text-[13px] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="작업지시서를 큰 팝업창으로 확대하여 편하게 봅니다"
              >
                <Maximize2 size={14} />
                <span>확대</span>
              </button>
            )}
          </div>
        </div>

        {/* 🌟 모드 1: 현장 카드형 뷰 (진행중/다음작업 요약 + 깔끔한 카드 리스트) 🌟 */}
        {isSimpleFieldView ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 bg-slate-100/70 space-y-2.5">
            {/* 상단 요약 배너 (진행중 + 다음 작업) */}
            {activeHeroTask ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch">
                {/* 좌측 7col: 지금 진행 중 */}
                <div className="lg:col-span-7 bg-white border-2 border-emerald-500 rounded-xl p-3 shadow-xs flex flex-col justify-between gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-xs">
                        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                        <span>진행 중 ({activeHeroIdx + 1}번)</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono font-bold text-xs">
                        {activeHeroTask.time}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                      {activeHeroTask.shift} · {activeHeroTask.duration} · 투입 {activeHeroTask.workers || currentLine.personnel.split('(')[0]}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const rBadge = getRiceColorBadge(activeHeroTask.item, activeHeroTask.bom);
                          if (!rBadge) return null;
                          return (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${rBadge.bg}`}
                            >
                              {rBadge.label === '빨간밥'
                                ? '🌶️ 빨간양념밥'
                                : rBadge.label.includes('흑미')
                                ? '🌾 흑미/잡곡'
                                : '🍚 백미'}
                            </span>
                          );
                        })()}
                        <span className="text-base sm:text-lg font-black text-slate-900 truncate">
                          {activeHeroTask.item}
                        </span>
                      </div>
                      {activeHeroTask.bom && activeHeroTask.bom !== '-' && (
                        <div className="text-xs font-medium text-slate-500 truncate">
                          배합: <span className="text-slate-700">{activeHeroTask.bom}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-emerald-700">지시수량</div>
                        <div className="text-base sm:text-lg font-mono font-black text-emerald-950">
                          {typeof activeHeroTask.qty === 'number'
                            ? `${activeHeroTask.qty.toLocaleString()}개`
                            : activeHeroTask.qty || '-'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => completeFieldTask(activeHeroTask.id)}
                        className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-xs flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap"
                      >
                        <CheckCircle2 size={15} />
                        <span>작업 완료</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 우측 5col: 다음 작업 준비 */}
                <div className="lg:col-span-5 bg-amber-50/80 border border-amber-300 rounded-xl p-3 shadow-2xs flex flex-col justify-between gap-1.5">
                  <div className="flex items-center justify-between gap-2 border-b border-amber-200/70 pb-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-[11px]">
                      ⏭️ 다음 작업
                    </span>
                    {nextHeroTask && (
                      <span className="font-mono font-bold text-xs text-amber-950 bg-white px-2 py-0.5 rounded border border-amber-200">
                        예정 {nextHeroTask.time}
                      </span>
                    )}
                  </div>

                  {nextHeroTask ? (
                    <div className="space-y-1 my-auto">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm sm:text-base font-black text-slate-900 truncate">
                          {nextHeroTask.item}
                        </div>
                        <span className="text-sm font-mono font-black text-indigo-950 shrink-0">
                          {typeof nextHeroTask.qty === 'number'
                            ? `${nextHeroTask.qty.toLocaleString()}개`
                            : nextHeroTask.qty}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-amber-900 font-semibold">
                        <span>{nextHeroTask.shift} · {nextHeroTask.duration}</span>
                        <span className="text-rose-700 font-bold">교체 전 알코올 소독</span>
                      </div>
                    </div>
                  ) : (
                    <div className="my-auto text-center py-2 text-slate-500 font-bold text-xs">
                      예정된 다음 대기 작업이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            ) : filteredSchedule.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-2.5">
                <div className="text-sm font-bold text-slate-600">
                  [{selectedLine}] 라인에 해당 날짜의 배정된 수주 작업이 없습니다.
                </div>
                {currentLine.schedule.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleTasks(currentLine.schedule.map((s) => ({ ...s })));
                      setMaterials(currentLine.materials.map((m) => ({ ...m })));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    표준 템플릿 불러오기 ({currentLine.schedule.length}건)
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-emerald-600 text-white rounded-xl p-3 text-center font-bold text-sm shadow-xs">
                오늘 [{selectedLine}] 라인의 모든 작업이 완료되었습니다.
              </div>
            )}

            {/* 하단 시간순 작업 카드 리스트 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <span>시간순 작업 목록 ({filteredSchedule.length}건)</span>
                  <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    위/아래 이동 시 작업시간 자동 재계산
                  </span>
                </div>
              </div>

              {filteredSchedule.map((task, idx) => {
                const isDone = task.status === '완료';
                const isHeroActive = idx === activeHeroIdx && !isDone;
                const isClean =
                  task.type === '청소' ||
                  task.item.includes('세척') ||
                  task.item.includes('소독') ||
                  task.item.includes('CIP');
                const isMeal =
                  task.type === '휴게' ||
                  task.item.includes('중식') ||
                  task.item.includes('석식') ||
                  task.item.includes('점심');

                // 중식 / 세척·소독 구분 바
                if (isClean || isMeal) {
                  return (
                    <div
                      key={task.id}
                      className="bg-slate-200/80 border border-slate-300 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-white font-bold text-xs">
                          {isMeal ? '🍱 휴게' : '🧹 세척'}
                        </span>
                        <span className="font-mono font-bold text-xs sm:text-sm text-slate-900">
                          {task.time} ({task.duration})
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-slate-800">
                          {task.item}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => moveTask(idx, 'UP')}
                          disabled={idx === 0}
                          className="h-7 px-2 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center gap-1 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTask(idx, 'DOWN')}
                          disabled={idx === filteredSchedule.length - 1}
                          className="h-7 px-2 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center gap-1 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => completeFieldTask(task.id)}
                          className={`h-7 px-2.5 rounded-md font-bold text-xs flex items-center gap-1 cursor-pointer ${
                            isDone
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white hover:bg-emerald-50 text-slate-700 border border-slate-300'
                          }`}
                        >
                          <CheckCircle2 size={13} />
                          <span>{isDone ? '완료' : '확인'}</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                const rBadge = getRiceColorBadge(task.item, task.bom);
                const formattedQty =
                  typeof task.qty === 'number' ? `${task.qty.toLocaleString()}개` : task.qty || '-';

                return (
                  <div
                    key={task.id}
                    className={`rounded-xl px-3 py-2 border transition-all flex flex-wrap lg:flex-nowrap items-center justify-between gap-2.5 ${
                      isDone
                        ? 'bg-slate-100/80 border-slate-200 opacity-65'
                        : isHeroActive
                        ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-200 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    {/* 좌측: 순번 배지 + 작업시간 + 시프트 + 밥종류 + 제품명 */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`px-2 py-1 rounded-lg font-bold text-xs shrink-0 text-center min-w-[66px] ${
                          isDone
                            ? 'bg-slate-300 text-slate-700'
                            : isHeroActive
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-white'
                        }`}
                      >
                        {idx + 1} · {isDone ? '완료' : isHeroActive ? '진행' : '대기'}
                      </div>

                      <div className="font-mono font-bold text-xs sm:text-sm text-slate-800 shrink-0 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                        {task.time}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                              task.shift.includes('2편')
                                ? 'bg-blue-100 text-blue-900 border-blue-200'
                                : 'bg-pink-100 text-pink-900 border-pink-200'
                            }`}
                          >
                            {task.shift}
                          </span>
                          {rBadge && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${rBadge.bg}`}
                            >
                              {rBadge.label === '빨간밥'
                                ? '🌶️ 빨간양념'
                                : rBadge.label.includes('흑미')
                                ? '🌾 흑미'
                                : '🍚 백미'}
                            </span>
                          )}
                          <span
                            className={`text-sm font-bold tracking-tight truncate ${
                              isDone ? 'line-through text-slate-500' : 'text-slate-900'
                            }`}
                          >
                            {task.item}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 shrink-0">
                            ({task.duration} · {task.workers || currentLine.personnel.split('(')[0]})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 우측: 수량 + 이동 + 완료 버튼 */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <div className="text-right pr-1.5">
                        <span className="text-sm sm:text-base font-mono font-black text-indigo-950">
                          {formattedQty}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => moveTask(idx, 'UP')}
                        disabled={idx === 0}
                        title="순서 위로"
                        className="h-7 px-2 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-900 border border-slate-300 font-bold text-xs flex items-center disabled:opacity-25 cursor-pointer transition-colors"
                      >
                        <ArrowUp size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => moveTask(idx, 'DOWN')}
                        disabled={idx === filteredSchedule.length - 1}
                        title="순서 아래로"
                        className="h-7 px-2 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-900 border border-slate-300 font-bold text-xs flex items-center disabled:opacity-25 cursor-pointer transition-colors"
                      >
                        <ArrowDown size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => completeFieldTask(task.id)}
                        className={`h-7 px-2.5 rounded-md font-bold text-xs flex items-center gap-1 cursor-pointer transition-all ${
                          isDone
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : isHeroActive
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-slate-800 text-white hover:bg-slate-900'
                        }`}
                      >
                        <CheckCircle2 size={13} />
                        <span>{isDone ? '완료' : '완료체크'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
        /* 🌟 모드 2: 관리자용 12열 상세 편집 테이블 🌟 */
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className={`bg-slate-100 text-slate-800 font-black sticky top-0 z-10 border-b-2 border-slate-300 text-center ${getFontClass('th', isModal)}`}>
              <tr>
                <th className={`w-24 text-center font-black ${getFontClass('th', isModal)}`}>순서</th>
                <th className={`w-28 text-center font-black ${getFontClass('th', isModal)}`}>구분</th>
                <th className={`w-44 text-center font-black ${getFontClass('th', isModal)}`}>작업시간</th>
                <th className={`w-24 text-center font-black ${getFontClass('th', isModal)}`}>유형</th>
                <th className={`min-w-[220px] text-left font-black ${getFontClass('th', isModal)}`}>지시 제품명</th>
                <th className={`w-36 text-right font-black ${getFontClass('th', isModal)}`}>지시수량</th>
                <th className={`w-24 text-center font-black ${getFontClass('th', isModal)}`}>소요시간</th>
                <th className={`w-20 text-center font-black ${getFontClass('th', isModal)}`}>인원</th>
                <th className={`min-w-[200px] text-left font-black ${getFontClass('th', isModal)}`}>주요 원부자재 배합 기준 (BOM)</th>
                <th className={`min-w-[200px] text-left font-black ${getFontClass('th', isModal)}`}>HACCP & CCP 핵심 관리기준</th>
                <th className={`w-28 text-center font-black ${getFontClass('th', isModal)}`}>진행상태</th>
                <th className={`w-28 text-center font-black ${getFontClass('th', isModal)}`}>담당자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSchedule.map((task, idx) => {
                const isDone = task.status === '완료';
                const isProgress = task.status === '진행중';
                const isClean = task.type === '청소';
                const isMeal = task.type === '휴게';
                const isSupport = task.type === '지원';

                let shiftBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                if (task.shift.includes('2편')) shiftBadgeClass = 'bg-blue-100 text-blue-900 border-blue-300 font-black';
                else if (task.shift.includes('1편')) shiftBadgeClass = 'bg-pink-100 text-pink-900 border-pink-300 font-black';
                else if (task.shift.includes('지원')) shiftBadgeClass = 'bg-indigo-100 text-indigo-900 border-indigo-300 font-black';
                else shiftBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 font-black';

                const { start, end } = parseTimeStr(task.time);

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
                    <td className={`text-center ${getFontClass('td', isModal)}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className="text-slate-400 hover:text-blue-600 cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-slate-200/60"
                          title="마우스로 끌어서 순서 이동 (드래그 앤 드롭)"
                        >
                          <GripVertical size={16} />
                        </span>
                        <span className={`font-mono font-black text-slate-900 w-6 ${getFontClass('sub', isModal)}`}>
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
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTask(idx, 'DOWN')}
                            disabled={idx === filteredSchedule.length - 1}
                            title="아래로 순서 내리기"
                            className="p-0.5 hover:bg-blue-100 text-slate-600 hover:text-blue-700 disabled:opacity-20 cursor-pointer rounded"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* 2. 구분 (시프트 클릭 토글) */}
                    <td className={`text-center ${getFontClass('td', isModal)}`}>
                      <button
                        type="button"
                        onClick={() => {
                          const shifts: ScheduleTask['shift'][] = ['2편', '1편', '지원', '청소', '휴게'];
                          const curIdx = shifts.findIndex((s) => s === task.shift);
                          const nextShift = shifts[(curIdx + 1) % shifts.length];
                          updateTaskShift(task.id, nextShift);
                        }}
                        className={`inline-block font-black border cursor-pointer hover:opacity-80 transition-all rounded-lg ${getFontClass('badge', isModal)} ${shiftBadgeClass}`}
                        title="클릭하여 시프트 전환"
                      >
                        {task.shift}
                      </button>
                    </td>

                    {/* 3. 작업시간 */}
                    <td className={`text-center ${getFontClass('td', isModal)}`}>
                      <div className="flex items-center justify-center gap-1 font-mono">
                        <input
                          type="text"
                          value={start}
                          onChange={(e) => updateTaskStartTime(task.id, e.target.value)}
                          className={`w-14 text-center font-black bg-white border border-slate-300 hover:border-blue-500 focus:border-blue-600 focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 transition-all ${getFontClass('input', isModal)}`}
                          title="시작 시각 (수정 시 이후 작업시간이 자동으로 순차 재계산됩니다)"
                        />
                        <span className="text-slate-400 font-bold text-xs">~</span>
                        <input
                          type="text"
                          value={end}
                          onChange={(e) => updateTaskEndTime(task.id, e.target.value)}
                          className={`w-14 text-center font-black bg-white border border-slate-300 hover:border-blue-500 focus:border-blue-600 focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 transition-all ${getFontClass('input', isModal)}`}
                          title="종료 시각 (수정 시 소요시간 및 이후 작업시간이 연쇄 재계산됩니다)"
                        />
                      </div>
                    </td>

                    {/* 4. 유형 */}
                    <td className={`text-center ${getFontClass('td', isModal)}`}>
                      <span
                        className={`inline-block rounded-md font-black ${getFontClass('badge', isModal)} ${
                          task.type === '생산'
                            ? 'bg-blue-100 text-blue-900 font-black'
                            : task.type === '청소'
                            ? 'bg-amber-100 text-amber-900 font-black'
                            : task.type === '준비'
                            ? 'bg-teal-100 text-teal-900 font-black'
                            : task.type === '지원'
                            ? 'bg-indigo-100 text-indigo-900 font-black'
                            : 'bg-slate-200 text-slate-700 font-bold'
                        }`}
                      >
                        {task.type}
                      </span>
                    </td>

                    {/* 5. 지시 제품명 */}
                    <td className={`px-3 ${getFontClass('td', isModal)}`}>
                      <div className="flex items-center gap-1.5 min-w-[200px]">
                        {(() => {
                          const rBadge = getRiceColorBadge(task.item, task.bom);
                          if (!rBadge || task.type !== '생산') return null;
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[12px] font-black border shrink-0 ${rBadge.bg}`}>
                              {rBadge.label === '빨간밥' ? '🌶️' : rBadge.label.includes('흑미') ? '🌾' : '🍚'} {rBadge.label}
                            </span>
                          );
                        })()}
                        <input
                          type="text"
                          value={task.item}
                          onChange={(e) => updateTaskItem(task.id, e.target.value)}
                          placeholder="지시 제품명 입력"
                          className={`w-full font-black text-slate-950 bg-white border border-slate-200 hover:border-blue-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-500 rounded-lg px-2 py-1 transition-all ${getFontClass('input', isModal)}`}
                          title="지시 제품명 (직접 수정 가능)"
                        />
                      </div>
                    </td>

                    {/* 6. 지시수량 */}
                    <td className={`px-3 text-right whitespace-nowrap ${getFontClass('td', isModal)}`}>
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          value={typeof task.qty === 'number' ? task.qty : ''}
                          onChange={(e) => updateTaskQty(task.id, e.target.value)}
                          placeholder="0"
                          className={`w-24 text-right font-mono font-black text-indigo-950 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 ${getFontClass('input', isModal)}`}
                          title="지시수량 (직접 수정 가능)"
                        />
                        <span className="text-xs text-slate-500 font-bold shrink-0">ea</span>
                      </div>
                    </td>

                    {/* 7. 소요시간 */}
                    <td className={`text-center ${getFontClass('td', isModal)}`}>
                      <input
                        type="text"
                        value={task.duration}
                        onChange={(e) => updateTaskDuration(task.id, e.target.value)}
                        placeholder="30분"
                        className={`w-16 text-center font-mono font-bold text-slate-800 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 ${getFontClass('input', isModal)}`}
                        title="소요시간 (변경 시 종료시각 및 이후 작업시간이 자동 연쇄 갱신됩니다)"
                      />
                    </td>

                    {/* 8. 인원 */}
                    <td className={`text-center ${getFontClass('td', isModal)}`}>
                      <input
                        type="text"
                        value={task.workers}
                        onChange={(e) => updateTaskWorkers(task.id, e.target.value)}
                        placeholder="인원"
                        className={`w-16 text-center font-black text-slate-900 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-600 rounded px-1 py-1 ${getFontClass('input', isModal)}`}
                      />
                    </td>

                    {/* 9. BOM */}
                    <td className={`px-3 ${getFontClass('td', isModal)}`}>
                      <input
                        type="text"
                        value={task.bom}
                        onChange={(e) => updateTaskBom(task.id, e.target.value)}
                        placeholder="BOM 배합 기준"
                        className={`w-full text-slate-800 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-600 rounded px-2 py-1 font-medium ${getFontClass('input', isModal)}`}
                        title="주요 원부자재 배합 기준 (BOM)"
                      />
                    </td>

                    {/* 10. CCP */}
                    <td className={`px-3 ${getFontClass('td', isModal)}`}>
                      <input
                        type="text"
                        value={task.ccp}
                        onChange={(e) => updateTaskCcp(task.id, e.target.value)}
                        placeholder="CCP 핵심 관리기준"
                        className={`w-full font-black text-red-700 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-600 rounded px-2 py-1 ${getFontClass('input', isModal)}`}
                        title="HACCP & CCP 핵심 관리기준"
                      />
                    </td>

                    {/* 11. 상태 버튼 토글 */}
                    <td className={`text-center ${getFontClass('td', isModal)}`}>
                      <button
                        type="button"
                        onClick={() => toggleStatus(task.id)}
                        className={`px-3 py-1.5 rounded-xl font-black shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1 mx-auto ${getFontClass('badge', isModal)} ${
                          isDone
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : isProgress
                            ? 'bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-300'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {isDone ? (
                          <>
                            <CheckCircle2 size={14} />
                            <span>완료</span>
                          </>
                        ) : isProgress ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                            <span>진행중</span>
                          </>
                        ) : (
                          <span>대기</span>
                        )}
                      </button>
                    </td>

                    {/* 12. 담당자 인풋 */}
                    <td className={`text-center ${getFontClass('td', isModal)}`}>
                      <input
                        type="text"
                        value={task.assignee}
                        onChange={(e) => updateAssignee(task.id, e.target.value)}
                        placeholder="담당자"
                        className={`w-20 text-center font-black bg-white border border-slate-300 rounded-lg px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none ${getFontClass('input', isModal)}`}
                      />
                    </td>
                  </tr>
                );
              })}
              {filteredSchedule.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-12 text-center bg-slate-50/50">
                    <div className="space-y-2.5">
                      <div className="text-sm font-bold text-slate-600">
                        [{selectedLine}] 라인에 해당 날짜의 배정된 수주 작업이 없습니다.
                      </div>
                      {currentLine.schedule.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setScheduleTasks(currentLine.schedule.map((s) => ({ ...s })));
                            setMaterials(currentLine.materials.map((m) => ({ ...m })));
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                        >
                          표준 템플릿 불러오기 ({currentLine.schedule.length}건)
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>
    );
  };

  // ── 소요 원부자재 불출·계량표 렌더러 (기본 뷰 & 큰 팝업 공용) ──
  const renderMaterialsContent = (isModal: boolean = false) => {
    return (
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className={`bg-slate-100 text-slate-800 font-black sticky top-0 z-10 border-b-2 border-slate-300 text-center ${getFontClass('th', isModal)}`}>
            <tr>
              <th className={`w-20 text-center ${getFontClass('th', isModal)}`}>불출확인</th>
              <th className={`text-left ${getFontClass('th', isModal)}`}>원부자재 품명</th>
              <th className={`w-40 text-center ${getFontClass('th', isModal)}`}>규격/포장단위</th>
              <th className={`w-40 text-right ${getFontClass('th', isModal)}`}>소요 요구량</th>
              <th className={`w-28 text-center ${getFontClass('th', isModal)}`}>단위</th>
              <th className={`w-36 text-center ${getFontClass('th', isModal)}`}>보관창고</th>
              <th className={`w-40 text-right ${getFontClass('th', isModal)}`}>현재 창고재고</th>
              <th className={`w-32 text-center ${getFontClass('th', isModal)}`}>재고상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredMaterials.map((m) => {
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
                  <td className={`text-center ${getFontClass('td', isModal)}`}>
                    <input
                      type="checkbox"
                      checked={m.checked}
                      onChange={() => toggleMaterialCheck(m.id)}
                      className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>

                  <td className={`px-4 font-black text-slate-900 flex items-center gap-2 ${getFontClass('td', isModal)}`}>
                    <span>{m.name}</span>
                    {m.checked && (
                      <span className="text-xs bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded">
                        계량완료
                      </span>
                    )}
                  </td>

                  <td className={`text-center text-slate-700 font-mono font-bold ${getFontClass('td', isModal)}`}>
                    {m.spec}
                  </td>

                  <td className={`px-4 text-right font-mono font-black text-indigo-950 ${getFontClass('td', isModal)}`}>
                    {m.requiredQty.toLocaleString()}
                  </td>

                  <td className={`text-center font-black text-slate-800 ${getFontClass('td', isModal)}`}>
                    {m.unit}
                  </td>

                  <td className={`text-center ${getFontClass('td', isModal)}`}>
                    <span className={`inline-block rounded-lg font-black border ${whBadge} ${getFontClass('badge', isModal)}`}>
                      {m.warehouse}
                    </span>
                  </td>

                  <td className={`px-4 text-right font-mono font-black text-slate-900 ${getFontClass('td', isModal)}`}>
                    {m.currentStock.toLocaleString()} {m.unit}
                  </td>

                  <td className={`text-center ${getFontClass('td', isModal)}`}>
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
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-slate-800 font-sans">
      {/* 알림 토스트 */}
      {saveToast && (
        <div className="fixed top-16 right-8 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-bold animate-bounce">
          <CheckCircle2 size={18} />
          <span>{saveToast}</span>
        </div>
      )}

      {/* 0. 상단 마스터 헤더 바 */}
      <div className="h-[44px] bg-[#1e293b] text-white px-4 flex items-center justify-between border-b border-slate-900 select-none shrink-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-2 h-4 bg-[#3b82f6] rounded-2xs" />
          <h1 className="text-base font-black tracking-tight text-white">작업지시현황</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 font-bold">
            생산·제조
          </span>
        </div>

        {/* 우측 상단 여백: 핵심 정보 5종 컴팩트 모니터링 뱃지 */}
        {(() => {
          const startTime = scheduleTasks[0]?.time?.split('~')[0]?.trim() || currentLine.totalTime.split('~')[0]?.trim() || '09:25';
          const endTime = scheduleTasks[scheduleTasks.length - 1]?.time?.split('~')[1]?.trim() || currentLine.totalTime.split('~')[1]?.trim() || '20:23';
          const progressPct = stats.totalCount > 0 ? Math.round((stats.completedCount / stats.totalCount) * 100) : 0;
          const speedMain = currentLine.speed.split('(')[0].trim();
          const headcountMain = currentLine.personnel.split('(')[0].trim();

          return (
            <div className="flex items-center gap-2 overflow-x-auto text-[12.5px] py-0.5 scrollbar-none">
              <div
                onClick={() => fetchServerWorkOrders(workDate, shift, selectedLine, true)}
                title="클릭 시 최신 수주 재동기화"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/80 hover:bg-blue-900 border border-blue-500/40 text-blue-200 transition cursor-pointer"
              >
                <PackageCheck size={13} className="text-blue-400 shrink-0" />
                <span className="text-slate-300">계획:</span>
                <span className="text-white font-mono font-bold">{realOrderMeta?.lineTotalPlan || currentLine.totalPlan}</span>
                {realOrderMeta?.totalDayAmount ? (
                  <span className="text-[11.5px] text-emerald-400 font-bold hidden xl:inline">
                    (₩{realOrderMeta.totalDayAmount.toLocaleString()})
                  </span>
                ) : null}
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/90 border border-slate-700 text-slate-200">
                <Clock size={13} className="text-slate-400 shrink-0" />
                <span className="text-slate-400">가동:</span>
                <span className="text-white font-mono font-bold">{startTime}~{endTime}</span>
                <span className={`text-[11px] px-1.5 rounded font-bold ${
                  progressPct > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'
                }`}>
                  {progressPct}%
                </span>
              </div>

              <div
                onClick={() => setIsConfigModalOpen(true)}
                title="클릭 시 기준정보 설정"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 transition cursor-pointer"
              >
                <Gauge size={13} className="text-emerald-400 shrink-0" />
                <span className="text-emerald-300">속도:</span>
                <span className="text-emerald-100 font-mono font-bold">{speedMain}</span>
              </div>

              <div className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/80 border border-amber-500/40 text-amber-200">
                <Users size={13} className="text-amber-400 shrink-0" />
                <span className="text-amber-300">인원:</span>
                <span className="text-amber-100 font-bold">{headcountMain}</span>
              </div>

              <div className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/80 border border-indigo-500/40 text-indigo-200">
                <ShieldCheck size={13} className="text-indigo-400 shrink-0" />
                <span className="text-indigo-300">책임:</span>
                <span className="text-indigo-100 font-bold truncate max-w-[110px]">{currentLine.leadWorker}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 1. 상단 공정 대분류 스위처 및 작업 조건 바 */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 shrink-0 space-y-2">
        {/* 1행: 공정 대분류 토글 + 인쇄/저장 핵심 액션 */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => handleDepartmentChange('SEONGHYEONG')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-bold text-[13.5px] transition-all cursor-pointer whitespace-nowrap ${
                department === 'SEONGHYEONG'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🍱 성형장</span>
              <span
                className={`text-[11.5px] px-1.5 py-0.2 rounded-full font-bold ${
                  department === 'SEONGHYEONG'
                    ? 'bg-white/15 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                9라인
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleDepartmentChange('JEONCHEORI')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-bold text-[13.5px] transition-all cursor-pointer whitespace-nowrap ${
                department === 'JEONCHEORI'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🍳 전처리실</span>
              <span
                className={`text-[11.5px] px-1.5 py-0.2 rounded-full font-bold ${
                  department === 'JEONCHEORI'
                    ? 'bg-white/15 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                20설비
              </span>
            </button>
          </div>

          {/* 인쇄 및 저장 버튼 그룹 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrintLiveWorkOrder}
              title="현재 선택된 날짜와 시프트, 실 수주 수량이 반영된 A4 가로 작업지시서를 새 창으로 열어 즉시 인쇄 및 PDF로 저장합니다."
              className="h-8.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[13px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer size={14} />
              <span>라인 PDF</span>
              <ExternalLink size={11} className="opacity-80" />
            </button>

            <button
              type="button"
              onClick={handlePrintAllLinesPdf}
              title="성형장·전처리실의 모든 가동 라인·설비 작업지시서를 라인 PDF 양식 그대로 한 번에 일괄 인쇄/PDF 저장합니다."
              className="h-8.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[13px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer size={14} />
              <span>전부서 일괄 PDF</span>
            </button>

            <button
              type="button"
              onClick={handleOpenMasterPdf}
              title="전라인 종합본 PDF를 인쇄합니다."
              className="h-8.5 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold text-[13px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer size={14} />
              <span>종합본 인쇄</span>
            </button>

            <button
              type="button"
              onClick={handleSaveOrders}
              disabled={saving}
              className="h-8.5 px-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg font-bold text-[13px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Save size={14} />
              <span>{saving ? '저장 중...' : '순서 저장'}</span>
            </button>

            <button
              type="button"
              onClick={() => void fetchServerWorkOrders(workDate, shift, selectedLine, true)}
              disabled={loading}
              title="최신 수주 데이터를 불러와 작업지시서를 새로고침합니다."
              className="h-8.5 w-8.5 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
            >
              <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* 2행: 날짜 · 수주연동 · 기준정보 · 시프트 · 검색 */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-slate-600 flex items-center gap-1 whitespace-nowrap">
              <Calendar size={14} className="text-slate-500" /> 작업일:
            </span>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="h-8.5 bg-slate-50 border border-slate-300 px-2.5 rounded-lg text-[13px] font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
            />
            {realOrderMeta && realOrderMeta.hasRealOrders ? (
              <span className="h-8.5 inline-flex items-center gap-1.5 px-3 rounded-lg text-[13px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>실 수주 연동 ({realOrderMeta.totalDayQty.toLocaleString()} ea / {realOrderMeta.distinctItemCount}품목)</span>
              </span>
            ) : (
              <span className="h-8.5 inline-flex items-center gap-1 px-3 rounded-lg text-[13px] font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                표준 템플릿
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchServerWorkOrders(workDate, shift, selectedLine, true)}
              disabled={loading}
              title="수주 물량이 입력/변경되었을 때 최신 수주 데이터를 즉시 반영하여 작업지시서를 재계산합니다."
              className="h-8.5 inline-flex items-center gap-1.5 px-3 rounded-lg text-[13px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
              <span>수주 동기화</span>
            </button>
            <button
              type="button"
              onClick={() => setIsConfigModalOpen(true)}
              className="h-8.5 inline-flex items-center gap-1.5 px-3 rounded-lg text-[13px] font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 transition-all cursor-pointer whitespace-nowrap"
              title="기준값(UPH 속도, 09:25 선가동, 취반/전처리 역산 시간) 수정"
            >
              <Gauge size={13} className="text-slate-600" />
              <span>기준정보 설정</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {/* 시프트 필터 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-slate-500">시프트:</span>
              <div className="h-8.5 flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {(['전체', '2편', '1편'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setShift(s)}
                    className={`h-7 px-3 rounded-md text-[13px] font-bold transition-all cursor-pointer ${
                      shift === s
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* 검색창 */}
            <div className="relative pl-2.5 border-l border-slate-200">
              <Search size={14} className="absolute left-5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="품목명, BOM, CCP 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8.5 pl-8 pr-3 bg-slate-50 border border-slate-300 rounded-lg text-[13px] text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 w-52"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. 파트별 2단 라인·설비 선택 바 */}
      <div
        ref={lineDropdownRef}
        className="relative bg-slate-100/80 border-b border-slate-200 px-4 py-2 shrink-0"
      >
        {(() => {
          const isSeong = department === 'SEONGHYEONG';
          const parts = isSeong
            ? [
                { key: 'ALL', label: '🌟 성형장 전체', ids: ['ALL_SEONGHYEONG'] },
                { key: 'BENTO', label: '🍱 도시락', ids: ['도시락 1'] },
                { key: 'GIMBAP', label: '🍙 김밥', ids: ['김밥성형', '김밥포장'] },
                {
                  key: 'SAMGAK',
                  label: '🔺 삼각·커플',
                  ids: ['삼각김밥 1호기', '삼각김밥 2호기', '삼각김밥(더큰)', '커플 포장기'],
                },
                { key: 'BREAD', label: '🍔 조리빵', ids: ['햄버거', '샌드위치'] },
              ]
            : [
                { key: 'ALL', label: '🌟 전처리 전체', ids: ['ALL_JEONCHEORI'] },
                {
                  key: 'RICE',
                  label: '🍚 취반·로터리',
                  ids: ['취반실', '취반실(로터리 1호)', '취반실(로터리 2호)'],
                },
                {
                  key: 'POT',
                  label: '🍲 솥·가열',
                  ids: ['스팀솥 1번', '스팀솥 2번', '자동스팀솥 1호기', '자동스팀솥 2호기'],
                },
                {
                  key: 'FRY_OVEN',
                  label: '🍗 튀김·오븐',
                  ids: ['오토후라이어1', '오토후라이어2', '제트오븐', '콤비오븐'],
                },
                {
                  key: 'VEG_SALAD',
                  label: '🥗 샐러드·채소',
                  ids: [
                    '샐러드실(믹서1)',
                    '샐러드실(믹서2)',
                    '커팅실(후드)',
                    '커팅실(푸드커터)',
                    '채소작업실(슬라이스)',
                    '채소작업실(후드)',
                  ],
                },
                {
                  key: 'WEIGH',
                  label: '⚖️ 계량·빵',
                  ids: ['계량실(계량)', '계량실(냉동)', '빵슬라이스실(슬라이서)'],
                },
              ];

          const groups = parts.map((p) => ({ title: p.label, ids: p.ids }));
          const activePart =
            parts.find((p) => p.ids.includes(selectedLine)) || parts[0];
          const partEquipments = activePart.ids
            .map((id) => activeLineList.find((x) => x.id === id))
            .filter((x): x is NonNullable<typeof x> => Boolean(x));

          return (
            <>
              <div className="space-y-1.5">
                {/* 1단: 공정 파트 선택 */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-black text-slate-600 whitespace-nowrap mr-0.5">
                      {isSeong ? '성형 파트:' : '전처리 파트:'}
                    </span>
                    {parts.map((part) => {
                      const isPartActive = activePart.key === part.key;
                      const partItems = part.ids
                        .map((id) => activeLineList.find((x) => x.id === id))
                        .filter((x): x is NonNullable<typeof x> => Boolean(x));
                      const partTotalCount =
                        part.key === 'ALL'
                          ? activeLineList[0]?.count ?? 0
                          : partItems.reduce((s, it) => s + (it.count || 0), 0);

                      return (
                        <button
                          key={part.key}
                          type="button"
                          onClick={() => {
                            if (part.ids[0]) setSelectedLine(part.ids[0]);
                            setIsLineDropdownOpen(false);
                          }}
                          className={`h-8.5 inline-flex items-center gap-1.5 px-3 rounded-lg text-[13px] font-bold border transition cursor-pointer whitespace-nowrap ${
                            isPartActive
                              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                          }`}
                        >
                          <span>{part.label}</span>
                          <span
                            className={`text-[11.5px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                              isPartActive
                                ? 'bg-white/20 text-white'
                                : partTotalCount > 0
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {partTotalCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsLineDropdownOpen((v) => !v)}
                    className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[12.5px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    title="전체 라인/설비를 한눈에 보고 선택합니다"
                  >
                    <span>{isLineDropdownOpen ? '닫기' : '전체 한눈에 ▾'}</span>
                  </button>
                </div>

                {/* 2단: 선택한 파트의 세부 라인/설비 선택 (2개 이상일 때만 표시) */}
                {partEquipments.length > 1 && (
                  <div className="flex items-center gap-1.5 flex-wrap pl-2 pt-1.5 border-t border-slate-200/80">
                    <span className="text-[12.5px] font-bold text-slate-500 whitespace-nowrap mr-1">
                      ↳ 세부 {isSeong ? '라인' : '설비'}:
                    </span>
                    {partEquipments.map((eq) => {
                      const isSel = selectedLine === eq.id;
                      const hasWork = (eq.count || 0) > 0;
                      return (
                        <button
                          key={eq.id}
                          type="button"
                          onClick={() => {
                            setSelectedLine(eq.id);
                            setIsLineDropdownOpen(false);
                          }}
                          className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-md text-[13px] font-bold transition cursor-pointer border whitespace-nowrap ${
                            isSel
                              ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                              : hasWork
                              ? 'bg-white hover:bg-blue-50 text-slate-800 border-slate-300'
                              : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-white hover:text-slate-600'
                          }`}
                        >
                          <span>{eq.name}</span>
                          <span
                            className={`text-[11.5px] px-1.5 rounded-full font-mono ${
                              isSel
                                ? 'bg-white/20 text-white'
                                : hasWork
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            {eq.count}건
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 공정별 그룹 옵션 테이블 모달 (화면 중앙 고정 + 내부 스크롤) */}
              {isLineDropdownOpen && (
                <div
                  className="fixed inset-0 z-[200] bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6"
                  onClick={() => setIsLineDropdownOpen(false)}
                >
                  <div
                    className="w-full max-w-6xl max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* 모달 상단 헤더 */}
                    <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
                      <div>
                        <div className="text-xl sm:text-2xl font-black tracking-tight">
                          {isSeong
                            ? '🍱 성형장 라인 선택 테이블'
                            : '🍳 전처리 설비 · 작업실 선택 테이블'}
                        </div>
                        <div className="text-sm text-slate-300 font-medium mt-0.5">
                          원하는 라인 또는 설비를 클릭하면 즉시 전환됩니다
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDepartmentChange('SEONGHYEONG')}
                          className={`h-10 px-4 rounded-xl text-sm sm:text-base font-black transition cursor-pointer ${
                            isSeong
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white/10 text-slate-200 hover:bg-white/20'
                          }`}
                        >
                          🍱 성형장 ({SEONGHYEONG_LINES.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDepartmentChange('JEONCHEORI')}
                          className={`h-10 px-4 rounded-xl text-sm sm:text-base font-black transition cursor-pointer ${
                            !isSeong
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white/10 text-slate-200 hover:bg-white/20'
                          }`}
                        >
                          🍳 전처리실 ({JEONCHEORI_EQUIPMENT.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsLineDropdownOpen(false)}
                          className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-rose-500 text-white transition cursor-pointer"
                          title="닫기 (ESC)"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>

                    {/* 모달 본문 (항상 스크롤 가능) */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 bg-slate-50 space-y-5">
                      {groups.map((grp) => {
                        const items = grp.ids
                          .map((id) => activeLineList.find((x) => x.id === id))
                          .filter((x): x is NonNullable<typeof x> => Boolean(x));
                        if (items.length === 0) return null;
                        return (
                          <div
                            key={grp.title}
                            className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs"
                          >
                            <div className="text-base sm:text-lg font-black text-slate-900 mb-3.5 pb-2 border-b border-slate-100 flex items-center gap-2">
                              <span>{grp.title}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {items.map((item) => {
                                const isSel = selectedLine === item.id;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedLine(item.id);
                                      setIsLineDropdownOpen(false);
                                    }}
                                    className={`flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                                      isSel
                                        ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                                        : 'bg-slate-50/70 hover:bg-white border-slate-200 hover:border-blue-600 hover:shadow-sm text-slate-900'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span
                                        className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
                                          isSel ? 'bg-white/15' : 'bg-white border border-slate-200'
                                        }`}
                                      >
                                        {item.icon}
                                      </span>
                                      <span className="text-base sm:text-lg font-black leading-snug break-keep">
                                        {item.name}
                                      </span>
                                    </div>
                                    <span
                                      className={`text-sm px-3 py-1 rounded-full font-mono font-black shrink-0 ${
                                        isSel
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-slate-200/80 text-slate-800'
                                      }`}
                                    >
                                      {item.count}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* 3. 멀티 탭 네비게이션 */}
      <div className="px-4 pt-2 shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 탭 1: 일일 작업지시서 */}
          <button
            type="button"
            onClick={() => setActiveTab('TIMETABLE')}
            className={`px-3.5 py-2 rounded-t-lg font-bold text-[13.5px] flex items-center gap-1.5 transition-all cursor-pointer border-t-2 ${
              activeTab === 'TIMETABLE'
                ? 'bg-white text-emerald-900 border-emerald-600 shadow-2xs'
                : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <FileText size={15} className={activeTab === 'TIMETABLE' ? 'text-emerald-600' : 'text-slate-400'} />
            <span>일일 작업지시서</span>
            <span
              className={`text-[12px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'TIMETABLE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              {filteredSchedule.length}
            </span>
          </button>

          {/* 탭 2: 실별·시간대별 자동지시서 */}
          <button
            type="button"
            onClick={() => setActiveTab('AUTO_5TAB')}
            className={`px-3.5 py-2 rounded-t-lg font-bold text-[13.5px] flex items-center gap-1.5 transition-all cursor-pointer border-t-2 ${
              activeTab === 'AUTO_5TAB'
                ? 'bg-white text-slate-900 border-slate-900 shadow-2xs'
                : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Sparkles size={15} className={activeTab === 'AUTO_5TAB' ? 'text-slate-900' : 'text-slate-400'} />
            <span>실별·시간대별 자동지시서 (5시트)</span>
          </button>

          {/* 탭 3: 10분 단위 타임테이블 간트 */}
          <button
            type="button"
            onClick={() => setActiveTab('GANTT')}
            className={`px-3.5 py-2 rounded-t-lg font-bold text-[13.5px] flex items-center gap-1.5 transition-all cursor-pointer border-t-2 ${
              activeTab === 'GANTT'
                ? 'bg-white text-blue-900 border-blue-600 shadow-2xs'
                : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Clock size={15} className={activeTab === 'GANTT' ? 'text-blue-600' : 'text-slate-400'} />
            <span>타임테이블 간트</span>
            <span
              className={`text-[12px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'GANTT' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              30라인
            </span>
          </button>

          {/* 탭 4: 소요 원부자재 */}
          <button
            type="button"
            onClick={() => setActiveTab('MATERIALS')}
            className={`px-3.5 py-2 rounded-t-lg font-bold text-[13.5px] flex items-center gap-1.5 transition-all cursor-pointer border-t-2 ${
              activeTab === 'MATERIALS'
                ? 'bg-white text-indigo-900 border-indigo-600 shadow-2xs'
                : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Layers size={15} className={activeTab === 'MATERIALS' ? 'text-indigo-600' : 'text-slate-400'} />
            <span>소요 원부자재</span>
            <span
              className={`text-[12px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'MATERIALS' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              {materials.length}종
            </span>
          </button>

          {/* 탭 5: 생산속도 시뮬레이터 */}
          <button
            type="button"
            onClick={() => setActiveTab('SIMULATOR')}
            className={`px-3.5 py-2 rounded-t-lg font-bold text-[13.5px] flex items-center gap-1.5 transition-all cursor-pointer border-t-2 ${
              activeTab === 'SIMULATOR'
                ? 'bg-white text-purple-900 border-purple-600 shadow-2xs'
                : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <Gauge size={15} className={activeTab === 'SIMULATOR' ? 'text-purple-600' : 'text-slate-400'} />
            <span>속도 시뮬레이터</span>
            <span
              className={`text-[12px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'SIMULATOR' ? 'bg-purple-100 text-purple-800' : 'bg-slate-300 text-slate-700'
              }`}
            >
              71품목
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {/* 창고별 필터 버튼 */}
          {activeTab === 'MATERIALS' && (
            <div className="flex items-center gap-1 bg-white px-3 py-1 rounded-lg border border-slate-200 text-[12.5px] font-bold">
              <span className="text-slate-500">창고:</span>
              {['전체', '상온', '냉장1', '냉장2', '냉동', '부자재'].map((wh) => (
                <button
                  key={wh}
                  onClick={() => setMaterialWhFilter(wh)}
                  className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                    materialWhFilter === wh ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {wh}
                </button>
              ))}
            </div>
          )}

          {/* 완료 카운트 표시 */}
          {activeTab === 'TIMETABLE' && (
            <div className="flex items-center gap-3 text-[13px] font-bold text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>완료 <strong className="text-emerald-700 font-mono">{stats.completedCount}</strong></span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span>진행 <strong className="text-blue-700 font-mono">{stats.inProgressCount}</strong></span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                <span>대기 <strong className="text-slate-700 font-mono">{stats.pendingCount}</strong></span>
              </span>
            </div>
          )}

          {/* 큰 팝업으로 보기 버튼 */}
          <button
            type="button"
            onClick={() => openLargeModal()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-bold transition cursor-pointer shrink-0"
            title="큰 팝업창으로 확대"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>확대 팝업</span>
          </button>
        </div>
      </div>

      {/* 4. 메인 콘텐츠 영역 */}
      <div className="flex-1 min-h-0 px-4 pb-3 pt-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 bg-white border border-slate-300 rounded-b-xl rounded-tr-xl shadow-xs overflow-hidden flex flex-col">
          {/* 기본 탭: 실별·시간대별 5시트 자동지시서 (10시 전/후) */}
          {activeTab === 'AUTO_5TAB' && (
            <div className="flex-1 min-h-0 p-3 bg-slate-50/40 overflow-hidden">
              <RiceWorkOrderTabsPanel workDate={workDate} />
            </div>
          )}

          {/* TAB 1: 10분 단위 타임테이블 간트차트 뷰 */}
          {activeTab === 'GANTT' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50/40">
              <GanttTimelineView
                category={department}
                selectedLine={selectedLine}
                onSelectCategory={(cat) => {
                  if (cat === 'SEONGHYEONG' || cat === 'JEONCHEORI') {
                    handleDepartmentChange(cat);
                  }
                }}
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
              <SpeedSimulatorView workDate={workDate} />
            </div>
          )}
          {/* TAB 2: 타임테이블 스케줄 테이블 (일일 작업지시서 - 스마트 편집 모드) */}
          {activeTab === 'TIMETABLE' && renderTimetableContent(false)}

          {/* TAB 3: 소요 원부자재 불출·계량표 */}
          {activeTab === 'MATERIALS' && renderMaterialsContent(false)}

          {/* 테이블 하단 푸터 바 (현장 필수 준수사항 및 발행 정보) */}
          <div className="bg-slate-50 px-6 py-2.5 border-t border-slate-300 flex flex-wrap items-center justify-between text-[13px] text-slate-600 font-medium">
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

      {/* 5. 큰 팝업 모달 (다른 페이지의 [큰 팝업으로 보기] 패턴 100% 계승) */}
      {isLargeModalOpen && (
        <div
          className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4"
          onClick={() => setIsLargeModalOpen(false)}
        >
          <div
            className="w-[98vw] h-[95vh] bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 팝업 상단 헤더 바 */}
            <div className="px-5 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-black shrink-0">
                  📋 일일 작업지시서 상세 (확대 팝업)
                </span>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <h2 className="text-lg sm:text-xl font-black tracking-tight text-white truncate">
                    [{currentLine.name}] {department === 'SEONGHYEONG' ? '성형·포장 라인' : '전처리·취반 설비'}
                  </h2>
                  <span className="text-xs font-mono text-slate-300 bg-white/10 px-2 py-0.5 rounded">
                    작업일 {workDate} • 총 {filteredSchedule.length}건 지시 • 문서 {currentLine.docNo}
                  </span>
                </div>
              </div>

              {/* 우측 도구함: 공정 토글 + 라인 빠른 전환 + 글자 크기 + 인쇄/저장 + 닫기 */}
              <div className="flex flex-wrap items-center gap-2">
                {/* 성형장 / 전처리 토글 */}
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => handleDepartmentChange('SEONGHYEONG')}
                    className={`px-2.5 py-1 rounded-lg font-black text-xs cursor-pointer transition ${
                      department === 'SEONGHYEONG' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🍱 성형장
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDepartmentChange('JEONCHEORI')}
                    className={`px-2.5 py-1 rounded-lg font-black text-xs cursor-pointer transition ${
                      department === 'JEONCHEORI' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🍳 전처리실
                  </button>
                </div>

                {/* 라인/설비 빠른 전환 셀렉트 */}
                <select
                  value={selectedLine}
                  onChange={(e) => setSelectedLine(e.target.value)}
                  className="bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-xl px-3 py-1.5 text-xs font-bold outline-none cursor-pointer max-w-[200px]"
                  title="다른 라인/설비로 바로 전환"
                >
                  {activeLineList.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.icon} {line.name} ({line.count}건)
                    </option>
                  ))}
                </select>

                {/* 글자 크기 조절 (보통 / 크게 / 특대) */}
                <div className="flex items-center gap-1 bg-slate-700/80 p-1 rounded-xl border border-slate-600 text-xs">
                  <span className="text-slate-300 font-bold px-1.5">글자:</span>
                  {(['normal', 'large', 'xlarge'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setModalFontSize(sz)}
                      className={`px-2.5 py-1 rounded-lg font-black transition cursor-pointer ${
                        modalFontSize === sz
                          ? 'bg-blue-500 text-white shadow-2xs'
                          : 'text-slate-300 hover:text-white hover:bg-slate-600'
                      }`}
                    >
                      {sz === 'normal' ? '보통' : sz === 'large' ? '크게' : '특대'}
                    </button>
                  ))}
                </div>

                {/* 현장 기준정보 설정 바로가기 */}
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black transition cursor-pointer"
                  title="과장님 확인 요청서 기준값(UPH 속도, 09:25 선가동, 취반/전처리 역산 시간)을 화면에서 보고 언제든 수정합니다."
                >
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  <span>현장 기준정보 설정</span>
                </button>

                {/* 수주 동기화 바로가기 */}
                <button
                  type="button"
                  onClick={() => fetchServerWorkOrders(workDate, shift, selectedLine, true)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-black transition cursor-pointer disabled:opacity-50"
                  title="최신 수주 데이터를 즉시 반영하여 작업지시서를 재계산합니다."
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>수주 동기화</span>
                </button>

                {/* 인쇄 바로가기 */}
                <button
                  type="button"
                  onClick={handlePrintLiveWorkOrder}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-black transition cursor-pointer"
                  title="현재 지시서 인쇄 미리보기"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>인쇄</span>
                </button>

                {/* 닫기 버튼 */}
                <button
                  type="button"
                  onClick={() => setIsLargeModalOpen(false)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-rose-500 text-white text-xs font-black transition cursor-pointer"
                  title="팝업 닫기 (ESC)"
                >
                  <X className="w-4 h-4" />
                  <span>닫기</span>
                </button>
              </div>
            </div>



            {/* 팝업 내부 탭 바 */}
            <div className="px-5 pt-2.5 pb-0 bg-slate-100 border-b border-slate-300 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setModalActiveTab('TIMETABLE')}
                  className={`px-4 py-2 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
                    modalActiveTab === 'TIMETABLE'
                      ? 'bg-white text-blue-900 border-blue-600 shadow-xs'
                      : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
                  }`}
                >
                  <FileText size={16} className={modalActiveTab === 'TIMETABLE' ? 'text-blue-600' : 'text-slate-400'} />
                  <span>📋 일일 작업지시서 (세로 상세표 & 드래그)</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-black ${
                    modalActiveTab === 'TIMETABLE' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
                  }`}>
                    {filteredSchedule.length}건
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalActiveTab('AUTO_5TAB')}
                  className={`px-4 py-2 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
                    modalActiveTab === 'AUTO_5TAB'
                      ? 'bg-white text-slate-900 border-slate-900 shadow-xs'
                      : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
                  }`}
                >
                  <Sparkles size={16} className={modalActiveTab === 'AUTO_5TAB' ? 'text-slate-900' : 'text-slate-400'} />
                  <span>실별·시간대별 자동지시서 (5시트)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalActiveTab('MATERIALS')}
                  className={`px-4 py-2 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
                    modalActiveTab === 'MATERIALS'
                      ? 'bg-white text-indigo-900 border-indigo-600 shadow-xs'
                      : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
                  }`}
                >
                  <Layers size={16} className={modalActiveTab === 'MATERIALS' ? 'text-indigo-600' : 'text-slate-400'} />
                  <span>📦 소요 원부자재 (BOM 배합·불출)</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-black ${
                    modalActiveTab === 'MATERIALS' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-300 text-slate-700'
                  }`}>
                    {materials.length}종
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalActiveTab('GANTT')}
                  className={`px-4 py-2 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
                    modalActiveTab === 'GANTT'
                      ? 'bg-white text-blue-900 border-blue-600 shadow-xs'
                      : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
                  }`}
                >
                  <Clock size={16} className={modalActiveTab === 'GANTT' ? 'text-blue-600' : 'text-slate-400'} />
                  <span>🕒 타임테이블 간트 (10분 그리드)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalActiveTab('SIMULATOR')}
                  className={`px-4 py-2 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
                    modalActiveTab === 'SIMULATOR'
                      ? 'bg-white text-purple-900 border-purple-600 shadow-xs'
                      : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
                  }`}
                >
                  <Gauge size={16} className={modalActiveTab === 'SIMULATOR' ? 'text-purple-600' : 'text-slate-400'} />
                  <span>⚡ 생산속도 시뮬레이터</span>
                </button>
              </div>

              {/* 탭 우측 추가 필터 / 카운트 */}
              {modalActiveTab === 'MATERIALS' && (
                <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-xl border border-slate-300 text-xs font-bold mb-1.5">
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

              {modalActiveTab === 'TIMETABLE' && (
                <div className="flex items-center gap-4 text-xs font-bold text-slate-600 mb-1.5">
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

            {/* 팝업 콘텐츠 본체 */}
            <div className="flex-1 min-h-0 bg-white overflow-hidden flex flex-col">
              {modalActiveTab === 'TIMETABLE' && renderTimetableContent(true)}
              {modalActiveTab === 'AUTO_5TAB' && (
                <div className="flex-1 min-h-0 p-3 bg-slate-50/40 overflow-hidden flex flex-col">
                  <RiceWorkOrderTabsPanel workDate={workDate} />
                </div>
              )}
              {modalActiveTab === 'MATERIALS' && renderMaterialsContent(true)}
              {modalActiveTab === 'GANTT' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50/40">
                  <GanttTimelineView
                    category={department}
                    selectedLine={selectedLine}
                    onSelectCategory={(cat) => {
                      if (cat === 'SEONGHYEONG' || cat === 'JEONCHEORI') {
                        handleDepartmentChange(cat);
                      }
                    }}
                    onSelectLine={(lineName) => {
                      setSelectedLine(lineName);
                      setModalActiveTab('TIMETABLE');
                    }}
                  />
                </div>
              )}
              {modalActiveTab === 'SIMULATOR' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50/40">
                  <SpeedSimulatorView workDate={workDate} />
                </div>
              )}
            </div>

            {/* 팝업 하단 푸터 바 */}
            <div className="bg-slate-50 px-6 py-2.5 border-t border-slate-300 flex flex-wrap items-center justify-between text-xs text-slate-600 font-medium shrink-0">
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
      )}

      {/* 현장 기준정보 설정 모달 (과장님 설문지 기반) */}
      <ProductionConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onApply={() => {
          fetchServerWorkOrders(workDate, shift, selectedLine, true);
        }}
      />
    </div>
  );
};
