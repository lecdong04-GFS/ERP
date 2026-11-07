'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CostActionBar } from '../common/CostActionBar';
import { MasterDataGrid, MasterGridColumnDef } from '@/components/master/common/MasterDataGrid';
import {
  Search,
  AlertTriangle,
  CheckCircle2,
  Layers,
  TrendingUp,
  Save,
  FileSpreadsheet,
  RefreshCw,
  X,
  PieChart,
  Percent,
} from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';

export interface IngredientCostDetail {
  id: number;
  childProductId: number;
  partId: string;
  partName: string;
  category: string;
  spec: string;
  unit: string;
  purchasePrice: number;
  recipeYield: number;
  unitQty: number;
  actualQty: number;
  unitCost: number;
  costShare: number; // 원가비중(%)
  partnerName: string;
  gyeName: string;
  remark: string;
}

export interface RecipeCostRateRow {
  id: number;
  productId: number;
  productCode: string;
  productName: string;
  category: string;
  kind: string;
  spec: string;
  unit: string;
  packType: string;
  gyeName: string;
  recipeCost: number; // 레시피 단위제조원가
  deliveryPrice: number; // 납품단가
  diff: number; // 마진금액 (납품단가 - 레시피원가)
  costRate: number; // 원가율(%)
  isLoss: boolean; // 역마진 여부 (diff < 0)
  isUnregisteredPrice: boolean; // 단가 미등록 여부 (deliveryPrice <= 0)
  materialCount: number;
  version: string;
  remark: string;
  details: IngredientCostDetail[];
}

export const RecipeCostRateView: React.FC = () => {
  const [dataList, setDataList] = useState<RecipeCostRateRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());

  // 필터 상태
  const [keyword, setKeyword] = useState<string>('');
  const [selectedVariety, setSelectedVariety] = useState<string>('전체');
  const [selectedGye, setSelectedGye] = useState<string>('전체');
  const [marginStatus, setMarginStatus] = useState<string>('ALL'); // ALL, LOSS, HIGH_COST, NORMAL, UNREGISTERED
  const [calcMonth, setCalcMonth] = useState<string>('2026-11');

  // 통계 요약 상태
  const [summary, setSummary] = useState({
    totalProducts: 0,
    pricedProducts: 0,
    avgCostRate: 0,
    lossCount: 0,
    unregisteredCount: 0,
    highCostCount: 0,
    sumRecipeCost: 0,
    sumDeliveryPrice: 0,
  });

  // DB에서 완성품 레시피 원가율 파이프라인 데이터 로드
  const loadData = useCallback(async (recalc: boolean = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cost/recipe-rate?calcMonth=${calcMonth}&recalc=${recalc}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setDataList(json.data);
        if (json.summary) {
          setSummary(json.summary);
        }
        if (json.data.length > 0) {
          setSelectedProductId(json.data[0].productId);
        } else {
          setSelectedProductId(null);
        }
        setDirtyIds(new Set());
      }
    } catch (err) {
      console.error('레시피 원가율 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [calcMonth]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // 품종 및 계명칭 옵션 목록 산출
  const varieties = useMemo(() => {
    const set = new Set<string>();
    dataList.forEach((r) => {
      if (r.kind) set.add(r.kind);
    });
    return ['전체', ...Array.from(set)];
  }, [dataList]);

  const gyeOptions = useMemo(() => {
    const set = new Set<string>();
    dataList.forEach((r) => {
      if (r.gyeName) set.add(r.gyeName);
    });
    return ['전체', ...Array.from(set)];
  }, [dataList]);

  // 실시간 다중 조건 필터링
  const filteredData = useMemo(() => {
    return dataList.filter((item) => {
      // 품종 필터
      if (selectedVariety !== '전체' && item.kind !== selectedVariety) return false;

      // 공정/계 필터
      if (selectedGye !== '전체' && item.gyeName !== selectedGye) return false;

      // 마진 상태 필터
      if (marginStatus === 'LOSS' && !item.isLoss) return false;
      if (marginStatus === 'HIGH_COST' && (item.costRate <= 60 || item.deliveryPrice <= 0)) return false;
      if (marginStatus === 'NORMAL' && (item.costRate > 60 || item.deliveryPrice <= 0 || item.isLoss)) return false;
      if (marginStatus === 'UNREGISTERED' && !item.isUnregisteredPrice) return false;

      // 검색어 필터 (품명, 품번, 공정계, 원부자재명)
      const kw = keyword.trim().toLowerCase();
      if (!kw) return true;

      const directMatch =
        item.productName.toLowerCase().includes(kw) ||
        item.productCode.toLowerCase().includes(kw) ||
        item.gyeName.toLowerCase().includes(kw);

      if (directMatch) return true;

      // 배합 원부자재 역전개 검색
      return item.details.some(
        (dt) =>
          dt.partName.toLowerCase().includes(kw) ||
          dt.partId.toLowerCase().includes(kw)
      );
    });
  }, [dataList, selectedVariety, selectedGye, marginStatus, keyword]);

  // 현재 선택된 완제품 객체
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return filteredData[0] || null;
    return dataList.find((p) => p.productId === selectedProductId) || filteredData[0] || null;
  }, [dataList, filteredData, selectedProductId]);

  // 필터 변경 시 선택 동기화
  useEffect(() => {
    if (filteredData.length > 0) {
      const exists = filteredData.some((p) => p.productId === selectedProductId);
      if (!exists) {
        setSelectedProductId(filteredData[0].productId);
      }
    }
  }, [filteredData, selectedProductId]);

  // 현재 선택된 완제품의 원부자재 배합 목록
  const currentDetails = useMemo(() => {
    if (!selectedProduct) return [];
    return selectedProduct.details || [];
  }, [selectedProduct]);

  // 인라인 셀 수정 이벤트 (납품단가, 비고 수정 지원)
  const handleCellChange = (productId: any, colKey: string, newValue: any) => {
    setDataList((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const updated = { ...item, [colKey]: newValue };

          if (colKey === 'deliveryPrice') {
            const delivPrice = Number(newValue) || 0;
            const diff = delivPrice > 0 ? Math.round((delivPrice - item.recipeCost) * 10) / 10 : 0;
            const costRate = delivPrice > 0 ? Math.round((item.recipeCost / delivPrice) * 1000) / 10 : 0;
            const isLoss = delivPrice > 0 && diff < 0;
            const isUnregistered = delivPrice <= 0;

            updated.deliveryPrice = delivPrice;
            updated.diff = diff;
            updated.costRate = costRate;
            updated.isLoss = isLoss;
            updated.isUnregisteredPrice = isUnregistered;
          }

          setDirtyIds((set) => new Set(set).add(productId));
          return updated;
        }
        return item;
      })
    );
  };

  // 단가 및 변경사항 저장
  const handleSave = async () => {
    const dirtyRows = dataList.filter((r) => dirtyIds.has(r.productId));
    if (dirtyRows.length === 0) {
      alert('수정된 납품단가 또는 비고 내역이 없습니다.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/cost/recipe-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calcMonth,
          rows: dirtyRows.map((r) => ({
            productId: r.productId,
            productCode: r.productCode,
            productName: r.productName,
            category: r.category,
            kind: r.kind,
            spec: r.spec,
            unit: r.unit,
            packType: r.packType,
            gyeName: r.gyeName,
            recipeCost: r.recipeCost,
            deliveryPrice: r.deliveryPrice,
            diff: r.diff,
            costRate: r.costRate,
            remark: r.remark,
          })),
        }),
      });

      const json = await res.json();
      if (json.success) {
        alert(json.message || `${dirtyRows.length}건의 레시피 원가율 정보가 저장되었습니다.`);
        setDirtyIds(new Set());
      } else {
        alert('저장 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err: any) {
      alert('저장 중 오류: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 상단 완제품 마스터 그리드 컬럼 정의
  const UPPER_COLUMNS: MasterGridColumnDef[] = [
    {
      key: 'productCode',
      label: '품번',
      width: '110px',
      align: 'center',
      render: (val) => <span className="font-mono text-slate-700 font-bold">{val}</span>,
    },
    { key: 'category', label: '구분', width: '65px', align: 'center' },
    {
      key: 'kind',
      label: '품종',
      width: '85px',
      align: 'center',
      render: (val) => (
        <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
          {val}
        </span>
      ),
    },
    {
      key: 'productName',
      label: '완제품 품명',
      minWidth: '240px',
      align: 'left',
      render: (val, row) => (
        <div className="flex items-center gap-1.5">
          {row.isLoss ? (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" title="역마진 발생 품목" />
          ) : row.costRate > 60 ? (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="고원가율 집중관리" />
          ) : row.deliveryPrice > 0 ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="적정 마진" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" title="단가 미등록" />
          )}
          <span className={`font-bold ${row.isLoss ? 'text-rose-900 font-black' : 'text-slate-900'}`}>
            {val}
          </span>
        </div>
      ),
    },
    { key: 'spec', label: '규격', width: '95px', align: 'center' },
    { key: 'unit', label: '단위', width: '50px', align: 'center' },
    {
      key: 'materialCount',
      label: '자재수',
      width: '65px',
      align: 'right',
      render: (val) => (
        <span className="text-blue-700 font-bold text-[11px] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
          {val}종
        </span>
      ),
    },
    { key: 'gyeName', label: '주공정/계', width: '105px', align: 'left' },
    {
      key: 'recipeCost',
      label: '레시피원가',
      width: '105px',
      align: 'right',
      format: 'currency',
      render: (val) => (
        <span className="font-bold text-slate-900">{Number(val).toLocaleString()}원</span>
      ),
    },
    {
      key: 'deliveryPrice',
      label: '납품단가 (수정가능)',
      width: '120px',
      align: 'right',
      editable: true,
      format: 'currency',
      render: (val, row) => {
        const num = Number(val) || 0;
        return num > 0 ? (
          <span className="font-bold text-blue-700">{num.toLocaleString()}원</span>
        ) : (
          <span className="text-gray-400 text-[11px] bg-gray-100 px-1.5 py-0.5 rounded border border-dashed border-gray-300">
            미등록 (클릭입력)
          </span>
        );
      },
    },
    {
      key: 'diff',
      label: '차이(마진)',
      width: '100px',
      align: 'right',
      render: (val, row) => {
        if (row.deliveryPrice <= 0) return <span className="text-gray-400 text-[11px]">-</span>;
        const num = Number(val) || 0;
        return num < 0 ? (
          <span className="text-rose-600 font-black">{num.toLocaleString()}원</span>
        ) : (
          <span className="text-blue-800 font-bold">+{num.toLocaleString()}원</span>
        );
      },
    },
    {
      key: 'costRate',
      label: '원가율(%)',
      width: '85px',
      align: 'right',
      render: (val, row) => {
        if (row.deliveryPrice <= 0) return <span className="text-gray-400 text-[11px]">-</span>;
        const rate = Number(val) || 0;
        const color =
          rate > 100
            ? 'bg-rose-600 text-white font-black'
            : rate > 60
            ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
            : rate >= 45
            ? 'bg-blue-100 text-blue-900 border-blue-300 font-bold'
            : 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold';
        return <span className={`px-2 py-0.5 rounded text-[11px] border ${color}`}>{rate.toFixed(1)}%</span>;
      },
    },
    { key: 'remark', label: '비고', width: '130px', align: 'left', editable: true },
  ];

  // 하단 소요 원부자재 배합 원가 분해표 컬럼 정의 (Pareto Drill-down)
  const LOWER_COLUMNS: MasterGridColumnDef[] = [
    {
      key: 'partId',
      label: '자재코드',
      width: '110px',
      align: 'center',
      render: (val) => <span className="font-mono text-gray-600">{val}</span>,
    },
    { key: 'category', label: '구분', width: '65px', align: 'center' },
    {
      key: 'partName',
      label: '원부자재명',
      minWidth: '220px',
      align: 'left',
      render: (val) => <span className="font-bold text-slate-800">{val}</span>,
    },
    { key: 'spec', label: '규격', width: '95px', align: 'center' },
    { key: 'unit', label: '배합단위', width: '65px', align: 'center' },
    { key: 'purchasePrice', label: '매입단가(kg/단위)', width: '110px', align: 'right', format: 'currency' },
    { key: 'unitQty', label: '기준소요량', width: '85px', align: 'right' },
    { key: 'recipeYield', label: '수율(%)', width: '70px', align: 'right' },
    { key: 'actualQty', label: '실소요량', width: '85px', align: 'right' },
    {
      key: 'unitCost',
      label: '단위투입원가',
      width: '105px',
      align: 'right',
      format: 'currency',
      render: (val) => <span className="font-bold text-slate-900">{Number(val).toLocaleString()}원</span>,
    },
    {
      key: 'costShare',
      label: '원가비중(%)',
      width: '90px',
      align: 'right',
      render: (val) => {
        const share = Number(val) || 0;
        return (
          <span className={`font-bold ${share >= 20 ? 'text-rose-700 font-black' : share >= 10 ? 'text-amber-800' : 'text-slate-700'}`}>
            {share.toFixed(1)}%
          </span>
        );
      },
    },
    { key: 'partnerName', label: '공급처/협력사', width: '120px', align: 'left' },
    { key: 'gyeName', label: '투입공정/계', width: '100px', align: 'left' },
    { key: 'remark', label: '비고', width: '120px', align: 'left' },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px]">
      {/* 1. 최상단 마스터 액션바 */}
      <CostActionBar
        title="완성품 레시피 원가율"
        buttons={[
          { key: 'search', label: loading ? '조회중...' : '조회', icon: 'search', onClick: () => loadData(false) },
          { key: 'save', label: isSaving ? '저장중...' : '단가저장', icon: 'save', onClick: handleSave },
          { key: 'recalc', label: 'BOM실시간 재계산', icon: 'reset', onClick: () => loadData(true) },
          {
            key: 'downloadSummary',
            label: '원가율 총괄 엑셀',
            icon: 'excel',
            onClick: () =>
              exportGridToExcel({
                filename: `완성품_레시피_원가율_총괄_${calcMonth}`,
                sheetName: '레시피원가율',
                columns: UPPER_COLUMNS,
                data: filteredData,
              }),
          },
          {
            key: 'downloadDetail',
            label: '선택품목 배합원가 엑셀',
            icon: 'excel',
            onClick: () => {
              if (!selectedProduct) return;
              exportGridToExcel({
                filename: `배합원가명세서_${selectedProduct.productName}_v${selectedProduct.version}`,
                sheetName: '배합원가명세',
                columns: LOWER_COLUMNS,
                data: currentDetails,
              });
            },
          },
        ]}
        helpContent="114개 표준 BOM 배합비와 최근 자재 매입단가를 실시간 연동하여 제품별 단위 제조원가, 납품단가, 마진금액, 원가율(%)을 정밀 분석합니다. 고원가율 및 역마진 품목은 집중 관리됩니다."
      />

      {/* 2. 조건 검색 및 마진 상태 칩 필터 */}
      <div className="bg-white border-b border-[#cbd5e1] px-3 py-2 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* 품종 필터 */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-700 text-[12px]">품종:</span>
            <select
              value={selectedVariety}
              onChange={(e) => setSelectedVariety(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[12px] rounded font-semibold focus:border-blue-500 focus:outline-none"
            >
              {varieties.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* 공정/계 필터 */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
            <span className="font-bold text-gray-700 text-[12px]">공정계:</span>
            <select
              value={selectedGye}
              onChange={(e) => setSelectedGye(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[12px] rounded font-semibold focus:border-blue-500 focus:outline-none"
            >
              {gyeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* 마진 상태 버튼 칩 */}
          <div className="flex items-center gap-1 pl-2 border-l border-gray-300">
            <button
              type="button"
              onClick={() => setMarginStatus('ALL')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                marginStatus === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              전체 ({dataList.length})
            </button>
            <button
              type="button"
              onClick={() => setMarginStatus('LOSS')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors flex items-center gap-1 ${
                marginStatus === 'LOSS'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-300'
              }`}
            >
              <AlertTriangle size={11} /> 역마진 ({summary.lossCount})
            </button>
            <button
              type="button"
              onClick={() => setMarginStatus('HIGH_COST')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                marginStatus === 'HIGH_COST'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300'
              }`}
            >
              고원가율&gt;60% ({summary.highCostCount})
            </button>
            <button
              type="button"
              onClick={() => setMarginStatus('NORMAL')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                marginStatus === 'NORMAL'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300'
              }`}
            >
              적정마진≤60% ({summary.pricedProducts - summary.highCostCount - summary.lossCount})
            </button>
            <button
              type="button"
              onClick={() => setMarginStatus('UNREGISTERED')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                marginStatus === 'UNREGISTERED'
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
              }`}
            >
              단가미등록 ({summary.unregisteredCount})
            </button>
          </div>

          {/* 검색창 */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="품번, 품명, 또는 원부자재명 검색"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="bg-white border border-gray-300 pl-2 pr-6 py-0.5 text-[12px] rounded shadow-2xs w-60 focus:border-blue-500 focus:outline-none"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword('')}
                  className="absolute right-1 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dirtyIds.size > 0 && (
            <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded font-bold animate-pulse">
              수정된 단가: {dirtyIds.size}건 (상단 [단가저장] 필요)
            </span>
          )}
          <span className="text-[11.5px] text-gray-600 bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200 font-semibold shadow-2xs">
            조회 품목: <span className="text-blue-700 font-bold">{filteredData.length}</span> / {dataList.length}건
          </span>
        </div>
      </div>

      {/* 3. 상단 4대 레시피 원가율 종합 KPI Cockpit 배너 */}
      <div className="mx-2 mt-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-2.5 rounded shadow-xs border border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PieChart className="text-emerald-400" size={18} />
          <div>
            <div className="font-bold text-[13px] text-white">
              BOM 배합비 기반 레시피 원가율 파이프라인
            </div>
            <div className="text-[11px] text-slate-300">
              실제 114개 완제품의 소요 원부자재 g/ml 단위 실효단가 및 배합 수율을 실시간 반영한 정밀 원가율입니다.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          {/* 총 BOM 품목수 */}
          <div className="bg-slate-700/60 px-3 py-1.5 rounded border border-slate-600 flex flex-col items-end">
            <span className="text-slate-300 text-[11px]">BOM 완제품 / 단가등록</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-white font-black text-[13.5px]">
                {summary.totalProducts}종
              </span>
              <span className="text-cyan-300 font-bold text-[11px]">
                ({summary.pricedProducts}종 등록)
              </span>
            </div>
          </div>

          {/* 평균 레시피 원가율 */}
          <div className="bg-blue-950/60 px-3 py-1.5 rounded border border-blue-700/80 flex flex-col items-end">
            <span className="text-blue-200 text-[11px]">가중평균 레시피 원가율</span>
            <span className="text-white font-black text-[14px]">
              {summary.avgCostRate.toFixed(1)}%
            </span>
          </div>

          {/* 적정 마진 품목 */}
          <div className="bg-emerald-950/50 px-3 py-1.5 rounded border border-emerald-700/80 flex flex-col items-end">
            <span className="text-emerald-300 text-[11px]">적정 마진 품목 (≤60%)</span>
            <span className="text-emerald-300 font-black text-[13.5px]">
              {summary.pricedProducts - summary.highCostCount - summary.lossCount}종
            </span>
          </div>

          {/* 고원가율 및 역마진 집중관리 */}
          <div className="bg-rose-950/50 px-3 py-1.5 rounded border border-rose-800/80 flex flex-col items-end">
            <span className="text-rose-300 text-[11px]">역마진 / 고원가율 집중관리</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-rose-400 font-black text-[13.5px]">
                {summary.lossCount}종 역마진
              </span>
              <span className="text-amber-300 font-bold text-[11px]">
                ({summary.highCostCount}종 고원가)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. 본문 분할 화면: 상단 완제품 원가율 마스터 (55%) & 하단 원부자재 배합 원가 분석 (45%) */}
      <div className="flex-1 flex flex-col min-h-0 p-2 gap-2">
        {/* 상단 그리드: 완제품 레시피 원가 및 마진 분석표 */}
        <div className="flex-[11] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-2xs">
          <div className="bg-[#e2e8f0] px-3 py-1 flex items-center justify-between border-b border-[#cbd5e1]">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800 text-[12.5px] flex items-center gap-1">
                <Layers size={14} className="text-blue-700" /> 완제품 레시피 원가 및 마진 분석표
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                (행을 클릭하면 하단에 소요 원부자재 배합 원가명세서가 즉시 동기화됩니다. 납품단가 셀을 더블클릭하여 바로 수정 가능합니다)
              </span>
            </div>
            {selectedProduct && (
              <span className="text-[11.5px] text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-semibold">
                선택됨: <span className="font-bold text-blue-800">{selectedProduct.productName}</span> (원가: {selectedProduct.recipeCost.toLocaleString()}원 / 단가: {selectedProduct.deliveryPrice.toLocaleString()}원)
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={UPPER_COLUMNS}
              data={filteredData}
              selectedRowId={selectedProduct?.productId}
              onRowClick={(row) => setSelectedProductId(row.productId)}
              onCellChange={(rowId, colKey, val) => handleCellChange(rowId, colKey, val)}
              summaryRowTitle="합계 / 평균"
              emptyMessage={
                loading
                  ? 'BOM 레시피 원가율 파이프라인을 실행하는 중입니다...'
                  : '조건과 일치하는 완제품 레시피 원가 데이터가 없습니다.'
              }
            />
          </div>
        </div>

        {/* 하단 그리드: 선택 완제품의 소요 원부자재 배합 원가 분해표 (Pareto Drill-down) */}
        <div className="flex-[9] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-2xs">
          <div className="bg-[#e2e8f0] px-3 py-1 flex items-center justify-between border-b border-[#cbd5e1]">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800 text-[12.5px] flex items-center gap-1">
                <Percent size={14} className="text-emerald-700" />
                {selectedProduct
                  ? `[${selectedProduct.productName}] 소요 원부자재 배합 원가 분해표 (총 단위제조원가: ${selectedProduct.recipeCost.toLocaleString()}원)`
                  : '소요 원부자재 배합 원가 분해표'}
              </span>
              {selectedProduct && (
                <span className="text-[11px] text-slate-600">
                  (배합 자재 {selectedProduct.details.length}종 · 비중 20% 이상 집중관리)
                </span>
              )}
            </div>

            {selectedProduct && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportGridToExcel({
                      filename: `배합원가명세서_${selectedProduct.productName}_v${selectedProduct.version}`,
                      sheetName: '원가명세',
                      columns: LOWER_COLUMNS,
                      data: currentDetails,
                    })
                  }
                  className="px-2 py-0.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded text-[11px] flex items-center gap-1 shadow-2xs transition-colors"
                >
                  <FileSpreadsheet size={12} /> 배합원가 엑셀저장
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={LOWER_COLUMNS}
              data={currentDetails}
              summaryRowTitle="배합원가 합계"
              emptyMessage={
                selectedProduct
                  ? '등록된 소요 원부자재 배합비가 없습니다.'
                  : '상단에서 완제품을 먼저 선택하세요.'
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
