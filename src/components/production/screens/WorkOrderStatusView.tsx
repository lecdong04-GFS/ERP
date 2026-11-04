'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ProductionActionBar } from '../common/ProductionActionBar';
import { ProductionDataGrid, ProductionGridColumnDef } from '../common/ProductionDataGrid';
import { GYE_MASTER_LIST, GyeMasterItem } from '../data/productionMasterData';
import { Calendar, Search, RefreshCw, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { usePipeline } from '@/context/PipelineContext';
import { usePrintReport } from '@/context/PrintReportContext';

interface WorkOrderDetail {
  id: number;
  gyeId: string;
  gyeName: string;
  lineName: string;
  workSeq: number;
  partName: string;
  partSpec: string;
  unit: string;
  nextProcess: string;
  totalOrderQty: number;
  orderQty: number;
  orderQty1?: number;
  orderQty2?: number;
  prodQty: number;
  status: string;
  completeTime: string;
}

export const WorkOrderStatusView: React.FC = () => {
  const { openPipelineModal } = usePipeline();
  const { openPrintModal } = usePrintReport();

  // 날짜 및 편수 필터
  const [workDate, setWorkDate] = useState('2026-11-04');
  const [shift, setShift] = useState<'전체' | '1편' | '2편'>('전체');
  const [selectedGyeId, setSelectedGyeId] = useState<string>('ALL'); // 기본값: 전체 공정 통합보기
  const [workOrders, setWorkOrders] = useState<WorkOrderDetail[]>([]);
  const [loading, setLoading] = useState(false);

  // 작업지시 데이터 로드
  const fetchWorkOrders = useCallback(async (date: string, sft: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/production/work-order?workDate=${date}&shift=${sft}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const loaded: WorkOrderDetail[] = json.data.map((w: any, idx: number) => ({
          id: w.id || idx + 1,
          gyeId: w.gyeId || 'GFS004',
          gyeName: w.gyeName || w.gye?.name || '성형장',
          lineName: w.gyeName || '작업라인',
          workSeq: w.workSeq || idx + 1,
          partName: w.productName || w.product?.name || '제품',
          partSpec: w.spec || w.product?.spec || '1ea',
          unit: w.unit || w.product?.unit || 'ea',
          nextProcess: w.nextProcess || '포장/검품',
          totalOrderQty: Number(w.orderQty) || 0,
          orderQty: Number(w.orderQty) || 0,
          prodQty: Number(w.prodQty) || Math.round((Number(w.orderQty) || 0) * 0.98),
          status: w.status || '진행중',
          completeTime: w.completeTime || '10:30',
        }));
        setWorkOrders(loaded);
        if (json.workDate && json.workDate !== date) {
          setWorkDate(json.workDate);
        }
      } else {
        setWorkOrders([]);
      }
    } catch (err) {
      console.error('Failed to load work orders:', err);
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkOrders(workDate, shift);
  }, [fetchWorkOrders, workDate, shift]);

  // 공정(계)별 작업지시 수량 집계 맵
  const countsByGye = useMemo(() => {
    const map: Record<string, { count: number; totalQty: number }> = {};
    for (const wo of workOrders) {
      if (!map[wo.gyeId]) {
        map[wo.gyeId] = { count: 0, totalQty: 0 };
      }
      map[wo.gyeId].count += 1;
      map[wo.gyeId].totalQty += wo.totalOrderQty;
    }
    return map;
  }, [workOrders]);

  // 좌측 계 마스터 목록 (전체 항목 추가)
  const gyeMenuList = useMemo(() => {
    const totalCount = workOrders.length;
    const totalQty = workOrders.reduce((sum, w) => sum + w.totalOrderQty, 0);

    const allItem = {
      no: 0,
      id: 'ALL',
      name: '🌟 전체 공정 (통합)',
      count: totalCount,
      totalQty,
    };

    const items = GYE_MASTER_LIST.map((item) => {
      const stat = countsByGye[item.id] || { count: 0, totalQty: 0 };
      return {
        ...item,
        count: stat.count,
        totalQty: stat.totalQty,
      };
    });

    // 주문이 있는 공정을 위로 정렬하되, 전체는 항상 맨 위
    const withOrders = items.filter((i) => i.count > 0);
    const withoutOrders = items.filter((i) => i.count === 0);

    return [allItem, ...withOrders, ...withoutOrders];
  }, [workOrders, countsByGye]);

  // 우측 그리드에 표시할 데이터 (선택된 공정에 따라 필터)
  const displayDetails = useMemo(() => {
    if (selectedGyeId === 'ALL') {
      return workOrders;
    }
    return workOrders.filter((w) => w.gyeId === selectedGyeId);
  }, [workOrders, selectedGyeId]);

  // 현재 선택된 공정 명칭
  const currentGyeLabel = useMemo(() => {
    if (selectedGyeId === 'ALL') return '전체 공정 (통합)';
    const found = GYE_MASTER_LIST.find((g) => g.id === selectedGyeId);
    return found ? `${found.id} - ${found.name}` : selectedGyeId;
  }, [selectedGyeId]);

  // 우측 그리드 컬럼 정의
  const RIGHT_COLUMNS: ProductionGridColumnDef[] = [
    {
      key: 'gyeName',
      label: '공정(계) / 라인',
      width: '130px',
      align: 'left',
      render: (val, row) => (
        <span className="font-semibold text-slate-800">
          {val || row.lineName}
        </span>
      ),
    },
    {
      key: 'workSeq',
      label: '순서',
      width: '55px',
      align: 'center',
      format: 'number',
    },
    {
      key: 'partName',
      minWidth: '280px',
      label: '생산 품목명 (파트명)',
      align: 'left',
      render: (val) => (
        <span className="font-bold text-slate-900">{val}</span>
      ),
    },
    {
      key: 'partSpec',
      label: '규격',
      width: '90px',
      align: 'center',
    },
    {
      key: 'unit',
      label: '단위',
      width: '50px',
      align: 'center',
    },
    {
      key: 'totalOrderQty',
      label: '총 수주량',
      width: '95px',
      align: 'right',
      format: 'number',
      render: (val) => (
        <span className="font-bold text-blue-900 font-mono">
          {Number(val || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'orderQty',
      label: '작업지시량',
      width: '95px',
      align: 'right',
      format: 'number',
      render: (val) => (
        <span className="font-extrabold text-indigo-900 font-mono">
          {Number(val || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'prodQty',
      label: '목표생산량',
      width: '95px',
      align: 'right',
      format: 'number',
      render: (val) => (
        <span className="font-bold text-emerald-800 font-mono">
          {Number(val || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'nextProcess',
      label: '다음공정',
      width: '110px',
      align: 'left',
      render: (val) => (
        <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-slate-200">
          {val || '포장/검품'}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      width: '75px',
      align: 'center',
      render: (val) => (
        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          {val || '진행중'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <ProductionActionBar
        title="작업지시현황"
        buttons={[
          {
            key: 'pipeline',
            label: '⚡자동파이프라인',
            icon: 'list',
            onClick: openPipelineModal,
          },
          {
            key: 'print1',
            label: '작업지시서(A4)',
            icon: 'print',
            onClick: () => openPrintModal('WORK_ORDER'),
          },
          {
            key: 'refresh',
            label: '새로고침',
            icon: 'reset',
            onClick: () => void fetchWorkOrders(workDate, shift),
          },
          {
            key: 'print2',
            label: '수량집계표',
            icon: 'list',
            onClick: () => openPrintModal('WORK_ORDER'),
          },
        ]}
        helpContent="수주 엑셀(본발주, 1편주문, 슈퍼)에 따라 성형라인(도시락, 김밥, 삼각김밥, 샌드/버거) 및 취반·조리 공정별 일일 작업지시 수량을 실시간 관리합니다."
      />

      {/* 2. 조회 조건바 */}
      <div className="bg-white border-b border-slate-300 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-5">
          {/* 작업지시일 선택 */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 flex items-center gap-1.5 text-[12.5px]">
              <Calendar size={15} className="text-blue-600" />
              작업지시일자:
            </span>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="bg-slate-50 border border-slate-300 px-2.5 py-1 text-[12px] font-bold text-slate-800 rounded shadow-xs focus:bg-white focus:border-blue-500 focus:outline-none cursor-pointer"
            />
            <button
              onClick={() => void fetchWorkOrders(workDate, shift)}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow-xs flex items-center gap-1 text-[11.5px] cursor-pointer"
            >
              <Search size={13} />
              <span>조회</span>
            </button>
          </div>

          {/* 편수 선택 */}
          <div className="flex items-center gap-2 pl-4 border-l border-slate-300">
            <span className="font-bold text-slate-700 text-[12.5px]">편수:</span>
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300">
              {(['전체', '1편', '2편'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setShift(s)}
                  className={`px-3 py-1 rounded-md text-[11.5px] font-bold transition-all cursor-pointer ${
                    shift === s
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 종합 KPI 요약 뱃지 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11.5px] bg-slate-100 px-3 py-1 rounded-lg border border-slate-300">
            <span className="text-slate-500">선택 공정:</span>
            <span className="font-extrabold text-blue-800">{currentGyeLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
            <span className="text-blue-700 font-bold">총 작업지시:</span>
            <span className="font-black text-blue-900 font-mono text-[13px]">
              {displayDetails.reduce((sum, d) => sum + d.orderQty, 0).toLocaleString()}
            </span>
            <span className="text-blue-600 text-[11px]">개 ({displayDetails.length}개 품목)</span>
          </div>
        </div>
      </div>

      {/* 3. 좌우 2분할 레이아웃 (좌측 공정 목록 : 우측 세부 작업지시 그리드) */}
      <div className="flex-1 flex min-h-0 p-2.5 gap-2.5 overflow-hidden">
        {/* 좌측: 공정(계) 마스터 목록 */}
        <div className="w-[280px] flex flex-col min-h-0 bg-white border border-slate-300 rounded-lg shadow-xs shrink-0 overflow-hidden">
          <div className="bg-slate-100 px-3 py-2 flex items-center justify-between border-b border-slate-200">
            <span className="font-bold text-slate-800 text-[12px] flex items-center gap-1.5">
              <span>제조 공정(계) 분류</span>
            </span>
            <span className="text-[11px] font-mono text-slate-600 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
              {gyeMenuList.filter((g) => g.count > 0 && g.id !== 'ALL').length}개 라인 가동
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
            {gyeMenuList.map((item) => {
              const isSelected = selectedGyeId === item.id;
              const hasOrders = item.count > 0;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedGyeId(item.id)}
                  className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-100/90 text-blue-950 font-black border-l-4 border-blue-600 pl-2'
                      : hasOrders
                      ? 'bg-blue-50/40 hover:bg-blue-100/50 text-slate-900 font-bold'
                      : 'hover:bg-slate-50 text-slate-500 font-normal'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[11px] font-mono text-slate-400">
                      {item.id === 'ALL' ? '★' : item.id}
                    </span>
                    <span className="truncate text-[12px]">{item.name}</span>
                  </div>

                  {hasOrders ? (
                    <span
                      className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-100 text-blue-800 border border-blue-300'
                      }`}
                    >
                      {item.count}건
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-300 font-mono">-</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 우측: 세부 작업지시 그리드 */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-300 rounded-lg shadow-xs overflow-hidden">
          <div className="bg-slate-100 px-3.5 py-2 flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <span className="font-extrabold text-slate-800 text-[12.5px]">
                일일 생산 작업지시서
              </span>
              <span className="text-[11px] text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded-md border border-blue-300 font-bold">
                {currentGyeLabel}
              </span>
              <span className="text-[11px] text-slate-600 bg-slate-200 px-2 py-0.5 rounded font-medium">
                {workDate} ({shift})
              </span>
            </div>

            <div className="text-[11.5px] text-slate-600">
              대상 품목: <span className="font-black text-blue-700 font-mono">{displayDetails.length}</span> 건 | 총 지시량:{' '}
              <span className="font-black text-indigo-700 font-mono">
                {displayDetails.reduce((sum, d) => sum + d.orderQty, 0).toLocaleString()}
              </span>
              개
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {loading ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold text-slate-500">작업지시 데이터를 불러오는 중입니다...</span>
              </div>
            ) : displayDetails.length === 0 ? (
              <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <AlertCircle className="w-8 h-8 text-slate-300" />
                <span className="text-sm font-semibold text-slate-600">
                  선택하신 일자({workDate}) 및 공정에 등록된 작업지시가 없습니다.
                </span>
                <span className="text-xs text-slate-400">
                  상단 [엑셀 수주 GS25] 버튼으로 당일 수주 발주서를 등록하시면 실시간으로 자동 편성됩니다.
                </span>
              </div>
            ) : (
              <ProductionDataGrid
                columns={RIGHT_COLUMNS}
                data={displayDetails}
                summaryRowTitle="합계"
                emptyMessage="작업지시 품목이 없습니다."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
