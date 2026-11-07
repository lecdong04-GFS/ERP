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
  const fetchServerWorkOrders = useCallback(async (date: string, sft: string, line: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/production/work-order?workDate=${date}&shift=${sft}&line=${encodeURIComponent(line)}`
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
          shift2Qty: json.shift2Qty || 0,
          shift1Qty: json.shift1Qty || 0,
          distinctItemCount: json.distinctItemCount || json.data.length,
          lineTotalPlan: json.lineTotalPlan,
        });
      } else {
        setScheduleTasks(currentLine.schedule.map((s) => ({ ...s })));
        setMaterials(currentLine.materials.map((m) => ({ ...m })));
        setRealOrderMeta(null);
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

  // 1. A4 가로 실시간 작업지시서 즉시 브라우저 인쇄 & PDF 저장 (실 수주량 반영)
  const handlePrintLiveWorkOrder = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      // 팝업 차단된 경우 정본 PDF 열기
      window.open(currentLine.pdfUrl || `/reports/work-orders/${encodeURIComponent(selectedLine)}.pdf`, '_blank');
      return;
    }

    // 작업일자 한글 요일 서식 포맷 (예: 2026년 11월 04일 (수요일))
    const dateParts = (workDate || '2026-11-04').split('-');
    const year = dateParts[0] || '2026';
    const month = dateParts[1] || '11';
    const day = dateParts[2] || '04';
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

        return `
          <tr class="${rowClass}">
            <td class="col-center col-seq">${idx + 1}</td>
            <td class="col-center"><span class="badge ${shiftBadgeClass}">${t.shift}</span></td>
            <td class="col-center col-time">${t.time}</td>
            <td class="col-center"><span class="type-pill type-${t.type}">${t.type}</span></td>
            <td class="col-item">${t.item}</td>
            <td class="col-right col-qty">${formattedQty}</td>
            <td class="col-center col-duration">${t.duration}</td>
            <td class="col-center col-workers">${t.workers || '-'}</td>
            <td class="col-bom">${t.bom || '-'}</td>
            <td class="col-ccp">${t.ccp || '-'}</td>
            <td class="col-center col-check"><div class="check-box"></div></td>
            <td class="col-center col-assignee">${t.assignee || '미지정'}</td>
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
              return `
              <tr>
                <td class="col-center" style="font-weight:700;">${idx + 1}</td>
                <td class="col-center"><span class="wh-tag wh-${m.warehouse}">${m.warehouse}</span></td>
                <td style="font-weight:700; color:#0f172a;">${m.name} <span style="font-weight:normal; font-size:9px; color:#64748b;">${m.spec ? `(${m.spec})` : ''}</span></td>
                <td class="col-right" style="font-family:monospace; font-weight:800; color:#1e3a8a;">${m.requiredQty.toLocaleString()} ${m.unit}</td>
                <td class="col-right" style="font-family:monospace; color:#475569;">${m.currentStock.toLocaleString()} ${m.unit}</td>
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
        <title>[GFS] ${selectedLine}_일일작업지시서_${workDate}_${shift}</title>
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
              <span><strong>문서번호:</strong> ${docNumber}</span>
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
            <div class="date-plaque-val">${formattedDateKo}</div>
            <div class="date-plaque-shift">
              <span class="shift-badge-pill">${shiftLabel}</span>
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
            <div class="kpi-val" style="color:#1d4ed8;">${realOrderMeta?.lineTotalPlan || currentLine.totalPlan}</div>
            <div class="kpi-sub">${
              realOrderMeta?.hasRealOrders
                ? `2편: ${(realOrderMeta.shift2Qty || 0).toLocaleString()} / 1편: ${(realOrderMeta.shift1Qty || 0).toLocaleString()}`
                : '1일 2교대 편성'
            }</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">라인 가동 시간대</div>
            <div class="kpi-val">${
              scheduleTasks.length > 0
                ? `${scheduleTasks[0].time.split('~')[0].trim()} ~ ${scheduleTasks[scheduleTasks.length - 1].time.split('~')[1]?.trim() || '종료'}`
                : currentLine.totalTime
            }</div>
            <div class="kpi-sub">총 소요 시간 관리</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">라인 생산속도 (UPH / 분당)</div>
            <div class="kpi-val" style="color:#059669;">${currentLine.speed}</div>
            <div class="kpi-sub">실측 목표 준수율 관리</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">소인화 투입인원</div>
            <div class="kpi-val" style="color:#b45309;">${currentLine.personnel}</div>
            <div class="kpi-sub">라인 오퍼레이터 및 패커</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">공정 및 품질책임자</div>
            <div class="kpi-val" style="color:#4f46e5;">${currentLine.leadWorker}</div>
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

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-slate-800 font-sans">
      {/* 알림 토스트 */}
      {saveToast && (
        <div className="fixed top-16 right-8 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-bold animate-bounce">
          <CheckCircle2 size={18} />
          <span>{saveToast}</span>
        </div>
      )}

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
                onClick={() => {
                  setScheduleTasks(currentLine.schedule.map((s) => ({ ...s })));
                  setMaterials(currentLine.materials.map((m) => ({ ...m })));
                  void fetchServerWorkOrders(workDate, shift, selectedLine);
                }}
                title="새로고침"
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl cursor-pointer transition-colors"
              >
                <RotateCcw size={15} />
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

      {/* 3. 상단 라인 핵심 KPI 카드 바 (생산계획, 가동시간, UPH속도, 투입인원, 공정책임자) */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* KPI 1: 일일 총 생산계획 */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl px-3.5 py-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <PackageCheck size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-blue-700 truncate">일일 총 생산계획</div>
              <div className="text-sm font-black text-blue-950 truncate">
                {realOrderMeta?.lineTotalPlan || currentLine.totalPlan}
              </div>
            </div>
          </div>

          {/* KPI 2: 가동 시간대 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-slate-600 truncate">라인 가동 시간대</div>
              <div className="text-sm font-black text-slate-900 truncate">
                {scheduleTasks.length > 0 && scheduleTasks[0].time && scheduleTasks[scheduleTasks.length - 1].time
                  ? `${scheduleTasks[0].time.split('~')[0].trim()} ~ ${scheduleTasks[scheduleTasks.length - 1].time.split('~')[1]?.trim() || '종료'}`
                  : currentLine.totalTime}
              </div>
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
