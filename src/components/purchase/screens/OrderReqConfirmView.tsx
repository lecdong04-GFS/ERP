'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  RotateCcw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Download,
  AlertOctagon,
  Boxes,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';
import { erpConfirm } from '@/context/ConfirmContext';
import { calcBoxPrice, calcBagPriceFromBox, isBoxUnitLabel } from '@/lib/gfs/pricing';

export interface OrderReqConfirmItem {
  id: number;
  category: string; // 구분 (원재료 / 부자재 / 포장재)
  itemName: string; // 품명
  materialCode: string; // 자재코드
  spec: string; // 규격
  unit: string; // 단위
  supplier: string; // 거래처
  partnerId: string;
  orderUnit: string; // 발주단위
  minOrderQty: number; // 최소발주수량
  orderQty: number; // 발주수량 (확정량 또는 추천량)
  unitPrice: number; // 발주단가
  bagPrice?: number; // 봉단가
  boxPrice?: number; // 박스단가
  packUnit?: number; // 입수량
  orderAmt: number; // 발주금액
  calcQty: number; // 발주계산수량 (순부족량)
  unitQty: number; // Unit 수량
  orderUnitQty: number; // 발주단위수량
  leadTime: number; // 조달기간
  clientStock: number; // 거래처재고
  safetyStock: number; // 안전재고
  currentStock: number; // 현재고
  incomingScheduledBox: number; // 입고예정량(BOX)
  incomingScheduled: number; // 입고예정량
  stockQty: number; // 재고수량
  isConfirmed?: boolean; // 확정 여부
  orderNo?: string; // 발주전표번호
  status?: string; // 상태
}

/** KST 오늘 YYYY-MM-DD */
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export const OrderReqConfirmView: React.FC = () => {
  const { openTab } = useTabs();

  // 날짜 및 필터 상태
  const [reqDate, setReqDate] = useState<string>(kstToday());
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SHORTAGE' | 'TARGET' | 'CONFIRMED'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // 데이터 상태
  const [rows, setRows] = useState<OrderReqConfirmItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasGfsOrders, setHasGfsOrders] = useState<boolean>(false);
  const [confirmedOrderNos, setConfirmedOrderNos] = useState<string[]>([]);
  const [latestDateWithOrders, setLatestDateWithOrders] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 셀 인라인 편집 상태
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editVal, setEditVal] = useState<string>('');

  // 탭 이동 헬퍼
  const handleNavigate = (menuId: string) => {
    const item = getMenuItemById(menuId);
    if (item) {
      openTab(item);
    }
  };

  // 실시간 DB 소요량 및 발주 확정 데이터 조회
  const fetchOrderReqs = useCallback(
    async (overrideDate?: string, overrideSupplier?: string) => {
      setIsLoading(true);
      const targetDate = overrideDate !== undefined ? overrideDate : reqDate;
      const targetSupplier = overrideSupplier !== undefined ? overrideSupplier : selectedSupplier;

      try {
        const params = new URLSearchParams({
          date: targetDate,
          supplier: targetSupplier,
          search: searchTerm,
        });
        const res = await fetch(`/api/purchase/order-req-confirm?${params}`);
        const json = await res.json();

        if (json.success && Array.isArray(json.data)) {
          setRows(json.data);
          setHasGfsOrders(!!json.hasGfsOrders);
          setConfirmedOrderNos(json.confirmedOrderNos || []);
          setLatestDateWithOrders(json.latestDateWithOrders || null);
        } else {
          setRows([]);
          setHasGfsOrders(false);
          setConfirmedOrderNos([]);
        }
      } catch (e) {
        console.warn('DB 소요량 조회 실패:', e);
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    },
    [reqDate, selectedSupplier, searchTerm]
  );

  useEffect(() => {
    void fetchOrderReqs();
  }, [fetchOrderReqs]);

  // 날짜 이동
  const handlePrevDay = () => {
    const d = new Date(reqDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    const newDate = d.toISOString().slice(0, 10);
    setReqDate(newDate);
    fetchOrderReqs(newDate);
  };

  const handleNextDay = () => {
    const d = new Date(reqDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const newDate = d.toISOString().slice(0, 10);
    setReqDate(newDate);
    fetchOrderReqs(newDate);
  };

  // 셀 값 변경 핸들러
  const handleGenericChange = (id: number, field: string, val: any) => {
    setRows((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: val };
          if (field === 'unitPrice' || field === 'orderQty') {
            const q = Number(updated.orderQty) || 0;
            const p = Number(updated.unitPrice) || 0;
            updated.orderAmt = Math.round(q * p);
            if (field === 'unitPrice') {
              const pack = Number(updated.packUnit || updated.unitQty) || 1;
              if (isBoxUnitLabel(updated.orderUnit) && updated.isConfirmed && pack > 1) {
                updated.boxPrice = p;
                updated.bagPrice = calcBagPriceFromBox(p, pack);
              } else {
                updated.bagPrice = p;
                updated.boxPrice = calcBoxPrice(p, pack);
              }
            }
          }
          return updated;
        }
        return item;
      })
    );
  };

  const renderEditableCell = (
    row: any,
    field: string,
    align: 'left' | 'center' | 'right' = 'left',
    isNumber = false
  ) => {
    const isEditing = editingCell?.id === row.id && editingCell?.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          type="text"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => {
            const val = isNumber
              ? editVal === ''
                ? 0
                : Number(editVal.replace(/,/g, '')) || 0
              : editVal;
            handleGenericChange(row.id, field, val);
            setEditingCell(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = isNumber
                ? editVal === ''
                  ? 0
                  : Number(editVal.replace(/,/g, '')) || 0
                : editVal;
              handleGenericChange(row.id, field, val);
              setEditingCell(null);
            } else if (e.key === 'Escape') {
              setEditingCell(null);
            }
          }}
          className={`w-full h-full min-h-[26px] bg-white text-gray-900 border-2 border-blue-600 rounded-none px-1.5 py-0.5 text-[13px] font-bold outline-none shadow-inner ${
            align === 'right' ? 'text-right font-mono' : align === 'center' ? 'text-center' : 'text-left'
          }`}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.target.select()}
        />
      );
    }

    const raw = row[field];
    const display = isNumber
      ? (Number(raw) || 0).toLocaleString()
      : raw !== undefined && raw !== null
      ? String(raw)
      : '';

    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          setEditingCell({ id: row.id, field });
          setEditVal(raw !== undefined && raw !== null ? String(raw) : '');
        }}
        className={`w-full h-full cursor-text hover:bg-blue-100/60 hover:outline hover:outline-1 hover:outline-blue-500 px-1 py-1 transition-colors ${
          align === 'right' ? 'text-right font-mono' : align === 'center' ? 'text-center' : 'text-left'
        }`}
      >
        {display}
      </div>
    );
  };

  // 매입처 목록
  const suppliers = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const name = String(r.supplier || '').trim();
      if (name) s.add(name);
    });
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [rows]);

  // 필터링 적용 (거래처 + 상태 필터)
  const filteredRows = useMemo(() => {
    let result = rows;
    if (selectedSupplier !== 'ALL') {
      result = result.filter((r) => r.supplier.includes(selectedSupplier));
    }
    if (statusFilter === 'SHORTAGE') {
      result = result.filter((r) => r.calcQty > 0);
    } else if (statusFilter === 'TARGET') {
      result = result.filter((r) => r.orderQty > 0);
    } else if (statusFilter === 'CONFIRMED') {
      result = result.filter((r) => r.isConfirmed);
    }
    return result;
  }, [rows, selectedSupplier, statusFilter]);

  // 전체 통계 카운트
  const shortageCount = useMemo(() => rows.filter((r) => r.calcQty > 0).length, [rows]);
  const targetCount = useMemo(() => rows.filter((r) => r.orderQty > 0).length, [rows]);
  const confirmedCount = useMemo(() => rows.filter((r) => r.isConfirmed).length, [rows]);

  // 합계 계산
  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => ({
        orderQty: acc.orderQty + (Number(r.orderQty) || 0),
        orderAmt: acc.orderAmt + (Number(r.orderAmt) || 0),
        calcQty: acc.calcQty + (Number(r.calcQty) || 0),
        safetyStock: acc.safetyStock + (Number(r.safetyStock) || 0),
        currentStock: acc.currentStock + (Number(r.currentStock) || 0),
        incomingScheduled: acc.incomingScheduled + (Number(r.incomingScheduled) || 0),
      }),
      { orderQty: 0, orderAmt: 0, calcQty: 0, safetyStock: 0, currentStock: 0, incomingScheduled: 0 }
    );
  }, [filteredRows]);

  // 계산수량을 발주수량으로 일괄 적용
  const handleApplyCalcQtyAll = () => {
    setRows((prev) =>
      prev.map((r) => {
        const targetQty = r.calcQty > 0 ? Math.ceil(r.calcQty) : 0;
        return {
          ...r,
          orderQty: targetQty,
          orderAmt: Math.round(targetQty * r.unitPrice),
        };
      })
    );
  };

  // 발주수량 전체 0으로 초기화
  const handleClearQtyAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        orderQty: 0,
        orderAmt: 0,
      }))
    );
  };

  // 발주서 일괄 확정 및 ERP 발주서(PO) 전표 생성 (이중 발주 방지 안내 탑재)
  const handleSaveOrders = async () => {
    const itemsToSave = filteredRows.filter((r) => Number(r.orderQty) > 0);
    if (itemsToSave.length === 0) {
      alert('발주수량이 1 이상인 품목이 없습니다. 발주수량을 먼저 입력해주세요.');
      return;
    }

    let confirmMsg = `[${reqDate}] 일자로 총 ${itemsToSave.length}개 품목(총 ₩${Math.round(
      totals.orderAmt
    ).toLocaleString()}원)을 ERP 발주서(PO)로 확정 저장하시겠습니까?`;

    let confirmTitle = '발주소요량 확정 전표 생성';
    let confirmVariant: 'primary' | 'warning' = 'primary';

    if (hasGfsOrders) {
      confirmTitle = '⚠️ 이중 발주 주의 안내';
      confirmVariant = 'warning';
      confirmMsg =
        `[경고] 이미 [자재발주(요일별)] 화면을 통해 확정된 발주서(${confirmedOrderNos.join(', ')})가 존재합니다.\n\n` +
        `실제 발주서 생성은 [자재발주(요일별)] 화면 사용을 권장합니다.\n` +
        `그래도 현재 화면의 ${itemsToSave.length}개 품목으로 발주서를 추가/갱신 저장하시겠습니까?`;
    }

    const ok = await erpConfirm(confirmMsg, confirmTitle, confirmVariant);
    if (!ok) return;

    setIsSaving(true);
    try {
      const res = await fetch('/api/purchase/order-req-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: reqDate,
          items: itemsToSave,
          createdBy: '발주소요량확정',
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(
          `✅ 발주서 확정 저장 완료!\n\n` +
            `• 생성된 발주서: ${(json.data || []).map((o: any) => o.orderNo).join(', ')}\n` +
            `• 발주현황 및 입고등록 화면에 파이프라인 동기화되었습니다.`
        );
        void fetchOrderReqs();
      } else {
        alert('발주 확정 실패: ' + (json.error || '오류가 발생했습니다.'));
      }
    } catch (e: any) {
      alert('발주 확정 통신 오류: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 엑셀 내보내기
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    const exportCols = [
      { key: 'category', label: '구분' },
      { key: 'materialCode', label: '자재코드' },
      { key: 'itemName', label: '품명' },
      { key: 'spec', label: '규격' },
      { key: 'unit', label: '단위' },
      { key: 'supplier', label: '거래처' },
      { key: 'orderUnit', label: '발주단위' },
      { key: 'packUnit', label: '입수량', format: 'number' },
      { key: 'minOrderQty', label: '최소발주수량', format: 'number' },
      { key: 'orderQty', label: '발주수량', format: 'number' },
      { key: 'bagPrice', label: '봉단가', format: 'currency' },
      { key: 'boxPrice', label: '박스단가', format: 'currency' },
      { key: 'unitPrice', label: '발주단가', format: 'currency' },
      { key: 'orderAmt', label: '발주금액', format: 'currency' },
      { key: 'calcQty', label: '순부족량', format: 'number' },
      { key: 'currentStock', label: '현재고', format: 'number' },
      { key: 'safetyStock', label: '안전재고', format: 'number' },
      { key: 'incomingScheduled', label: '입고예정량', format: 'number' },
      { key: 'status', label: '상태' },
      { key: 'orderNo', label: '발주전표번호' },
    ];
    exportGridToExcel({
      filename: `발주소요량확정_${reqDate}_${selectedSupplier}_${statusFilter}`,
      sheetName: '소요량확정',
      columns: exportCols,
      data: filteredRows,
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f0f2f5] select-none text-[13px] font-sans">
      {/* 1. 상단 다크 헤더 바 */}
      <div className="h-[38px] bg-[#1e293b] border-b border-[#0f172a] px-3.5 flex items-center justify-between text-white shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="w-2 h-4 bg-[#10b981] rounded-2xs inline-block" />
          <h1 className="text-[14px] font-black tracking-tight text-white flex items-center gap-2.5">
            발주 확정 승인
            {hasGfsOrders ? (
              <span className="text-[11.5px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-400" />
                자재발주(요일별) 확정 연동 완료 ({confirmedOrderNos.length}건 전표)
              </span>
            ) : (
              <span className="text-[11.5px] font-medium px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/40">
                소요량 검토 중 (미확정)
              </span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* 핵심 추천: 자재발주(요일별) 화면 바로가기 버튼 */}
          <button
            type="button"
            onClick={() => handleNavigate('pur-mat-order-day')}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xs text-[12px] font-black shadow-xs cursor-pointer border border-blue-400"
            title="실제 요일별 패턴 발주를 실행하는 메인 발주 화면으로 이동합니다."
          >
            <Boxes size={13} />
            자재발주(요일별) 실행
            <ArrowRight size={12} />
          </button>

          <button
            type="button"
            onClick={handleApplyCalcQtyAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xs text-[11.5px] font-bold transition-colors shadow-2xs cursor-pointer border border-amber-700"
            title="계산된 순부족량을 발주수량에 일괄 적용합니다."
          >
            부족량 일괄적용
          </button>
          <button
            type="button"
            onClick={handleClearQtyAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-gray-600 hover:bg-gray-500 text-gray-200 rounded-xs text-[11.5px] font-medium transition-colors shadow-2xs cursor-pointer border border-gray-700"
            title="발주수량을 0으로 초기화합니다."
          >
            수량 비우기
          </button>
          <button
            type="button"
            onClick={handleSaveOrders}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xs text-[12px] font-black transition-colors shadow-2xs cursor-pointer border border-emerald-700 disabled:opacity-50"
            title="현재 검토된 발주수량으로 ERP 발주서(PO) 전표를 확정 저장합니다."
          >
            <Save size={13} />
            {isSaving ? '저장 중...' : '발주소요량 확정저장'}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1 px-2.5 py-1 bg-teal-700 hover:bg-teal-600 text-white rounded-xs text-[11.5px] font-bold transition-colors shadow-2xs cursor-pointer border border-teal-800"
            title="현재 그리드 엑셀 다운로드"
          >
            <Download size={13} />
            엑셀
          </button>
          <button
            type="button"
            onClick={() => void fetchOrderReqs()}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xs text-[11.5px] font-medium transition-colors shadow-2xs cursor-pointer border border-gray-600"
            title="새로고침"
          >
            <RotateCcw size={12} className={isLoading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>
      </div>

      {/* 2. 상단 4대 핵심 KPI 카드 & 파이프라인 연계 */}
      <div className="bg-[#f8fafc] border-b border-[#cbd5e1] px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* KPI 카드 4개 */}
        <div className="flex items-center gap-2.5">
          {/* 전체 자재 */}
          <div className="bg-white border border-slate-300 rounded-xs px-3 py-1 flex items-center gap-2 shadow-2xs">
            <span className="text-[11.5px] font-bold text-slate-500">전체 자재</span>
            <span className="text-[14px] font-black text-slate-900 font-mono">{rows.length}개</span>
          </div>

          {/* 결품 위험 (부족 자재) */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'SHORTAGE' ? 'ALL' : 'SHORTAGE')}
            className={`border rounded-xs px-3 py-1 flex items-center gap-2 cursor-pointer transition-all shadow-2xs ${
              statusFilter === 'SHORTAGE'
                ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-400'
                : shortageCount > 0
                ? 'bg-rose-50 border-rose-300 hover:bg-rose-100'
                : 'bg-white border-slate-300'
            }`}
          >
            <ShieldAlert size={14} className={shortageCount > 0 ? 'text-rose-600' : 'text-slate-400'} />
            <span className="text-[11.5px] font-bold text-rose-800">결품 위험 자재</span>
            <span className="text-[14.5px] font-black text-rose-600 font-mono">{shortageCount}개</span>
          </div>

          {/* 발주 대상 */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'TARGET' ? 'ALL' : 'TARGET')}
            className={`border rounded-xs px-3 py-1 flex items-center gap-2 cursor-pointer transition-all shadow-2xs ${
              statusFilter === 'TARGET'
                ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
                : 'bg-white border-slate-300 hover:bg-amber-50'
            }`}
          >
            <span className="text-[11.5px] font-bold text-amber-800">발주대상(수량&gt;0)</span>
            <span className="text-[14px] font-black text-amber-700 font-mono">{targetCount}개</span>
          </div>

          {/* 확정 완료 */}
          <div
            onClick={() => setStatusFilter(statusFilter === 'CONFIRMED' ? 'ALL' : 'CONFIRMED')}
            className={`border rounded-xs px-3 py-1 flex items-center gap-2 cursor-pointer transition-all shadow-2xs ${
              statusFilter === 'CONFIRMED'
                ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-400'
                : 'bg-white border-slate-300 hover:bg-emerald-50'
            }`}
          >
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span className="text-[11.5px] font-bold text-emerald-800">발주확정 완료</span>
            <span className="text-[14px] font-black text-emerald-700 font-mono">{confirmedCount}개</span>
          </div>

          {/* 발주 예정/확정 총액 */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xs px-3 py-1 flex items-center gap-2 shadow-2xs">
            <span className="text-[11.5px] font-bold text-blue-900">발주 총액:</span>
            <span className="text-[14.5px] font-black text-blue-950 font-mono">
              ₩{Math.round(totals.orderAmt).toLocaleString()}
            </span>
          </div>
        </div>

        {/* 파이프라인 링크 */}
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className="font-bold text-slate-500">관련 메뉴:</span>
          <button
            type="button"
            onClick={() => handleNavigate('pur-order-status-edit')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11.5px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs cursor-pointer"
          >
            발주현황/수정 <ExternalLink size={10} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pur-receiving-reg')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11.5px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs cursor-pointer"
          >
            입고등록(GSR) <ExternalLink size={10} />
          </button>
        </div>
      </div>

      {/* 3. 조건 검색 바 (기준일자 + 매입처 + 검색어 + 뷰 필터 탭) */}
      <div className="bg-[#edf2f7] border-b border-[#cbd5e1] px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-3">
          {/* 기준일자 */}
          <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded border border-gray-300 shadow-2xs">
            <span className="font-bold text-gray-700 text-[12px] flex items-center gap-1">
              <Calendar size={13} className="text-blue-600" />
              기준일자:
            </span>
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-0.5 hover:bg-gray-100 rounded text-gray-600 cursor-pointer"
              title="전일"
            >
              <ChevronLeft size={14} />
            </button>
            <input
              type="date"
              value={reqDate}
              onChange={(e) => {
                setReqDate(e.target.value);
                fetchOrderReqs(e.target.value);
              }}
              className="bg-transparent border-0 font-bold text-slate-900 text-[12.5px] font-mono w-[125px] focus:outline-hidden"
            />
            <button
              type="button"
              onClick={handleNextDay}
              className="p-0.5 hover:bg-gray-100 rounded text-gray-600 cursor-pointer"
              title="익일"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* 매입처 선택 */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-gray-300 shadow-2xs">
            <span className="font-bold text-gray-700 text-[12px]">매입처:</span>
            <select
              value={selectedSupplier}
              onChange={(e) => {
                setSelectedSupplier(e.target.value);
                fetchOrderReqs(reqDate, e.target.value);
              }}
              className="bg-transparent border-0 font-medium text-slate-800 text-[12px] focus:outline-hidden max-w-[180px] cursor-pointer"
            >
              <option value="ALL">전체 매입처 (ALL)</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 품목 빠른 검색 */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-gray-300 shadow-2xs">
            <Search size={13} className="text-slate-400" />
            <input
              type="text"
              placeholder="품명 / 자재코드 / 거래처 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void fetchOrderReqs();
              }}
              className="bg-transparent border-0 text-[12px] text-slate-900 w-[180px] focus:outline-hidden"
            />
          </div>
        </div>

        {/* 뷰 필터 탭 (전체 / 결품위험 / 발주대상 / 확정완료) */}
        <div className="flex items-center gap-1 bg-slate-200 p-0.5 rounded">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-0.5 rounded text-[11.5px] font-bold cursor-pointer transition-colors ${
              statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            전체 보기 ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SHORTAGE')}
            className={`px-2.5 py-0.5 rounded text-[11.5px] font-bold cursor-pointer transition-colors ${
              statusFilter === 'SHORTAGE' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-100'
            }`}
          >
            🚨 결품위험만 ({shortageCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('TARGET')}
            className={`px-2.5 py-0.5 rounded text-[11.5px] font-bold cursor-pointer transition-colors ${
              statusFilter === 'TARGET' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-800 hover:bg-amber-100'
            }`}
          >
            📦 발주대상만 ({targetCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('CONFIRMED')}
            className={`px-2.5 py-0.5 rounded text-[11.5px] font-bold cursor-pointer transition-colors ${
              statusFilter === 'CONFIRMED' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            ✅ 확정완료만 ({confirmedCount})
          </button>
        </div>
      </div>

      {/* 수주/발주 데이터 없음 알림 */}
      {!isLoading && filteredRows.length === 0 && (
        <div className="mx-3.5 my-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              선택하신 일자(<strong>{reqDate}</strong>)에 등록된 소요량 및 발주 데이터가 없습니다.
              {latestDateWithOrders && (
                <span className="ml-1 text-slate-700">
                  (가장 최근 등록된 발주일자: <strong>{latestDateWithOrders}</strong>)
                </span>
              )}
            </span>
          </div>
          {latestDateWithOrders && latestDateWithOrders !== reqDate && (
            <button
              type="button"
              onClick={() => {
                setReqDate(latestDateWithOrders);
                fetchOrderReqs(latestDateWithOrders);
              }}
              className="flex items-center gap-1 px-3 py-1 text-[11.5px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-2xs cursor-pointer transition-colors"
            >
              최근 발주일자({latestDateWithOrders})로 즉시 조회 <ArrowRight size={12} />
            </button>
          )}
        </div>
      )}

      {/* 4. 대형 데이터 그리드 */}
      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 min-h-0 overflow-auto border border-[#94a3b8]">
          <EditableTableWrapper>
            <table className="w-full min-w-full border-collapse text-[13px] font-sans">
              <thead className="sticky top-0 z-20 bg-[#dbeafe] text-slate-900 font-bold border-b border-[#94a3b8]">
                <tr className="h-[36px] leading-tight text-center whitespace-nowrap">
                  <th className="border border-[#94a3b8] px-1.5 py-1 bg-[#cbd5e1] w-[38px] min-w-[38px]">No</th>
                  <th className="border border-[#94a3b8] px-1.5 py-1 w-[60px] min-w-[60px] text-center">구분</th>
                  <th className="border border-[#94a3b8] px-2 py-1 min-w-[105px] text-center">자재코드</th>
                  <th className="border border-[#94a3b8] px-3 py-1 min-w-[240px] text-left">품명</th>
                  <th className="border border-[#94a3b8] px-2 py-1 min-w-[110px] text-center">규격</th>
                  <th className="border border-[#94a3b8] px-1.5 py-1 w-[50px] min-w-[50px] text-center">단위</th>
                  <th className="border border-[#94a3b8] px-2.5 py-1 min-w-[140px] text-left">거래처</th>
                  <th className="border border-[#94a3b8] px-2 py-1 min-w-[85px] text-right bg-amber-100/90 text-blue-950 font-black">
                    발주수량(✏️)
                  </th>
                  <th className="border border-[#94a3b8] px-2 py-1 min-w-[80px] text-right">발주단가</th>
                  <th className="border border-[#94a3b8] px-2.5 py-1 min-w-[100px] text-right font-black">발주금액</th>
                  <th className="border border-[#94a3b8] px-2 py-1 min-w-[90px] text-right bg-rose-100/90 text-rose-950 font-black">
                    순부족량🚨
                  </th>
                  <th className="border border-[#94a3b8] px-2 py-1 min-w-[70px] text-right">안전재고</th>
                  <th className="border border-[#94a3b8] px-2.5 py-1 min-w-[80px] text-right">현재고</th>
                  <th className="border border-[#94a3b8] px-2 py-1 min-w-[80px] text-right">입고예정량</th>
                  <th className="border border-[#94a3b8] px-1.5 py-1 min-w-[65px] text-center">발주단위</th>
                  <th className="border border-[#94a3b8] px-1.5 py-1 min-w-[65px] text-right">최소발주</th>
                  <th className="border border-[#94a3b8] px-1.5 py-1 min-w-[55px] text-center">리드타임</th>
                  <th className="border border-[#94a3b8] px-2 py-1 min-w-[110px] text-center">상태</th>
                  <th className="border border-[#94a3b8] px-2 py-1 min-w-[130px] text-center">발주전표번호</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={19} className="py-16 text-center text-gray-500 font-bold text-[14px]">
                      자재 소요량 및 재고 데이터를 정밀 분석 중입니다...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="py-16 text-center text-gray-500 font-medium text-[13.5px]">
                      해당 조건에 일치하는 소요량 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr
                      key={row.id || idx}
                      className={`h-[34px] hover:bg-blue-50/70 transition-colors ${
                        row.calcQty > 0
                          ? 'bg-rose-50/40'
                          : row.isConfirmed
                          ? 'bg-emerald-50/40'
                          : row.orderQty > 0
                          ? 'bg-amber-50/30'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-[#f8fafc]'
                      }`}
                    >
                      <td className="border border-[#cbd5e1] px-1 py-1 text-center font-mono text-gray-500 text-[12px]">
                        {idx + 1}
                      </td>
                      <td className="border border-[#cbd5e1] px-1 py-1 text-center text-gray-700 text-[12px]">
                        {row.category}
                      </td>
                      <td className="border border-[#cbd5e1] px-2 py-1 text-center font-mono text-[12px] text-gray-700">
                        {row.materialCode}
                      </td>
                      <td className="border border-[#cbd5e1] px-3 py-1 text-left font-bold text-gray-950 text-[13.5px]">
                        {row.itemName}
                      </td>
                      <td className="border border-[#cbd5e1] px-2 py-1 text-center text-gray-600 text-[12px]">
                        {row.spec || '-'}
                      </td>
                      <td className="border border-[#cbd5e1] px-1 py-1 text-center text-gray-700 text-[12px]">
                        {row.unit}
                      </td>
                      <td className="border border-[#cbd5e1] px-2.5 py-1 text-left text-gray-800 text-[12.5px] truncate max-w-[140px]">
                        {row.supplier}
                      </td>
                      <td className="border border-[#cbd5e1] px-2 py-1 text-right bg-amber-50/80 font-mono font-black text-blue-950 text-[14px]">
                        {renderEditableCell(row, 'orderQty', 'right', true)}
                      </td>
                      <td className="border border-[#cbd5e1] px-2 py-1 text-right font-mono text-gray-800">
                        <div>{renderEditableCell(row, 'unitPrice', 'right', true)}</div>
                        {(row.bagPrice || row.boxPrice) ? (
                          <div className="text-[10.5px] text-slate-500 whitespace-nowrap">
                            입수 {row.packUnit || row.unitQty || 1} · 봉 {(row.bagPrice || row.unitPrice || 0).toLocaleString()} / 박스 {(row.boxPrice || calcBoxPrice(row.bagPrice || row.unitPrice, row.packUnit || row.unitQty || 1)).toLocaleString()}
                          </div>
                        ) : null}
                      </td>
                      <td className="border border-[#cbd5e1] px-2.5 py-1 text-right font-mono font-black text-slate-900 text-[13.5px]">
                        {row.orderAmt.toLocaleString()}
                      </td>
                      <td
                        className={`border border-[#cbd5e1] px-2 py-1 text-right font-mono font-black text-[14px] ${
                          row.calcQty > 0 ? 'text-rose-600 bg-rose-100/50' : 'text-gray-400'
                        }`}
                      >
                        {row.calcQty.toLocaleString()}
                      </td>
                      <td className="border border-[#cbd5e1] px-2 py-1 text-right font-mono text-gray-600">
                        {row.safetyStock.toLocaleString()}
                      </td>
                      <td className="border border-[#cbd5e1] px-2.5 py-1 text-right font-mono text-gray-900 font-bold">
                        {row.currentStock.toLocaleString()}
                      </td>
                      <td className="border border-[#cbd5e1] px-2 py-1 text-right font-mono text-blue-800 font-semibold">
                        {row.incomingScheduled.toLocaleString()}
                      </td>
                      <td className="border border-[#cbd5e1] px-1 py-1 text-center text-gray-600 text-[12px]">
                        {row.orderUnit}
                      </td>
                      <td className="border border-[#cbd5e1] px-1.5 py-1 text-right font-mono text-gray-600">
                        {row.minOrderQty.toLocaleString()}
                      </td>
                      <td className="border border-[#cbd5e1] px-1 py-1 text-center text-gray-600 text-[12px]">
                        {row.leadTime}일
                      </td>
                      <td className="border border-[#cbd5e1] px-2 py-1 text-center text-[11.5px]">
                        {row.calcQty > 0 ? (
                          <span className="px-2 py-0.5 rounded font-black bg-rose-100 text-rose-800 border border-rose-300">
                            🚨 결품위험
                          </span>
                        ) : row.isConfirmed ? (
                          <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            확정완료
                          </span>
                        ) : row.orderQty > 0 ? (
                          <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            발주대상
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded font-medium text-slate-500 bg-slate-100">
                            정상재고
                          </span>
                        )}
                      </td>
                      <td className="border border-[#cbd5e1] px-2 py-1 text-center font-mono text-[12px] text-blue-700 font-bold">
                        {row.orderNo || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-[#fef9c3] font-mono font-bold text-gray-900 border-t-2 border-slate-400 sticky bottom-0 z-10 shadow-sm">
                <tr className="h-[36px]">
                  <td colSpan={7} className="border border-[#cbd5e1] px-3 py-1 font-sans text-center font-black text-[13.5px]">
                    선택 조건 총합계 ({filteredRows.length}개 품목)
                  </td>
                  <td className="border border-[#cbd5e1] px-2 py-1 text-right text-[15px] font-black text-blue-950 bg-blue-100/50">
                    {totals.orderQty.toLocaleString()}
                  </td>
                  <td className="border border-[#cbd5e1] px-2 py-1"></td>
                  <td className="border border-[#cbd5e1] px-2.5 py-1 text-right text-[14.5px] font-black text-slate-950">
                    {totals.orderAmt.toLocaleString()}
                  </td>
                  <td className="border border-[#cbd5e1] px-2 py-1 text-right text-[15px] font-black text-rose-700 bg-rose-100/50">
                    {totals.calcQty.toLocaleString()}
                  </td>
                  <td className="border border-[#cbd5e1] px-2 py-1 text-right text-gray-800 font-bold">
                    {totals.safetyStock.toLocaleString()}
                  </td>
                  <td className="border border-[#cbd5e1] px-2.5 py-1 text-right text-gray-950 font-black">
                    {totals.currentStock.toLocaleString()}
                  </td>
                  <td className="border border-[#cbd5e1] px-2 py-1 text-right text-blue-900 font-bold">
                    {totals.incomingScheduled.toLocaleString()}
                  </td>
                  <td colSpan={5} className="border border-[#cbd5e1] px-2 py-1"></td>
                </tr>
              </tfoot>
            </table>
          </EditableTableWrapper>
        </div>
      </div>
    </div>
  );
};
