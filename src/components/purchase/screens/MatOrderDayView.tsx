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
  Trash2,
  Undo2,
  ShoppingCart,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { exportGridToExcel } from '@/lib/excelExport';
import { ProductLifecycleBadge } from '@/components/common/ProductLifecycleBadge';
import { getProductLifecycleInfo } from '@/lib/gfs/productStatus';
import {
  DAY_CHARS,
  WEEKDAY_DEMAND_FACTORS,
  addDaysYmd,
  getWeekdayCharYmd,
  calcRow,
  splitWeek,
  classifyPattern,
  getScheduledExclusion,
  calcStrategyOrderDays,
  type SheetRowInput,
  type StrategyMode,
} from '@/lib/gfs/orderCalc';
import { calcBoxPrice } from '@/lib/gfs/pricing';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function formatOrderDays(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return '-';
  return `${Number(days.toFixed(2))}일`;
}

function formatCompactWon(amt: number): string {
  const rounded = Math.round(amt);
  if (rounded <= 0) return '₩0';
  if (rounded >= 100000000) {
    return `₩${(rounded / 100000000).toFixed(1).replace(/\.0$/, '')}억`;
  }
  if (rounded >= 10000) {
    return `₩${Math.round(rounded / 10000).toLocaleString()}만`;
  }
  return `₩${rounded.toLocaleString()}`;
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

export type { StrategyMode };

/** 3단 KPI/필터 바 중앙에 배치되는 품명/거래처 검색 상자 */
function CenteredKeywordSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex-1 min-w-[200px] flex items-center justify-center px-1">
      <div className="relative flex items-center w-full max-w-[280px]">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-8 pr-7 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs sm:text-[13px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition-colors"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="검색어 지우기"
            aria-label="검색어 지우기"
            className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// 단종 및 대체 완료 완제품의 전용 원부자재 불용 방지 경보 맵
const DISCONTINUED_CAUTION_MAP: Record<string, string> = {
  '[상온] 스팸(340g*20캔)': '고미트햄(한성) 대체 완료 (스팸 발주 영구 중단)',
  '[상온]스팸(340g*20캔)': '고미트햄(한성) 대체 완료 (스팸 발주 영구 중단)',
  '[상온]바릴라스파게티면(종이BOX) 5KG*3EA': '11/10 등심돈까스 단종 전용',
  '[냉장] 경양식돈까스소스H(소포장)(50g*240ea)': '11/10 등심돈까스 단종 전용',
  '[냉장]조청닭강정소스(2kg*10ea)': '11/10 등심돈까스 단종 전용',
  '[냉동] 등심돈까스140((140g*10ea)8ea)': '11/10 등심돈까스 단종 전용',
  '[냉동] 미트볼골드(1kg*10ea)': '11/10 등심돈까스 단종 전용',
  '[상온] 검은깨(1kg*10ea)': '11/10 등심돈까스 단종 전용',
  '[냉장]토마토파스타소스(2kg*6ea)': '11/10 등심돈까스 단종 전용',
  '골드)GFS]간지 9*9 1,000매*1봉': '11/10 등심돈까스 단종 전용',
  '혜자)돌아온등심돈까스 (1500)': '11/10 등심돈까스 단종 전용',
  '아이투알)혜자)등심돈까스 뚜껑 100EA*6PK [PP]': '11/10 등심돈까스 단종 전용',
  '두레)바란小(1곽-1000장)/74*57mm 1,000개입*60줄': '11/10 등심돈까스 단종 전용',
  '혜자)등심돈까스용기 (150ea*4pk/box)': '11/10 등심돈까스 단종 전용',
  '[냉동] 맥적구이용양념육(종이BOX) 2KG*7팩': '11/17 맥적구이 단종 전용',
  '더큰)오징어&제육깻잎쌈밥': '11/17 깻잎쌈밥 단종 전용',
  '[상온] 늘푸른피클랠리쉬 (3KG*6캔)': '11/11 삭제예정',
};

interface SheetRow extends SheetRowInput {}

// 오늘 창고 입고 검수용 아이템 타입
interface InboundInspectItem {
  detailId: number;
  orderId: number;
  orderNo: string;
  orderDate: string;
  orderCycle: string;
  leadDays: number;
  expectedDeliveryDate: string;
  partnerId: string;
  partnerName: string;
  productId?: number;
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

/** 발주 담기 바구니 항목 (납품일자 × 품목 기준 누적) */
interface StagedOrderEntry {
  key: string;
  orderDate: string;
  dayChar: string;
  rowId: number;
  productId?: number;
  name: string;
  supplier: string;
  warehouse: string;
  packUnit: number;
  bagPrice: number;
  boxPrice: number;
  qty: number;
  recommendedQty: number;
  pendingBoxes: number;
  pendingOrderNos: string[];
}

function makeStagedKey(orderDate: string, rowId: number): string {
  return `${orderDate}::${rowId}`;
}

interface DeletedProductItem {
  id: number;
  productCode: string;
  name: string;
  category: string;
  warehouse: string;
  spec: string;
  unit: string;
  boxQty: number;
  targetOrderDays: number;
  orderCycle: string;
  status: string;
  isUsed: boolean;
  isSoftDeleted: boolean;
  isUiDeleted?: boolean;
  discontinuedDate: string;
  partnerName: string;
  currentStock: number;
  deletedAt: string;
  deletedBy: string;
}

export const MatOrderDayView: React.FC = () => {
  const { openTab } = useTabs();

  // ── 상단 메인 모드 (발주 vs 입고검수) ──
  const [mainMode, setMainMode] = useState<'order' | 'inbound'>('order');

  // ── 발주 제어 전략 모드 (⚡타이트 / ⚖️표준 / 🛡️보수적 안전) ──
  // 기본값은 항상 'standard'로 두어 품목 마스터(DB)의 발주일수를 그대로 반영
  const [strategyMode, setStrategyMode] = useState<StrategyMode>('standard');

  // 품목별 발주일수 커스텀 오버라이드: rowId -> 발주일수
  const [itemTargetDaysOverrides, setItemTargetDaysOverrides] = useState<Record<number, number>>({});
  const [editingOrderDays, setEditingOrderDays] = useState<{ id: number; value: string } | null>(null);
  const [savingOrderDaysId, setSavingOrderDaysId] = useState<number | null>(null);

  // 계산 근거 팝오버 활성 품목 ID
  const [activeBriefingId, setActiveBriefingId] = useState<number | null>(null);

  // 발주 필요 품목만 보기 (기본 true) vs 전체 품목 보기 / 정렬 모드 / 타요일 긴급미배정 필터
  const [showOnlyOrderable, setShowOnlyOrderable] = useState<boolean>(true);
  const [showOnlyUrgentUnallocated, setShowOnlyUrgentUnallocated] = useState<boolean>(false);
  const [sortMode, setSortMode] = useState<'urgency' | 'default'>('urgency');

  // 기준일자 및 요일 인덱스 (0=월, 1=화, 2=수, 3=목, 4=금, 5=토, 6=일)
  const [orderDate, setOrderDate] = useState<string>(kstToday());
  const [dayIdx, setDayIdx] = useState<number>(() => {
    const t = new Date();
    return (t.getDay() + 6) % 7; // 오늘 요일 기본값
  });

  const [supplierFilter, setSupplierFilter] = useState<string>('전체');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('전체');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'critical' | 'warning' | 'pending'>('all');
  const [patternFilter, setPatternFilter] = useState<string>('전체');
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [keyword, setKeyword] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 날짜별 수동 수정값: YYYY-MM-DD -> rowId -> 수량 (주차 이동 시 타 주차 오적용 방지)
  const [overrides, setOverrides] = useState<Record<string, Record<number, number>>>({});

  // 발주 담기(장바구니) 상태: 여러 요일·검색·거래처에서 선택한 항목을 누적 후 한 번에 확정 저장
  const [stagedOrders, setStagedOrders] = useState<Record<string, StagedOrderEntry>>({});
  const [showBasketModal, setShowBasketModal] = useState<boolean>(false);

  // 해당 주차의 실제 생성된 ERP 발주서(PO) 전표 목록 (요일별 확정완료 판정 + 드로어 공용)
  const [weekConfirmedPoList, setWeekConfirmedPoList] = useState<any[]>([]);
  const [isLoadingPo, setIsLoadingPo] = useState<boolean>(false);
  const [showPoDrawer, setShowPoDrawer] = useState<boolean>(false);
  const poDrawerRef = useRef<HTMLDivElement>(null);

  // ── 입고 검수 상태 (오늘 창고에 들어올 양) ──
  const [inboundItems, setInboundItems] = useState<InboundInspectItem[]>([]);
  const [isLoadingInbound, setIsLoadingInbound] = useState<boolean>(false);
  const [isReceivingSaving, setIsReceivingSaving] = useState<boolean>(false);
  const [inboundStatusFilter, setInboundStatusFilter] = useState<string>('전체');
  const [inboundReceivingDate, setInboundReceivingDate] = useState<string>(() => kstToday());
  const [inboundOrderDateFilter, setInboundOrderDateFilter] = useState<string>('ALL');
  const [inboundExpectedDateFilter, setInboundExpectedDateFilter] = useState<string>('ALL');
  const [inboundSkipStock, setInboundSkipStock] = useState<boolean>(false);

  // ── 품목 삭제 & 복구 상태 ──
  const [deletedCount, setDeletedCount] = useState<number>(0);
  const [totalInactiveCount, setTotalInactiveCount] = useState<number>(0);
  const [showDeletedModal, setShowDeletedModal] = useState<boolean>(false);
  const [deletedScope, setDeletedScope] = useState<'ui' | 'all'>('ui');
  const [deletedItems, setDeletedItems] = useState<DeletedProductItem[]>([]);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState<boolean>(false);
  const [deletedKeyword, setDeletedKeyword] = useState<string>('');
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<SheetRow | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [restoringId, setRestoringId] = useState<number | 'ALL' | null>(null);
  const [recentDeletedNotice, setRecentDeletedNotice] = useState<{
    id: number;
    name: string;
    partner: string;
  } | null>(null);

  // ── 비수주·장기무변동(휴면) 재고 자동 제외 상태 ──
  const [dormantDays, setDormantDays] = useState<number>(14);
  const [showDormant, setShowDormant] = useState<boolean>(false);
  const [dormantMeta, setDormantMeta] = useState<{
    dormantCount: number;
    unlinkedDormantCount: number;
    latestOrderDate: string;
    latestSnapDate: string;
  }>({ dormantCount: 0, unlinkedDormantCount: 0, latestOrderDate: '', latestSnapDate: '' });
  const [showDormantModal, setShowDormantModal] = useState<boolean>(false);
  const [dormantFilterTab, setDormantFilterTab] = useState<'all' | 'unlinked'>('unlinked');
  const [dormantKeyword, setDormantKeyword] = useState<string>('');
  const [dormantSelectedIds, setDormantSelectedIds] = useState<Set<number>>(new Set());
  const [isExcludingDormant, setIsExcludingDormant] = useState<boolean>(false);

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

  // 이번 주/미래 주차 조회 시 과거 날짜 요일로는 자동 배분하지 않도록 마스크 생성 (과거 요일 누락 방지)
  const activeDayMask = useMemo(() => {
    const todayStr = kstToday();
    const hasTodayOrFuture = weekDates.some((d) => d >= todayStr);
    return hasTodayOrFuture ? weekDates.map((d) => d >= todayStr) : undefined;
  }, [weekDates]);

  // 주간 범위 텍스트 (예: 2026.11.02 ~ 2026.11.08)
  const weekRangeText = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    return `${start} ~ ${end}`;
  }, [weekDates]);

  // 현재 선택된 요일의 확정 PO 목록 (주차 전체 조회분에서 즉시 필터)
  const confirmedPoList = useMemo(
    () =>
      weekConfirmedPoList.filter(
        (po) => String(po.orderDate || '').slice(0, 10) === currentDayDate
      ),
    [weekConfirmedPoList, currentDayDate]
  );

  // 요일(YYYY-MM-DD)별 발행 전표 건수
  const weekPoCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    weekConfirmedPoList.forEach((po) => {
      const d = String(po.orderDate || '').slice(0, 10);
      if (d) map.set(d, (map.get(d) || 0) + 1);
    });
    return map;
  }, [weekConfirmedPoList]);

  // 요일(YYYY-MM-DD) × 품목별 기확정 수량·전표번호 맵 (당일 확정 품목은 추가 추천 0b 고정)
  const confirmedProductMapByDate = useMemo(() => {
    type DayConfirmEntry = { boxes: number; orderNos: string[] };
    const map = new Map<
      string,
      { byProductId: Map<number, DayConfirmEntry>; byName: Map<string, DayConfirmEntry> }
    >();
    const addEntry = (bucket: Map<any, DayConfirmEntry>, key: any, boxes: number, orderNo: string) => {
      const prev = bucket.get(key) || { boxes: 0, orderNos: [] };
      prev.boxes += boxes;
      if (orderNo && !prev.orderNos.includes(orderNo)) prev.orderNos.push(orderNo);
      bucket.set(key, prev);
    };
    weekConfirmedPoList.forEach((po) => {
      const dStr = String(po.orderDate || '').slice(0, 10);
      if (!dStr) return;
      let dayMap = map.get(dStr);
      if (!dayMap) {
        dayMap = { byProductId: new Map(), byName: new Map() };
        map.set(dStr, dayMap);
      }
      const orderNo = po.orderNo || '';
      (po.details || []).forEach((d: any) => {
        const qty = Number(d.orderQty) || 0;
        const pid = Number(d.productId) || 0;
        if (pid > 0) addEntry(dayMap!.byProductId, pid, qty, orderNo);
        const nm = String(d.productName || d.product?.name || '')
          .trim()
          .toLowerCase();
        if (nm) addEntry(dayMap!.byName, nm, qty, orderNo);
      });
    });
    return map;
  }, [weekConfirmedPoList]);

  const getRowDayConfirmStatus = useCallback(
    (dateStr: string | undefined, r: SheetRow) => {
      if (!dateStr) return null;
      const entry = confirmedProductMapByDate.get(dateStr);
      if (!entry) return null;
      const pid = Number(r.productId ?? r.id) || 0;
      if (pid > 0 && entry.byProductId.has(pid)) {
        return entry.byProductId.get(pid) || null;
      }
      const normNameKey = (r.name || '').trim().toLowerCase();
      return normNameKey ? entry.byName.get(normNameKey) || null : null;
    },
    [confirmedProductMapByDate]
  );

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

  // 1. 발주시트 정본 로드 (스마트발주 GFS 마스터와 실시간 동기화) — 선택 요일 날짜 + 비수주 기준일수 기준
  const loadOrderSheet = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentDayDate) params.set('date', currentDayDate);
      params.set('dormantDays', String(dormantDays));
      const qs = `?${params.toString()}`;
      const res = await fetch(`/api/gfs/order-sheet${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`발주시트 조회 실패 (HTTP ${res.status})`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.rows)) {
        const loaded: SheetRow[] = json.data.rows.map((r: any) => {
          const pack = r.packUnit || r.packUnitAudit || 0;
          const total = (r.incoming || 0) + (r.currentStock || 0);
          const masterOrderDays = Number(r.targetOrderDays ?? r.days) || 0;
          const req = (r.dailyUsage || 0) * masterOrderDays;
          const suggest = pack > 0 ? Math.ceil(Math.max(0, req - total) / pack) : 0;
          return {
            id: r.id,
            productId: r.productId,
            targetOrderDays: masterOrderDays,
            supplier: r.supplier || '',
            name: r.name,
            boxesBase: r.boxesBase || 0,
            packUnit: r.packUnit || 0,
            packUnitAudit: r.packUnitAudit || 0,
            days: masterOrderDays,
            dailyUsage: r.dailyUsage || 0,
            incoming: r.incoming || 0,
            currentStock: r.currentStock || 0,
            bagPrice: r.bagPrice || 0,
            warehouse: r.warehouse || '',
            vendor: r.vendor || '',
            finalBoxes: suggest,
            manual: false,
            pendingBoxes: r.pendingBoxes || 0,
            pendingOrderNos: r.pendingOrderNos || [],
            latestOrderDate: r.latestOrderDate || '',
            baseIncoming: r.baseIncoming || 0,
            orderDay: r.orderDay || '',
            isBomDriven: r.isBomDriven,
            usageSource: r.usageSource,
            liveBomUsage: r.liveBomUsage,
            surveyDailyUsage: r.surveyDailyUsage,
            suppressedSurveyDailyUsage: r.suppressedSurveyDailyUsage || 0,
            isDormant: Boolean(r.isDormant),
            dormantTier: r.dormantTier || 'active',
            activeBomCount: Number(r.activeBomCount) || 0,
            lastBomOrderDate: r.lastBomOrderDate || '',
            lastSnapDecreaseDate: r.lastSnapDecreaseDate || '',
            discontinuedDate: r.discontinuedDate || '',
            status: r.status || '정상',
            orderCycle: r.orderCycle || '',
            isReplaced: Boolean(r.isReplaced),
            replacementNote: r.replacementNote || '',
          };
        });
        setRows(loaded);
        setSuppliers(json.data.suppliers || []);
        setDormantMeta({
          dormantCount: Number(json.data.dormantCount) || loaded.filter((x) => x.isDormant).length,
          unlinkedDormantCount:
            Number(json.data.unlinkedDormantCount) ||
            loaded.filter((x) => x.dormantTier === 'unlinked_dormant').length,
          latestOrderDate: json.data.dormantLatestOrderDate || '',
          latestSnapDate: json.data.dormantLatestSnapDate || '',
        });
      }
    } catch (err) {
      console.error('Failed to load order sheet', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentDayDate, dormantDays]);

  useEffect(() => {
    loadOrderSheet();
  }, [loadOrderSheet]);

  // 삭제·비활성 품목 목록 및 개수 조회
  const loadDeletedProducts = useCallback(
    async (scopeOverride?: 'ui' | 'all') => {
      const targetScope = scopeOverride ?? deletedScope;
      setIsLoadingDeleted(true);
      try {
        const res = await fetch(`/api/master/product/lifecycle?scope=${targetScope}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (json.success && json.data) {
          setDeletedItems(Array.isArray(json.data.items) ? json.data.items : []);
          setDeletedCount(Number(json.data.uiDeletedCount) || 0);
          setTotalInactiveCount(Number(json.data.totalInactiveCount) || 0);
        }
      } catch (err) {
        console.error('Failed to load deleted products', err);
      } finally {
        setIsLoadingDeleted(false);
      }
    },
    [deletedScope]
  );

  useEffect(() => {
    void loadDeletedProducts();
  }, [loadDeletedProducts]);

  // 재고조회 등 타 탭에서 품목 복구/삭제 시 발주 시트 및 삭제 건수 실시간 동기화
  useEffect(() => {
    const onLifecycleChanged = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.source === 'order') return;
      void loadOrderSheet();
      void loadDeletedProducts();
    };
    window.addEventListener('gfs-product-lifecycle-changed', onLifecycleChanged);
    return () => window.removeEventListener('gfs-product-lifecycle-changed', onLifecycleChanged);
  }, [loadOrderSheet, loadDeletedProducts]);

  // 품목 소프트 삭제 확정 (발주화면 + 재고조회 동시 제외, DB 이력 보존)
  const handleConfirmDeleteProduct = async () => {
    if (!confirmDeleteRow || deletingProductId !== null) return;
    const targetRow = confirmDeleteRow;
    const productId = targetRow.productId ?? targetRow.id;
    setDeletingProductId(productId);
    try {
      const res = await fetch('/api/master/product/lifecycle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: productId,
          action: 'delete',
          reason: '스마트 자재발주 화면에서 담당자 삭제',
        }),
      });
      const json = await res.json();
      if (!json.success) {
        alert('품목 삭제 실패: ' + (json.error || `HTTP ${res.status}`));
        return;
      }

      setRows((prev) => prev.filter((item) => (item.productId ?? item.id) !== productId));
      setItemTargetDaysOverrides((prev) => {
        if (prev[targetRow.id] === undefined) return prev;
        const next = { ...prev };
        delete next[targetRow.id];
        return next;
      });
      setOverrides((prev) => {
        const next: Record<string, Record<number, number>> = {};
        let changed = false;
        Object.entries(prev).forEach(([dateKey, map]) => {
          if (map[targetRow.id] !== undefined) {
            const copy = { ...map };
            delete copy[targetRow.id];
            next[dateKey] = copy;
            changed = true;
          } else {
            next[dateKey] = map;
          }
        });
        return changed ? next : prev;
      });
      setStagedOrders((prev) => {
        const next: Record<string, StagedOrderEntry> = {};
        let changed = false;
        Object.entries(prev).forEach(([k, entry]) => {
          if (entry.rowId === targetRow.id || entry.productId === productId) {
            changed = true;
          } else {
            next[k] = entry;
          }
        });
        return changed ? next : prev;
      });
      if (activeBriefingId === targetRow.id) setActiveBriefingId(null);

      setConfirmDeleteRow(null);
      setRecentDeletedNotice({
        id: productId,
        name: targetRow.name,
        partner: targetRow.supplier || targetRow.vendor || '',
      });
      void loadDeletedProducts();
      window.dispatchEvent(
        new CustomEvent('gfs-product-lifecycle-changed', {
          detail: { source: 'order', action: 'delete', ids: [productId] },
        })
      );
    } catch (err: any) {
      alert('품목 삭제 중 통신 오류: ' + (err?.message || String(err)));
    } finally {
      setDeletingProductId(null);
    }
  };

  // 삭제 품목 복구 (단건 또는 일괄)
  const handleRestoreProducts = async (ids: number[], isBatch = false) => {
    if (ids.length === 0 || restoringId !== null) return;
    setRestoringId(isBatch ? 'ALL' : ids[0]);
    try {
      const res = await fetch('/api/master/product/lifecycle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'restore' }),
      });
      const json = await res.json();
      if (!json.success) {
        alert('품목 복구 실패: ' + (json.error || `HTTP ${res.status}`));
        return;
      }
      if (recentDeletedNotice && ids.includes(recentDeletedNotice.id)) {
        setRecentDeletedNotice(null);
      }
      await Promise.all([loadOrderSheet(), loadDeletedProducts()]);
      window.dispatchEvent(
        new CustomEvent('gfs-product-lifecycle-changed', {
          detail: { source: 'order', action: 'restore', ids },
        })
      );
    } catch (err: any) {
      alert('품목 복구 중 통신 오류: ' + (err?.message || String(err)));
    } finally {
      setRestoringId(null);
    }
  };

  const filteredDeletedItems = useMemo(() => {
    const kw = deletedKeyword.trim().toLowerCase();
    if (!kw) return deletedItems;
    return deletedItems.filter(
      (it) =>
        it.name.toLowerCase().includes(kw) ||
        it.partnerName.toLowerCase().includes(kw) ||
        it.warehouse.toLowerCase().includes(kw) ||
        it.productCode.toLowerCase().includes(kw)
    );
  }, [deletedItems, deletedKeyword]);

  // 2. 현재 주차(월~일)의 ERP 발주서(PO) 전표 일괄 조회 (요일별 발주완료 판정 + 당일 드로어 공용)
  const loadConfirmedPo = useCallback(async () => {
    const start = weekDates[0];
    const end = weekDates[6];
    if (!start || !end) return;
    setIsLoadingPo(true);
    try {
      const res = await fetch(`/api/purchase/order?startDate=${start}&endDate=${end}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const valid = json.data.filter(
          (po: any) => po.status !== '발주취소' && po.status !== '취소'
        );
        setWeekConfirmedPoList(valid);
      } else {
        setWeekConfirmedPoList([]);
      }
    } catch {
      setWeekConfirmedPoList([]);
    } finally {
      setIsLoadingPo(false);
    }
  }, [weekDates]);

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
            orderDate: item.orderDate || po.orderDate || '',
            orderCycle: item.orderCycle || prod.orderCycle || '',
            leadDays: Number(item.leadDays) || 1,
            expectedDeliveryDate: item.expectedDeliveryDate || po.deliveryDate || '',
            partnerId: po.partnerId || '',
            partnerName: po.partnerName || po.partner?.name || '일반거래처',
            productId: Number(item.productId || prod.id || 0) || undefined,
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

  // ── 품목별 자동 계산 플랜 (getRowMetrics 및 3대 전략 미리보기 공용) ──
  const computeRowAutoPlan = useCallback(
    (r: SheetRow, targetDayIdx: number, mode: StrategyMode) => {
      const pack = r.packUnit > 0 ? r.packUnit : r.packUnitAudit > 0 ? r.packUnitAudit : 1;
      const totalStock = (r.incoming || 0) + (r.currentStock || 0);
      const dailyUsage = r.dailyUsage || 0;
      const stockDays = dailyUsage > 0 ? totalStock / dailyUsage : totalStock > 0 ? 99 : 0;

      const pattern = classifyPattern(r.supplier, r.orderDay);
      const isDaily = pattern === '매일';

      const masterOrderDays = Number(r.targetOrderDays ?? r.days) || 0;
      const strategyCalc = calcStrategyOrderDays({
        masterOrderDays,
        pattern,
        orderCycle: r.orderCycle,
        strategyMode: mode,
      });
      const baseTargetDays =
        itemTargetDaysOverrides[r.id] !== undefined
          ? itemTargetDaysOverrides[r.id]
          : strategyCalc.effectiveDays;
      const minFloorDays = itemTargetDaysOverrides[r.id] !== undefined ? 0 : strategyCalc.minFloorDays;

      const lossRate = baseTargetDays > 0 && mode === 'safety' ? 1.05 : 1.0;
      const targetStock = Math.round(dailyUsage * baseTargetDays * lossRate);
      const shortageBags = Math.max(0, targetStock - totalStock);

      const hasIncoming = (r.incoming || 0) > 0;
      const isOverstocked = stockDays >= 60;
      const isPendingOverlap = dailyUsage > 0 && (r.incoming || 0) >= dailyUsage * 1.8;
      const isCriticalShortage = stockDays < 1.2 && (r.incoming || 0) <= 0 && dailyUsage > 0;
      const isSafetyShortage = baseTargetDays > 0 && stockDays < baseTargetDays && dailyUsage > 0 && !isCriticalShortage;
      const isReplacedItem = r.name.includes('스팸(340g*20캔)') || (r as any).isReplaced;
      const targetDayDate = weekDates[targetDayIdx] || currentDayDate || kstToday();
      const scheduledExcl = getScheduledExclusion(r.name);
      const scheduledDate = r.discontinuedDate || scheduledExcl?.effectiveDate || '';
      const lifecycle = getProductLifecycleInfo(
        { status: r.status, discontinuedDate: scheduledDate, name: r.name },
        targetDayDate
      );
      const isPastScheduledDeletion = Boolean(
        (scheduledDate && targetDayDate >= scheduledDate) || lifecycle?.isBlocked
      );
      const cautionLabel = DISCONTINUED_CAUTION_MAP[r.name] || '';
      const isDiscontinuedItem = Boolean(cautionLabel || lifecycle || scheduledExcl?.label);

      let auditStatus: 'critical' | 'warning' | 'normal' | 'overstock' | 'pending_overlap' = 'normal';
      let auditLabel = '정상 재고';
      if (isReplacedItem) {
        auditStatus = 'overstock';
        auditLabel = '🔄 고미트 대체완료 (발주 0b)';
      } else if (isPastScheduledDeletion) {
        auditStatus = 'warning';
        auditLabel = lifecycle?.isTerminal ? `🚫 ${lifecycle.label}` : '🚫 삭제예정일 도래';
      } else if (isDiscontinuedItem) {
        auditStatus = 'warning';
        auditLabel = '🚨 단종 불용주의';
      } else if (isOverstocked) {
        auditStatus = 'overstock';
        auditLabel = '60일+ 과잉재고';
      } else if (isCriticalShortage) {
        auditStatus = 'critical';
        auditLabel = '🚨 결품초임박';
      } else if (isSafetyShortage) {
        auditStatus = 'warning';
        auditLabel = hasIncoming ? '⚠️ 기발주포함 부족' : '⚠️ 안전미달';
      } else if (isPendingOverlap) {
        auditStatus = 'pending_overlap';
        auditLabel = '기발주 입고충분';
      }

      const suggestedBoxes =
        isOverstocked || isReplacedItem || isPastScheduledDeletion || dailyUsage <= 0
          ? 0
          : pack > 0 && shortageBags > 0
          ? Math.ceil(shortageBags / pack)
          : 0;

      const baseMask = activeDayMask || weekDates.map(() => true);
      const itemDayMask = weekDates.map(
        (dStr, i) => Boolean(baseMask[i]) && !getRowDayConfirmStatus(dStr, r)
      );
      const week = splitWeek(r, suggestedBoxes, itemDayMask);
      const targetDayConfirm = getRowDayConfirmStatus(targetDayDate, r);
      const boxPrice = calcBoxPrice(r.bagPrice, pack);

      return {
        pack,
        boxPrice,
        totalStock,
        dailyUsage,
        stockDays,
        pattern,
        isDaily,
        masterOrderDays,
        minFloorDays,
        targetDays: baseTargetDays,
        lossRate,
        targetStock,
        shortageBags,
        auditStatus,
        auditLabel,
        cautionLabel,
        isPastScheduledDeletion,
        scheduledDate,
        suggestedBoxes,
        week,
        targetDayDate,
        isConfirmedOnTargetDay: Boolean(targetDayConfirm),
        confirmedTodayBoxes: targetDayConfirm?.boxes || 0,
        confirmedTodayOrderNos: targetDayConfirm?.orderNos || [],
        autoDayQty: isPastScheduledDeletion ? 0 : week[targetDayIdx] || 0,
      };
    },
    [
      itemTargetDaysOverrides,
      weekDates,
      currentDayDate,
      activeDayMask,
      getRowDayConfirmStatus,
    ]
  );

  // ── 품목별 다이내믹 지표 산출 함수 (자동 플랜 + 날짜별 바구니·수동수정 반영) ──
  const getRowMetrics = useCallback(
    (r: SheetRow, targetDayIdx: number) => {
      const plan = computeRowAutoPlan(r, targetDayIdx, strategyMode);
      const stagedEntry = stagedOrders[makeStagedKey(plan.targetDayDate, r.id)];
      const override = plan.isPastScheduledDeletion ? 0 : overrides[plan.targetDayDate]?.[r.id];
      const dayQty = plan.isPastScheduledDeletion
        ? 0
        : stagedEntry !== undefined
        ? stagedEntry.qty
        : override !== undefined
        ? override
        : plan.autoDayQty;
      const amount = dayQty * plan.boxPrice;

      return {
        ...plan,
        dayQty,
        amount,
      };
    },
    [computeRowAutoPlan, strategyMode, overrides, stagedOrders]
  );

  // 품목별 발주일수 미세조정 핸들러 (±0.5일, 0일 가능)
  const handleStepTargetDays = (id: number, currentDays: number, step: number, masterDays: number) => {
    const nextDays = Math.max(0, Math.round((currentDays + step) * 100) / 100);
    setItemTargetDaysOverrides((prev) => {
      if (nextDays === masterDays) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: nextDays };
    });
  };

  // 품목별 발주일수 직접 입력 확정
  const handleCommitOrderDaysInput = (id: number, raw: string, masterDays: number) => {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      const normalized = Math.round(parsed * 100) / 100;
      setItemTargetDaysOverrides((prev) => {
        if (normalized === masterDays) {
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: normalized };
      });
    }
    setEditingOrderDays(null);
  };

  // 변경된 발주일수를 품목 마스터(DB Product.targetOrderDays)에 영구 저장
  const handleSaveOrderDays = async (row: SheetRow, nextDays: number) => {
    const productId = row.productId ?? row.id;
    const normalized = Math.max(0, Math.round(nextDays * 100) / 100);
    setSavingOrderDaysId(row.id);
    try {
      const res = await fetch('/api/inventory/stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ id: 0, productId, targetOrderDays: normalized }],
        }),
      });
      const json = await res.json();
      if (!json.success) {
        alert('발주일수 저장 실패: ' + (json.error || `HTTP ${res.status}`));
        return;
      }
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, targetOrderDays: normalized, days: normalized } : item
        )
      );
      setItemTargetDaysOverrides((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (err: any) {
      alert('발주일수 저장 중 통신 오류: ' + (err?.message || String(err)));
    } finally {
      setSavingOrderDaysId(null);
    }
  };

  // 보관창고 고유 목록 추출 (자재 표준 순서 우선)
  const warehouseOptions = useMemo(() => {
    const order = ['냉장1', '냉장2', '냉동', '상온', '부자재'];
    const set = new Set<string>();
    rows.forEach((r) => {
      const wh = (r.warehouse || '').trim();
      if (wh) set.add(wh);
    });
    return Array.from(set).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [rows]);

  // 요일 탭별 통계 (해당 요일 자동 분할량 기준)
  const dayStats = useMemo(() => {
    return DAY_CHARS.map((_, d) => {
      let items = 0;
      let boxes = 0;
      let amt = 0;
      rows.forEach((r) => {
        if (!showDormant && r.isDormant && !keyword.trim()) return;
        if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return;
        if (warehouseFilter !== '전체' && (r.warehouse || '').trim() !== warehouseFilter) return;
        if (patternFilter !== '전체' && classifyPattern(r.supplier, r.orderDay) !== patternFilter) return;
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
  }, [rows, showDormant, supplierFilter, warehouseFilter, patternFilter, keyword, getRowMetrics]);

  // 타 요일 납품 등으로 오늘 배정이 0이지만 재고가 매우 부족(1.5일 미만)한 품목 감지 (비수주 휴면 품목 제외)
  const offScheduleUrgentItems = useMemo(() => {
    return rows
      .map((r) => {
        if (r.isDormant) return null;
        const pattern = classifyPattern(r.supplier, r.orderDay);
        const m = getRowMetrics(r, dayIdx);
        if (
          !m.isConfirmedOnTargetDay &&
          m.suggestedBoxes > 0 &&
          m.dayQty === 0 &&
          (m.stockDays < 1.5 || r.currentStock <= 0)
        ) {
          return { r, m, pattern };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.m.stockDays - b.m.stockDays);
  }, [rows, dayIdx, getRowMetrics]);

  // 현재 요일에 해당하는 발주 행 목록
  const dayRows = useMemo(() => {
    const mapped = rows
      .map((r) => {
        if (!showDormant && r.isDormant && !keyword.trim()) return null;
        if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return null;
        if (warehouseFilter !== '전체' && (r.warehouse || '').trim() !== warehouseFilter) return null;
        const pattern = classifyPattern(r.supplier, r.orderDay);
        if (patternFilter !== '전체' && pattern !== patternFilter) return null;
        if (
          keyword.trim() &&
          !r.name.toLowerCase().includes(keyword.trim().toLowerCase()) &&
          !r.supplier.toLowerCase().includes(keyword.trim().toLowerCase())
        ) {
          return null;
        }
        const m = getRowMetrics(r, dayIdx);
        if (urgencyFilter === 'critical' && m.auditStatus !== 'critical') return null;
        if (urgencyFilter === 'warning' && m.auditStatus !== 'warning') return null;
        if (urgencyFilter === 'pending' && !(Number(r.pendingBoxes || 0) > 0)) return null;
        if (showOnlyUrgentUnallocated) {
          if (
            m.isConfirmedOnTargetDay ||
            !(m.suggestedBoxes > 0 && m.dayQty === 0 && (m.stockDays < 1.5 || r.currentStock <= 0))
          ) {
            return null;
          }
          return { r, m, pattern };
        }
        // showOnlyOrderable 가 true 일 때는 dayQty > 0 인 품목만 표시 (단, 검색어/상태필터/긴급필터 선택 시 0건 품목도 표시)
        if (showOnlyOrderable && urgencyFilter === 'all' && !keyword.trim() && m.dayQty <= 0) return null;
        return { r, m, pattern };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (sortMode === 'urgency') {
      const rank = (item: (typeof mapped)[number]) => {
        if (item.m.auditStatus === 'critical') return 0;
        if (item.m.auditStatus === 'warning') return 1;
        if (item.m.dayQty > 0) return 2;
        return 3;
      };
      mapped.sort((a, b) => rank(a) - rank(b) || a.m.stockDays - b.m.stockDays);
    }
    return mapped;
  }, [
    rows,
    showDormant,
    supplierFilter,
    warehouseFilter,
    urgencyFilter,
    patternFilter,
    keyword,
    dayIdx,
    getRowMetrics,
    showOnlyOrderable,
    showOnlyUrgentUnallocated,
    sortMode,
  ]);

  // 비수주·장기무변동 휴면 재고 목록 (모달 검토용)
  const dormantRows = useMemo(() => {
    return rows.filter((r) => r.isDormant);
  }, [rows]);

  const dormantFilteredModalRows = useMemo(() => {
    const q = dormantKeyword.trim().toLowerCase();
    return dormantRows.filter((r) => {
      if (dormantFilterTab === 'unlinked' && r.dormantTier !== 'unlinked_dormant') return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !(r.supplier || '').toLowerCase().includes(q) &&
        !(r.warehouse || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [dormantRows, dormantFilterTab, dormantKeyword]);

  const handleExcludeDormantSelected = async () => {
    const ids = Array.from(dormantSelectedIds);
    if (ids.length === 0 || isExcludingDormant) return;
    if (
      !window.confirm(
        `선택한 ${ids.length}개 비수주·휴면 품목을 '발주제외' 상태로 전환할까요?\n(발주 화면과 재고조회 기본 목록에서 제외되며, [삭제복구]에서 언제든 다시 복구할 수 있습니다.)`
      )
    ) {
      return;
    }
    setIsExcludingDormant(true);
    try {
      const res = await fetch('/api/master/product/lifecycle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          action: 'delete',
          targetStatus: '발주제외',
          reason: `최근 ${dormantDays}일 비수주·재고무변동 일괄 발주제외`,
        }),
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
      }
      if (!res.ok || !json.success) {
        alert('발주제외 전환 실패: ' + (json.error || `HTTP ${res.status}`));
        return;
      }
      const excludedSet = new Set(ids);
      setRows((prev) => prev.filter((item) => !excludedSet.has(item.productId ?? item.id)));
      setDormantSelectedIds(new Set());
      void loadDeletedProducts();
      window.dispatchEvent(
        new CustomEvent('gfs-product-lifecycle-changed', {
          detail: { source: 'order', action: 'delete', ids },
        })
      );
      alert(`${json.count || ids.length}개 품목이 '발주제외'로 정리되었습니다.`);
    } catch (err: any) {
      alert('발주제외 처리 중 오류: ' + (err?.message || String(err)));
    } finally {
      setIsExcludingDormant(false);
    }
  };

  // 합계 계산 (발주 및 런웨이 지표)
  const dayTotals = useMemo(() => {
    let boxes = 0;
    let amt = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let zeroPriceCount = 0;
    let totalStockDaysSum = 0;
    let countWithUsage = 0;

    dayRows.forEach(({ r, m }) => {
      boxes += m.dayQty;
      amt += m.amount;
      if (m.auditStatus === 'critical') criticalCount++;
      if (m.auditStatus === 'warning') warningCount++;
      if (m.dayQty > 0 && (r.bagPrice || 0) <= 0) zeroPriceCount++;
      if (m.dailyUsage > 0 && m.stockDays < 60) {
        totalStockDaysSum += m.stockDays;
        countWithUsage++;
      }
    });

    const avgRunway = countWithUsage > 0 ? totalStockDaysSum / countWithUsage : 0;
    const manualOverrideCount = Object.keys(overrides[currentDayDate] || {}).length;
    return { boxes, amt, criticalCount, warningCount, zeroPriceCount, manualOverrideCount, avgRunway };
  }, [dayRows, overrides, currentDayDate]);

  // 3대 전략(타이트/표준/안전)별 순수 자동 계산 예상 금액 비교 (바구니·수동수정 제외한 요일 기준 금액)
  const strategyPreview = useMemo(() => {
    const calcMode = (mode: StrategyMode) => {
      let count = 0;
      let boxes = 0;
      let amt = 0;
      const kw = keyword.trim().toLowerCase();
      rows.forEach((r) => {
        if (!showDormant && r.isDormant && !kw) return;
        if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return;
        if (warehouseFilter !== '전체' && (r.warehouse || '').trim() !== warehouseFilter) return;
        const pattern = classifyPattern(r.supplier, r.orderDay);
        if (patternFilter !== '전체' && pattern !== patternFilter) return;
        if (kw && !r.name.toLowerCase().includes(kw) && !r.supplier.toLowerCase().includes(kw)) return;

        const plan = computeRowAutoPlan(r, dayIdx, mode);
        if (urgencyFilter === 'critical' && plan.auditStatus !== 'critical') return;
        if (urgencyFilter === 'warning' && plan.auditStatus !== 'warning') return;
        if (urgencyFilter === 'pending' && !(Number(r.pendingBoxes || 0) > 0)) return;
        if (showOnlyUrgentUnallocated) {
          if (
            plan.isConfirmedOnTargetDay ||
            !(plan.suggestedBoxes > 0 && plan.autoDayQty === 0 && (plan.stockDays < 1.5 || r.currentStock <= 0))
          ) {
            return;
          }
        }

        const qty = plan.autoDayQty;
        if (qty > 0) {
          count += 1;
          boxes += qty;
          amt += qty * plan.boxPrice;
        }
      });
      return { count, boxes, amt: Math.round(amt) };
    };

    return {
      tight: calcMode('tight'),
      standard: calcMode('standard'),
      safety: calcMode('safety'),
    };
  }, [
    rows,
    showDormant,
    supplierFilter,
    warehouseFilter,
    patternFilter,
    keyword,
    urgencyFilter,
    showOnlyUrgentUnallocated,
    dayIdx,
    computeRowAutoPlan,
  ]);

  // ── 발주 담기(장바구니) 요약·그룹 계산 ──
  const stagedList = useMemo(() => {
    return Object.values(stagedOrders)
      .filter((e) => e.qty > 0)
      .sort(
        (a, b) =>
          a.orderDate.localeCompare(b.orderDate) ||
          a.supplier.localeCompare(b.supplier, 'ko') ||
          a.name.localeCompare(b.name, 'ko')
      );
  }, [stagedOrders]);

  const stagedGroupedByDate = useMemo(() => {
    const map = new Map<
      string,
      { orderDate: string; dayChar: string; items: StagedOrderEntry[]; totalBoxes: number; totalAmount: number }
    >();
    stagedList.forEach((item) => {
      if (!map.has(item.orderDate)) {
        map.set(item.orderDate, {
          orderDate: item.orderDate,
          dayChar: item.dayChar,
          items: [],
          totalBoxes: 0,
          totalAmount: 0,
        });
      }
      const group = map.get(item.orderDate)!;
      group.items.push(item);
      group.totalBoxes += item.qty;
      group.totalAmount += item.qty * (item.boxPrice || calcBoxPrice(item.bagPrice, item.packUnit));
    });
    return Array.from(map.values()).sort((a, b) => a.orderDate.localeCompare(b.orderDate));
  }, [stagedList]);

  const stagedCountByDate = useMemo(() => {
    const map: Record<string, { count: number; boxes: number; amt: number }> = {};
    stagedList.forEach((item) => {
      if (!map[item.orderDate]) map[item.orderDate] = { count: 0, boxes: 0, amt: 0 };
      map[item.orderDate].count += 1;
      map[item.orderDate].boxes += item.qty;
      map[item.orderDate].amt += item.qty * (item.boxPrice || calcBoxPrice(item.bagPrice, item.packUnit));
    });
    return map;
  }, [stagedList]);

  const currentDayStaged = useMemo(
    () => stagedCountByDate[currentDayDate] || { count: 0, boxes: 0, amt: 0 },
    [stagedCountByDate, currentDayDate]
  );

  const stagedTotals = useMemo(() => {
    let boxes = 0;
    let amt = 0;
    let zeroPriceCount = 0;
    let duplicateCount = 0;
    stagedList.forEach((item) => {
      boxes += item.qty;
      amt += item.qty * (item.boxPrice || calcBoxPrice(item.bagPrice, item.packUnit));
      if ((item.bagPrice || 0) <= 0 && (item.boxPrice || 0) <= 0) zeroPriceCount += 1;
      if ((item.pendingBoxes || 0) > 0) duplicateCount += 1;
    });
    return {
      count: stagedList.length,
      boxes,
      amt,
      dateCount: stagedGroupedByDate.length,
      zeroPriceCount,
      duplicateCount,
    };
  }, [stagedList, stagedGroupedByDate.length]);

  const visibleStageableRows = useMemo(
    () => dayRows.filter(({ m }) => !m.isPastScheduledDeletion && Number(m.dayQty) > 0),
    [dayRows]
  );

  const isAllVisibleStaged = useMemo(
    () =>
      visibleStageableRows.length > 0 &&
      visibleStageableRows.every(({ r }) => {
        const entry = stagedOrders[makeStagedKey(currentDayDate, r.id)];
        return Boolean(entry && entry.qty > 0);
      }),
    [visibleStageableRows, stagedOrders, currentDayDate]
  );

  const buildStagedEntry = useCallback(
    (
      r: SheetRow,
      pack: number,
      boxPrice: number,
      recommendedQty: number,
      targetDate: string,
      targetDayIdx: number,
      qty: number
    ): StagedOrderEntry => ({
      key: makeStagedKey(targetDate, r.id),
      orderDate: targetDate,
      dayChar: DAY_CHARS[targetDayIdx] || '',
      rowId: r.id,
      productId: r.productId,
      name: r.name,
      supplier: r.supplier,
      warehouse: r.warehouse || '',
      packUnit: pack,
      bagPrice: r.bagPrice || 0,
      boxPrice: boxPrice || calcBoxPrice(r.bagPrice, pack),
      qty,
      recommendedQty,
      pendingBoxes: r.pendingBoxes || 0,
      pendingOrderNos: r.pendingOrderNos || [],
    }),
    []
  );

  // 수량 인라인 수정 (정수 박스 단위, 0 초과 시 자동 발주 담기 / 0 입력 시 바구니 제외)
  const handleDayQtyChange = (
    r: SheetRow,
    m: ReturnType<typeof getRowMetrics>,
    val: string
  ) => {
    const num = Math.max(0, Math.ceil(Number(val) || 0));
    setOverrides((prev) => ({
      ...prev,
      [currentDayDate]: { ...(prev[currentDayDate] || {}), [r.id]: num },
    }));
    if (m.isPastScheduledDeletion) return;

    const key = makeStagedKey(currentDayDate, r.id);
    setStagedOrders((prev) => {
      if (num <= 0) {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: buildStagedEntry(
          r,
          m.pack || r.packUnit || 1,
          m.boxPrice,
          m.week[dayIdx] || 0,
          currentDayDate,
          dayIdx,
          num
        ),
      };
    });
  };

  // 개별 품목 발주 담기/해제 체크박스 토글
  const handleToggleStageRow = (r: SheetRow, m: ReturnType<typeof getRowMetrics>) => {
    if (m.isPastScheduledDeletion) return;
    const key = makeStagedKey(currentDayDate, r.id);
    const existing = stagedOrders[key];
    const isStaged = Boolean(existing && existing.qty > 0);
    if (isStaged) {
      setStagedOrders((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      // 선택 해지 시 해당 품목에 걸려 있던 수동 고정(overrides)도 함께 풀어 전략 변경이 즉시 반영되도록 함
      setOverrides((prev) => {
        if (!prev[currentDayDate] || prev[currentDayDate][r.id] === undefined) return prev;
        const copy = { ...prev[currentDayDate] };
        delete copy[r.id];
        return { ...prev, [currentDayDate]: copy };
      });
      return;
    }

    const initialQty = m.dayQty > 0 ? m.dayQty : m.week[dayIdx] > 0 ? m.week[dayIdx] : 1;
    if (m.dayQty <= 0) {
      setOverrides((prev) => ({
        ...prev,
        [currentDayDate]: { ...(prev[currentDayDate] || {}), [r.id]: initialQty },
      }));
    }
    setStagedOrders((prev) => ({
      ...prev,
      [key]: buildStagedEntry(
        r,
        m.pack || r.packUnit || 1,
        m.boxPrice,
        m.week[dayIdx] || 0,
        currentDayDate,
        dayIdx,
        initialQty
      ),
    }));
  };

  // 현재 화면에 표시된 발주 가능 품목 전체 담기/해제
  const handleToggleAllVisibleStage = () => {
    if (visibleStageableRows.length === 0) return;
    if (isAllVisibleStaged) {
      setStagedOrders((prev) => {
        const next = { ...prev };
        visibleStageableRows.forEach(({ r }) => {
          delete next[makeStagedKey(currentDayDate, r.id)];
        });
        // 전략 전환 중 0박스가 되어 숨겨진 당일 임시 기억 항목도 함께 정리
        Object.entries(next).forEach(([k, entry]) => {
          if (entry.orderDate === currentDayDate && entry.qty <= 0) {
            delete next[k];
          }
        });
        return next;
      });
      setOverrides((prev) => {
        if (!prev[currentDayDate]) return prev;
        const copy = { ...prev[currentDayDate] };
        let changed = false;
        visibleStageableRows.forEach(({ r }) => {
          if (copy[r.id] !== undefined) {
            delete copy[r.id];
            changed = true;
          }
        });
        return changed ? { ...prev, [currentDayDate]: copy } : prev;
      });
      return;
    }

    setStagedOrders((prev) => {
      const next = { ...prev };
      visibleStageableRows.forEach(({ r, m }) => {
        const qty = Number(m.dayQty) || 0;
        if (qty <= 0) return;
        const key = makeStagedKey(currentDayDate, r.id);
        next[key] = buildStagedEntry(
          r,
          m.pack || r.packUnit || 1,
          m.boxPrice,
          m.week[dayIdx] || 0,
          currentDayDate,
          dayIdx,
          qty
        );
      });
      return next;
    });
  };

  // 전략 모드(타이트/표준/안전) 변경: 수동 수정(overrides)이 없는 당일 선택 품목도 새 전략 수량으로 즉시 재계산
  const handleSelectStrategyMode = (nextMode: StrategyMode) => {
    setStrategyMode(nextMode);
    const dayOverrides = overrides[currentDayDate] || {};
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const wasAllVisibleStaged = isAllVisibleStaged;

    setStagedOrders((prev) => {
      let changed = false;
      const next = { ...prev };

      Object.entries(prev).forEach(([key, entry]) => {
        if (entry.orderDate !== currentDayDate) return;
        if (dayOverrides[entry.rowId] !== undefined) return;
        const row = rowMap.get(entry.rowId);
        if (!row) return;
        const plan = computeRowAutoPlan(row, dayIdx, nextMode);
        const nextQty = plan.isPastScheduledDeletion ? 0 : plan.autoDayQty;
        const nextRec = plan.week[dayIdx] || 0;
        if (entry.qty !== nextQty || entry.recommendedQty !== nextRec) {
          next[key] = buildStagedEntry(
            row,
            plan.pack,
            plan.boxPrice,
            nextRec,
            currentDayDate,
            dayIdx,
            nextQty
          );
          changed = true;
        }
      });

      // 전체 선택 상태였다면 새 전략에서 추가로 발주 가능해진 화면 품목도 자동 반영
      if (wasAllVisibleStaged && !showOnlyUrgentUnallocated) {
        const q = keyword.trim().toLowerCase();
        rows.forEach((r) => {
          if (!showDormant && r.isDormant && !q) return;
          if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return;
          if (warehouseFilter !== '전체' && (r.warehouse || '').trim() !== warehouseFilter) return;
          const pattern = classifyPattern(r.supplier, r.orderDay);
          if (patternFilter !== '전체' && pattern !== patternFilter) return;
          if (q && !r.name.toLowerCase().includes(q) && !r.supplier.toLowerCase().includes(q)) return;
          if (dayOverrides[r.id] !== undefined) return;

          const key = makeStagedKey(currentDayDate, r.id);
          if (next[key]) return;

          const plan = computeRowAutoPlan(r, dayIdx, nextMode);
          if (plan.isPastScheduledDeletion || plan.autoDayQty <= 0) return;
          if (urgencyFilter === 'critical' && plan.auditStatus !== 'critical') return;
          if (urgencyFilter === 'warning' && plan.auditStatus !== 'warning') return;
          if (urgencyFilter === 'pending' && !(Number(r.pendingBoxes || 0) > 0)) return;

          next[key] = buildStagedEntry(
            r,
            plan.pack,
            plan.boxPrice,
            plan.week[dayIdx] || 0,
            currentDayDate,
            dayIdx,
            plan.autoDayQty
          );
          changed = true;
        });
      }

      return changed ? next : prev;
    });
  };

  // 바구니 모달 내부 수량 수정
  const handleUpdateStagedQty = (key: string, rawVal: string | number) => {
    const nextQty = Math.max(1, Math.ceil(Number(rawVal) || 1));
    const entry = stagedOrders[key];
    if (!entry) return;
    setStagedOrders((prev) => {
      if (!prev[key]) return prev;
      return { ...prev, [key]: { ...prev[key], qty: nextQty } };
    });
    setOverrides((prev) => ({
      ...prev,
      [entry.orderDate]: { ...(prev[entry.orderDate] || {}), [entry.rowId]: nextQty },
    }));
  };

  // 바구니 단일 항목 제외
  const handleRemoveStagedItem = (key: string) => {
    const entry = stagedOrders[key];
    setStagedOrders((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (entry) {
      setOverrides((prev) => {
        if (!prev[entry.orderDate] || prev[entry.orderDate][entry.rowId] === undefined) return prev;
        const copy = { ...prev[entry.orderDate] };
        delete copy[entry.rowId];
        return { ...prev, [entry.orderDate]: copy };
      });
    }
  };

  // 바구니 전체 비우기
  const handleClearBasket = () => {
    if (stagedList.length === 0) return;
    if (confirm(`발주 바구니에 담긴 ${stagedList.length}개 항목을 모두 비우시겠습니까?`)) {
      setOverrides((prev) => {
        const next = { ...prev };
        let changed = false;
        stagedList.forEach((entry) => {
          if (next[entry.orderDate]?.[entry.rowId] !== undefined) {
            next[entry.orderDate] = { ...next[entry.orderDate] };
            delete next[entry.orderDate][entry.rowId];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      setStagedOrders({});
      setShowBasketModal(false);
    }
  };

  // 수량 초기화
  const handleResetDay = () => {
    if (confirm(`[${DAY_CHARS[dayIdx]}요일]의 수동 수정·바구니 선택을 모두 해제하고 현재 전략 계산값으로 복원하시겠습니까?`)) {
      setOverrides((prev) => {
        if (!prev[currentDayDate]) return prev;
        const next = { ...prev };
        delete next[currentDayDate];
        return next;
      });
      setStagedOrders((prev) => {
        const next: Record<string, StagedOrderEntry> = {};
        let changed = false;
        Object.entries(prev).forEach(([k, entry]) => {
          if (entry.orderDate === currentDayDate) {
            changed = true;
          } else {
            next[k] = entry;
          }
        });
        return changed ? next : prev;
      });
      setItemTargetDaysOverrides({});
      setShowOnlyUrgentUnallocated(false);
    }
  };

  // 단일 납품일자 분의 ERP 품목 매칭(/materialize) + PO 전표 생성(/order-result) 공통 실행기
  const executeBatchOrderForDate = async (
    targetDate: string,
    memo: string,
    items: {
      productId?: number;
      name: string;
      boxes: number;
      packUnit: number;
      bagPrice: number;
      boxPrice: number;
      supplierHeader: string;
    }[]
  ): Promise<{
    ok: boolean;
    orderDate: string;
    createdOrders: { orderNo: string; itemCount: number }[];
    failedMat: any[];
    error?: string;
  }> => {
    const matRes = await fetch('/api/gfs/materialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderDate: targetDate, items }),
    });
    const matJson = await matRes.json().catch(() => ({ success: false, error: `HTTP ${matRes.status}` }));
    if (!matRes.ok || !matJson.success) {
      return {
        ok: false,
        orderDate: targetDate,
        createdOrders: [],
        failedMat: [],
        error: `ERP 품목 매칭 실패: ${matJson.error || `HTTP ${matRes.status}`}`,
      };
    }

    const failedMat = (matJson.data?.failed || []) as any[];
    const orderItems = (matJson.data?.matched || [])
      .filter((m: any) => m.productCode && Number(m.orderQty) > 0)
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
      const reasons = failedMat
        .slice(0, 5)
        .map((f: any) => `• ${f.name}: ${f.reason}`)
        .join('\n');
      return {
        ok: false,
        orderDate: targetDate,
        createdOrders: [],
        failedMat,
        error: 'ERP 품목 마스터와 매칭된 발주 품목이 없습니다.' + (reasons ? `\n${reasons}` : ''),
      };
    }

    const res = await fetch('/api/gfs/order-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderDate: targetDate, memo, items: orderItems }),
    });
    const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
    if (!res.ok || !json.success) {
      return {
        ok: false,
        orderDate: targetDate,
        createdOrders: [],
        failedMat,
        error: `발주 확정 실패: ${json.error || `HTTP ${res.status}`}`,
      };
    }

    return {
      ok: true,
      orderDate: targetDate,
      createdOrders: Array.isArray(json.data) ? json.data : [],
      failedMat,
    };
  };

  // 발주 확정 저장 (담은 바구니가 있으면 일괄 확정, 0건이면 실수 방지 확인 후 현재 화면 전체 일괄 저장)
  const handleSaveDay = async () => {
    const useStagedBasket = stagedList.length > 0;

    if (useStagedBasket) {
      const duplicateItems = stagedList
        .filter((it) => (it.pendingBoxes || 0) > 0)
        .map(
          (it) =>
            `• [${it.orderDate}] ${it.name} (기발주: ${it.pendingBoxes}box 차감 후 추가: ${it.qty}box, 전표: ${(it.pendingOrderNos || []).slice(0, 2).join(', ')})`
        );

      if (duplicateItems.length > 0) {
        const dupMsg =
          `⚠️ [기발주 포함 추가 발주 확인]\n\n` +
          `바구니에 담은 품목 중 ${duplicateItems.length}개 품목은 기존 미입고 발주분이 있습니다:\n\n` +
          duplicateItems.slice(0, 5).join('\n') +
          (duplicateItems.length > 5 ? `\n...외 ${duplicateItems.length - 5}건` : '') +
          `\n\n추가 발주를 진행하시겠습니까?\n(취소를 누르면 저장이 중단됩니다.)`;
        if (!confirm(dupMsg)) return;
      }

      const dateSummaryLines = stagedGroupedByDate
        .map(
          (g) =>
            `• ${g.orderDate} (${g.dayChar}요일): ${g.items.length}품목 · ${g.totalBoxes.toLocaleString()}박스 · ₩${Math.round(g.totalAmount).toLocaleString()}원`
        )
        .join('\n');
      const zeroPriceLine =
        stagedTotals.zeroPriceCount > 0
          ? `\n\n⚠️ 단가 미등록(₩0) 품목 ${stagedTotals.zeroPriceCount}건이 포함되어 있습니다.`
          : '';

      if (
        !confirm(
          `🛒 [발주 담기 일괄 확정 저장]\n\n` +
            `총 ${stagedTotals.dateCount}개 납품일 · ${stagedTotals.count}개 품목 (${stagedTotals.boxes.toLocaleString()}박스 / ₩${Math.round(
              stagedTotals.amt
            ).toLocaleString()}원)\n\n` +
            `${dateSummaryLines}${zeroPriceLine}\n\n` +
            `위 담은 항목을 납품일·거래처별 ERP 정식 발주서(PO)로 한꺼번에 확정 생성하시겠습니까?`
        )
      ) {
        return;
      }

      setIsSaving(true);
      try {
        const succeededDates = new Set<string>();
        const failedNamesByDate = new Map<string, Set<string>>();
        const allCreated: { orderDate: string; orderNo: string; itemCount: number }[] = [];
        const allFailedMat: { orderDate: string; name: string; reason: string }[] = [];
        const dateErrors: string[] = [];

        for (const group of stagedGroupedByDate) {
          const result = await executeBatchOrderForDate(
            group.orderDate,
            `자재발주(요일별 ${group.dayChar}요일 담기일괄, 전략:${strategyMode})`,
            group.items.map((it) => ({
              productId: it.productId,
              name: it.name,
              boxes: it.qty,
              packUnit: it.packUnit || 1,
              bagPrice: it.bagPrice || 0,
              boxPrice: it.boxPrice || calcBoxPrice(it.bagPrice, it.packUnit || 1),
              supplierHeader: it.supplier,
            }))
          );

          result.failedMat.forEach((f: any) => {
            allFailedMat.push({ orderDate: group.orderDate, name: f.name, reason: f.reason });
            if (f?.name) {
              if (!failedNamesByDate.has(group.orderDate)) {
                failedNamesByDate.set(group.orderDate, new Set());
              }
              failedNamesByDate.get(group.orderDate)!.add(String(f.name).trim());
            }
          });

          if (result.ok) {
            succeededDates.add(group.orderDate);
            result.createdOrders.forEach((o) =>
              allCreated.push({ orderDate: group.orderDate, orderNo: o.orderNo, itemCount: o.itemCount })
            );
          } else {
            dateErrors.push(`[${group.orderDate}] ${result.error}`);
          }
        }

        if (succeededDates.size > 0) {
          setStagedOrders((prev) => {
            const next: Record<string, StagedOrderEntry> = {};
            Object.entries(prev).forEach(([k, entry]) => {
              if (!succeededDates.has(entry.orderDate)) {
                next[k] = entry;
                return;
              }
              // 매칭 실패(failedMat) 품목은 바구니에 남겨 재확인 가능하게 유지하고, 성공 품목 및 0박스 임시 항목만 정리
              const failedSet = failedNamesByDate.get(entry.orderDate);
              if (entry.qty > 0 && failedSet?.has(String(entry.name || '').trim())) {
                next[k] = entry;
              }
            });
            return next;
          });
          setOverrides((prev) => {
            const next = { ...prev };
            let changed = false;
            succeededDates.forEach((d) => {
              if (next[d]) {
                delete next[d];
                changed = true;
              }
            });
            return changed ? next : prev;
          });
          if (dateErrors.length === 0 && allFailedMat.length === 0) {
            setShowBasketModal(false);
          }
          await Promise.all([loadConfirmedPo(), loadInboundPending(), loadOrderSheet()]);
        }

        const failedWarn =
          allFailedMat.length > 0
            ? `\n\n⚠️ 제외/매칭실패 ${allFailedMat.length}건:\n` +
              allFailedMat
                .slice(0, 5)
                .map((f) => `• [${f.orderDate}] ${f.name}: ${f.reason}`)
                .join('\n')
            : '';
        const errSection = dateErrors.length > 0 ? `\n\n❌ 실패 내역:\n${dateErrors.join('\n')}` : '';

        if (allCreated.length > 0) {
          const orderPreview = allCreated
            .slice(0, 6)
            .map((o) => `• ${o.orderNo} (${o.orderDate}, ${o.itemCount}품목)`)
            .join('\n');
          alert(
            `✅ 발주 담기 일괄 확정 완료!\n\n` +
              `• 생성된 발주서: 총 ${allCreated.length}건 발행 완료\n` +
              orderPreview +
              (allCreated.length > 6 ? `\n...외 ${allCreated.length - 6}건` : '') +
              failedWarn +
              errSection
          );
        } else {
          alert('발주 확정 실패:\n' + (dateErrors.join('\n') || '생성된 발주서가 없습니다.') + failedWarn);
        }
      } catch (err: any) {
        alert('발주 일괄 저장 중 통신 오류: ' + err.message);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // ── 바구니가 비어 있는(0건) 경우: 실수 방지를 위해 전체발주 여부 명확히 안내 ──
    const saveRows = dayRows.filter(({ m }) => Number(m.dayQty) > 0);
    if (saveRows.length === 0) {
      alert(
        `발주 담기 바구니가 비어 있고, [${DAY_CHARS[dayIdx]}요일] 현재 화면에도 발주수량이 입력된 품목이 없습니다.\n\n` +
          `테이블 왼쪽 체크박스로 발주할 품목을 담거나 수량을 입력해 주세요.`
      );
      return;
    }

    const zeroPriceLine =
      dayTotals.zeroPriceCount > 0
        ? `\n\n⚠️ 단가 미등록(₩0) 품목 ${dayTotals.zeroPriceCount}건이 포함되어 있습니다.`
        : '';

    if (
      !confirm(
        `💡 현재 '발주 담기' 바구니에 선택한 항목이 없습니다 (0건).\n\n` +
          `현재 화면 [${currentDayDate} (${DAY_CHARS[dayIdx]}요일)]에 표시된 ${
            saveRows.length
          }개 품목 전체 (${dayTotals.boxes.toLocaleString()}박스 / ₩${Math.round(
            dayTotals.amt
          ).toLocaleString()}원)를 그대로 일괄 발주 확정하시겠습니까?${zeroPriceLine}\n\n` +
          `(원하는 품목만 골라서 발주하려면 [취소]를 누른 뒤 왼쪽 체크박스나 수량 수정으로 먼저 담아 주세요.)`
      )
    ) {
      return;
    }

    // ── [안전 가드레일] 기발주 미입고 품목 안내 (부족분 계산 시 기발주 수량은 이미 차감되었으나 추가 발주 확인) ──
    const duplicateItems = saveRows
      .filter(({ r }) => (r.pendingBoxes || 0) > 0)
      .map(
        ({ r, m }) =>
          `• ${r.name} (기발주: ${r.pendingBoxes}box 차감 후 추가부족분: ${m.dayQty}box, 전표: ${(r.pendingOrderNos || []).slice(0, 2).join(', ')})`
      );

    if (duplicateItems.length > 0) {
      const msg =
        `⚠️ [기발주 포함 추가 발주 확인]\n\n` +
        `선택하신 품목 중 ${duplicateItems.length}개 품목은 기존 미입고 발주분을 차감하고도 목표 발주일수에 부족하여 추가 발주가 포함되었습니다:\n\n` +
        duplicateItems.slice(0, 5).join('\n') +
        (duplicateItems.length > 5 ? `\n...외 ${duplicateItems.length - 5}건` : '') +
        `\n\n추가 발주를 진행하시겠습니까?\n(취소를 누르면 저장이 중단됩니다.)`;
      if (!confirm(msg)) {
        return;
      }
    }

    setIsSaving(true);
    try {
      const result = await executeBatchOrderForDate(
        currentDayDate,
        `자재발주(요일별 ${DAY_CHARS[dayIdx]}요일 납품, 전략:${strategyMode})`,
        saveRows.map(({ r, m }) => {
          const pack = m.pack || r.packUnit || 1;
          const boxPrice = m.boxPrice || calcBoxPrice(r.bagPrice, pack);
          return {
            productId: r.productId,
            name: r.name,
            boxes: m.dayQty,
            packUnit: pack,
            bagPrice: r.bagPrice,
            boxPrice,
            supplierHeader: r.supplier,
          };
        })
      );

      if (result.ok) {
        const orderCount = result.createdOrders.length;
        const failedWarn =
          result.failedMat.length > 0
            ? `\n\n⚠️ 제외/매칭실패 ${result.failedMat.length}건:\n` +
              result.failedMat
                .slice(0, 5)
                .map((f: any) => `• ${f.name}: ${f.reason}`)
                .join('\n')
            : '';
        alert(
          `✅ [${DAY_CHARS[dayIdx]}요일 (${currentDayDate})] 발주 확정 완료!\n\n` +
            `• 생성된 발주서: 총 ${orderCount}건 발행 완료\n` +
            `• 상단의 [발주서 ${orderCount}건 발행] 버튼을 누르면 거래처별 전표 내역을 바로 확인하실 수 있습니다.` +
            failedWarn
        );
        setStagedOrders((prev) => {
          const next = { ...prev };
          let changed = false;
          Object.entries(prev).forEach(([k, entry]) => {
            if (entry.orderDate === currentDayDate && entry.qty <= 0) {
              delete next[k];
              changed = true;
            }
          });
          return changed ? next : prev;
        });
        setOverrides((prev) => {
          if (!prev[currentDayDate]) return prev;
          const next = { ...prev };
          delete next[currentDayDate];
          return next;
        });
        await Promise.all([loadConfirmedPo(), loadInboundPending(), loadOrderSheet()]);
      } else {
        alert(result.error || '발주 확정 실패');
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
      발주일수_일: m.targetDays,
      안전감사상태: m.auditLabel,
      추천수량_박스: m.suggestedBoxes,
      발주수량_박스: m.dayQty,
      입수량: m.pack || 0,
      봉단가: r.bagPrice,
      박스단가: calcBoxPrice(r.bagPrice, m.pack),
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
        { key: '발주일수_일', label: '발주일수(일)' },
        { key: '안전감사상태', label: '감사상태' },
        { key: '발주수량_박스', label: '발주량(박스)' },
        { key: '입수량', label: '입수량' },
        { key: '봉단가', label: '봉단가' },
        { key: '박스단가', label: '박스단가' },
        { key: '금액', label: '금액' },
      ],
      data: exportData,
    });
  };

  // ── 입고 필터 옵션 (발주일 / 입고예정일 / 거래처) ──
  const inboundOrderDateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    inboundItems.forEach((it) => {
      if (it.orderDate) counts.set(it.orderDate, (counts.get(it.orderDate) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, count]) => ({ date, count }));
  }, [inboundItems]);

  const inboundExpectedDateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    inboundItems.forEach((it) => {
      const target = it.expectedDeliveryDate || '';
      if (target) counts.set(target, (counts.get(target) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
  }, [inboundItems]);

  const inboundSuppliers = useMemo(() => {
    const set = new Set<string>();
    inboundItems.forEach((it) => {
      if (it.partnerName) set.add(it.partnerName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [inboundItems]);

  // 입고 필터링된 품목 목록
  const filteredInboundItems = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return inboundItems.filter((it) => {
      if (inboundOrderDateFilter !== 'ALL' && it.orderDate !== inboundOrderDateFilter) return false;
      if (
        inboundExpectedDateFilter !== 'ALL' &&
        (it.expectedDeliveryDate || '') !== inboundExpectedDateFilter
      ) {
        return false;
      }
      if (supplierFilter !== '전체' && it.partnerName !== supplierFilter) return false;
      if (
        kw &&
        !it.productName.toLowerCase().includes(kw) &&
        !it.partnerName.toLowerCase().includes(kw) &&
        !it.orderNo.toLowerCase().includes(kw)
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
  }, [
    inboundItems,
    inboundOrderDateFilter,
    inboundExpectedDateFilter,
    supplierFilter,
    keyword,
    inboundStatusFilter,
  ]);

  // 입고 통계 (현재 필터된 목록 기준)
  const inboundStats = useMemo(() => {
    let totalOrder = 0;
    let totalActual = 0;
    let totalAmount = 0;
    let shortCount = 0;
    filteredInboundItems.forEach((it) => {
      totalOrder += it.orderQty;
      totalActual += it.actualRecvQty;
      totalAmount += Math.round(it.actualRecvQty * it.unitPrice);
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

  // ── 입고 검수 핸들러 ──
  const handleInboundQtyChange = (detailId: number, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setInboundItems((prev) =>
      prev.map((it) =>
        it.detailId === detailId
          ? { ...it, actualRecvQty: num, amount: Math.round(num * it.unitPrice) }
          : it
      )
    );
  };

  const handleInboundCheck = (detailId: number, checked: boolean) => {
    setInboundItems((prev) =>
      prev.map((it) => (it.detailId === detailId ? { ...it, checked } : it))
    );
  };

  // 현재 필터로 보이는 행만 일괄 선택/해제 (숨겨진 다른 날짜 발주 오작동 방지)
  const handleToggleAllInbound = (checked: boolean) => {
    const visibleIds = new Set(filteredInboundItems.map((it) => it.detailId));
    setInboundItems((prev) =>
      prev.map((it) => (visibleIds.has(it.detailId) ? { ...it, checked } : it))
    );
  };

  // 현재 필터로 보이는 행의 검수 수량만 발주수량(100% 정상)으로 채우기
  const handleFillAllOrderQty = () => {
    const visibleIds = new Set(filteredInboundItems.map((it) => it.detailId));
    setInboundItems((prev) =>
      prev.map((it) =>
        visibleIds.has(it.detailId)
          ? {
              ...it,
              actualRecvQty: it.orderQty,
              amount: Math.round(it.orderQty * it.unitPrice),
            }
          : it
      )
    );
  };

  // ── 입고 검수 완료 및 실제 재고 반영 (POST /api/purchase/receiving) ──
  const handleConfirmInboundReceiving = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inboundReceivingDate)) {
      alert('유효한 입고처리 일자(YYYY-MM-DD)를 선택해 주세요.');
      return;
    }

    const selected = filteredInboundItems.filter((it) => it.checked);
    if (selected.length === 0) {
      alert('현재 조회 목록에서 입고 처리할 품목을 체크해 주세요.');
      return;
    }

    const totalOrderQty = selected.reduce((s, it) => s + it.orderQty, 0);
    const totalActualQty = selected.reduce((s, it) => s + it.actualRecvQty, 0);
    const diffQty = totalOrderQty - totalActualQty;
    const recvDayChar = getWeekdayCharYmd(inboundReceivingDate);
    const isTodayRecv = inboundReceivingDate === kstToday();

    let warningText = '';
    if (diffQty > 0) {
      warningText =
        `\n\n⚠️ [미납/결품 안내]\n` +
        `• 총 발주량: ${totalOrderQty}box 중 ${totalActualQty}box만 도착했습니다.\n` +
        `• 미납 잔량: 총 ${diffQty}box 가 덜 들어왔습니다.\n` +
        `• ${totalActualQty}box만 입고 기록되고, ${diffQty}box는 '미입고 잔량'으로 남습니다.`;
    }

    const stockActionLine = inboundSkipStock
      ? `• 재고 반영: ⚠️ 실재고 가산 제외 (이미 실사 반영됨 — 입고전표·수불부·발주완료만 기록)`
      : `• 재고 반영: 창고 현재고(+) 및 자재수불부 즉시 반영`;

    const ok = window.confirm(
      `[창고 입고 검수 완료${inboundSkipStock ? ' (전표·발주만 기록)' : ' & 재고 즉시 반영'}]\n\n` +
        `• 검수 대상: 현재 화면 체크 ${selected.length}개 품목\n` +
        `• 실제 입고량: 총 ${totalActualQty.toLocaleString()} box\n` +
        `• 입고 일자: ${inboundReceivingDate}${recvDayChar ? ` (${recvDayChar})` : ''}${isTodayRecv ? ' (오늘 당일)' : ' ← 지정/소급 입고일'}\n` +
        `${stockActionLine}` +
        warningText +
        `\n\n선택한 [${inboundReceivingDate}] 일자로 입고 확정하시겠습니까?`
    );

    if (!ok) return;

    setIsReceivingSaving(true);
    let completedBatches = 0;
    try {
      // 거래처 단위를 유지하되 20품목 단위 배치로 묶어 서버리스 HTTP 타임아웃 및 다중 요청 부하 방지
      const byPartner = new Map<string, InboundInspectItem[]>();
      selected.forEach((it) => {
        const pid = it.partnerId || 'DEFAULT';
        if (!byPartner.has(pid)) byPartner.set(pid, []);
        byPartner.get(pid)!.push(it);
      });

      const batches: InboundInspectItem[][] = [];
      let currentBatch: InboundInspectItem[] = [];
      for (const pItems of byPartner.values()) {
        if (currentBatch.length > 0 && currentBatch.length + pItems.length > 20) {
          batches.push(currentBatch);
          currentBatch = [];
        }
        currentBatch.push(...pItems);
      }
      if (currentBatch.length > 0) batches.push(currentBatch);

      for (const batchItems of batches) {
        const first = batchItems[0];
        const distinctPartners = new Set(batchItems.map((it) => it.partnerId || it.partnerName));
        const payload = {
          receivingDate: inboundReceivingDate,
          skipInventoryUpdate: inboundSkipStock,
          partnerId:
            distinctPartners.size === 1 && first?.partnerId
              ? first.partnerId
              : undefined,
          partnerName:
            distinctPartners.size === 1 ? first?.partnerName || '' : '일괄입고검수',
          createdBy: '창고검수자',
          items: batchItems.map((it) => ({
            orderDetailId: it.detailId,
            orderNo: it.orderNo,
            partnerId: it.partnerId || undefined,
            partnerName: it.partnerName,
            productId: it.productId,
            name: it.productName,
            productCode: it.productCode,
            unit: it.unit,
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
        const rawText = await res.text();
        let json: any = null;
        try {
          json = rawText ? JSON.parse(rawText) : null;
        } catch {
          throw new Error(`서버 응답 오류 (HTTP ${res.status}): ${rawText.slice(0, 120)}`);
        }
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `입고 반영 실패 (HTTP ${res.status})`);
        }
        completedBatches += 1;
      }

      alert(
        `✅ ${inboundReceivingDate}${recvDayChar ? `(${recvDayChar})` : ''} 일자로 총 ${selected.length}개 품목의 입고 처리가 완료되었습니다!\n\n` +
          (inboundSkipStock
            ? `• 현재고는 추가 가산하지 않았으며, 입고 전표 및 발주서 진행상태만 기록되었습니다.\n`
            : `• 실제 도착한 ${totalActualQty.toLocaleString()}box가 창고 현재고 및 [자재수불부]에 즉시 등록되었습니다.\n`) +
          (diffQty > 0
            ? `• 미납된 ${diffQty}box는 '미입고 잔량'으로 기록되어 [발주현황/수정] 메뉴에서 부분입고 상태로 확인하실 수 있습니다.`
            : `• 전량 정상 입고 처리되었습니다.`)
      );

      await Promise.all([loadInboundPending(), loadConfirmedPo()]);
    } catch (err: any) {
      if (completedBatches > 0) {
        await Promise.all([loadInboundPending(), loadConfirmedPo()]);
      }
      alert('입고 처리 중 오류: ' + (err?.message || err));
    } finally {
      setIsReceivingSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-100/80 text-slate-800 p-2 sm:p-3 overflow-hidden gap-2 select-none font-sans">
      {/* ── 1. 프리미엄 상단 커맨드 헤더 ── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl border border-slate-700/80 px-4 py-2.5 shadow-sm shrink-0 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-200 border border-blue-400/30 text-[11px] font-black tracking-wide whitespace-nowrap">
              자재 관제탑
            </span>
            <h1 className="text-base sm:text-[17px] font-black text-white tracking-tight flex items-center gap-1.5 whitespace-nowrap">
              요일별 자재발주
              <span className="hidden md:inline-flex items-center gap-1 ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/25 text-indigo-200 border border-indigo-400/30">
                ⚡ 수주 × BOM 실시간
              </span>
            </h1>
          </div>

          {/* 2개 메인 모드 탭 (발주 vs 입고검수) */}
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-white/10 text-[13px]">
            <button
              type="button"
              onClick={() => setMainMode('order')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
                mainMode === 'order'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>① 오늘 발주</span>
              <span
                className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  mainMode === 'order' ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300'
                }`}
              >
                {dayRows.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMainMode('inbound')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
                mainMode === 'inbound'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>② 입고 검수</span>
              <span
                className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  mainMode === 'inbound' ? 'bg-white/20 text-white' : 'bg-emerald-500/25 text-emerald-200'
                }`}
              >
                {inboundItems.length}
              </span>
            </button>
          </div>

          {confirmedPoList.length > 0 ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-black bg-emerald-500/20 text-emerald-200 border border-emerald-400/35 whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
              {DAY_CHARS[dayIdx]}요일 확정 {confirmedPoList.length}건 ({poRangeSummary})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 text-amber-300" />
              {DAY_CHARS[dayIdx]}요일 미확정
            </span>
          )}
        </div>

        {/* 우측 상단 액션 버튼 모음 */}
        <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
          {mainMode === 'order' ? (
            <>
              <button
                type="button"
                onClick={handleSaveDay}
                disabled={isSaving || (stagedTotals.count === 0 && dayTotals.boxes <= 0)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[13px] font-black shadow-sm transition cursor-pointer whitespace-nowrap ${
                  stagedTotals.count > 0 || dayTotals.boxes > 0
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-98'
                    : confirmedPoList.length > 0
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 cursor-not-allowed'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
                title={
                  stagedTotals.count > 0
                    ? '발주 바구니에 담아둔 모든 품목을 납품일·거래처별 ERP 정식 발주서(PO)로 일괄 생성합니다.'
                    : dayTotals.boxes > 0
                    ? '담긴 품목이 없으면 확인 후 현재 요일 추천 품목을 일괄 발주 생성합니다.'
                    : confirmedPoList.length > 0
                    ? `${DAY_CHARS[dayIdx]}요일 추천 발주가 모두 확정 완료되었습니다. 추가 발주가 필요하면 '+ ' 버튼으로 수동 입력하세요.`
                    : '발주할 수량이 없습니다.'
                }
              >
                {stagedTotals.count === 0 && dayTotals.boxes <= 0 && confirmedPoList.length > 0 ? (
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5] text-emerald-300" />
                ) : (
                  <Save className="w-4 h-4 stroke-[2.5]" />
                )}
                <span>
                  {isSaving
                    ? '확정 저장 중...'
                    : stagedTotals.count > 0
                    ? `담은 발주 ${stagedTotals.count}건 (${stagedTotals.boxes.toLocaleString()}b) 확정`
                    : dayTotals.boxes > 0
                    ? `${DAY_CHARS[dayIdx]}요일 발주 확정`
                    : confirmedPoList.length > 0
                    ? `${DAY_CHARS[dayIdx]}요일 발주 완료`
                    : `${DAY_CHARS[dayIdx]}요일 발주 0건`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowBasketModal(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  stagedTotals.count > 0
                    ? 'bg-blue-500 hover:bg-blue-400 border-blue-400 text-white shadow-xs'
                    : 'bg-white/10 hover:bg-white/15 border-white/15 text-slate-200'
                }`}
                title="검색·거래처·요일별로 담아둔 발주 목록을 한눈에 확인하고 수량을 최종 검토합니다."
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>바구니</span>
                <span
                  className={`px-1.5 py-[1px] rounded-full text-[11px] font-mono font-bold ${
                    stagedTotals.count > 0 ? 'bg-white text-blue-700' : 'bg-white/15 text-slate-200'
                  }`}
                >
                  {stagedTotals.count}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDormantSelectedIds(new Set());
                  setShowDormantModal(true);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  dormantRows.length > 0
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/40 text-amber-200'
                    : 'bg-white/10 hover:bg-white/15 border-white/15 text-slate-200'
                }`}
                title={`최근 ${dormantDays}일간 수주 BOM 소요도 없고 재고조사표 수량 감소도 없는 휴면 품목을 확인하고 발주제외로 정리합니다.`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>비수주 휴면</span>
                {dormantRows.length > 0 && (
                  <span className="px-1.5 py-[1px] rounded-full bg-amber-400 text-slate-950 text-[11px] font-mono font-black">
                    {dormantRows.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeletedModal(true);
                  void loadDeletedProducts();
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  deletedCount > 0
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/40 text-rose-200'
                    : 'bg-white/10 hover:bg-white/15 border-white/15 text-slate-200'
                }`}
                title="발주/재고조회에서 삭제·제외된 품목 목록을 확인하고 복구합니다."
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>복구함</span>
                {deletedCount > 0 && (
                  <span className="px-1.5 py-[1px] rounded-full bg-rose-500 text-white text-[11px] font-mono font-bold">
                    {deletedCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-100 text-xs font-black transition cursor-pointer whitespace-nowrap"
                title="엑셀 다운로드"
              >
                <Download className="w-3.5 h-3.5 text-emerald-300" />
                <span>엑셀</span>
              </button>
              <button
                type="button"
                onClick={handleResetDay}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 text-xs font-black transition cursor-pointer whitespace-nowrap"
                title="수기 수정/바구니 초기화"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-300" />
                <span>초기화</span>
              </button>
              <button
                type="button"
                onClick={loadOrderSheet}
                disabled={isLoading}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-100 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                title="새로고침"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-300 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleConfirmInboundReceiving}
                disabled={isReceivingSaving || filteredInboundItems.length === 0}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[13px] font-black shadow-sm transition cursor-pointer whitespace-nowrap ${
                  filteredInboundItems.length > 0
                    ? inboundSkipStock
                      ? 'bg-indigo-500 hover:bg-indigo-400 text-white active:scale-98'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-98'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
                title={
                  inboundSkipStock
                    ? `${inboundReceivingDate} 입고 이력·발주잔량만 확정합니다 (실사 반영됨 — 현재고 가산 제외).`
                    : `${inboundReceivingDate} 기준으로 실제 도착한 수량을 창고 현재고와 자재수불부에 즉시 반영합니다.`
                }
              >
                <Truck className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {isReceivingSaving
                    ? '반영 중...'
                    : inboundSkipStock
                      ? `📦 ${inboundReceivingDate.slice(5)} 입고확정 (재고가산 제외)`
                      : `🚚 ${inboundReceivingDate.slice(5)} 검수완료 & 재고반영`}
                </span>
              </button>
              <button
                type="button"
                onClick={handleFillAllOrderQty}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-100 text-xs font-black transition cursor-pointer whitespace-nowrap"
                title="오기로 한 발주수량 그대로 전량 정상 채우기"
              >
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>전량 정상</span>
              </button>
              <button
                type="button"
                onClick={loadInboundPending}
                disabled={isLoadingInbound}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-100 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                title="새로고침"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-emerald-300 ${isLoadingInbound ? 'animate-spin' : ''}`}
                />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 2단: 주간/요일 카드 네비게이션 + 전략·수요 인사이트 ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 px-3 py-2 shadow-2xs shrink-0 flex flex-wrap items-center justify-between gap-2">
        {mainMode === 'order' ? (
          <>
            {/* 좌측: 주간 이동 + 7개 요일 세그먼트 카드 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs whitespace-nowrap">
                <button
                  type="button"
                  onClick={handlePrevWeek}
                  className="p-1 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition cursor-pointer"
                  title="이전 주차"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 px-2 text-[12.5px] font-black text-slate-800 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>{weekRangeText}</span>
                </div>
                <button
                  type="button"
                  onClick={handleNextWeek}
                  className="p-1 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition cursor-pointer"
                  title="다음 주차"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleJumpToCurrentWeek}
                  className="px-2 py-0.5 text-[11px] font-black rounded-lg bg-white text-blue-700 hover:bg-blue-50 border border-slate-200 transition cursor-pointer whitespace-nowrap ml-0.5"
                >
                  이번주
                </button>
              </div>

              {/* 7개 요일 탭 버튼 (깔끔한 2줄 칩) */}
              <div className="flex flex-wrap items-center gap-1">
                {DAY_CHARS.map((d, i) => {
                  const isActive = dayIdx === i;
                  const st = dayStats[i];
                  const dateStr = weekDates[i];
                  const mmdd = dateStr ? dateStr.slice(5).replace('-', '/') : '';
                      const factorInfo = WEEKDAY_DEMAND_FACTORS[i];
                      const stagedInfo = dateStr ? stagedCountByDate[dateStr] : undefined;
                      const dayConfirmedCount = dateStr ? weekPoCountByDate.get(dateStr) || 0 : 0;
                      const isDayCompleted = st.boxes === 0 && dayConfirmedCount > 0;

                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDayIdx(i)}
                          title={`[${d}요일 ${dateStr}] 수요 가중치: ${factorInfo?.pctStr} (${factorInfo?.label})${
                            dayConfirmedCount > 0 ? ` · 확정전표 ${dayConfirmedCount}건` : ''
                          }`}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[12.5px] transition cursor-pointer border whitespace-nowrap ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm font-black ring-2 ring-blue-500/25'
                              : isDayCompleted
                              ? 'bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-900 border-emerald-200 font-bold'
                              : 'bg-slate-50/80 hover:bg-slate-100 text-slate-700 border-slate-200 font-bold'
                          }`}
                        >
                          <span className="font-black">{d}</span>
                          <span className={`text-[11px] font-medium ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                            {mmdd}
                          </span>
                          <span
                            className={`text-[11px] font-mono px-1.5 py-0.2 rounded-md font-extrabold ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : isDayCompleted
                                ? 'bg-emerald-600 text-white font-sans'
                                : st.boxes > 0
                                ? 'bg-blue-100/80 text-blue-800'
                                : 'bg-slate-200/70 text-slate-500'
                            }`}
                          >
                            {isDayCompleted ? '✓ 완료' : st.boxes > 0 ? `${st.boxes}b` : '0'}
                          </span>
                      {stagedInfo && stagedInfo.count > 0 && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-black ${
                            isActive ? 'bg-amber-300 text-slate-950' : 'bg-emerald-600 text-white'
                          }`}
                          title={`${d}요일 바구니 담김: ${stagedInfo.count}품목 (${stagedInfo.boxes}박스)`}
                        >
                          담{stagedInfo.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 우측: 수요 가중치 인사이트 칩 + 3-tier 전략 스위치 */}
            <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
              {WEEKDAY_DEMAND_FACTORS[dayIdx] && (
                <div
                  className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11.5px] font-bold ${
                    WEEKDAY_DEMAND_FACTORS[dayIdx].tone === 'peak'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : WEEKDAY_DEMAND_FACTORS[dayIdx].tone === 'low'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-blue-50 border-blue-200 text-blue-900'
                  }`}
                  title={`GS25 35일간 실데이터(188만 개) 전수 통계 기반: ${DAY_CHARS[dayIdx]}요일 수요 가중치 ${WEEKDAY_DEMAND_FACTORS[dayIdx].pctStr} (${WEEKDAY_DEMAND_FACTORS[dayIdx].label}) 자동 적용`}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>{DAY_CHARS[dayIdx]} 수요</span>
                  <span className="font-mono font-black">{WEEKDAY_DEMAND_FACTORS[dayIdx].pctStr}</span>
                  <span className="text-[11px] opacity-80">({WEEKDAY_DEMAND_FACTORS[dayIdx].label})</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 whitespace-nowrap">
                  <span className="text-[11.5px] font-black text-slate-600 px-1.5 flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3 text-blue-600" />
                    전략
                  </span>
                  {(
                    [
                      {
                        mode: 'tight' as const,
                        label: '⚡ 타이트',
                        activeClass: 'bg-amber-500 text-white shadow-2xs',
                        subActiveClass: 'text-amber-100',
                        title: `⚡ 타이트 모드 (${DAY_CHARS[dayIdx]}요일 자동기준: ${strategyPreview.tight.boxes.toLocaleString()}b / ₩${strategyPreview.tight.amt.toLocaleString()})`,
                        info: strategyPreview.tight,
                      },
                      {
                        mode: 'standard' as const,
                        label: '⚖️ 표준',
                        activeClass: 'bg-blue-600 text-white shadow-2xs',
                        subActiveClass: 'text-blue-100',
                        title: `⚖️ 표준 모드 (${DAY_CHARS[dayIdx]}요일 자동기준: ${strategyPreview.standard.boxes.toLocaleString()}b / ₩${strategyPreview.standard.amt.toLocaleString()})`,
                        info: strategyPreview.standard,
                      },
                      {
                        mode: 'safety' as const,
                        label: '🛡️ 안전',
                        activeClass: 'bg-emerald-600 text-white shadow-2xs',
                        subActiveClass: 'text-emerald-100',
                        title: `🛡️ 보수적 안전 모드 (${DAY_CHARS[dayIdx]}요일 자동기준: ${strategyPreview.safety.boxes.toLocaleString()}b / ₩${strategyPreview.safety.amt.toLocaleString()})`,
                        info: strategyPreview.safety,
                      },
                    ] as const
                  ).map((item) => {
                    const active = strategyMode === item.mode;
                    return (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => handleSelectStrategyMode(item.mode)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black transition cursor-pointer ${
                          active ? item.activeClass : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                        }`}
                        title={item.title}
                      >
                        <span>{item.label}</span>
                        <span
                          className={`text-[10.5px] font-mono font-bold ${
                            active ? item.subActiveClass : 'text-slate-400'
                          }`}
                        >
                          {formatCompactWon(item.info.amt)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {dayTotals.manualOverrideCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleResetDay}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-black transition cursor-pointer"
                    title="수량 직접 수정(+/-)이 걸린 품목은 전략 변경 시에도 고정됩니다. 클릭 시 해제하고 현재 전략 수량으로 돌아갑니다."
                  >
                    <span>고정 {dayTotals.manualOverrideCount}건 · 해제</span>
                  </button>
                ) : confirmedPoList.length > 0 &&
                  strategyPreview.tight.boxes === 0 &&
                  strategyPreview.standard.boxes === 0 &&
                  strategyPreview.safety.boxes === 0 ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold"
                    title="오늘 요일은 이미 발주 확정되어 모든 전략이 ₩0입니다. 위 요일 탭에서 미확정 요일(금·토)을 선택하면 전략별 차이를 비교할 수 있습니다."
                  >
                    당일확정 완료 · 금/토 탭 비교
                  </span>
                ) : confirmedPoList.length > 0 &&
                  strategyPreview.tight.boxes === 0 &&
                  strategyPreview.standard.boxes === 0 &&
                  strategyPreview.safety.boxes > 0 ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold"
                    title={`타이트·표준 발주는 이미 확정 완료되었고, 안전 모드 선택 시 추가 가능 ${strategyPreview.safety.count}건이 있습니다. 미확정 요일(금·토) 탭에서도 전략별 차이를 비교할 수 있습니다.`}
                  >
                    표준 확정완료 · 안전 +{strategyPreview.safety.count}건
                  </span>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          /* 입고 검수 모드 서브 바 */
          <>
            <div className="flex flex-wrap items-center gap-3 whitespace-nowrap">
              {/* 입고처리 일자 선택 (오늘/어제 빠른 버튼 + 날짜 선택기) */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-[13px] font-black text-slate-700 whitespace-nowrap">
                  입고처리 일자:
                </span>
                <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setInboundReceivingDate(addDaysYmd(kstToday(), -1))}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${
                      inboundReceivingDate === addDaysYmd(kstToday(), -1)
                        ? 'bg-amber-500 text-white font-black shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                    }`}
                    title="어제 날짜로 소급 입고 처리"
                  >
                    어제
                  </button>
                  <button
                    type="button"
                    onClick={() => setInboundReceivingDate(kstToday())}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${
                      inboundReceivingDate === kstToday()
                        ? 'bg-emerald-600 text-white font-black shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                    }`}
                    title="오늘 날짜로 당일 입고 처리"
                  >
                    오늘
                  </button>
                </div>
                <input
                  type="date"
                  value={inboundReceivingDate}
                  onChange={(e) => {
                    if (e.target.value) setInboundReceivingDate(e.target.value);
                  }}
                  className={`border rounded-lg px-2 py-0.5 text-xs font-mono font-bold focus:outline-none focus:ring-1 ${
                    inboundReceivingDate !== kstToday()
                      ? 'bg-amber-50 border-amber-400 text-amber-900 focus:ring-amber-500'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:ring-emerald-500'
                  }`}
                />
                <span
                  className={`px-1.5 py-0.5 rounded text-[11px] font-black border ${
                    inboundReceivingDate !== kstToday()
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {getWeekdayCharYmd(inboundReceivingDate) || '-'}요일
                  {inboundReceivingDate !== kstToday() ? ' · 지정일' : ' · 당일'}
                </span>
              </div>

              <span className="text-slate-300 hidden sm:inline">|</span>

              {/* 실재고 가산 제외 옵션 (실사 재고조사표 반영 직후 중복 가산 방지) */}
              <label
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer select-none transition ${
                  inboundSkipStock
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
                title="체크 시 현재고(Inventory)에는 더하지 않고 입고 이력과 발주잔량(입고완료)만 확정합니다. 재고조사표 실사를 이미 업로드한 뒤 지난 입고를 마감할 때 사용하세요."
              >
                <input
                  type="checkbox"
                  checked={inboundSkipStock}
                  onChange={(e) => setInboundSkipStock(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                />
                <span>실재고 가산 제외 (이미 실사 반영됨)</span>
              </label>

              <span className="text-slate-300 hidden sm:inline">|</span>

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

      {/* ── 3단: 핵심 KPI 카드 & 창고 칩 & 스마트 필터 바 ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 px-3 py-2 shadow-2xs shrink-0 flex flex-col gap-2 text-xs">
        {mainMode === 'order' ? (
          <>
            {/* 상단: KPI 지표 & 창고 빠른 필터 칩 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {currentDayStaged.count > 0 ? (
                  <>
                    <div
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-600 text-white border border-blue-700 shadow-2xs whitespace-nowrap"
                      title={`체크 선택된 ${currentDayStaged.count}개 품목의 발주 예정총액 (추천 전체: ₩${Math.round(dayTotals.amt).toLocaleString()})`}
                    >
                      <span className="text-[11.5px] font-bold text-blue-100">선택 예정총액</span>
                      <span className="font-mono font-black text-[14px] text-white">
                        ₩{Math.round(currentDayStaged.amt).toLocaleString()}
                      </span>
                      <span className="text-[10.5px] font-mono font-bold text-blue-100/90 border-l border-blue-400/50 pl-1.5">
                        추천 {formatCompactWon(dayTotals.amt)}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 border border-blue-300 whitespace-nowrap"
                      title={`체크 선택된 ${currentDayStaged.count}건 / 총 ${dayRows.length}건`}
                    >
                      <span className="text-[11.5px] font-bold text-blue-700">선택박스</span>
                      <span className="font-mono font-black text-[14px] text-blue-950">
                        {currentDayStaged.boxes.toLocaleString()} box
                      </span>
                      <span className="text-[11px] font-bold text-blue-700">
                        ({currentDayStaged.count}/{dayRows.length}건)
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-50/70 border border-indigo-200/80 whitespace-nowrap"
                      title="체크한 품목이 없을 때는 현재 화면 추천 전체 합계를 표시합니다. 품목을 체크하면 선택 금액만 따로 집계됩니다."
                    >
                      <span className="text-[11.5px] font-bold text-indigo-700">추천 예정총액</span>
                      <span className="font-mono font-black text-[14px] text-indigo-950">
                        ₩{Math.round(dayTotals.amt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50/70 border border-blue-200/80 whitespace-nowrap">
                      <span className="text-[11.5px] font-bold text-blue-700">발주박스</span>
                      <span className="font-mono font-black text-[14px] text-blue-950">
                        {dayTotals.boxes.toLocaleString()} box
                      </span>
                      <span className="text-[11px] font-bold text-blue-600">({dayRows.length}건)</span>
                    </div>
                  </>
                )}
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50/70 border border-emerald-200/80 whitespace-nowrap">
                  <span className="text-[11.5px] font-bold text-emerald-700">평균 유지일</span>
                  <span className="font-mono font-black text-[14px] text-emerald-950">
                    {dayTotals.avgRunway.toFixed(1)}일
                  </span>
                </div>

                {/* 클릭 가능한 긴급/안전미달/기발주 필터 칩 */}
                <button
                  type="button"
                  onClick={() => setUrgencyFilter((prev) => (prev === 'critical' ? 'all' : 'critical'))}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-black transition cursor-pointer whitespace-nowrap ${
                    urgencyFilter === 'critical'
                      ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                      : 'bg-rose-50/80 hover:bg-rose-100 text-rose-700 border-rose-200'
                  }`}
                  title="클릭 시 결품초임박 품목만 모아봅니다"
                >
                  <span>🚨 임박</span>
                  <span className="font-mono">{dayTotals.criticalCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUrgencyFilter((prev) => (prev === 'warning' ? 'all' : 'warning'))}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-black transition cursor-pointer whitespace-nowrap ${
                    urgencyFilter === 'warning'
                      ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                      : 'bg-amber-50/80 hover:bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                  title="클릭 시 안전재고 미달 품목만 모아봅니다"
                >
                  <span>⚠️ 미달</span>
                  <span className="font-mono">{dayTotals.warningCount}</span>
                </button>
                {urgencyFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setUrgencyFilter('all')}
                    className="px-2 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                  >
                    전체해제
                  </button>
                )}

                {offScheduleUrgentItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOnlyUrgentUnallocated((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-xl border text-[11.5px] font-black cursor-pointer transition whitespace-nowrap ${
                      showOnlyUrgentUnallocated
                        ? 'bg-rose-600 text-white border-rose-700'
                        : 'bg-rose-100/80 text-rose-800 border-rose-300 hover:bg-rose-200'
                    }`}
                    title="오늘 납품 요일이 아닌 품목(예: 화목토/주말) 중 재고 1.5일 미만 부족 품목을 확인합니다."
                  >
                    {showOnlyUrgentUnallocated
                      ? `타요일 긴급 해제 (${offScheduleUrgentItems.length})`
                      : `⚡ 타요일 긴급부족 ${offScheduleUrgentItems.length}`}
                  </button>
                )}
                {dayTotals.zeroPriceCount > 0 && (
                  <span className="px-2.5 py-1 rounded-xl border bg-amber-50 text-amber-800 border-amber-200 text-[11.5px] font-bold whitespace-nowrap">
                    단가미등록 {dayTotals.zeroPriceCount}건
                  </span>
                )}
              </div>

              {/* 우측: 보관창고 빠른 칩 */}
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                {['전체', ...warehouseOptions].map((wh) => (
                  <button
                    key={wh}
                    type="button"
                    onClick={() => setWarehouseFilter(wh)}
                    className={`px-2.5 py-1 rounded-lg text-[11.5px] font-black transition cursor-pointer whitespace-nowrap ${
                      warehouseFilter === wh
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    }`}
                  >
                    {wh === '전체' ? '전체창고' : wh}
                  </button>
                ))}
              </div>
            </div>

            {/* 하단: 검색 · 거래처 · 패턴 · 표시범위 · 비수주휴면 · 정렬 · 발행전표 */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
              <div className="flex-1 min-w-[200px] max-w-[300px]">
                <div className="relative flex items-center w-full">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="품명 / 거래처 검색..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition-colors"
                  />
                  {keyword && (
                    <button
                      type="button"
                      onClick={() => setKeyword('')}
                      title="검색어 지우기"
                      aria-label="검색어 지우기"
                      className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {/* 거래처 필터 */}
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer whitespace-nowrap"
                >
                  <option value="전체">전체 거래처</option>
                  {suppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                {/* 납품패턴 필터 */}
                <select
                  value={patternFilter}
                  onChange={(e) => setPatternFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer whitespace-nowrap"
                  title="거래처 납품패턴별 필터"
                >
                  {['전체', '월수금', '화목토', '수금', '화금', '주5일', '매일', '기타'].map((pat) => (
                    <option key={pat} value={pat}>
                      {pat === '전체' ? '납품패턴: 전체' : `패턴: ${pat}`}
                    </option>
                  ))}
                </select>

                {/* 발주 대상만 보기 토글 */}
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlyUrgentUnallocated(false);
                    setShowOnlyOrderable((prev) => !prev);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border whitespace-nowrap ${
                    showOnlyOrderable && !showOnlyUrgentUnallocated
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                  title="발주량이 잡힌 품목만 보기 or 전체 품목 탐색하기"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>{showOnlyOrderable && !showOnlyUrgentUnallocated ? '발주대상만' : '전체품목'}</span>
                  <span
                    className={`text-[11px] font-mono px-1.5 rounded-full font-bold whitespace-nowrap ${
                      showOnlyOrderable && !showOnlyUrgentUnallocated ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                    }`}
                  >
                    {dayRows.length}
                  </span>
                </button>

                {/* 최근 N일 비수주·무변동(휴면) 자동 제외 컨트롤 */}
                <div className="flex items-center bg-amber-50/80 border border-amber-200 rounded-xl p-0.5 gap-0.5 whitespace-nowrap">
                  <select
                    value={dormantDays}
                    onChange={(e) => setDormantDays(Number(e.target.value))}
                    aria-label="비수주 휴면 판정 기준 일수"
                    title="최근 N일 동안 수주 BOM 소요도 없고 재고 감소도 없으면 발주 대상에서 자동 제외합니다."
                    className="bg-transparent px-1.5 py-1 text-[11.5px] font-black text-amber-900 focus:outline-none cursor-pointer"
                  >
                    <option value={10}>비수주 10일</option>
                    <option value={14}>비수주 14일</option>
                    <option value={21}>비수주 21일</option>
                    <option value={30}>비수주 30일</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowDormant((prev) => !prev)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11.5px] font-black transition cursor-pointer ${
                      showDormant
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-100'
                    }`}
                    title={
                      showDormant
                        ? `최근 ${dormantDays}일 비수주·무변동 품목(${dormantRows.length}건)을 함께 표시 중입니다. 클릭 시 다시 숨깁니다.`
                        : `최근 ${dormantDays}일 비수주·무변동 품목 ${dormantRows.length}건을 발주 목록에서 자동 제외(일사용량 0 차단) 중입니다. 클릭 시 확인합니다.`
                    }
                  >
                    <span>{showDormant ? '휴면 포함' : '휴면 제외중'}</span>
                    <span
                      className={`font-mono text-[10.5px] px-1 rounded-full ${
                        showDormant ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {dormantRows.length}
                    </span>
                  </button>
                </div>

                {/* 정렬 모드 전환 (긴급도순 vs 창고·품목순) */}
                <button
                  type="button"
                  onClick={() => setSortMode((prev) => (prev === 'urgency' ? 'default' : 'urgency'))}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border whitespace-nowrap ${
                    sortMode === 'urgency'
                      ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                  title="긴급 품목(결품초임박/안전미달)을 테이블 맨 위에 우선 배치합니다."
                >
                  {sortMode === 'urgency' ? '🚨 긴급순' : '창고·품목순'}
                </button>

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

            {/* 중앙: 품명 / 거래처 / 발주번호 검색창 */}
            <CenteredKeywordSearch
              value={keyword}
              onChange={setKeyword}
              placeholder="품명 / 거래처 / 발주번호..."
            />

            <div className="flex flex-wrap items-center gap-2">
              {/* 발주일 필터 */}
              <select
                value={inboundOrderDateFilter}
                onChange={(e) => setInboundOrderDateFilter(e.target.value)}
                className={`border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${
                  inboundOrderDateFilter !== 'ALL'
                    ? 'bg-blue-50 border-blue-400 text-blue-900'
                    : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
                title="발주일 기준 필터"
              >
                <option value="ALL">발주일: 전체</option>
                {inboundOrderDateOptions.map((opt) => (
                  <option key={opt.date} value={opt.date}>
                    발주 {opt.date.slice(5)}({getWeekdayCharYmd(opt.date)}) · {opt.count}
                  </option>
                ))}
              </select>

              {/* 입고예정일 필터 */}
              <select
                value={inboundExpectedDateFilter}
                onChange={(e) => setInboundExpectedDateFilter(e.target.value)}
                className={`border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer ${
                  inboundExpectedDateFilter !== 'ALL'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                    : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
                title="입고예정일(리드타임 D+N 기준) 필터"
              >
                <option value="ALL">입고예정: 전체</option>
                {inboundExpectedDateOptions.map((opt) => (
                  <option key={opt.date} value={opt.date}>
                    예정 {opt.date.slice(5)}({getWeekdayCharYmd(opt.date)}) · {opt.count}
                  </option>
                ))}
              </select>

              {/* 거래처 필터 */}
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="전체">전체 거래처</option>
                {inboundSuppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {(inboundOrderDateFilter !== 'ALL' ||
                inboundExpectedDateFilter !== 'ALL' ||
                supplierFilter !== '전체' ||
                keyword.trim() !== '' ||
                inboundStatusFilter !== '전체') && (
                <button
                  type="button"
                  onClick={() => {
                    setInboundOrderDateFilter('ALL');
                    setInboundExpectedDateFilter('ALL');
                    setSupplierFilter('전체');
                    setKeyword('');
                    setInboundStatusFilter('전체');
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[11px] font-bold text-slate-700 cursor-pointer"
                  title="적용된 입고 필터 모두 초기화"
                >
                  필터 해제
                </button>
              )}

              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded border border-slate-200 text-[11px]">
                {filteredInboundItems.length === inboundItems.length
                  ? `${filteredInboundItems.length}개 입고 대기`
                  : `${filteredInboundItems.length} / ${inboundItems.length}개 표시`}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── 방금 삭제한 품목 즉시 되돌리기(Undo) 알림 배너 ── */}
      {mainMode === 'order' && recentDeletedNotice && (
        <div className="bg-slate-900 text-white px-4 py-2 rounded-xl shadow-sm shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs border border-slate-700">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong className="font-black text-rose-200">[{recentDeletedNotice.name}]</strong>
              {recentDeletedNotice.partner ? ` (${recentDeletedNotice.partner})` : ''} 품목이{' '}
              <strong className="text-white">발주 화면과 재고조회 목록에서 삭제</strong>되었습니다.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={restoringId !== null}
              onClick={() => void handleRestoreProducts([recentDeletedNotice.id])}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black cursor-pointer transition disabled:opacity-50"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>
                {restoringId === recentDeletedNotice.id ? '복구 중...' : '방금 삭제 되돌리기(복구)'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRecentDeletedNotice(null)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="알림 닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── 4. 메인 데이터 테이블 (발주 테이블 or 입고 검수 테이블) ── */}
      <div className="flex-1 min-h-[420px] min-w-0 bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs flex flex-col">
        {mainMode === 'order' ? (
          /* ──────── ① 오늘 발주할 양 테이블 ──────── */
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {isLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-16 gap-3 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                <div className="text-sm font-bold text-slate-600">
                  자재발주(요일별) 최신 발주 데이터를 불러오고 있습니다...
                </div>
              </div>
            ) : (
              <table className="w-full table-fixed text-left border-collapse">
                <colgroup>
                  <col className="w-[2.7%]" />
                  <col className="w-[2.5%]" />
                  <col className="w-[8%]" />
                  <col className="w-[21.5%]" />
                  <col className="w-[5.5%]" />
                  <col className="w-[8%]" />
                  <col className="w-[6%]" />
                  <col className="w-[7.5%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[7.5%]" />
                  <col className="w-[8%]" />
                  <col className="w-[4.8%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 text-[12.5px] 2xl:text-[13.5px] font-black border-b border-slate-300 tracking-tight select-none">
                  <tr>
                    <th className="py-2.5 px-1 text-center">
                      <input
                        type="checkbox"
                        checked={isAllVisibleStaged}
                        disabled={visibleStageableRows.length === 0}
                        onChange={handleToggleAllVisibleStage}
                        className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          visibleStageableRows.length === 0
                            ? '현재 화면에 담을 수 있는 발주 수량 품목이 없습니다.'
                            : isAllVisibleStaged
                            ? `현재 화면 발주가능 품목 (${visibleStageableRows.length}건) 바구니에서 모두 빼기`
                            : `현재 화면 발주가능 품목 (${visibleStageableRows.length}건) 모두 바구니에 담기`
                        }
                        aria-label="현재 화면 품목 전체 발주 담기"
                      />
                    </th>
                    <th className="py-2.5 px-1 text-center">No</th>
                    <th className="py-2.5 px-1.5">거래처</th>
                    <th className="py-2.5 px-2">품목명</th>
                    <th className="py-2.5 px-0.5 text-center">
                      패턴·창고
                      <span className="block text-[10.5px] 2xl:text-[11px] text-slate-500 font-bold leading-tight">납품·보관</span>
                    </th>
                    <th className="py-2.5 px-1.5 text-right bg-slate-50 text-slate-800">
                      가용재고
                      <span className="block text-[10.5px] 2xl:text-[11px] text-slate-500 font-bold leading-tight">실+입고</span>
                    </th>
                    <th className="py-2.5 px-1.5 text-right">
                      일소진
                      <span className="block text-[10.5px] 2xl:text-[11px] text-slate-500 font-bold leading-tight">봉/일</span>
                    </th>
                    <th className="py-2.5 px-1 text-center bg-blue-50/70 text-blue-950 font-black border-x border-blue-100">
                      유지일
                      <span className="block text-[10.5px] 2xl:text-[11px] text-blue-700 font-bold leading-tight">Runway</span>
                    </th>
                    <th className="py-2.5 px-1 text-center">
                      발주일수
                      <span className="block text-[10.5px] 2xl:text-[11px] text-slate-500 font-bold leading-tight">기준·필요</span>
                    </th>
                    <th className="py-2.5 px-1.5 text-right bg-amber-50/70 text-amber-950 border-x border-amber-200">
                      {DAY_CHARS[dayIdx]}요일 발주(✏️)
                      <span className="block text-[10.5px] 2xl:text-[11px] text-amber-800 font-bold leading-tight">추천·확정</span>
                    </th>
                    <th className="py-2.5 px-1.5 text-right">
                      단가·입수
                      <span className="block text-[10.5px] 2xl:text-[11px] text-slate-500 font-bold leading-tight">봉 / 박스</span>
                    </th>
                    <th className="py-2.5 px-1.5 text-right font-black">발주금액</th>
                    <th className="py-2.5 px-0.5 text-center">
                      관리
                      <span className="block text-[10px] 2xl:text-[10.5px] text-slate-500 font-bold leading-tight">근거·삭제</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13.5px] 2xl:text-[14.5px]">
                  {dayRows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-20 text-center">
                        <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                          {confirmedPoList.length > 0 &&
                          supplierFilter === '전체' &&
                          warehouseFilter === '전체' &&
                          patternFilter === '전체' &&
                          urgencyFilter === 'all' &&
                          !showOnlyUrgentUnallocated &&
                          !keyword.trim() ? (
                            <>
                              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                              <div className="text-[16px] font-black text-emerald-900">
                                {DAY_CHARS[dayIdx]}요일({currentDayDate}) 발주 확정 완료!
                              </div>
                              <p className="text-[13px] text-slate-600 leading-relaxed">
                                오늘 발행된 발주서 <strong className="text-emerald-700">{confirmedPoList.length}건</strong> (총{' '}
                                <strong className="font-mono text-slate-900">
                                  ₩{Math.round(totalConfirmedPoAmount).toLocaleString()}
                                </strong>
                                원) 처리가 끝났습니다. 추가 필요 잔량은 내일 이후 요일에 자동 배분됩니다.
                              </p>
                            </>
                          ) : (
                            <>
                              <Package className="w-12 h-12 text-slate-300" />
                              <div className="text-[15px] font-black text-slate-700">
                                {DAY_CHARS[dayIdx]}요일({currentDayDate})에 예정된 발주 품목이 없습니다.
                              </div>
                              <p className="text-[13px] text-slate-500">
                                거래처별 납품 요일 패턴상 오늘은 납품이 없거나, 다른 요일로 배정되어 있습니다. 상단의 다른 요일 탭을 확인하시거나 [전체 품목 보기]를 선택해 보세요.
                              </p>
                            </>
                          )}
                          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                            {confirmedPoList.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setShowPoDrawer(true)}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
                              >
                                발행 전표 {confirmedPoList.length}건 확인
                              </button>
                            )}
                            {(warehouseFilter !== '전체' || urgencyFilter !== 'all') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setWarehouseFilter('전체');
                                  setUrgencyFilter('all');
                                }}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
                              >
                                창고·긴급 필터 초기화
                              </button>
                            )}
                            {showOnlyOrderable && (
                              <button
                                type="button"
                                onClick={() => setShowOnlyOrderable(false)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
                              >
                                전체 품목 ({rows.length}개) 재고·유지일 보기
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    dayRows.map(({ r, m, pattern }, idx) => {
                      const isBriefingOpen = activeBriefingId === r.id;
                      const stagedEntry = stagedOrders[makeStagedKey(currentDayDate, r.id)];
                      const isRowStaged = Boolean(stagedEntry && stagedEntry.qty > 0);
                      return (
                        <tr
                          key={r.id}
                          className={`transition-colors relative border-l-4 ${
                            isRowStaged
                              ? 'border-l-blue-500 bg-blue-50/70 hover:bg-blue-100/60'
                              : m.stockDays < 1.5 && m.dailyUsage > 0
                              ? 'border-l-rose-500 bg-rose-50/25 hover:bg-rose-50/50'
                              : m.stockDays < 3 && m.dailyUsage > 0
                              ? 'border-l-amber-400 bg-white hover:bg-amber-50/30'
                              : (r.pendingBoxes || 0) > 0
                              ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                              : idx % 2 === 0
                              ? 'border-l-transparent bg-white hover:bg-blue-50/40'
                              : 'border-l-transparent bg-slate-50/40 hover:bg-blue-50/40'
                          }`}
                        >
                          {/* 발주 담기 체크박스 */}
                          <td className="py-2 px-1 text-center">
                            <input
                              type="checkbox"
                              checked={isRowStaged}
                              disabled={m.isPastScheduledDeletion}
                              onChange={() => handleToggleStageRow(r, m)}
                              className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                              title={
                                m.isPastScheduledDeletion
                                  ? '삭제예정일 도래 품목은 발주 담기에서 제외됩니다.'
                                  : isRowStaged
                                  ? '발주 바구니에서 제외'
                                  : '발주 바구니에 담기'
                              }
                              aria-label={`${r.name} 발주 담기`}
                            />
                          </td>

                          {/* No */}
                          <td className="py-2 px-1 text-center text-slate-400 font-mono text-[12.5px] 2xl:text-[13px]">
                            {idx + 1}
                          </td>

                          {/* 거래처명 */}
                          <td className="py-2 px-1">
                            <div
                              className="text-[12.5px] 2xl:text-[13.5px] font-black text-slate-800 tracking-tight truncate"
                              title={r.supplier}
                            >
                              {r.supplier}
                            </div>
                          </td>

                          {/* 품목명 */}
                          <td className="py-2 px-1.5 font-bold text-slate-900 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-1 min-w-0 w-full">
                              <span
                                className="text-[13.5px] 2xl:text-[14.5px] font-bold tracking-tight leading-tight truncate min-w-0"
                                title={r.name}
                              >
                                {r.name}
                              </span>
                              <span className="shrink-0 flex items-center gap-0.5">
                                <ProductLifecycleBadge
                                  status={r.status}
                                  discontinuedDate={r.discontinuedDate}
                                  name={r.name}
                                  refDate={currentDayDate || orderDate}
                                  compact
                                />
                                {m.cautionLabel && (
                                  <span className="inline-flex items-center gap-0.5 text-[10.5px] 2xl:text-[11px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 shadow-xs whitespace-nowrap">
                                    {m.cautionLabel}
                                  </span>
                                )}
                                {r.isDormant && (
                                  <span
                                    className={`inline-flex items-center gap-0.5 text-[10.5px] 2xl:text-[11px] font-black px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
                                      r.dormantTier === 'unlinked_dormant'
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : 'bg-slate-100 text-slate-700 border-slate-300'
                                    }`}
                                    title={`최근 ${dormantDays}일간 수주 BOM 소요 없음 (최근수주: ${
                                      r.lastBomOrderDate || '없음'
                                    } / 재고감소: ${r.lastSnapDecreaseDate || '없음'} / 활성BOM: ${
                                      r.activeBomCount ?? 0
                                    }개)`}
                                  >
                                    {r.dormantTier === 'unlinked_dormant' ? '미연결·휴면' : `비수주 ${dormantDays}일+`}
                                  </span>
                                )}
                              </span>
                            </div>
                          </td>

                          {/* 납품패턴 · 보관창고 */}
                          <td className="py-1.5 px-1 text-center">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded-full text-[11.5px] 2xl:text-[12px] font-black border leading-tight ${
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
                            {r.orderCycle && r.orderCycle !== pattern && (
                              <span
                                className="block text-[10.5px] font-bold text-slate-500 mt-0.5 truncate"
                                title={r.orderCycle}
                              >
                                {r.orderCycle}
                              </span>
                            )}
                            <span
                              className={`inline-block mt-0.5 px-1.5 py-[1px] rounded text-[11px] 2xl:text-[11.5px] font-black ${
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
                          <td
                            className="py-1.5 px-1.5 text-right bg-slate-50/70 font-mono"
                            title={`실재고 ${r.currentStock.toLocaleString()}봉 + 입고예정 ${r.incoming.toLocaleString()}봉${
                              (r.pendingBoxes || 0) > 0 ? ` (기발주 ${r.pendingBoxes}box 포함)` : ''
                            }`}
                          >
                            <div className="font-black text-slate-900 text-[13.5px] 2xl:text-[14.5px] tabular-nums leading-tight">
                              {m.totalStock.toLocaleString()}
                              <span className="text-[11.5px] text-slate-500 font-sans ml-0.5">봉</span>
                            </div>
                            <div className="text-[11px] 2xl:text-[11.5px] text-slate-500 font-sans font-medium truncate leading-tight mt-0.5">
                              재{r.currentStock.toLocaleString()}+입{r.incoming.toLocaleString()}
                              {(r.pendingBoxes || 0) > 0 && (
                                <span className="ml-0.5 text-emerald-700 font-bold">[기{r.pendingBoxes}]</span>
                              )}
                            </div>
                          </td>

                          {/* 일소진량 */}
                          <td className="py-1.5 px-1.5 text-right font-mono">
                            {m.dailyUsage > 0 ? (
                              <div className="flex flex-col items-end leading-tight">
                                <span className="font-extrabold text-slate-800 text-[13.5px] 2xl:text-[14.5px] tabular-nums">
                                  {m.dailyUsage.toLocaleString()}
                                  <span className="text-[11.5px] text-slate-500 font-sans ml-0.5">봉</span>
                                </span>
                                {r.isBomDriven && (
                                  <span
                                    className="mt-0.5 text-[10.5px] px-1 py-[1px] rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-sans font-bold tracking-tight"
                                    title={`오늘 GS25 수주 x 레시피 BOM 실시간 소요량: ${r.liveBomUsage?.toLocaleString()}봉/일 (엑셀 기준치: ${r.surveyDailyUsage?.toLocaleString()}봉/일)`}
                                  >
                                    BOM
                                  </span>
                                )}
                              </div>
                            ) : (r.suppressedSurveyDailyUsage || 0) > 0 ? (
                              <div
                                className="flex flex-col items-end leading-tight"
                                title={`최근 ${dormantDays}일 수주 BOM 소요와 재고 감소가 없어 과거 기준소진량(${r.suppressedSurveyDailyUsage}봉/일) 기반 자동발주를 차단했습니다.`}
                              >
                                <span className="text-slate-400 font-bold">0</span>
                                <span className="text-[10px] px-1 py-[1px] rounded bg-amber-50 text-amber-700 border border-amber-200 font-sans font-bold">
                                  휴면차단
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-bold">-</span>
                            )}
                          </td>

                          {/* 재고유지일 (Runway) */}
                          <td className="py-1.5 px-1 text-center bg-blue-50/30 border-x border-blue-100">
                            {m.isPastScheduledDeletion ? (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[11.5px] 2xl:text-[12px] font-black bg-rose-100 text-rose-800 border border-rose-300 leading-tight">
                                <span>🚫 삭제도래</span>
                                <span className="text-[10.5px] font-bold">발주제외</span>
                              </div>
                            ) : (r.pendingBoxes || 0) > 0 && m.suggestedBoxes === 0 ? (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[12px] 2xl:text-[12.5px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 leading-tight">
                                <span>✅ {m.stockDays.toFixed(1)}일</span>
                                <span className="text-[10.5px] font-bold">기발주 {r.pendingBoxes}b</span>
                              </div>
                            ) : m.auditStatus === 'critical' ? (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[12px] 2xl:text-[12.5px] font-black bg-rose-100 text-rose-700 border border-rose-300 animate-pulse leading-tight">
                                <span>🚨 {m.stockDays.toFixed(1)}일</span>
                                <span className="text-[10.5px] font-bold">임박</span>
                              </div>
                            ) : m.auditStatus === 'warning' ? (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[12px] 2xl:text-[12.5px] font-black bg-amber-100 text-amber-800 border border-amber-300 leading-tight">
                                <span>⚠️ {m.stockDays.toFixed(1)}일</span>
                                <span className="text-[10.5px] font-bold">미달</span>
                              </div>
                            ) : m.auditStatus === 'overstock' ? (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[12px] 2xl:text-[12.5px] font-black bg-slate-100 text-slate-600 border border-slate-300 leading-tight">
                                <span className="inline-flex items-center gap-0.5">
                                  <Lock className="w-3 h-3 text-slate-500" />
                                  {Math.round(m.stockDays)}일
                                </span>
                                <span className="text-[10.5px] font-bold">과잉</span>
                              </div>
                            ) : m.auditStatus === 'pending_overlap' ? (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[12px] 2xl:text-[12.5px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 leading-tight">
                                <span>📦 {m.stockDays.toFixed(1)}일</span>
                                <span className="text-[10.5px] font-bold">입고대기</span>
                              </div>
                            ) : (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[12px] 2xl:text-[12.5px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 leading-tight">
                                <span>✅ {m.stockDays.toFixed(1)}일</span>
                                <span className="text-[10.5px] font-bold">적정</span>
                              </div>
                            )}
                          </td>

                          {/* 발주일수 (마스터 기준 · ±0.5일 / 직접입력 / DB저장) */}
                          <td className="py-1.5 px-1 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleStepTargetDays(r.id, m.targetDays, -0.5, m.masterOrderDays)
                                }
                                className="w-[18px] h-[18px] 2xl:w-5 2xl:h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition cursor-pointer shrink-0"
                                title="발주일수 0.5일 축소"
                              >
                                <Minus size={10} />
                              </button>
                              {editingOrderDays?.id === r.id ? (
                                <input
                                  type="number"
                                  min={0}
                                  step="0.5"
                                  autoFocus
                                  value={editingOrderDays.value}
                                  onChange={(e) =>
                                    setEditingOrderDays({ id: r.id, value: e.target.value })
                                  }
                                  onBlur={() =>
                                    handleCommitOrderDaysInput(
                                      r.id,
                                      editingOrderDays.value,
                                      m.masterOrderDays
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleCommitOrderDaysInput(
                                        r.id,
                                        editingOrderDays.value,
                                        m.masterOrderDays
                                      );
                                    } else if (e.key === 'Escape') {
                                      setEditingOrderDays(null);
                                    }
                                  }}
                                  className="w-11 text-center px-0.5 py-0.5 text-[13px] font-mono font-black border border-blue-400 rounded bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingOrderDays({
                                      id: r.id,
                                      value: m.targetDays > 0 ? String(m.targetDays) : '0',
                                    })
                                  }
                                  className={`font-mono font-black text-[13px] 2xl:text-[14px] min-w-[30px] text-center px-0.5 rounded hover:bg-blue-50 transition cursor-pointer ${
                                    m.targetDays > 0 ? 'text-slate-800' : 'text-slate-400'
                                  }`}
                                  title="클릭하여 발주일수 직접 입력"
                                >
                                  {formatOrderDays(m.targetDays)}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  handleStepTargetDays(r.id, m.targetDays, 0.5, m.masterOrderDays)
                                }
                                className="w-[18px] h-[18px] 2xl:w-5 2xl:h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition cursor-pointer shrink-0"
                                title="발주일수 0.5일 가산"
                              >
                                <Plus size={10} />
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-0.5 mt-0.5 leading-tight">
                              <span className="text-[11px] 2xl:text-[11.5px] text-slate-500 font-mono font-bold">
                                {m.targetDays > 0 ? `목${m.targetStock.toLocaleString()}봉` : '미설정'}
                              </span>
                              {m.targetDays !== m.masterOrderDays && (
                                <span
                                  className="text-[10.5px] text-indigo-600 font-mono font-bold"
                                  title="품목 마스터(DB) 기준 발주일수"
                                >
                                  (기{formatOrderDays(m.masterOrderDays)})
                                </span>
                              )}
                              {itemTargetDaysOverrides[r.id] !== undefined &&
                                itemTargetDaysOverrides[r.id] !== m.masterOrderDays && (
                                  <button
                                    type="button"
                                    disabled={savingOrderDaysId === r.id}
                                    onClick={() => handleSaveOrderDays(r, m.targetDays)}
                                    className="px-1 py-[1px] rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-[10.5px] font-black transition cursor-pointer"
                                    title="수정한 발주일수를 품목 마스터(DB)에 영구 저장"
                                  >
                                    {savingOrderDaysId === r.id ? '저장중' : 'DB저장'}
                                  </button>
                                )}
                            </div>
                          </td>

                          {/* 요일 발주수량 (추천치 대비 확정) */}
                          <td className="py-1.5 px-1.5 text-right bg-amber-50/40 border-x border-amber-200">
                            <div className="flex flex-col items-end gap-0.5">
                              {m.isConfirmedOnTargetDay ? (
                                <span
                                  className="text-[11px] 2xl:text-[11.5px] font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-1.5 py-[1px] rounded-full font-sans leading-tight truncate max-w-full"
                                  title={`당일 확정 전표: ${m.confirmedTodayOrderNos.join(', ') || '전표발행완료'} (추가 필요 시 '+' 버튼으로 수동 입력)`}
                                >
                                  ✅ 금일확정 {m.confirmedTodayBoxes}b
                                </span>
                              ) : (r.pendingBoxes || 0) > 0 ? (
                                <span
                                  className="text-[11px] 2xl:text-[11.5px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-[1px] rounded-full font-sans leading-tight truncate max-w-full"
                                  title={`발주번호: ${(r.pendingOrderNos || []).join(', ') || '전표발행완료'}`}
                                >
                                  ✅ 기발주 {r.pendingBoxes}b
                                </span>
                              ) : m.week[dayIdx] > 0 ? (
                                <span className="text-[11px] 2xl:text-[11.5px] font-bold text-amber-800 bg-amber-100 px-1.5 py-[1px] rounded font-mono leading-tight">
                                  추천 {m.week[dayIdx]}b
                                </span>
                              ) : null}
                              <div className="inline-flex items-center justify-end bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs gap-0.5">
                                <button
                                  type="button"
                                  disabled={m.isPastScheduledDeletion || m.dayQty <= 0}
                                  onClick={() => handleDayQtyChange(r, m, String(Math.max(0, m.dayQty - 1)))}
                                  className="w-5 h-6 flex items-center justify-center rounded text-xs font-black text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                  title="1박스 감소"
                                  aria-label={`${r.name} 발주수량 1박스 감소`}
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  value={m.dayQty}
                                  disabled={m.isPastScheduledDeletion}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => handleDayQtyChange(r, m, e.target.value)}
                                  className={`w-10 xl:w-12 2xl:w-14 text-right px-1 py-0.5 bg-white border rounded text-[13.5px] 2xl:text-[14.5px] font-black font-mono focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${
                                    isRowStaged
                                      ? 'border-blue-500 ring-1 ring-blue-300 text-blue-950 focus:ring-blue-500'
                                      : (r.pendingBoxes || 0) > 0
                                      ? 'border-emerald-300 text-emerald-950 focus:ring-emerald-500'
                                      : 'border-amber-300 text-amber-950 focus:ring-amber-500'
                                  }`}
                                />
                                <button
                                  type="button"
                                  disabled={m.isPastScheduledDeletion}
                                  onClick={() => handleDayQtyChange(r, m, String(m.dayQty + 1))}
                                  className="w-5 h-6 flex items-center justify-center rounded text-xs font-black text-slate-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                  title="1박스 추가"
                                  aria-label={`${r.name} 발주수량 1박스 증가`}
                                >
                                  +
                                </button>
                                <span className="text-[11px] font-black text-amber-950 pr-1">b</span>
                              </div>
                            </div>
                          </td>

                          {/* 봉단가 / 박스단가 + 입수량 */}
                          <td
                            className="py-1.5 px-1.5 text-right font-mono text-slate-800 font-bold leading-tight"
                            title={`봉단가: ₩${r.bagPrice.toLocaleString()} / 입수: ${m.pack}봉 / 박스단가: ₩${calcBoxPrice(r.bagPrice, m.pack).toLocaleString()}`}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-[13px] 2xl:text-[14px] tabular-nums">
                                {r.bagPrice > 0 ? (
                                  `₩${r.bagPrice.toLocaleString()}`
                                ) : (
                                  <span className="text-[11.5px] font-sans text-amber-600">미등록</span>
                                )}
                              </span>
                              <span className="text-[10.5px] 2xl:text-[11px] font-sans font-bold px-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {m.pack > 0 ? `${m.pack}입` : '-'}
                              </span>
                            </div>
                            {r.bagPrice > 0 && m.pack > 0 && (
                              <div className="text-[11px] 2xl:text-[11.5px] font-medium text-slate-500 mt-0.5 tabular-nums">
                                박 ₩{calcBoxPrice(r.bagPrice, m.pack).toLocaleString()}
                              </div>
                            )}
                          </td>

                          {/* 발주금액 */}
                          <td
                            className={`py-2 px-1.5 text-right font-black font-mono text-[13.5px] 2xl:text-[14.5px] tabular-nums truncate ${
                              currentDayStaged.count > 0 && !isRowStaged
                                ? 'text-slate-400 line-through decoration-slate-300'
                                : isRowStaged
                                ? 'text-blue-950'
                                : 'text-slate-900'
                            }`}
                            title={
                              currentDayStaged.count > 0 && !isRowStaged
                                ? `미선택 제외됨 (추천금액: ₩${Math.round(m.amount).toLocaleString()})`
                                : `₩${Math.round(m.amount).toLocaleString()}`
                            }
                          >
                            ₩{Math.round(m.amount).toLocaleString()}
                          </td>

                          {/* 계산근거 팝오버 + 품목 삭제 버튼 */}
                          <td className="py-2 px-0.5 text-center relative">
                            <div className="inline-flex items-center justify-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => setActiveBriefingId(isBriefingOpen ? null : r.id)}
                                className={`px-1.5 py-0.5 rounded-md text-[12px] 2xl:text-[12.5px] font-black transition cursor-pointer border ${
                                  isBriefingOpen
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
                                }`}
                                title="클릭하여 4줄 정밀 계산 근거를 확인합니다."
                              >
                                💡
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRow(r)}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                                title={`[${r.name}] 발주 및 재고조회 목록에서 삭제`}
                                aria-label={`${r.name} 삭제`}
                              >
                                <Trash2 className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                              </button>
                            </div>

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
                                    <div className="font-bold text-slate-900">② 일소진량 및 발주일수</div>
                                    <div className="text-[11.5px] text-slate-600 font-mono mt-0.5">
                                      일평균 {m.dailyUsage.toLocaleString()}봉/일 × 발주 {formatOrderDays(m.targetDays)}
                                      {m.targetDays !== m.masterOrderDays && (
                                        <span className="text-indigo-600 font-bold">
                                          {' '}(기준 {formatOrderDays(m.masterOrderDays)}
                                          {strategyMode === 'tight' && m.minFloorDays > 0
                                            ? ` · 하한 ${formatOrderDays(m.minFloorDays)}`
                                            : ''}
                                          )
                                        </span>
                                      )}
                                      {m.targetDays > 0 && strategyMode === 'safety' && (
                                        <span className="text-emerald-700 font-bold"> (+5% 버퍼)</span>
                                      )}
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
                                        오늘({DAY_CHARS[dayIdx]}요일) 남은 납품일 가중 배정: <strong>{m.week[dayIdx]}박스</strong>
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {isLoadingInbound ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-16 gap-3 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                <div className="text-sm font-bold text-slate-600">
                  창고 입고 대기 목록을 불러오고 있습니다...
                </div>
              </div>
            ) : (
              <table className="w-full table-fixed text-left border-collapse">
                <colgroup>
                  <col className="w-[3%]" />
                  <col className="w-[2.5%]" />
                  <col className="w-[9.5%]" />
                  <col className="w-[7.5%]" />
                  <col className="w-[8.5%]" />
                  <col className="w-[22%]" />
                  <col className="w-[4.5%]" />
                  <col className="w-[6.5%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9.5%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9.5%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 text-[12.5px] 2xl:text-[13.5px] font-black border-b border-slate-300 tracking-tight select-none">
                  <tr>
                    <th className="py-2.5 px-1 text-center">
                      <input
                        type="checkbox"
                        checked={isAllInboundChecked}
                        onChange={(e) => handleToggleAllInbound(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 cursor-pointer accent-emerald-600"
                        title="전체 선택"
                      />
                    </th>
                    <th className="py-2.5 px-1 text-center">No</th>
                    <th className="py-2.5 px-1.5 text-center">
                      발주번호
                      <span className="block text-[10.5px] text-slate-500 font-bold leading-tight">발주일</span>
                    </th>
                    <th className="py-2.5 px-1 text-center">
                      입고예정
                      <span className="block text-[10.5px] text-slate-500 font-bold leading-tight">리드타임</span>
                    </th>
                    <th className="py-2.5 px-1.5">거래처</th>
                    <th className="py-2.5 px-2">품목명</th>
                    <th className="py-2.5 px-1 text-center">창고</th>
                    <th className="py-2.5 px-1.5 text-right bg-slate-200/60 font-black">
                      발주량
                      <span className="block text-[10.5px] 2xl:text-[11px] text-slate-500 font-bold leading-tight">예정</span>
                    </th>
                    <th className="py-2.5 px-1.5 text-right bg-emerald-50/70 text-emerald-900 border-x border-emerald-200">
                      실도착(✏️)
                      <span className="block text-[10.5px] 2xl:text-[11px] text-emerald-700 font-bold leading-tight">검수입력</span>
                    </th>
                    <th className="py-2.5 px-1 text-center">
                      판정 · 차이
                      <span className="block text-[10.5px] 2xl:text-[11px] text-slate-500 font-bold leading-tight">미납/상태</span>
                    </th>
                    <th className="py-2.5 px-1.5 text-right font-black">입고금액</th>
                    <th className="py-2.5 px-1.5">차량/검수메모</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13.5px] 2xl:text-[14.5px]">
                  {filteredInboundItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-20 text-center">
                        <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                          <Truck className="w-12 h-12 text-slate-300" />
                          <div className="text-[15px] font-black text-slate-700">
                            {inboundItems.length > 0
                              ? '현재 필터 조건에 맞는 입고 대기 품목이 없습니다.'
                              : '현재 입고 대기 중인 발주 물량이 없습니다.'}
                          </div>
                          <p className="text-[13px] text-slate-500">
                            {inboundItems.length > 0
                              ? `전체 ${inboundItems.length}건의 입고 대기 품목 중 발주일/입고예정일/거래처/검색어 필터에 해당하는 건이 없습니다.`
                              : '이미 모든 물량이 검수 완료되었거나, 아직 확정된 발주서가 없습니다. 상단 [오늘 발주 주문서] 탭에서 발주서를 먼저 생성해 주세요.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredInboundItems.map((item, idx) => {
                      const diff = item.orderQty - item.actualRecvQty;
                      const isShort = diff > 0;
                      const isZero = item.actualRecvQty === 0;
                      const actualAmount = Math.round(item.actualRecvQty * item.unitPrice);

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
                          <td className="py-2 px-1 text-center">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={(e) => handleInboundCheck(item.detailId, e.target.checked)}
                              className="w-4 h-4 rounded text-emerald-600 cursor-pointer accent-emerald-600"
                            />
                          </td>

                          {/* No */}
                          <td className="py-2 px-1 text-center text-slate-400 font-mono text-[12.5px] 2xl:text-[13px]">
                            {idx + 1}
                          </td>

                          {/* 발주번호 / 발주일 */}
                          <td className="py-2 px-1 text-center">
                            <span
                              className="inline-block max-w-full truncate px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11.5px] 2xl:text-[12px] font-bold border border-slate-200"
                              title={`${item.orderNo} (발주일: ${item.orderDate})`}
                            >
                              {item.orderNo}
                            </span>
                            <div className="text-[10.5px] text-slate-500 font-mono mt-0.5">
                              발주 {item.orderDate.slice(5)}({getWeekdayCharYmd(item.orderDate) || '-'})
                            </div>
                          </td>

                          {/* 입고예정일 (D+N) */}
                          <td className="py-2 px-1 text-center">
                            {item.expectedDeliveryDate ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-black border ${
                                    item.expectedDeliveryDate === inboundReceivingDate
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : item.expectedDeliveryDate < inboundReceivingDate
                                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                                        : 'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {item.expectedDeliveryDate.slice(5)}({getWeekdayCharYmd(item.expectedDeliveryDate) || '-'})
                                </span>
                                {(item.orderCycle || item.leadDays != null) && (
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {item.orderCycle || `D+${item.leadDays}`}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>

                          {/* 거래처명 */}
                          <td className="py-2 px-1">
                            <div
                              className="text-[12.5px] 2xl:text-[13.5px] font-black text-slate-800 tracking-tight truncate"
                              title={item.partnerName}
                            >
                              {item.partnerName}
                            </div>
                          </td>

                          {/* 품목명 */}
                          <td className="py-2 px-1.5 font-bold text-slate-900 min-w-0 overflow-hidden">
                            <div
                              className="text-[13.5px] 2xl:text-[14.5px] font-bold tracking-tight leading-tight truncate"
                              title={item.productName}
                            >
                              {item.productName}
                            </div>
                            {item.spec && (
                              <span className="block text-[11px] 2xl:text-[11.5px] font-medium text-slate-500 truncate mt-0.5">
                                {item.spec}
                              </span>
                            )}
                          </td>

                          {/* 보관창고 */}
                          <td className="py-2 px-1 text-center">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[11.5px] 2xl:text-[12px] font-bold border ${
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
                          <td className="py-2 px-1.5 text-right font-mono font-black text-[13.5px] 2xl:text-[14.5px] text-slate-800 bg-slate-100/50 tabular-nums">
                            {item.orderQty.toLocaleString()}{' '}
                            <span className="text-[11.5px] font-sans text-slate-500 font-normal">
                              {item.unit}
                            </span>
                          </td>

                          {/* 실제 도착 수량 (인라인 수정 인풋!) */}
                          <td className="py-1.5 px-1.5 text-right bg-emerald-50/60 border-x border-emerald-200">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min={0}
                                max={item.orderQty * 2}
                                value={item.actualRecvQty}
                                onChange={(e) =>
                                  handleInboundQtyChange(item.detailId, e.target.value)
                                }
                                className={`w-12 xl:w-14 2xl:w-16 text-right px-1.5 py-0.5 bg-white border rounded-md text-[14px] 2xl:text-[15px] font-black font-mono focus:outline-none focus:ring-2 shadow-2xs ${
                                  isShort
                                    ? 'border-rose-400 text-rose-700 focus:ring-rose-500'
                                    : 'border-emerald-300 text-emerald-900 focus:ring-emerald-500'
                                }`}
                              />
                              <span className="text-[11.5px] font-bold text-emerald-800 shrink-0">
                                {item.unit}
                              </span>
                            </div>
                          </td>

                          {/* 입고 검수 판정 · 미납/차이 */}
                          <td className="py-1.5 px-1 text-center">
                            {isZero ? (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[11.5px] 2xl:text-[12px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 leading-tight">
                                <span className="inline-flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3" />
                                  미입고/결품
                                </span>
                                <span className="text-[10.5px] 2xl:text-[11px] font-black text-rose-800">
                                  ▼ {item.orderQty} {item.unit}
                                </span>
                              </div>
                            ) : isShort ? (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[11.5px] 2xl:text-[12px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 leading-tight">
                                <span className="inline-flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" />
                                  부분입고
                                </span>
                                <span className="text-[10.5px] 2xl:text-[11px] font-black text-amber-900">
                                  ▼ {diff} {item.unit} 미납
                                </span>
                              </div>
                            ) : diff < 0 ? (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[11.5px] 2xl:text-[12px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 leading-tight">
                                <span className="inline-flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  초과입고
                                </span>
                                <span className="text-[10.5px] 2xl:text-[11px] font-black text-blue-800">
                                  ▲ +{Math.abs(diff)} {item.unit}
                                </span>
                              </div>
                            ) : (
                              <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded-md text-[11.5px] 2xl:text-[12px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 leading-tight">
                                <span className="inline-flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  정상입고
                                </span>
                                <span className="text-[10.5px] 2xl:text-[11px] font-bold text-slate-400">차이 0</span>
                              </div>
                            )}
                          </td>

                          {/* 입고금액 (실제 들어온 수량 기준 연산) */}
                          <td
                            className="py-2 px-1.5 text-right font-black font-mono text-[13.5px] 2xl:text-[14.5px] text-slate-900 tabular-nums truncate"
                            title={`₩${Math.round(actualAmount).toLocaleString()}`}
                          >
                            ₩{Math.round(actualAmount).toLocaleString()}
                          </td>

                          {/* 차량/검수메모 */}
                          <td className="py-1.5 px-1.5">
                            <input
                              type="text"
                              placeholder="차량 / 메모"
                              value={item.remark}
                              onChange={(e) => {
                                const val = e.target.value;
                                setInboundItems((prev) =>
                                  prev.map((it) =>
                                    it.detailId === item.detailId ? { ...it, remark: val } : it
                                  )
                                );
                              }}
                              className="w-full px-2 py-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-400 rounded-md text-[12.5px] 2xl:text-[13px] text-slate-700 outline-none"
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
        <div className="bg-slate-50/95 border-t border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between text-[13px] font-extrabold shrink-0 gap-3">
          {mainMode === 'order' ? (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-slate-600">
                  납품일{' '}
                  <strong className="text-slate-900">
                    {currentDayDate} ({DAY_CHARS[dayIdx]})
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">
                  표시{' '}
                  <strong className="text-emerald-700 font-mono">{dayRows.length}</strong>건
                </span>
                <button
                  type="button"
                  onClick={handleToggleAllVisibleStage}
                  disabled={visibleStageableRows.length === 0}
                  className={`px-2.5 py-1 rounded-xl text-xs font-black border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isAllVisibleStaged
                      ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300'
                      : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-700 shadow-2xs'
                  }`}
                  title="현재 화면에 필터·표시된 추천/발주가능 품목을 발주 바구니에 한꺼번에 담거나 뺍니다."
                >
                  {isAllVisibleStaged
                    ? `✓ 현재목록 담기해제 (${visibleStageableRows.length})`
                    : `+ 현재목록 전체담기 (${visibleStageableRows.length})`}
                </button>
                {stagedTotals.count > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBasketModal(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-black transition cursor-pointer"
                    title="바구니에 담은 전체 품목 확인 및 수량 편집"
                  >
                    <ShoppingCart className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      바구니 {stagedTotals.count}건 · {stagedTotals.boxes.toLocaleString()}b · ₩
                      {Math.round(stagedTotals.amt).toLocaleString()}
                    </span>
                  </button>
                )}
                {dayTotals.manualOverrideCount > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold">
                    수동수정 {dayTotals.manualOverrideCount}건
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {currentDayStaged.count > 0 ? (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-blue-700 text-xs font-black">
                        {DAY_CHARS[dayIdx]}요일 선택 박스 ({currentDayStaged.count}건)
                      </span>
                      <span className="font-mono font-black text-blue-700 text-base">
                        {currentDayStaged.boxes.toLocaleString()}{' '}
                        <span className="text-xs font-sans">box</span>
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-blue-700 text-xs font-black">선택 예정총액</span>
                      <span className="font-mono font-black text-blue-900 text-lg sm:text-xl">
                        ₩{Math.round(currentDayStaged.amt).toLocaleString()}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-slate-400">
                        (추천전체 ₩{Math.round(dayTotals.amt).toLocaleString()})
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-slate-500 text-xs">{DAY_CHARS[dayIdx]}요일 추천 박스</span>
                      <span className="font-mono font-black text-blue-700 text-base">
                        {dayTotals.boxes.toLocaleString()}{' '}
                        <span className="text-xs font-sans">box</span>
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-slate-500 text-xs">추천 예정총액</span>
                      <span className="font-mono font-black text-emerald-800 text-lg sm:text-xl">
                        ₩{Math.round(dayTotals.amt).toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleSaveDay}
                  disabled={isSaving || (stagedTotals.count === 0 && dayTotals.boxes <= 0)}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs sm:text-[13px] font-black shadow-xs transition cursor-pointer disabled:cursor-not-allowed ${
                    stagedTotals.count > 0 || dayTotals.boxes > 0
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : confirmedPoList.length > 0
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-200 text-slate-400'
                  }`}
                  title="담은 발주 또는 현재 요일 추천 발주를 ERP 정식 발주서(PO)로 확정 저장합니다."
                >
                  {stagedTotals.count === 0 && dayTotals.boxes <= 0 && confirmedPoList.length > 0 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isSaving
                      ? '저장 중...'
                      : stagedTotals.count > 0
                      ? `담은 발주 ${stagedTotals.count}건 확정 저장`
                      : dayTotals.boxes > 0
                      ? `${DAY_CHARS[dayIdx]}요일 발주 확정`
                      : confirmedPoList.length > 0
                      ? `${DAY_CHARS[dayIdx]}요일 발주 완료`
                      : `${DAY_CHARS[dayIdx]}요일 발주 0건`}
                  </span>
                </button>
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

      {/* ── 품목 삭제 확인 모달 ── */}
      {confirmDeleteRow && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => {
            if (deletingProductId === null) setConfirmDeleteRow(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 select-text"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">품목 삭제 확인</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    발주 화면 및 재고조회 목록에서 동시에 제외됩니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={deletingProductId !== null}
                onClick={() => setConfirmDeleteRow(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-1.5 text-xs">
              <div className="font-black text-sm text-slate-900">{confirmDeleteRow.name}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 font-bold">
                <span>거래처: {confirmDeleteRow.supplier || confirmDeleteRow.vendor || '-'}</span>
                <span>창고: {confirmDeleteRow.warehouse || '-'}</span>
                <span>현재고: {(confirmDeleteRow.currentStock || 0).toLocaleString()}봉</span>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 font-medium leading-relaxed">
              💡 기존 발주/입고/수불부 이력과 단가 데이터는 안전하게 보존되며, 잘못 삭제한 경우 상단{' '}
              <strong className="font-black">[삭제복구]</strong> 버튼에서 언제든지 즉시 복구할 수 있습니다.
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deletingProductId !== null}
                onClick={() => setConfirmDeleteRow(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={deletingProductId !== null}
                onClick={() => void handleConfirmDeleteProduct()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer transition shadow-xs disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingProductId !== null ? '삭제 처리 중...' : '예, 발주·재고에서 삭제'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 삭제 품목 복구 관리 모달 ── */}
      {showDeletedModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setShowDeletedModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden select-text"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">삭제 품목 복구 관리</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    복구하면 발주 화면과 재고조회 페이지에 기존 설정(발주일수·입수·재고) 그대로 즉시 복원됩니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeletedModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 필터/검색/일괄복구 툴바 */}
            <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 bg-white">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setDeletedScope('ui')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    deletedScope === 'ui'
                      ? 'bg-rose-600 text-white font-black shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  발주화면 삭제 ({deletedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDeletedScope('all')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    deletedScope === 'all'
                      ? 'bg-slate-800 text-white font-black shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  전체 비활성·기존 삭제·이관 ({totalInactiveCount})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={deletedKeyword}
                    onChange={(e) => setDeletedKeyword(e.target.value)}
                    placeholder="품명 / 거래처 / 창고 검색..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
                  />
                </div>
                {deletedScope === 'ui' && deletedItems.some((it) => it.isUiDeleted) && (
                  <button
                    type="button"
                    disabled={restoringId !== null}
                    onClick={() => {
                      const targetIds = deletedItems
                        .filter((it) => it.isUiDeleted)
                        .map((it) => it.id);
                      void handleRestoreProducts(targetIds, true);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer transition shadow-2xs disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{restoringId === 'ALL' ? '일괄 복구중...' : '직접 삭제 품목 전체 복구'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* 목록 본문 */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
              {isLoadingDeleted ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs font-bold">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                  <span>삭제된 품목 목록을 불러오는 중입니다...</span>
                </div>
              ) : filteredDeletedItems.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm font-bold">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  <span>
                    {deletedScope === 'ui'
                      ? '발주 화면에서 삭제한 품목이 없습니다.'
                      : '조건에 일치하는 비활성 품목이 없습니다.'}
                  </span>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">품목명</th>
                        <th className="py-2.5 px-2.5">거래처</th>
                        <th className="py-2.5 px-2 text-center">창고</th>
                        <th className="py-2.5 px-2 text-right">현재고</th>
                        <th className="py-2.5 px-2 text-center">발주일수</th>
                        <th className="py-2.5 px-2 text-center">상태</th>
                        <th className="py-2.5 px-2.5">삭제일시 / 담당자</th>
                        <th className="py-2.5 px-3 text-center">복구</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDeletedItems.map((it) => (
                        <tr key={it.id} className="hover:bg-blue-50/40 transition">
                          <td className="py-2.5 px-3">
                            <div className="font-black text-slate-900">{it.name}</div>
                            {it.spec && (
                              <div className="text-[11px] text-slate-500 font-medium">{it.spec}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 font-bold text-slate-700">
                            {it.partnerName || '-'}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200 text-[11px]">
                              {it.warehouse || '-'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-800">
                            {it.currentStock.toLocaleString()}봉
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-indigo-700">
                            {it.targetOrderDays > 0 ? `${it.targetOrderDays}일` : '-'}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full font-black text-[11px] border ${
                                it.status === '삭제'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                              }`}
                            >
                              {it.status || '비활성'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 text-[11px] text-slate-500 font-mono">
                            {it.deletedAt ? (
                              <div>
                                <div>{it.deletedAt}</div>
                                {it.deletedBy && (
                                  <div className="font-sans text-slate-600 font-bold">{it.deletedBy}</div>
                                )}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              disabled={restoringId !== null}
                              onClick={() => void handleRestoreProducts([it.id])}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11.5px] cursor-pointer transition shadow-2xs disabled:opacity-50 whitespace-nowrap"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>{restoringId === it.id ? '복구중' : '복구'}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 발주 담기 바구니 확인 및 일괄 확정 모달 ── */}
      {showBasketModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => {
            if (!isSaving) setShowBasketModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden select-text"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>발주 담기 바구니</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                      {stagedTotals.count}품목 · {stagedTotals.boxes.toLocaleString()}박스 · ₩
                      {Math.round(stagedTotals.amt).toLocaleString()}원
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    검색·거래처·요일을 오가며 담아둔 모든 품목입니다. 최종 확인 후 한꺼번에 ERP 발주서(PO)로 확정 생성합니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {stagedList.length > 0 && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleClearBasket}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black transition cursor-pointer disabled:opacity-50"
                  >
                    바구니 비우기
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowBasketModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 transition cursor-pointer disabled:opacity-50"
                  aria-label="바구니 닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 모달 본문 */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-4">
              {stagedList.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                  <ShoppingCart className="w-12 h-12 text-slate-300" />
                  <div className="text-sm font-black text-slate-700">발주 바구니가 비어 있습니다.</div>
                  <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                    테이블 왼쪽 체크박스를 선택하거나 발주 수량(박스)을 입력·수정하면 자동으로 바구니에 담깁니다. 검색어나 거래처, 다른 요일 탭으로 이동해도 담은 항목은 그대로 유지됩니다.
                  </p>
                </div>
              ) : (
                stagedGroupedByDate.map((group) => (
                  <div
                    key={group.orderDate}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
                  >
                    <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 font-black text-slate-800">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        <span>
                          {group.orderDate} ({group.dayChar}요일) 납품분
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono font-bold text-slate-700">
                        <span>{group.items.length}품목</span>
                        <span className="text-blue-700">{group.totalBoxes.toLocaleString()}박스</span>
                        <span className="text-emerald-800">
                          ₩{Math.round(group.totalAmount).toLocaleString()}원
                        </span>
                      </div>
                    </div>

                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-black border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3 w-[16%]">거래처</th>
                          <th className="py-2 px-2.5">품목명</th>
                          <th className="py-2 px-2 text-center w-[9%]">추천</th>
                          <th className="py-2 px-2 text-center w-[19%]">확정 발주량</th>
                          <th className="py-2 px-2 text-right w-[12%]">박스단가</th>
                          <th className="py-2 px-3 text-right w-[13%]">발주금액</th>
                          <th className="py-2 px-2 text-center w-[7%]">제외</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.items.map((item) => {
                          const unitBoxPrice =
                            item.boxPrice || calcBoxPrice(item.bagPrice, item.packUnit || 1);
                          const lineAmount = Math.round(item.qty * unitBoxPrice);
                          return (
                            <tr key={item.key} className="hover:bg-blue-50/40 transition">
                              <td className="py-2 px-3 font-bold text-slate-700 truncate max-w-[130px]" title={item.supplier}>
                                {item.supplier || '-'}
                              </td>
                              <td className="py-2 px-2.5">
                                <div className="font-black text-slate-900 leading-snug">{item.name}</div>
                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                  {item.warehouse && (
                                    <span className="px-1.5 py-[1px] rounded bg-slate-100 text-slate-600 font-bold text-[10.5px] border border-slate-200">
                                      {item.warehouse}
                                    </span>
                                  )}
                                  {(item.pendingBoxes || 0) > 0 && (
                                    <span className="px-1.5 py-[1px] rounded bg-emerald-50 text-emerald-700 font-bold text-[10.5px] border border-emerald-200">
                                      기발주 {item.pendingBoxes}b
                                    </span>
                                  )}
                                  {unitBoxPrice <= 0 && (
                                    <span className="px-1.5 py-[1px] rounded bg-amber-50 text-amber-700 font-bold text-[10.5px] border border-amber-200">
                                      단가 미등록
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-2 text-center font-mono text-slate-500 font-bold">
                                {item.recommendedQty > 0 ? `${item.recommendedQty}b` : '-'}
                              </td>
                              <td className="py-2 px-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    disabled={isSaving || item.qty <= 1}
                                    onClick={() => handleUpdateStagedQty(item.key, item.qty - 1)}
                                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="1박스 줄이기"
                                  >
                                    <Minus size={11} />
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    disabled={isSaving}
                                    value={item.qty}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => handleUpdateStagedQty(item.key, e.target.value)}
                                    className="w-14 text-right px-1.5 py-0.5 border border-blue-300 rounded font-mono font-black text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => handleUpdateStagedQty(item.key, item.qty + 1)}
                                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold cursor-pointer disabled:opacity-40"
                                    title="1박스 늘리기"
                                  >
                                    <Plus size={11} />
                                  </button>
                                  <span className="text-[11px] font-bold text-slate-500">b</span>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-700 font-bold">
                                {unitBoxPrice > 0 ? `₩${unitBoxPrice.toLocaleString()}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                                ₩{lineAmount.toLocaleString()}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => handleRemoveStagedItem(item.key)}
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer disabled:opacity-40"
                                  title="바구니에서 빼기"
                                  aria-label={`${item.name} 바구니에서 빼기`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs font-extrabold text-slate-700">
                {stagedList.length > 0 ? (
                  <>
                    총 <strong className="text-blue-700 font-mono">{stagedTotals.dateCount}개</strong> 납품일 ·{' '}
                    <strong className="text-slate-900 font-mono">{stagedTotals.count}개</strong> 품목 ·{' '}
                    <strong className="text-blue-700 font-mono">
                      {stagedTotals.boxes.toLocaleString()}박스
                    </strong>{' '}
                    ·{' '}
                    <strong className="text-emerald-800 font-mono text-sm">
                      ₩{Math.round(stagedTotals.amt).toLocaleString()}원
                    </strong>
                  </>
                ) : (
                  <span>발주할 품목을 체크해 담아주세요.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowBasketModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-black transition cursor-pointer disabled:opacity-50"
                >
                  계속 담기 (닫기)
                </button>
                <button
                  type="button"
                  disabled={isSaving || stagedList.length === 0}
                  onClick={() => void handleSaveDay()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs sm:text-[13px] font-black shadow-xs transition cursor-pointer disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {isSaving
                      ? '확정 저장 중...'
                      : `한꺼번에 ERP 발주 확정 저장 (${stagedTotals.count}건)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 비수주·장기무변동(휴면) 재고 검토 및 발주제외 관리 모달 ── */}
      {showDormantModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => !isExcludingDormant && setShowDormantModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[86vh] flex flex-col overflow-hidden select-text"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Clock className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    비수주·휴면 재고 관리 (최근 {dormantDays}일 기준)
                  </h3>
                  <p className="text-xs text-slate-600 font-medium">
                    최근 {dormantDays}일간 <strong>수주 완제품 BOM 소요 = 0</strong> 이면서{' '}
                    <strong>재고조사표 감소 = 0</strong>인 품목입니다. 기본 발주목록에서는 자동 제외(일사용량 0 차단)됩니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isExcludingDormant}
                onClick={() => setShowDormantModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-amber-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 필터·기간·검색 툴바 */}
            <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 bg-white">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setDormantFilterTab('unlinked')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      dormantFilterTab === 'unlinked'
                        ? 'bg-amber-600 text-white font-black shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    BOM 미연결 완전미사용 ({dormantMeta.unlinkedDormantCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDormantFilterTab('all')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      dormantFilterTab === 'all'
                        ? 'bg-slate-800 text-white font-black shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    전체 휴면 ({dormantRows.length})
                  </button>
                </div>

                <select
                  value={dormantDays}
                  onChange={(e) => setDormantDays(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-black text-slate-800 cursor-pointer"
                >
                  <option value={10}>기준: 최근 10일</option>
                  <option value={14}>기준: 최근 14일</option>
                  <option value={21}>기준: 최근 21일</option>
                  <option value={30}>기준: 최근 30일</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={dormantKeyword}
                    onChange={(e) => setDormantKeyword(e.target.value)}
                    placeholder="품명 / 거래처 / 창고 검색..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 w-52"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const visibleIds = dormantFilteredModalRows.map((r) => r.productId ?? r.id);
                    const allChecked = visibleIds.length > 0 && visibleIds.every((id) => dormantSelectedIds.has(id));
                    setDormantSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (allChecked) {
                        visibleIds.forEach((id) => next.delete(id));
                      } else {
                        visibleIds.forEach((id) => next.add(id));
                      }
                      return next;
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-black text-slate-700 cursor-pointer transition"
                >
                  표시항목 전체선택
                </button>
              </div>
            </div>

            {/* 목록 테이블 */}
            <div className="flex-1 overflow-auto bg-white">
              {dormantFilteredModalRows.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500 font-bold">
                  해당 조건의 비수주·휴면 품목이 없습니다.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-600 font-extrabold">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">선택</th>
                      <th className="py-2.5 px-2">품목명</th>
                      <th className="py-2.5 px-2 text-center">창고</th>
                      <th className="py-2.5 px-2">거래처</th>
                      <th className="py-2.5 px-2 text-right">현재고</th>
                      <th className="py-2.5 px-2 text-center">활성BOM</th>
                      <th className="py-2.5 px-2 text-center">최근수주일</th>
                      <th className="py-2.5 px-2 text-center">마지막감소일</th>
                      <th className="py-2.5 px-2 text-right">기존기준일사용</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dormantFilteredModalRows.map((r) => {
                      const pid = r.productId ?? r.id;
                      const checked = dormantSelectedIds.has(pid);
                      return (
                        <tr
                          key={r.id}
                          onClick={() =>
                            setDormantSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(pid)) next.delete(pid);
                              else next.add(pid);
                              return next;
                            })
                          }
                          className={`cursor-pointer transition-colors ${
                            checked ? 'bg-amber-50/80 hover:bg-amber-100/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setDormantSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(pid)) next.delete(pid);
                                  else next.add(pid);
                                  return next;
                                })
                              }
                              className="w-3.5 h-3.5 accent-amber-600 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-2 font-bold text-slate-900">
                            <span>{r.name}</span>
                            {r.dormantTier === 'unlinked_dormant' && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black">
                                BOM 미연결
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center font-bold text-slate-600">{r.warehouse || '-'}</td>
                          <td className="py-2 px-2 text-slate-600 truncate max-w-[140px]">{r.supplier || '-'}</td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-slate-800">
                            {Number(r.currentStock || 0).toLocaleString()}
                          </td>
                          <td className="py-2 px-2 text-center font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                (r.activeBomCount || 0) === 0
                                  ? 'bg-slate-100 text-slate-500'
                                  : 'bg-blue-50 text-blue-700'
                              }`}
                            >
                              {r.activeBomCount || 0}개
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-slate-600">
                            {r.lastBomOrderDate || '없음'}
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-slate-600">
                            {r.lastSnapDecreaseDate || '없음'}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            {(r.suppressedSurveyDailyUsage || 0) > 0 ? (
                              <span className="text-amber-700 font-black">
                                {r.suppressedSurveyDailyUsage?.toLocaleString()} (차단됨)
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* 푸터 */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 font-medium">
                {dormantMeta.latestOrderDate && (
                  <span>최근 수주 기준: <strong className="font-mono">{dormantMeta.latestOrderDate}</strong></span>
                )}
                {dormantMeta.latestSnapDate && (
                  <span className="ml-3">최근 재고조사표: <strong className="font-mono">{dormantMeta.latestSnapDate}</strong></span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isExcludingDormant}
                  onClick={() => setShowDormantModal(false)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-black cursor-pointer transition"
                >
                  닫기
                </button>
                <button
                  type="button"
                  disabled={isExcludingDormant || dormantSelectedIds.size === 0}
                  onClick={() => void handleExcludeDormantSelected()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-black shadow-xs transition cursor-pointer disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {isExcludingDormant
                      ? '처리 중...'
                      : `선택 품목 영구 발주제외 (${dormantSelectedIds.size}건)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
