'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  HelpCircle,
  RotateCcw,
  Calendar,
  Save,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Layers,
  Boxes,
  FileSpreadsheet,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';
import { DAY_CHARS, calcRow, splitWeek, getScheduledExclusion, type SheetRowInput } from '@/lib/gfs/orderCalc';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface SheetRow extends SheetRowInput {}

export const MatOrderNormalView: React.FC = () => {
  const { openTab } = useTabs();

  // 검색 조건
  const [orderDate, setOrderDate] = useState<string>(kstToday());
  const [supplierFilter, setSupplierFilter] = useState<string>('전체');
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [onlyNeeded, setOnlyNeeded] = useState<boolean>(false);
  const [keyword, setKeyword] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showWeek, setShowWeek] = useState<boolean>(true);

  // 해당 일자의 실제 생성된 ERP 발주서(PO) 전표 목록
  const [confirmedPoList, setConfirmedPoList] = useState<any[]>([]);
  const [isLoadingPo, setIsLoadingPo] = useState<boolean>(false);

  // 탭 이동 헬퍼
  const handleNavigate = (menuId: string) => {
    const item = getMenuItemById(menuId);
    if (item) {
      openTab(item);
    }
  };

  // 1. 발주시트 정본 로드 (스마트발주 GFS 마스터와 실시간 동기화)
  const loadOrderSheet = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/gfs/order-sheet?date=${encodeURIComponent(orderDate)}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.rows)) {
        const loaded: SheetRow[] = json.data.rows.map((r: any) => {
          const pack = r.packUnit || r.packUnitAudit || 0;
          const total = (r.incoming || 0) + (r.currentStock || 0);
          const req = (r.dailyUsage || 0) * (r.days || 0);
          const suggest = pack > 0 ? Math.ceil(Math.max(0, req - total) / pack) : 0;
          return {
            id: r.id,
            supplier: r.supplier || '',
            name: r.name,
            boxesBase: r.boxesBase || 0,
            packUnit: r.packUnit || 0,
            packUnitAudit: (r as any).packUnitAudit || 0,
            days: r.days || 0,
            dailyUsage: r.dailyUsage || 0,
            incoming: r.incoming || 0,
            currentStock: r.currentStock || 0,
            bagPrice: r.bagPrice || 0,
            warehouse: r.warehouse || '',
            vendor: r.vendor || '',
            finalBoxes: suggest,
            manual: false,
            discontinuedDate: r.discontinuedDate || '',
          };
        });
        setRows(loaded);
        setSuppliers(json.data.suppliers || []);
      }
    } catch (err) {
      console.error('Failed to load order sheet', err);
    } finally {
      setIsLoading(false);
    }
  }, [orderDate]);

  useEffect(() => {
    loadOrderSheet();
  }, [loadOrderSheet]);

  // 2. 기준일자의 실제 ERP 발주서(PO) 전표 조회
  const loadConfirmedPo = useCallback(async () => {
    if (!orderDate) return;
    setIsLoadingPo(true);
    try {
      const res = await fetch(`/api/purchase/order?orderDate=${orderDate}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const valid = json.data.filter((po: any) => po.status !== '발주취소');
        setConfirmedPoList(valid);
      } else {
        setConfirmedPoList([]);
      }
    } catch {
      setConfirmedPoList([]);
    } finally {
      setIsLoadingPo(false);
    }
  }, [orderDate]);

  useEffect(() => {
    loadConfirmedPo();
  }, [loadConfirmedPo]);

  // 날짜 이동 핸들러
  const handlePrevDay = () => {
    const d = new Date(orderDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setOrderDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(orderDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setOrderDate(d.toISOString().slice(0, 10));
  };

  // 요일 헤더 (발주일 기준 7일)
  const weekLabels = useMemo(() => {
    const base = new Date(orderDate + 'T00:00:00');
    return DAY_CHARS.map((d, i) => {
      const dt = new Date(base);
      dt.setDate(dt.getDate() + i);
      return `${d}(${String(dt.getDate()).padStart(2, '0')})`;
    });
  }, [orderDate]);

  // 필터링된 행 목록
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return false;
      if (keyword.trim() && !r.name.toLowerCase().includes(keyword.trim().toLowerCase()))
        return false;
      if (onlyNeeded) {
        const c = calcRow(r);
        if (c.finalBoxes <= 0) return false;
      }
      return true;
    });
  }, [rows, supplierFilter, keyword, onlyNeeded]);

  // 합계 계산
  const totals = useMemo(() => {
    let boxes = 0;
    let amt = 0;
    filtered.forEach((r) => {
      const c = calcRow(r);
      boxes += c.finalBoxes;
      amt += c.amount;
    });
    return { boxes, amt };
  }, [filtered]);

  // 수기 발주량 변경 핸들러 (정수 박스 단위)
  const handleFinalChange = (id: number, val: string) => {
    const num = Math.max(0, Math.ceil(Number(val) || 0));
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, finalBoxes: num, manual: true } : r))
    );
  };

  // 수량 산출 초기화
  const handleReset = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        manual: false,
        finalBoxes: calcRow({ ...r, manual: false }).suggest,
      }))
    );
  };

  // 발주서 확정 생성 및 ERP 발주서(PO) 전표 저장
  const handleSaveOrder = async () => {
    const targets = rows
      .map((r) => ({ r, c: calcRow(r) }))
      .filter(({ c }) => c.finalBoxes > 0);

    if (targets.length === 0) {
      alert('확정 발주량이 0보다 큰 품목이 없습니다.');
      return;
    }

    if (
      !confirm(
        `[${orderDate}] 일자로 총 ${targets.length}개 품목 (${totals.boxes.toLocaleString()}박스 / ₩${Math.round(
          totals.amt
        ).toLocaleString()}원)을 ERP 정식 발주서(PO)로 확정 생성하시겠습니까?\n\n생성된 발주서는 [발주현황/수정] 및 [입고등록] 화면에 실시간 연동됩니다.`
      )
    ) {
      return;
    }

    setIsSaving(true);
    try {
      // Step 1: /api/gfs/materialize 호출하여 ERP 품목 코드 매칭
      const matRes = await fetch('/api/gfs/materialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate,
          items: targets.map(({ r, c }) => ({
            productId: r.productId ?? r.id,
            productCode: (r as any).itemId || undefined,
            name: r.name,
            boxes: c.finalBoxes,
            packUnit: c.pack || r.packUnit,
            bagPrice: r.bagPrice,
            supplierHeader: r.supplier,
          })),
        }),
      });
      const matJson = await matRes.json();
      if (!matJson.success) {
        alert('ERP 품목 매칭 실패: ' + (matJson.error || '알 수 없는 오류'));
        return;
      }

      const orderItems = (matJson.data?.matched || [])
        .filter((m: any) => m.productCode)
        .map((m: any) => ({
          productId: m.productId,
          productCode: m.productCode,
          productName: m.productName || m.name,
          orderQty: m.orderQty,
          unit: 'box',
          unitPrice: m.boxPrice || 0,
          totalAmount: m.totalAmount || undefined,
          partnerId: m.partnerId || undefined,
          partnerName: m.partnerName || undefined,
        }));

      if (orderItems.length === 0) {
        alert('ERP 품목 마스터와 매칭된 항목이 없습니다.');
        return;
      }

      // Step 2: /api/gfs/order-result 호출하여 실제 PurchaseOrder 및 MaterialRequirement 생성
      const res = await fetch('/api/gfs/order-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate,
          memo: '자재발주(일반) 발주시트 확정',
          items: orderItems,
        }),
      });
      const json = await res.json();

      if (json.success) {
        const orders = (json.data || []).map((o: any) => o.orderNo).join(', ');
        alert(
          `✅ [${orderDate}] 발주 확정 완료!\n\n` +
            `• 생성된 발주서: ${orders}\n` +
            `• 발주현황 및 입고등록 파이프라인에 실시간 연계되었습니다.`
        );
        loadConfirmedPo();
      } else {
        alert('발주 실패: ' + json.error);
      }
    } catch (err: any) {
      alert('발주 저장 중 통신 오류: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 엑셀 내보내기
  const handleExportExcel = () => {
    const exportData = filtered.map((row, idx) => {
      const c = calcRow(row);
      const week = splitWeek(row, c.finalBoxes);
      return {
        No: idx + 1,
        거래처명: row.supplier,
        품목명: row.name,
        입수량: c.pack || 0,
        발주일수: row.days,
        일사용량: row.dailyUsage,
        입고량: row.incoming,
        금일재고: row.currentStock,
        총재고량: c.totalStock,
        필요값: Math.round(c.required * 10) / 10,
        차이: Number.isFinite(c.diff) ? Math.round(c.diff) : 0,
        재고유지일: Number.isFinite(c.stockDays) ? Math.round(c.stockDays * 10) / 10 : 0,
        확정발주량_박스: c.finalBoxes,
        봉단가: row.bagPrice,
        발주금액: Math.round(c.amount),
        월: week[0] || 0,
        화: week[1] || 0,
        수: week[2] || 0,
        목: week[3] || 0,
        금: week[4] || 0,
        토: week[5] || 0,
        일: week[6] || 0,
      };
    });

    exportGridToExcel({
      filename: `자재발주_일반_${orderDate}_${supplierFilter}`,
      sheetName: '발주시트미러',
      columns: [
        { key: 'No', label: 'No' },
        { key: '거래처명', label: '거래처명' },
        { key: '품목명', label: '품목명' },
        { key: '입수량', label: '입수량' },
        { key: '발주일수', label: '발주일수' },
        { key: '일사용량', label: '일사용량' },
        { key: '입고량', label: '입고량' },
        { key: '금일재고', label: '금일재고' },
        { key: '총재고량', label: '총재고량' },
        { key: '필요값', label: '필요값' },
        { key: '차이', label: '차이' },
        { key: '재고유지일', label: '재고유지일' },
        { key: '확정발주량_박스', label: '발주량(박스)' },
        { key: '봉단가', label: '봉단가' },
        { key: '발주금액', label: '발주금액' },
        { key: '월', label: '월' },
        { key: '화', label: '화' },
        { key: '수', label: '수' },
        { key: '목', label: '목' },
        { key: '금', label: '금' },
        { key: '토', label: '토' },
        { key: '일', label: '일' },
      ],
      data: exportData,
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f0f2f5] select-none text-[12.5px] font-sans">
      {/* 1. 상단 다크 헤더 바 */}
      <div className="h-[34px] bg-[#2d3748] border-b border-[#1a202c] px-3 flex items-center justify-between text-white shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-4 bg-[#48bb78] rounded-2xs inline-block" />
          <h1 className="text-[13px] font-extrabold tracking-tight text-white flex items-center gap-2">
            자재발주 (일반)
            <span className="text-[11px] font-medium text-slate-300">발주시트 미러</span>
            {confirmedPoList.length > 0 ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                <CheckCircle2 size={11} />
                발주 확정 완료 ({confirmedPoList.length}건 전표)
              </span>
            ) : (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                발주 검토 중 (미확정)
              </span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSaveOrder}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xs text-[11px] font-black transition-colors shadow-2xs cursor-pointer border border-emerald-700"
            title="현재 검토된 발주수량으로 ERP 정식 발주서(PO) 전표를 생성합니다."
          >
            <Save size={12} className="stroke-[2.5]" />
            {isSaving ? '확정 저장 중...' : '발주확정(PO생성)'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-2 py-1 bg-gray-600 hover:bg-gray-500 text-gray-200 rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-gray-700"
            title="수기 수정한 수량을 추천 계산치로 초기화합니다."
          >
            <RotateCcw size={11} />
            수량 초기화
          </button>
          <button
            type="button"
            onClick={() => setShowWeek((v) => !v)}
            className="px-2.5 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-slate-700"
          >
            {showWeek ? '요일숨기기' : '요일보기'}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1 px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-blue-800"
            title="엑셀 다운로드"
          >
            <Download size={11} />
            엑셀
          </button>
          <button
            type="button"
            onClick={loadOrderSheet}
            className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-gray-600"
            title="새로고침"
          >
            <RotateCcw size={11} className={isLoading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>
      </div>

      {/* 2. 파이프라인 바로가기 바 */}
      <div className="bg-[#edf2f7] border-b border-[#cbd5e1] px-3 py-1 flex items-center justify-between shrink-0 text-[11.5px]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-600">🔗 발주 파이프라인 연계:</span>
          <button
            type="button"
            onClick={() => handleNavigate('pur-mat-order-day')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 shadow-2xs transition-colors cursor-pointer"
          >
            🍱 자재발주(요일별) 열기 <ExternalLink size={10} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pur-order-req-confirm')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
          >
            📑 발주소요량확정 <ExternalLink size={10} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pur-mat-order-day')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
          >
            📅 자재발주(요일별) <ExternalLink size={10} />
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
          💡 스마트발주(GFS) 마스터 시트와 실시간 연동되어 442개 자재의 18개 핵심 지표를 발주시트 형식 그대로 관리합니다.
        </div>
      </div>

      {/* 3. 조건 검색 바 */}
      <div className="bg-[#f8fafc] border-b border-[#cbd5e1] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* 발주일자 */}
          <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
            <span className="font-bold text-gray-700 text-[11px] flex items-center gap-1">
              <Calendar size={12} className="text-blue-600" />
              발주일자:
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
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
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

          {/* 거래처 선택 */}
          <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
            <span className="font-bold text-gray-700 text-[11px]">거래처:</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-transparent border-0 font-medium text-slate-800 text-[11.5px] focus:outline-hidden max-w-[180px] cursor-pointer"
            >
              <option value="전체">전체 거래처 ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 품명 검색 */}
          <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
            <Search size={12} className="text-slate-400" />
            <input
              type="text"
              placeholder="품명 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="bg-transparent border-0 text-[11.5px] text-slate-900 w-[140px] focus:outline-hidden"
            />
          </div>

          {/* 발주대상만 체크박스 */}
          <label className="flex items-center gap-1.5 cursor-pointer text-[11.5px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
            <input
              type="checkbox"
              checked={onlyNeeded}
              onChange={(e) => setOnlyNeeded(e.target.checked)}
              className="cursor-pointer text-blue-600 rounded-xs"
            />
            발주대상만
          </label>
        </div>

        {/* 요약 칩 */}
        <div className="flex items-center gap-2">
          {confirmedPoList.length > 0 && (
            <div className="text-[11px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 font-bold">
              전표: {confirmedPoList.map((p) => p.orderNo).join(', ')}
            </div>
          )}
          <div className="text-[11.5px] text-gray-700 font-semibold bg-white px-3 py-0.5 rounded border border-gray-300 shadow-2xs flex items-center gap-2">
            <span>품목:</span>
            <strong className="text-blue-700">{filtered.length}개</strong>
            <span>발주:</span>
            <strong className="text-emerald-700">{totals.boxes.toLocaleString()}박스</strong>
            <strong className="text-slate-900">₩{Math.round(totals.amt).toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {/* 4. 발주시트 미러 대형 그리드 */}
      <div className="flex-1 p-0.5 min-h-0 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 min-h-0 overflow-auto border border-[#a4abb6]">
          {isLoading ? (
            <div className="py-20 text-center text-gray-500 font-bold">
              스마트발주(GFS) 마스터 시트 로딩 중...
            </div>
          ) : (
            <EditableTableWrapper>
              <table className="w-full min-w-full border-collapse text-[12.5px] font-sans">
                <thead className="sticky top-0 z-20 bg-[#c5cbf0] text-gray-900 font-semibold border-b border-[#9098aa]">
                  <tr className="h-[32px] leading-tight text-center whitespace-nowrap font-bold">
                    <th className="border border-[#9098aa] px-1.5 py-0.5 w-[40px]">No</th>
                    <th className="border border-[#9098aa] px-2 py-0.5 min-w-[160px] text-left">거래처명</th>
                    <th className="border border-[#9098aa] px-2 py-0.5 min-w-[260px] text-left">품목</th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px]" title="D 발주량박스 = F/E">
                      발주량박스
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[60px]" title="E 입수량">
                      입수량
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px]" title="F 발주량입수 = L-K">
                      발주량입수
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[60px]" title="G 발주일수">
                      발주일수
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px]" title="H 일사용량">
                      일사용량
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px]" title="I 입고량(입수)">
                      입고량
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px]" title="J 금일재고(봉)">
                      금일재고
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px]" title="K 총재고량 = I+J">
                      총재고량
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px]" title="L 필요값 = H×G">
                      필요값
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px]" title="M 차이 = K-L">
                      차이
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px]" title="N 재고유지일">
                      재고유지일
                    </th>
                    <th
                      className="border border-[#9098aa] px-1 py-0.5 min-w-[85px] bg-amber-100/90 text-blue-900"
                      title="O 확정발주량(박스) - 수기 수정 가능"
                    >
                      발주량(✏️)
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[60px]" title="P 입수량(정본)">
                      입수량
                    </th>
                    <th className="border border-[#9098aa] px-2 py-0.5 min-w-[80px] text-right" title="Q 봉단가">
                      봉단가
                    </th>
                    <th className="border border-[#9098aa] px-2 py-0.5 min-w-[100px] text-right" title="R 금액 = O×P×Q">
                      금액
                    </th>
                    {showWeek &&
                      weekLabels.map((d) => (
                        <th key={d} className="border border-[#9098aa] px-1 py-0.5 min-w-[55px]">
                          {d}
                        </th>
                      ))}
                    {showWeek && (
                      <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px]" title="AA 일사용량(박스)">
                        일(박스)
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={showWeek ? 26 : 18} className="py-20 text-center text-gray-400 italic">
                        조건에 해당하는 자재 발주 품목이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, idx) => {
                      const c = calcRow(row);
                      const week = splitWeek(row, c.finalBoxes);
                      const neg = c.diff < 0;
                      return (
                        <tr
                          key={row.id}
                          className={`h-[24px] border-b border-gray-300 hover:bg-[#eef3fb] text-gray-900 ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                          }`}
                        >
                          <td className="border border-gray-300 text-center text-gray-500 font-mono text-[11px] bg-gray-50">
                            {idx + 1}
                          </td>
                          <td
                            className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left text-gray-800 text-[11.5px]"
                            title={row.supplier}
                          >
                            {row.supplier}
                          </td>
                          <td
                            className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left font-bold"
                            title={`${row.name}${row.vendor ? ` / ${row.vendor}` : ''}${
                              row.warehouse ? ` [${row.warehouse}]` : ''
                            }`}
                          >
                            <span>{row.name}</span>
                            {(() => {
                              const s = getScheduledExclusion(row.name);
                              const d = row.discontinuedDate || s?.effectiveDate || '';
                              const lbl = s?.label || (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))} 삭제예정` : '');
                              return lbl ? (
                                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                  {lbl}
                                </span>
                              ) : null;
                            })()}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-600">
                            {Number.isFinite(c.boxesStd) ? Math.round(c.boxesStd * 10) / 10 : '-'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-600">
                            {c.pack || '-'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-700">
                            {Number.isFinite(c.shortageBags) ? Math.round(c.shortageBags * 10) / 10 : '-'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono">
                            {row.days || '-'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono">
                            {row.dailyUsage || '-'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono">
                            {row.incoming || '-'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono">
                            {row.currentStock.toLocaleString()}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono font-medium">
                            {c.totalStock.toLocaleString()}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-700">
                            {c.required ? Math.round(c.required * 10) / 10 : '-'}
                          </td>
                          <td
                            className={`border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono font-bold ${
                              neg ? 'text-red-600' : 'text-blue-700'
                            }`}
                          >
                            {Number.isFinite(c.diff)
                              ? c.diff > 0
                                ? `+${Math.round(c.diff)}`
                                : Math.round(c.diff)
                              : '-'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-600">
                            {Number.isFinite(c.stockDays) ? Math.round(c.stockDays * 100) / 100 : '-'}
                          </td>
                          <td className="border border-gray-300 p-0 text-center font-mono bg-amber-50/50">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.manual ? row.finalBoxes : c.suggest}
                              onChange={(e) => handleFinalChange(row.id, e.target.value)}
                              className="w-full h-full text-center font-black text-blue-900 border-none outline-none focus:ring-1 focus:ring-blue-500 bg-transparent px-1.5 py-1 text-[12.5px]"
                              style={{ textAlign: 'center' }}
                            />
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-600">
                            {c.pack || '-'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-800">
                            {row.bagPrice ? row.bagPrice.toLocaleString() : '-'}
                          </td>
                          <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/20">
                            {c.amount ? Math.round(c.amount).toLocaleString() : '-'}
                          </td>
                          {showWeek &&
                            week.map((v, i) => (
                              <td
                                key={i}
                                className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-600"
                              >
                                {v || ''}
                              </td>
                            ))}
                          {showWeek && (
                            <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-500">
                              {c.dailyBox ? Math.round(c.dailyBox * 100) / 100 : ''}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>

                <tfoot className="sticky bottom-0 z-20 bg-[#ffffcc] border-t-2 border-[#9098aa] font-bold text-gray-900 shadow-inner">
                  <tr className="h-[28px]">
                    <td colSpan={14} className="border border-[#9098aa] px-2 py-1 text-center font-bold">
                      합계 ({orderDate} 발주)
                    </td>
                    <td className="border border-[#9098aa] px-1 py-1 text-right font-mono font-extrabold text-blue-900">
                      {totals.boxes.toLocaleString()} 박스
                    </td>
                    <td className="border border-[#9098aa] px-1 py-1"></td>
                    <td className="border border-[#9098aa] px-2 py-1"></td>
                    <td className="border border-[#9098aa] px-2 py-1 text-right font-mono font-black text-emerald-800">
                      {totals.amt ? `₩${Math.round(totals.amt).toLocaleString()}` : '₩0'}
                    </td>
                    {showWeek &&
                      weekLabels.map((d) => (
                        <td key={d} className="border border-[#9098aa] px-1 py-1"></td>
                      ))}
                    {showWeek && <td className="border border-[#9098aa] px-1 py-1"></td>}
                  </tr>
                </tfoot>
              </table>
            </EditableTableWrapper>
          )}
        </div>
      </div>
    </div>
  );
};
