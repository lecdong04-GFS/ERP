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
import { ProductionConfigModal } from '@/components/production/modals/ProductionConfigModal';

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
 * 밥 색상 식별 헬퍼 (백미 ➔ 흑미 ➔ 빨간 볶음밥 시퀀싱 표시)
 */
function getRiceColorBadge(name: string) {
  const n = (name || '').toLowerCase();
  if (
    n.includes('김치') ||
    n.includes('비빔') ||
    n.includes('고추장') ||
    n.includes('제육') ||
    n.includes('불닭') ||
    n.includes('빨간') ||
    n.includes('양념') ||
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
    n.includes('흑미') ||
    n.includes('잡곡') ||
    n.includes('보리') ||
    n.includes('현미') ||
    n.includes('옥수수') ||
    n.includes('파프리카')
  ) {
    return { label: '흑미/잡곡', bg: 'bg-purple-100 text-purple-800 border-purple-300' };
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
  const [activeTab, setActiveTab] = useState<'GANTT' | 'TIMETABLE' | 'MATERIALS' | 'SIMULATOR'>('GANTT');
  const [materialWhFilter, setMaterialWhFilter] = useState<string>('전체');

  // 큰 팝업 모달 상태
  const [isLargeModalOpen, setIsLargeModalOpen] = useState(false);
  const [modalFontSize, setModalFontSize] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const [modalActiveTab, setModalActiveTab] = useState<'GANTT' | 'TIMETABLE' | 'MATERIALS' | 'SIMULATOR'>('TIMETABLE');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  const openLargeModal = (tab?: 'GANTT' | 'TIMETABLE' | 'MATERIALS' | 'SIMULATOR') => {
    setModalActiveTab(tab || activeTab);
    setIsLargeModalOpen(true);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLargeModalOpen) {
        setIsLargeModalOpen(false);
      }
    };
    if (isLargeModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isLargeModalOpen]);

  // 작업시간 연쇄 자동 계산 활성화 플래그
  const [autoCascadeTime, setAutoCascadeTime] = useState(true);
  const [autoCascadeOnReorder, setAutoCascadeOnReorder] = useState(true);

  // 활성 공정에 따른 라인/설비 목록
  const activeLineList = useMemo(() => {
    return department === 'SEONGHYEONG' ? SEONGHYEONG_LINES : JEONCHEORI_EQUIPMENT;
  }, [department]);

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
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setScheduleTasks(json.data);
        if (Array.isArray(json.materials) && json.materials.length > 0) {
          setMaterials(json.materials);
        }
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
          setSaveToast('🔄 최신 수주 데이터를 즉시 반영하여 작업지시서를 재계산했습니다!');
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

    // seq 재계산 및 시간 연쇄 자동 정렬
    const reordered = newTasks.map((t, idx) => ({
      ...t,
      seq: idx + 1,
    }));

    if (autoCascadeOnReorder && reordered.length > 0) {
      const baseStart = parseTimeStr(reordered[0].time).start || '09:00';
      const [sh, sm] = baseStart.split(':').map(Number);
      let curStartMin = (isNaN(sh) ? 9 : sh) * 60 + (isNaN(sm) ? 0 : sm);
      for (let i = 0; i < reordered.length; i++) {
        const task = reordered[i];
        const dur = parseDurationMin(task.duration, 30);
        const endMin = curStartMin + dur;
        reordered[i].time = `${minToTimeStr(curStartMin)} ~ ${minToTimeStr(endMin)}`;
        const gap = task.type === '휴게' || task.type === '청소' ? 0 : 5;
        curStartMin = endMin + gap;
      }
    }

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

    if (autoCascadeOnReorder && reordered.length > 0) {
      const baseStart = parseTimeStr(reordered[0].time).start || '09:00';
      const [sh, sm] = baseStart.split(':').map(Number);
      let curStartMin = (isNaN(sh) ? 9 : sh) * 60 + (isNaN(sm) ? 0 : sm);
      for (let i = 0; i < reordered.length; i++) {
        const task = reordered[i];
        const dur = parseDurationMin(task.duration, 30);
        const endMin = curStartMin + dur;
        reordered[i].time = `${minToTimeStr(curStartMin)} ~ ${minToTimeStr(endMin)}`;
        const gap = task.type === '휴게' || task.type === '청소' ? 0 : 5;
        curStartMin = endMin + gap;
      }
    }

    setScheduleTasks(reordered);
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

  // 1. A4 가로 실시간 작업지시서 즉시 브라우저 인쇄 & PDF 저장 (실 수주량 반영)
  const handlePrintLiveWorkOrder = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      // 팝업 차단된 경우 정본 PDF 열기
      window.open(currentLine.pdfUrl || `/reports/work-orders/${encodeURIComponent(selectedLine)}.pdf`, '_blank');
      return;
    }

    // 작업일자 한글 요일 서식 포맷 (예: 2026년 11월 04일 (수요일))
    const safeWorkDate = workDate || kstToday();
    const dateParts = safeWorkDate.split('-');
    const year = dateParts[0] || safeWorkDate.slice(0, 4);
    const month = dateParts[1] || safeWorkDate.slice(5, 7);
    const day = dateParts[2] || safeWorkDate.slice(8, 10);
    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = isNaN(dateObj.getTime()) ? '수' : dayNames[dateObj.getDay()];
    const formattedDateKo = `${year}년 ${Number(month)}월 ${Number(day)}일 (${dayOfWeek}요일)`;
    const docNumber = `GFS-WO-${year}${month}${day}-${selectedLine.replace(/\s+/g, '')}`;

    const shiftLabel =
      shift === '전체'
        ? '1편·2편 통합 전일 지시'
        : shift === '2편'
        ? '2편 주간 확정 (09:30 ~ 17:00)'
        : '1편 야간 확정 (17:00 ~ 마감)';

    // 타임테이블 행 렌더링
    const rowsHtml = filteredSchedule
      .map((t, idx) => {
        const isClean = t.type === '청소' || t.item.includes('세척') || t.item.includes('CIP');
        const isMeal = t.type === '휴게' || t.item.includes('중식') || t.item.includes('석식');
        const isSupport = t.type === '지원' || t.shift.includes('지원');
        const rowClass = isClean ? 'row-clean' : isMeal ? 'row-meal' : isSupport ? 'row-support' : idx % 2 === 1 ? 'row-alt' : '';

        const shiftBadgeClass = t.shift.includes('2편')
          ? 'badge-s2'
          : t.shift.includes('1편')
          ? 'badge-s1'
          : 'badge-other';

        const formattedQty = typeof t.qty === 'number' ? `${t.qty.toLocaleString()} ea` : t.qty || '-';
        const rBadge = getRiceColorBadge(t.item);
        const rTag = rBadge && t.type === '생산'
          ? `<span class="rice-tag ${rBadge.label === '빨간밥' ? 'rice-tag-red' : rBadge.label.includes('흑미') ? 'rice-tag-purple' : 'rice-tag-white'}">${escapeHtml(rBadge.label)}</span>`
          : '';
        const typeSafeClass = escapeHtml(t.type).replace(/[^a-zA-Z0-9가-힣_-]/g, '');

        return `
          <tr class="${rowClass}">
            <td class="col-center col-seq">${idx + 1}</td>
            <td class="col-center"><span class="badge ${shiftBadgeClass}">${escapeHtml(t.shift)}</span></td>
            <td class="col-center col-time">${escapeHtml(t.time)}</td>
            <td class="col-center"><span class="type-pill type-${typeSafeClass}">${escapeHtml(t.type)}</span></td>
            <td class="col-item">${rTag}${escapeHtml(t.item)}</td>
            <td class="col-right col-qty">${escapeHtml(formattedQty)}</td>
            <td class="col-center col-duration">${escapeHtml(t.duration)}</td>
            <td class="col-center col-workers">${escapeHtml(t.workers || '-')}</td>
            <td class="col-bom">${escapeHtml(t.bom || '-')}</td>
            <td class="col-ccp">${escapeHtml(t.ccp || '-')}</td>
            <td class="col-center col-check"><div class="check-box"></div></td>
            <td class="col-center col-assignee">${escapeHtml(t.assignee || '미지정')}</td>
          </tr>
        `;
      })
      .join('');

    // 하단 소요 원부자재 불출 현황 행 렌더링
    const materialRowsHtml =
      materials && materials.length > 0
        ? materials
            .slice(0, 6)
            .map((m, idx) => {
              const isSufficient = m.currentStock >= m.requiredQty;
              const whSafeClass = escapeHtml(m.warehouse).replace(/[^a-zA-Z0-9가-힣_-]/g, '');
              return `
              <tr>
                <td class="col-center" style="font-weight:700;">${idx + 1}</td>
                <td class="col-center"><span class="wh-tag wh-${whSafeClass}">${escapeHtml(m.warehouse)}</span></td>
                <td style="font-weight:700; color:#0f172a;">${escapeHtml(m.name)} <span style="font-weight:normal; font-size:9px; color:#64748b;">${m.spec ? `(${escapeHtml(m.spec)})` : ''}</span></td>
                <td class="col-right" style="font-family:monospace; font-weight:800; color:#1e3a8a;">${m.requiredQty.toLocaleString()} ${escapeHtml(m.unit)}</td>
                <td class="col-right" style="font-family:monospace; color:#475569;">${m.currentStock.toLocaleString()} ${escapeHtml(m.unit)}</td>
                <td class="col-center" style="font-weight:800; color:${isSufficient ? '#15803d' : '#b91c1c'};">${isSufficient ? '적합' : '부족'}</td>
                <td class="col-center"><div class="mini-sign">불출확인</div></td>
              </tr>
            `;
            })
            .join('')
        : `<tr><td colspan="7" class="col-center" style="color:#94a3b8; padding:8px;">등록된 소요 원부자재 배합 정보가 없습니다.</td></tr>`;

    const html = `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <title>[GFS] ${escapeHtml(selectedLine)}_일일작업지시서_${escapeHtml(safeWorkDate)}_${escapeHtml(shift)}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 6mm 8mm 6mm 8mm;
          }
          * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif;
          }
          body {
            margin: 0;
            padding: 0;
            color: #0f172a;
            background: #ffffff;
            font-size: 10px;
            line-height: 1.25;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .header-container {
            border: 2px solid #0f172a;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 7px;
            background: #f8fafc;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
          }
          .header-left {
            flex: 1;
            min-width: 0;
          }
          .company-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 2px;
          }
          .company-logo {
            font-size: 11px;
            font-weight: 900;
            background: #1e40af;
            color: #ffffff;
            padding: 1px 6px;
            border-radius: 3px;
            letter-spacing: -0.5px;
          }
          .company-name {
            font-size: 11px;
            font-weight: 800;
            color: #1e3a8a;
          }
          .haccp-pill {
            font-size: 9px;
            font-weight: 800;
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fca5a5;
            padding: 0 5px;
            border-radius: 3px;
          }
          .main-title {
            font-size: 16px;
            font-weight: 900;
            color: #0f172a;
            margin: 2px 0 3px 0;
            letter-spacing: -0.5px;
          }
          .doc-meta {
            font-size: 9px;
            color: #475569;
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
          }
          .doc-meta .sep {
            color: #cbd5e1;
          }

          /* 🌟 중앙 초강조 날짜 명판 (Prominent Date Plaque) 🌟 */
          .date-plaque {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            border: 2px solid #d97706;
            border-radius: 6px;
            padding: 6px 14px;
            text-align: center;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
            color: #ffffff;
            min-width: 260px;
            flex-shrink: 0;
          }
          .date-plaque-label {
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 1px;
            color: #fde047;
            text-transform: uppercase;
            margin-bottom: 1px;
          }
          .date-plaque-val {
            font-size: 16px;
            font-weight: 900;
            color: #ffffff;
            letter-spacing: -0.5px;
            line-height: 1.2;
          }
          .date-plaque-shift {
            margin-top: 2px;
          }
          .shift-badge-pill {
            display: inline-block;
            background: rgba(56, 189, 248, 0.2);
            color: #7dd3fc;
            border: 1px solid rgba(56, 189, 248, 0.4);
            padding: 1px 8px;
            border-radius: 9999px;
            font-size: 9px;
            font-weight: 800;
          }

          .header-right {
            flex-shrink: 0;
          }
          .approval-table {
            border-collapse: collapse;
            text-align: center;
            font-size: 9.5px;
          }
          .approval-table th, .approval-table td {
            border: 1px solid #475569;
            padding: 2px 6px;
          }
          .approval-table th {
            background: #e2e8f0;
            font-weight: 700;
            color: #1e293b;
            font-size: 9px;
          }
          .approval-table .appr-title {
            width: 24px;
            background: #cbd5e1;
            font-size: 9px;
            font-weight: 800;
          }
          .approval-table td {
            height: 34px;
            min-width: 44px;
            vertical-align: middle;
          }
          .sign-space {
            font-size: 8.5px;
            color: #94a3b8;
          }

          /* KPI 카드 5분할 */
          .kpi-row {
            display: flex;
            gap: 6px;
            margin-bottom: 7px;
          }
          .kpi-card {
            flex: 1;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            padding: 4px 8px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.03);
          }
          .kpi-card.highlight {
            background: #eff6ff;
            border-color: #93c5fd;
            border-left: 3px solid #2563eb;
          }
          .kpi-label {
            font-size: 9px;
            font-weight: 700;
            color: #64748b;
            margin-bottom: 1px;
          }
          .kpi-val {
            font-size: 13px;
            font-weight: 900;
            color: #0f172a;
            font-family: monospace;
          }
          .kpi-sub {
            font-size: 8.5px;
            color: #64748b;
            margin-top: 1px;
          }

          /* 타임테이블 */
          .work-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
            margin-bottom: 7px;
          }
          .work-table th, .work-table td {
            border: 1px solid #cbd5e1;
            padding: 3px 5px;
            line-height: 1.25;
          }
          .work-table th {
            background: #0f172a;
            color: #ffffff;
            font-weight: 800;
            font-size: 9.5px;
            text-align: center;
            padding: 5px 4px;
          }
          .work-table tr.row-alt {
            background: #f8fafc;
          }
          .work-table tr.row-clean {
            background: #fef3c7 !important;
            color: #92400e;
            font-weight: 700;
          }
          .work-table tr.row-meal {
            background: #f1f5f9 !important;
            color: #475569;
            font-weight: 700;
          }
          .work-table tr.row-support {
            background: #ede9fe !important;
            color: #5b21b6;
            font-weight: 700;
          }
          .col-center { text-align: center; }
          .col-right { text-align: right; }
          .col-seq { font-family: monospace; font-weight: 800; width: 28px; }
          .col-time { font-family: monospace; font-weight: 700; width: 85px; }
          .col-item { font-weight: 800; color: #0f172a; font-size: 10px; }
          .col-qty { font-family: monospace; font-weight: 900; color: #1e3a8a; width: 75px; }
          .col-duration { font-family: monospace; font-weight: 600; width: 50px; }
          .col-workers { font-weight: 700; width: 45px; }
          .col-bom { font-size: 9px; color: #334155; line-height: 1.2; }
          .col-ccp { font-size: 9px; color: #b91c1c; font-weight: 800; line-height: 1.2; width: 170px; }
          .col-check { width: 34px; }
          .col-assignee { font-weight: 700; width: 52px; font-size: 9px; }
          .check-box {
            width: 14px;
            height: 14px;
            border: 1.5px solid #94a3b8;
            border-radius: 2px;
            margin: auto;
            background: #ffffff;
          }

          /* 뱃지 */
          .badge {
            display: inline-block;
            padding: 1px 5px;
            border-radius: 3px;
            font-size: 8.5px;
            font-weight: 800;
          }
          .badge-s2 { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
          .badge-s1 { background: #fce7f3; color: #9d174d; border: 1px solid #fbcfe8; }
          .badge-other { background: #e2e8f0; color: #475569; border: 1px solid #cbd5e1; }
          .type-pill {
            display: inline-block;
            padding: 1px 4px;
            border-radius: 2px;
            font-size: 8.5px;
            font-weight: 700;
          }
          .type-생산 { background: #dcfce7; color: #166534; }
          .type-청소 { background: #fef3c7; color: #92400e; }
          .type-휴게 { background: #e2e8f0; color: #334155; }
          .type-지원 { background: #ede9fe; color: #5b21b6; }

          /* 하단 2열 그리드 */
          .bottom-grid {
            display: grid;
            grid-template-columns: 58% 42%;
            gap: 8px;
            margin-bottom: 6px;
          }
          .bottom-card {
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            background: #ffffff;
            padding: 6px 8px;
          }
          .bottom-title {
            font-size: 10px;
            font-weight: 900;
            color: #0f172a;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1.5px solid #0f172a;
            padding-bottom: 3px;
          }
          .mat-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
          }
          .mat-table th, .mat-table td {
            border: 1px solid #e2e8f0;
            padding: 2.5px 4px;
          }
          .mat-table th {
            background: #f1f5f9;
            font-weight: 700;
            color: #334155;
            text-align: center;
          }
          .wh-tag {
            display: inline-block;
            padding: 0.5px 4px;
            border-radius: 2px;
            font-size: 8px;
            font-weight: 800;
          }
          .wh-상온 { background: #e2e8f0; color: #334155; }
          .wh-냉장1, .wh-냉장2 { background: #cffafe; color: #155e75; }
          .wh-냉동 { background: #dbeafe; color: #1e40af; }
          .wh-부자재 { background: #fef3c7; color: #92400e; }
          .rice-tag {
            display: inline-block;
            font-size: 8px;
            font-weight: 800;
            padding: 0.5px 3.5px;
            border-radius: 2px;
            margin-right: 3px;
            vertical-align: middle;
          }
          .rice-tag-white { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
          .rice-tag-purple { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
          .rice-tag-red { background: #ffe4e6; color: #be123c; border: 1px solid #fecdd3; }
          .mini-sign {
            border: 1px dashed #94a3b8;
            padding: 1px 4px;
            font-size: 8px;
            color: #64748b;
            border-radius: 2px;
          }
          .haccp-rules-list {
            font-size: 9px;
            line-height: 1.45;
            color: #1e293b;
            margin: 0;
            padding-left: 14px;
          }
          .haccp-rules-list li {
            margin-bottom: 3px;
          }
          .haccp-rules-list strong {
            color: #b91c1c;
          }

          /* 푸터 */
          .footer-box {
            border-top: 1px solid #cbd5e1;
            padding-top: 5px;
            display: flex;
            justify-content: space-between;
            font-size: 8.5px;
            color: #64748b;
          }

          /* 인쇄 툴바 (화면 표시용) */
          .print-toolbar {
            background: #1e293b;
            color: #ffffff;
            padding: 8px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            border-radius: 6px;
          }
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; padding: 0; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <!-- 인쇄 툴바 -->
        <div class="print-toolbar no-print">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-weight:900; font-size:13px; color:#ffffff;">🖨️ A4 가로 인쇄 미리보기 (식약처 HACCP 공인 작업지시서)</span>
            <span style="background:#0284c7; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:800;">
              작업일자: ${formattedDateKo}
            </span>
            <span style="background:#334155; color:#cbd5e1; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">
              라인: ${selectedLine} (${shift})
            </span>
          </div>
          <div style="display:flex; gap:8px;">
            <button onclick="window.print()" style="padding:6px 16px; background:#2563eb; color:#fff; border:none; border-radius:5px; font-weight:900; font-size:12px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.3);">
              🖨️ 지금 인쇄 (PDF 저장)
            </button>
            <button onclick="window.close()" style="padding:6px 14px; background:#475569; color:#fff; border:none; border-radius:5px; font-weight:700; font-size:12px; cursor:pointer;">
              창 닫기
            </button>
          </div>
        </div>

        <!-- 1. 헤더: 좌측 회사정보/문서명 + 🌟중앙 초강조 날짜 명판🌟 + 우측 결재란 -->
        <div class="header-container">
          <div class="header-left">
            <div class="company-badge">
              <span class="company-logo">GFS</span>
              <span class="company-name">(주)지에프에스 스마트 ERP 생산관제 센터</span>
              <span class="haccp-pill">식약처 HACCP 공인 생산전표</span>
            </div>
            <div class="main-title">${department === 'SEONGHYEONG' ? '🍱 성형장' : '🍳 전처리실'}: ${selectedLine} 일일 생산 작업지시서</div>
            <div class="doc-meta">
              <span><strong>문서번호:</strong> ${escapeHtml(docNumber)}</span>
              <span class="sep">|</span>
              <span><strong>공정:</strong> ${department === 'SEONGHYEONG' ? '성형가공' : '원료전처리'}</span>
              <span class="sep">|</span>
              <span><strong>실수주 연동:</strong> ${
                realOrderMeta && realOrderMeta.hasRealOrders
                  ? `✅ ${realOrderMeta.totalDayQty.toLocaleString()} ea 확정`
                  : '표준 템플릿'
              }</span>
            </div>
          </div>

          <!-- 🌟 중앙 초강조 날짜 명판 (Prominent Date Plaque) 🌟 -->
          <div class="date-plaque">
            <div class="date-plaque-label">📅 작업 지시일자 (PRODUCTION DATE)</div>
            <div class="date-plaque-val">${escapeHtml(formattedDateKo)}</div>
            <div class="date-plaque-shift">
              <span class="shift-badge-pill">${escapeHtml(shiftLabel)}</span>
            </div>
          </div>

          <!-- 우측 4단 결재란 -->
          <div class="header-right">
            <table class="approval-table">
              <thead>
                <tr>
                  <th rowspan="2" class="appr-title">결<br/>재</th>
                  <th style="width:48px;">작 성</th>
                  <th style="width:48px;">검 토</th>
                  <th style="width:52px;">승 인</th>
                  <th style="width:56px;">공장장(전결)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><div class="sign-space">담당</div></td>
                  <td><div class="sign-space">반장</div></td>
                  <td><div class="sign-space">팀장</div></td>
                  <td><div class="sign-space">전결</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2. 핵심 KPI 5분할 카드 -->
        <div class="kpi-row">
          <div class="kpi-card highlight">
            <div class="kpi-label">일일 총 생산계획</div>
            <div class="kpi-val" style="color:#1d4ed8;">${escapeHtml(realOrderMeta?.lineTotalPlan || currentLine.totalPlan)}</div>
            <div class="kpi-sub">${
              realOrderMeta?.hasRealOrders
                ? `2편: ${(realOrderMeta.shift2Qty || 0).toLocaleString()} / 1편: ${(realOrderMeta.shift1Qty || 0).toLocaleString()}`
                : '1일 2교대 편성'
            }</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">라인 가동 시간대</div>
            <div class="kpi-val">${escapeHtml(
              scheduleTasks.length > 0
                ? `${scheduleTasks[0].time.split('~')[0].trim()} ~ ${scheduleTasks[scheduleTasks.length - 1].time.split('~')[1]?.trim() || '종료'}`
                : currentLine.totalTime
            )}</div>
            <div class="kpi-sub">총 소요 시간 관리</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">라인 생산속도 (UPH / 분당)</div>
            <div class="kpi-val" style="color:#059669;">${escapeHtml(currentLine.speed)}</div>
            <div class="kpi-sub">실측 목표 준수율 관리</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">소인화 투입인원</div>
            <div class="kpi-val" style="color:#b45309;">${escapeHtml(currentLine.personnel)}</div>
            <div class="kpi-sub">라인 오퍼레이터 및 패커</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">공정 및 품질책임자</div>
            <div class="kpi-val" style="color:#4f46e5;">${escapeHtml(currentLine.leadWorker)}</div>
            <div class="kpi-sub">HACCP 안전 관리자 겸임</div>
          </div>
        </div>

        <!-- 3. 실시간 제조 타임테이블 (식약처 HACCP 공인 규격) -->
        <table class="work-table">
          <thead>
            <tr>
              <th style="width:30px;">NO</th>
              <th style="width:45px;">구분</th>
              <th style="width:85px;">작업시간</th>
              <th style="width:40px;">유형</th>
              <th>지시 제품명 (규격/스펙)</th>
              <th style="width:75px;">지시수량</th>
              <th style="width:52px;">소요시간</th>
              <th style="width:45px;">작업인원</th>
              <th style="width:230px;">주요 원부자재 배합 기준 (BOM)</th>
              <th style="width:170px;">HACCP & CCP 핵심 관리기준</th>
              <th style="width:36px;">확인</th>
              <th style="width:50px;">담당자</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <!-- 4. 하단 2열 그리드: 좌측 소요 원부자재 불출 현황표 + 우측 식약처 HACCP 4대 중점관리수칙 -->
        <div class="bottom-grid">
          <!-- 좌측: 소요 원부자재 창고별 불출 지시서 -->
          <div class="bottom-card">
            <div class="bottom-title">
              <span>📦 소요 원부자재 창고별 불출 현황 (BOM 집계)</span>
              <span style="font-size:8.5px; font-weight:normal; color:#64748b;">(WMS 자동 연동 불출 전표)</span>
            </div>
            <table class="mat-table">
              <thead>
                <tr>
                  <th style="width:24px;">NO</th>
                  <th style="width:42px;">창고</th>
                  <th>원부자재명 (규격)</th>
                  <th style="width:65px;">소요량</th>
                  <th style="width:65px;">현재고</th>
                  <th style="width:38px;">상태</th>
                  <th style="width:48px;">확인</th>
                </tr>
              </thead>
              <tbody>
                ${materialRowsHtml}
              </tbody>
            </table>
          </div>

          <!-- 우측: 식약처 HACCP 4대 중점관리수칙 및 현장 안전 점검표 -->
          <div class="bottom-card">
            <div class="bottom-title">
              <span>🛡️ 식약처 HACCP 4대 중점관리수칙 및 현장 안전 점검</span>
              <span style="font-size:8.5px; font-weight:normal; color:#dc2626;">(필수 엄수)</span>
            </div>
            <ul class="haccp-rules-list">
              <li><strong>1. 가열공정 (CCP-1B):</strong> 가열육/패티 중심온도 85℃ 1분 이상 유지 (심온계 전수 측정 기록).</li>
              <li><strong>2. 금속검출 (CCP-2P):</strong> 매 30분 주기 정상 작동 점검 (Fe 2.0mm, SUS 3.0mm 테스트피스).</li>
              <li><strong>3. 교차오염 방지:</strong> 품목 교체 시 컨베이어 벨트 및 커터 칼날 70% 에탄올 소독 분무 필수.</li>
              <li><strong>4. 공정환경 관리:</strong> 청결구역 실내온도 15℃ 이하 유지 및 바닥 낙하 원자재 전량 즉시 폐기.</li>
            </ul>
            <div style="margin-top:6px; padding-top:4px; border-top:1px dashed #cbd5e1; display:flex; justify-content:space-between; align-items:center; font-size:8.5px;">
              <span style="color:#475569;">위생 및 안전 수칙 점검 완료:</span>
              <span style="font-weight:700; color:#0f172a;">작업조장 서명: ________________ (인)</span>
            </div>
          </div>
        </div>

        <!-- 5. 법적 고지 및 푸터 -->
        <div class="footer-box">
          <div>* 본 작업지시서는 식품위생법 제48조(해썹) 및 식약처 위해요소중점관리기준을 준수하여 작성된 정본 전표입니다.</div>
          <div>GFS 스마트 제조 생산관제 본부 (ERP Pipeline) | 인쇄일시: ${new Date().toLocaleDateString('ko-KR')} | 페이지 1 / 1</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // PDF 인쇄 (새 창 직접 열람 및 인쇄)
  const handleOpenPdf = (pdfUrl?: string) => {
    const target = pdfUrl || currentLine.pdfUrl || `/reports/work-orders/${encodeURIComponent(selectedLine)}.pdf`;
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

  // ── 글자 크기 유틸 ──
  const getFontClass = (type: 'th' | 'td' | 'input' | 'badge' | 'sub', isModal: boolean) => {
    if (!isModal) {
      if (type === 'th') return 'py-3 px-2 text-sm sm:text-base';
      if (type === 'td') return 'py-2.5 px-2 text-xs sm:text-sm';
      if (type === 'input') return 'text-xs sm:text-sm';
      if (type === 'badge') return 'text-xs sm:text-sm';
      return 'text-xs';
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

  // ── 일일 작업지시서 세로 상세표 렌더러 (기본 뷰 & 큰 팝업 공용) ──
  const renderTimetableContent = (isModal: boolean = false) => {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* 스마트 편집 상단 액션 바 */}
        <div className="bg-slate-100 border-b border-slate-300 px-4 py-2 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-1.5 font-black text-slate-800">
              <Sparkles size={16} className="text-blue-600" />
              <span>스마트 지시서 편집</span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs">
              <input
                type="checkbox"
                checked={autoCascadeTime}
                onChange={(e) => setAutoCascadeTime(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
              />
              <span>⏱️ 시간 연쇄 자동 계산</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs">
              <input
                type="checkbox"
                checked={autoCascadeOnReorder}
                onChange={(e) => setAutoCascadeOnReorder(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
              />
              <span>🔄 순서 이동 시 시간 자동 연동</span>
            </label>
            <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
              💡 작업시간·소요시간 변경 시 다음 순서 시간들이 연속 자동 계산됩니다.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleNudgeAll(-10)}
              className="px-2.5 py-1 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-xs transition-colors cursor-pointer"
              title="전체 스케줄 시간을 10분 앞당깁니다"
            >
              -10분
            </button>
            <button
              type="button"
              onClick={() => handleNudgeAll(10)}
              className="px-2.5 py-1 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-bold text-xs transition-colors cursor-pointer"
              title="전체 스케줄 시간을 10분 늦춥니다"
            >
              +10분
            </button>
            <button
              type="button"
              onClick={() => handleRecalculateAll()}
              className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-lg font-black text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="시작 시각부터 모든 작업을 5분 갭으로 순차 자동 정렬합니다"
            >
              <Clock size={13} />
              <span>전체 순차 자동 정렬</span>
            </button>
            <button
              type="button"
              onClick={handleSaveOrders}
              disabled={saving}
              className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-black text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save size={13} />
              <span>{saving ? '저장중...' : '지시 확정 저장'}</span>
            </button>
            {!isModal && (
              <button
                type="button"
                onClick={() => openLargeModal('TIMETABLE')}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                title="작업지시서를 큰 팝업창으로 확대하여 편하게 편집합니다"
              >
                <Maximize2 size={13} />
                <span>큰 팝업으로 보기</span>
              </button>
            )}
          </div>
        </div>

        {/* 스케줄 테이블 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
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
                          const rBadge = getRiceColorBadge(task.item);
                          if (!rBadge || task.type !== '생산') return null;
                          return (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-black border shrink-0 ${rBadge.bg}`}>
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
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── 소요 원부자재 불출·계량표 렌더러 (기본 뷰 & 큰 팝업 공용) ──
  const renderMaterialsContent = (isModal: boolean = false) => {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
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

      {/* 0. 상단 마스터 헤더 바 (메뉴명 100% 일치) */}
      <div className="h-[44px] bg-[#1e293b] text-white px-3.5 flex items-center justify-between border-b border-slate-900 select-none shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-4 bg-[#3b82f6] rounded-2xs shadow-xs" />
          <h1 className="text-[15px] font-black tracking-tight text-white">작업지시서 & 취반 타임테이블</h1>
          <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 font-bold">
            생산·제조 핵심
          </span>
        </div>
      </div>

      {/* 1. 상단 공정 대분류 스위처 및 작업 조건 바 */}
      <div className="bg-white border-b border-slate-300 px-6 py-3 shadow-xs shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* 좌측: [🍱 성형장 타임테이블] vs [🍳 전처리실 타임테이블] 대분류 토글 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-300 shadow-2xs">
              <button
                type="button"
                onClick={() => handleDepartmentChange('SEONGHYEONG')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm sm:text-base transition-all cursor-pointer ${
                  department === 'SEONGHYEONG'
                    ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                    : 'text-slate-700 hover:bg-slate-200/80 hover:text-slate-950'
                }`}
              >
                <span className="text-xl">🍱</span>
                <span>성형장 타임테이블</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
                    department === 'SEONGHYEONG'
                      ? 'bg-emerald-700 text-emerald-100'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  9개 라인
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleDepartmentChange('JEONCHEORI')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm sm:text-base transition-all cursor-pointer ${
                  department === 'JEONCHEORI'
                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                    : 'text-slate-700 hover:bg-slate-200/80 hover:text-slate-950'
                }`}
              >
                <span className="text-xl">🍳</span>
                <span>전처리실 타임테이블</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
                    department === 'JEONCHEORI'
                      ? 'bg-indigo-700 text-indigo-100'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  20개 설비
                </span>
              </button>
            </div>
          </div>

          {/* 우측: 날짜, 시프트, 검색, 액션 버튼들 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 작업일자 피커 & 실 수주 연동 상태 뱃지 */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500 flex items-center gap-1">
                <Calendar size={16} className="text-blue-600" /> 월/일:
              </span>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              {realOrderMeta && realOrderMeta.hasRealOrders ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>실 수주 연동 ({realOrderMeta.totalDayQty.toLocaleString()} ea / {realOrderMeta.distinctItemCount}품목)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 text-slate-600">
                  표준 템플릿
                </span>
              )}
              <button
                type="button"
                onClick={() => fetchServerWorkOrders(workDate, shift, selectedLine, true)}
                disabled={loading}
                title="수주 물량이 입력/변경되었을 때 최신 수주 데이터를 즉시 반영하여 작업지시서를 재계산합니다."
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
                <span>수주 동기화</span>
              </button>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 shadow-2xs transition-all cursor-pointer"
                title="과장님 확인 요청서 기준값(UPH 속도, 09:25 선가동, 취반/전처리 역산 시간)을 화면에서 보고 언제든 수정합니다."
              >
                <Gauge size={13} className="text-amber-400" />
                <span>현장 기준정보 설정</span>
              </button>
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

            {/* 인쇄 및 저장 버튼 그룹 */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-300">
              {/* 1. 라인 실시간 A4 인쇄 & PDF 저장 버튼 */}
              <button
                type="button"
                onClick={handlePrintLiveWorkOrder}
                title="현재 선택된 날짜와 시프트, 실 수주 수량이 반영된 A4 가로 작업지시서를 새 창으로 열어 즉시 인쇄 및 PDF로 저장합니다."
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Printer size={15} />
                <span>라인 PDF 인쇄</span>
                <ExternalLink size={12} className="opacity-75" />
              </button>

              {/* 2. 정본 PDF 파일 열기 */}
              <button
                type="button"
                onClick={() => handleOpenPdf()}
                title="이 라인의 공인 규격 PDF 문서를 새 창에서 엽니다."
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-black text-xs transition-all flex items-center gap-1 cursor-pointer"
              >
                <FileText size={14} className="text-blue-600" />
                <span>정본 PDF</span>
              </button>

              <button
                type="button"
                onClick={handleOpenMasterPdf}
                title="전라인 종합본 PDF를 인쇄합니다."
                className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Printer size={15} />
                <span>종합본 인쇄</span>
              </button>

              <button
                type="button"
                onClick={handleSaveOrders}
                disabled={saving}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save size={14} />
                <span>{saving ? '저장 중...' : '순서 저장'}</span>
              </button>

              <button
                type="button"
                onClick={() => void fetchServerWorkOrders(workDate, shift, selectedLine, true)}
                disabled={loading}
                title="최신 수주 데이터를 불러와 작업지시서를 새로고침합니다."
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl cursor-pointer transition-colors disabled:opacity-50"
              >
                <RotateCcw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 각 라인 및 작업실/설비 선택 칩 바 (Pills Bar) */}
      <div className="bg-slate-100/90 border-b border-slate-300 px-6 py-2.5 shrink-0 shadow-2xs">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
          <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 shrink-0 pr-3 border-r border-slate-300">
            <span>{department === 'SEONGHYEONG' ? '🍱 성형장 라인:' : '🍳 전처리 설비:'}</span>
          </div>

          {activeLineList.map((item) => {
            const isSelected = selectedLine === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedLine(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                  isSelected
                    ? department === 'SEONGHYEONG'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-300'
                      : 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300'
                    : 'bg-white hover:bg-slate-200/80 text-slate-800 border-slate-300 shadow-2xs'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.name}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-black ${
                    isSelected ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 라인 핵심 KPI 5분할 카드 바 렌더링 함수 */}
      {(() => {
        const shift2Qty = realOrderMeta?.shift2Qty || 0;
        const shift1Qty = realOrderMeta?.shift1Qty || 0;
        const totalQty = realOrderMeta?.totalDayQty || (shift2Qty + shift1Qty);
        const s2Pct = totalQty > 0 ? Math.round((shift2Qty / totalQty) * 100) : 55;
        const s1Pct = 100 - s2Pct;

        const startTime = scheduleTasks[0]?.time?.split('~')[0]?.trim() || currentLine.totalTime.split('~')[0]?.trim() || '09:25';
        const endTime = scheduleTasks[scheduleTasks.length - 1]?.time?.split('~')[1]?.trim() || currentLine.totalTime.split('~')[1]?.trim() || '20:23';
        const progressPct = stats.totalCount > 0 ? Math.round((stats.completedCount / stats.totalCount) * 100) : 0;

        const personnelParts = currentLine.personnel.split('(');
        const headcountMain = personnelParts[0].trim();
        const headcountSub = personnelParts[1] ? personnelParts[1].replace(')', '').trim() : '공정 편성';

        const speedMain = currentLine.speed.split('(')[0].trim();
        const speedSub = currentLine.speed.includes('(') ? currentLine.speed.match(/\((.*?)\)/)?.[1] : '정규 UPH 목표 속도';

        return (
          <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* KPI 1: 일일 총 생산계획 및 수주금액 연동 */}
              <div
                onClick={() => fetchServerWorkOrders(workDate, shift, selectedLine, true)}
                title="클릭 시 최신 수주 데이터를 즉시 다시 동기화합니다."
                className="group relative bg-gradient-to-br from-blue-50/95 via-white to-blue-50/40 border border-blue-200/90 hover:border-blue-400 rounded-2xl p-3 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
              >
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                      <PackageCheck size={17} />
                    </div>
                    <div className="text-[11px] font-black text-blue-900 tracking-tight truncate">일일 총 생산계획</div>
                  </div>
                  {realOrderMeta?.totalDayAmount ? (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-black animate-pulse shrink-0">
                      수주 100%
                    </span>
                  ) : (
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-black shrink-0">
                      표준 계획
                    </span>
                  )}
                </div>
                
                <div className="text-base sm:text-lg font-black tracking-tight text-blue-950 font-mono truncate my-0.5">
                  {realOrderMeta?.lineTotalPlan || currentLine.totalPlan}
                </div>

                {realOrderMeta?.hasRealOrders && (shift2Qty > 0 || shift1Qty > 0) ? (
                  <div className="mt-1">
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex" title={`2편: ${shift2Qty.toLocaleString()} ea (${s2Pct}%) | 1편: ${shift1Qty.toLocaleString()} ea (${s1Pct}%)`}>
                      <div style={{ width: `${s2Pct}%` }} className="bg-blue-600 h-full" />
                      <div style={{ width: `${s1Pct}%` }} className="bg-indigo-500 h-full" />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mt-1">
                      <span className="text-blue-700 font-extrabold">2편 {shift2Qty.toLocaleString()}</span>
                      <span className="text-indigo-700 font-extrabold">1편 {shift1Qty.toLocaleString()}</span>
                    </div>
                  </div>
                ) : null}

                {realOrderMeta?.totalDayAmount ? (
                  <div className="text-[10px] font-extrabold text-emerald-700 truncate mt-0.5">
                    수주금액: {realOrderMeta.totalDayAmount.toLocaleString()}원 (BOM 연동)
                  </div>
                ) : null}
              </div>

              {/* KPI 2: 가동 시간대 & 실시간 진척도 */}
              <div className="group bg-gradient-to-br from-slate-50/95 via-white to-slate-100/60 border border-slate-200 hover:border-slate-400 rounded-2xl p-3 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                      <Clock size={17} />
                    </div>
                    <div className="text-[11px] font-black text-slate-800 tracking-tight truncate">라인 가동 시간대</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-black shrink-0 ${
                    progressPct > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-700'
                  }`}>
                    진행률 {progressPct}%
                  </span>
                </div>

                <div className="text-base sm:text-lg font-black tracking-tight text-slate-900 font-mono truncate my-0.5">
                  {startTime} ~ {endTime}
                </div>

                <div className="mt-1">
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden" title={`완료 ${stats.completedCount}건 / 전체 ${stats.totalCount}건`}>
                    <div style={{ width: `${progressPct}%` }} className="bg-emerald-500 h-full transition-all duration-500" />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mt-1">
                    <span className="text-emerald-700 font-black">● 완료 {stats.completedCount}</span>
                    <span className="text-amber-700 font-black">● 진행 {stats.inProgressCount}</span>
                    <span className="text-slate-500 font-black">○ 대기 {stats.pendingCount}</span>
                  </div>
                </div>
              </div>

              {/* KPI 3: 라인 생산속도 (UPH) & 실측 설정 연결 */}
              <div
                onClick={() => setIsConfigModalOpen(true)}
                title="클릭 시 과장님 실측 UPH 및 교체 시간을 바로 수정합니다."
                className="group bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/40 border border-emerald-200/90 hover:border-emerald-400 rounded-2xl p-3 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
              >
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                      <Gauge size={17} />
                    </div>
                    <div className="text-[11px] font-black text-emerald-900 tracking-tight truncate">라인 속도 (UPH)</div>
                  </div>
                  <span className="text-[10px] bg-emerald-100 group-hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-black px-2 py-0.5 rounded-full transition shrink-0 flex items-center gap-0.5">
                    설정 ⚙️
                  </span>
                </div>

                <div className="text-base sm:text-lg font-black tracking-tight text-emerald-950 font-mono truncate my-0.5">
                  {speedMain}
                </div>

                <div className="mt-1">
                  <div className="text-[11px] font-bold text-slate-600 truncate">
                    {speedSub}
                  </div>
                  <div className="text-[10px] font-medium text-emerald-700 flex items-center gap-1 mt-0.5">
                    <span>⚡ 클릭 시 과장님 기준값 바로 수정</span>
                  </div>
                </div>
              </div>

              {/* KPI 4: 소인화 투입인원 */}
              <div className="group bg-gradient-to-br from-amber-50/95 via-white to-orange-50/40 border border-amber-200/90 hover:border-amber-400 rounded-2xl p-3 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                      <Users size={17} />
                    </div>
                    <div className="text-[11px] font-black text-amber-900 tracking-tight truncate">소인화 투입인원</div>
                  </div>
                  <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-black shrink-0">
                    표준 편성
                  </span>
                </div>

                <div className="text-base sm:text-lg font-black tracking-tight text-amber-950 truncate my-0.5">
                  {headcountMain}
                </div>

                <div className="mt-1">
                  <div className="text-[11px] font-bold text-amber-900/80 truncate">
                    {headcountSub}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    성형 및 포장 교대 인력 최적화
                  </div>
                </div>
              </div>

              {/* KPI 5: 공정 책임자 & 품질/CCP */}
              <div className="group bg-gradient-to-br from-indigo-50/95 via-white to-purple-50/40 border border-indigo-200/90 hover:border-indigo-400 rounded-2xl p-3 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                      <ShieldCheck size={17} />
                    </div>
                    <div className="text-[11px] font-black text-indigo-900 tracking-tight truncate">공정 관리 & CCP</div>
                  </div>
                  <span className="text-[10px] bg-indigo-100 text-indigo-900 border border-indigo-300 px-2 py-0.5 rounded-full font-black shrink-0">
                    HACCP 안전
                  </span>
                </div>

                <div className="text-base sm:text-lg font-black tracking-tight text-indigo-950 truncate my-0.5">
                  {currentLine.leadWorker}
                </div>

                <div className="mt-1">
                  <div className="text-[11px] font-bold text-indigo-900/80 truncate">
                    품온 10℃↓ • 가열육 ≥75℃
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    금속검출기 30분 주기 점검 엄수
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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

        <div className="flex items-center gap-3">
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

          {/* 큰 팝업으로 보기 버튼 */}
          <button
            type="button"
            onClick={() => openLargeModal()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-xs transition cursor-pointer shrink-0"
            title="이 상자를 큰 팝업창으로 확대해 보고 편집합니다."
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>큰 팝업으로 보기</span>
          </button>
        </div>
      </div>

      {/* 4. 메인 콘텐츠 영역 (선택된 탭에 따라 렌더링) */}
      <div className="flex-1 min-h-0 px-6 pb-5 pt-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 bg-white border border-slate-300 rounded-b-2xl rounded-tr-2xl shadow-sm overflow-hidden flex flex-col">
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
              <SpeedSimulatorView />
            </div>
          )}
          {/* TAB 2: 타임테이블 스케줄 테이블 (일일 작업지시서 - 스마트 편집 모드) */}
          {activeTab === 'TIMETABLE' && renderTimetableContent(false)}

          {/* TAB 3: 소요 원부자재 불출·계량표 */}
          {activeTab === 'MATERIALS' && renderMaterialsContent(false)}

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

      {/* 5. 큰 팝업 모달 (다른 페이지의 [큰 팝업으로 보기] 패턴 100% 계승) */}
      {isLargeModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4"
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

            {/* 팝업 내부 KPI 요약 바 (5대 핵심 지표 컴팩트 버전) */}
            {(() => {
              const startTime = scheduleTasks[0]?.time?.split('~')[0]?.trim() || currentLine.totalTime.split('~')[0]?.trim() || '09:25';
              const endTime = scheduleTasks[scheduleTasks.length - 1]?.time?.split('~')[1]?.trim() || currentLine.totalTime.split('~')[1]?.trim() || '20:23';
              const progressPct = stats.totalCount > 0 ? Math.round((stats.completedCount / stats.totalCount) * 100) : 0;
              const personnelParts = currentLine.personnel.split('(');
              const headcountMain = personnelParts[0].trim();
              const speedMain = currentLine.speed.split('(')[0].trim();

              return (
                <div className="bg-slate-50 border-b border-slate-300 px-5 py-2 shrink-0">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {/* 카드 1 */}
                    <div className="bg-white border border-blue-200 rounded-xl px-3 py-1.5 flex items-center gap-2.5 shadow-2xs">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <PackageCheck size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-blue-700 truncate">일일 총 생산계획</div>
                        <div className="text-xs font-black text-blue-950 font-mono truncate">
                          {realOrderMeta?.lineTotalPlan || currentLine.totalPlan}
                        </div>
                      </div>
                    </div>

                    {/* 카드 2 */}
                    <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2.5 shadow-2xs">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0">
                        <Clock size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-slate-600 truncate flex items-center gap-1">
                          <span>가동시간</span>
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded font-black">
                            {progressPct}%
                          </span>
                        </div>
                        <div className="text-xs font-black text-slate-900 font-mono truncate">
                          {startTime} ~ {endTime}
                        </div>
                      </div>
                    </div>

                    {/* 카드 3 */}
                    <div
                      onClick={() => setIsConfigModalOpen(true)}
                      className="bg-white border border-emerald-200 hover:border-emerald-400 rounded-xl px-3 py-1.5 flex items-center gap-2.5 shadow-2xs cursor-pointer transition"
                      title="클릭 시 과장님 기준정보 설정 창이 열립니다."
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Gauge size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-emerald-700 truncate flex items-center gap-1">
                          <span>라인 속도</span>
                          <span className="text-[9px] text-emerald-600 font-black">⚙️</span>
                        </div>
                        <div className="text-xs font-black text-emerald-950 font-mono truncate">
                          {speedMain}
                        </div>
                      </div>
                    </div>

                    {/* 카드 4 */}
                    <div className="bg-white border border-amber-200 rounded-xl px-3 py-1.5 flex items-center gap-2.5 shadow-2xs">
                      <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
                        <Users size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-amber-700 truncate">소인화 인원</div>
                        <div className="text-xs font-black text-amber-950 truncate">
                          {headcountMain}
                        </div>
                      </div>
                    </div>

                    {/* 카드 5 */}
                    <div className="bg-white border border-indigo-200 rounded-xl px-3 py-1.5 flex items-center gap-2.5 shadow-2xs col-span-2 sm:col-span-1">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <ShieldCheck size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-indigo-700 truncate">책임자 (HACCP)</div>
                        <div className="text-xs font-black text-indigo-950 truncate">
                          {currentLine.leadWorker}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

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
                  <SpeedSimulatorView />
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
