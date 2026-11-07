'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Save,
  RotateCcw,
  Download,
  AlertTriangle,
  CheckCircle2,
  Truck,
  Layers,
  Calendar,
  Building2,
  TrendingUp,
  X,
  Sparkles,
  Edit3,
  Trash2,
  ChevronRight,
  Clock,
  Filter,
  CheckSquare,
  FileText,
  BarChart2,
} from 'lucide-react';
import { SalesActionBar } from '../common/SalesActionBar';
import { exportGridToExcel } from '@/lib/excelExport';
import { erpConfirm } from '@/context/ConfirmContext';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';

const CENTER_NAME_MAP: Record<string, string> = {
  'CVV20': '해인CVS(본부)',
  'CVV25': '진주일배센터',
  'CVV57': '김해일배센터',
  'CVV58': '김해2일배센터',
  'CVV65': '익산일배센터',
  'CVV83': '경산저온센터',
  'CVV84': '경산2저온센터',
  'CVV95': '신광주저온센터',
  'CVV96': '신광주2저온센터',
  'CVV97': '경산3저온센터',
  'C60810': '양산조리센터',
  'C68110': '부산조리센터',
  'GSR-001': 'GSR 김해일배',
  'GSR-002': 'GSR 김해2일배',
  'GSR-003': 'GSR 양산조리',
  'GSR-004': 'GSR 부산물류',
  'GSR-005': 'GSR 신광주저온',
  'GSR-006': 'GSR 신광주2저온',
  'GSR-007': 'GSR 해인CVS',
};

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

function kstMonthStart(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.toISOString().slice(0, 7)}-01`;
}

interface DeliveryDetailItem {
  id: number;
  deliveryId: number;
  productCode: string;
  productName: string;
  deliveryQty: number;
  unitPrice: number;
  amount: number;
  boxQty: number;
  remark: string;
}

interface DeliverySlip {
  id: number;
  checked: boolean;
  deliveryNo: string;
  deliveryDate: string;
  centerCode: string;
  centerName: string;
  shift: string;
  status: string;
  totalQty: number;
  totalAmount: number;
  remark: string;
  details: DeliveryDetailItem[];
}

interface HistoricalDeliveryItem {
  id: string;
  deliveryNo: string;
  deliveryDate: string;
  centerCode: string;
  centerName: string;
  deliveryQty: number;
  amount: number;
}

const STATUS_OPTIONS = ['완료', '출하', '대기', '취소'] as const;

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  '완료': { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  '출하': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  '대기': { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  '취소': { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' },
};

export const DeliveryStatusEditView: React.FC = () => {
  // ── 검색 및 필터 상태 ──
  const [startDate, setStartDate] = useState(() => kstDaysAgo(30));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [centerFilter, setCenterFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');

  // ── 데이터 상태 ──
  const [slips, setSlips] = useState<DeliverySlip[]>([]);
  const [selectedSlipId, setSelectedSlipId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // ── 전표 수정 모드 상태 ──
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [editingDetails, setEditingDetails] = useState<DeliveryDetailItem[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // ── 품목별 납품이력 상태 (서브 패널) ──
  const [selectedProductCode, setSelectedProductCode] = useState<string>('');
  const [selectedProductName, setSelectedProductName] = useState<string>('');

  // ── 1. 납품 전표 데이터 로드 ──
  const loadDeliveryData = useCallback(async (s: string, e: string) => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      const res = await fetch(`/api/sales/delivery?${params}`, { cache: 'no-store' });
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        const mapped: DeliverySlip[] = json.data.map((d: any) => ({
          id: d.id,
          checked: false,
          deliveryNo: d.deliveryNo,
          deliveryDate: d.deliveryDate,
          centerCode: d.centerCode || '미지정',
          centerName: d.centerName || CENTER_NAME_MAP[d.centerCode] || d.centerCode || '미지정',
          shift: d.shift || '1편',
          status: d.status || '완료',
          totalQty: Number(d.totalQty) || 0,
          totalAmount: Number(d.totalAmount) || 0,
          remark: d.remark || '',
          details: (d.details || []).map((dt: any) => ({
            id: dt.id,
            deliveryId: d.id,
            productCode: dt.productCode || '',
            productName: dt.productName || '',
            deliveryQty: Number(dt.deliveryQty) || 0,
            unitPrice: Number(dt.unitPrice) || 0,
            amount: Number(dt.amount) || (Number(dt.deliveryQty) || 0) * (Number(dt.unitPrice) || 0),
            boxQty: Number(dt.boxQty) || 0,
            remark: dt.remark || '',
          })),
        }));

        setSlips(mapped);
        setSelectedSlipId((prev) => {
          if (prev !== null && mapped.some((x) => x.id === prev)) return prev;
          return mapped.length > 0 ? mapped[0].id : null;
        });
      } else {
        setSlips([]);
        setSelectedSlipId(null);
      }
    } catch (err: any) {
      console.error('Failed to load deliveries:', err);
      setStatusMessage({ type: 'error', text: err.message || '납품 목록을 불러오지 못했습니다.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeliveryData(startDate, endDate);
  }, [loadDeliveryData, startDate, endDate]);

  // 선택된 전표 객체
  const selectedSlip = useMemo(() => {
    return slips.find((s) => s.id === selectedSlipId) || null;
  }, [slips, selectedSlipId]);

  // 선택 전표 변경 시 편집 버퍼 동기화
  useEffect(() => {
    if (selectedSlip) {
      setEditingDetails(JSON.parse(JSON.stringify(selectedSlip.details)));
      setIsEditMode(false);
      setHasUnsavedChanges(false);
      if (selectedSlip.details.length > 0 && !selectedProductCode) {
        setSelectedProductCode(selectedSlip.details[0].productCode);
        setSelectedProductName(selectedSlip.details[0].productName);
      }
    } else {
      setEditingDetails([]);
      setIsEditMode(false);
      setHasUnsavedChanges(false);
    }
  }, [selectedSlipId, selectedSlip]);

  // ── 2. 필터링된 전표 목록 ──
  const filteredSlips = useMemo(() => {
    return slips.filter((s) => {
      if (centerFilter !== 'ALL' && s.centerCode !== centerFilter) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const matchNo = s.deliveryNo.toLowerCase().includes(kw);
        const matchCenter = s.centerName.toLowerCase().includes(kw) || s.centerCode.toLowerCase().includes(kw);
        const matchDetails = s.details.some(
          (d) => d.productName.toLowerCase().includes(kw) || d.productCode.toLowerCase().includes(kw)
        );
        if (!matchNo && !matchCenter && !matchDetails) return false;
      }
      return true;
    });
  }, [slips, centerFilter, statusFilter, searchKeyword]);

  // 센터 옵션 목록
  const centerOptions = useMemo(() => {
    const map = new Map<string, string>();
    slips.forEach((s) => {
      if (s.centerCode && !map.has(s.centerCode)) {
        map.set(s.centerCode, s.centerName);
      }
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [slips]);

  // ── 3. KPI 콕핏 서머리 계산 ──
  const kpiStats = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    let completedCount = 0;
    let shippedCount = 0;
    let pendingCount = 0;
    let canceledCount = 0;

    const centerAmountMap: Record<string, { name: string; amount: number }> = {};

    slips.forEach((s) => {
      totalQty += s.totalQty;
      totalAmount += s.totalAmount;

      if (s.status === '완료') completedCount++;
      else if (s.status === '출하') shippedCount++;
      else if (s.status === '취소') canceledCount++;
      else pendingCount++;

      if (!centerAmountMap[s.centerCode]) {
        centerAmountMap[s.centerCode] = { name: s.centerName, amount: 0 };
      }
      centerAmountMap[s.centerCode].amount += s.totalAmount;
    });

    const completionRate = slips.length > 0 ? Math.round((completedCount / slips.length) * 1000) / 10 : 0;

    // 1위 납품 센터
    const topCenterEntry = Object.entries(centerAmountMap).sort((a, b) => b[1].amount - a[1].amount)[0];
    const topCenter = topCenterEntry
      ? { name: topCenterEntry[1].name, amount: topCenterEntry[1].amount, rate: totalAmount > 0 ? Math.round((topCenterEntry[1].amount / totalAmount) * 1000) / 10 : 0 }
      : { name: '미등록', amount: 0, rate: 0 };

    return {
      totalCount: slips.length,
      totalQty,
      totalAmount,
      completedCount,
      shippedCount,
      pendingCount,
      canceledCount,
      completionRate,
      topCenter,
    };
  }, [slips]);

  // 필터링된 전표 합계
  const filteredTotals = useMemo(() => {
    return filteredSlips.reduce(
      (acc, s) => {
        acc.qty += s.totalQty;
        acc.amt += s.totalAmount;
        return acc;
      },
      { qty: 0, amt: 0 }
    );
  }, [filteredSlips]);

  // 현재 표시 중인 상세 품목 합계
  const currentDetailTotals = useMemo(() => {
    const list = isEditMode ? editingDetails : (selectedSlip?.details || []);
    return list.reduce(
      (acc, d) => {
        acc.qty += d.deliveryQty;
        acc.amt += d.amount;
        return acc;
      },
      { qty: 0, amt: 0 }
    );
  }, [isEditMode, editingDetails, selectedSlip]);

  // ── 4. 선택 품목의 기간 내 전체 납품 이력 추이 ──
  const historicalDeliveries: HistoricalDeliveryItem[] = useMemo(() => {
    if (!selectedProductCode) return [];
    const rows: HistoricalDeliveryItem[] = [];

    slips.forEach((s) => {
      s.details.forEach((d) => {
        if (d.productCode === selectedProductCode) {
          rows.push({
            id: `${s.id}-${d.id}`,
            deliveryNo: s.deliveryNo,
            deliveryDate: s.deliveryDate,
            centerCode: s.centerCode,
            centerName: s.centerName,
            deliveryQty: d.deliveryQty,
            amount: d.amount,
          });
        }
      });
    });

    return rows.sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
  }, [slips, selectedProductCode]);

  const historyTotals = useMemo(() => {
    return historicalDeliveries.reduce(
      (acc, r) => {
        acc.qty += r.deliveryQty;
        acc.amt += r.amount;
        return acc;
      },
      { qty: 0, amt: 0 }
    );
  }, [historicalDeliveries]);

  // ── 5. 전표 품목 인라인 편집 핸들러 ──
  const handleDetailQtyChange = (dtId: number, val: string) => {
    const qty = Math.max(0, Number(val) || 0);
    setEditingDetails((prev) =>
      prev.map((d) => {
        if (d.id === dtId) {
          const amt = Math.round(qty * d.unitPrice);
          return { ...d, deliveryQty: qty, amount: amt };
        }
        return d;
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleDetailPriceChange = (dtId: number, val: string) => {
    const price = Math.max(0, Number(val) || 0);
    setEditingDetails((prev) =>
      prev.map((d) => {
        if (d.id === dtId) {
          const amt = Math.round(d.deliveryQty * price);
          return { ...d, unitPrice: price, amount: amt };
        }
        return d;
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleDetailRemarkChange = (dtId: number, val: string) => {
    setEditingDetails((prev) =>
      prev.map((d) => (d.id === dtId ? { ...d, remark: val } : d))
    );
    setHasUnsavedChanges(true);
  };

  // ── 6. 전표 품목 수정 저장 파이프라인 (PUT /api/sales/delivery/[id]) ──
  const handleSaveSlipDetails = async () => {
    if (!selectedSlip) return;
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/sales/delivery/${selectedSlip.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryDate: selectedSlip.deliveryDate,
          centerCode: selectedSlip.centerCode,
          shift: selectedSlip.shift,
          status: selectedSlip.status,
          remark: selectedSlip.remark,
          details: editingDetails,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setStatusMessage({
          type: 'success',
          text: `✅ 납품 전표(${selectedSlip.deliveryNo}) 품목 수정이 성공적으로 저장되었습니다!`,
        });

        // 로컬 슬립 목록 갱신
        const updated = json.data;
        setSlips((prev) =>
          prev.map((s) => (s.id === selectedSlip.id ? { ...s, totalQty: updated.totalQty, totalAmount: updated.totalAmount, details: updated.details } : s))
        );
        setIsEditMode(false);
        setHasUnsavedChanges(false);
      } else {
        setStatusMessage({ type: 'error', text: `저장 실패: ${json.error || '오류가 발생했습니다.'}` });
      }
    } catch (err: any) {
      console.error('Error saving slip details:', err);
      setStatusMessage({ type: 'error', text: `통신 오류: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // ── 7. 단일 전표 상태 변경 파이프라인 ──
  const handleSingleStatusChange = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/sales/delivery/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        setSlips((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status } : s))
        );
        setStatusMessage({ type: 'info', text: `전표 상태가 '${status}'(으)로 갱신되었습니다.` });
      } else {
        alert(`상태 변경 실패: ${json.error || '오류 발생'}`);
      }
    } catch (err: any) {
      alert(`상태 변경 중 오류: ${err.message}`);
    }
  };

  // ── 8. 체크박스 선택 및 일괄 상태 처리 ──
  const toggleCheck = (id: number) => {
    setSlips((prev) => prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s)));
  };

  const allVisibleChecked = filteredSlips.length > 0 && filteredSlips.every((s) => s.checked);

  const toggleAllVisible = (checked: boolean) => {
    const visibleIds = new Set(filteredSlips.map((s) => s.id));
    setSlips((prev) => prev.map((s) => (visibleIds.has(s.id) ? { ...s, checked } : s)));
  };

  const handleBulkStatusChange = async (targetStatus: '완료' | '취소') => {
    const targets = filteredSlips.filter((s) => s.checked && s.status !== targetStatus);
    if (targets.length === 0) {
      alert(`상태를 '${targetStatus}'(으)로 변경할 전표를 선택하세요. (이미 해당 상태인 전표 제외)`);
      return;
    }

    const actionText = targetStatus === '취소' ? '납품 취소' : '납품 완료';
    const ok = await erpConfirm(
      `선택된 ${targets.length}건의 전표를 '${targetStatus}' 상태로 변경하시겠습니까?\n(${targets.slice(0, 3).map((t) => t.deliveryNo).join(', ')}${targets.length > 3 ? ' 외' : ''})\n\n취소 시 미출 현황 수량이 자동으로 복구 조정됩니다.`,
      `${actionText} 확인`,
      targetStatus === '취소' ? 'danger' : 'primary'
    );
    if (!ok) return;

    setIsSaving(true);
    try {
      for (const t of targets) {
        await fetch(`/api/sales/delivery/${t.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus }),
        });
      }
      setStatusMessage({
        type: 'success',
        text: `선택한 ${targets.length}건의 납품 전표가 '${targetStatus}' 상태로 처리되었습니다.`,
      });
      loadDeliveryData(startDate, endDate);
    } catch (err: any) {
      alert(`일괄 처리 중 오류: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── 9. 엑셀 내보내기 ──
  const handleExportExcel = () => {
    const exportColumns = [
      { key: 'deliveryNo', label: '납품번호' },
      { key: 'deliveryDate', label: '납품일자' },
      { key: 'centerName', label: '배송센터명' },
      { key: 'centerCode', label: '센터코드' },
      { key: 'shift', label: '배송편수' },
      { key: 'status', label: '전표상태' },
      { key: 'totalQty', label: '납품수량(EA)', format: 'number' },
      { key: 'totalAmount', label: '납품금액(원)', format: 'currency' },
      { key: 'remark', label: '비고' },
    ];

    exportGridToExcel({
      filename: `납품현황_전표목록_${startDate}_${endDate}`,
      sheetName: '납품전표',
      columns: exportColumns,
      data: filteredSlips,
    });
  };

  // 날짜 퀵 프리셋
  const applyDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth') => {
    const today = kstToday();
    let s = today;
    let e = today;

    if (preset === 'yesterday') {
      s = kstDaysAgo(1);
      e = kstDaysAgo(1);
    } else if (preset === '7days') {
      s = kstDaysAgo(7);
      e = today;
    } else if (preset === '30days') {
      s = kstDaysAgo(30);
      e = today;
    } else if (preset === 'thisMonth') {
      s = kstMonthStart();
      e = today;
    }

    setStartDate(s);
    setEndDate(e);
  };

  // 액션바 버튼 구성
  const actionButtons = [
    {
      key: 'search',
      label: '조회',
      icon: 'search' as const,
      variant: 'primary' as const,
      onClick: () => loadDeliveryData(startDate, endDate),
      disabled: isLoading || isSaving,
    },
    {
      key: 'saveSlip',
      label: '전표 품목 저장',
      icon: 'save' as const,
      variant: 'success' as const,
      onClick: handleSaveSlipDetails,
      disabled: !isEditMode || !hasUnsavedChanges || isSaving || !selectedSlip,
    },
    {
      key: 'bulkComplete',
      label: '선택건 완료처리',
      icon: 'batchSave' as const,
      variant: 'secondary' as const,
      onClick: () => handleBulkStatusChange('완료'),
      disabled: isSaving || filteredSlips.filter((s) => s.checked).length === 0,
    },
    {
      key: 'bulkCancel',
      label: '선택건 납품취소',
      icon: 'delete' as const,
      variant: 'danger' as const,
      onClick: () => handleBulkStatusChange('취소'),
      disabled: isSaving || filteredSlips.filter((s) => s.checked).length === 0,
    },
    {
      key: 'excel',
      label: '엑셀 다운로드',
      icon: 'excel' as const,
      variant: 'secondary' as const,
      onClick: handleExportExcel,
      disabled: filteredSlips.length === 0,
    },
    {
      key: 'reset',
      label: '초기화',
      icon: 'reset' as const,
      variant: 'secondary' as const,
      onClick: () => {
        const s = kstDaysAgo(30);
        const e = kstToday();
        setStartDate(s);
        setEndDate(e);
        setCenterFilter('ALL');
        setStatusFilter('ALL');
        setSearchKeyword('');
        loadDeliveryData(s, e);
      },
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px] font-sans overflow-hidden">
      {/* 1. 표준 영업 액션바 */}
      <SalesActionBar
        title="납품 현황 및 전표수정"
        buttons={actionButtons}
        helpContent="전국 12개 GS CVS 거점 센터별 납품 전표를 관제하고, 전표 품목의 수량 및 단가를 정밀 수정합니다. 전표를 선택하고 [전표 수정 모드]를 켜서 수량/단가를 인라인 수정한 뒤 [전표 품목 저장]을 누르면 매출 원장 및 시스템 로그에 즉시 동기화됩니다."
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
        {/* 카드 1: 기간 총 납품건수 및 상태 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-blue-600" />
              기간 납품 전표 총수
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
              완료율 {kpiStats.completionRate}%
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-[18px] font-black font-mono text-slate-900 tracking-tight">
              {kpiStats.totalCount.toLocaleString()}
              <span className="text-[11px] font-medium text-slate-500 ml-1">전표</span>
            </div>
            <div className="text-[11px] font-medium text-slate-600">
              완료 <strong className="text-emerald-700">{kpiStats.completedCount}</strong> / 출하{' '}
              <strong className="text-blue-700">{kpiStats.shippedCount}</strong> / 취소{' '}
              <strong className="text-rose-600">{kpiStats.canceledCount}</strong>
            </div>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full"
              style={{ width: `${kpiStats.completionRate}%` }}
            />
          </div>
        </div>

        {/* 카드 2: 총 납품수량 & 총 납품금액 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              총 납품수량 및 납품총액
            </span>
            <span className="text-[10px] text-slate-400 font-mono">공급가 기준</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div>
              <span className="text-[10px] text-slate-500 block">납품 총수량</span>
              <span className="text-[15px] font-black font-mono text-blue-900">
                {kpiStats.totalQty.toLocaleString()}
                <span className="text-[10.5px] font-medium text-slate-500 ml-0.5">EA</span>
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block">납품 총금액</span>
              <span className="text-[16px] font-black font-mono text-emerald-700">
                ₩ {kpiStats.totalAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 카드 3: 1위 거점 센터 납품 비중 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              최다 납품 거점 센터
            </span>
            <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 py-0.2 rounded font-bold">
              비중 {kpiStats.topCenter.rate}%
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-[14px] font-black text-slate-800 truncate" title={kpiStats.topCenter.name}>
              {kpiStats.topCenter.name}
            </div>
            <div className="text-[13px] font-black font-mono text-indigo-700">
              ₩ {kpiStats.topCenter.amount.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 카드 4: 전표 상태 및 미출 연계 관리 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-600" />
              배송 전표 상태 관제
            </span>
            <span className="text-[10px] text-slate-400">12개 GS 센터</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                완료 {kpiStats.completedCount}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">
                출하 {kpiStats.shippedCount}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                취소 {kpiStats.canceledCount}
              </span>
            </div>
            <span className="text-[10.5px] text-slate-500 font-medium">실시간 동기화</span>
          </div>
        </div>
      </div>

      {/* 3. 검색 조건 및 퀵 필터 툴바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-inner shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* 기간 선택기 */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-400 px-2 py-0.5 rounded shadow-2xs">
            <Calendar size={13} className="text-blue-700" />
            <span className="font-bold text-gray-700 text-[11.5px]">납품일자:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-[11.5px] font-mono font-bold outline-none cursor-pointer w-[105px]"
            />
            <span className="text-gray-400">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-[11.5px] font-mono font-bold outline-none cursor-pointer w-[105px]"
            />
          </div>

          {/* 퀵 일자 칩 */}
          <div className="flex items-center gap-0.5 bg-white border border-gray-300 rounded p-0.5 shadow-2xs">
            {[
              { id: 'today', label: '오늘' },
              { id: 'yesterday', label: '어제' },
              { id: '7days', label: '7일' },
              { id: '30days', label: '30일' },
              { id: 'thisMonth', label: '당월' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyDatePreset(p.id as any)}
                className="px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 rounded cursor-pointer transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 거점 센터 필터 */}
          <div className="flex items-center gap-1 bg-white border border-gray-400 px-2 py-0.5 rounded shadow-2xs">
            <Building2 size={13} className="text-slate-500" />
            <span className="font-bold text-gray-700 text-[11.5px]">배송센터:</span>
            <select
              value={centerFilter}
              onChange={(e) => setCenterFilter(e.target.value)}
              className="bg-transparent text-[11.5px] font-bold text-slate-800 outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="ALL">전체 센터 (12개)</option>
              {centerOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 상태 필터 */}
          <div className="flex items-center gap-1 bg-white border border-gray-400 px-2 py-0.5 rounded shadow-2xs">
            <Filter size={13} className="text-slate-500" />
            <span className="font-bold text-gray-700 text-[11.5px]">상태:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-[11.5px] font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="ALL">전체 상태</option>
              <option value="완료">완료만</option>
              <option value="출하">출하만</option>
              <option value="대기">대기만</option>
              <option value="취소">취소만</option>
            </select>
          </div>
        </div>

        {/* 실시간 검색 */}
        <div className="relative">
          <input
            type="text"
            placeholder="전표번호 / 센터 / 품명 검색..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="h-7 w-[210px] pl-2.5 pr-7 bg-white border border-gray-400 rounded text-[11.5px] outline-none focus:border-blue-500 shadow-inner"
          />
          <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-2" />
        </div>
      </div>

      {/* 4. 마스터-디테일 듀얼 스플릿 그리드 (52% : 48%) */}
      <div className="flex-1 flex min-h-0 p-1.5 gap-1.5 overflow-hidden">
        {/* ── 좌측 패널: 납품 전표 관제 목록 (52%) ── */}
        <div className="w-[52%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          {/* 패널 헤더 */}
          <div className="bg-[#e2e8f0] px-3 py-1.5 font-bold text-gray-800 text-[12.5px] border-b border-gray-300 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-blue-700" />
                납품 전표 목록 (관제/상태 전환)
              </span>
              <label className="flex items-center gap-1 text-[11.5px] font-bold text-slate-700 cursor-pointer bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                />
                <span>선택 ({filteredSlips.filter((s) => s.checked).length}건)</span>
              </label>
            </div>
            <span className="text-[11.5px] text-gray-600 font-bold font-mono">
              조회: <strong className="text-blue-700">{filteredSlips.length}</strong> / 전체 {slips.length}건
            </span>
          </div>

          {/* 전표 테이블 */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="py-20 text-center text-gray-500 font-medium">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                납품 전표 데이터를 로드 중입니다...
              </div>
            ) : filteredSlips.length === 0 ? (
              <div className="py-20 text-center text-gray-400 font-medium italic">
                조회된 납품 전표가 없습니다.
              </div>
            ) : (
              <EditableTableWrapper readOnly>
                <table className="w-full min-w-full text-[12px] border-collapse font-sans">
                  <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#cbd5e1] z-10 text-center font-bold whitespace-nowrap shadow-2xs">
                    <tr>
                      <th className="py-1.5 px-1 border-r border-[#cbd5e1] w-10 text-center bg-[#e2e8f0]">
                        <input
                          type="checkbox"
                          checked={allVisibleChecked}
                          onChange={(e) => toggleAllVisible(e.target.checked)}
                          className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                        />
                      </th>
                      <th className="py-1.5 px-1.5 border-r border-[#cbd5e1] w-10 text-center bg-[#e2e8f0] text-[11px]">No</th>
                      <th className="py-1.5 px-2 border-r border-[#cbd5e1] min-w-[125px]">납품번호</th>
                      <th className="py-1.5 px-2 border-r border-[#cbd5e1] min-w-[85px]">납품일자</th>
                      <th className="py-1.5 px-2.5 border-r border-[#cbd5e1] text-left min-w-[120px]">배송센터</th>
                      <th className="py-1.5 px-1.5 border-r border-[#cbd5e1] w-14">편수</th>
                      <th className="py-1.5 px-2 border-r border-[#cbd5e1] w-20">상태</th>
                      <th className="py-1.5 px-2 text-right border-r border-[#cbd5e1] min-w-[75px]">수량계</th>
                      <th className="py-1.5 px-2.5 text-right min-w-[95px]">금액계(원)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-mono">
                    {filteredSlips.map((s, idx) => {
                      const isSelected = selectedSlipId === s.id;
                      const badge = STATUS_BADGES[s.status] || { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' };

                      return (
                        <tr
                          key={s.id}
                          onClick={() => setSelectedSlipId(s.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-100/90 font-bold' : 'hover:bg-blue-50/50 bg-white'
                          }`}
                        >
                          <td className="py-1.5 px-1 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={s.checked}
                              onChange={() => toggleCheck(s.id)}
                              className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer"
                            />
                          </td>
                          <td className="py-1.5 px-1.5 text-center text-gray-500 font-mono text-[11px] border-r border-gray-200 bg-slate-50">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-2 text-center text-blue-950 font-bold border-r border-gray-200">
                            {s.deliveryNo}
                          </td>
                          <td className="py-1.5 px-2 text-center text-slate-700 border-r border-gray-200">
                            {s.deliveryDate}
                          </td>
                          <td className="py-1.5 px-2.5 font-sans font-bold text-left text-slate-900 border-r border-gray-200 truncate max-w-[130px]">
                            <span className="text-[11.5px]">{s.centerName}</span>
                            <span className="text-[10px] text-slate-400 font-mono block">{s.centerCode}</span>
                          </td>
                          <td className="py-1.5 px-1.5 font-sans font-bold text-center text-slate-700 border-r border-gray-200">
                            <span className={`px-1.5 py-0.2 rounded text-[10.5px] ${s.shift === '2편' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                              {s.shift}
                            </span>
                          </td>
                          <td className="py-1 px-1.5 text-center border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={s.status}
                              onChange={(e) => handleSingleStatusChange(s.id, e.target.value)}
                              className={`border rounded px-1.5 py-0.5 text-[11px] font-bold shadow-2xs cursor-pointer ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              {STATUS_OPTIONS.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 px-2 text-right font-black text-blue-900 border-r border-gray-200 bg-blue-50/20">
                            {s.totalQty.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-black text-slate-900">
                            {s.totalAmount.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </EditableTableWrapper>
            )}
          </div>

          {/* 좌측 패널 하단 합계 */}
          <div className="bg-[#fef9c3] px-3 py-1.5 border-t-2 border-slate-300 flex items-center justify-between font-mono font-bold text-[12px] shrink-0">
            <span className="font-sans font-black text-slate-800">
              전표 합계 ({filteredSlips.length}건)
            </span>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-gray-500 font-sans text-[11px] mr-1">수량합계:</span>
                <span className="text-blue-950 font-black text-[13px]">{filteredTotals.qty.toLocaleString()}</span>
                <span className="text-gray-400 text-[10.5px] ml-0.5">EA</span>
              </div>
              <div className="pl-3 border-l border-amber-300">
                <span className="text-gray-500 font-sans text-[11px] mr-1">금액합계:</span>
                <span className="text-slate-950 font-black text-[14px]">₩ {filteredTotals.amt.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 우측 패널: 전표 상세 품목 및 정밀 전표 수정 (48%) ── */}
        <div className="w-[48%] flex flex-col bg-white border border-gray-400 shadow-xs overflow-hidden rounded-xs">
          {/* 패널 헤더 */}
          <div className="bg-[#e2e8f0] px-3 py-1.5 border-b border-gray-300 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-700" />
              <span className="font-bold text-gray-800 text-[12.5px]">
                전표 품목 명세 및 수정
              </span>
              {selectedSlip && (
                <span className="text-[11px] font-mono font-bold text-blue-900 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded">
                  {selectedSlip.deliveryNo} ({selectedSlip.centerName})
                </span>
              )}
            </div>

            {/* 전표 수정 토글 & 저장 버튼 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (isEditMode && hasUnsavedChanges) {
                    if (!window.confirm('수정 중인 내용이 저장되지 않았습니다. 취소하시겠습니까?')) return;
                    setEditingDetails(JSON.parse(JSON.stringify(selectedSlip?.details || [])));
                    setHasUnsavedChanges(false);
                  }
                  setIsEditMode((prev) => !prev);
                }}
                className={`flex items-center gap-1 h-6.5 px-2.5 rounded text-[11px] font-bold border cursor-pointer transition-all ${
                  isEditMode
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-gray-300'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                {isEditMode ? '수정 취소' : '전표 수정 모드'}
              </button>

              {isEditMode && (
                <button
                  type="button"
                  onClick={handleSaveSlipDetails}
                  disabled={isSaving || !hasUnsavedChanges}
                  className="flex items-center gap-1 h-6.5 px-3 rounded text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-400 text-white border border-emerald-700 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  전표 저장
                </button>
              )}
            </div>
          </div>

          {/* 상단 품목 테이블 (전표 상세) */}
          <div className="flex-1 min-h-0 overflow-auto border-b border-gray-300">
            <EditableTableWrapper readOnly={!isEditMode}>
              <table className="w-full min-w-full text-[12px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#cbd5e1] z-10 text-center font-bold whitespace-nowrap shadow-2xs">
                  <tr>
                    <th className="py-1.5 px-1.5 border-r border-[#cbd5e1] w-9 text-center bg-[#e2e8f0] text-[11px]">No</th>
                    <th className="py-1.5 px-2 border-r border-[#cbd5e1] w-24 text-center font-mono">품번</th>
                    <th className="py-1.5 px-2.5 border-r border-[#cbd5e1] text-left min-w-[160px]">제품명</th>
                    <th className="py-1.5 px-2 border-r border-[#cbd5e1] w-20 text-right bg-blue-50 text-blue-950">
                      납품수량
                    </th>
                    <th className="py-1.5 px-2 border-r border-[#cbd5e1] w-20 text-right">단가(원)</th>
                    <th className="py-1.5 px-2.5 border-r border-[#cbd5e1] w-24 text-right bg-emerald-50 text-emerald-950">
                      금액(원)
                    </th>
                    <th className="py-1.5 px-2 text-left min-w-[100px]">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {(!selectedSlip || editingDetails.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-gray-400 font-medium">
                        좌측에서 전표를 선택하시면 상세 품목이 표시됩니다.
                      </td>
                    </tr>
                  ) : (
                    editingDetails.map((dt, idx) => {
                      const isProductSelected = selectedProductCode === dt.productCode;

                      return (
                        <tr
                          key={dt.id}
                          onClick={() => {
                            setSelectedProductCode(dt.productCode);
                            setSelectedProductName(dt.productName);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isProductSelected ? 'bg-indigo-50/90 font-bold' : 'hover:bg-slate-50 bg-white'
                          }`}
                        >
                          <td className="py-1.5 px-1 text-center text-gray-500 font-mono text-[11px] border-r border-gray-200 bg-slate-50">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-2 text-center text-slate-700 border-r border-gray-200">
                            {dt.productCode}
                          </td>
                          <td
                            className="py-1.5 px-2.5 font-sans font-bold text-left text-slate-900 border-r border-gray-200 truncate max-w-[180px]"
                            title={dt.productName}
                          >
                            {dt.productName}
                          </td>

                          {/* 납품수량 (수정 모드 지원) */}
                          <td className="py-1 px-1.5 text-right font-black text-blue-900 border-r border-gray-200 bg-blue-50/30">
                            {isEditMode ? (
                              <input
                                type="number"
                                min="0"
                                value={dt.deliveryQty === 0 ? '' : dt.deliveryQty}
                                placeholder="0"
                                onChange={(e) => handleDetailQtyChange(dt.id, e.target.value)}
                                className="w-full text-right font-bold text-blue-900 px-1 py-0.5 border border-blue-400 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 text-[12px]"
                              />
                            ) : (
                              <span>{dt.deliveryQty.toLocaleString()}</span>
                            )}
                          </td>

                          {/* 단가 (수정 모드 지원) */}
                          <td className="py-1 px-1.5 text-right font-mono text-slate-700 border-r border-gray-200">
                            {isEditMode ? (
                              <input
                                type="number"
                                min="0"
                                value={dt.unitPrice === 0 ? '' : dt.unitPrice}
                                placeholder="0"
                                onChange={(e) => handleDetailPriceChange(dt.id, e.target.value)}
                                className="w-full text-right font-mono text-slate-800 px-1 py-0.5 border border-slate-300 rounded bg-white outline-none text-[12px]"
                              />
                            ) : (
                              <span>{dt.unitPrice.toLocaleString()}</span>
                            )}
                          </td>

                          {/* 금액 (자동 계산) */}
                          <td className="py-1.5 px-2 text-right font-black text-emerald-800 border-r border-gray-200 bg-emerald-50/20">
                            {dt.amount.toLocaleString()}
                          </td>

                          {/* 비고 (수정 모드 지원) */}
                          <td className="py-1 px-1.5 text-left text-slate-600">
                            {isEditMode ? (
                              <input
                                type="text"
                                value={dt.remark}
                                onChange={(e) => handleDetailRemarkChange(dt.id, e.target.value)}
                                placeholder="비고 입력"
                                className="w-full px-1 py-0.5 border border-slate-300 rounded bg-white outline-none text-[11px]"
                              />
                            ) : (
                              <span className="truncate block max-w-[120px]">{dt.remark || '-'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </EditableTableWrapper>
          </div>

          {/* 전표 품목 소계 바 */}
          <div className="bg-[#fef9c3] px-3 py-1.5 border-b border-gray-300 flex items-center justify-between font-mono font-bold text-[12px] shrink-0">
            <span className="font-sans font-black text-slate-800">
              전표 품목 소계 ({editingDetails.length}품목)
            </span>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-gray-500 font-sans text-[11px] mr-1">수량:</span>
                <span className="text-blue-950 font-black text-[13px]">{currentDetailTotals.qty.toLocaleString()}</span>
                <span className="text-gray-400 text-[10.5px] ml-0.5">EA</span>
              </div>
              <div className="pl-3 border-l border-amber-300">
                <span className="text-gray-500 font-sans text-[11px] mr-1">금액:</span>
                <span className="text-slate-950 font-black text-[13.5px]">₩ {currentDetailTotals.amt.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* ── 하단 드로어: 품목별 전체 납품 이력 추이 ── */}
          <div className="h-[210px] flex flex-col bg-slate-50 overflow-hidden shrink-0">
            <div className="bg-slate-200 px-3 py-1 font-bold text-slate-800 text-[11.5px] border-b border-slate-300 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-indigo-700" />
                <span>품목별 센터 납품 이력 추이</span>
                {selectedProductName && (
                  <span className="text-[11px] font-black text-indigo-900 bg-indigo-100 border border-indigo-300 px-1.5 py-0.2 rounded truncate max-w-[180px]">
                    {selectedProductName}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-mono text-slate-600">
                총 {historicalDeliveries.length}회 출하
              </span>
            </div>

            <div className="flex-1 overflow-auto bg-white">
              {historicalDeliveries.length === 0 ? (
                <div className="py-8 text-center text-slate-400 font-medium text-[11.5px]">
                  상단 품목을 클릭하시면 해당 제품의 기간 내 전체 납품 이력이 표시됩니다.
                </div>
              ) : (
                <table className="w-full text-[11.5px] border-collapse font-sans">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-300 text-center font-bold">
                    <tr>
                      <th className="py-1 px-2 border-r border-slate-200">납품일자</th>
                      <th className="py-1 px-2.5 border-r border-slate-200 text-left">배송센터</th>
                      <th className="py-1 px-2 border-r border-slate-200 font-mono">전표번호</th>
                      <th className="py-1 px-2 text-right border-r border-slate-200 text-blue-900">납품수량</th>
                      <th className="py-1 px-2 text-right">납품금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {historicalDeliveries.slice(0, 30).map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="py-1 px-2 text-center text-slate-700 border-r border-slate-200">
                          {h.deliveryDate}
                        </td>
                        <td className="py-1 px-2.5 font-sans font-bold text-left text-slate-900 border-r border-slate-200">
                          {h.centerName}
                        </td>
                        <td className="py-1 px-2 text-center text-slate-600 border-r border-slate-200">
                          {h.deliveryNo}
                        </td>
                        <td className="py-1 px-2 text-right font-black text-blue-900 border-r border-slate-200">
                          {h.deliveryQty.toLocaleString()}
                        </td>
                        <td className="py-1 px-2 text-right font-bold text-slate-800">
                          {h.amount.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-mono font-bold text-slate-900 border-t border-slate-300 sticky bottom-0">
                    <tr>
                      <td colSpan={3} className="py-1 px-2 text-center font-sans">
                        합계 ({historicalDeliveries.length}회)
                      </td>
                      <td className="py-1 px-2 text-right font-black text-blue-950 border-r border-slate-200">
                        {historyTotals.qty.toLocaleString()}
                      </td>
                      <td className="py-1 px-2 text-right font-black text-slate-950">
                        {historyTotals.amt.toLocaleString()}원
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
