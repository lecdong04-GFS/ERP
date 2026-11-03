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
  Boxes,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';
import {
  DAY_CHARS,
  calcRow,
  splitWeek,
  classifyPattern,
  type SheetRowInput,
} from '@/lib/gfs/orderCalc';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Date 객체를 YYYY-MM-DD 문자열로 변환 (로컬 기준) */
function toLocalISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 기준 날짜가 속한 주의 월요일 Date 반환 */
function getMondayOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0(일) ~ 6(토)
  const diff = day === 0 ? -6 : 1 - day; // 월요일=1 기준
  d.setDate(d.getDate() + diff);
  return d;
}

interface SheetRow extends SheetRowInput {}

export const MatOrderDayView: React.FC = () => {
  const { openTab } = useTabs();

  // 기준일자 및 요일 인덱스 (0=월, 1=화, 2=수, 3=목, 4=금, 5=토, 6=일)
  const [orderDate, setOrderDate] = useState<string>(kstToday());
  const [dayIdx, setDayIdx] = useState<number>(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1); // 기본 익일 요일
    return (t.getDay() + 6) % 7;
  });

  const [supplierFilter, setSupplierFilter] = useState<string>('전체');
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [keyword, setKeyword] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 요일별 수동 수정값: dayIdx -> rowId -> 수량
  const [overrides, setOverrides] = useState<Record<number, Record<number, number>>>({});

  // 해당 요일의 실제 생성된 ERP 발주서(PO) 전표 목록
  const [confirmedPoList, setConfirmedPoList] = useState<any[]>([]);
  const [isLoadingPo, setIsLoadingPo] = useState<boolean>(false);

  // 탭 이동 헬퍼
  const handleNavigate = (menuId: string) => {
    const item = getMenuItemById(menuId);
    if (item) {
      openTab(item);
    }
  };

  // 기준일자의 주간 월요일 Date
  const mondayDate = useMemo(() => getMondayOfWeek(orderDate), [orderDate]);

  // 요일별 실제 달력 날짜 목록 (월~일, YYYY-MM-DD)
  const weekDates = useMemo(() => {
    return DAY_CHARS.map((_, i) => {
      const d = new Date(mondayDate);
      d.setDate(d.getDate() + i);
      return toLocalISODate(d);
    });
  }, [mondayDate]);

  // 현재 선택된 요일의 실제 날짜 (YYYY-MM-DD)
  const currentDayDate = weekDates[dayIdx];

  // 1. 발주시트 정본 로드 (스마트발주 GFS 마스터와 실시간 동기화)
  const loadOrderSheet = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/gfs/order-sheet', { cache: 'no-store' });
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
            packUnitAudit: r.packUnitAudit || 0,
            days: r.days || 0,
            dailyUsage: r.dailyUsage || 0,
            incoming: r.incoming || 0,
            currentStock: r.currentStock || 0,
            bagPrice: r.bagPrice || 0,
            warehouse: r.warehouse || '',
            vendor: r.vendor || '',
            finalBoxes: suggest,
            manual: false,
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
  }, []);

  useEffect(() => {
    loadOrderSheet();
  }, [loadOrderSheet]);

  // 2. 현재 선택된 요일 날짜의 ERP 발주서(PO) 전표 조회
  const loadConfirmedPo = useCallback(async () => {
    if (!currentDayDate) return;
    setIsLoadingPo(true);
    try {
      const res = await fetch(`/api/purchase/order?orderDate=${currentDayDate}`, {
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
  }, [currentDayDate]);

  useEffect(() => {
    loadConfirmedPo();
  }, [loadConfirmedPo]);

  // 날짜 1주일 단위 이동
  const handlePrevWeek = () => {
    const d = new Date(orderDate + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    setOrderDate(toLocalISODate(d));
  };

  const handleNextWeek = () => {
    const d = new Date(orderDate + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    setOrderDate(toLocalISODate(d));
  };

  // 요일 탭별 통계 (해당 요일 자동 분할량 기준)
  const dayStats = useMemo(() => {
    return DAY_CHARS.map((_, d) => {
      let items = 0;
      let boxes = 0;
      let amt = 0;
      rows.forEach((r) => {
        if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return;
        if (keyword.trim() && !r.name.toLowerCase().includes(keyword.trim().toLowerCase())) return;
        const c = calcRow(r);
        if (c.finalBoxes <= 0) return;
        const q = splitWeek(r, c.finalBoxes)[d];
        if (q > 0) {
          items += 1;
          boxes += q;
          amt += q * c.pack * r.bagPrice;
        }
      });
      return { items, boxes, amt };
    });
  }, [rows, supplierFilter, keyword]);

  // 현재 요일에 해당하는 발주 행 목록
  const dayRows = useMemo(() => {
    return rows
      .map((r) => {
        if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return null;
        if (keyword.trim() && !r.name.toLowerCase().includes(keyword.trim().toLowerCase()))
          return null;
        const c = calcRow(r);
        if (c.finalBoxes <= 0) return null;
        const week = splitWeek(r, c.finalBoxes);
        const override = overrides[dayIdx]?.[r.id];
        const dayQty = override !== undefined ? override : week[dayIdx];
        if (dayQty <= 0) return null;
        return { r, c, week, dayQty };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [rows, supplierFilter, keyword, dayIdx, overrides]);

  // 합계 계산
  const dayTotals = useMemo(() => {
    let boxes = 0;
    let amt = 0;
    dayRows.forEach(({ dayQty, c, r }) => {
      boxes += dayQty;
      amt += dayQty * c.pack * r.bagPrice;
    });
    return { boxes, amt };
  }, [dayRows]);

  // 수량 인라인 수정
  const handleDayQtyChange = (id: number, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setOverrides((prev) => ({
      ...prev,
      [dayIdx]: { ...(prev[dayIdx] || {}), [id]: num },
    }));
  };

  // 수량 초기화
  const handleResetDay = () => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[dayIdx];
      return next;
    });
  };

  // 해당 요일 발주 확정 및 ERP 발주서(PO) 전표 생성
  const handleSaveDay = async () => {
    if (dayRows.length === 0) {
      alert(`[${DAY_CHARS[dayIdx]}요일]에 발주할 품목이 없습니다.`);
      return;
    }

    if (
      !confirm(
        `[${currentDayDate} (${DAY_CHARS[dayIdx]}요일)] 납품분으로 총 ${
          dayRows.length
        }개 품목 (${dayTotals.boxes.toLocaleString()}박스 / ₩${Math.round(
          dayTotals.amt
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
          orderDate: currentDayDate,
          items: dayRows.map(({ r, c, dayQty }) => ({
            name: r.name,
            boxes: dayQty,
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
          productCode: m.productCode,
          productName: m.name,
          orderQty: m.orderQty,
          unitPrice: m.boxPrice || 0,
          partnerId: m.partnerId || undefined,
          partnerName: m.partnerName || undefined,
        }));

      if (orderItems.length === 0) {
        alert('ERP 품목 마스터와 매칭된 발주 품목이 없습니다.');
        return;
      }

      // Step 2: /api/gfs/order-result 호출하여 실제 PurchaseOrder 및 MaterialRequirement 생성
      const res = await fetch('/api/gfs/order-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: currentDayDate,
          memo: `자재발주(요일별 ${DAY_CHARS[dayIdx]}요일 납품)`,
          items: orderItems,
        }),
      });
      const json = await res.json();

      if (json.success) {
        const orders = (json.data || []).map((o: any) => o.orderNo).join(', ');
        alert(
          `✅ [${DAY_CHARS[dayIdx]}요일 (${currentDayDate})] 발주 확정 완료!\n\n` +
            `• 생성된 발주서: ${orders}\n` +
            `• 발주현황 및 입고등록 파이프라인에 실시간 연계되었습니다.`
        );
        loadConfirmedPo();
      } else {
        alert('발주 확정 실패: ' + json.error);
      }
    } catch (err: any) {
      alert('발주 저장 중 통신 오류: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 엑셀 내보내기
  const handleExportExcel = () => {
    const exportData = dayRows.map(({ r, c, dayQty }, idx) => ({
      No: idx + 1,
      거래처명: r.supplier,
      품목명: r.name,
      납품요일패턴: classifyPattern(r.supplier),
      보관창고: r.warehouse || '-',
      발주수량_박스: dayQty,
      입수량: c.pack || 0,
      단가: r.bagPrice,
      금액: Math.round(dayQty * c.pack * r.bagPrice),
      전체확정박스: c.finalBoxes,
      비고: r.vendor || '',
    }));

    exportGridToExcel({
      filename: `자재발주_요일별_${currentDayDate}_${DAY_CHARS[dayIdx]}요일`,
      sheetName: `${DAY_CHARS[dayIdx]}요일발주`,
      columns: [
        { key: 'No', label: 'No' },
        { key: '거래처명', label: '거래처명' },
        { key: '품목명', label: '품목명' },
        { key: '납품요일패턴', label: '납품패턴' },
        { key: '보관창고', label: '보관창고' },
        { key: '발주수량_박스', label: '발주량(박스)' },
        { key: '입수량', label: '입수량' },
        { key: '단가', label: '단가' },
        { key: '금액', label: '금액' },
        { key: '전체확정박스', label: '주간총확정' },
        { key: '비고', label: '비고' },
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
            자재발주 (요일별)
            <span className="text-[11px] font-medium text-slate-300">
              납품요일 기준 자동 분할
            </span>
            {confirmedPoList.length > 0 ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                <CheckCircle2 size={11} />
                {DAY_CHARS[dayIdx]}요일 확정완료 ({confirmedPoList.length}건 전표)
              </span>
            ) : (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                {DAY_CHARS[dayIdx]}요일 미확정
              </span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSaveDay}
            disabled={isSaving || dayRows.length === 0}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xs text-[11px] font-black transition-colors shadow-2xs cursor-pointer border border-emerald-700"
            title="현재 요일의 발주분을 ERP 정식 발주서(PO) 전표로 확정 생성합니다."
          >
            <Save size={12} className="stroke-[2.5]" />
            {isSaving ? '확정 저장 중...' : `${DAY_CHARS[dayIdx]}요일 발주확정(PO생성)`}
          </button>
          <button
            type="button"
            onClick={handleResetDay}
            className="flex items-center gap-1 px-2 py-1 bg-gray-600 hover:bg-gray-500 text-gray-200 rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-gray-700"
            title="수동 수정한 수량을 자동 계산치로 초기화합니다."
          >
            <RotateCcw size={11} />
            수량 초기화
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
            onClick={() => handleNavigate('pur-gfs-smart-order')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 shadow-2xs transition-colors cursor-pointer"
          >
            🍱 스마트발주(GFS) 열기 <ExternalLink size={10} />
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
          💡 스마트발주(GFS)의 442개 자재 발주량을 거래처별 납품 요일(월수금/화목토/매일) 패턴에 맞춰 분할·발주합니다.
        </div>
      </div>

      {/* 3. 요일 탭 바 (실제 달력 날짜 연동) */}
      <div className="bg-[#e2e8f0] border-b border-gray-300 px-3 flex items-center justify-between shrink-0 h-[40px] overflow-x-auto gap-2">
        {/* 요일 탭들 */}
        <div className="flex items-center gap-1">
          {DAY_CHARS.map((d, i) => {
            const isActive = dayIdx === i;
            const st = dayStats[i];
            const dateStr = weekDates[i];
            const mmdd = dateStr ? dateStr.slice(5) : '';

            return (
              <button
                key={d}
                type="button"
                onClick={() => setDayIdx(i)}
                className={`flex items-center gap-1.5 h-[32px] px-3 rounded-t text-[12px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-blue-700 border-t-2 border-t-blue-600 border-x border-gray-300 shadow-xs'
                    : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-slate-200/80'
                }`}
              >
                <span>
                  {d}요일 <span className="text-[10px] font-normal text-slate-400">({mmdd})</span>
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-gray-300 text-gray-700'
                  }`}
                >
                  {st.items}건 {st.boxes > 0 ? `${st.boxes}박스` : ''}
                </span>
              </button>
            );
          })}
        </div>

        {/* 주차 및 발주일자 네비게이터 */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-white border border-gray-300 px-2 py-0.5 rounded shadow-2xs text-[11px]">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <Calendar size={12} className="text-blue-600" />
              발주 주차:
            </span>
            <button
              type="button"
              onClick={handlePrevWeek}
              className="p-0.5 hover:bg-gray-100 rounded text-gray-600"
              title="전주"
            >
              <ChevronLeft size={13} />
            </button>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="font-bold text-slate-800 text-[11.5px] outline-none w-[115px]"
            />
            <button
              type="button"
              onClick={handleNextWeek}
              className="p-0.5 hover:bg-gray-100 rounded text-gray-600"
              title="차주"
            >
              <ChevronRight size={13} />
            </button>
          </div>
          <span className="text-[11.5px] font-extrabold text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
            납품일자: {currentDayDate} ({DAY_CHARS[dayIdx]})
          </span>
        </div>
      </div>

      {/* 4. 필터 바 (거래처 + 검색어 + 집계) */}
      <div className="bg-[#f5f6f8] border-b border-[#cccccc] px-3 py-1.5 flex items-center justify-between shrink-0 h-[34px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-700 text-[11px]">거래처</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[11px] font-medium rounded-xs shadow-2xs w-[200px] h-[22px] outline-none focus:border-blue-500"
            >
              <option value="전체">전체 거래처 ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
            <Search size={12} className="text-slate-400" />
            <input
              type="text"
              placeholder="품명 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="bg-transparent border-0 text-[11.5px] text-slate-900 w-[150px] focus:outline-hidden"
            />
          </div>
        </div>

        {/* 요일별 발주 합계 요약 */}
        <div className="flex items-center gap-2">
          {confirmedPoList.length > 0 && (
            <div className="text-[11px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 font-bold">
              전표: {confirmedPoList.map((p) => p.orderNo).join(', ')}
            </div>
          )}
          <div className="text-[11.5px] text-gray-700 font-semibold bg-white px-3 py-0.5 rounded border border-gray-300 shadow-2xs flex items-center gap-2">
            <span>{DAY_CHARS[dayIdx]}요일 발주:</span>
            <strong className="text-emerald-700">{dayRows.length}품목</strong>
            <strong className="text-blue-700">{dayTotals.boxes.toLocaleString()}박스</strong>
            <strong className="text-slate-900">₩{Math.round(dayTotals.amt).toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {/* 5. 요일 발주 대형 그리드 */}
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
                    <th className="border border-[#9098aa] px-2 py-0.5 min-w-[280px] text-left">품목명</th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[80px]">납품요일</th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-center">보관창고</th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[95px] bg-amber-100/90 text-blue-900">
                      {DAY_CHARS[dayIdx]}요일 발주량(✏️)
                    </th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-right">입수량</th>
                    <th className="border border-[#9098aa] px-2 py-0.5 min-w-[80px] text-right">봉단가</th>
                    <th className="border border-[#9098aa] px-2 py-0.5 min-w-[100px] text-right">발주금액</th>
                    <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-right">주간총확정</th>
                    <th className="border border-[#9098aa] px-2 py-0.5 min-w-[120px] text-left">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-20 text-center text-gray-400 italic">
                        {DAY_CHARS[dayIdx]}요일에 해당하는 발주 품목이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    dayRows.map(({ r, c, dayQty }, idx) => (
                      <tr
                        key={r.id}
                        className={`h-[26px] border-b border-gray-300 hover:bg-[#eef3fb] text-gray-900 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                        }`}
                      >
                        <td className="border border-gray-300 text-center text-gray-500 font-mono text-[11px] bg-gray-50">
                          {idx + 1}
                        </td>
                        <td
                          className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left text-gray-800 text-[11.5px]"
                          title={r.supplier}
                        >
                          {r.supplier}
                        </td>
                        <td
                          className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left font-bold"
                          title={r.name}
                        >
                          {r.name}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center text-[11px] font-bold text-blue-700">
                          {classifyPattern(r.supplier)}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center text-gray-700 text-[11px]">
                          {r.warehouse || '-'}
                        </td>
                        <td className="border border-gray-300 p-0 text-right font-mono bg-amber-50/50">
                          <input
                            type="number"
                            value={dayQty}
                            onChange={(e) => handleDayQtyChange(r.id, e.target.value)}
                            className="w-full h-full text-right font-black text-blue-900 border-none outline-none focus:ring-1 focus:ring-blue-500 bg-transparent px-1.5 py-1 text-[12.5px]"
                          />
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-1.5 py-0.5 text-right font-mono text-gray-600">
                          {c.pack || '-'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-800">
                          {r.bagPrice ? r.bagPrice.toLocaleString() : '-'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/20">
                          {dayQty * c.pack * r.bagPrice
                            ? Math.round(dayQty * c.pack * r.bagPrice).toLocaleString()
                            : '-'}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-1.5 py-0.5 text-right font-mono text-gray-500">
                          {c.finalBoxes.toLocaleString()}
                        </td>
                        <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left text-gray-500 text-[11px]">
                          {r.vendor ? `${r.vendor}` : ''}
                          {r.dailyUsage ? ` · 일${r.dailyUsage}` : ''}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 z-20 bg-[#ffffcc] border-t-2 border-[#9098aa] font-bold text-gray-900 shadow-inner">
                  <tr className="h-[28px]">
                    <td colSpan={5} className="border border-[#9098aa] px-2 py-1 text-center font-bold">
                      합계 ({DAY_CHARS[dayIdx]}요일 납품: {currentDayDate})
                    </td>
                    <td className="border border-[#9098aa] px-1.5 py-1 text-right font-mono font-extrabold text-blue-900">
                      {dayTotals.boxes.toLocaleString()} 박스
                    </td>
                    <td className="border border-[#9098aa] px-1 py-1"></td>
                    <td className="border border-[#9098aa] px-2 py-1"></td>
                    <td className="border border-[#9098aa] px-2 py-1 text-right font-mono font-black text-emerald-800">
                      {dayTotals.amt ? `₩${Math.round(dayTotals.amt).toLocaleString()}` : '₩0'}
                    </td>
                    <td className="border border-[#9098aa] px-1 py-1"></td>
                    <td className="border border-[#9098aa] px-2 py-1"></td>
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
