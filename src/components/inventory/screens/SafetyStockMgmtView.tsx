'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Save,
  RotateCcw,
  Download,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  Layers,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  X,
  Sparkles,
  HelpCircle,
  Warehouse,
  ShieldAlert,
  ShieldCheck,
  Calculator,
  Filter,
  ChevronRight,
} from 'lucide-react';
import { InventoryActionBar } from '@/components/inventory/common/InventoryActionBar';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';

// 안전재고 행 인터페이스
interface SafetyStockItem {
  id: number;
  productId: number;
  no: number;
  warehouse: string;
  category: string;
  supplier: string;
  supplierId: string;
  leadTime: number;
  itemCode: string;
  itemName: string;
  spec: string;
  unit: string;
  boxUnitQty: number;
  unitPrice: number;
  dailyUsage: number;
  currentQty: number;
  stockDays: number;
  safetyStock: number; // 편집 가능
  recommendStock: number;
  diffQty: number;
  shortageQty: number;
  restockAmount: number;
  currentStockAmount: number;
  safetyStockAmount: number;
  healthStatus: 'CRITICAL' | 'WARNING' | 'OPTIMAL' | 'EXCESS';
  statusLabel: string;
  ratio: number;
  remark: string;
}

const WAREHOUSE_TABS = ['전체', '냉장1', '냉장2', '냉동', '상온', '부자재'];

export const SafetyStockMgmtView: React.FC = () => {
  // ── 툴바 및 필터 상태 ──
  const [activeWhTab, setActiveWhTab] = useState<string>('전체');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'OPTIMAL' | 'EXCESS'>('ALL');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [bufferMultiplier, setBufferMultiplier] = useState<number>(1.5);

  // ── 데이터 상태 ──
  const [rows, setRows] = useState<SafetyStockItem[]>([]);
  const [initialRows, setInitialRows] = useState<SafetyStockItem[]>([]);
  const [supplierList, setSupplierList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // ── 1. 데이터 로드 ──
  const loadSafetyStockData = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/inventory/safety-stock');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRows(json.data);
        setInitialRows(JSON.parse(JSON.stringify(json.data)));
        if (Array.isArray(json.supplierList)) {
          setSupplierList(json.supplierList);
        }
      } else {
        setStatusMessage({ type: 'error', text: json.error || '안전재고 조회에 실패했습니다.' });
      }
    } catch (err: any) {
      console.error('Failed to load safety stocks:', err);
      setStatusMessage({ type: 'error', text: err.message || '네트워크 오류가 발생했습니다.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSafetyStockData();
  }, [loadSafetyStockData]);

  // ── 2. 안전재고 수기 인라인 수정 ──
  const handleSafetyStockChange = (id: number, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const recommendStock = Math.ceil(num * 1.3);
          const diffQty = Math.round((r.currentQty - num) * 100) / 100;
          const shortageQty = r.currentQty < num ? Math.round((num - r.currentQty) * 100) / 100 : 0;
          const restockAmount = Math.round(shortageQty * r.unitPrice);
          const safetyStockAmount = Math.round(num * r.unitPrice);

          let healthStatus: 'CRITICAL' | 'WARNING' | 'OPTIMAL' | 'EXCESS' = 'OPTIMAL';
          let statusLabel = '적정';
          if (r.currentQty < num) {
            healthStatus = 'CRITICAL';
            statusLabel = '결품위험';
          } else if (r.currentQty < recommendStock) {
            healthStatus = 'WARNING';
            statusLabel = '주의';
          } else if (recommendStock > 0 && r.currentQty > recommendStock * 1.8) {
            healthStatus = 'EXCESS';
            statusLabel = '과다';
          }

          const ratio = num > 0 ? Math.round((r.currentQty / num) * 1000) / 10 : 0;

          return {
            ...r,
            safetyStock: num,
            recommendStock,
            diffQty,
            shortageQty,
            restockAmount,
            safetyStockAmount,
            healthStatus,
            statusLabel,
            ratio,
          };
        }
        return r;
      })
    );
  };

  // ── 3. 비고 인라인 수정 ──
  const handleRemarkChange = (id: number, val: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, remark: val } : r)));
  };

  // ── 4. 자동 산출 시뮬레이션 파이프라인 ──
  const handleAutoCalculate = () => {
    if (!window.confirm(`선택한 안전계수(${bufferMultiplier}배)를 적용하여 모든 품목의 안전재고를 일괄 자동 산출하시겠습니까?\n(산출 공식: 일사용량 × 리드타임 × ${bufferMultiplier})`)) {
      return;
    }

    setRows((prev) =>
      prev.map((r) => {
        const lead = r.leadTime > 0 ? r.leadTime : 1;
        let newSafety = Math.ceil(r.dailyUsage * Math.max(1, lead) * bufferMultiplier);
        if (newSafety <= 0) newSafety = 5;

        const recommendStock = Math.ceil(newSafety * 1.3);
        const diffQty = Math.round((r.currentQty - newSafety) * 100) / 100;
        const shortageQty = r.currentQty < newSafety ? Math.round((newSafety - r.currentQty) * 100) / 100 : 0;
        const restockAmount = Math.round(shortageQty * r.unitPrice);
        const safetyStockAmount = Math.round(newSafety * r.unitPrice);

        let healthStatus: 'CRITICAL' | 'WARNING' | 'OPTIMAL' | 'EXCESS' = 'OPTIMAL';
        let statusLabel = '적정';
        if (r.currentQty < newSafety) {
          healthStatus = 'CRITICAL';
          statusLabel = '결품위험';
        } else if (r.currentQty < recommendStock) {
          healthStatus = 'WARNING';
          statusLabel = '주의';
        } else if (recommendStock > 0 && r.currentQty > recommendStock * 1.8) {
          healthStatus = 'EXCESS';
          statusLabel = '과다';
        }

        const ratio = newSafety > 0 ? Math.round((r.currentQty / newSafety) * 1000) / 10 : 0;

        return {
          ...r,
          safetyStock: newSafety,
          recommendStock,
          diffQty,
          shortageQty,
          restockAmount,
          safetyStockAmount,
          healthStatus,
          statusLabel,
          ratio,
        };
      })
    );

    setStatusMessage({
      type: 'info',
      text: `안전계수 ${bufferMultiplier}배 기준으로 전 품목 안전재고가 일괄 자동 계산되었습니다. 검토 후 [안전재고 확정(저장)]을 진행하세요.`,
    });
  };

  // ── 5. 안전재고 확정(저장) 파이프라인 ──
  const handleSave = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/inventory/safety-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          rows: rows.map((r) => ({
            id: r.id,
            productId: r.productId,
            itemCode: r.itemCode,
            itemName: r.itemName,
            category: r.category,
            unit: r.unit,
            currentQty: r.currentQty,
            shortageQty: r.shortageQty,
            dailyUsage: r.dailyUsage,
            leadTime: r.leadTime,
            safetyStock: r.safetyStock,
            remark: r.remark,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `✅ ${data.message || '안전재고 설정값이 성공적으로 확정 저장되었습니다.'}`,
        });
        setInitialRows(JSON.parse(JSON.stringify(rows)));
      } else {
        setStatusMessage({ type: 'error', text: `저장 실패: ${data.error || '오류가 발생했습니다.'}` });
      }
    } catch (e: any) {
      console.error('Save failed:', e);
      setStatusMessage({ type: 'error', text: `통신 실패: ${e.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // ── 6. 초기화 ──
  const handleReset = () => {
    if (window.confirm('안전재고 수정 내역을 조회 초기 상태로 복구하시겠습니까?')) {
      setRows(JSON.parse(JSON.stringify(initialRows)));
      setStatusMessage({ type: 'info', text: '조회 당시 데이터로 복원되었습니다.' });
    }
  };

  // ── 7. 엑셀 다운로드 ──
  const handleExportExcel = () => {
    const exportColumns = [
      { key: 'no', label: 'No' },
      { key: 'warehouse', label: '보관창고' },
      { key: 'category', label: '구분' },
      { key: 'supplier', label: '거래처명' },
      { key: 'itemCode', label: '품번(ID)' },
      { key: 'itemName', label: '품명' },
      { key: 'spec', label: '규격' },
      { key: 'unit', label: '단위' },
      { key: 'unitPrice', label: '단가(원)', format: 'currency' },
      { key: 'dailyUsage', label: '일사용량', format: 'number' },
      { key: 'leadTime', label: '리드타임(일)', format: 'number' },
      { key: 'currentQty', label: '현재고', format: 'number' },
      { key: 'stockDays', label: '재고유지일', format: 'number' },
      { key: 'safetyStock', label: '안전재고', format: 'number' },
      { key: 'recommendStock', label: '권장적정재고', format: 'number' },
      { key: 'diffQty', label: '차이수량', format: 'number' },
      { key: 'shortageQty', label: '부족수량', format: 'number' },
      { key: 'restockAmount', label: '보충필요금액(원)', format: 'currency' },
      { key: 'statusLabel', label: '재고상태' },
      { key: 'remark', label: '비고' },
    ];

    exportGridToExcel({
      filename: `적정_안전재고설정_${activeWhTab}_${statusFilter}`,
      sheetName: '안전재고설정',
      columns: exportColumns,
      data: filteredRows.map((r, idx) => ({ ...r, no: idx + 1 })),
    });
  };

  // ── 8. 필터링 및 서머리 계산 ──
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // 창고 탭
      if (activeWhTab !== '전체' && r.warehouse !== activeWhTab) return false;
      // 상태 필터
      if (statusFilter !== 'ALL' && r.healthStatus !== statusFilter) return false;
      // 거래처 필터
      if (supplierFilter !== 'ALL' && r.supplier !== supplierFilter) return false;
      // 검색어 필터
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const matchName = r.itemName.toLowerCase().includes(kw);
        const matchCode = r.itemCode.toLowerCase().includes(kw);
        const matchSupplier = r.supplier.toLowerCase().includes(kw);
        if (!matchName && !matchCode && !matchSupplier) return false;
      }
      return true;
    });
  }, [rows, activeWhTab, statusFilter, supplierFilter, searchKeyword]);

  // 창고별 카운트 및 결품위험 요약
  const warehouseCounts = useMemo(() => {
    const counts: Record<string, { total: number; critical: number }> = {
      '전체': { total: rows.length, critical: 0 },
      '냉장1': { total: 0, critical: 0 },
      '냉장2': { total: 0, critical: 0 },
      '냉동': { total: 0, critical: 0 },
      '상온': { total: 0, critical: 0 },
      '부자재': { total: 0, critical: 0 },
    };

    rows.forEach((r) => {
      if (counts[r.warehouse]) {
        counts[r.warehouse].total += 1;
        if (r.healthStatus === 'CRITICAL') {
          counts[r.warehouse].critical += 1;
        }
      }
      if (r.healthStatus === 'CRITICAL') {
        counts['전체'].critical += 1;
      }
    });

    return counts;
  }, [rows]);

  // 전체 KPI 서머리
  const kpiSummary = useMemo(() => {
    let criticalCount = 0;
    let warningCount = 0;
    let optimalCount = 0;
    let excessCount = 0;
    let totalCurrentAmount = 0;
    let totalSafetyAmount = 0;
    let totalShortageAmount = 0;

    rows.forEach((r) => {
      totalCurrentAmount += r.currentStockAmount;
      totalSafetyAmount += r.safetyStockAmount;
      totalShortageAmount += r.restockAmount;

      if (r.healthStatus === 'CRITICAL') criticalCount++;
      else if (r.healthStatus === 'WARNING') warningCount++;
      else if (r.healthStatus === 'EXCESS') excessCount++;
      else optimalCount++;
    });

    const criticalRate = rows.length > 0 ? Math.round((criticalCount / rows.length) * 1000) / 10 : 0;

    return {
      totalCount: rows.length,
      criticalCount,
      warningCount,
      optimalCount,
      excessCount,
      criticalRate,
      totalCurrentAmount,
      totalSafetyAmount,
      totalShortageAmount,
    };
  }, [rows]);

  // 현재 필터링된 뷰의 소계
  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.currentQty += r.currentQty;
        acc.safetyStock += r.safetyStock;
        acc.shortageQty += r.shortageQty;
        acc.restockAmount += r.restockAmount;
        return acc;
      },
      { currentQty: 0, safetyStock: 0, shortageQty: 0, restockAmount: 0 }
    );
  }, [filteredRows]);

  // 액션바 버튼 구성
  const actionButtons = [
    {
      key: 'search',
      label: '조회',
      icon: 'search' as const,
      onClick: loadSafetyStockData,
      disabled: isLoading || isSaving,
    },
    {
      key: 'save',
      label: '안전재고 확정(저장)',
      icon: 'save' as const,
      onClick: handleSave,
      disabled: isSaving || rows.length === 0,
    },
    {
      key: 'auto',
      label: `자동 산출(${bufferMultiplier}배)`,
      icon: 'new' as const,
      onClick: handleAutoCalculate,
      disabled: isSaving || rows.length === 0,
    },
    {
      key: 'excel',
      label: '엑셀 다운로드',
      icon: 'excel' as const,
      onClick: handleExportExcel,
      disabled: rows.length === 0,
    },
    {
      key: 'reset',
      label: '초기화',
      icon: 'reset' as const,
      onClick: handleReset,
      disabled: isSaving,
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px] font-sans overflow-hidden">
      {/* 1. 표준 인벤토리 액션바 */}
      <InventoryActionBar
        title="적정/안전재고 설정"
        buttons={actionButtons}
        helpContent="606개 원부재료의 일평균 사용량(D)과 조달 리드타임(L)을 분석하여 안전재고(Safety Stock)와 권장 적정재고(Optimal Stock)를 정밀 관리합니다. 안전계수(1.2~2.0배)에 따른 자동 산출이 가능하며, [안전재고 확정(저장)] 시 품목 마스터(Product) 및 실시간 결품위험 지표에 즉시 동기화됩니다."
      />

      {/* 알림 배너 */}
      {statusMessage && (
        <div
          className={`px-4 py-1.5 text-[12px] font-bold flex items-center justify-between border-b transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-300'
              : 'bg-blue-50 text-blue-800 border-blue-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {statusMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600" />}
            {statusMessage.type === 'info' && <Sparkles className="w-4 h-4 text-blue-600" />}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-gray-400 hover:text-gray-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. 상단 4대 KPI 콕핏 배너 */}
      <div className="grid grid-cols-4 gap-2 px-3 pt-2 pb-1.5 bg-[#f8fafc] border-b border-gray-300 shrink-0">
        {/* 카드 1: 총 관리품목 & 결품위험율 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-blue-600" />
              총 안전재고 관리 품목
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                kpiSummary.criticalRate > 50
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              결품위험률 {kpiSummary.criticalRate}%
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-[18px] font-black font-mono text-slate-900 tracking-tight">
              {kpiSummary.totalCount.toLocaleString()}
              <span className="text-[11px] font-medium text-slate-500 ml-1">품목</span>
            </div>
            <div className="text-[11px] font-medium text-slate-600">
              위험 <strong className="text-rose-600">{kpiSummary.criticalCount}</strong> / 주의{' '}
              <strong className="text-amber-600">{kpiSummary.warningCount}</strong> / 적정{' '}
              <strong className="text-emerald-700">{kpiSummary.optimalCount}</strong>
            </div>
          </div>
          {/* 건강도 바 */}
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1 flex">
            <div
              className="bg-rose-500 h-full"
              style={{ width: `${(kpiSummary.criticalCount / (kpiSummary.totalCount || 1)) * 100}%` }}
              title={`결품위험: ${kpiSummary.criticalCount}건`}
            />
            <div
              className="bg-amber-400 h-full"
              style={{ width: `${(kpiSummary.warningCount / (kpiSummary.totalCount || 1)) * 100}%` }}
              title={`주의: ${kpiSummary.warningCount}건`}
            />
            <div
              className="bg-emerald-500 h-full"
              style={{ width: `${(kpiSummary.optimalCount / (kpiSummary.totalCount || 1)) * 100}%` }}
              title={`적정: ${kpiSummary.optimalCount}건`}
            />
            <div
              className="bg-blue-400 h-full"
              style={{ width: `${(kpiSummary.excessCount / (kpiSummary.totalCount || 1)) * 100}%` }}
              title={`과다: ${kpiSummary.excessCount}건`}
            />
          </div>
        </div>

        {/* 카드 2: 현재고 총액 vs 안전재고 기준액 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              현재고 vs 안전재고 기준액
            </span>
            <span className="text-[10px] text-slate-400 font-mono">단가 반영</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div>
              <span className="text-[10px] text-slate-500 block">현재고 평가액</span>
              <span className="text-[14px] font-black font-mono text-slate-800">
                ₩ {kpiSummary.totalCurrentAmount.toLocaleString()}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className="text-right">
              <span className="text-[10px] text-blue-600 font-bold block">안전재고 기준액</span>
              <span className="text-[14px] font-black font-mono text-blue-700">
                ₩ {kpiSummary.totalSafetyAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 카드 3: 결품위험 보충 필요 총액 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              결품위험 긴급 발주 필요액
            </span>
            <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1 py-0.2 rounded font-bold">
              {kpiSummary.criticalCount}종 미달
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-[18px] font-black font-mono text-rose-700 tracking-tight">
              ₩ {kpiSummary.totalShortageAmount.toLocaleString()}
            </div>
            <span className="text-[10.5px] text-slate-500 font-medium">안전선 보충 소요액</span>
          </div>
        </div>

        {/* 카드 4: 창고별 결품위험 분포 퀵 배지 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Warehouse className="w-3.5 h-3.5 text-slate-600" />
              창고별 결품위험 분포
            </span>
            <span className="text-[10px] text-slate-400">5대 창고</span>
          </div>
          <div className="flex items-center gap-1 mt-1.5 overflow-x-auto">
            {['냉장1', '냉장2', '냉동', '상온', '부자재'].map((wh) => {
              const info = warehouseCounts[wh] || { total: 0, critical: 0 };
              const isCrit = info.critical > 0;
              return (
                <div
                  key={wh}
                  onClick={() => setActiveWhTab(wh)}
                  className={`flex-1 text-center py-1 px-1 rounded cursor-pointer border transition-all ${
                    activeWhTab === wh
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : isCrit
                      ? 'bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-[10px] font-bold">{wh}</div>
                  <div className="text-[11px] font-mono font-black">
                    {info.total}
                    {isCrit && (
                      <span className={`text-[9.5px] ml-0.5 ${activeWhTab === wh ? 'text-rose-200' : 'text-rose-600'}`}>
                        ({info.critical})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. 창고 탭 & 필터/제어 툴바 */}
      <div className="bg-[#e2e8f0] border-b border-slate-300 px-3 flex items-center justify-between shrink-0 h-[38px]">
        {/* 창고 탭 */}
        <div className="flex items-center gap-1 h-full pt-1.5">
          {WAREHOUSE_TABS.map((tab) => {
            const isActive = activeWhTab === tab;
            const count = warehouseCounts[tab]?.total || 0;
            const crit = warehouseCounts[tab]?.critical || 0;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveWhTab(tab)}
                className={`flex items-center gap-1.5 h-[33px] px-3.5 rounded-t text-[12px] font-bold transition-all cursor-pointer border-t border-x ${
                  isActive
                    ? 'bg-white text-blue-700 border-blue-500 border-t-2 shadow-xs'
                    : 'bg-slate-200/90 text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-300/80'
                }`}
              >
                <span>{tab}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? 'bg-blue-100 text-blue-800'
                      : crit > 0
                      ? 'bg-rose-200 text-rose-900'
                      : 'bg-slate-300 text-slate-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 툴바 제어 항목들 */}
        <div className="flex items-center gap-2">
          {/* 상태 필터 */}
          <div className="flex items-center bg-white border border-gray-300 rounded px-2 h-7 gap-1 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="text-[11px] font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
            >
              <option value="ALL">전체 상태 보기</option>
              <option value="CRITICAL">🔴 결품위험만 (미달)</option>
              <option value="WARNING">🟡 주의만 (경계)</option>
              <option value="OPTIMAL">🟢 적정만 (정상)</option>
              <option value="EXCESS">🔵 과다만 (과잉)</option>
            </select>
          </div>

          {/* 거래처 필터 */}
          <div className="flex items-center bg-white border border-gray-300 rounded px-2 h-7 gap-1 shadow-2xs">
            <span className="text-[10.5px] text-slate-500 font-bold">거래처:</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="text-[11px] font-bold text-slate-800 bg-transparent outline-none cursor-pointer max-w-[130px] truncate"
            >
              <option value="ALL">전체 거래처</option>
              {supplierList.map((sup) => (
                <option key={sup} value={sup}>
                  {sup}
                </option>
              ))}
            </select>
          </div>

          {/* 버퍼 계수 선택기 */}
          <div className="flex items-center bg-white border border-gray-300 rounded px-1.5 h-7 gap-1 shadow-2xs">
            <Calculator className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[10.5px] text-slate-500 font-bold">버퍼:</span>
            {[1.2, 1.5, 2.0].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setBufferMultiplier(m)}
                className={`text-[10.5px] px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer transition-colors ${
                  bufferMultiplier === m
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {m}배
              </button>
            ))}
          </div>

          {/* 실시간 검색 */}
          <div className="relative">
            <input
              type="text"
              placeholder="품명 / 품번 / 거래처 검색..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="h-7 w-[180px] pl-2.5 pr-7 bg-white border border-gray-300 rounded text-[11.5px] outline-none focus:border-blue-500 shadow-inner"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-2" />
          </div>
        </div>
      </div>

      {/* 4. 메인 데이터 그리드 */}
      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 min-h-0 overflow-auto border border-gray-300 shadow-2xs">
          <EditableTableWrapper>
            <table className="w-full min-w-full border-collapse text-[12px] font-sans">
              <thead className="sticky top-0 z-20 bg-[#eef2f7] text-gray-900 font-bold border-b border-[#cbd5e1] shadow-xs">
                <tr className="h-[32px] text-center leading-tight whitespace-nowrap">
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[42px] bg-[#e2e8f0] text-[11px]">No</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[72px]">보관창고</th>
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[60px]">구분</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 min-w-[130px] text-left">거래처명</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[85px] font-mono">품번(ID)</th>
                  <th className="border border-[#cbd5e1] px-3 py-1 min-w-[240px] text-left">품명</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[90px]">규격</th>
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[45px]">단위</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[75px] text-right">단가(원)</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[75px] text-right">일사용량</th>
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[60px] text-center">리드타임</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[85px] text-right bg-slate-100 font-mono">
                    현재고
                  </th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[70px] text-center font-mono">재고유지일</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[85px] bg-[#fef3c7] text-amber-950">
                    안전재고
                  </th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[85px] text-right bg-slate-50">권장적정재고</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[80px] text-right">차이수량</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[80px] text-right bg-rose-50 text-rose-950">
                    부족수량
                  </th>
                  <th className="border border-[#cbd5e1] px-2.5 py-1 w-[100px] text-right bg-rose-50 text-rose-950">
                    보충필요금액
                  </th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[75px] text-center">재고상태</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 min-w-[120px] text-left">비고</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={20} className="py-24 text-center text-gray-500 font-medium">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>606개 원부재료 적정/안전재고 지표를 분석 중입니다...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="py-24 text-center text-gray-400 font-medium italic">
                      일치하는 안전재고 품목이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r, idx) => {
                    const isCritical = r.healthStatus === 'CRITICAL';
                    const isWarning = r.healthStatus === 'WARNING';
                    const isExcess = r.healthStatus === 'EXCESS';

                    return (
                      <tr
                        key={r.id}
                        className={`h-[28px] border-b border-gray-200 transition-colors ${
                          isCritical
                            ? 'bg-rose-50/40 hover:bg-rose-100/60'
                            : isWarning
                            ? 'bg-amber-50/30 hover:bg-amber-100/50'
                            : isExcess
                            ? 'bg-blue-50/30 hover:bg-blue-100/50'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        {/* No */}
                        <td className="border border-gray-200 text-center text-gray-500 font-mono text-[11px] bg-slate-50">
                          {idx + 1}
                        </td>

                        {/* 보관창고 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center font-bold text-slate-700">
                          <span className="px-1.5 py-0.2 rounded text-[10.5px] bg-slate-100 border border-slate-300">
                            {r.warehouse}
                          </span>
                        </td>

                        {/* 구분 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              r.category === '부자재'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {r.category}
                          </span>
                        </td>

                        {/* 거래처 */}
                        <td
                          className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-left font-medium text-gray-800 truncate max-w-[130px]"
                          title={r.supplier}
                        >
                          {r.supplier}
                        </td>

                        {/* 품번 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-center font-mono font-semibold text-gray-700">
                          {r.itemCode}
                        </td>

                        {/* 품명 */}
                        <td
                          className="border border-gray-200 whitespace-nowrap px-2.5 py-0.5 text-left font-bold text-gray-900 truncate max-w-[260px]"
                          title={r.itemName}
                        >
                          {r.itemName}
                        </td>

                        {/* 규격 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center text-gray-600 truncate max-w-[90px]">
                          {r.spec || '-'}
                        </td>

                        {/* 단위 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1 py-0.5 text-center font-mono text-gray-600">
                          {r.unit}
                        </td>

                        {/* 단가 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                          {r.unitPrice.toLocaleString()}
                        </td>

                        {/* 일사용량 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-semibold text-slate-700">
                          {r.dailyUsage.toLocaleString()}
                        </td>

                        {/* 리드타임 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center font-mono text-slate-600">
                          D+{r.leadTime}
                        </td>

                        {/* 현재고 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-black text-slate-900 bg-slate-100/60">
                          {r.currentQty.toLocaleString()}
                        </td>

                        {/* 재고유지일 */}
                        <td
                          className={`border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center font-mono font-bold ${
                            r.stockDays < 1
                              ? 'text-rose-600'
                              : r.stockDays < 3
                              ? 'text-amber-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {r.stockDays >= 99.9 ? '99일+' : `${r.stockDays}일`}
                        </td>

                        {/* 설정 안전재고 (인라인 입력) */}
                        <td className="border border-gray-200 p-0 text-right font-mono bg-amber-50/70">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.safetyStock === 0 ? '' : r.safetyStock}
                            placeholder="0"
                            onChange={(e) => handleSafetyStockChange(r.id, e.target.value)}
                            className="w-full h-full text-right font-bold text-amber-950 px-2 py-1 border-none outline-none focus:bg-amber-100 focus:ring-1 focus:ring-amber-500 bg-transparent text-[12px]"
                          />
                        </td>

                        {/* 권장적정재고 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono text-slate-600 bg-slate-50">
                          {r.recommendStock.toLocaleString()}
                        </td>

                        {/* 차이수량 */}
                        <td
                          className={`border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-bold ${
                            r.diffQty < 0 ? 'text-rose-600' : 'text-blue-600'
                          }`}
                        >
                          {r.diffQty > 0 ? `+${r.diffQty}` : r.diffQty}
                        </td>

                        {/* 부족수량 */}
                        <td
                          className={`border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-black ${
                            r.shortageQty > 0 ? 'text-rose-700 bg-rose-100/60' : 'text-gray-400'
                          }`}
                        >
                          {r.shortageQty > 0 ? r.shortageQty.toLocaleString() : '-'}
                        </td>

                        {/* 보충필요금액 */}
                        <td
                          className={`border border-gray-200 whitespace-nowrap px-2.5 py-0.5 text-right font-mono font-bold ${
                            r.restockAmount > 0 ? 'text-rose-700 bg-rose-50/70' : 'text-gray-400'
                          }`}
                        >
                          {r.restockAmount > 0 ? `₩ ${r.restockAmount.toLocaleString()}` : '-'}
                        </td>

                        {/* 재고상태 배지 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              isCritical
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : isWarning
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : isExcess
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}
                          >
                            {r.statusLabel}
                          </span>
                        </td>

                        {/* 비고 */}
                        <td className="border border-gray-200 p-0 text-left">
                          <input
                            type="text"
                            value={r.remark}
                            onChange={(e) => handleRemarkChange(r.id, e.target.value)}
                            placeholder="특이사항 입력"
                            className="w-full h-full px-2 py-1 border-none outline-none text-[11px] text-gray-600 bg-transparent"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </EditableTableWrapper>
        </div>

        {/* 5. 하단 정밀 서머리 바 */}
        <div className="h-[36px] bg-[#f8fafc] border-t border-gray-300 px-4 flex items-center justify-between text-[12px] font-bold shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-gray-600">
              조회: <strong className="text-blue-700">{filteredRows.length}</strong>품목 / 전체{' '}
              <strong>{rows.length}</strong>품목
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600">
              결품위험: <strong className="text-rose-600">{filteredRows.filter((r) => r.healthStatus === 'CRITICAL').length}</strong>품목
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600">
              주의: <strong className="text-amber-600">{filteredRows.filter((r) => r.healthStatus === 'WARNING').length}</strong>품목
            </span>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">현재고합계:</span>
              <span className="font-mono text-slate-800 font-bold">{filteredTotals.currentQty.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
              <span className="text-gray-500">안전재고합계:</span>
              <span className="font-mono text-amber-800 font-bold">{filteredTotals.safetyStock.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
              <span className="text-gray-600">총 부족수량:</span>
              <span className="font-mono text-rose-600 font-black text-[13px]">
                {filteredTotals.shortageQty.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
              <span className="text-gray-600">긴급발주필요액:</span>
              <span className="font-mono text-rose-700 font-black text-[14px]">
                ₩ {filteredTotals.restockAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
