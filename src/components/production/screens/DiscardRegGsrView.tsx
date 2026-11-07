'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Search,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  Factory,
  Layers,
  TrendingDown,
  X,
  Sparkles,
  HelpCircle,
  Filter,
  Check,
} from 'lucide-react';
import { ProductionActionBar } from '../common/ProductionActionBar';
import { exportGridToExcel } from '@/lib/excelExport';
import { useToast } from '@/context/ToastContext';

// 표준 불량/폐기 사유 목록
const DISCARD_REASONS = [
  '공정 성형 불량 (형태/밥터짐)',
  '이물 혼입 / 검출 (X-ray·금속)',
  '가열 / 조리 불량 (탄화·미숙)',
  '유통기한 임박 / 초과',
  '낙하 / 용기 파손 / 포장 불량',
  '선도 저하 / 원료 변질',
  '라인 교체 잔량 / 로스',
  '단량 / 규격 미달',
  '기타 공정 사유',
];

// 카테고리 목록
const CATEGORIES = ['전체', '반제품', '원재료', '완성품', '부자재'] as const;
type CategoryType = (typeof CATEGORIES)[number];

// 계(Line) 인터페이스
interface GyeItem {
  id: string;
  name: string;
  sortOrder: number;
  count: number;
  totalQty: number;
  lossAmount: number;
}

// 폐기 등록 행 인터페이스
interface DiscardRow {
  id: number; // 음수면 새로 추가된 임시 행, 양수면 DB 저장된 ID
  dbId?: number;
  discardDate: string;
  gyeId: string;
  gyeName: string;
  category: string;
  productCode: string;
  productName: string;
  spec: string;
  unit: string;
  discardQty: number;
  unitPrice: number;
  lossAmount: number;
  reason: string;
  lotNo: string;
  expiryDate: string;
  remark: string;
  deductInventory: boolean;
  currentStock?: number;
}

// 품목 마스터 (검색 모달용)
interface MasterItem {
  id: number;
  productCode: string;
  name: string;
  category: string;
  spec: string;
  unit: string;
  unitPrice: number;
  currentStock: number;
  warehouse: string;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function shiftDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const DiscardRegGsrView: React.FC = () => {
  const { showToast } = useToast();

  // ── 1. 검색 및 필터 상태 ──
  const [discardDate, setDiscardDate] = useState<string>(kstToday);
  const [selectedGyeId, setSelectedGyeId] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('전체');
  const [selectedReason, setSelectedReason] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [gyeSearchText, setGyeSearchText] = useState<string>('');

  // ── 2. 데이터 상태 ──
  const [rows, setRows] = useState<DiscardRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [gyeList, setGyeList] = useState<GyeItem[]>([]);
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // ── 3. 모달 상태 ──
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalSearch, setModalSearch] = useState<string>('');
  const [modalCategory, setModalCategory] = useState<CategoryType>('전체');
  const [modalSelectedItems, setModalSelectedItems] = useState<Set<string>>(new Set());

  // ── 4. 백엔드 데이터 로드 ──
  const loadData = useCallback(async (date: string, gye: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ discardDate: date });
      if (gye && gye !== 'ALL') {
        params.append('gyeId', gye);
      }
      const res = await fetch(`/api/production/discard?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json.success) {
        const loadedRows: DiscardRow[] = (json.data || []).map((d: any) => ({
          id: d.id,
          dbId: d.id,
          discardDate: d.discardDate || date,
          gyeId: d.gyeId || '',
          gyeName: d.gyeName || '',
          category: d.category || '반제품',
          productCode: d.productCode || '',
          productName: d.productName || '',
          spec: d.spec || '',
          unit: d.unit || 'kg',
          discardQty: Number(d.discardQty) || 0,
          unitPrice: Number(d.unitPrice) || 0,
          lossAmount: Number(d.lossAmount) || 0,
          reason: d.reason || '공정 성형 불량 (형태/밥터짐)',
          lotNo: d.lotNo || '',
          expiryDate: d.expiryDate || '',
          remark: d.remark || '',
          deductInventory: false,
          currentStock: Number(d.currentStock) || 0,
        }));

        setRows(loadedRows);
        setGyeList(json.gyeList || []);
        if (json.masterItems) {
          setMasterItems(json.masterItems);
        }
      } else {
        showToast(json.error || '폐기 데이터를 불러오지 못했습니다.', 'error');
      }
    } catch (err: any) {
      console.error('Failed to load discard data:', err);
      showToast('폐기 데이터 로드 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData(discardDate, selectedGyeId);
  }, [discardDate, selectedGyeId, loadData]);

  // ── 5. 필터링된 행 목록 ──
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedGyeId !== 'ALL' && r.gyeId !== selectedGyeId) return false;
      if (selectedCategory !== '전체' && r.category !== selectedCategory) return false;
      if (selectedReason !== 'ALL' && r.reason !== selectedReason) return false;

      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const mName = r.productName.toLowerCase().includes(kw);
        const mCode = r.productCode.toLowerCase().includes(kw);
        const mGye = r.gyeName.toLowerCase().includes(kw);
        const mLot = r.lotNo.toLowerCase().includes(kw);
        const mRemark = r.remark.toLowerCase().includes(kw);
        if (!mName && !mCode && !mGye && !mLot && !mRemark) return false;
      }
      return true;
    });
  }, [rows, selectedGyeId, selectedCategory, selectedReason, searchKeyword]);

  // ── 6. KPI 서머리 계산 ──
  const kpiStats = useMemo(() => {
    let totalQty = 0;
    let totalLoss = 0;
    const gyeCountMap = new Map<string, number>();
    const reasonCountMap = new Map<string, number>();

    rows.forEach((r) => {
      totalQty += Number(r.discardQty) || 0;
      totalLoss += Number(r.lossAmount) || 0;

      const gyeKey = r.gyeName || r.gyeId || '미지정';
      gyeCountMap.set(gyeKey, (gyeCountMap.get(gyeKey) || 0) + (Number(r.discardQty) || 0));

      const reasonKey = r.reason || '기타';
      reasonCountMap.set(reasonKey, (reasonCountMap.get(reasonKey) || 0) + (Number(r.discardQty) || 0));
    });

    let topGye = { name: '해당 없음', qty: 0 };
    gyeCountMap.forEach((qty, name) => {
      if (qty > topGye.qty) topGye = { name, qty };
    });

    let topReason = { name: '해당 없음', qty: 0 };
    reasonCountMap.forEach((qty, name) => {
      if (qty > topReason.qty) topReason = { name, qty };
    });

    return {
      totalRecords: rows.length,
      totalQty: Number(totalQty.toFixed(2)),
      totalLoss: Math.round(totalLoss),
      topGye,
      topReason,
    };
  }, [rows]);

  // ── 7. 좌측 계 목록 필터링 ──
  const filteredGyeList = useMemo(() => {
    if (!gyeSearchText.trim()) return gyeList;
    const kw = gyeSearchText.toLowerCase();
    return gyeList.filter((g) => g.name.toLowerCase().includes(kw) || g.id.toLowerCase().includes(kw));
  }, [gyeList, gyeSearchText]);

  // 현재 선택된 계 마스터 정보
  const currentGye = useMemo(() => {
    return gyeList.find((g) => g.id === selectedGyeId);
  }, [gyeList, selectedGyeId]);

  // ── 8. 행 편집 및 조작 함수 ──
  const handleUpdateRow = (id: number, field: keyof DiscardRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };

        // 수량 또는 단가 변경 시 손실금액 재계산
        if (field === 'discardQty' || field === 'unitPrice') {
          const q = field === 'discardQty' ? Number(value) || 0 : r.discardQty;
          const p = field === 'unitPrice' ? Number(value) || 0 : r.unitPrice;
          updated.lossAmount = Math.round(q * p);
        }

        // 공정(gyeId) 변경 시 gyeName 동기화
        if (field === 'gyeId') {
          const found = gyeList.find((g) => g.id === value);
          if (found) updated.gyeName = found.name;
        }

        return updated;
      })
    );
  };

  // 신규 빈 행 추가
  const handleAddBlankRow = () => {
    const defaultGye = currentGye || gyeList[0] || { id: 'GFS005', name: '성형장(김밥)' };
    const newId = -Date.now();
    const newRow: DiscardRow = {
      id: newId,
      discardDate,
      gyeId: defaultGye.id,
      gyeName: defaultGye.name,
      category: '반제품',
      productCode: '',
      productName: '',
      spec: '',
      unit: 'kg',
      discardQty: 0,
      unitPrice: 0,
      lossAmount: 0,
      reason: DISCARD_REASONS[0],
      lotNo: '',
      expiryDate: '',
      remark: '',
      deductInventory: false,
    };
    setRows((prev) => [newRow, ...prev]);
    setSelectedRowIds((prev) => new Set(prev).add(newId));
    showToast('새 폐기 등록 행이 추가되었습니다.', 'info');
  };

  // 단건 삭제
  const handleDeleteRow = async (row: DiscardRow) => {
    if (row.id > 0) {
      if (!confirm(`'${row.productName || row.productCode}' 폐기 내역을 데이터베이스에서 삭제하시겠습니까?`)) {
        return;
      }
      try {
        const res = await fetch('/api/production/discard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', id: row.id }),
        });
        const json = await res.json();
        if (json.success) {
          showToast('폐기 내역이 삭제되었습니다.', 'success');
        } else {
          showToast(json.error || '삭제 실패', 'error');
          return;
        }
      } catch (err: any) {
        showToast('삭제 중 통신 오류가 발생했습니다.', 'error');
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
  };

  // 선택 행 일괄 저장
  const handleBatchSave = async () => {
    const targetRows = selectedRowIds.size > 0
      ? rows.filter((r) => selectedRowIds.has(r.id))
      : rows;

    if (targetRows.length === 0) {
      showToast('저장할 폐기 행이 없습니다.', 'warning');
      return;
    }

    // 유효성 검사: 품목명 및 수량 확인
    for (const r of targetRows) {
      if (!r.productName.trim() && !r.productCode.trim()) {
        showToast('품목명 또는 품목코드가 비어있는 행이 있습니다.', 'warning');
        return;
      }
      if (Number(r.discardQty) <= 0) {
        showToast(`'${r.productName || '선택 품목'}'의 폐기수량을 0보다 크게 입력하세요.`, 'warning');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/production/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch',
          rows: targetRows,
        }),
      });

      const json = await res.json();
      if (json.success) {
        showToast(json.message || `${json.count}건의 폐기 내역이 안전하게 저장되었습니다.`, 'success');
        void loadData(discardDate, selectedGyeId);
        setSelectedRowIds(new Set());
      } else {
        showToast(json.error || '저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (err: any) {
      console.error('Save error:', err);
      showToast('저장 중 네트워크 통신 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 엑셀 다운로드
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      showToast('내보낼 데이터가 없습니다.', 'warning');
      return;
    }

    const exportCols = [
      { key: 'no', label: 'No' },
      { key: 'discardDate', label: '폐기일자' },
      { key: 'gyeName', label: '공정(계)' },
      { key: 'category', label: '구분' },
      { key: 'productCode', label: '품목코드' },
      { key: 'productName', label: '품목명' },
      { key: 'spec', label: '규격' },
      { key: 'unit', label: '단위' },
      { key: 'discardQty', label: '폐기수량' },
      { key: 'unitPrice', label: '추정단가(원)' },
      { key: 'lossAmount', label: '손실금액(원)' },
      { key: 'reason', label: '불량사유' },
      { key: 'lotNo', label: 'LOT번호' },
      { key: 'expiryDate', label: '유통기한' },
      { key: 'remark', label: '비고' },
    ];

    exportGridToExcel({
      filename: `공정불량폐기등록_${discardDate}_${selectedGyeId}`,
      sheetName: '공정폐기내역',
      columns: exportCols,
      data: filteredRows.map((r, idx) => ({
        ...r,
        no: idx + 1,
      })),
    });

    showToast('엑셀 파일이 성공적으로 다운로드되었습니다.', 'success');
  };

  // 체크박스 전체 선택/해제
  const handleToggleSelectAll = () => {
    if (selectedRowIds.size === filteredRows.length && filteredRows.length > 0) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredRows.map((r) => r.id)));
    }
  };

  const handleToggleRowSelect = (id: number) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── 9. 품목 마스터 모달 핸들러 ──
  const filteredModalItems = useMemo(() => {
    return masterItems.filter((m) => {
      if (modalCategory !== '전체' && m.category !== modalCategory) return false;
      if (modalSearch.trim()) {
        const kw = modalSearch.toLowerCase();
        const mName = m.name.toLowerCase().includes(kw);
        const mCode = m.productCode.toLowerCase().includes(kw);
        if (!mName && !mCode) return false;
      }
      return true;
    });
  }, [masterItems, modalCategory, modalSearch]);

  const handleAddSelectedFromModal = () => {
    if (modalSelectedItems.size === 0) {
      showToast('추가할 품목을 선택하세요.', 'warning');
      return;
    }

    const defaultGye = currentGye || gyeList[0] || { id: 'GFS005', name: '성형장(김밥)' };
    const newRows: DiscardRow[] = [];

    masterItems
      .filter((m) => modalSelectedItems.has(m.productCode))
      .forEach((m) => {
        newRows.push({
          id: -Date.now() - Math.floor(Math.random() * 100000),
          discardDate,
          gyeId: defaultGye.id,
          gyeName: defaultGye.name,
          category: m.category || '반제품',
          productCode: m.productCode,
          productName: m.name,
          spec: m.spec || '',
          unit: m.unit || 'kg',
          discardQty: 1, // 기본 1
          unitPrice: m.unitPrice || 0,
          lossAmount: m.unitPrice || 0,
          reason: DISCARD_REASONS[0],
          lotNo: '',
          expiryDate: '',
          remark: '',
          deductInventory: true,
          currentStock: m.currentStock || 0,
        });
      });

    setRows((prev) => [...newRows, ...prev]);
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      newRows.forEach((r) => next.add(r.id));
      return next;
    });

    setIsModalOpen(false);
    setModalSelectedItems(new Set());
    setModalSearch('');
    showToast(`${newRows.length}개 품목이 폐기 목록에 추가되었습니다.`, 'success');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px] font-sans">
      {/* ── 1. 상단 타이틀 액션 바 ── */}
      <ProductionActionBar
        title="공정 불량/폐기 등록"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', onClick: () => void loadData(discardDate, selectedGyeId) },
          { key: 'plus', label: '행추가', icon: 'plus', onClick: handleAddBlankRow },
          { key: 'save', label: saving ? '저장중...' : '일괄저장', icon: 'save', onClick: handleBatchSave, disabled: saving },
          { key: 'excel', label: '엑셀', icon: 'excel', onClick: handleExportExcel },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: () => void loadData(kstToday(), 'ALL') },
        ]}
        helpContent="식품 제조 라인별(46개 계) 발생한 공정 불량, 이물 혼입, 조리 불량, 파손 폐기 실적을 등록하고 원자재 재고 차감 및 손실 금액을 실시간 계산합니다."
      />

      {/* ── 2. KPI 콕핏 배너 (4-Card) ── */}
      <div className="grid grid-cols-4 gap-2.5 p-2 bg-[#f1f5f9] border-b border-[#cbd5e1] shrink-0">
        {/* Card 1: 등록 건수 */}
        <div className="bg-white border border-[#94a3b8] rounded-xs p-2.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
              <Boxes size={14} className="text-blue-600" />
              금일 폐기 등록
            </div>
            <div className="text-[18px] font-black text-slate-900 mt-0.5 tracking-tight">
              {kpiStats.totalRecords.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">건</span>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
            {discardDate}
          </span>
        </div>

        {/* Card 2: 총 폐기 수량/중량 */}
        <div className="bg-white border border-[#94a3b8] rounded-xs p-2.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
              <TrendingDown size={14} className="text-rose-600" />
              총 폐기 수량·중량
            </div>
            <div className="text-[18px] font-black text-rose-700 mt-0.5 tracking-tight">
              {kpiStats.totalQty.toLocaleString()} <span className="text-[11px] font-medium text-slate-500">kg/ea</span>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded">
            공정 로스
          </span>
        </div>

        {/* Card 3: 추정 손실 금액 */}
        <div className="bg-white border border-[#94a3b8] rounded-xs p-2.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-600" />
              추정 폐기 손실액
            </div>
            <div className="text-[18px] font-black text-amber-700 mt-0.5 tracking-tight">
              ₩{kpiStats.totalLoss.toLocaleString()}
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">
            원가 반영
          </span>
        </div>

        {/* Card 4: 최다 불량 공정 & 주요 원인 */}
        <div className="bg-white border border-[#94a3b8] rounded-xs p-2.5 flex items-center justify-between shadow-2xs">
          <div className="min-w-0 pr-2">
            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
              <Factory size={14} className="text-emerald-600" />
              최다 불량 공정 / 주원인
            </div>
            <div className="text-[13px] font-bold text-slate-800 mt-1 truncate">
              {kpiStats.topGye.name} <span className="text-slate-400 font-normal">|</span> {kpiStats.topReason.name}
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded shrink-0">
            집중 관리
          </span>
        </div>
      </div>

      {/* ── 3. 검색 및 필터 컨트롤 바 ── */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-inner shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* 폐기일자 선택 */}
          <div className="flex items-center gap-1 bg-white border border-gray-300 rounded px-1.5 py-0.5 shadow-2xs">
            <Calendar size={13} className="text-blue-700" />
            <span className="text-[11px] font-bold text-gray-700">폐기일:</span>
            <input
              type="date"
              value={discardDate}
              onChange={(e) => setDiscardDate(e.target.value)}
              className="bg-transparent text-[11px] font-bold text-blue-900 outline-none w-[105px] cursor-pointer"
            />
          </div>

          {/* 일자 프리셋 버튼 */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDiscardDate(kstToday())}
              className={`px-2 py-0.5 text-[11px] font-bold rounded border transition-colors ${
                discardDate === kstToday()
                  ? 'bg-blue-600 text-white border-blue-700'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setDiscardDate(shiftDays(kstToday(), -1))}
              className="px-2 py-0.5 text-[11px] font-medium rounded border bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
            >
              어제
            </button>
            <button
              type="button"
              onClick={() => setDiscardDate(shiftDays(kstToday(), -7))}
              className="px-2 py-0.5 text-[11px] font-medium rounded border bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
            >
              7일전
            </button>
          </div>

          <div className="h-4 w-px bg-gray-300 mx-1" />

          {/* 공정 계 드롭다운 */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-gray-600">공정(계):</span>
            <select
              value={selectedGyeId}
              onChange={(e) => setSelectedGyeId(e.target.value)}
              className="bg-white border border-gray-300 rounded px-2 py-0.5 text-[11px] font-bold text-slate-800 shadow-2xs outline-none cursor-pointer"
            >
              <option value="ALL">전체 공정 (46개 라인)</option>
              {gyeList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id} - {g.name} {g.count > 0 ? `(${g.count}건)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 구분 탭 */}
          <div className="flex items-center bg-gray-200 p-0.5 rounded border border-gray-300">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 불량 사유 필터 */}
          <select
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
            className="bg-white border border-gray-300 rounded px-2 py-0.5 text-[11px] text-slate-700 shadow-2xs outline-none cursor-pointer"
          >
            <option value="ALL">전체 불량 사유</option>
            {DISCARD_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* 우측 퀵 검색 및 마스터 검색 팝업 버튼 */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-2 text-gray-400" />
            <input
              type="text"
              placeholder="품목명·코드·LOT 검색..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="bg-white border border-gray-300 rounded pl-6 pr-2 py-0.5 text-[11px] w-[170px] shadow-2xs outline-none focus:border-blue-500"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="absolute right-1.5 top-1.5 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-[11px] font-bold rounded border border-emerald-700 shadow-xs flex items-center gap-1.5 cursor-pointer active:translate-y-px"
          >
            <Sparkles size={12} />
            품목 마스터 검색 추가
          </button>
        </div>
      </div>

      {/* ── 4. 좌우 2분할 메인 레이아웃 (좌측 공정 목록 vs 우측 세부 그리드) ── */}
      <div className="flex-1 flex min-h-0 p-2 gap-2">
        {/* ── 좌측 패널: 46개 계 마스터 목록 & 일자별 불량 현황 ── */}
        <div className="w-[300px] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded-xs shadow-xs shrink-0">
          <div className="bg-[#dfe3ec] px-2.5 py-1.5 flex items-center justify-between border-b border-[#b0b8c8]">
            <span className="font-bold text-gray-800 flex items-center gap-1.5">
              <Factory size={13} className="text-blue-700" />
              공정 계 마스터 현황
            </span>
            <span className="text-[10px] font-mono text-gray-600 font-bold bg-white px-1.5 py-0.2 rounded border border-gray-300">
              {filteredGyeList.length}개 라인
            </span>
          </div>

          {/* 계 검색 입력창 */}
          <div className="p-1.5 border-b border-gray-200 bg-slate-50">
            <input
              type="text"
              placeholder="공정명·코드 필터..."
              value={gyeSearchText}
              onChange={(e) => setGyeSearchText(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-2 py-0.5 text-[11px] outline-none focus:border-blue-500"
            />
          </div>

          {/* 계 목록 리스트 */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {/* 전체 선택 옵션 */}
            <div
              onClick={() => setSelectedGyeId('ALL')}
              className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                selectedGyeId === 'ALL'
                  ? 'bg-blue-100 border-l-4 border-blue-600 text-blue-900 font-bold'
                  : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span className="text-[12px]">전체 공정 통합 보기</span>
              </div>
              <span className="text-[11px] font-bold text-blue-700">
                {rows.length}건
              </span>
            </div>

            {filteredGyeList.map((g) => {
              const isSelected = selectedGyeId === g.id;
              const hasDiscard = g.count > 0;
              return (
                <div
                  key={g.id}
                  onClick={() => setSelectedGyeId(g.id)}
                  className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-100 border-l-4 border-blue-600 text-blue-900 font-bold'
                      : hasDiscard
                      ? 'bg-rose-50/70 hover:bg-rose-100/70 text-gray-900'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-1">
                    <span className="text-[10px] font-mono text-gray-400 shrink-0">
                      {g.id}
                    </span>
                    <span className="text-[12px] truncate">{g.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasDiscard ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 bg-rose-100 text-rose-700 border border-rose-300 rounded font-mono">
                        {g.totalQty}kg ({g.count}건)
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 font-mono">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 좌측 하단 공정 서머리 바 */}
          <div className="bg-slate-100 p-2 border-t border-gray-200 text-[11px] flex justify-between items-center text-gray-600">
            <span>선택 공정:</span>
            <span className="font-bold text-blue-700 truncate max-w-[190px]">
              {selectedGyeId === 'ALL' ? '전체 공정' : `${currentGye?.id} - ${currentGye?.name}`}
            </span>
          </div>
        </div>

        {/* ── 우측 패널: 세부 불량/폐기 등록 & 조회 그리드 ── */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded-xs shadow-xs">
          {/* 그리드 상단 툴바 */}
          <div className="bg-[#dfe3ec] px-3 py-1.5 flex items-center justify-between border-b border-[#b0b8c8] shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">세부 불량/폐기 등록 명세</span>
              <span className="text-[11px] text-blue-800 bg-blue-100 px-2 py-0.2 rounded border border-blue-300 font-bold">
                {selectedGyeId === 'ALL' ? '전체 공정' : currentGye?.name}
              </span>
              <span className="text-[11px] text-gray-600">
                조회: <span className="font-bold text-blue-700">{filteredRows.length}</span>건
                {selectedRowIds.size > 0 && (
                  <span className="ml-1 text-emerald-700 font-bold">
                    (선택 {selectedRowIds.size}건)
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAddBlankRow}
                className="px-2 py-0.5 bg-white hover:bg-gray-100 text-slate-800 text-[11px] font-bold rounded border border-gray-300 shadow-2xs flex items-center gap-1"
              >
                <Plus size={11} className="text-blue-700" />
                행추가
              </button>
              <button
                type="button"
                onClick={handleBatchSave}
                disabled={saving || filteredRows.length === 0}
                className={`px-2.5 py-0.5 text-[11px] font-bold rounded border shadow-2xs flex items-center gap-1 transition-colors ${
                  saving
                    ? 'bg-gray-400 text-white cursor-not-allowed border-gray-500'
                    : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700'
                }`}
              >
                <Save size={11} />
                {saving ? '저장중...' : '선택저장'}
              </button>
            </div>
          </div>

          {/* 메인 테이블 */}
          <div className="flex-1 overflow-auto min-h-0 relative">
            <table className="w-full border-collapse text-[11px]">
              <thead className="bg-[#eaeef5] sticky top-0 z-10 border-b border-[#b8c2d3] shadow-2xs">
                <tr className="text-gray-700 font-bold text-center h-7 select-none">
                  <th className="w-8 border-r border-[#cbd5e1] p-1">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.size === filteredRows.length && filteredRows.length > 0}
                      onChange={handleToggleSelectAll}
                      className="rounded cursor-pointer"
                    />
                  </th>
                  <th className="w-9 border-r border-[#cbd5e1]">No</th>
                  <th className="w-20 border-r border-[#cbd5e1]">일자</th>
                  <th className="w-32 border-r border-[#cbd5e1]">공정(계)</th>
                  <th className="w-14 border-r border-[#cbd5e1]">구분</th>
                  <th className="w-24 border-r border-[#cbd5e1]">품목코드</th>
                  <th className="min-w-[200px] border-r border-[#cbd5e1] text-left px-2">품목명</th>
                  <th className="w-16 border-r border-[#cbd5e1]">규격</th>
                  <th className="w-12 border-r border-[#cbd5e1]">단위</th>
                  <th className="w-20 border-r border-[#cbd5e1] bg-rose-50 text-rose-800">폐기수량</th>
                  <th className="w-20 border-r border-[#cbd5e1] text-right px-2">추정단가</th>
                  <th className="w-24 border-r border-[#cbd5e1] text-right px-2 bg-amber-50 text-amber-800">손실금액</th>
                  <th className="w-40 border-r border-[#cbd5e1]">불량/폐기 사유</th>
                  <th className="w-20 border-r border-[#cbd5e1]">LOT번호</th>
                  <th className="w-20 border-r border-[#cbd5e1]">유통기한</th>
                  <th className="w-16 border-r border-[#cbd5e1]" title="체크 시 원자재 재고에서 수량 차감">재고차감</th>
                  <th className="min-w-[120px] border-r border-[#cbd5e1] text-left px-2">비고</th>
                  <th className="w-10">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={18} className="py-12 text-center text-gray-500 font-medium">
                      데이터를 불러오는 중입니다...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="py-12 text-center text-gray-400">
                      등록된 공정 불량/폐기 내역이 없습니다. 상단의 [행추가] 또는 [품목 마스터 검색]을 눌러 등록하세요.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r, idx) => {
                    const isChecked = selectedRowIds.has(r.id);
                    const isNew = r.id < 0;

                    return (
                      <tr
                        key={r.id}
                        className={`hover:bg-blue-50/60 transition-colors h-7 ${
                          isChecked ? 'bg-blue-50/80' : isNew ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        {/* 체크박스 */}
                        <td className="text-center border-r border-gray-200">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleRowSelect(r.id)}
                            className="rounded cursor-pointer"
                          />
                        </td>

                        {/* No */}
                        <td className="text-center font-mono text-gray-500 border-r border-gray-200">
                          {idx + 1}
                        </td>

                        {/* 일자 */}
                        <td className="text-center font-mono border-r border-gray-200 px-1">
                          <input
                            type="date"
                            value={r.discardDate}
                            onChange={(e) => handleUpdateRow(r.id, 'discardDate', e.target.value)}
                            className="w-full text-center bg-transparent border-0 outline-none text-[10px]"
                          />
                        </td>

                        {/* 공정(계) 선택 */}
                        <td className="border-r border-gray-200 px-1">
                          <select
                            value={r.gyeId}
                            onChange={(e) => handleUpdateRow(r.id, 'gyeId', e.target.value)}
                            className="w-full bg-transparent border-0 text-[11px] font-bold text-slate-800 outline-none cursor-pointer truncate"
                          >
                            {gyeList.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 구분 */}
                        <td className="text-center border-r border-gray-200 font-semibold text-slate-600">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] ${
                              r.category === '완성품'
                                ? 'bg-purple-100 text-purple-700'
                                : r.category === '반제품'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {r.category}
                          </span>
                        </td>

                        {/* 품목코드 */}
                        <td className="text-center font-mono text-gray-600 border-r border-gray-200 px-1">
                          <input
                            type="text"
                            value={r.productCode}
                            onChange={(e) => handleUpdateRow(r.id, 'productCode', e.target.value)}
                            placeholder="코드 입력"
                            className="w-full text-center bg-transparent border-0 outline-none font-mono"
                          />
                        </td>

                        {/* 품목명 */}
                        <td className="border-r border-gray-200 px-2 font-medium text-slate-900">
                          <input
                            type="text"
                            value={r.productName}
                            onChange={(e) => handleUpdateRow(r.id, 'productName', e.target.value)}
                            placeholder="품목명을 입력하거나 마스터에서 선택..."
                            className="w-full bg-transparent border-0 outline-none font-medium text-slate-900 focus:bg-white"
                          />
                        </td>

                        {/* 규격 */}
                        <td className="text-center text-gray-500 border-r border-gray-200 px-1">
                          <input
                            type="text"
                            value={r.spec}
                            onChange={(e) => handleUpdateRow(r.id, 'spec', e.target.value)}
                            className="w-full text-center bg-transparent border-0 outline-none"
                          />
                        </td>

                        {/* 단위 */}
                        <td className="text-center text-gray-500 border-r border-gray-200 px-1">
                          <input
                            type="text"
                            value={r.unit}
                            onChange={(e) => handleUpdateRow(r.id, 'unit', e.target.value)}
                            className="w-full text-center bg-transparent border-0 outline-none font-bold"
                          />
                        </td>

                        {/* 폐기수량 (인라인 편집) */}
                        <td className="border-r border-gray-200 px-1 bg-rose-50/50">
                          <input
                            type="number"
                            step="0.1"
                            value={r.discardQty === 0 ? '' : r.discardQty}
                            onChange={(e) => handleUpdateRow(r.id, 'discardQty', e.target.value)}
                            placeholder="0"
                            className="w-full text-right font-bold text-rose-700 bg-transparent border-0 outline-none font-mono"
                          />
                        </td>

                        {/* 추정단가 */}
                        <td className="text-right font-mono text-gray-600 border-r border-gray-200 px-2">
                          ₩{r.unitPrice.toLocaleString()}
                        </td>

                        {/* 손실금액 */}
                        <td className="text-right font-mono font-bold text-amber-700 border-r border-gray-200 px-2 bg-amber-50/50">
                          ₩{r.lossAmount.toLocaleString()}
                        </td>

                        {/* 불량/폐기 사유 */}
                        <td className="border-r border-gray-200 px-1">
                          <select
                            value={r.reason}
                            onChange={(e) => handleUpdateRow(r.id, 'reason', e.target.value)}
                            className="w-full bg-transparent border-0 text-[11px] outline-none text-slate-800 cursor-pointer"
                          >
                            {DISCARD_REASONS.map((reason) => (
                              <option key={reason} value={reason}>
                                {reason}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* LOT번호 */}
                        <td className="border-r border-gray-200 px-1">
                          <input
                            type="text"
                            value={r.lotNo}
                            onChange={(e) => handleUpdateRow(r.id, 'lotNo', e.target.value)}
                            placeholder="LOT"
                            className="w-full text-center bg-transparent border-0 outline-none text-[10px]"
                          />
                        </td>

                        {/* 유통기한 */}
                        <td className="border-r border-gray-200 px-1">
                          <input
                            type="text"
                            value={r.expiryDate}
                            onChange={(e) => handleUpdateRow(r.id, 'expiryDate', e.target.value)}
                            placeholder="YYYY-MM-DD"
                            className="w-full text-center bg-transparent border-0 outline-none text-[10px]"
                          />
                        </td>

                        {/* 재고차감 체크 */}
                        <td className="text-center border-r border-gray-200">
                          <input
                            type="checkbox"
                            checked={r.deductInventory}
                            onChange={(e) => handleUpdateRow(r.id, 'deductInventory', e.target.checked)}
                            className="rounded cursor-pointer"
                            title="저장 시 Inventory 재고에서 차감"
                          />
                        </td>

                        {/* 비고 */}
                        <td className="border-r border-gray-200 px-2">
                          <input
                            type="text"
                            value={r.remark}
                            onChange={(e) => handleUpdateRow(r.id, 'remark', e.target.value)}
                            placeholder="특이사항..."
                            className="w-full bg-transparent border-0 outline-none text-gray-700 text-[11px]"
                          />
                        </td>

                        {/* 단건 삭제 */}
                        <td className="text-center p-0.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(r)}
                            className="text-gray-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                            title="삭제"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 그리드 하단 요약 합계 바 */}
          <div className="bg-[#eaeef5] px-4 py-2 border-t border-[#b8c2d3] flex items-center justify-between text-[11px] font-bold text-gray-700 shrink-0">
            <div className="flex items-center gap-4">
              <span>
                조회 합계: <span className="text-blue-700">{filteredRows.length}</span> 품목
              </span>
              <span>
                총 폐기수량: <span className="text-rose-700 font-mono">{filteredRows.reduce((acc, r) => acc + (Number(r.discardQty) || 0), 0).toFixed(2)}</span> kg/ea
              </span>
              <span>
                총 손실금액: <span className="text-amber-700 font-mono">₩{filteredRows.reduce((acc, r) => acc + (Number(r.lossAmount) || 0), 0).toLocaleString()}</span>
              </span>
            </div>

            <div className="text-[10px] text-gray-500 font-normal">
              * 재고차감 체크 시 저장 버튼 클릭 시점에 원자재 재고(Inventory)에서 실시간 차감 처리됩니다.
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. 품목 마스터 검색 모달 (1,098개 품목 연동) ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-md shadow-2xl border border-gray-300 w-[840px] max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            {/* 모달 헤더 */}
            <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-emerald-400" />
                <span className="font-bold text-[13px]">품목 마스터 검색 및 폐기 추가</span>
                <span className="text-[11px] text-slate-400 font-normal">
                  (총 {masterItems.length}개 품목 마스터)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* 모달 필터 바 */}
            <div className="bg-slate-50 border-b border-gray-200 p-3 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setModalCategory(cat)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded border transition-colors ${
                      modalCategory === cat
                        ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative w-72">
                <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="품목명 또는 품목코드 검색..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded pl-8 pr-3 py-1 text-[11px] outline-none focus:border-blue-500 shadow-2xs"
                  autoFocus
                />
              </div>
            </div>

            {/* 모달 품목 테이블 */}
            <div className="flex-1 overflow-y-auto p-2 min-h-0">
              <table className="w-full border-collapse text-[11px]">
                <thead className="bg-slate-100 sticky top-0 border-b border-gray-300">
                  <tr className="text-gray-700 font-bold h-7">
                    <th className="w-9 text-center p-1">선택</th>
                    <th className="w-24 text-center">품목코드</th>
                    <th className="w-16 text-center">구분</th>
                    <th className="text-left px-2">품목명</th>
                    <th className="w-20 text-center">규격</th>
                    <th className="w-12 text-center">단위</th>
                    <th className="w-24 text-right px-2">단가(원)</th>
                    <th className="w-20 text-right px-2">현재고</th>
                    <th className="w-16 text-center">보관창고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredModalItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-gray-400">
                        검색 조건에 일치하는 품목이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredModalItems.slice(0, 100).map((m) => {
                      const isSel = modalSelectedItems.has(m.productCode);
                      return (
                        <tr
                          key={m.id}
                          onClick={() => {
                            setModalSelectedItems((prev) => {
                              const next = new Set(prev);
                              if (next.has(m.productCode)) next.delete(m.productCode);
                              else next.add(m.productCode);
                              return next;
                            });
                          }}
                          className={`hover:bg-blue-50 cursor-pointer h-7 transition-colors ${
                            isSel ? 'bg-blue-50 font-bold' : ''
                          }`}
                        >
                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => {}}
                              className="rounded cursor-pointer"
                            />
                          </td>
                          <td className="text-center font-mono text-gray-500">{m.productCode}</td>
                          <td className="text-center">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] ${
                                m.category === '완성품'
                                  ? 'bg-purple-100 text-purple-700'
                                  : m.category === '반제품'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {m.category}
                            </span>
                          </td>
                          <td className="px-2 font-medium text-slate-900">{m.name}</td>
                          <td className="text-center text-gray-500">{m.spec || '-'}</td>
                          <td className="text-center font-bold text-gray-600">{m.unit}</td>
                          <td className="text-right font-mono text-slate-800 px-2">
                            ₩{m.unitPrice.toLocaleString()}
                          </td>
                          <td className="text-right font-mono text-blue-700 px-2">
                            {m.currentStock > 0 ? m.currentStock.toLocaleString() : '-'}
                          </td>
                          <td className="text-center text-[10px] text-gray-500">{m.warehouse || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {filteredModalItems.length > 100 && (
                <div className="py-2 text-center text-[11px] text-gray-400">
                  (상위 100건만 표시됩니다. 상세 검색어를 입력해 범위를 좁히세요.)
                </div>
              )}
            </div>

            {/* 모달 풋터 */}
            <div className="bg-slate-50 border-t border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-gray-600">
                선택된 품목: <span className="font-bold text-blue-700">{modalSelectedItems.size}</span>개
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1 bg-white border border-gray-300 rounded text-[11px] text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleAddSelectedFromModal}
                  disabled={modalSelectedItems.size === 0}
                  className={`px-4 py-1 text-[11px] font-bold rounded border shadow-xs cursor-pointer ${
                    modalSelectedItems.size === 0
                      ? 'bg-gray-300 text-gray-500 border-gray-300 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                  }`}
                >
                  선택 품목 폐기 목록에 추가 ({modalSelectedItems.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
