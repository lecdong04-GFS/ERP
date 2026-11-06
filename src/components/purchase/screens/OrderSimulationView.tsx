'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calculator,
  RotateCcw,
  Download,
  Search,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Boxes,
  ShieldAlert,
  ArrowRight,
  SlidersHorizontal,
  Info,
  Clock,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface FinishedProductItem {
  id: number;
  bomId: number;
  code: string;
  name: string;
  category: string;
  spec: string;
  unit: string;
  statAvgQty: number;
  statOrderCount: number;
  recentQty: number;
  baseQty: number;
  simulQty: number;
  ingredients: Array<{
    childId: number;
    childCode: string;
    childName: string;
    category: string;
    spec: string;
    unit: string;
    unitQty: number;
    yieldRate: number;
    realFactor: number;
  }>;
}

interface MaterialMeta {
  id: number;
  code: string;
  name: string;
  category: string;
  spec: string;
  unit: string;
  supplier: string;
  partnerId: string;
  leadTime: number;
  boxQty: number;
  minOrderQty: number;
  orderUnitQty: number;
  safetyStock: number;
  currentStock: number;
  pendingIncoming: number;
  unitPrice: number;
  dailyUsage: number;
}

export const OrderSimulationView: React.FC = () => {
  const { openTab } = useTabs();

  // 원천 데이터 상태
  const [finishedProds, setFinishedProds] = useState<FinishedProductItem[]>([]);
  const [materialsMap, setMaterialsMap] = useState<Record<string, MaterialMeta>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // 시나리오 제어 상태
  const [surgePercent, setSurgePercent] = useState<number>(0); // 수주 증감율 (-50 ~ +100%)
  const [leadTimeDelay, setLeadTimeDelay] = useState<number>(0); // 입고 지연 일수 (0, 1, 2, 99=중단)
  const [includeSafetyStock, setIncludeSafetyStock] = useState<boolean>(true); // 안전재고 포함 여부
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null); // 좌측 선택 완제품
  const [prodSearchTerm, setProdSearchTerm] = useState<string>(''); // 완제품 검색어
  const [matSearchTerm, setMatSearchTerm] = useState<string>(''); // 자재 검색어
  const [matFilterTab, setMatFilterTab] = useState<'ALL' | 'SHORTAGE' | 'TARGET'>('ALL');

  // 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/purchase/simulation', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setFinishedProds(json.finishedProducts || []);
        setMaterialsMap(json.materials || {});
        if (json.finishedProducts?.length > 0) {
          setSelectedProductId(json.finishedProducts[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load simulation data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 탭 이동 헬퍼
  const handleNavigate = (menuId: string) => {
    const item = getMenuItemById(menuId);
    if (item) openTab(item);
  };

  // 완제품별 수량 직접 변경
  const handleSimulQtyChange = (id: number, val: number) => {
    setFinishedProds((prev) =>
      prev.map((p) => (p.id === id ? { ...p, simulQty: Math.max(0, Math.round(val || 0)) } : p))
    );
  };

  // 수주 증감 프리셋 일괄 적용
  const applySurgePreset = (pct: number) => {
    setSurgePercent(pct);
    const multiplier = 1 + pct / 100;
    setFinishedProds((prev) =>
      prev.map((p) => ({
        ...p,
        simulQty: Math.max(0, Math.round(p.baseQty * multiplier)),
      }))
    );
  };

  // 전체 리셋
  const handleReset = () => {
    setSurgePercent(0);
    setLeadTimeDelay(0);
    setIncludeSafetyStock(true);
    setProdSearchTerm('');
    setMatSearchTerm('');
    setMatFilterTab('ALL');
    setFinishedProds((prev) =>
      prev.map((p) => ({
        ...p,
        simulQty: p.baseQty,
      }))
    );
  };

  // ★ 실시간 What-If 자재 소요량 및 결품 엔진 (0ms 실시간 연산)
  const simulationResults = useMemo(() => {
    // 1. 자재별 총소요량 집계
    const reqAgg = new Map<string, { totalReq: number; usedInProducts: string[] }>();

    finishedProds.forEach((prod) => {
      if (prod.simulQty <= 0) return;
      prod.ingredients.forEach((ing) => {
        const code = ing.childCode;
        if (!code) return;
        const cur = reqAgg.get(code) || { totalReq: 0, usedInProducts: [] };
        cur.totalReq += prod.simulQty * ing.realFactor;
        if (!cur.usedInProducts.includes(prod.name)) {
          cur.usedInProducts.push(prod.name);
        }
        reqAgg.set(code, cur);
      });
    });

    // 2. 자재별 재고 차감 및 결품 판정
    const rows: Array<{
      materialCode: string;
      materialName: string;
      category: string;
      spec: string;
      unit: string;
      supplier: string;
      unitPrice: number;
      boxQty: number;
      totalReq: number;
      currentStock: number;
      effectiveIncoming: number;
      totalAvailStock: number;
      safetyStock: number;
      netShortage: number;
      suggestBoxes: number;
      suggestQty: number;
      suggestAmt: number;
      stockDays: number;
      status: 'SHORTAGE' | 'WARNING' | 'TARGET' | 'OK';
      usedInCount: number;
      usedInNames: string;
    }> = [];

    let totalShortageItems = 0;
    let totalEstimatedBudget = 0;
    let totalRequiredBoxes = 0;
    let totalSuggestQty = 0;
    let bottleneckItem: { name: string; maxCapacity: number } | null = null;
    let minCapacityFound = Infinity;

    // 선택된 완제품이 있다면 그 제품 기준 최대 생산 가능량 분석
    const selectedProd = finishedProds.find((p) => p.id === selectedProductId) || null;

    reqAgg.forEach((reqInfo, code) => {
      const meta = materialsMap[code];
      const name = meta?.name || code;
      const category = meta?.category || '원재료';
      const spec = meta?.spec || '-';
      const unit = meta?.unit || 'ea';
      const supplier = meta?.supplier || '협력사';
      const unitPrice = meta?.unitPrice || 1000;
      const boxQty = meta?.boxQty && meta.boxQty > 0 ? meta.boxQty : 1;
      const safetyStock = includeSafetyStock ? meta?.safetyStock || 0 : 0;
      const currentStock = meta?.currentStock || 0;

      // 입고 지연 시나리오 적용 (지연 시 incoming 배제)
      let effectiveIncoming = meta?.pendingIncoming || 0;
      if (leadTimeDelay === 99) {
        effectiveIncoming = 0; // 전면 중단
      } else if (leadTimeDelay > 0) {
        effectiveIncoming = Math.max(0, effectiveIncoming * (1 - leadTimeDelay * 0.5));
      }

      const totalAvailStock = currentStock + effectiveIncoming;
      const totalReq = Math.round(reqInfo.totalReq * 100) / 100;
      const netShortage = Math.max(0, Math.round((totalReq + safetyStock - totalAvailStock) * 100) / 100);

      // 박스 단위 올림 계산 및 시스템 예상발주량(낱개 수량) 산출
      const suggestBoxes = netShortage > 0 ? Math.ceil(netShortage / boxQty) : 0;
      const suggestQty = boxQty > 1 ? suggestBoxes * boxQty : netShortage;
      const suggestAmt = suggestQty * unitPrice;

      // 재고 버팀일수
      const dailyUse = meta?.dailyUsage && meta.dailyUsage > 0 ? meta.dailyUsage : totalReq > 0 ? totalReq : 1;
      const stockDays = dailyUse > 0 ? Number((totalAvailStock / dailyUse).toFixed(1)) : 99;

      let status: 'SHORTAGE' | 'WARNING' | 'TARGET' | 'OK' = 'OK';
      if (netShortage > 0) {
        status = 'SHORTAGE';
        totalShortageItems += 1;
      } else if (totalAvailStock < (meta?.safetyStock || 0)) {
        status = 'WARNING';
      } else if (suggestBoxes > 0) {
        status = 'TARGET';
      }

      totalEstimatedBudget += suggestAmt;
      totalRequiredBoxes += suggestBoxes;
      totalSuggestQty += suggestQty;

      // 선택 완제품에 쓰이는 자재라면 병목 자재 분석
      if (selectedProd) {
        const ing = selectedProd.ingredients.find((i) => i.childCode === code);
        if (ing && ing.realFactor > 0) {
          const possibleQty = Math.floor(totalAvailStock / ing.realFactor);
          if (possibleQty < minCapacityFound) {
            minCapacityFound = possibleQty;
            bottleneckItem = { name, maxCapacity: Math.max(0, possibleQty) };
          }
        }
      }

      rows.push({
        materialCode: code,
        materialName: name,
        category,
        spec,
        unit,
        supplier,
        unitPrice,
        boxQty,
        totalReq,
        currentStock,
        effectiveIncoming,
        totalAvailStock,
        safetyStock,
        netShortage,
        suggestBoxes,
        suggestQty,
        suggestAmt,
        stockDays,
        status,
        usedInCount: reqInfo.usedInProducts.length,
        usedInNames: reqInfo.usedInProducts.slice(0, 2).join(', ') + (reqInfo.usedInProducts.length > 2 ? ' 외' : ''),
      });
    });

    // 결품 수량 내림차순 정렬
    rows.sort((a, b) => b.netShortage - a.netShortage);

    return {
      materialRows: rows,
      totalShortageItems,
      totalEstimatedBudget,
      totalRequiredBoxes,
      totalSuggestQty,
      bottleneckItem: bottleneckItem as { name: string; maxCapacity: number } | null,
      minCapacityFound: minCapacityFound === Infinity ? 0 : minCapacityFound,
    };
  }, [finishedProds, materialsMap, leadTimeDelay, includeSafetyStock, selectedProductId]);

  // 좌측 완제품 필터링
  const filteredFinishedProds = useMemo(() => {
    if (!prodSearchTerm.trim()) return finishedProds;
    const term = prodSearchTerm.trim().toLowerCase();
    return finishedProds.filter(
      (p) => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
    );
  }, [finishedProds, prodSearchTerm]);

  // 우측 자재 필터링
  const filteredMaterialRows = useMemo(() => {
    let result = simulationResults.materialRows;
    if (matFilterTab === 'SHORTAGE') {
      result = result.filter((r) => r.netShortage > 0);
    } else if (matFilterTab === 'TARGET') {
      result = result.filter((r) => r.suggestBoxes > 0);
    }
    if (matSearchTerm.trim()) {
      const term = matSearchTerm.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.materialName.toLowerCase().includes(term) ||
          r.materialCode.toLowerCase().includes(term) ||
          r.supplier.toLowerCase().includes(term)
      );
    }
    return result;
  }, [simulationResults.materialRows, matFilterTab, matSearchTerm]);

  // 하단 합계 계산
  const totals = useMemo(() => {
    return filteredMaterialRows.reduce(
      (acc, r) => ({
        req: acc.req + r.totalReq,
        stock: acc.stock + r.currentStock,
        incoming: acc.incoming + r.effectiveIncoming,
        shortage: acc.shortage + r.netShortage,
        suggestQty: acc.suggestQty + r.suggestQty,
        boxes: acc.boxes + r.suggestBoxes,
        amt: acc.amt + r.suggestAmt,
      }),
      { req: 0, stock: 0, incoming: 0, shortage: 0, suggestQty: 0, boxes: 0, amt: 0 }
    );
  }, [filteredMaterialRows]);

  // 엑셀 다운로드
  const handleExportExcel = () => {
    if (filteredMaterialRows.length === 0) {
      alert('내보낼 시뮬레이션 데이터가 없습니다.');
      return;
    }
    exportGridToExcel({
      filename: `발주시뮬레이션_WhatIf결과_${kstToday()}_증감${surgePercent}%`,
      sheetName: 'WhatIf분석',
      columns: [
        { key: 'category', label: '구분' },
        { key: 'materialCode', label: '자재코드' },
        { key: 'materialName', label: '품명' },
        { key: 'spec', label: '규격' },
        { key: 'unit', label: '단위' },
        { key: 'supplier', label: '거래처' },
        { key: 'totalReq', label: '총소요량', format: 'number' },
        { key: 'currentStock', label: '현재고', format: 'number' },
        { key: 'effectiveIncoming', label: '입고예정량', format: 'number' },
        { key: 'safetyStock', label: '안전재고', format: 'number' },
        { key: 'netShortage', label: '순부족량(결품위험)', format: 'number' },
        { key: 'suggestQty', label: '시스템예상발주량(수량)', format: 'number' },
        { key: 'boxQty', label: '박스내입수', format: 'number' },
        { key: 'suggestBoxes', label: '예상발주박스(Box)', format: 'number' },
        { key: 'unitPrice', label: '발주단가', format: 'currency' },
        { key: 'suggestAmt', label: '예상매입금액', format: 'currency' },
        { key: 'stockDays', label: '유지가능일수' },
      ],
      data: filteredMaterialRows,
    });
  };

  const selectedProdObj = useMemo(() => {
    return finishedProds.find((p) => p.id === selectedProductId) || null;
  }, [finishedProds, selectedProductId]);

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[13px] font-sans">
      {/* 1. 상단 다크 헤더 바 */}
      <div className="h-[40px] bg-[#0f172a] border-b border-black px-3.5 flex items-center justify-between text-white shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-4 bg-gradient-to-b from-amber-400 to-orange-500 rounded-2xs inline-block" />
          <h1 className="text-[14px] font-black tracking-tight text-white flex items-center gap-2.5">
            발주시뮬레이션
            <span className="text-[11.5px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1">
              <Sparkles size={12} className="text-amber-400" />
              What-If 모의 가상 훈련소 (위험도 0% 샌드박스)
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* 메인 발주 화면 바로가기 */}
          <button
            type="button"
            onClick={() => handleNavigate('pur-mat-order-day')}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xs text-[12px] font-black shadow-xs cursor-pointer border border-blue-400"
            title="실제 발주를 실행하려면 자재발주(요일별) 화면으로 이동합니다."
          >
            <Boxes size={13} />
            자재발주(요일별) 실행
            <ArrowRight size={12} />
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1 px-2.5 py-1 bg-teal-700 hover:bg-teal-600 text-white rounded-xs text-[11.5px] font-bold transition-colors shadow-2xs cursor-pointer border border-teal-800"
            title="시뮬레이션 분석 결과 엑셀 저장"
          >
            <Download size={13} />
            엑셀
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xs text-[11.5px] font-medium transition-colors shadow-2xs cursor-pointer border border-slate-600"
            title="모든 시뮬레이션 수치 기본값 복원"
          >
            <RotateCcw size={12} />
            초기화
          </button>
        </div>
      </div>

      {/* 2. 상단 4대 실시간 KPI 모의 진단 카드 */}
      <div className="bg-[#f8fafc] border-b border-[#cbd5e1] px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* 결품 위험 자재 */}
          <div
            onClick={() => setMatFilterTab(matFilterTab === 'SHORTAGE' ? 'ALL' : 'SHORTAGE')}
            className={`border rounded-xs px-3 py-1.5 flex items-center gap-2.5 cursor-pointer transition-all shadow-2xs ${
              matFilterTab === 'SHORTAGE'
                ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-400'
                : simulationResults.totalShortageItems > 0
                ? 'bg-rose-50 border-rose-300 hover:bg-rose-100'
                : 'bg-white border-slate-300'
            }`}
          >
            <ShieldAlert size={16} className={simulationResults.totalShortageItems > 0 ? 'text-rose-600' : 'text-slate-400'} />
            <div>
              <div className="text-[11px] font-bold text-rose-800">결품 위험 자재</div>
              <div className="text-[15px] font-black text-rose-600 font-mono leading-none">
                {simulationResults.totalShortageItems}개 품목
              </div>
            </div>
          </div>

          {/* 1순위 병목 자재 (선택 제품 한계선) */}
          <div className="bg-amber-50/80 border border-amber-300 rounded-xs px-3 py-1.5 flex items-center gap-2.5 shadow-2xs max-w-[280px]">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <div className="overflow-hidden">
              <div className="text-[11px] font-bold text-amber-800 truncate">
                ⚡ 1순위 병목 자재 (선택제품 기준)
              </div>
              <div className="text-[13px] font-black text-amber-950 font-mono leading-tight truncate">
                {simulationResults.bottleneckItem ? (
                  <span>
                    {simulationResults.bottleneckItem.name}{' '}
                    <span className="text-red-700 text-[11px]">
                      (최대 {simulationResults.bottleneckItem.maxCapacity.toLocaleString()}개 생산 한계)
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-400 text-xs">자재 여유 충분</span>
                )}
              </div>
            </div>
          </div>

          {/* 시스템 총 예상발주량 */}
          <div
            onClick={() => setMatFilterTab(matFilterTab === 'TARGET' ? 'ALL' : 'TARGET')}
            className={`border rounded-xs px-3 py-1.5 flex items-center gap-2.5 cursor-pointer transition-all shadow-2xs ${
              matFilterTab === 'TARGET'
                ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-400'
                : 'bg-white border-slate-300 hover:bg-blue-50'
            }`}
          >
            <Boxes size={16} className="text-blue-600" />
            <div>
              <div className="text-[11px] font-bold text-blue-900">시스템 총 예상발주량</div>
              <div className="text-[15px] font-black text-blue-950 font-mono leading-none">
                {simulationResults.totalSuggestQty.toLocaleString()} ea{' '}
                <span className="text-[12px] text-blue-800 font-bold">
                  ({simulationResults.totalRequiredBoxes.toLocaleString()} Box)
                </span>
              </div>
            </div>
          </div>

          {/* 총 예상 매입 예산 */}
          <div className="bg-emerald-50/80 border border-emerald-300 rounded-xs px-3 py-1.5 flex items-center gap-2.5 shadow-2xs">
            <TrendingUp size={16} className="text-emerald-700" />
            <div>
              <div className="text-[11px] font-bold text-emerald-900">총 예상 매입 예산</div>
              <div className="text-[15px] font-black text-emerald-950 font-mono leading-none">
                ₩{Math.round(simulationResults.totalEstimatedBudget).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* 신입사원 코칭 배너 */}
        <div className="bg-blue-50/80 border border-blue-200 px-3 py-1 rounded text-[11.5px] text-slate-800 flex items-center gap-2 max-w-[440px]">
          <Info size={14} className="text-blue-600 shrink-0" />
          <span>
            <strong>💡 시스템 자동 산출 안내:</strong> 과거 GS25 실제 수주 통계(2,500+건)와 실시간 재고를 기반으로 <strong>시스템 예상 발주량(ea / Box)</strong>을 100% 자동 추출합니다.
          </span>
        </div>
      </div>

      {/* 3. What-If 가상 시나리오 제어 바 (수주 폭증 슬라이더 & 입고 지연 설정) */}
      <div className="bg-[#e2e8f0] border-b border-[#cbd5e1] px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* 시나리오 1: 수주 증감율 슬라이더 & 프리셋 */}
        <div className="flex items-center gap-2.5">
          <span className="font-extrabold text-slate-800 text-[12px] flex items-center gap-1">
            <SlidersHorizontal size={13} className="text-blue-700" />
            시나리오 ① [수주 증감율]:
          </span>

          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-slate-300 shadow-2xs">
            <input
              type="range"
              min={-50}
              max={100}
              step={5}
              value={surgePercent}
              onChange={(e) => applySurgePreset(Number(e.target.value))}
              className="w-28 accent-blue-600 cursor-pointer"
            />
            <span
              className={`font-mono font-black text-[13px] w-12 text-right ${
                surgePercent > 0 ? 'text-red-600' : surgePercent < 0 ? 'text-blue-600' : 'text-slate-800'
              }`}
            >
              {surgePercent > 0 ? `+${surgePercent}%` : `${surgePercent}%`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => applySurgePreset(0)}
              className={`px-2 py-0.5 rounded text-[11.5px] font-bold border transition-colors cursor-pointer ${
                surgePercent === 0 ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="과거 GS25 실제 평균 수주량으로 복원"
            >
              GS25통계기본(0%)
            </button>
            <button
              type="button"
              onClick={() => applySurgePreset(20)}
              className={`px-2 py-0.5 rounded text-[11.5px] font-bold border transition-colors cursor-pointer ${
                surgePercent === 20 ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-amber-800 border-slate-300 hover:bg-amber-50'
              }`}
            >
              +20% 주말
            </button>
            <button
              type="button"
              onClick={() => applySurgePreset(50)}
              className={`px-2 py-0.5 rounded text-[11.5px] font-bold border transition-colors cursor-pointer ${
                surgePercent === 50 ? 'bg-rose-600 text-white border-rose-700' : 'bg-white text-rose-800 border-slate-300 hover:bg-rose-50'
              }`}
            >
              +50% 편의점행사
            </button>
            <button
              type="button"
              onClick={() => applySurgePreset(100)}
              className={`px-2 py-0.5 rounded text-[11.5px] font-bold border transition-colors cursor-pointer ${
                surgePercent === 100 ? 'bg-purple-700 text-white border-purple-800' : 'bg-white text-purple-900 border-slate-300 hover:bg-purple-50'
              }`}
            >
              2배(+100%) 비상수주
            </button>
          </div>
        </div>

        {/* 시나리오 2: 협력사 납기 지연 (태풍/사고) */}
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-slate-800 text-[12px] flex items-center gap-1">
            <Clock size={13} className="text-amber-700" />
            시나리오 ② [협력사 입고 지연]:
          </span>

          <div className="flex items-center gap-1 bg-white p-0.5 rounded border border-slate-300 shadow-2xs">
            <button
              type="button"
              onClick={() => setLeadTimeDelay(0)}
              className={`px-2 py-0.5 rounded text-[11.5px] font-bold cursor-pointer transition-colors ${
                leadTimeDelay === 0 ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              정상 입고
            </button>
            <button
              type="button"
              onClick={() => setLeadTimeDelay(1)}
              className={`px-2 py-0.5 rounded text-[11.5px] font-bold cursor-pointer transition-colors ${
                leadTimeDelay === 1 ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-amber-50'
              }`}
            >
              +1일 지연
            </button>
            <button
              type="button"
              onClick={() => setLeadTimeDelay(2)}
              className={`px-2 py-0.5 rounded text-[11.5px] font-bold cursor-pointer transition-colors ${
                leadTimeDelay === 2 ? 'bg-rose-600 text-white' : 'text-slate-700 hover:bg-rose-50'
              }`}
            >
              +2일 지연
            </button>
            <button
              type="button"
              onClick={() => setLeadTimeDelay(99)}
              className={`px-2 py-0.5 rounded text-[11.5px] font-bold cursor-pointer transition-colors ${
                leadTimeDelay === 99 ? 'bg-red-700 text-white' : 'text-red-700 hover:bg-red-50'
              }`}
              title="입고 전면 중단(재고 0 가정)"
            >
              입고중단(0)
            </button>
          </div>

          {/* 안전재고 토글 */}
          <label className="flex items-center gap-1.5 ml-2 cursor-pointer text-[12px] font-bold text-slate-700">
            <input
              type="checkbox"
              checked={includeSafetyStock}
              onChange={(e) => setIncludeSafetyStock(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
            />
            안전재고(Buffer) 유지
          </label>
        </div>
      </div>

      {/* 4. 좌우 2분할 대화형 그리드 레이아웃 */}
      <div className="flex-1 flex p-1.5 gap-1.5 min-h-0 overflow-hidden">
        {/* 좌측 패널 (32% 너비) - [완성품 생산계획 모의 설정] */}
        <div className="w-[32%] flex flex-col min-h-0 bg-white border border-slate-300 shadow-2xs rounded-xs overflow-hidden">
          <div className="px-2.5 py-1.5 bg-[#e2e8f0] border-b border-slate-300 font-bold text-slate-800 text-[12px] flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-black text-slate-900">
              <span className="w-2 h-2 bg-blue-600 rounded-full inline-block" />
              완성품 생산계획 ({finishedProds.length}종)
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold shadow-2xs cursor-pointer transition-colors"
              title="과거 GS25 실제 수주 통계 평균수량으로 자동 입력합니다."
            >
              <Sparkles size={11} className="text-amber-300" />
              통계예상량 자동추출
            </button>
          </div>

          {/* 완제품 검색바 */}
          <div className="p-1.5 border-b border-slate-200 bg-slate-50 flex items-center gap-1.5">
            <Search size={13} className="text-slate-400" />
            <input
              type="text"
              placeholder="완제품명 / 코드 검색..."
              value={prodSearchTerm}
              onChange={(e) => setProdSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-0.5 text-[12px] focus:outline-hidden"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <div className="py-16 text-center text-slate-400 font-medium">BOM 데이터 로딩 중...</div>
            ) : filteredFinishedProds.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-medium">일치하는 완제품이 없습니다.</div>
            ) : (
              <EditableTableWrapper readOnly>
                <table className="w-full min-w-full border-collapse text-[12.5px] font-sans">
                  <thead className="sticky top-0 bg-[#eef2f7] text-slate-900 font-bold border-b border-slate-300 text-center z-10">
                    <tr className="h-[32px]">
                      <th className="border-r border-slate-300 px-1 py-1 w-[30px]">No</th>
                      <th className="border-r border-slate-300 px-2 py-1 text-left">품명</th>
                      <th className="border-r border-slate-300 px-1.5 py-1 w-[80px] text-right" title="과거 GS25 수주 실적 기반 시스템 자동 추출 평균치">
                        GS25통계평균
                      </th>
                      <th className="px-1.5 py-1 w-[85px] text-right bg-amber-100 text-amber-950 font-black">
                        시뮬수량(✏️)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredFinishedProds.map((prod, idx) => {
                      const isSelected = selectedProductId === prod.id;
                      return (
                        <tr
                          key={prod.id}
                          onClick={() => setSelectedProductId(prod.id)}
                          className={`h-[32px] cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-100/70 font-bold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-1 py-1 text-center font-mono text-slate-500 text-[11.5px] border-r border-slate-200">
                            {idx + 1}
                          </td>
                          <td className="px-2 py-1 text-left font-bold text-slate-900 border-r border-slate-200 truncate max-w-[140px]">
                            {isSelected && <span className="text-blue-600 mr-1">▶</span>}
                            {prod.name}
                          </td>
                          <td className="px-1.5 py-1 text-right font-mono text-slate-700 border-r border-slate-200 text-[12px]">
                            {prod.statAvgQty > 0 ? (
                              <span className="font-bold text-blue-900" title={`과거 ${prod.statOrderCount}건 수주 실적 평균치`}>
                                {prod.statAvgQty.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]" title="신규품목 (표준배치 수량 적용)">
                                {prod.baseQty.toLocaleString()}
                              </span>
                            )}
                          </td>
                          <td
                            className="px-1 py-0.5 text-right bg-amber-50/70 font-mono font-black text-blue-950"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="number"
                              value={prod.simulQty}
                              onChange={(e) => handleSimulQtyChange(prod.id, Number(e.target.value))}
                              className="w-full text-right bg-white border border-amber-300 rounded px-1.5 py-0.5 text-[12.5px] font-mono font-bold focus:outline-hidden focus:border-blue-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </EditableTableWrapper>
            )}
          </div>

          {/* 좌측 하단 선택 제품 요약 카드 */}
          {selectedProdObj && (
            <div className="p-2 border-t border-slate-300 bg-slate-50 text-[11.5px] text-slate-700">
              <div className="font-bold text-blue-900 truncate">
                선택 제품: [{selectedProdObj.name}]
              </div>
              <div className="flex items-center justify-between mt-0.5 text-slate-600">
                <span>투입 원자재: {selectedProdObj.ingredients.length}종</span>
                <span className="font-bold text-slate-900">
                  계획 수량: {selectedProdObj.simulQty.toLocaleString()} ea
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 우측 패널 (68% 너비) - [원부자재 What-If 소요량 & 결품 관제] */}
        <div className="w-[68%] flex flex-col min-h-0 bg-white border border-slate-300 shadow-2xs rounded-xs overflow-hidden">
          <div className="px-3 py-1.5 bg-[#e2e8f0] border-b border-slate-300 font-bold text-slate-800 text-[12px] flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-blue-950 font-black">
              <span className="w-2 h-2 bg-emerald-600 rounded-full inline-block" />
              원부자재 What-If 소요량 및 결품 판정 ({filteredMaterialRows.length}개 자재)
            </span>

            {/* 필터 탭 */}
            <div className="flex items-center gap-1 bg-white p-0.5 rounded border border-slate-300 shadow-2xs">
              <button
                type="button"
                onClick={() => setMatFilterTab('ALL')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                  matFilterTab === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체 자재
              </button>
              <button
                type="button"
                onClick={() => setMatFilterTab('SHORTAGE')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                  matFilterTab === 'SHORTAGE' ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                🚨 결품위험만 ({simulationResults.totalShortageItems})
              </button>
              <button
                type="button"
                onClick={() => setMatFilterTab('TARGET')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                  matFilterTab === 'TARGET' ? 'bg-blue-600 text-white' : 'text-blue-700 hover:bg-blue-50'
                }`}
              >
                📦 발주대상만
              </button>
            </div>
          </div>

          {/* 자재 검색바 */}
          <div className="p-1.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 max-w-[280px]">
              <Search size={13} className="text-slate-400" />
              <input
                type="text"
                placeholder="자재명 / 자재코드 / 공급사 검색..."
                value={matSearchTerm}
                onChange={(e) => setMatSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2 py-0.5 text-[12px] focus:outline-hidden"
              />
            </div>
            <div className="text-[11.5px] text-slate-600">
              💡 <span className="text-rose-700 font-bold">빨간색 순부족량</span>은 가상 수주 시 즉시 결품이 발생하는 위기 자재입니다.
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <div className="py-20 text-center text-slate-400 font-medium text-[13.5px]">
                실제 공장 BOM 및 재고 데이터를 연산 중입니다...
              </div>
            ) : filteredMaterialRows.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2 text-emerald-700">
                <CheckCircle2 size={32} className="text-emerald-600" />
                <span className="text-base font-bold">결품 위험 자재가 없습니다.</span>
                <span className="text-xs text-slate-500">현재 시나리오 기준으로 모든 원부자재가 안전하게 커버됩니다.</span>
              </div>
            ) : (
              <EditableTableWrapper readOnly>
                <table className="w-full min-w-full border-collapse text-[13px] font-sans">
                  <thead className="sticky top-0 bg-[#eef2f7] text-slate-900 font-bold border-b border-slate-300 text-center z-10 whitespace-nowrap">
                    <tr className="h-[34px]">
                      <th className="border-r border-slate-300 px-1.5 py-1 w-[36px]">No</th>
                      <th className="border-r border-slate-300 px-2 py-1 w-[95px]">자재코드</th>
                      <th className="border-r border-slate-300 px-3 py-1 min-w-[200px] text-left">품명</th>
                      <th className="border-r border-slate-300 px-1.5 py-1 w-[45px]">단위</th>
                      <th className="border-r border-slate-300 px-2 py-1 min-w-[120px] text-left">거래처</th>
                      <th className="border-r border-slate-300 px-2 py-1 text-right w-[85px]">총소요량</th>
                      <th className="border-r border-slate-300 px-2 py-1 text-right w-[80px]">현재고</th>
                      <th className="border-r border-slate-300 px-2 py-1 text-right w-[80px]">입고예정</th>
                      <th className="border-r border-slate-300 px-2 py-1 text-right w-[80px]">안전재고</th>
                      <th className="border-r border-slate-300 px-2.5 py-1 text-right w-[95px] bg-rose-100/90 text-rose-950 font-black">
                        순부족량🚨
                      </th>
                      <th className="border-r border-slate-300 px-2.5 py-1 text-right w-[100px] bg-blue-100/90 text-blue-950 font-black">
                        시스템 예상발주량(ea)
                      </th>
                      <th className="border-r border-slate-300 px-2 py-1 text-right w-[85px] bg-amber-100/90 text-amber-950 font-black">
                        예상 발주박스📦
                      </th>
                      <th className="border-r border-slate-300 px-2 py-1 text-right w-[80px]">단가</th>
                      <th className="border-r border-slate-300 px-2.5 py-1 text-right w-[100px] font-black">예상금액</th>
                      <th className="border-r border-slate-300 px-2 py-1 text-center w-[75px]">버팀일수</th>
                      <th className="px-2 py-1 text-center w-[90px]">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredMaterialRows.map((row, idx) => (
                      <tr
                        key={row.materialCode}
                        className={`h-[32px] hover:bg-blue-50/60 transition-colors ${
                          row.status === 'SHORTAGE'
                            ? 'bg-rose-50/50'
                            : row.status === 'WARNING'
                            ? 'bg-amber-50/40'
                            : idx % 2 === 0
                            ? 'bg-white'
                            : 'bg-slate-50/30'
                        }`}
                      >
                        <td className="px-1 py-1 text-center font-mono text-slate-500 text-[11.5px] border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-1 text-center font-mono text-[12px] text-slate-700 border-r border-slate-200">
                          {row.materialCode}
                        </td>
                        <td className="px-3 py-1 text-left font-bold text-slate-950 border-r border-slate-200 truncate max-w-[220px]">
                          {row.materialName}
                        </td>
                        <td className="px-1.5 py-1 text-center text-slate-700 text-[12px] border-r border-slate-200">
                          {row.unit}
                        </td>
                        <td className="px-2 py-1 text-left text-slate-800 text-[12px] border-r border-slate-200 truncate max-w-[120px]">
                          {row.supplier}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-slate-900 border-r border-slate-200 font-bold">
                          {row.totalReq.toLocaleString()}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-slate-800 border-r border-slate-200">
                          {row.currentStock.toLocaleString()}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-blue-800 border-r border-slate-200">
                          {row.effectiveIncoming.toLocaleString()}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-slate-600 border-r border-slate-200">
                          {row.safetyStock.toLocaleString()}
                        </td>
                        <td
                          className={`px-2.5 py-1 text-right font-mono font-black text-[13.5px] border-r border-slate-200 ${
                            row.netShortage > 0 ? 'text-rose-600 bg-rose-100/60' : 'text-slate-400'
                          }`}
                        >
                          {row.netShortage > 0 ? row.netShortage.toLocaleString() : '-'}
                        </td>
                        <td className="px-2.5 py-1 text-right font-mono font-black text-blue-950 bg-blue-50/80 border-r border-slate-200 text-[13px]">
                          {row.suggestQty > 0 ? `${row.suggestQty.toLocaleString()} ${row.unit}` : '-'}
                        </td>
                        <td className="px-2 py-1 text-right font-mono font-black text-amber-950 bg-amber-50/80 border-r border-slate-200 text-[13px]">
                          {row.suggestBoxes > 0 ? `${row.suggestBoxes} Box` : '-'}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-slate-700 border-r border-slate-200 text-[12px]">
                          {row.unitPrice.toLocaleString()}
                        </td>
                        <td className="px-2.5 py-1 text-right font-mono font-black text-slate-900 border-r border-slate-200">
                          {row.suggestAmt > 0 ? row.suggestAmt.toLocaleString() : '-'}
                        </td>
                        <td className="px-2 py-1 text-center font-mono text-[12px] border-r border-slate-200">
                          <span
                            className={
                              row.stockDays < 1
                                ? 'text-red-700 font-black'
                                : row.stockDays < 2
                                ? 'text-amber-700 font-bold'
                                : 'text-slate-700'
                            }
                          >
                            {row.stockDays}일
                          </span>
                        </td>
                        <td className="px-2 py-1 text-center text-[11.5px]">
                          {row.status === 'SHORTAGE' ? (
                            <span className="px-2 py-0.5 rounded font-black bg-rose-100 text-rose-800 border border-rose-300">
                              🚨 결품위험
                            </span>
                          ) : row.status === 'WARNING' ? (
                            <span className="px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              안전미달
                            </span>
                          ) : row.status === 'TARGET' ? (
                            <span className="px-1.5 py-0.5 rounded font-bold bg-blue-100 text-blue-800 border border-blue-300">
                              발주대상
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded font-medium text-slate-500 bg-slate-100">
                              정상재고
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#fef9c3] font-mono font-bold text-slate-900 border-t-2 border-slate-400 sticky bottom-0 z-10 shadow-sm">
                    <tr className="h-[36px]">
                      <td colSpan={5} className="border-r border-slate-300 px-3 py-1 font-sans text-center font-black text-[13.5px]">
                        시뮬레이션 총합계 ({filteredMaterialRows.length}개 자재)
                      </td>
                      <td className="border-r border-slate-300 px-2 py-1 text-right text-[14px] font-black">
                        {totals.req.toLocaleString()}
                      </td>
                      <td className="border-r border-slate-300 px-2 py-1 text-right text-slate-800">
                        {totals.stock.toLocaleString()}
                      </td>
                      <td className="border-r border-slate-300 px-2 py-1 text-right text-blue-800">
                        {totals.incoming.toLocaleString()}
                      </td>
                      <td className="border-r border-slate-300 px-2 py-1"></td>
                      <td className="border-r border-slate-300 px-2.5 py-1 text-right text-[15px] font-black text-rose-700 bg-rose-100/60">
                        {totals.shortage.toLocaleString()}
                      </td>
                      <td className="border-r border-slate-300 px-2.5 py-1 text-right text-[15px] font-black text-blue-950 bg-blue-100/60">
                        {totals.suggestQty.toLocaleString()}
                      </td>
                      <td className="border-r border-slate-300 px-2 py-1 text-right text-[15px] font-black text-amber-950 bg-amber-100/60">
                        {totals.boxes.toLocaleString()} Box
                      </td>
                      <td className="border-r border-slate-300 px-2 py-1"></td>
                      <td className="border-r border-slate-300 px-2.5 py-1 text-right text-[14.5px] font-black text-slate-950">
                        ₩{totals.amt.toLocaleString()}
                      </td>
                      <td colSpan={2} className="px-2 py-1"></td>
                    </tr>
                  </tfoot>
                </table>
              </EditableTableWrapper>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
