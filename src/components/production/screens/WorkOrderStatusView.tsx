'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ProductionActionBar } from '../common/ProductionActionBar';
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
  Sparkles,
  Warehouse as WarehouseIcon,
  Layers,
  ChefHat,
  Scissors,
  Flame,
  Search,
  Filter,
} from 'lucide-react';
import { usePipeline } from '@/context/PipelineContext';
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

// 11대 공정 라인 탭 목록 (생산현장.xlsx 기준)
const PREP_LINES = [
  { id: '커팅실', label: '커팅실', icon: Scissors, badge: '야채/소스 전처리' },
  { id: '취반', label: '취반기', icon: ChefHat, badge: '밥짓기' },
  { id: '조리', label: '조리실', icon: Flame, badge: '볶음/가열' },
  { id: '튀김', label: '튀김실', icon: Flame, badge: '오븐/까스' },
  { id: '계량', label: '계량실', icon: Layers, badge: '양념/분말' },
  { id: '채소', label: '채소실', icon: Scissors, badge: '세척/선별' },
  { id: '샐러드', label: '샐러드실', icon: ChefHat, badge: '토핑/믹싱' },
];

const FORMING_LINES = [
  { id: '삼각1', label: '삼각1호기', icon: Layers, badge: '삼각김밥' },
  { id: '삼각2', label: '삼각2호기', icon: Layers, badge: '삼각김밥' },
  { id: '삼각3', label: '삼각3호기', icon: Layers, badge: '더큰삼각' },
  { id: '김밥', label: '김밥라인', icon: Layers, badge: '줄김밥/무스비' },
  { id: '도시락', label: '도시락라인', icon: ChefHat, badge: '정식/한상' },
  { id: '조리빵', label: '조리빵라인', icon: ChefHat, badge: '샌드/버거' },
];

export const WorkOrderStatusView: React.FC = () => {
  const { openPipelineModal } = usePipeline();
  const { openPrintModal, setWorkOrderPayload } = usePrintReport();

  // 조회 조건
  const [workDate, setWorkDate] = useState('2026-11-04');
  const [shift, setShift] = useState<'1편' | '2편' | '전체'>('1편');
  const [selectedLine, setSelectedLine] = useState<string>('커팅실');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'aggregate' | 'detailed'>('aggregate');

  // 작업 데이터
  const [items, setItems] = useState<WorkOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

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
        setSaveToast('✨ 작업 순서와 상태가 성공적으로 저장되었습니다!');
        setTimeout(() => setSaveToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to save orders:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // [작업지시서(A4)] 인쇄 모달 열기 (현장 사진 양식 100% 매칭 데이터 주입)
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

  // 검색 필터 적용 목록
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

  // 집계 통계
  const stats = useMemo(() => {
    const totalCount = items.length;
    const totalQty = items.reduce((sum, i) => sum + (Number(i.orderQty) || 0), 0);
    const completedCount = items.filter((i) => i.status === '완료').length;
    const inProgressCount = items.filter((i) => i.status === '진행중').length;
    const progressRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    return { totalCount, totalQty, completedCount, inProgressCount, progressRate };
  }, [items]);

  return (
    <div className="flex flex-col h-full w-full bg-[#f8fafc] select-none text-[12px] font-sans">
      {/* 1. 상단 액션 바 */}
      <ProductionActionBar
        title="공정별 작업지시서 (현장 발행 및 순서 관리)"
        buttons={[
          {
            key: 'save',
            label: saving ? '저장중...' : '💾 순서 및 지시 저장',
            icon: 'save',
            onClick: handleSaveOrders,
          },
          {
            key: 'print',
            label: '🖨️ 작업지시서(A4)',
            icon: 'print',
            onClick: handleOpenPrint,
          },
          {
            key: 'refresh',
            label: '새로고침',
            icon: 'reset',
            onClick: () => void fetchWorkOrders(workDate, shift, selectedLine),
          },
        ]}
        helpContent="수주 및 BOM 레시피와 연동되어 각 라인(커팅실, 취반, 조리실 등)별 작업지시를 생성하고, 작업 순서(▲/▼)와 타임테이블을 현장 요구에 맞게 실시간 조정합니다."
      />

      {/* 저장 완료 알림 토스트 */}
      {saveToast && (
        <div className="absolute top-14 right-6 z-50 bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-xs font-bold animate-bounce">
          <CheckCircle2 size={16} />
          <span>{saveToast}</span>
        </div>
      )}

      {/* 2. 상단 라인 네비게이터 (생산현장.xlsx 11대 공정 라인) */}
      <div className="bg-white border-b border-slate-300 px-4 py-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 라인 선택 탭 그룹 */}
          <div className="flex items-center gap-4">
            {/* 전처리 및 조리 파트 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Scissors size={13} className="text-blue-600" /> 전처리·조리:
              </span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                {PREP_LINES.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLine(l.id)}
                    className={`px-3 py-1 rounded-md text-[11.5px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      selectedLine === l.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 성형 파트 */}
            <div className="flex items-center gap-1.5 pl-3 border-l border-slate-300">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <ChefHat size={13} className="text-indigo-600" /> 성형라인:
              </span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                {FORMING_LINES.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLine(l.id)}
                    className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      selectedLine === l.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    <span>{l.label}</span>
                  </button>
                ))}
                <button
                  onClick={() => setSelectedLine('ALL')}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold transition-all cursor-pointer ${
                    selectedLine === 'ALL'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  전체통합
                </button>
              </div>
            </div>
          </div>

          {/* 우측 종합 지표 뱃지 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-blue-50/70 border border-blue-200 px-3 py-1 rounded-lg">
              <span className="text-slate-500 text-[11px]">지시량 합계:</span>
              <span className="font-mono font-black text-blue-900 text-[13px]">
                {stats.totalQty.toLocaleString()}
              </span>
              <span className="text-blue-700 text-[11px]">
                {selectedLine === '도시락' || selectedLine.includes('삼각') || selectedLine === '김밥'
                  ? 'ea'
                  : 'g / kg'}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-emerald-50/70 border border-emerald-200 px-3 py-1 rounded-lg">
              <span className="text-slate-500 text-[11px]">작업 진행률:</span>
              <span className="font-mono font-black text-emerald-800 text-[13px]">
                {stats.progressRate}%
              </span>
              <span className="text-emerald-700 text-[11px]">
                ({stats.completedCount}/{stats.totalCount}건)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 조회 제어 리본 (일자, 편수, 검색, 모드 스위치) */}
      <div className="bg-white border-b border-slate-300 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          {/* 작업일자 */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <Calendar size={14} className="text-blue-600" />
              월/일:
            </span>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="bg-slate-50 border border-slate-300 px-2.5 py-1 rounded text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 cursor-pointer"
            />
          </div>

          {/* 시프트명 (편수) */}
          <div className="flex items-center gap-1.5 pl-3 border-l border-slate-300">
            <span className="font-bold text-slate-700">시프트명:</span>
            <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-300">
              {(['1편', '2편', '전체'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setShift(s)}
                  className={`px-3 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                    shift === s
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* 검색창 */}
          <div className="relative pl-3 border-l border-slate-300">
            <Search size={13} className="absolute left-5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="품목명, 창고명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-3 py-1 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 w-48"
            />
          </div>
        </div>

        {/* 안내 뱃지 */}
        <div className="flex items-center gap-2 text-[11.5px] text-slate-600">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>
            선택 라인: <strong className="text-blue-800 font-bold">{selectedLine}</strong> | BOM 기준 로스율·수율 자동 반영됨
          </span>
        </div>
      </div>

      {/* 4. 상단 시각적 타임테이블 (시간표 간트 차트 바) */}
      <div className="bg-white border-b border-slate-300 px-4 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-blue-600" />
            <span className="font-extrabold text-slate-800 text-[12px]">
              {selectedLine} 하루 작업 타임테이블 (06:00 ~ 19:00)
            </span>
            <span className="text-[11px] text-slate-500">
              * 순서(▲/▼)를 변경하면 타임테이블 시간이 자동으로 연동 재배치됩니다.
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-500 font-bold">
            총 {filteredItems.length}개 작업 세션
          </span>
        </div>

        {/* 타임라인 바 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 min-h-[38px]">
          {filteredItems.length === 0 ? (
            <span className="text-[11px] text-slate-400 py-1">편성된 작업 일정이 없습니다.</span>
          ) : (
            filteredItems.map((item) => {
              const statusColor =
                item.status === '완료'
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : item.status === '진행중'
                  ? 'bg-amber-500 text-white border-amber-600 animate-pulse'
                  : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-blue-50';

              return (
                <div
                  key={item.id}
                  className={`shrink-0 px-2.5 py-1 rounded-md border text-[11px] flex items-center gap-1.5 shadow-2xs transition-all ${statusColor}`}
                >
                  <span className="font-mono font-black opacity-80">#{item.workSeq}</span>
                  <span className="font-bold truncate max-w-[130px]">{item.productName}</span>
                  <span className="font-mono text-[10px] opacity-85">({item.timeRange})</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 5. 메인 작업지시서 테이블 (사진 양식 100% 매칭 + 순서 제어) */}
      <div className="flex-1 min-h-0 p-3 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 bg-white border border-slate-300 rounded-lg shadow-xs overflow-hidden flex flex-col">
          {/* 테이블 상단 헤더 (현장 사진과 동일 표기) */}
          <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-300 flex items-center justify-between">
            <div className="flex items-center gap-6 text-[12.5px]">
              <div>
                <span className="text-slate-500 font-medium">라인명: </span>
                <span className="font-black text-blue-900 text-sm">{selectedLine}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">월/일: </span>
                <span className="font-bold text-slate-900">{workDate}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">시프트명: </span>
                <span className="font-black text-emerald-800">{shift}</span>
              </div>
            </div>

            <div className="text-[11.5px] text-slate-600 flex items-center gap-3">
              <span>
                화살표 <strong className="text-blue-700 font-mono">▲ / ▼</strong>를 눌러 일의 순서를 자유롭게 조정할 수 있습니다.
              </span>
            </div>
          </div>

          {/* 테이블 그리드 영역 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold text-slate-600">BOM 레시피를 전개하여 작업지시를 산출 중입니다...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <AlertCircle className="w-8 h-8 text-slate-300" />
                <span className="text-sm font-semibold text-slate-600">
                  선택하신 라인({selectedLine})에 편성된 작업지시 품목이 없습니다.
                </span>
                <span className="text-xs text-slate-400">
                  상단 라인 탭(커팅실, 취반, 조리실 등)을 클릭하시거나 다른 일자를 선택해 주세요.
                </span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-[12px]">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-300 text-center">
                  <tr>
                    <th className="py-2 px-1 w-20">순서 (조정)</th>
                    <th className="py-2 px-3 text-left">제품명 (자재명)</th>
                    <th className="py-2 px-2 w-28">창고명</th>
                    <th className="py-2 px-2 w-20">규격/단위</th>
                    <th className="py-2 px-2 text-right w-24">지시량</th>
                    <th className="py-2 px-2 w-28">로스율(수율)</th>
                    <th className="py-2 px-2 text-right w-20">현재고</th>
                    <th className="py-2 px-2 w-32">작업시간</th>
                    <th className="py-2 px-2 w-24">완료여부</th>
                    <th className="py-2 px-2 w-28">담당자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredItems.map((item, idx) => {
                    // 창고 뱃지 색상
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
                    const statusClass =
                      item.status === '완료'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : item.status === '진행중'
                        ? 'bg-amber-100 text-amber-800 border-amber-300 font-black'
                        : 'bg-slate-100 text-slate-600 border-slate-300';

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-blue-50/50 transition-colors ${
                          item.status === '완료' ? 'bg-slate-50/60 opacity-80' : ''
                        }`}
                      >
                        {/* 1. 순서 및 위/아래 이동 제어 */}
                        <td className="py-2 px-1 text-center font-mono">
                          <div className="flex items-center justify-center gap-1">
                            <span className="font-black text-slate-900 w-5">{item.workSeq}</span>
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => moveItem(idx, 'UP')}
                                disabled={idx === 0}
                                title="위로 순서 올리기"
                                className="p-0.5 hover:bg-blue-100 text-slate-600 hover:text-blue-700 disabled:opacity-20 cursor-pointer rounded"
                              >
                                <ArrowUp size={11} />
                              </button>
                              <button
                                onClick={() => moveItem(idx, 'DOWN')}
                                disabled={idx === filteredItems.length - 1}
                                title="아래로 순서 내리기"
                                className="p-0.5 hover:bg-blue-100 text-slate-600 hover:text-blue-700 disabled:opacity-20 cursor-pointer rounded"
                              >
                                <ArrowDown size={11} />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* 2. 제품명 (자재명) */}
                        <td className="py-2 px-3 text-left">
                          <div className="flex flex-col">
                            <span className="font-extrabold text-slate-900 text-[12.5px]">
                              {item.productName}
                            </span>
                            <span className="text-[10.5px] text-slate-400 font-mono">
                              코드: {item.productCode || `PRD-${item.productId}`}
                            </span>
                          </div>
                        </td>

                        {/* 3. 창고명 (사진 양식 100% 매칭: 냉장창고2 등) */}
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-bold text-[11px] border ${whColor}`}
                          >
                            <WarehouseIcon size={11} />
                            <span>{item.warehouseName || '냉장창고2'}</span>
                          </span>
                        </td>

                        {/* 4. 규격/단위 */}
                        <td className="py-2 px-2 text-center font-mono text-slate-700">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
                            {item.unit || 'g'}
                          </span>
                        </td>

                        {/* 5. 지시량 (로스율 계산 반영 투입량) */}
                        <td className="py-2 px-2 text-right font-mono font-black text-indigo-950 text-[13px]">
                          {Number(item.orderQty || 0).toLocaleString()}
                        </td>

                        {/* 6. 로스율 / 수율 */}
                        <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-600">
                          <span className="text-amber-700 font-semibold">로스 {item.lossRate}%</span>
                          <span className="text-slate-400 text-[10px] ml-1">(수율 {item.yieldRate}%)</span>
                        </td>

                        {/* 7. 현재고 */}
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-600 text-[11px]">
                          {Number(item.stockQty || 0).toLocaleString()}
                        </td>

                        {/* 8. 작업시간 (타임테이블) */}
                        <td className="py-2 px-2 text-center font-mono text-[11px]">
                          <span className="bg-blue-50 text-blue-900 border border-blue-200 px-2 py-0.5 rounded font-bold">
                            {item.timeRange || '06:00 ~ 07:30'}
                          </span>
                        </td>

                        {/* 9. 완료여부 (클릭 토글 버튼) */}
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => toggleStatus(idx)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer transition-all ${statusClass}`}
                          >
                            {item.status === '완료' && '✓ 완료'}
                            {item.status === '진행중' && '⏳ 진행중'}
                            {item.status === '대기' && '대기'}
                          </button>
                        </td>

                        {/* 10. 담당자 */}
                        <td className="py-2 px-2 text-center">
                          <input
                            type="text"
                            value={item.assignee || '김반장'}
                            onChange={(e) => updateAssignee(idx, e.target.value)}
                            className="w-20 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-center text-[11px] font-bold text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 테이블 하단 합계 요약 바 */}
          <div className="bg-slate-100 px-4 py-2 border-t border-slate-300 flex items-center justify-between text-xs font-bold text-slate-700">
            <div>
              <span>총 지시품목: </span>
              <span className="font-mono text-blue-800 text-[13px]">{filteredItems.length}</span>
              <span>건</span>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <span>총 소요/지시량 합계: </span>
                <span className="font-mono text-indigo-900 text-sm font-black">
                  {stats.totalQty.toLocaleString()}
                </span>
                <span className="text-slate-500 text-[11px] ml-1">
                  {selectedLine === '도시락' || selectedLine.includes('삼각') || selectedLine === '김밥'
                    ? 'ea'
                    : 'g / kg'}
                </span>
              </div>
              <button
                onClick={handleSaveOrders}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow-xs cursor-pointer flex items-center gap-1 text-[11.5px]"
              >
                <Save size={13} />
                <span>순서 저장</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
