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
  TrendingUp,
  FileText,
  ChevronDown,
  X,
  Truck,
  AlertTriangle,
  ArrowDownLeft,
  Check,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
  Scale,
  ShieldAlert,
  Info,
  Plus,
  Minus,
  Lock,
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

export type StrategyMode = 'tight' | 'standard' | 'safety';

interface SheetRow extends SheetRowInput {}

// 오늘 창고 입고 검수용 아이템 타입
interface InboundInspectItem {
  detailId: number;
  orderId: number;
  orderNo: string;
  orderDate: string;
  partnerId: string;
  partnerName: string;
  productCode: string;
  productName: string;
  spec: string;
  unit: string;
  warehouse: string;
  orderQty: number; // 오기로 한 박스수
  actualRecvQty: number; // 실제 도착한 박스수 (수정 가능)
  unitPrice: number;
  amount: number;
  carNo: string;
  remark: string;
  checked: boolean;
}

export const MatOrderDayView: React.FC = () => {
  const { openTab } = useTabs();

  // ── 상단 메인 모드 (발주 vs 입고검수) ──
  const [mainMode, setMainMode] = useState<'order' | 'inbound'>('order');

  // ── 발주 제어 전략 모드 (⚡타이트 / ⚖️표준 / 🛡️보수적 안전) ──
  const [strategyMode, setStrategyMode] = useState<StrategyMode>(() => {
    const t = new Date();
    return t.getDay() === 5 ? 'safety' : 'standard'; // 금요일이면 주말 공백 대비 안전모드 기본 추천
  });

  // 품목별 목표 안전일수 커스텀 오버라이드: rowId -> targetDays
  const [itemTargetDaysOverrides, setItemTargetDaysOverrides] = useState<Record<number, number>>({});

  // 계산 근거 팝오버 활성 품목 ID
  const [activeBriefingId, setActiveBriefingId] = useState<number | null>(null);

  // 발주 필요 품목만 보기 (기본 true) vs 전체 품목 보기
  const [showOnlyOrderable, setShowOnlyOrderable] = useState<boolean>(true);

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

  // ── 입고 검수 상태 (오늘 창고에 들어올 양) ──
  const [inboundItems, setInboundItems] = useState<InboundInspectItem[]>([]);
  const [isLoadingInbound, setIsLoadingInbound] = useState<boolean>(false);
  const [isReceivingSaving, setIsReceivingSaving] = useState<boolean>(false);
  const [inboundStatusFilter, setInboundStatusFilter] = useState<string>('전체');

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

  // 3. 오늘 회사 창고에 들어올 양(입고 대기 목록) 로드
  const loadInboundPending = useCallback(async () => {
    setIsLoadingInbound(true);
    try {
      const res = await fetch('/api/purchase/receiving?type=pending_orders', {
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: InboundInspectItem[] = json.data.map((item: any) => {
          const po = item.purchaseOrder || {};
          const prod = item.product || {};
          const orderQty = Number(item.remainQty || item.orderQty || 0);
          return {
            detailId: item.id,
            orderId: item.purchaseOrderId,
            orderNo: po.orderNo || '',
            orderDate: po.orderDate || '',
            partnerId: po.partnerId || '',
            partnerName: po.partnerName || po.partner?.name || '일반거래처',
            productCode: item.productCode || prod.productCode || '',
            productName: item.productName || prod.name || '',
            spec: prod.spec || item.spec || '',
            unit: item.unit || 'box',
            warehouse: prod.warehouse || '냉장',
            orderQty,
            actualRecvQty: orderQty, // 기본값은 오기로 한 수량(100%)
            unitPrice: Number(item.unitPrice || 0),
            amount: Number(item.amount || orderQty * (item.unitPrice || 0)),
            carNo: '',
            remark: '',
            checked: true, // 기본 선택
          };
        });
        setInboundItems(mapped);
      } else {
        setInboundItems([]);
      }
    } catch (err) {
      console.error('Failed to load pending inbound items', err);
      setInboundItems([]);
    } finally {
      setIsLoadingInbound(false);
    }
  }, []);

  useEffect(() => {
    loadInboundPending();
  }, [loadInboundPending]);

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

  // ── 품목별 다이내믹 지표 산출 함수 (재고유지일, 3단 전략 모드, 안전재고, 4대 감사) ──
  const getRowMetrics = useCallback(
    (r: SheetRow, targetDayIdx: number) => {
      const pack = r.packUnit > 0 ? r.packUnit : r.packUnitAudit > 0 ? r.packUnitAudit : 1;
      const totalStock = (r.incoming || 0) + (r.currentStock || 0);
      const dailyUsage = r.dailyUsage || 0;
      const stockDays = dailyUsage > 0 ? totalStock / dailyUsage : totalStock > 0 ? 99 : 0;

      const pattern = classifyPattern(r.supplier);
      const isDaily = pattern === '매일';

      // 3단 전략 모드에 따른 목표 안전일수 결정
      let baseTargetDays = r.days || (isDaily ? 3.0 : 5.0);
      if (itemTargetDaysOverrides[r.id] !== undefined) {
        baseTargetDays = itemTargetDaysOverrides[r.id];
      } else if (strategyMode === 'tight') {
        baseTargetDays = isDaily ? Math.min(baseTargetDays, 2.0) : baseTargetDays;
      } else if (strategyMode === 'safety') {
        baseTargetDays = baseTargetDays + 1.0;
      }

      // 보수적 안전 모드일 경우 공정 감모 로스 5% 버퍼 가산
      const lossRate = strategyMode === 'safety' ? 1.05 : 1.0;
      const targetStock = Math.round(dailyUsage * baseTargetDays * lossRate);
      const shortageBags = Math.max(0, targetStock - totalStock);

      // 4대 안전 감사 판정
      const isOverstocked = stockDays >= 60;
      const isPendingOverlap = dailyUsage > 0 && (r.incoming || 0) >= dailyUsage * 1.8;
      const isCriticalShortage = stockDays < 1.2 && (r.incoming || 0) <= 0 && dailyUsage > 0;
      const isSafetyShortage = stockDays < baseTargetDays && dailyUsage > 0 && !isCriticalShortage;

      let auditStatus: 'critical' | 'warning' | 'normal' | 'overstock' | 'pending_overlap' = 'normal';
      let auditLabel = '정상 재고';
      if (isOverstocked) {
        auditStatus = 'overstock';
        auditLabel = '60일+ 과잉재고';
      } else if (isPendingOverlap) {
        auditStatus = 'pending_overlap';
        auditLabel = '입고충분 중복주의';
      } else if (isCriticalShortage) {
        auditStatus = 'critical';
        auditLabel = '🚨 결품초임박';
      } else if (isSafetyShortage) {
        auditStatus = 'warning';
        auditLabel = '⚠️ 안전미달';
      }

      // 추천 박스수
      const suggestedBoxes =
        isOverstocked || isPendingOverlap
          ? 0
          : pack > 0 && shortageBags > 0
          ? Math.ceil(shortageBags / pack)
          : 0;

      // 요일 분할
      const week = splitWeek(r, suggestedBoxes);
      const override = overrides[targetDayIdx]?.[r.id];
      const dayQty = override !== undefined ? override : week[targetDayIdx];
      const amount = dayQty * pack * r.bagPrice;

      return {
        pack,
        totalStock,
        dailyUsage,
        stockDays,
        pattern,
        isDaily,
        targetDays: baseTargetDays,
        lossRate,
        targetStock,
        shortageBags,
        auditStatus,
        auditLabel,
        suggestedBoxes,
        week,
        dayQty,
        amount,
      };
    },
    [strategyMode, itemTargetDaysOverrides, overrides]
  );

  // 품목별 목표 안전일수 미세조정 핸들러 (±0.5일)
  const handleStepTargetDays = (id: number, currentDays: number, step: number) => {
    const nextDays = Math.max(0.5, Math.round((currentDays + step) * 10) / 10);
    setItemTargetDaysOverrides((prev) => ({
      ...prev,
      [id]: nextDays,
    }));
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
        if (
          keyword.trim() &&
          !r.name.toLowerCase().includes(keyword.trim().toLowerCase()) &&
          !r.supplier.toLowerCase().includes(keyword.trim().toLowerCase())
        ) {
          return;
        }
        const m = getRowMetrics(r, d);
        if (m.dayQty > 0) {
          items += 1;
          boxes += m.dayQty;
          amt += m.amount;
        }
      });
      return { items, boxes, amt };
    });
  }, [rows, supplierFilter, patternFilter, keyword, getRowMetrics]);

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
        const m = getRowMetrics(r, dayIdx);
        // showOnlyOrderable 가 true 일 때는 dayQty > 0 인 품목만 표시
        if (showOnlyOrderable && m.dayQty <= 0) return null;
        return { r, m, pattern };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [rows, supplierFilter, patternFilter, keyword, dayIdx, getRowMetrics, showOnlyOrderable]);

  // 합계 계산 (발주 및 런웨이 지표)
  const dayTotals = useMemo(() => {
    let boxes = 0;
    let amt = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let totalStockDaysSum = 0;
    let countWithUsage = 0;

    dayRows.forEach(({ m }) => {
      boxes += m.dayQty;
      amt += m.amount;
      if (m.auditStatus === 'critical') criticalCount++;
      if (m.auditStatus === 'warning') warningCount++;
      if (m.dailyUsage > 0 && m.stockDays < 60) {
        totalStockDaysSum += m.stockDays;
        countWithUsage++;
      }
    });

    const avgRunway = countWithUsage > 0 ? totalStockDaysSum / countWithUsage : 0;
    return { boxes, amt, criticalCount, warningCount, avgRunway };
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
      setItemTargetDaysOverrides({});
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
          items: dayRows.map(({ r, m }) => ({
            name: r.name,
            boxes: m.dayQty,
            packUnit: m.pack || r.packUnit,
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
          memo: `자재발주(요일별 ${DAY_CHARS[dayIdx]}요일 납품, 전략:${strategyMode})`,
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
        loadInboundPending();
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
    const exportData = dayRows.map(({ r, m, pattern }, idx) => ({
      No: idx + 1,
      거래처명: r.supplier,
      품목명: r.name,
      납품요일패턴: pattern,
      보관창고: r.warehouse || '-',
      현장실재고_봉: r.currentStock,
      입고예정_봉: r.incoming,
      일소진량_봉: m.dailyUsage,
      현재재고유지일_일: Number(m.stockDays.toFixed(1)),
      목표안전일수_일: m.targetDays,
      안전감사상태: m.auditLabel,
      추천수량_박스: m.suggestedBoxes,
      발주수량_박스: m.dayQty,
      입수량: m.pack || 0,
      봉단가: r.bagPrice,
      금액: Math.round(m.amount),
      비고: r.vendor || '',
    }));

    exportGridToExcel({
      filename: `자재발주_요일별_${currentDayDate}_${DAY_CHARS[dayIdx]}요일_${strategyMode}`,
      sheetName: `${DAY_CHARS[dayIdx]}요일발주`,
      columns: [
        { key: 'No', label: 'No' },
        { key: '거래처명', label: '거래처명' },
        { key: '품목명', label: '품목명' },
        { key: '납품요일패턴', label: '납품패턴' },
        { key: '보관창고', label: '보관창고' },
        { key: '현재재고유지일_일', label: '재고유지일(일)' },
        { key: '목표안전일수_일', label: '목표안전일(일)' },
        { key: '안전감사상태', label: '감사상태' },
        { key: '발주수량_박스', label: '발주량(박스)' },
        { key: '입수량', label: '입수량' },
        { key: '봉단가', label: '봉단가' },
        { key: '금액', label: '금액' },
      ],
      data: exportData,
    });
  };

  // ── 입고 검수 핸들러 ──
  const handleInboundQtyChange = (detailId: number, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setInboundItems((prev) =>
      prev.map((it) => (it.detailId === detailId ? { ...it, actualRecvQty: num } : it))
    );
  };

  const handleInboundCheck = (detailId: number, checked: boolean) => {
    setInboundItems((prev) =>
      prev.map((it) => (it.detailId === detailId ? { ...it, checked } : it))
    );
  };

  const handleToggleAllInbound = (checked: boolean) => {
    setInboundItems((prev) => prev.map((it) => ({ ...it, checked })));
  };

  // 모든 검수 수량을 발주수량(100% 정상)으로 자동 채우기
  const handleFillAllOrderQty = () => {
    setInboundItems((prev) => prev.map((it) => ({ ...it, actualRecvQty: it.orderQty })));
  };

  // ── 입고 검수 완료 및 실제 재고 반영 (POST /api/purchase/receiving) ──
  const handleConfirmInboundReceiving = async () => {
    const selected = inboundItems.filter((it) => it.checked);
    if (selected.length === 0) {
      alert('입고 검수 및 재고에 반영할 품목을 선택해주세요.');
      return;
    }

    const shortItems = selected.filter((it) => it.actualRecvQty < it.orderQty);
    const zeroItems = selected.filter((it) => it.actualRecvQty === 0);
    const totalOrderQty = selected.reduce((s, it) => s + it.orderQty, 0);
    const totalActualQty = selected.reduce((s, it) => s + it.actualRecvQty, 0);
    const diffQty = totalOrderQty - totalActualQty;

    let warningText = '';
    if (diffQty > 0) {
      warningText =
        `\n\n⚠️ [미납/결품 안내]\n` +
        `• 총 발주량: ${totalOrderQty}box 중 ${totalActualQty}box만 도착했습니다.\n` +
        `• 미납 잔량: 총 ${diffQty}box 가 덜 들어왔습니다.\n` +
        `• 실제 도착한 ${totalActualQty}box만 창고 현재고와 자재수불부에 반영되고, ${diffQty}box는 '미입고 잔량'으로 기록됩니다.`;
    }

    const ok = window.confirm(
      `[창고 입고 검수 완료 & 재고 즉시 반영]\n\n` +
        `• 검수 대상: 총 ${selected.length}개 품목\n` +
        `• 실제 입고량: 총 ${totalActualQty.toLocaleString()} box\n` +
        `• 입고 일자: ${kstToday()} (오늘 당일 입고)` +
        warningText +
        `\n\n실제 도착한 수량만 창고 현재고에 반영하시겠습니까?`
    );

    if (!ok) return;

    setIsReceivingSaving(true);
    try {
      // 거래처별 그룹화하여 각각 전표 생성
      const byPartner = new Map<string, InboundInspectItem[]>();
      selected.forEach((it) => {
        const pid = it.partnerId || 'DEFAULT';
        if (!byPartner.has(pid)) byPartner.set(pid, []);
        byPartner.get(pid)!.push(it);
      });

      let successCount = 0;
      for (const [pid, pItems] of byPartner.entries()) {
        const pName = pItems[0]?.partnerName || '';
        const payload = {
          receivingDate: kstToday(),
          partnerId: pid === 'DEFAULT' ? undefined : pid,
          partnerName: pName,
          createdBy: '창고검수자',
          items: pItems.map((it) => ({
            orderDetailId: it.detailId,
            orderNo: it.orderNo,
            name: it.productName,
            productCode: it.productCode,
            receivedQty: it.actualRecvQty,
            orderQty: it.orderQty,
            unitPrice: it.unitPrice,
            warehouse: it.warehouse,
            remark:
              it.actualRecvQty < it.orderQty
                ? `미납 ${it.orderQty - it.actualRecvQty}box 발생 (오기로 한 수량 ${it.orderQty}box 중 ${it.actualRecvQty}box만 입고)`
                : it.remark || '정상 검수 입고',
            carNo: it.carNo,
          })),
        };

        const res = await fetch('/api/purchase/receiving', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.success) {
          successCount++;
        } else {
          throw new Error(json.error || `${pName} 입고 반영 실패`);
        }
      }

      alert(
        `✅ 총 ${selected.length}개 품목의 입고 검수 및 재고 반영이 완료되었습니다!\n\n` +
          `• 실제 도착한 ${totalActualQty.toLocaleString()}box가 창고 현재고 및 [자재수불부]에 즉시 등록되었습니다.\n` +
          (diffQty > 0
            ? `• 미납된 ${diffQty}box는 '미입고 잔량'으로 기록되어 [발주현황/수정] 메뉴에서 부분입고 상태로 확인하실 수 있습니다.`
            : `• 전량 정상 입고 처리되었습니다.`)
      );

      await loadInboundPending();
      await loadConfirmedPo();
    } catch (err: any) {
      alert('입고 처리 중 오류: ' + err.message);
    } finally {
      setIsReceivingSaving(false);
    }
  };

  // 입고 필터링된 품목 목록
  const filteredInboundItems = useMemo(() => {
    return inboundItems.filter((it) => {
      if (supplierFilter !== '전체' && it.partnerName !== supplierFilter) return false;
      if (
        keyword.trim() &&
        !it.productName.toLowerCase().includes(keyword.trim().toLowerCase()) &&
        !it.partnerName.toLowerCase().includes(keyword.trim().toLowerCase()) &&
        !it.orderNo.toLowerCase().includes(keyword.trim().toLowerCase())
      ) {
        return false;
      }
      if (inboundStatusFilter === '미납') {
        return it.actualRecvQty < it.orderQty;
      }
      if (inboundStatusFilter === '정상') {
        return it.actualRecvQty >= it.orderQty;
      }
      return true;
    });
  }, [inboundItems, supplierFilter, keyword, inboundStatusFilter]);

  // 입고 통계
  const inboundStats = useMemo(() => {
    let totalOrder = 0;
    let totalActual = 0;
    let totalAmount = 0;
    let shortCount = 0;
    filteredInboundItems.forEach((it) => {
      totalOrder += it.orderQty;
      totalActual += it.actualRecvQty;
      totalAmount += it.amount;
      if (it.actualRecvQty < it.orderQty) shortCount++;
    });
    return {
      totalOrder,
      totalActual,
      diff: totalOrder - totalActual,
      totalAmount,
      shortCount,
    };
  }, [filteredInboundItems]);

  const isAllInboundChecked =
    filteredInboundItems.length > 0 && filteredInboundItems.every((it) => it.checked);

  return (
    <div className="flex flex-col h-full w-full bg-slate-100 text-slate-800 p-2 sm:p-3 overflow-hidden gap-2 select-none font-sans">
      {/* ── 1. 상단 마스터 헤더 바 (한 줄 타이틀 & 모드 탭 & 메인 액션 버튼) ── */}
      <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2 shadow-2xs shrink-0 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black whitespace-nowrap">
              자재 관제탑
            </span>
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5 whitespace-nowrap">
              자재발주 <span className="text-blue-600 font-extrabold">(요일별 & 일일입고)</span>
            </h1>
          </div>

          {/* 2개 메인 모드 탭 (발주 vs 입고검수) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-[13.5px]">
            <button
              type="button"
              onClick={() => setMainMode('order')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
                mainMode === 'order'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>① 오늘 발주 주문서</span>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full font-bold ${
                  mainMode === 'order' ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                }`}
              >
                {dayRows.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMainMode('inbound')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
                mainMode === 'inbound'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>② 오늘 입고 검수</span>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full font-bold ${
                  mainMode === 'inbound' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {inboundItems.length}
              </span>
            </button>
          </div>

          {confirmedPoList.length > 0 ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-300 whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {DAY_CHARS[dayIdx]}요일 발주확정 {confirmedPoList.length}건 ({poRangeSummary})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5" />
              {DAY_CHARS[dayIdx]}요일 미확정
            </span>
          )}
        </div>

        {/* 우측 상단 액션 버튼 모음 */}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {mainMode === 'order' ? (
            <>
              <button
                type="button"
                onClick={handleSaveDay}
                disabled={isSaving || dayRows.length === 0}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13.5px] font-black text-white shadow-xs transition cursor-pointer whitespace-nowrap ${
                  dayRows.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-98 animate-pulse'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
                title="선택한 요일의 발주분을 ERP 정식 발주서(PO) 전표로 확정 생성합니다."
              >
                <Save className="w-4 h-4 stroke-[2.5]" />
                <span>{isSaving ? '생성 중...' : `[ ${DAY_CHARS[dayIdx]}요일 ERP 발주 확정 저장 ]`}</span>
              </button>
              <button
                type="button"
                onClick={handleResetDay}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs sm:text-[13px] font-black transition cursor-pointer whitespace-nowrap"
                title="수량 초기화"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>초기화</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs sm:text-[13px] font-black transition cursor-pointer whitespace-nowrap"
                title="엑셀 다운로드"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>엑셀</span>
              </button>
              <button
                type="button"
                onClick={loadOrderSheet}
                disabled={isLoading}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                title="새로고침"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleConfirmInboundReceiving}
                disabled={isReceivingSaving || filteredInboundItems.length === 0}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13.5px] font-black text-white shadow-xs transition cursor-pointer whitespace-nowrap ${
                  filteredInboundItems.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-98 animate-pulse'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
                title="실제 도착한 수량만 창고 현재고와 자재수불부에 즉시 반영합니다."
              >
                <Truck className="w-4 h-4 stroke-[2.5]" />
                <span>{isReceivingSaving ? '반영 중...' : '[ 🚚 검수완료 & 재고 즉시 반영 ]'}</span>
              </button>
              <button
                type="button"
                onClick={handleFillAllOrderQty}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs sm:text-[13px] font-black transition cursor-pointer whitespace-nowrap"
                title="오기로 한 발주수량 그대로 전량 정상 채우기"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>전량 정상</span>
              </button>
              <button
                type="button"
                onClick={loadInboundPending}
                disabled={isLoadingInbound}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                title="새로고침"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-emerald-600 ${isLoadingInbound ? 'animate-spin' : ''}`}
                />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 2단: 주간/요일 캘린더 네비게이션 + 전략 모드 컨트롤러 (슬림 단일 바) ── */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-1.5 shadow-2xs shrink-0 flex flex-wrap items-center justify-between gap-2">
        {mainMode === 'order' ? (
          <>
            {/* 좌측: 주간 이동 + 7개 요일 세그먼트 버튼 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs whitespace-nowrap">
                <button
                  type="button"
                  onClick={handlePrevWeek}
                  className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                  title="이전 주차"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5 px-2 text-[13px] font-black text-slate-800 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>{weekRangeText}</span>
                </div>
                <button
                  type="button"
                  onClick={handleNextWeek}
                  className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                  title="다음 주차"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleJumpToCurrentWeek}
                  className="px-2.5 py-0.5 text-xs font-bold rounded bg-white text-blue-700 hover:bg-blue-50 border border-slate-200 transition cursor-pointer whitespace-nowrap"
                >
                  이번주
                </button>
              </div>

              {/* 7개 요일 탭 버튼 */}
              <div className="flex items-center gap-1">
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
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] transition cursor-pointer border whitespace-nowrap ${
                        isActive
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-black ring-1 ring-blue-400/40'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 font-bold'
                      }`}
                    >
                      <span className="font-black">{d}</span>
                      <span className={`text-[11px] font-medium whitespace-nowrap ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                        {mmdd}
                      </span>
                      <span
                        className={`text-[11px] font-mono px-1.5 py-0.2 rounded font-bold whitespace-nowrap ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : st.boxes > 0
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-200/70 text-slate-500'
                        }`}
                      >
                        {st.boxes > 0 ? `${st.boxes}b` : '0'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 우측: 3-tier 전략 모드 스위치 */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 whitespace-nowrap">
              <span className="text-xs font-black text-slate-700 flex items-center gap-1 whitespace-nowrap">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                전략:
              </span>
              <button
                type="button"
                onClick={() => setStrategyMode('tight')}
                className={`px-2.5 py-0.5 rounded text-xs font-black transition cursor-pointer border whitespace-nowrap ${
                  strategyMode === 'tight'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50'
                }`}
                title="⚡ 타이트 모드: 매일처 1.8~2.0일치 압축, 폐기 손실 방지"
              >
                ⚡ 타이트
              </button>
              <button
                type="button"
                onClick={() => setStrategyMode('standard')}
                className={`px-2.5 py-0.5 rounded text-xs font-black transition cursor-pointer border whitespace-nowrap ${
                  strategyMode === 'standard'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50'
                }`}
                title="⚖️ 표준 모드: 마스터 기준 정석 운영"
              >
                ⚖️ 표준
              </button>
              <button
                type="button"
                onClick={() => setStrategyMode('safety')}
                className={`px-2.5 py-0.5 rounded text-xs font-black transition cursor-pointer border whitespace-nowrap ${
                  strategyMode === 'safety'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                }`}
                title="🛡️ 보수적 안전 모드: 결품 차단 (+1일 및 감모 5% 가산)"
              >
                🛡️ 안전
              </button>
            </div>
          </>
        ) : (
          /* 입고 검수 모드 서브 바 */
          <>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-xs sm:text-[13px] font-black text-slate-700 whitespace-nowrap">검수 상태:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold whitespace-nowrap">
                {[
                  { id: '전체', label: '전체 보기' },
                  { id: '미납', label: '⚠️ 미납/결품만' },
                  { id: '정상', label: '✅ 정상입고만' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInboundStatusFilter(tab.id)}
                    className={`px-3 py-1 rounded text-xs transition cursor-pointer whitespace-nowrap ${
                      inboundStatusFilter === tab.id
                        ? 'bg-blue-600 text-white font-black shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-bold'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 whitespace-nowrap">
              <button
                type="button"
                onClick={() => handleNavigate('inv-mat-ledger')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs sm:text-[13px] font-black transition cursor-pointer whitespace-nowrap"
                title="자재수불부 화면으로 이동하여 입출고 통장 내역 확인"
              >
                <span>자재수불부(입출고 통장) 확인</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── 3단: 핵심 KPI 지표 칩 + 검색/필터 바 (슬림 단일 바) ── */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-1.5 shadow-2xs shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs">
        {mainMode === 'order' ? (
          <>
            {/* 좌측: 초슬림 KPI 뱃지 4종 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 whitespace-nowrap">
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">예정총액:</span>
                <span className="font-mono font-black text-[13.5px] text-indigo-700 whitespace-nowrap">
                  ₩{Math.round(dayTotals.amt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 whitespace-nowrap">
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">총발주:</span>
                <span className="font-mono font-black text-[13.5px] text-blue-700 whitespace-nowrap">
                  {dayTotals.boxes.toLocaleString()} box
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 whitespace-nowrap">
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">평균 Runway:</span>
                <span className="font-mono font-black text-[13.5px] text-emerald-700 whitespace-nowrap">
                  {dayTotals.avgRunway.toFixed(1)}일
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 whitespace-nowrap">
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">주의품목:</span>
                <span className="font-mono font-black text-[13.5px] text-rose-600 whitespace-nowrap">🚨 {dayTotals.criticalCount}</span>
                <span className="text-slate-300">/</span>
                <span className="font-mono font-black text-[13.5px] text-amber-600 whitespace-nowrap">⚠️ {dayTotals.warningCount}</span>
              </div>
            </div>

            {/* 우측: 필터 및 검색 및 발행 전표 드로어 */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 거래처 필터 */}
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs sm:text-[13px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer whitespace-nowrap"
              >
                <option value="전체">전체 거래처</option>
                {suppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* 납품패턴 필터 */}
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold whitespace-nowrap">
                {['전체', '월수금', '화목토', '매일'].map((pat) => (
                  <button
                    key={pat}
                    type="button"
                    onClick={() => setPatternFilter(pat)}
                    className={`px-2.5 py-0.5 rounded text-xs transition cursor-pointer whitespace-nowrap ${
                      patternFilter === pat
                        ? 'bg-blue-600 text-white font-black shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    {pat}
                  </button>
                ))}
              </div>

              {/* 발주 대상만 보기 토글 */}
              <button
                type="button"
                onClick={() => setShowOnlyOrderable((prev) => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer border whitespace-nowrap ${
                  showOnlyOrderable
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
                title="발주량이 잡힌 품목만 보기 or 전체 442개 품목 탐색하기"
              >
                <Package className="w-3.5 h-3.5" />
                <span>{showOnlyOrderable ? '발주대상만' : '전체품목'}</span>
                <span
                  className={`text-[11px] font-mono px-1.5 rounded-full font-bold whitespace-nowrap ${
                    showOnlyOrderable ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                  }`}
                >
                  {dayRows.length}
                </span>
              </button>

              {/* 검색창 */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="품명 / 거래처 검색..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="pl-7 pr-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs sm:text-[13px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40 sm:w-52"
                />
              </div>

              {/* 발행 전표 목록 드로어 버튼 */}
              {confirmedPoList.length > 0 && (
                <div className="relative" ref={poDrawerRef}>
                  <button
                    type="button"
                    onClick={() => setShowPoDrawer((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition shadow-2xs cursor-pointer border whitespace-nowrap ${
                      showPoDrawer
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                    title="클릭하여 거래처별 발행된 발주서 전표 목록을 확인합니다."
                  >
                    <FileText
                      className={`w-3.5 h-3.5 ${showPoDrawer ? 'text-white' : 'text-emerald-600'}`}
                    />
                    <span className="font-extrabold text-xs">{confirmedPoList.length}건 발행</span>
                    <span
                      className={`font-mono text-[11px] px-1.5 py-0.2 rounded font-bold border whitespace-nowrap ${
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
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <div>
                          <div className="text-[13px] font-black text-slate-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                            {currentDayDate} ({DAY_CHARS[dayIdx]}) 발행 발주서
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                            총 <strong className="text-emerald-700">{confirmedPoList.length}건</strong> 전표 · 합계{' '}
                            <strong className="text-slate-900 font-mono">
                              ₩{Math.round(totalConfirmedPoAmount).toLocaleString()}
                            </strong>원
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
              )}
            </div>
          </>
        ) : (
          /* 입고 검수 KPI & 필터 바 */
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-800">입고예정:</span>
                <span className="font-mono font-black text-emerald-900">
                  ₩{Math.round(inboundStats.totalAmount).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500">발주량:</span>
                <span className="font-mono font-black text-slate-800">
                  {inboundStats.totalOrder.toLocaleString()} box
                </span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200">
                <span className="text-[11px] font-bold text-blue-800">실도착:</span>
                <span className="font-mono font-black text-blue-900">
                  {inboundStats.totalActual.toLocaleString()} box
                </span>
              </div>
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border ${
                  inboundStats.diff > 0
                    ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse font-black'
                    : 'bg-slate-50 border-slate-200 text-slate-600 font-bold'
                }`}
              >
                <span className="text-[11px]">미납/결품:</span>
                <span className="font-mono font-black">
                  {inboundStats.diff > 0 ? `▼ ${inboundStats.diff.toLocaleString()} box` : '0 box'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 거래처 필터 */}
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="전체">전체 거래처</option>
                {suppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* 검색창 */}
              <div className="relative flex items-center">
                <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="품명 / 거래처 / 발주번호..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="pl-7 pr-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
                />
              </div>

              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded border border-slate-200 text-[11px]">
                {filteredInboundItems.length}개 입고 대기
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── 4. 메인 데이터 테이블 (발주 테이블 or 입고 검수 테이블) ── */}
      <div className="flex-1 min-h-[420px] bg-white rounded-xl border border-slate-300 overflow-hidden shadow-xs flex flex-col">
        {mainMode === 'order' ? (
          /* ──────── ① 오늘 발주할 양 테이블 ──────── */
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-16 gap-3 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                <div className="text-sm font-bold text-slate-600">
                  스마트발주(GFS) 최신 발주 데이터를 불러오고 있습니다...
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[1500px]">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 text-[13.5px] font-black border-b border-slate-300 uppercase tracking-tight select-none">
                  <tr>
                    <th className="py-3 px-2 text-center w-12 whitespace-nowrap">No</th>
                    <th className="py-3 px-3 min-w-[160px] w-44 whitespace-nowrap">거래처명</th>
                    <th className="py-3 px-4 min-w-[300px] whitespace-nowrap">품목명</th>
                    <th className="py-3 px-2.5 w-24 text-center whitespace-nowrap">패턴</th>
                    <th className="py-3 px-2 w-20 text-center whitespace-nowrap">창고</th>
                    <th className="py-3 px-3 min-w-[130px] text-right bg-slate-50 text-slate-800 whitespace-nowrap">
                      현장 가용재고
                      <span className="block text-[11px] text-slate-500 font-bold leading-tight">실재고 + 입고예정</span>
                    </th>
                    <th className="py-3 px-2.5 min-w-[110px] text-right whitespace-nowrap">
                      일소진량
                      <span className="block text-[11px] text-slate-500 font-bold leading-tight">Daily Usage</span>
                    </th>
                    <th className="py-3 px-3 min-w-[160px] text-center bg-blue-50/70 text-blue-950 font-black border-x border-blue-100 whitespace-nowrap">
                      재고유지일 (Runway)
                      <span className="block text-[11px] text-blue-700 font-bold leading-tight">보유일수 · 상태</span>
                    </th>
                    <th className="py-3 px-3 min-w-[160px] text-center whitespace-nowrap">
                      목표 안전일수
                      <span className="block text-[11px] text-slate-500 font-bold leading-tight">미세조정 (±0.5일)</span>
                    </th>
                    <th className="py-3 px-3 min-w-[170px] text-right bg-amber-50/70 text-amber-950 border-x border-amber-200 whitespace-nowrap">
                      {DAY_CHARS[dayIdx]}요일 발주(✏️)
                      <span className="block text-[11px] text-amber-800 font-bold leading-tight">추천치 대비 확정</span>
                    </th>
                    <th className="py-3 px-2.5 w-24 text-right whitespace-nowrap">입수량</th>
                    <th className="py-3 px-2.5 w-28 text-right whitespace-nowrap">봉단가</th>
                    <th className="py-3 px-3 w-36 text-right font-black whitespace-nowrap">발주금액</th>
                    <th className="py-3 px-2.5 w-24 text-center whitespace-nowrap">계산근거</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[14px]">
                  {dayRows.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-20 text-center">
                        <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                          <Package className="w-12 h-12 text-slate-300" />
                          <div className="text-[15px] font-black text-slate-700">
                            {DAY_CHARS[dayIdx]}요일({currentDayDate})에 예정된 발주 품목이 없습니다.
                          </div>
                          <p className="text-[13px] text-slate-500">
                            거래처별 납품 요일 패턴상 오늘은 납품이 없거나, 다른 요일로 배정되어 있습니다. 상단의 다른 요일 탭을 확인하시거나 [전체 품목 보기]를 선택해 보세요.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    dayRows.map(({ r, m, pattern }, idx) => {
                      const isBriefingOpen = activeBriefingId === r.id;
                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-blue-50/40 transition-colors relative ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                          }`}
                        >
                          {/* No */}
                          <td className="py-2.5 px-2 text-center text-slate-400 font-mono text-[13px] whitespace-nowrap">
                            {idx + 1}
                          </td>

                          {/* 거래처명 */}
                          <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                            <span
                              className="inline-block px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 text-[13.5px] font-black border border-slate-200"
                              title={r.supplier}
                            >
                              {r.supplier}
                            </span>
                          </td>

                          {/* 품목명 */}
                          <td className="py-2.5 px-4 font-black text-slate-900 text-[15px] whitespace-nowrap">
                            <span title={r.name}>{r.name}</span>
                          </td>

                          {/* 납품패턴 */}
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
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
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-black ${
                                (r.warehouse || '').includes('냉동')
                                  ? 'bg-cyan-50 text-cyan-700'
                                  : (r.warehouse || '').includes('냉장')
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {r.warehouse || '-'}
                            </span>
                          </td>

                          {/* 현장 가용재고 (실재고 + 입고예정) */}
                          <td className="py-2.5 px-3 text-right bg-slate-50/70 font-mono text-[14px] whitespace-nowrap">
                            <div className="font-black text-slate-900">
                              {m.totalStock.toLocaleString()}
                              <span className="text-xs text-slate-500 font-sans ml-0.5">봉</span>
                            </div>
                            <div className="text-[11.5px] text-slate-500 font-sans font-medium whitespace-nowrap">
                              (재고 {r.currentStock} + 입고 {r.incoming})
                            </div>
                          </td>

                          {/* 일소진량 */}
                          <td className="py-2.5 px-2.5 text-right font-mono text-[14px] whitespace-nowrap">
                            {m.dailyUsage > 0 ? (
                              <span className="font-extrabold text-slate-800">
                                {m.dailyUsage.toLocaleString()}
                                <span className="text-xs text-slate-500 font-sans ml-0.5">봉/일</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-bold">-</span>
                            )}
                          </td>

                          {/* 재고유지일 (Runway) */}
                          <td className="py-2.5 px-3 text-center bg-blue-50/30 border-x border-blue-100 whitespace-nowrap">
                            {m.auditStatus === 'critical' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-300 animate-pulse whitespace-nowrap">
                                🚨 {m.stockDays.toFixed(1)}일 (임박)
                              </span>
                            ) : m.auditStatus === 'warning' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                                ⚠️ {m.stockDays.toFixed(1)}일 (미달)
                              </span>
                            ) : m.auditStatus === 'overstock' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-600 border border-slate-300 whitespace-nowrap">
                                <Lock className="w-3.5 h-3.5 text-slate-500" />
                                {Math.round(m.stockDays)}일 (과잉)
                              </span>
                            ) : m.auditStatus === 'pending_overlap' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                                📦 {m.stockDays.toFixed(1)}일 (입고대기)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                                ✅ {m.stockDays.toFixed(1)}일 (적정)
                              </span>
                            )}
                          </td>

                          {/* 목표 안전일수 (미세조정) */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStepTargetDays(r.id, m.targetDays, -0.5)}
                                className="w-5.5 h-5.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition cursor-pointer"
                                title="목표안전일수 0.5일 축소"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="font-mono font-black text-[13.5px] min-w-[36px] text-center text-slate-800">
                                {m.targetDays.toFixed(1)}일
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStepTargetDays(r.id, m.targetDays, 0.5)}
                                className="w-5.5 h-5.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition cursor-pointer"
                                title="목표안전일수 0.5일 가산"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            <span className="block text-[11px] text-slate-500 font-mono font-bold mt-0.5 whitespace-nowrap">
                              목표 {m.targetStock.toLocaleString()}봉
                            </span>
                          </td>

                          {/* 요일 발주수량 (추천치 대비 확정) */}
                          <td className="py-1.5 px-2.5 text-right bg-amber-50/40 border-x border-amber-200 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              {m.week[dayIdx] > 0 && (
                                <span className="text-[11.5px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">
                                  추천 {m.week[dayIdx]}
                                </span>
                              )}
                              <input
                                type="number"
                                min={0}
                                value={m.dayQty}
                                onChange={(e) => handleDayQtyChange(r.id, e.target.value)}
                                className="w-20 text-right px-2 py-1 bg-white border border-amber-300 rounded-lg text-[15px] font-black font-mono text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                              />
                              <span className="text-xs font-black text-amber-950">box</span>
                            </div>
                          </td>

                          {/* 입수량 */}
                          <td className="py-2.5 px-2.5 text-right font-mono text-slate-800 text-[13.5px] font-bold whitespace-nowrap">
                            {m.pack > 0 ? `${m.pack.toLocaleString()}` : '-'}
                          </td>

                          {/* 봉단가 */}
                          <td className="py-2.5 px-2.5 text-right font-mono text-slate-800 text-[13.5px] font-bold whitespace-nowrap">
                            {r.bagPrice > 0 ? `₩${r.bagPrice.toLocaleString()}` : '-'}
                          </td>

                          {/* 발주금액 */}
                          <td className="py-2.5 px-3 text-right font-black font-mono text-[14.5px] text-slate-900 whitespace-nowrap">
                            ₩{Math.round(m.amount).toLocaleString()}
                          </td>

                          {/* 계산근거 팝오버 버튼 */}
                          <td className="py-2.5 px-2.5 text-center relative whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setActiveBriefingId(isBriefingOpen ? null : r.id)}
                              className={`px-2.5 py-1 rounded-md text-xs font-black transition cursor-pointer border whitespace-nowrap ${
                                isBriefingOpen
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
                              }`}
                              title="클릭하여 4줄 정밀 계산 근거를 확인합니다."
                            >
                              💡 근거
                            </button>

                            {/* 4줄 계산 근거 팝오버 카드 */}
                            {isBriefingOpen && (
                              <div className="absolute right-0 top-full mt-1.5 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-blue-200 p-3.5 z-50 text-left animate-in fade-in slide-in-from-top-1">
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                  <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                    <span>[{r.name}] 정밀 계산 근거</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setActiveBriefingId(null)}
                                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="space-y-1.5 text-xs">
                                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700">
                                    <div className="font-bold text-slate-900">① 현장 총 가용재고</div>
                                    <div className="text-[11.5px] text-slate-600 font-mono mt-0.5">
                                      실재고 {r.currentStock}봉 + 입고예정 {r.incoming}봉 = <strong>{m.totalStock.toLocaleString()}봉</strong>
                                      <span className="ml-1 text-blue-700 font-bold">(Runway: {m.stockDays.toFixed(1)}일치)</span>
                                    </div>
                                  </div>

                                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700">
                                    <div className="font-bold text-slate-900">② 일소진량 및 목표일수</div>
                                    <div className="text-[11.5px] text-slate-600 font-mono mt-0.5">
                                      일평균 {m.dailyUsage.toLocaleString()}봉/일 × 목표 {m.targetDays.toFixed(1)}일
                                      {strategyMode === 'safety' && <span className="text-emerald-700 font-bold"> (+5% 버퍼)</span>}
                                    </div>
                                  </div>

                                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700">
                                    <div className="font-bold text-slate-900">③ 안전재고 목표 대비 부족분</div>
                                    <div className="text-[11.5px] text-slate-600 font-mono mt-0.5">
                                      목표 {m.targetStock.toLocaleString()}봉 - 가용 {m.totalStock.toLocaleString()}봉 ={' '}
                                      <strong className="text-rose-600 font-bold">{m.shortageBags.toLocaleString()}봉 부족</strong>
                                    </div>
                                  </div>

                                  <div className="p-2 rounded-lg bg-blue-50/70 border border-blue-200 text-blue-900">
                                    <div className="font-black text-blue-950">④ 박스 입수 단위 올림 추천</div>
                                    <div className="text-[11.5px] font-mono mt-0.5">
                                      부족분 ÷ 입수({m.pack}봉) ➔ 올림{' '}
                                      <strong className="text-blue-700 font-black">[{m.suggestedBoxes}박스]</strong>
                                      <span className="block text-[11px] text-slate-500 font-sans mt-0.5">
                                        오늘({DAY_CHARS[dayIdx]}요일) 요일 분할 배정: <strong>{m.week[dayIdx]}박스</strong>
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* ──────── ② 오늘 회사창고에 들어올 양 (입고 검수 & 재고 반영) 테이블 ──────── */
          <div className="flex-1 overflow-auto">
            {isLoadingInbound ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-16 gap-3 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                <div className="text-sm font-bold text-slate-600">
                  창고 입고 대기 목록을 불러오고 있습니다...
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[1400px]">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 text-[13.5px] font-black border-b border-slate-300 uppercase tracking-tight select-none">
                  <tr>
                    <th className="py-3 px-3 text-center w-12 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={isAllInboundChecked}
                        onChange={(e) => handleToggleAllInbound(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 cursor-pointer accent-emerald-600"
                        title="전체 선택"
                      />
                    </th>
                    <th className="py-3 px-2 text-center w-12 whitespace-nowrap">No</th>
                    <th className="py-3 px-3 w-32 text-center whitespace-nowrap">발주번호</th>
                    <th className="py-3 px-3.5 min-w-[160px] w-44 whitespace-nowrap">거래처명</th>
                    <th className="py-3 px-4 min-w-[300px] whitespace-nowrap">품목명</th>
                    <th className="py-3 px-3 w-24 text-center whitespace-nowrap">보관창고</th>
                    <th className="py-3 px-3 w-36 text-right bg-slate-200/60 font-black whitespace-nowrap">
                      오기로 한 수량 (발주량)
                    </th>
                    <th className="py-3 px-3 w-40 text-right bg-emerald-50/70 text-emerald-900 border-x border-emerald-200 whitespace-nowrap">
                      실제 도착 수량 (✏️검수)
                    </th>
                    <th className="py-3 px-3 w-32 text-center whitespace-nowrap">미납 / 차이</th>
                    <th className="py-3 px-3 w-36 text-center whitespace-nowrap">입고 검수 판정</th>
                    <th className="py-3 px-3.5 w-36 text-right font-black whitespace-nowrap">입고금액</th>
                    <th className="py-3 px-3.5 min-w-[160px] whitespace-nowrap">차량/검수메모</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[14px]">
                  {filteredInboundItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-20 text-center">
                        <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                          <Truck className="w-12 h-12 text-slate-300" />
                          <div className="text-[15px] font-black text-slate-700">
                            현재 입고 대기 중인 발주 물량이 없습니다.
                          </div>
                          <p className="text-[13px] text-slate-500">
                            이미 모든 물량이 검수 완료되었거나, 아직 확정된 발주서가 없습니다. 스마트발주 또는 1번 탭에서 발주서를 먼저 생성해 주세요.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredInboundItems.map((item, idx) => {
                      const diff = item.orderQty - item.actualRecvQty;
                      const isShort = diff > 0;
                      const isZero = item.actualRecvQty === 0;
                      const isFull = diff === 0;
                      const actualAmount = item.actualRecvQty * item.unitPrice;

                      return (
                        <tr
                          key={item.detailId}
                          className={`hover:bg-emerald-50/30 transition-colors ${
                            !item.checked
                              ? 'opacity-50 bg-slate-50/80'
                              : isShort
                              ? 'bg-rose-50/20'
                              : idx % 2 === 0
                              ? 'bg-white'
                              : 'bg-slate-50/40'
                          }`}
                        >
                          {/* 선택 체크박스 */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={(e) => handleInboundCheck(item.detailId, e.target.checked)}
                              className="w-4 h-4 rounded text-emerald-600 cursor-pointer accent-emerald-600"
                            />
                          </td>

                          {/* No */}
                          <td className="py-2.5 px-2 text-center text-slate-400 font-mono text-[13px] whitespace-nowrap">
                            {idx + 1}
                          </td>

                          {/* 발주번호 뱃지 */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span
                              className="inline-block px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-mono text-xs font-bold border border-slate-200"
                              title={item.orderNo}
                            >
                              {item.orderNo}
                            </span>
                          </td>

                          {/* 거래처명 */}
                          <td className="py-2.5 px-3.5 font-bold text-slate-800 whitespace-nowrap">
                            <span className="inline-block px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 text-[13.5px] font-black border border-slate-200">
                              {item.partnerName}
                            </span>
                          </td>

                          {/* 품목명 */}
                          <td className="py-2.5 px-4 font-black text-slate-900 text-[15px] whitespace-nowrap">
                            <span title={item.productName}>{item.productName}</span>
                            {item.spec && (
                              <span className="block text-xs font-medium text-slate-500 whitespace-nowrap">
                                {item.spec}
                              </span>
                            )}
                          </td>

                          {/* 보관창고 */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold border ${
                                item.warehouse.includes('냉동')
                                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                                  : item.warehouse.includes('냉장')
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {item.warehouse || '일반'}
                            </span>
                          </td>

                          {/* 오기로 한 수량 (발주량) */}
                          <td className="py-2.5 px-3 text-right font-mono font-black text-[14px] text-slate-800 bg-slate-100/50 whitespace-nowrap">
                            {item.orderQty.toLocaleString()}{' '}
                            <span className="text-xs font-sans text-slate-500 font-normal">
                              {item.unit}
                            </span>
                          </td>

                          {/* 실제 도착 수량 (인라인 수정 인풋!) */}
                          <td className="py-1.5 px-2.5 text-right bg-emerald-50/60 border-x border-emerald-200 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              <input
                                type="number"
                                min={0}
                                max={item.orderQty * 2}
                                value={item.actualRecvQty}
                                onChange={(e) =>
                                  handleInboundQtyChange(item.detailId, e.target.value)
                                }
                                className={`w-22 text-right px-2 py-1 bg-white border rounded-lg text-[15px] font-black font-mono focus:outline-none focus:ring-2 shadow-2xs ${
                                  isShort
                                    ? 'border-rose-400 text-rose-700 focus:ring-rose-500'
                                    : 'border-emerald-300 text-emerald-900 focus:ring-emerald-500'
                                }`}
                              />
                              <span className="text-xs font-bold text-emerald-800">
                                {item.unit}
                              </span>
                            </div>
                          </td>

                          {/* 미납 / 차이 표시 (10개 중 5개만 온 경우 -5 표시) */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {isZero ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-300 whitespace-nowrap">
                                ▼ {item.orderQty} {item.unit} 결품
                              </span>
                            ) : isShort ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                                ▼ {diff} {item.unit} 미납
                              </span>
                            ) : diff < 0 ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap">
                                ▲ +{Math.abs(diff)} {item.unit} 초과
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-slate-400 whitespace-nowrap">0 (정상)</span>
                            )}
                          </td>

                          {/* 입고 검수 상태 뱃지 */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {isZero ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                🚨 미입고 / 결품
                              </span>
                            ) : isShort ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                                <Clock className="w-3.5 h-3.5" />
                                ⚠️ 부분입고 ({diff}개 미납)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                ✅ 정상 입고
                              </span>
                            )}
                          </td>

                          {/* 입고금액 (실제 들어온 수량 기준 연산) */}
                          <td className="py-2.5 px-3.5 text-right font-black font-mono text-[14.5px] text-slate-900 whitespace-nowrap">
                            ₩{Math.round(actualAmount).toLocaleString()}
                          </td>

                          {/* 차량/검수메모 */}
                          <td className="py-1.5 px-3.5 whitespace-nowrap">
                            <input
                              type="text"
                              placeholder="차량번호 / 메모"
                              value={item.remark}
                              onChange={(e) => {
                                const val = e.target.value;
                                setInboundItems((prev) =>
                                  prev.map((it) =>
                                    it.detailId === item.detailId ? { ...it, remark: val } : it
                                  )
                                );
                              }}
                              className="w-full px-2.5 py-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-400 rounded-md text-xs sm:text-[13px] text-slate-700 outline-none"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── 하단 총합계 고정 바 ── */}
        <div className="bg-slate-100 border-t border-slate-300 px-5 py-3 flex flex-wrap items-center justify-between text-[13.5px] font-extrabold shrink-0 gap-3">
          {mainMode === 'order' ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-slate-600">
                  납품일자:{' '}
                  <strong className="text-slate-900">
                    {currentDayDate} ({DAY_CHARS[dayIdx]}요일)
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">
                  표시 품목:{' '}
                  <strong className="text-emerald-700 font-mono">{dayRows.length}</strong>건
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600 flex items-center gap-1">
                  전략:{' '}
                  <strong
                    className={`font-black ${
                      strategyMode === 'tight'
                        ? 'text-amber-700'
                        : strategyMode === 'safety'
                        ? 'text-emerald-700'
                        : 'text-blue-700'
                    }`}
                  >
                    {strategyMode === 'tight'
                      ? '⚡타이트(최소재고)'
                      : strategyMode === 'safety'
                      ? '🛡️보수적안전(+1일)'
                      : '⚖️표준(마스터)'}
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">
                  평균 Runway:{' '}
                  <strong className="text-indigo-700 font-mono">
                    {dayTotals.avgRunway.toFixed(1)}일치
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-600 mr-2">
                    {DAY_CHARS[dayIdx]}요일 발주 총 박스수:
                  </span>
                  <span className="font-mono font-black text-blue-700 text-base">
                    {dayTotals.boxes.toLocaleString()}{' '}
                    <span className="text-xs font-sans">box</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-600 mr-2">
                    {DAY_CHARS[dayIdx]}요일 발주 예정총액:
                  </span>
                  <span className="font-mono font-black text-slate-900 text-lg sm:text-xl text-emerald-800">
                    ₩{Math.round(dayTotals.amt).toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* 입고 검수 하단 합계 바 */
            <>
              <div className="flex items-center gap-4">
                <span className="text-slate-600">
                  검수 대상:{' '}
                  <strong className="text-slate-900 font-mono">
                    {filteredInboundItems.filter((it) => it.checked).length}
                  </strong>
                  개 품목 선택됨
                </span>
                {inboundStats.diff > 0 && (
                  <span className="text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full text-xs font-black">
                    🚨 총 {inboundStats.diff}box 미납 (거래처 독촉 필요)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-600 mr-2">오기로 한 총 박스수:</span>
                  <span className="font-mono font-black text-slate-700 text-base">
                    {inboundStats.totalOrder.toLocaleString()}{' '}
                    <span className="text-xs font-sans">box</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-600 mr-2">실제 입고 반영 박스수:</span>
                  <span className="font-mono font-black text-emerald-700 text-base">
                    {inboundStats.totalActual.toLocaleString()}{' '}
                    <span className="text-xs font-sans">box</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-600 mr-2">실제 입고 확정 총액:</span>
                  <span className="font-mono font-black text-slate-900 text-lg sm:text-xl text-emerald-800">
                    ₩
                    {Math.round(
                      filteredInboundItems
                        .filter((it) => it.checked)
                        .reduce((s, it) => s + it.actualRecvQty * it.unitPrice, 0)
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
