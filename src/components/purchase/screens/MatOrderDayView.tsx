'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  RotateCcw,
  Calendar,
  Save,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  CheckCircle2,
  ExternalLink,
  Boxes,
  Package,
  RefreshCw,
  Clock,
  Layers,
  Sparkles,
  DollarSign,
  TrendingUp,
  FileText,
  ChevronDown,
  X,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
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
    return (t.getDay() + 6) % 7; // 오늘 요일 기본값
  });

  const [supplierFilter, setSupplierFilter] = useState<string>('전체');
  const [patternFilter, setPatternFilter] = useState<string>('전체');
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
  const [showPoDrawer, setShowPoDrawer] = useState<boolean>(false);
  const poDrawerRef = useRef<HTMLDivElement>(null);

  // 전표 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (poDrawerRef.current && !poDrawerRef.current.contains(event.target as Node)) {
        setShowPoDrawer(false);
      }
    };
    if (showPoDrawer) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPoDrawer]);

  // 전표 번호 요약 텍스트 (예: #001 ~ #024)
  const poRangeSummary = useMemo(() => {
    if (confirmedPoList.length === 0) return '';
    const nums = confirmedPoList
      .map((p) => {
        const parts = p.orderNo ? p.orderNo.split('-') : [];
        return parts.length >= 3 ? parts[2] : p.orderNo;
      })
      .filter(Boolean);
    if (nums.length <= 1) return `#${nums[0] || '001'}`;
    return `#${nums[0]} ~ #${nums[nums.length - 1]}`;
  }, [confirmedPoList]);

  // 확정 전표 총액 합계
  const totalConfirmedPoAmount = useMemo(() => {
    return confirmedPoList.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
  }, [confirmedPoList]);

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

  // 주간 범위 텍스트 (예: 2026.11.02 ~ 2026.11.08)
  const weekRangeText = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    return `${start} ~ ${end}`;
  }, [weekDates]);

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

  const handleJumpToCurrentWeek = () => {
    setOrderDate(kstToday());
    const t = new Date();
    setDayIdx((t.getDay() + 6) % 7);
  };

  // 요일 탭별 통계 (해당 요일 자동 분할량 기준)
  const dayStats = useMemo(() => {
    return DAY_CHARS.map((_, d) => {
      let items = 0;
      let boxes = 0;
      let amt = 0;
      rows.forEach((r) => {
        if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return;
        if (patternFilter !== '전체' && classifyPattern(r.supplier) !== patternFilter) return;
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
  }, [rows, supplierFilter, patternFilter, keyword]);

  // 현재 요일에 해당하는 발주 행 목록
  const dayRows = useMemo(() => {
    return rows
      .map((r) => {
        if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return null;
        const pattern = classifyPattern(r.supplier);
        if (patternFilter !== '전체' && pattern !== patternFilter) return null;
        if (
          keyword.trim() &&
          !r.name.toLowerCase().includes(keyword.trim().toLowerCase()) &&
          !r.supplier.toLowerCase().includes(keyword.trim().toLowerCase())
        ) {
          return null;
        }
        const c = calcRow(r);
        if (c.finalBoxes <= 0) return null;
        const week = splitWeek(r, c.finalBoxes);
        const override = overrides[dayIdx]?.[r.id];
        const dayQty = override !== undefined ? override : week[dayIdx];
        if (dayQty <= 0) return null;
        return { r, c, week, dayQty, pattern };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [rows, supplierFilter, patternFilter, keyword, dayIdx, overrides]);

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

  // 수량 인라인 수정 (정수 박스 단위)
  const handleDayQtyChange = (id: number, val: string) => {
    const num = Math.max(0, Math.ceil(Number(val) || 0));
    setOverrides((prev) => ({
      ...prev,
      [dayIdx]: { ...(prev[dayIdx] || {}), [id]: num },
    }));
  };

  // 수량 초기화
  const handleResetDay = () => {
    if (confirm(`[${DAY_CHARS[dayIdx]}요일]의 수동 수정 수량을 원래 자동 분할값으로 복원하시겠습니까?`)) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[dayIdx];
        return next;
      });
    }
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
        const orderCount = (json.data || []).length;
        alert(
          `✅ [${DAY_CHARS[dayIdx]}요일 (${currentDayDate})] 발주 확정 완료!\n\n` +
            `• 생성된 발주서: 총 ${orderCount}건 발행 완료\n` +
            `• 상단의 [발주서 ${orderCount}건 발행] 버튼을 누르면 거래처별 전표 내역을 바로 확인하실 수 있습니다.`
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
    const exportData = dayRows.map(({ r, c, dayQty, pattern }, idx) => ({
      No: idx + 1,
      거래처명: r.supplier,
      품목명: r.name,
      납품요일패턴: pattern,
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
    <div className="flex flex-col h-full w-full bg-slate-50 text-slate-800 p-4 sm:p-5 overflow-hidden gap-3.5 select-none font-sans">
      {/* ── 1. 상단 마스터 컨트롤 & KPI 헤더 카드 ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs shrink-0 flex flex-col gap-4">
        {/* 헤더 타이틀 및 주요 액션 버튼 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black tracking-wide">
                매입 파이프라인
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                자재발주 <span className="text-blue-600 font-extrabold">(요일별)</span>
              </h1>
              {confirmedPoList.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {DAY_CHARS[dayIdx]}요일 발주확정 · {confirmedPoList.length}건 ({poRangeSummary})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300 shadow-2xs">
                  <Clock className="w-3.5 h-3.5" />
                  {DAY_CHARS[dayIdx]}요일 발주 미확정
                </span>
              )}
            </div>
            <p className="text-xs sm:text-[13px] text-slate-500 font-medium">
              스마트발주(GFS) 확정량을 거래처별 납품 요일 패턴(월수금/화목토/매일)에 따라 최적 분할하여 ERP 정식 발주서로 확정합니다.
            </p>
          </div>

          {/* 주요 작업 버튼 모음 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDay}
              disabled={isSaving || dayRows.length === 0}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13.5px] font-black text-white shadow-sm transition-all cursor-pointer ${
                dayRows.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-98 hover:shadow-md'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
              title="선택한 요일의 발주분을 ERP 정식 발주서(PO) 전표로 확정 생성합니다."
            >
              <Save className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isSaving
                  ? '발주서 생성 중...'
                  : `${DAY_CHARS[dayIdx]}요일 ERP 발주 확정 (PO생성)`}
              </span>
            </button>

            <button
              type="button"
              onClick={handleResetDay}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[13px] font-bold transition cursor-pointer"
              title="수동 수정한 수량을 자동 계산 수량으로 복원합니다."
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
              <span className="hidden md:inline">수량 초기화</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[13px] font-bold transition cursor-pointer"
              title="엑셀 다운로드"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span className="hidden md:inline">엑셀</span>
            </button>

            <button
              type="button"
              onClick={loadOrderSheet}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[13px] font-bold transition cursor-pointer disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 text-blue-600 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => handleNavigate('pur-gfs-smart-order')}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[13px] font-extrabold transition cursor-pointer"
              title="스마트발주(GFS) 화면으로 바로 이동"
            >
              <span>스마트발주</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 핵심 KPI 지표 4종 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11.5px] font-bold text-slate-500">
                {DAY_CHARS[dayIdx]}요일 발주 예정총액
              </span>
              <div className="text-lg sm:text-xl font-black font-mono text-indigo-700 tracking-tight mt-0.5">
                ₩{Math.round(dayTotals.amt).toLocaleString()}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-indigo-100/70 text-indigo-700 flex items-center justify-center font-bold">
              ₩
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11.5px] font-bold text-slate-500">
                {DAY_CHARS[dayIdx]}요일 발주 총 박스수
              </span>
              <div className="text-lg sm:text-xl font-black font-mono text-blue-700 tracking-tight mt-0.5">
                {dayTotals.boxes.toLocaleString()} <span className="text-xs font-sans font-bold">box</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11.5px] font-bold text-slate-500">
                발주 대상 품목수
              </span>
              <div className="text-lg sm:text-xl font-black font-mono text-emerald-700 tracking-tight mt-0.5">
                {dayRows.length} <span className="text-xs font-sans font-bold">품목</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-100/70 text-emerald-700 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11.5px] font-bold text-slate-500">
                납품(입고) 기준일자
              </span>
              <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight mt-0.5">
                {currentDayDate}{' '}
                <span className="text-xs font-extrabold text-blue-600 font-sans">
                  ({DAY_CHARS[dayIdx]})
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-200/70 text-slate-700 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. 세련된 주간 & 요일 세그먼트 컨트롤 ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs shrink-0 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* 주차 네비게이터 */}
        <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={handlePrevWeek}
            className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition cursor-pointer"
            title="이전 주차"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 px-2 text-xs font-extrabold text-slate-800">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>주간: {weekRangeText}</span>
          </div>

          <button
            type="button"
            onClick={handleNextWeek}
            className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition cursor-pointer"
            title="다음 주차"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleJumpToCurrentWeek}
            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white text-blue-700 hover:bg-blue-50 border border-slate-200 transition cursor-pointer ml-1"
          >
            이번 주
          </button>
        </div>

        {/* 7개 요일 세그먼트 버튼 (월~일) */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {DAY_CHARS.map((d, i) => {
            const isActive = dayIdx === i;
            const st = dayStats[i];
            const dateStr = weekDates[i];
            const mmdd = dateStr ? dateStr.slice(5).replace('-', '/') : '';

            return (
              <button
                key={d}
                type="button"
                onClick={() => setDayIdx(i)}
                className={`flex flex-col items-center justify-center min-w-[70px] sm:min-w-[84px] py-1.5 px-2 rounded-xl transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-400/30 font-black'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 font-bold'
                }`}
              >
                <div className="flex items-center gap-1 text-[13px]">
                  <span>{d}요일</span>
                  <span
                    className={`text-[11px] font-normal ${
                      isActive ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    {mmdd}
                  </span>
                </div>
                <div
                  className={`mt-0.5 text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : st.boxes > 0
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-200/80 text-slate-500'
                  }`}
                >
                  {st.boxes > 0 ? `${st.boxes}box` : '0box'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. 필터 및 검색 바 ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-2.5 shadow-xs shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 거래처 선택 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600 shrink-0">거래처:</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="전체">전체 거래처 ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 납품패턴 필터 버튼 */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold">
            {['전체', '월수금', '화목토', '매일'].map((pat) => (
              <button
                key={pat}
                type="button"
                onClick={() => setPatternFilter(pat)}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  patternFilter === pat
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {pat}
              </button>
            ))}
          </div>

          {/* 검색어 입력창 */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="품명 / 거래처 검색..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-60"
            />
          </div>
        </div>

        {/* 우측 스마트 발주 전표 드롭다운 및 통계 */}
        <div className="flex items-center gap-2 text-xs">
          {confirmedPoList.length > 0 ? (
            <div className="relative" ref={poDrawerRef}>
              <button
                type="button"
                onClick={() => setShowPoDrawer((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition shadow-2xs cursor-pointer border ${
                  showPoDrawer
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
                title="클릭하여 거래처별 발행된 발주서 전표 목록을 확인합니다."
              >
                <FileText className={`w-3.5 h-3.5 ${showPoDrawer ? 'text-white' : 'text-emerald-600'}`} />
                <span className="font-extrabold">발주서 {confirmedPoList.length}건 발행</span>
                <span
                  className={`font-mono text-[11px] px-1.5 py-0.2 rounded-md font-bold border ${
                    showPoDrawer
                      ? 'bg-white/20 text-white border-white/30'
                      : 'bg-white text-emerald-700 border-emerald-200'
                  }`}
                >
                  {poRangeSummary}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    showPoDrawer ? 'rotate-180 text-white' : 'text-emerald-600'
                  }`}
                />
              </button>

              {/* 거래처별 발주서 상세 팝오버 카드 */}
              {showPoDrawer && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 p-3.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-100">
                    <div>
                      <div className="text-[13px] font-black text-slate-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        {currentDayDate} ({DAY_CHARS[dayIdx]}) 발행 발주서
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                        총 <strong className="text-emerald-700">{confirmedPoList.length}건</strong> 전표 ·
                        합계 <strong className="text-slate-900 font-mono">₩{Math.round(totalConfirmedPoAmount).toLocaleString()}</strong>원
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPoDrawer(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 전표 목록 리스트 */}
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 pr-1">
                    {confirmedPoList.map((p) => {
                      const seq = p.orderNo ? p.orderNo.split('-')[2] || '' : '';
                      const supplierName = p.partnerName || p.partner?.name || '일반거래처';
                      const itemCount = p.details?.length || 0;
                      return (
                        <div
                          key={p.id}
                          className="py-2 px-1.5 flex items-center justify-between hover:bg-slate-50 rounded-lg transition"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                              #{seq}
                            </span>
                            <div>
                              <div className="text-xs font-black text-slate-800">{supplierName}</div>
                              <div className="text-[10.5px] font-mono text-slate-400">{p.orderNo}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-black font-mono text-slate-900">
                              ₩{Math.round(p.totalAmount || 0).toLocaleString()}
                            </div>
                            <div className="text-[10.5px] text-slate-400 font-medium">
                              {itemCount}개 품목
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 하단 발주현황 바로가기 버튼 */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPoDrawer(false);
                        handleNavigate('pur-order-status-edit');
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border border-blue-200"
                    >
                      <span>발주현황/수정 메뉴에서 전체 전표 열기</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <span className="text-slate-400 font-medium">
              💡 {DAY_CHARS[dayIdx]}요일 발주량이 입력된 품목만 표시됩니다.
            </span>
          )}
          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200">
            총 {dayRows.length}개 품목 표시 중
          </span>
        </div>
      </div>

      {/* ── 4. 요일 발주 메인 데이터 그리드 (현대적이고 시원한 테이블) ── */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-16 gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <div className="text-sm font-bold text-slate-600">
                스마트발주(GFS) 최신 발주 데이터를 불러오고 있습니다...
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 text-[13px] font-black border-b border-slate-200 uppercase tracking-tight select-none">
                <tr>
                  <th className="py-3 px-3 text-center w-12">No</th>
                  <th className="py-3 px-3.5 w-44">거래처명</th>
                  <th className="py-3 px-4 min-w-[240px]">품목명</th>
                  <th className="py-3 px-3 w-28 text-center">납품패턴</th>
                  <th className="py-3 px-3 w-24 text-center">보관창고</th>
                  <th className="py-3 px-3 w-36 text-right bg-blue-50/70 text-blue-900 border-x border-blue-100">
                    {DAY_CHARS[dayIdx]}요일 발주수량(✏️)
                  </th>
                  <th className="py-3 px-3 w-24 text-right">입수량</th>
                  <th className="py-3 px-3 w-28 text-right">봉단가</th>
                  <th className="py-3 px-3.5 w-36 text-right font-black">발주금액</th>
                  <th className="py-3 px-3 w-28 text-right text-slate-500">주간총확정</th>
                  <th className="py-3 px-4 min-w-[140px]">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13.5px]">
                {dayRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-20 text-center">
                      <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                        <Package className="w-12 h-12 text-slate-300" />
                        <div className="text-[15px] font-black text-slate-700">
                          {DAY_CHARS[dayIdx]}요일({currentDayDate})에 예정된 발주 품목이 없습니다.
                        </div>
                        <p className="text-[13px] text-slate-500">
                          거래처별 납품 요일 패턴상 오늘은 납품이 없거나, 다른 요일로 배정되어 있습니다. 상단의 다른 요일 탭을 확인해 보세요.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  dayRows.map(({ r, c, dayQty, pattern }, idx) => {
                    const rowAmt = dayQty * c.pack * r.bagPrice;
                    return (
                      <tr
                        key={r.id}
                        className={`hover:bg-blue-50/40 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                        }`}
                      >
                        {/* No */}
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-xs">
                          {idx + 1}
                        </td>

                        {/* 거래처명 */}
                        <td className="py-2.5 px-3.5 font-bold text-slate-700 truncate max-w-[170px]">
                          <span
                            className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200"
                            title={r.supplier}
                          >
                            {r.supplier}
                          </span>
                        </td>

                        {/* 품목명 */}
                        <td className="py-2.5 px-4 font-black text-slate-900">
                          <span title={r.name}>{r.name}</span>
                        </td>

                        {/* 납품패턴 뱃지 */}
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black border ${
                              pattern === '월수금'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : pattern === '화목토'
                                ? 'bg-teal-50 text-teal-700 border-teal-200'
                                : pattern === '매일'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {pattern}
                          </span>
                        </td>

                        {/* 보관창고 */}
                        <td className="py-2.5 px-3 text-center text-slate-500 text-xs font-medium">
                          {r.warehouse || '-'}
                        </td>

                        {/* 요일 발주수량 (인라인 편집 가능) */}
                        <td className="py-1.5 px-2.5 text-right bg-blue-50/40 border-x border-blue-100">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min={0}
                              value={dayQty}
                              onChange={(e) => handleDayQtyChange(r.id, e.target.value)}
                              className="w-20 text-right px-2 py-1 bg-white border border-blue-300 rounded-lg text-[14px] font-black font-mono text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                            />
                            <span className="text-xs font-bold text-blue-700">box</span>
                          </div>
                        </td>

                        {/* 입수량 */}
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 text-xs font-medium">
                          {c.pack > 0 ? `${c.pack.toLocaleString()}` : '-'}
                        </td>

                        {/* 봉단가 */}
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 text-xs font-medium">
                          {r.bagPrice > 0 ? `₩${r.bagPrice.toLocaleString()}` : '-'}
                        </td>

                        {/* 발주금액 */}
                        <td className="py-2.5 px-3.5 text-right font-black font-mono text-[14px] text-slate-900">
                          ₩{Math.round(rowAmt).toLocaleString()}
                        </td>

                        {/* 주간총확정 */}
                        <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-xs">
                          {c.finalBoxes.toLocaleString()} box
                        </td>

                        {/* 비고 */}
                        <td className="py-2.5 px-4 text-slate-500 text-xs truncate max-w-[160px]">
                          {r.vendor || ''}
                          {r.dailyUsage ? ` (일사용: ${r.dailyUsage})` : ''}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── 하단 총합계 고정 바 ── */}
        <div className="bg-slate-100 border-t border-slate-300 px-5 py-3 flex flex-wrap items-center justify-between text-[13.5px] font-extrabold shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-slate-600">
              납품일자: <strong className="text-slate-900">{currentDayDate} ({DAY_CHARS[dayIdx]}요일)</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              표시 품목수: <strong className="text-emerald-700 font-mono">{dayRows.length}</strong>건
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <span className="text-slate-600 mr-2">{DAY_CHARS[dayIdx]}요일 발주 총 박스수:</span>
              <span className="font-mono font-black text-blue-700 text-base">
                {dayTotals.boxes.toLocaleString()} <span className="text-xs font-sans">box</span>
              </span>
            </div>
            <div>
              <span className="text-slate-600 mr-2">{DAY_CHARS[dayIdx]}요일 발주 예정총액:</span>
              <span className="font-mono font-black text-slate-900 text-lg sm:text-xl text-emerald-800">
                ₩{Math.round(dayTotals.amt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
