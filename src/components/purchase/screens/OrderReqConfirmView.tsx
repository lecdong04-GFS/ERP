'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  HelpCircle,
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
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';

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

  // 실시간 DB 소요량 및 스마트발주 확정 데이터 조회
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
    fetchOrderReqs();
  }, [fetchOrderReqs]);

  // 날짜 이동
  const handlePrevDay = () => {
    const d = new Date(reqDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const newDate = d.toISOString().slice(0, 10);
    setReqDate(newDate);
    fetchOrderReqs(newDate);
  };

  const handleNextDay = () => {
    const d = new Date(reqDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
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
          className={`w-full h-full min-h-[22px] bg-white text-gray-900 border-2 border-blue-600 rounded-none px-1 py-0.5 text-[12.5px] outline-none shadow-inner ${
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
        className={`w-full h-full cursor-text hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-1 py-0.5 transition-colors ${
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

  const filteredRows = useMemo(() => {
    if (selectedSupplier === 'ALL') return rows;
    return rows.filter((r) => r.supplier.includes(selectedSupplier));
  }, [rows, selectedSupplier]);

  // 합계
  const totalAmt = useMemo(() => {
    return filteredRows.reduce((acc, r) => acc + r.orderAmt, 0);
  }, [filteredRows]);

  const totalQty = useMemo(() => {
    return filteredRows.reduce((acc, r) => acc + r.orderQty, 0);
  }, [filteredRows]);

  // 계산수량을 발주수량으로 일괄 적용
  const handleApplyCalcQtyAll = () => {
    setRows((prev) =>
      prev.map((r) => {
        const targetQty = r.calcQty > 0 ? Math.ceil(r.calcQty) : 0;
        return {
          ...r,
          orderQty: targetQty,
          orderAmt: targetQty * r.unitPrice,
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

  // 발주서 일괄 확정 및 ERP 발주서(PO) 전표 생성
  const handleSaveOrders = async () => {
    const itemsToSave = filteredRows.filter((r) => Number(r.orderQty) > 0);
    if (itemsToSave.length === 0) {
      alert('발주수량이 1 이상인 품목이 없습니다. 발주수량을 먼저 입력해주세요.');
      return;
    }

    if (
      !confirm(
        `[${reqDate}] 일자로 총 ${itemsToSave.length}개 품목(총 ₩${Math.round(
          totalAmt
        ).toLocaleString()}원)을 ERP 발주서(PO)로 확정 생성하시겠습니까?\n\n생성된 발주서는 [발주현황/수정] 및 [입고등록]에 자동 연계됩니다.`
      )
    ) {
      return;
    }

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
          `✅ 발주서 일괄 확정 완료!\n\n` +
            `• 생성된 발주서: ${(json.data || []).map((o: any) => o.orderNo).join(', ')}\n` +
            `• 발주현황 및 입고등록 화면에 파이프라인 동기화되었습니다.\n\n` +
            `💡 발주 취소/삭제는 [발주현황/수정] 메뉴에서 [선택삭제(영구)]로 지우실 수 있습니다.`
        );
        fetchOrderReqs();
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
    const exportCols = [
      { key: 'category', label: '구분' },
      { key: 'materialCode', label: '자재코드' },
      { key: 'itemName', label: '품명' },
      { key: 'spec', label: '규격' },
      { key: 'unit', label: '단위' },
      { key: 'supplier', label: '거래처' },
      { key: 'orderUnit', label: '발주단위' },
      { key: 'minOrderQty', label: '최소발주수량' },
      { key: 'orderQty', label: '발주수량' },
      { key: 'unitPrice', label: '발주단가' },
      { key: 'orderAmt', label: '발주금액' },
      { key: 'calcQty', label: '발주계산수량' },
      { key: 'currentStock', label: '현재고' },
      { key: 'safetyStock', label: '안전재고' },
      { key: 'incomingScheduled', label: '입고예정량' },
      { key: 'status', label: '상태' },
      { key: 'orderNo', label: '발주전표' },
    ];
    exportGridToExcel({
      filename: `발주소요량확정_${reqDate}_${selectedSupplier}`,
      sheetName: '소요량확정',
      columns: exportCols as any,
      data: filteredRows,
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f0f2f5] select-none text-[12.5px] font-sans">
      {/* 1. 상단 다크 헤더 바 */}
      <div className="h-[34px] bg-[#2d3748] border-b border-[#1a202c] px-3 flex items-center justify-between text-white shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-4 bg-[#48bb78] rounded-2xs inline-block" />
          <h1 className="text-[13px] font-extrabold tracking-tight text-white flex items-center gap-2">
            발주소요량확정
            {hasGfsOrders ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                <CheckCircle2 size={11} />
                스마트발주(GFS) 확정 연계 완료 ({confirmedOrderNos.length}건 전표)
              </span>
            ) : (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                소요량 검토 중 (미확정)
              </span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleApplyCalcQtyAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xs text-[11px] font-bold transition-colors shadow-2xs cursor-pointer border border-amber-700"
            title="계산된 순부족량을 발주수량에 일괄 적용합니다."
          >
            추천수량 일괄적용
          </button>
          <button
            type="button"
            onClick={handleClearQtyAll}
            className="flex items-center gap-1 px-2 py-1 bg-gray-600 hover:bg-gray-500 text-gray-200 rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-gray-700"
            title="발주수량을 0으로 초기화합니다."
          >
            수량 비우기
          </button>
          <button
            type="button"
            onClick={handleSaveOrders}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xs text-[11px] font-black transition-colors shadow-2xs cursor-pointer border border-blue-700 disabled:opacity-50"
            title="현재 검토된 발주수량으로 ERP 정식 발주서(PO) 전표를 생성합니다."
          >
            <Save size={12} />
            {isSaving ? '확정 저장 중...' : '발주서 일괄 확정(DB 저장)'}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1 px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-emerald-800"
            title="엑셀 다운로드"
          >
            <Download size={12} />
            엑셀
          </button>
          <button
            type="button"
            onClick={() => fetchOrderReqs()}
            disabled={isLoading}
            className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-gray-600"
            title="새로고침"
          >
            <RotateCcw size={11} className={isLoading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>
      </div>

      {/* 2. 파이프라인 바로가기 바 (스마트발주 ◀ 커맨드센터 / 발주현황 / 입고등록) */}
      <div className="bg-[#edf2f7] border-b border-[#cbd5e1] px-3 py-1 flex items-center justify-between shrink-0 text-[11.5px]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-600">🔗 발주 파이프라인 연계:</span>
          <button
            type="button"
            onClick={() => handleNavigate('pur-gfs-smart-order')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 shadow-2xs transition-colors cursor-pointer"
          >
            🍱 스마트발주(GFS) 열기 <ExternalLink size={10} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pur-order-status-edit')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
          >
            📋 발주현황/수정 <ExternalLink size={10} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pur-receiving-reg')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
          >
            📥 입고등록(GSR) <ExternalLink size={10} />
          </button>
        </div>

        <div className="text-[11px] text-slate-500">
          💡 스마트발주(GFS)에서 발주 저장 시, 본 화면 및 발주·입고 파이프라인에 실시간 연동됩니다.
        </div>
      </div>

      {/* 3. 조건 검색 바 (기준일자 + 매입처 + 검색어) */}
      <div className="bg-[#f8fafc] border-b border-[#cbd5e1] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-3">
          {/* 기준일자 */}
          <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
            <span className="font-bold text-gray-700 text-[11px] flex items-center gap-1">
              <Calendar size={12} className="text-blue-600" />
              기준일자:
            </span>
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-0.5 hover:bg-gray-100 rounded text-gray-600"
              title="전일"
            >
              <ChevronLeft size={13} />
            </button>
            <input
              type="date"
              value={reqDate}
              onChange={(e) => {
                setReqDate(e.target.value);
                fetchOrderReqs(e.target.value);
              }}
              className="bg-transparent border-0 font-bold text-slate-900 text-[11.5px] w-[115px] focus:outline-hidden"
            />
            <button
              type="button"
              onClick={handleNextDay}
              className="p-0.5 hover:bg-gray-100 rounded text-gray-600"
              title="익일"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* 매입처 선택 */}
          <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
            <span className="font-bold text-gray-700 text-[11px]">매입처:</span>
            <select
              value={selectedSupplier}
              onChange={(e) => {
                setSelectedSupplier(e.target.value);
                fetchOrderReqs(reqDate, e.target.value);
              }}
              className="bg-transparent border-0 font-medium text-slate-800 text-[11.5px] focus:outline-hidden max-w-[160px] cursor-pointer"
            >
              <option value="ALL">전체 (ALL)</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 품목 검색 */}
          <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
            <Search size={12} className="text-slate-400" />
            <input
              type="text"
              placeholder="품명 / 코드 / 거래처"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchOrderReqs();
              }}
              className="bg-transparent border-0 text-[11.5px] text-slate-900 w-[130px] focus:outline-hidden"
            />
          </div>
        </div>

        {/* 요약 칩 */}
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-gray-600 font-semibold bg-white px-2.5 py-0.5 rounded border border-gray-300 shadow-2xs">
            데이터수: <span className="font-bold text-blue-700">{filteredRows.length}</span>
          </div>
          <div className="text-[11px] text-gray-600 font-semibold bg-white px-2.5 py-0.5 rounded border border-gray-300 shadow-2xs">
            발주대상: <span className="font-bold text-amber-700">{filteredRows.filter((r) => r.orderQty > 0).length}</span> 품목
          </div>
          <div className="text-[11px] text-gray-600 font-semibold bg-white px-2.5 py-0.5 rounded border border-gray-300 shadow-2xs">
            발주금액: <span className="font-bold text-emerald-700">₩{Math.round(totalAmt).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 수주/발주 데이터 없음 알림 */}
      {!isLoading && filteredRows.length === 0 && (
        <div className="mx-3 my-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11.5px] text-amber-900 flex items-center justify-between">
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
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-2xs cursor-pointer transition-colors"
            >
              최근 발주일자({latestDateWithOrders})로 조회 <ArrowRight size={11} />
            </button>
          )}
        </div>
      )}

      {/* 4. 대형 데이터 그리드 */}
      <div className="flex-1 p-0.5 min-h-0 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 min-h-0 overflow-auto border border-[#a4abb6]">
          <EditableTableWrapper>
            <table className="w-full min-w-full border-collapse text-[12.5px] font-sans">
              <thead className="sticky top-0 z-20 bg-[#c5cbf0] text-gray-900 font-semibold border-b border-[#9098aa]">
                <tr className="h-[32px] leading-tight text-center whitespace-nowrap font-bold">
                  <th className="border border-[#9098aa] px-1 py-0.5 bg-[#e2e6f3] w-[32px] min-w-[32px]">No</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 w-[55px] min-w-[55px] text-center">구분</th>
                  <th className="border border-[#9098aa] px-2 py-0.5 min-w-[260px] text-left">품명</th>
                  <th className="border border-[#9098aa] px-2 py-0.5 min-w-[110px] text-center">규격</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 w-[45px] min-w-[45px] text-center">단위</th>
                  <th className="border border-[#9098aa] px-2 py-0.5 min-w-[140px] text-left">거래처</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-center">발주단위</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-right">최소발주</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-right bg-amber-100/80 text-blue-900">
                    발주수량(✏️)
                  </th>
                  <th className="border border-[#9098aa] px-2 py-0.5 min-w-[75px] text-right">발주단가</th>
                  <th className="border border-[#9098aa] px-2 py-0.5 min-w-[90px] text-right">발주금액</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-right">계산부족량</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-right">Unit수량</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-right">발주단위수량</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 min-w-[55px] text-center">조달기간</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-right">안전재고</th>
                  <th className="border border-[#9098aa] px-2 py-0.5 min-w-[75px] text-right">현재고</th>
                  <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-right">입고예정량</th>
                  <th className="border border-[#9098aa] px-1.5 py-0.5 min-w-[110px] text-center">상태</th>
                  <th className="border border-[#9098aa] px-1.5 py-0.5 min-w-[120px] text-center">발주전표</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={20} className="py-12 text-center text-gray-500 font-bold">
                      스마트발주(GFS) 및 실시간 소요량 데이터 로딩 중...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="py-12 text-center text-gray-500 font-medium">
                      해당 조건의 소요량 및 발주 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr
                      key={row.id || idx}
                      className={`h-[28px] text-[12px] hover:bg-blue-50/60 transition-colors ${
                        row.isConfirmed
                          ? 'bg-emerald-50/40'
                          : row.orderQty > 0
                          ? 'bg-amber-50/30'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-[#fafafa]'
                      }`}
                    >
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-center font-mono text-gray-500">
                        {idx + 1}
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-center text-gray-700">
                        {row.category}
                      </td>
                      <td className="border border-[#d0d4dc] px-2 py-0.5 text-left font-bold text-gray-900">
                        {row.itemName}
                      </td>
                      <td className="border border-[#d0d4dc] px-2 py-0.5 text-center text-gray-600 text-[11.5px]">
                        {row.spec}
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-center text-gray-700">
                        {row.unit}
                      </td>
                      <td className="border border-[#d0d4dc] px-2 py-0.5 text-left text-gray-800 text-[11.5px] truncate max-w-[140px]">
                        {row.supplier}
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-center text-gray-700">
                        {row.orderUnit}
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-right font-mono text-gray-600">
                        {row.minOrderQty.toLocaleString()}
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-right bg-amber-50/80 font-mono font-extrabold text-blue-900">
                        {renderEditableCell(row, 'orderQty', 'right', true)}
                      </td>
                      <td className="border border-[#d0d4dc] px-2 py-0.5 text-right font-mono text-gray-800">
                        {renderEditableCell(row, 'unitPrice', 'right', true)}
                      </td>
                      <td className="border border-[#d0d4dc] px-2 py-0.5 text-right font-mono font-bold text-slate-900">
                        {row.orderAmt.toLocaleString()}
                      </td>
                      <td
                        className={`border border-[#d0d4dc] px-1 py-0.5 text-right font-mono ${
                          row.calcQty > 0 ? 'text-rose-600 font-bold' : 'text-gray-400'
                        }`}
                      >
                        {row.calcQty.toLocaleString()}
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-right font-mono text-gray-600">
                        {row.unitQty.toLocaleString()}
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-right font-mono text-gray-600">
                        {row.orderUnitQty.toLocaleString()}
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-center text-gray-600">
                        {row.leadTime}일
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-right font-mono text-gray-600">
                        {row.safetyStock.toLocaleString()}
                      </td>
                      <td className="border border-[#d0d4dc] px-2 py-0.5 text-right font-mono text-gray-800 font-semibold">
                        {row.currentStock.toLocaleString()}
                      </td>
                      <td className="border border-[#d0d4dc] px-1 py-0.5 text-right font-mono text-gray-600">
                        {row.incomingScheduled.toLocaleString()}
                      </td>
                      <td className="border border-[#d0d4dc] px-1.5 py-0.5 text-center text-[11px]">
                        {row.isConfirmed ? (
                          <span className="px-1.5 py-0.5 rounded font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            확정완료(GFS)
                          </span>
                        ) : row.orderQty > 0 ? (
                          <span className="px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            발주대상
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-slate-500 bg-slate-100">
                            재고충분
                          </span>
                        )}
                      </td>
                      <td className="border border-[#d0d4dc] px-1.5 py-0.5 text-center font-mono text-[11px] text-blue-700 font-bold">
                        {row.orderNo || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </EditableTableWrapper>
        </div>
      </div>
    </div>
  );
};
