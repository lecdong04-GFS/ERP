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
  Layers,
  ArrowRight,
  TrendingUp,
  X,
  Sparkles,
  HelpCircle,
  Warehouse,
  Factory,
} from 'lucide-react';
import { InventoryActionBar } from '@/components/inventory/common/InventoryActionBar';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { INVENTORY_GYE_LIST } from '@/components/inventory/data/inventoryMasterData';
import { exportGridToExcel } from '@/lib/excelExport';

// 추가불출 등록 행 인터페이스
interface ExtraIssueRegRow {
  id: number;
  dbId?: number; // DB에 이미 저장된 레코드인 경우
  warehouse: string;
  category: string;
  itemCode: string;
  itemName: string;
  spec: string;
  unit: string;
  currentStock: number;
  unitPrice: number;
  targetGyeId: string;
  targetGyeName: string;
  issueQty: number;
  amount: number;
  issueReason: string;
  status: string; // '완료' | '요청'
  remark: string;
}

// 마스터 재고 품목 (검색 모달용)
interface InventoryMasterItem {
  id: number;
  warehouse: string;
  category: string;
  supplier: string;
  itemCode: string;
  itemName: string;
  spec?: string;
  unit: string;
  currentStock: number;
  unitPrice: number;
  boxUnitQty: number;
}

const COMMON_REASONS = [
  '공정 로스 보충',
  '원료 불량 교체',
  '배합 손실 보충',
  '긴급 주문 증산',
  '포장라인 파손 보충',
  '규격 미달 교체',
  '라인 테스트 소요',
];

const WAREHOUSE_TABS = ['전체', '냉장1', '냉장2', '냉동', '상온', '부자재'];

function kstToday(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export const MatExtraIssueRegView: React.FC = () => {
  // ── 검색 및 툴바 상태 ──
  const [issueDate, setIssueDate] = useState<string>(() => kstToday());
  const [activeWhTab, setActiveWhTab] = useState<string>('전체');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [defaultGyeId, setDefaultGyeId] = useState<string>('GFS005'); // 성형장(김밥)
  const [defaultReason, setDefaultReason] = useState<string>('공정 로스 보충');

  // ── 데이터 상태 ──
  const [rows, setRows] = useState<ExtraIssueRegRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // ── 재고 마스터 (606개 캐시 & 품목 선택 모달) ──
  const [masterInventory, setMasterInventory] = useState<InventoryMasterItem[]>([]);
  const [showItemModal, setShowItemModal] = useState<boolean>(false);
  const [modalSearch, setModalSearch] = useState<string>('');
  const [modalWhFilter, setModalWhFilter] = useState<string>('전체');
  const [modalSelectedCodes, setModalSelectedCodes] = useState<string[]>([]);

  // ── 1. 마스터 재고 캐시 로드 (606개 품목) ──
  useEffect(() => {
    fetch('/api/inventory/stocktake')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const mapped: InventoryMasterItem[] = json.data.map((inv: any) => ({
            id: inv.id,
            warehouse: inv.warehouse || '상온',
            category: inv.category || '원재료',
            supplier: inv.supplier || '',
            itemCode: inv.itemCode || '',
            itemName: inv.itemName || '',
            spec: inv.spec || '',
            unit: inv.unit || '봉',
            currentStock: Number(inv.currentStock || inv.bookQty || 0),
            unitPrice: Number(inv.unitPrice || 0),
            boxUnitQty: Number(inv.boxUnitQty || 1),
          }));
          setMasterInventory(mapped);
        }
      })
      .catch((err) => console.error('Failed to load inventory master:', err));
  }, []);

  // ── 2. 해당 일자의 추가불출 기록 로드 ──
  const loadExtraIssues = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/inventory/extra-issue?issueDate=${issueDate}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const list: ExtraIssueRegRow[] = json.data.map((item: any, idx: number) => ({
          id: idx + 1,
          dbId: item.id,
          warehouse: item.warehouse || '상온',
          category: item.category || '원재료',
          itemCode: item.productCode || '',
          itemName: item.productName || '',
          spec: item.spec || '표준규격',
          unit: item.unit || '봉',
          currentStock: item.currentStock || 0,
          unitPrice: item.unitPrice || 0,
          targetGyeId: item.gyeId || 'GFS005',
          targetGyeName: item.gyeName || '성형장(김밥)',
          issueQty: Number(item.issueQty) || 0,
          amount: item.amount || Math.round((Number(item.issueQty) || 0) * (item.unitPrice || 0)),
          issueReason: item.reason || '공정 로스 보충',
          status: item.status || '완료',
          remark: item.remark || '',
        }));
        setRows(list);
      } else {
        // 해당 일자에 아직 등록된 추가불출이 없으면, 실데이터 기반 3개 샘플 제안
        if (masterInventory.length > 0) {
          const sample1 = masterInventory.find((i) => i.warehouse === '상온' && i.currentStock > 0) || masterInventory[0];
          const sample2 = masterInventory.find((i) => i.warehouse === '냉장1' && i.currentStock > 0) || masterInventory[1];
          const sample3 = masterInventory.find((i) => i.warehouse === '부자재' && i.currentStock > 0) || masterInventory[2];

          const samples = [sample1, sample2, sample3].filter(Boolean).map((inv, idx) => ({
            id: idx + 1,
            warehouse: inv.warehouse,
            category: inv.category,
            itemCode: inv.itemCode,
            itemName: inv.itemName,
            spec: inv.spec || '표준규격',
            unit: inv.unit,
            currentStock: inv.currentStock,
            unitPrice: inv.unitPrice,
            targetGyeId: idx === 0 ? 'GFS005' : idx === 1 ? 'GFS007' : 'GFS004',
            targetGyeName: idx === 0 ? '성형장(김밥)' : idx === 1 ? '성형장(삼각김밥)' : '성형장(도시락)',
            issueQty: 0,
            amount: 0,
            issueReason: COMMON_REASONS[idx % COMMON_REASONS.length],
            status: '요청',
            remark: '',
          }));
          setRows(samples);
        } else {
          setRows([]);
        }
      }
    } catch (err: any) {
      console.error('Failed to load extra issues:', err);
      setStatusMessage({ type: 'error', text: err.message || '데이터 로드 실패' });
    } finally {
      setIsLoading(false);
    }
  }, [issueDate, masterInventory]);

  useEffect(() => {
    loadExtraIssues();
  }, [loadExtraIssues]);

  // ── 3. 수량 및 필드 인라인 변경 ──
  const handleQtyChange = (id: number, val: string) => {
    const qty = Math.max(0, Number(val) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          return {
            ...r,
            issueQty: qty,
            amount: Math.round(qty * r.unitPrice),
          };
        }
        return r;
      })
    );
  };

  const handleFieldChange = (id: number, field: keyof ExtraIssueRegRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          if (field === 'targetGyeId') {
            const foundGye = INVENTORY_GYE_LIST.find((g) => g.id === value);
            return {
              ...r,
              targetGyeId: value,
              targetGyeName: foundGye?.name || value,
            };
          }
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  // ── 4. 품목 추가 모달에서 선택한 품목들을 그리드에 삽입 ──
  const handleAddItemsFromModal = () => {
    if (modalSelectedCodes.length === 0) {
      alert('추가할 품목을 선택해주세요.');
      return;
    }

    const defaultGye = INVENTORY_GYE_LIST.find((g) => g.id === defaultGyeId) || INVENTORY_GYE_LIST[0];
    const newItems: ExtraIssueRegRow[] = [];
    let nextId = rows.length > 0 ? Math.max(...rows.map((r) => r.id)) + 1 : 1;

    modalSelectedCodes.forEach((code) => {
      // 이미 테이블에 존재하는지 확인
      const already = rows.find((r) => r.itemCode === code);
      if (already) return;

      const master = masterInventory.find((i) => i.itemCode === code);
      if (master) {
        newItems.push({
          id: nextId++,
          warehouse: master.warehouse,
          category: master.category,
          itemCode: master.itemCode,
          itemName: master.itemName,
          spec: master.spec || '표준규격',
          unit: master.unit,
          currentStock: master.currentStock,
          unitPrice: master.unitPrice,
          targetGyeId: defaultGye.id,
          targetGyeName: defaultGye.name,
          issueQty: 1, // 기본 1개 입력 권장
          amount: master.unitPrice * 1,
          issueReason: defaultReason,
          status: '요청',
          remark: '',
        });
      }
    });

    if (newItems.length > 0) {
      setRows((prev) => [...prev, ...newItems]);
      setStatusMessage({ type: 'info', text: `${newItems.length}개 품목이 추가불출 목록에 추가되었습니다. 불출수량을 확인하세요.` });
    }
    setShowItemModal(false);
    setModalSelectedCodes([]);
  };

  // ── 5. 행 삭제 (선택 삭제 및 개별 삭제) ──
  const handleDeleteRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) {
      alert('삭제할 행을 선택해주세요.');
      return;
    }
    if (!window.confirm(`선택한 ${selectedIds.length}개 품목을 목록에서 제외하시겠습니까?`)) return;
    setRows((prev) => prev.filter((r) => !selectedIds.includes(r.id)));
    setSelectedIds([]);
  };

  // ── 6. 불출 확정(저장) 파이프라인 ──
  const handleSave = async () => {
    const toSave = rows.filter((r) => r.issueQty > 0);
    if (toSave.length === 0) {
      alert('불출수량이 0보다 큰 항목이 없습니다. 불출수량을 입력해주세요.');
      return;
    }

    // 재고 초과 항목 확인 경고
    const overStockItems = toSave.filter((r) => r.issueQty > r.currentStock);
    if (overStockItems.length > 0) {
      const msg = `⚠️ 다음 품목의 불출수량이 현재 창고 재고보다 많습니다:\n${overStockItems
        .map((i) => `• ${i.itemName} (현재고: ${i.currentStock}, 불출: ${i.issueQty})`)
        .join('\n')}\n\n계속 진행하시겠습니까? (창고 현재고는 0으로 차감됩니다)`;
      if (!window.confirm(msg)) return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/inventory/extra-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch',
          issueDate,
          createdBy: '현장관리자',
          rows: toSave.map((r) => ({
            issueDate,
            gyeId: r.targetGyeId,
            gyeName: r.targetGyeName,
            productCode: r.itemCode,
            productName: r.itemName,
            category: r.category,
            warehouse: r.warehouse,
            issueQty: r.issueQty,
            unit: r.unit,
            unitPrice: r.unitPrice,
            reason: r.issueReason,
            status: '완료',
            remark: r.remark,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `✅ ${data.message || '자재 추가불출이 성공적으로 확정되었습니다.'}`,
        });
        // 상태를 '완료'로 업데이트
        setRows((prev) =>
          prev.map((r) => (r.issueQty > 0 ? { ...r, status: '완료' } : r))
        );
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

  // ── 7. 엑셀 내보내기 ──
  const handleExportExcel = () => {
    const exportColumns = [
      { key: 'no', label: 'No' },
      { key: 'warehouse', label: '출고창고' },
      { key: 'category', label: '구분' },
      { key: 'itemCode', label: '품번(ID)' },
      { key: 'itemName', label: '품명' },
      { key: 'spec', label: '규격' },
      { key: 'unit', label: '단위' },
      { key: 'currentStock', label: '현재고', format: 'number' },
      { key: 'targetGyeName', label: '요청계(공정)' },
      { key: 'issueQty', label: '불출수량', format: 'number' },
      { key: 'unitPrice', label: '단가(원)', format: 'currency' },
      { key: 'amount', label: '불출금액(원)', format: 'currency' },
      { key: 'issueReason', label: '불출사유' },
      { key: 'status', label: '상태' },
      { key: 'remark', label: '비고' },
    ];

    exportGridToExcel({
      filename: `자재추가불출등록_${issueDate}_${activeWhTab}`,
      sheetName: '추가불출등록',
      columns: exportColumns,
      data: filteredRows.map((r, idx) => ({ ...r, no: idx + 1 })),
    });
  };

  // ── 8. 필터링 및 서머리 계산 ──
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (activeWhTab !== '전체' && r.warehouse !== activeWhTab) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const matchName = r.itemName.toLowerCase().includes(kw);
        const matchCode = r.itemCode.toLowerCase().includes(kw);
        const matchGye = r.targetGyeName.toLowerCase().includes(kw);
        const matchReason = r.issueReason.toLowerCase().includes(kw);
        if (!matchName && !matchCode && !matchGye && !matchReason) return false;
      }
      return true;
    });
  }, [rows, activeWhTab, searchKeyword]);

  // 상단 콕핏 KPI 통계
  const kpiStats = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    let validCount = 0;
    const gyeMap: Record<string, number> = {};
    const reasonMap: Record<string, number> = {};

    rows.forEach((r) => {
      if (r.issueQty > 0) {
        validCount++;
        totalQty += r.issueQty;
        totalAmount += r.amount;

        gyeMap[r.targetGyeName] = (gyeMap[r.targetGyeName] || 0) + r.issueQty;
        reasonMap[r.issueReason] = (reasonMap[r.issueReason] || 0) + 1;
      }
    });

    // 최다 요청 공정
    const topGyeEntry = Object.entries(gyeMap).sort((a, b) => b[1] - a[1])[0];
    const topGye = topGyeEntry ? `${topGyeEntry[0]} (${topGyeEntry[1]})` : '미등록';

    // 최다 불출 사유
    const topReasonEntry = Object.entries(reasonMap).sort((a, b) => b[1] - a[1])[0];
    const topReason = topReasonEntry ? `${topReasonEntry[0]} (${topReasonEntry[1]}건)` : '공정 로스 보충';

    return {
      validCount,
      totalQty,
      totalAmount,
      topGye,
      topReason,
    };
  }, [rows]);

  // 창고별 카운트 맵
  const warehouseCounts = useMemo(() => {
    const counts: Record<string, number> = { '전체': rows.length, '냉장1': 0, '냉장2': 0, '냉동': 0, '상온': 0, '부자재': 0 };
    rows.forEach((r) => {
      if (counts[r.warehouse] !== undefined) counts[r.warehouse] += 1;
    });
    return counts;
  }, [rows]);

  // 모달용 필터링된 마스터 재고
  const modalFilteredItems = useMemo(() => {
    return masterInventory.filter((item) => {
      if (modalWhFilter !== '전체' && item.warehouse !== modalWhFilter) return false;
      if (modalSearch.trim()) {
        const kw = modalSearch.toLowerCase();
        const matchName = item.itemName.toLowerCase().includes(kw);
        const matchCode = item.itemCode.toLowerCase().includes(kw);
        const matchSupplier = item.supplier.toLowerCase().includes(kw);
        if (!matchName && !matchCode && !matchSupplier) return false;
      }
      return true;
    });
  }, [masterInventory, modalWhFilter, modalSearch]);

  // 액션바 버튼 구성
  const actionButtons = [
    {
      key: 'search',
      label: '조회',
      icon: 'search' as const,
      onClick: loadExtraIssues,
      disabled: isLoading || isSaving,
    },
    {
      key: 'save',
      label: '불출확정(저장)',
      icon: 'save' as const,
      onClick: handleSave,
      disabled: isSaving || rows.length === 0,
    },
    {
      key: 'add',
      label: '품목 추가',
      icon: 'new' as const,
      onClick: () => setShowItemModal(true),
      disabled: isSaving,
    },
    {
      key: 'delete',
      label: '선택 삭제',
      icon: 'delete' as const,
      onClick: handleDeleteSelected,
      disabled: selectedIds.length === 0 || isSaving,
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
      onClick: () => {
        if (window.confirm('추가불출 목록을 초기화하시겠습니까?')) {
          setRows([]);
          setSelectedIds([]);
        }
      },
      disabled: isSaving,
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px] font-sans overflow-hidden">
      {/* 1. 표준 인벤토리 액션바 */}
      <InventoryActionBar
        title="자재 추가불출 등록"
        buttons={actionButtons}
        helpContent="정규 작업지시(BOM 소요량) 외에 공정 로스, 불량 교체, 긴급 증산 등으로 인해 생산 라인에 추가 불출되는 자재를 등록합니다. [+ 품목 추가]를 눌러 606개 창고 재고에서 품목을 선택하고 불출수량을 입력한 뒤 [불출확정(저장)]을 누르면 창고 현재고가 즉시 차감됩니다."
      />

      {/* 알림 메시지 배너 */}
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
        {/* 카드 1: 오늘 불출 등록 품목 & 총량 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-blue-600" />
              오늘 추가불출 건수
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {issueDate}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-[18px] font-black font-mono text-slate-900 tracking-tight">
              {kpiStats.validCount}
              <span className="text-[11px] font-medium text-slate-500 ml-1">품목</span>
            </div>
            <div className="text-[12px] font-bold text-blue-700 font-mono">
              총 {kpiStats.totalQty.toLocaleString()} <span className="text-[10px] text-slate-500">수량</span>
            </div>
          </div>
        </div>

        {/* 카드 2: 불출 확정 총액 (원가 손실액) */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
              불출 확정 총액 (원가 추가액)
            </span>
            <span className="text-[10px] text-slate-400">단가 반영</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-[18px] font-black font-mono text-amber-700 tracking-tight">
              ₩ {kpiStats.totalAmount.toLocaleString()}
            </div>
            <span className="text-[10.5px] text-slate-500">제조원가 즉시 반영</span>
          </div>
        </div>

        {/* 카드 3: 최다 요청 공정 (계) */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Factory className="w-3.5 h-3.5 text-indigo-600" />
              최다 요청 공정 (계)
            </span>
            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1 py-0.2 rounded">
              생산라인
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-[14px] font-black text-slate-800 truncate" title={kpiStats.topGye}>
              {kpiStats.topGye}
            </div>
            <span className="text-[10px] text-slate-500">공정별 추적</span>
          </div>
        </div>

        {/* 카드 4: 최다 불출 사유 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              주요 불출 사유
            </span>
            <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1 py-0.2 rounded">
              원인 분석
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-[14px] font-black text-rose-700 truncate" title={kpiStats.topReason}>
              {kpiStats.topReason}
            </div>
            <span className="text-[10px] text-slate-500">로스 요인</span>
          </div>
        </div>
      </div>

      {/* 3. 창고 탭 & 필터/제어 툴바 */}
      <div className="bg-[#e2e8f0] border-b border-slate-300 px-3 flex items-center justify-between shrink-0 h-[38px]">
        {/* 창고 탭 */}
        <div className="flex items-center gap-1 h-full pt-1.5">
          {WAREHOUSE_TABS.map((tab) => {
            const isActive = activeWhTab === tab;
            const count = warehouseCounts[tab] || 0;
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
                    isActive ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
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
          {/* 불출일자 */}
          <div className="flex items-center bg-white border border-gray-300 rounded px-2 h-7 gap-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-600">불출일:</span>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="font-mono text-[11.5px] font-bold text-slate-800 outline-none bg-transparent cursor-pointer"
            />
            <button
              type="button"
              onClick={() => setIssueDate(kstToday())}
              className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-1 py-0.5 rounded cursor-pointer border border-slate-300"
            >
              오늘
            </button>
          </div>

          {/* 기본 투입계 일괄지정 */}
          <div className="flex items-center bg-white border border-gray-300 rounded px-2 h-7 gap-1 shadow-2xs">
            <span className="text-[10.5px] text-slate-500 font-bold">기본계:</span>
            <select
              value={defaultGyeId}
              onChange={(e) => setDefaultGyeId(e.target.value)}
              className="text-[11px] font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
            >
              {INVENTORY_GYE_LIST.slice(0, 15).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* 품목 추가 모달 버튼 */}
          <button
            type="button"
            onClick={() => setShowItemModal(true)}
            className="flex items-center gap-1 h-7 px-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-[11px] border border-blue-700 cursor-pointer shadow-xs active:translate-y-px"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            품목 추가
          </button>

          {/* 실시간 검색 */}
          <div className="relative">
            <input
              type="text"
              placeholder="품명 / 품번 / 공정 / 사유..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="h-7 w-[190px] pl-2.5 pr-7 bg-white border border-gray-300 rounded text-[11.5px] outline-none focus:border-blue-500 shadow-inner"
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
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[32px] bg-[#e2e8f0]">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === filteredRows.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(filteredRows.map((r) => r.id));
                        else setSelectedIds([]);
                      }}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[40px] bg-[#e2e8f0] text-[11px]">No</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[72px]">출고창고</th>
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[60px]">구분</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[85px] font-mono">품번(ID)</th>
                  <th className="border border-[#cbd5e1] px-3 py-1 min-w-[240px] text-left">품목명</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[100px]">규격</th>
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[45px]">단위</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[80px] text-right bg-slate-100">현재고</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 min-w-[150px] text-left bg-indigo-50/80 text-indigo-950">
                    요청 계(공정)
                  </th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[85px] bg-[#dbeafe] text-blue-900">
                    불출수량
                  </th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[75px] text-right">단가(원)</th>
                  <th className="border border-[#cbd5e1] px-2.5 py-1 w-[95px] text-right bg-amber-50/70 text-amber-950">
                    불출금액
                  </th>
                  <th className="border border-[#cbd5e1] px-2 py-1 min-w-[150px] text-left">불출사유</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[65px] text-center">상태</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 min-w-[120px] text-left">비고</th>
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[40px]">삭제</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={17} className="py-24 text-center text-gray-500 font-medium">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>추가불출 데이터를 로드 중입니다...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="py-24 text-center text-gray-400 font-medium italic">
                      등록된 추가불출 품목이 없습니다. 상단 [+ 품목 추가] 버튼을 눌러 자재를 등록하세요.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r, idx) => {
                    const isSelected = selectedIds.includes(r.id);
                    const isShortage = r.currentStock < r.issueQty;

                    return (
                      <tr
                        key={r.id}
                        className={`h-[28px] border-b border-gray-200 transition-colors ${
                          isSelected
                            ? 'bg-blue-50/80'
                            : isShortage
                            ? 'bg-rose-50/40 hover:bg-rose-100/50'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        {/* 체크박스 */}
                        <td className="border border-gray-200 text-center p-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedIds((prev) => [...prev, r.id]);
                              else setSelectedIds((prev) => prev.filter((id) => id !== r.id));
                            }}
                            className="cursor-pointer"
                          />
                        </td>

                        {/* No */}
                        <td className="border border-gray-200 text-center text-gray-500 font-mono text-[11px] bg-slate-50">
                          {idx + 1}
                        </td>

                        {/* 출고창고 */}
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
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center text-gray-600 truncate max-w-[100px]">
                          {r.spec}
                        </td>

                        {/* 단위 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1 py-0.5 text-center font-mono text-gray-600">
                          {r.unit}
                        </td>

                        {/* 현재고 */}
                        <td
                          className={`border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-bold ${
                            isShortage
                              ? 'text-rose-600 bg-rose-100/60'
                              : 'text-slate-700 bg-slate-100/60'
                          }`}
                        >
                          {r.currentStock.toLocaleString()}
                          {isShortage && <span className="text-[9px] block text-rose-600">부족</span>}
                        </td>

                        {/* 요청 계(공정) 선택 */}
                        <td className="border border-gray-200 p-0 text-left bg-indigo-50/30">
                          <select
                            value={r.targetGyeId}
                            onChange={(e) => handleFieldChange(r.id, 'targetGyeId', e.target.value)}
                            className="w-full h-full px-1.5 py-0.5 text-[11.5px] font-bold text-indigo-900 bg-transparent outline-none cursor-pointer"
                          >
                            {INVENTORY_GYE_LIST.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 불출수량 입력 셀 */}
                        <td className="border border-gray-200 p-0 text-right font-mono bg-blue-50/60">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.issueQty === 0 ? '' : r.issueQty}
                            placeholder="0"
                            onChange={(e) => handleQtyChange(r.id, e.target.value)}
                            className="w-full h-full text-right font-bold text-blue-900 px-2 py-1 border-none outline-none focus:bg-blue-100 focus:ring-1 focus:ring-blue-500 bg-transparent text-[12.5px]"
                          />
                        </td>

                        {/* 단가 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                          {r.unitPrice.toLocaleString()}
                        </td>

                        {/* 불출금액 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2.5 py-0.5 text-right font-mono font-black text-amber-900 bg-amber-50/50">
                          ₩ {r.amount.toLocaleString()}
                        </td>

                        {/* 불출사유 입력/선택 */}
                        <td className="border border-gray-200 p-0 text-left">
                          <input
                            type="text"
                            list="reason-options"
                            value={r.issueReason}
                            onChange={(e) => handleFieldChange(r.id, 'issueReason', e.target.value)}
                            placeholder="불출사유 선택/입력"
                            className="w-full h-full px-2 py-1 border-none outline-none text-[11.5px] text-slate-800 bg-transparent focus:bg-amber-50"
                          />
                        </td>

                        {/* 상태 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              r.status === '완료'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>

                        {/* 비고 */}
                        <td className="border border-gray-200 p-0 text-left">
                          <input
                            type="text"
                            value={r.remark}
                            onChange={(e) => handleFieldChange(r.id, 'remark', e.target.value)}
                            placeholder="특이사항 입력"
                            className="w-full h-full px-2 py-1 border-none outline-none text-[11px] text-gray-600 bg-transparent"
                          />
                        </td>

                        {/* 삭제 버튼 */}
                        <td className="border border-gray-200 text-center p-0">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(r.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                            title="행 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </EditableTableWrapper>
        </div>

        {/* datalist for common reasons */}
        <datalist id="reason-options">
          {COMMON_REASONS.map((reason) => (
            <option key={reason} value={reason} />
          ))}
        </datalist>

        {/* 5. 하단 요약 서머리 바 */}
        <div className="h-[36px] bg-[#f8fafc] border-t border-gray-300 px-4 flex items-center justify-between text-[12px] font-bold shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-gray-600">
              조회: <strong className="text-blue-700">{filteredRows.length}</strong>품목 / 전체{' '}
              <strong>{rows.length}</strong>품목
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600">
              선택: <strong className="text-indigo-700">{selectedIds.length}</strong>건
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600">
              불출일자: <strong className="font-mono text-gray-800">{issueDate}</strong>
            </span>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-600">총 불출수량:</span>
              <span className="font-mono text-blue-700 font-black text-[13px]">
                {kpiStats.totalQty.toLocaleString()}
              </span>
              <span className="text-gray-400 text-[11px]">봉/ea</span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
              <span className="text-gray-600">총 불출금액:</span>
              <span className="font-mono text-amber-700 font-black text-[14px]">
                ₩ {kpiStats.totalAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. 원부재료 검색 및 다중 선택 모달 (606개 마스터 재고) */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-4xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* 모달 헤더 */}
            <div className="bg-[#1e293b] text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-400" />
                <h2 className="text-[14px] font-bold">원부재료 검색 및 추가불출 품목 선택</h2>
                <span className="text-[11px] font-mono bg-blue-950 text-blue-300 border border-blue-600 px-2 py-0.5 rounded">
                  총 {masterInventory.length}개 재고 품목
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 필터 및 검색 바 */}
            <div className="bg-slate-100 p-3 border-b border-slate-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                {WAREHOUSE_TABS.map((wh) => (
                  <button
                    key={wh}
                    type="button"
                    onClick={() => setModalWhFilter(wh)}
                    className={`px-2.5 py-1 text-[11.5px] font-bold rounded cursor-pointer transition-all ${
                      modalWhFilter === wh
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {wh}
                  </button>
                ))}
              </div>

              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="품명 / 품번 / 거래처 검색..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full h-8 pl-3 pr-8 bg-white border border-gray-300 rounded text-[11.5px] outline-none focus:border-blue-500 shadow-inner"
                  autoFocus
                />
                <Search className="w-4 h-4 text-gray-400 absolute right-2.5 top-2" />
              </div>
            </div>

            {/* 품목 선택 그리드 */}
            <div className="flex-1 overflow-auto p-2">
              <table className="w-full border-collapse text-[12px] text-left">
                <thead className="sticky top-0 bg-slate-200 text-slate-800 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2 w-10 text-center">선택</th>
                    <th className="p-2 w-16 text-center">창고</th>
                    <th className="p-2 w-16 text-center">구분</th>
                    <th className="p-2 w-24 text-center font-mono">품번</th>
                    <th className="p-2">품목명</th>
                    <th className="p-2 w-28 text-left">거래처</th>
                    <th className="p-2 w-16 text-center">단위</th>
                    <th className="p-2 w-20 text-right">단가</th>
                    <th className="p-2 w-24 text-right bg-blue-50">현재고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {modalFilteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        검색 조건과 일치하는 원부재료가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    modalFilteredItems.slice(0, 100).map((item) => {
                      const isChecked = modalSelectedCodes.includes(item.itemCode);
                      return (
                        <tr
                          key={item.id}
                          onClick={() => {
                            if (isChecked) {
                              setModalSelectedCodes((prev) => prev.filter((c) => c !== item.itemCode));
                            } else {
                              setModalSelectedCodes((prev) => [...prev, item.itemCode]);
                            }
                          }}
                          className={`cursor-pointer transition-colors ${
                            isChecked ? 'bg-blue-50 font-bold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by row onClick
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="p-2 text-center font-bold text-slate-700">{item.warehouse}</td>
                          <td className="p-2 text-center">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                item.category === '부자재'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {item.category}
                            </span>
                          </td>
                          <td className="p-2 text-center font-mono text-slate-700">{item.itemCode}</td>
                          <td className="p-2 font-bold text-slate-900">{item.itemName}</td>
                          <td className="p-2 text-slate-600 truncate max-w-[110px]">{item.supplier}</td>
                          <td className="p-2 text-center font-mono text-slate-500">{item.unit}</td>
                          <td className="p-2 text-right font-mono text-slate-700">
                            {item.unitPrice.toLocaleString()}원
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-blue-700 bg-blue-50/50">
                            {item.currentStock.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 모달 푸터 */}
            <div className="bg-slate-100 px-4 py-3 border-t border-slate-300 flex items-center justify-between">
              <span className="text-[12px] font-bold text-slate-700">
                선택된 품목: <strong className="text-blue-700">{modalSelectedCodes.length}</strong>개
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-3.5 py-1.5 rounded text-[12px] font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 cursor-pointer shadow-xs"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleAddItemsFromModal}
                  disabled={modalSelectedCodes.length === 0}
                  className="px-4 py-1.5 rounded text-[12px] font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-gray-400 text-white border border-blue-700 cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  선택한 {modalSelectedCodes.length}개 품목 추가하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
