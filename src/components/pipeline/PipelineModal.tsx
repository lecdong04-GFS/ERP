'use client';

import React from 'react';
import { usePipeline } from '@/context/PipelineContext';
import { useTabs } from '@/context/TabContext';
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingUp,
  Boxes,
  ClipboardList,
  Flame,
  Terminal,
  ExternalLink,
} from 'lucide-react';

export const PipelineModal: React.FC = () => {
  const {
    isPipelineModalOpen,
    closePipelineModal,
    isExecuting,
    latestSummary,
    executePipeline,
    pipelineRunCount,
  } = usePipeline();

  const { openTab } = useTabs();

  if (!isPipelineModalOpen) return null;

  const handleOpenTargetTab = (menuId: string, title: string, categoryId: string) => {
    openTab({
      id: menuId,
      title,
      categoryId,
      categoryName:
        categoryId === 'production'
          ? '생산관리'
          : categoryId === 'inventory'
          ? '재고관리'
          : categoryId === 'cost'
          ? '원가관리'
          : '기준정보',
    });
    closePipelineModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs select-none">
      <div className="bg-[#f0f2f5] border border-gray-600 shadow-2xl rounded-lg w-[950px] max-h-[92vh] flex flex-col overflow-hidden text-[12px] animate-fadeIn">
        {/* 1. Modal Top Bar */}
        <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center text-black font-black">
              <Zap className="w-4 h-4 fill-black stroke-black" />
            </div>
            <div>
              <span className="font-bold text-[14px] text-white tracking-wide">
                생산-원가 자동 연산 파이프라인 엔진
              </span>
              <span className="text-[11px] text-gray-400 ml-2">
                | 수주-BOM역산-46계분배-자재차감-손익집계 통합 연쇄 프로세서
              </span>
            </div>
          </div>
          <button
            onClick={closePipelineModal}
            className="text-gray-400 hover:text-white font-bold text-lg px-2"
          >
            ✕
          </button>
        </div>

        {/* 2. Top Summary KPI Cards */}
        {latestSummary && (
          <div className="grid grid-cols-6 gap-2 p-3 bg-[#e2e8f0] border-b border-gray-300">
            {/* 총 수주액 */}
            <div className="bg-white p-2 rounded border border-gray-300 shadow-2xs flex flex-col">
              <span className="text-[10px] text-gray-500 font-semibold">총 수주금액 (1편+2편)</span>
              <span className="text-[13px] font-bold text-blue-900 mt-0.5 truncate">
                {latestSummary.totalSalesAmount.toLocaleString()} 원
              </span>
              <span className="text-[10px] text-gray-500">
                수량: {latestSummary.totalOrdersQty.toLocaleString()}개
              </span>
            </div>

            {/* 작업지시 발행 */}
            <div className="bg-white p-2 rounded border border-gray-300 shadow-2xs flex flex-col">
              <span className="text-[10px] text-gray-500 font-semibold">46계 공정지시</span>
              <span className="text-[13px] font-bold text-purple-900 mt-0.5">
                {latestSummary.dispatchedWorkOrdersCount} 건
              </span>
              <span className="text-[10px] text-purple-600">완제품 + 반제품 라우팅</span>
            </div>

            {/* 자재 출고 차감 */}
            <div className="bg-white p-2 rounded border border-gray-300 shadow-2xs flex flex-col">
              <span className="text-[10px] text-gray-500 font-semibold">자재수불부 차감</span>
              <span className="text-[13px] font-bold text-indigo-900 mt-0.5">
                {latestSummary.depletedMaterialsCount} 품목
              </span>
              <span className="text-[10px] text-indigo-600">FEFO 선입선출 자동적용</span>
            </div>

            {/* 원가 총합계 */}
            <div className="bg-white p-2 rounded border border-gray-300 shadow-2xs flex flex-col">
              <span className="text-[10px] text-gray-500 font-semibold">원가 총합계</span>
              <span className="text-[13px] font-bold text-gray-900 mt-0.5 truncate">
                {latestSummary.totalCostAmount.toLocaleString()} 원
              </span>
              <span className="text-[10px] text-gray-500">재료+물류+간접비</span>
            </div>

            {/* 순 손익 */}
            <div className="bg-white p-2 rounded border border-gray-300 shadow-2xs flex flex-col">
              <span className="text-[10px] text-gray-500 font-semibold">예상 순손익 (이익율)</span>
              <span className="text-[13px] font-bold text-emerald-800 mt-0.5 truncate">
                {latestSummary.netProfitAmount.toLocaleString()} 원
              </span>
              <span className="text-[10px] font-bold text-emerald-600">
                이익율: {latestSummary.overallProfitRate}%
              </span>
            </div>

            {/* 이상/역마진 탐지 */}
            <div
              className={`p-2 rounded border shadow-2xs flex flex-col ${
                latestSummary.abnormalItemsCount > 0
                  ? 'bg-red-50 border-red-300 text-red-900'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold">역마진/이상단가</span>
                <AlertTriangle
                  className={`w-3.5 h-3.5 ${
                    latestSummary.abnormalItemsCount > 0 ? 'text-red-600' : 'text-emerald-600'
                  }`}
                />
              </div>
              <span className="text-[13px] font-extrabold mt-0.5">
                {latestSummary.abnormalItemsCount} 건 검출
              </span>
              <span className="text-[10px] text-red-700 font-medium truncate">
                {latestSummary.abnormalItemsCount > 0
                  ? '토네이도소시지 (-2,706원)'
                  : '전 품목 정상 마진'}
              </span>
            </div>
          </div>
        )}

        {/* 3. 6-Stage Visual Workflow Cards */}
        <div className="p-3 bg-white border-b border-gray-300 flex flex-col gap-2">
          <span className="font-bold text-gray-800 text-[12px] flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-blue-700" />
            <span>엔드투엔드 파이프라인 6단계 실행 체계</span>
          </span>

          <div className="grid grid-cols-6 gap-2 text-[11px]">
            {/* Step 1 */}
            <div className="p-2 bg-blue-50/70 border border-blue-200 rounded flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-bold text-blue-900 mb-1">
                  <span>1. 수주 접수</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <p className="text-gray-600 text-[10px] leading-tight">
                  GS리테일 전국 점포 1편(점심) 및 2편(저녁) 주문 수량 집계
                </p>
              </div>
              <span className="text-[10px] font-semibold text-blue-800 mt-2">12개 품목 취합</span>
            </div>

            {/* Step 2 */}
            <div className="p-2 bg-purple-50/70 border border-purple-200 rounded flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-bold text-purple-900 mb-1">
                  <span>2. 대표제품 매핑</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <p className="text-gray-600 text-[10px] leading-tight">
                  시즌/바코드(28607290144 등)를 기준 대표 품번으로 N:1 정규화
                </p>
              </div>
              <span className="text-[10px] font-semibold text-purple-800 mt-2">100% 매핑 완료</span>
            </div>

            {/* Step 3 */}
            <div className="p-2 bg-indigo-50/70 border border-indigo-200 rounded flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-bold text-indigo-900 mb-1">
                  <span>3. BOM 역산</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <p className="text-gray-600 text-[10px] leading-tight">
                  레시피 수율(%) 역산: 지시량 / (수율/100) 적용 하위 전개
                </p>
              </div>
              <span className="text-[10px] font-semibold text-indigo-800 mt-2">수율 92~99% 반영</span>
            </div>

            {/* Step 4 */}
            <div className="p-2 bg-amber-50/70 border border-amber-200 rounded flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-bold text-amber-900 mb-1">
                  <span>4. 46계 지시</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <p className="text-gray-600 text-[10px] leading-tight">
                  취반실, 조리실, 튀김실, 성형장 라인별 1편/2편 지시 자동 분배
                </p>
              </div>
              <span className="text-[10px] font-semibold text-amber-800 mt-2">라인 라우팅 완료</span>
            </div>

            {/* Step 5 */}
            <div className="p-2 bg-teal-50/70 border border-teal-200 rounded flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-bold text-teal-900 mb-1">
                  <span>5. 자재 FEFO</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                </div>
                <p className="text-gray-600 text-[10px] leading-tight">
                  유통기한 임박 LOT 우선 차감 및 자재수불부 현재고 실시간 감량
                </p>
              </div>
              <span className="text-[10px] font-semibold text-teal-800 mt-2">재고수불 즉시 연동</span>
            </div>

            {/* Step 6 */}
            <div className="p-2 bg-emerald-50/70 border border-emerald-200 rounded flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-bold text-emerald-900 mb-1">
                  <span>6. 손익/원가</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <p className="text-gray-600 text-[10px] leading-tight">
                  직접재료비+물류비+간접비 배분, 이상단가/역마진 실시간 플래그
                </p>
              </div>
              <span className="text-[10px] font-semibold text-emerald-800 mt-2">손익분석 동시 갱신</span>
            </div>
          </div>
        </div>

        {/* 4. Terminal Log Output */}
        <div className="flex-1 p-3 flex flex-col overflow-hidden bg-[#181e29] text-gray-200 min-h-[180px]">
          <div className="flex items-center justify-between pb-1.5 border-b border-gray-700 text-[11px] mb-2">
            <div className="flex items-center gap-1.5 font-mono text-emerald-400">
              <Terminal className="w-3.5 h-3.5" />
              <span>Pipeline Engine Audit Console Logs</span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">
              실행 회차: #{pipelineRunCount} | {latestSummary?.executionDate}{' '}
              {latestSummary?.executionTime}
            </span>
          </div>

          <div className="flex-1 overflow-auto font-mono text-[11px] space-y-1 pr-1">
            {latestSummary?.logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2 leading-relaxed">
                <span className="text-gray-500 shrink-0">[{log.timestamp}]</span>
                <span
                  className={`font-semibold shrink-0 ${
                    log.type === 'error'
                      ? 'text-red-400'
                      : log.type === 'warn'
                      ? 'text-amber-400'
                      : log.type === 'success'
                      ? 'text-emerald-400'
                      : 'text-blue-300'
                  }`}
                >
                  [{log.step}]
                </span>
                <span
                  className={
                    log.type === 'warn'
                      ? 'text-amber-200 font-semibold'
                      : log.type === 'success'
                      ? 'text-gray-100'
                      : 'text-gray-300'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Modal Bottom Quick Navigation & Action Bar */}
        <div className="bg-[#e2e8f0] border-t border-gray-400 px-4 py-2.5 flex items-center justify-between">
          {/* Left Quick Navigation to Modules */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-gray-700 mr-1">연동 화면 바로가기:</span>

            <button
              onClick={() => handleOpenTargetTab('prod-work-order-status', '작업지시현황', 'production')}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-400 rounded text-[11px] font-medium text-gray-800 shadow-2xs"
            >
              <ClipboardList className="w-3 h-3 text-purple-700" />
              <span>작업지시현황</span>
            </button>

            <button
              onClick={() => handleOpenTargetTab('inv-mat-ledger', '자재수불부', 'inventory')}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-400 rounded text-[11px] font-medium text-gray-800 shadow-2xs"
            >
              <Boxes className="w-3 h-3 text-blue-700" />
              <span>자재수불부</span>
            </button>

            <button
              onClick={() => handleOpenTargetTab('cost-prod-pl-status', '제품별손익현황', 'cost')}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-400 rounded text-[11px] font-medium text-gray-800 shadow-2xs"
            >
              <TrendingUp className="w-3 h-3 text-emerald-700" />
              <span>제품별손익현황</span>
            </button>

            <button
              onClick={() => handleOpenTargetTab('cost-recipe-rate', '완성품레시피원가율', 'cost')}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-400 rounded text-[11px] font-medium text-gray-800 shadow-2xs"
            >
              <Flame className="w-3 h-3 text-red-600" />
              <span>완성품레시피원가율</span>
            </button>
          </div>

          {/* Right Action Trigger Buttons */}
          <div className="flex items-center gap-2">
            <button
              disabled={isExecuting}
              onClick={() => executePipeline(undefined, 85000000)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-black font-extrabold rounded shadow-md border border-amber-600 active:bg-amber-700 text-[12px] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-4 h-4 fill-black stroke-black" />
              <span>{isExecuting ? '파이프라인 연산 진행 중...' : '원클릭 파이프라인 즉시 재연산'}</span>
            </button>

            <button
              onClick={closePipelineModal}
              className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded border border-gray-400 text-[12px]"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
