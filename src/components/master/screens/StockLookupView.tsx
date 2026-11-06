'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { MasterActionBar } from '../common/MasterActionBar';
import { MasterDataGrid, MasterGridColumnDef } from '../common/MasterDataGrid';
import { ChevronLeft, ChevronRight, RotateCw, Search, CheckCircle2, AlertCircle, Upload, Calendar } from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';
import { normName } from '@/lib/gfs/norm';

// 재고조사표 정본 시트 (서버 lib/gfs/canonical.ts와 동일 기준)
const AUDIT_SHEETS = ['부자재', '냉장1', '냉장2', '냉동', '상온'] as const;

/** 조달일수 파싱: D+1→1, D+2/D-2→2, 없으면 2 */
function parseLeadDays(s: string): number {
  const m = /D[+-](\d+)/i.exec(s || '');
  if (m) return Math.max(1, parseInt(m[1], 10));
  return 2;
}

/** 안전재고 자동계산: ROUND(유효일사용량(현재고 기준 봉/낱개)×조달일수×1.5) */
function calcSafetyStock(dailyInBaseUnit: number, _pack: number, leadDays: number): number {
  if (!(dailyInBaseUnit > 0)) return 0;
  return Math.max(1, Math.round(dailyInBaseUnit * leadDays * 1.5));
}

interface StockItem {
  id: number;
  whName: string;
  vendor: string;
  orderSupplier: string; // 발주처 (발주서 정본 거래처명)
  orderDays: number; // 발주일수 (발주서 G열)
  itemCode: string;
  lotNo: string; // LOT번호 (입고 시 자동채번)
  lotDate: string; // 입고일 원본(YYYY-MM-DD, 순위 계산용) — 화면 표시는 입고일
  burnRank: number; // 소진순위 (같은 품목+창고 내 입고일 빠른 순, 1부터)
  fefoWarn: boolean; // 나중 LOT 유통기한이 더 빠르면 true
  itemType: string;
  category: string;
  itemName: string;
  spec: string;
  unit: string;
  inboundDate: string; // 입고일 (D+2 등)
  expiryDate: string; // 유통기한
  orderDay: string; // 발주일
  dailyUsage: number; // 예측 일사용량 (현재고 기준 봉/낱개/롤 단위)
  actualDailyUsage?: number; // 당일 실사용량 (전일재고 + 입고량 - 현재고)
  avg20DailyUsage?: number; // 실사용 평균(20일) (최근 20일간의 실제 일평균 소진량)
  avg7DailyUsage?: number; // 하위 호환
  hasPrevStock?: boolean; // 전일 재고 실사 존재 여부
  prevSnapDate?: string; // 비교 기준 전일 실사 일자 (YYYY-MM-DD)
  estDailyUsage?: number; // 추정일사용량 (1개월 재고조사표 실소진량 기반, 현재고 기준 봉/낱개/롤 단위)
  estSampleCount?: number; // 소진 관측 구간 수
  packUnit: number; // 입수량
  boxQty: number; // 박스
  pieceQty: number; // 낱개(봉)
  inQty: number;
  outQty: number;
  prevStock: number; // 전일재고 (어제 마감 재고)
  currentStock: number; // 현재고
  diffStock?: number; // 전일대비증감 (현재고 - 전일재고)
  safetyStock: number;
  shortage: number; // currentStock - safetyStock (negative = danger)
  status: string; // 품절/부족/과잉/정상
  stockDays: number | null; // 재고유지일 — 발주서 엑셀 N열 보이는 숫자 그대로 (없으면 null)
  gfsDays: number | null; // GFS 버팀일 스냅샷 (산출 시점 live 값)
  gfsAsOf: string; // 스냅샷 기준일
  unitPrice: number;
  totalAmount: number; // currentQty * unitPrice
  snapId?: number; // 스냅샷 조회 행이면 InventorySnapshot.id (저장 라우팅용)
}

/** 재고상태 판정: 품절(0) / 부족(안전미달) / 과잉(3배 이상) / 정상 */
export function calcStockStatus(current: number, safety: number): string {
  if (!(current > 0)) return '품절';
  if (current < safety) return '부족';
  if (safety > 0 && current >= safety * 3) return '과잉';
  return '정상';
}

/** 재고유지일 계산: 발주서 정본 N열(재고유지일) 최우선, 없으면 총재고(현재고+입고량) ÷ 일사용량 */
export function calcStockDays(
  current: number,
  daily: number,
  fallback?: number | null,
  incoming: number = 0
): number | null {
  if (fallback != null && !isNaN(Number(fallback))) {
    return Math.round(Number(fallback) * 10) / 10;
  }
  const tot = (Number(current) || 0) + (Number(incoming) || 0);
  const d = Number(daily) || 0;
  if (d > 0) {
    return Math.round((tot / d) * 10) / 10;
  }
  return null;
}

/** KST 오늘 YYYY-MM-DD */
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 로컬 자정 기준 Date → YYYY-MM-DD (UTC 변환 오차 방지) */
function toLocalISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 유통기한 임박일수 (YYYY-MM-DD만 판정, 파싱불가 null) */
export function expiryInDays(expiry: string, base: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((expiry || '').trim());
  if (!m) return null;
  const t = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).getTime();
  const b = new Date(`${base}T00:00:00`).getTime();
  if (isNaN(t) || isNaN(b)) return null;
  return Math.floor((t - b) / 86400000);
}

/** 입고일 키 (비교용 YYYYMMDD, 파싱불가 99999999) */
function inboundKey(s: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  const m2 = /D\+(\d+)/.exec(s || '');
  if (m2) return `9${m2[1].padStart(7, '0')}`;
  return '99999999';
}

/**
 * LOT 소진순위 부여 (선입선출): 같은 품목+창고 그룹 내 입고일 빠른 순 1,2,3...
 * 나중 LOT 유통기한이 더 빠르면 fefoWarn=true (FEFO 역전)
 * 입력 배열을 직접 수정하고 반환
 */
export function applyBurnRank(rows: StockItem[]): StockItem[] {
  const groups = new Map<string, StockItem[]>();
  rows.forEach((r) => {
    const k = `${normName(r.itemName)}||${r.whName}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  });
  groups.forEach((g) => {
    if (g.length <= 1) {
      if (g[0]) {
        g[0].burnRank = 1;
        g[0].fefoWarn = false;
      }
      return;
    }
    const sorted = [...g].sort((a, b) => {
      const ka = inboundKey(a.lotDate || a.inboundDate);
      const kb = inboundKey(b.lotDate || b.inboundDate);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return (a.expiryDate || '') < (b.expiryDate || '') ? -1 : 1;
    });
    sorted.forEach((r, i) => {
      r.burnRank = i + 1;
    });
    // FEFO 역전: 1순위보다 빠른 유통기한을 가진 후순위 LOT 존재 여부
    const firstExp = sorted[0].expiryDate || '';
    sorted.forEach((r, i) => {
      r.fefoWarn = i > 0 && !!firstExp && !!r.expiryDate && r.expiryDate < firstExp;
    });
  });
  return rows;
}

const WAREHOUSES = ['냉장1', '냉장2', '냉동', '상온', '부자재'];
const ITEM_TYPES = ['원자재', '부자재', '반제품', '완제품'];

const SAMPLE_STOCK_DATA: StockItem[] = [
  {
    id: 1,
    whName: '상온',
    vendor: '평화영농조합',
    itemCode: 'M10001',
    lotNo: 'LOT-261030-01', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '곡류',
    itemName: '신동진 햅쌀 (1등급)', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '20kg/포',
    unit: 'kg',
    inboundDate: 'D+1',
    expiryDate: '2027-04-30',
    orderDay: '월수금',
    dailyUsage: 6.5,
    packUnit: 20,
    boxQty: 167,
    pieceQty: 10,
    prevStock: 3200,
    inQty: 1000,
    outQty: 850,
    currentStock: 3350,
    safetyStock: 2000,
    status: '정상',
        stockDays: 669.23,
        shortage: 1350,
    unitPrice: 2850,
    totalAmount: 9547500,
  },
  {
    id: 2,
    whName: '상온',
    vendor: '오뚜기',
    itemCode: 'M10002',
    lotNo: 'LOT-261030-02', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '조미료',
    itemName: '오뚜기 골드마요네즈', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '3.2kg/통',
    unit: 'kg',
    inboundDate: 'D+2',
    expiryDate: '2027-02-28',
    orderDay: '월수금',
    dailyUsage: 3.2,
    packUnit: 10,
    boxQty: 45,
    pieceQty: 0,
    prevStock: 480,
    inQty: 120,
    outQty: 150,
    currentStock: 450,
    safetyStock: 300,
    status: '정상',
        stockDays: 178.13,
        shortage: 150,
    unitPrice: 4200,
    totalAmount: 1890000,
  },
  {
    id: 3,
    whName: '상온',
    vendor: '동원',
    itemCode: 'M10003',
    lotNo: 'LOT-261030-03', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '수산가공',
    itemName: '동원 참치통조림 살코기', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '1.88kg/캔',
    unit: 'kg',
    inboundDate: 'D+2',
    expiryDate: '2027-10-15',
    orderDay: '화목토',
    dailyUsage: 1.8,
    packUnit: 6,
    boxQty: 13,
    pieceQty: 2,
    prevStock: 240,
    inQty: 100,
    outQty: 260,
    currentStock: 80,
    safetyStock: 150,
    status: '부족',
        stockDays: 100,
        shortage: -70, // 부족!
    unitPrice: 11500,
    totalAmount: 920000,
  },
  {
    id: 4,
    whName: '상온',
    vendor: '농심태경',
    itemCode: 'M10004',
    lotNo: 'LOT-261030-04', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '건어물',
    itemName: '삼각김밥용 조미김', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '1000매/속',
    unit: '매',
    inboundDate: 'D+2',
    expiryDate: '2027-06-30',
    orderDay: '월수금',
    dailyUsage: 12.5,
    packUnit: 1000,
    boxQty: 37,
    pieceQty: 0,
    prevStock: 45000,
    inQty: 20000,
    outQty: 28000,
    currentStock: 37000,
    safetyStock: 20000,
    status: '정상',
        stockDays: 4560,
        shortage: 17000,
    unitPrice: 48,
    totalAmount: 1776000,
  },
  {
    id: 5,
    whName: '부자재',
    vendor: '글로벌코리아',
    itemCode: 'M20001',
    lotNo: 'LOT-261030-05', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '부자재',
    category: '포장재',
    itemName: '삼각김밥 삼면포장필름', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '5000m/roll',
    unit: 'roll',
    inboundDate: 'D+2',
    expiryDate: '2028-01-31',
    orderDay: '월수금',
    dailyUsage: 0.4,
    packUnit: 1,
    boxQty: 33,
    pieceQty: 0,
    prevStock: 35,
    inQty: 10,
    outQty: 12,
    currentStock: 33,
    safetyStock: 20,
    status: '정상',
        stockDays: 107.5,
        shortage: 13,
    unitPrice: 85000,
    totalAmount: 2805000,
  },
  {
    id: 6,
    whName: '부자재',
    vendor: '두레',
    itemCode: 'M20002',
    lotNo: 'LOT-261030-06', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '부자재',
    category: '용기',
    itemName: '11찬도시락 2단 트레이', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '400ea/box',
    unit: 'ea',
    inboundDate: 'D+2',
    expiryDate: '2028-06-30',
    orderDay: '월수금',
    dailyUsage: 2.1,
    packUnit: 400,
    boxQty: 3,
    pieceQty: 200,
    prevStock: 2800,
    inQty: 0,
    outQty: 1400,
    currentStock: 1400,
    safetyStock: 2000,
    status: '부족',
        stockDays: 666.67,
        shortage: -600, // 부족!
    unitPrice: 380,
    totalAmount: 532000,
  },
  {
    id: 7,
    whName: '냉장1',
    vendor: '한성',
    itemCode: 'M10010',
    lotNo: 'LOT-261030-07', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '축산물',
    itemName: '국내산 돈육 전지 (슬라이스)', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '10kg/box',
    unit: 'kg',
    inboundDate: 'D+1',
    expiryDate: '2026-11-20',
    orderDay: '화목토',
    dailyUsage: 8.2,
    packUnit: 10,
    boxQty: 93,
    pieceQty: 0,
    prevStock: 850,
    inQty: 500,
    outQty: 420,
    currentStock: 930,
    safetyStock: 500,
    status: '정상',
        stockDays: 174.39,
        shortage: 430,
    unitPrice: 8900,
    totalAmount: 8277000,
  },
  {
    id: 8,
    whName: '냉장1',
    vendor: 'CJ',
    itemCode: 'M10011',
    lotNo: 'LOT-261030-08', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '축산물',
    itemName: 'CJ 델리햄 슬라이스', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '1kg/pack',
    unit: 'kg',
    inboundDate: 'D+1',
    expiryDate: '2026-11-25',
    orderDay: '화목토',
    dailyUsage: 4.4,
    packUnit: 10,
    boxQty: 6,
    pieceQty: 0,
    prevStock: 180,
    inQty: 100,
    outQty: 220,
    currentStock: 60,
    safetyStock: 120,
    status: '부족',
        stockDays: 36.36,
        shortage: -60, // 부족!
    unitPrice: 12800,
    totalAmount: 768000,
  },
  {
    id: 9,
    whName: '냉장2',
    vendor: '한울(네트웍스)',
    itemCode: 'M10020',
    lotNo: 'LOT-261030-09', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '채소류',
    itemName: '세척 당근채 (신선편의)', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '5kg/bag',
    unit: 'kg',
    inboundDate: 'D+1',
    expiryDate: '2026-11-02',
    orderDay: '화목토',
    dailyUsage: 5.1,
    packUnit: 5,
    boxQty: 36,
    pieceQty: 0,
    prevStock: 210,
    inQty: 150,
    outQty: 180,
    currentStock: 180,
    safetyStock: 100,
    status: '정상',
        stockDays: 64.71,
        shortage: 80,
    unitPrice: 4100,
    totalAmount: 738000,
  },
  {
    id: 10,
    whName: '냉장2',
    vendor: '한울(네트웍스)',
    itemCode: 'M10021',
    lotNo: 'LOT-261030-10', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '채소류',
    itemName: '양상추 (탈수완료)', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '5kg/bag',
    unit: 'kg',
    inboundDate: 'D+1',
    expiryDate: '2026-11-02',
    orderDay: '화목토',
    dailyUsage: 3.8,
    packUnit: 5,
    boxQty: 10,
    pieceQty: 0,
    prevStock: 90,
    inQty: 80,
    outQty: 120,
    currentStock: 50,
    safetyStock: 60,
    status: '부족',
        stockDays: 34.21,
        shortage: -10, // 부족!
    unitPrice: 5300,
    totalAmount: 265000,
  },
  {
    id: 11,
    whName: '냉동',
    vendor: '현대그린푸드',
    itemCode: 'M10030',
    lotNo: 'LOT-261030-11', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '냉동가공',
    itemName: '숯불바비큐 패티 (80g)', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '8kg/box',
    unit: 'kg',
    inboundDate: 'D+2',
    expiryDate: '2027-10-10',
    orderDay: '월수금',
    dailyUsage: 6.3,
    packUnit: 8,
    boxQty: 80,
    pieceQty: 0,
    prevStock: 620,
    inQty: 300,
    outQty: 280,
    currentStock: 640,
    safetyStock: 400,
    status: '정상',
        stockDays: 149.21,
        shortage: 240,
    unitPrice: 9700,
    totalAmount: 6208000,
  },
  {
    id: 12,
    whName: '냉동',
    vendor: '현대그린푸드',
    itemCode: 'M10031',
    lotNo: 'LOT-261030-12', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '원자재',
    category: '냉동가공',
    itemName: '케이준 치킨텐더 (가공)', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '5kg/box',
    unit: 'kg',
    inboundDate: 'D+2',
    expiryDate: '2027-09-30',
    orderDay: '월수금',
    dailyUsage: 2.7,
    packUnit: 5,
    boxQty: 52,
    pieceQty: 0,
    prevStock: 410,
    inQty: 0,
    outQty: 150,
    currentStock: 260,
    safetyStock: 300,
    status: '부족',
        stockDays: 96.3,
        shortage: -40, // 부족!
    unitPrice: 10500,
    totalAmount: 2730000,
  },
  {
    id: 13,
    whName: '상온',
    vendor: '당사',
    itemCode: 'P10001',
    lotNo: 'LOT-261030-13', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '완제품',
    category: '삼각김밥',
    itemName: '참치마요삼각김밥', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '110g',
    unit: 'ea',
    inboundDate: 'D+1',
    expiryDate: '2026-11-01',
    orderDay: '매일',
    dailyUsage: 120,
    packUnit: 1,
    boxQty: 1800,
    pieceQty: 0,
    prevStock: 1200,
    inQty: 5400,
    outQty: 4800,
    currentStock: 1800,
    safetyStock: 800,
    status: '정상',
        stockDays: 60,
        shortage: 1000,
    unitPrice: 650,
    totalAmount: 1170000,
  },
  {
    id: 14,
    whName: '상온',
    vendor: '당사',
    itemCode: 'P10004',
    lotNo: 'LOT-261030-14', burnRank: 1, fefoWarn: false, lotDate: '',
    itemType: '완제품',
    category: '도시락',
    itemName: '11가지찬도시락', orderSupplier: '', orderDays: 0, gfsDays: null, gfsAsOf: '',
    spec: '430g',
    unit: 'ea',
    inboundDate: 'D+1',
    expiryDate: '2026-11-01',
    orderDay: '매일',
    dailyUsage: 45,
    packUnit: 1,
    boxQty: 550,
    pieceQty: 0,
    prevStock: 450,
    inQty: 2200,
    outQty: 2100,
    currentStock: 550,
    safetyStock: 300,
    status: '정상',
        stockDays: 61.11,
        shortage: 250,
    unitPrice: 2800,
    totalAmount: 1540000,
  },
];

export const StockLookupView: React.FC = () => {
  const [data, setData] = useState<StockItem[]>(SAMPLE_STOCK_DATA);
  const [targetDate, setTargetDate] = useState(kstToday);
  const [selectedWh, setSelectedWh] = useState('전체');
  const [selectedType, setSelectedType] = useState('전체');
  const [selectedVendor, setSelectedVendor] = useState('전체');
  const [selectedStatus, setSelectedStatus] = useState('전체');
  const [selectedExpiry, setSelectedExpiry] = useState('전체');
  const [onlyShortage, setOnlyShortage] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<number>>(new Set());
  const [newRowIds, setNewRowIds] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatusMsg, setSaveStatusMsg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLiving, setIsLiving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 빨간펜: 업로드 시 이상행(급변·신규) 목록 — 사람은 보고 판단, 저장은 직접
  const [reviewList, setReviewList] = useState<{ id: number; name: string; kind: string; oldQty: number; curQty: number }[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  // 자동채움 잠금: 기본값 false(즉시 마우스 클릭 수정 가능), 필요 시 상단 버튼으로 잠금 전환 가능
  const [locked, setLocked] = useState(false);
  // 소진 시뮬레이터: 선택 행 품목의 LOT 순차 차감 미리보기 (DB 반영 없음)
  const [simOpen, setSimOpen] = useState(false);
  const [simQty, setSimQty] = useState('');
  const [simResult, setSimResult] = useState<{
    itemName: string;
    whName: string;
    lines: { lotNo: string; inbound: string; expiry: string; cur: number; take: number; remain: number }[];
    totalTake: number;
    shortage: number;
    fromExpiry: string;
    toExpiry: string;
  } | null>(null);

  const runSimulation = () => {
    const qty = Math.floor(Number(simQty) || 0);
    if (qty <= 0) {
      alert('사용수량(봉)을 입력하세요.');
      return;
    }
    const sel = data.find((d) => d.id === selectedRowId);
    if (!sel) {
      alert('표에서 품목을 먼저 클릭하세요.');
      return;
    }
    const key = `${normName(sel.itemName)}||${sel.whName}`;
    const group = data
      .filter((d) => `${normName(d.itemName)}||${d.whName}` === key && d.currentStock > 0)
      .sort((a, b) => (a.burnRank || 999) - (b.burnRank || 999));
    if (group.length === 0) {
      alert('소진 가능한 재고가 없습니다.');
      return;
    }
    let left = qty;
    const lines = group.map((g) => {
      const take = Math.min(left, g.currentStock);
      left -= take;
      return {
        lotNo: g.lotNo || '-',
        inbound: g.inboundDate || '-',
        expiry: g.expiryDate || '-',
        cur: g.currentStock,
        take,
        remain: g.currentStock - take,
      };
    });
    const used = lines.filter((l) => l.take > 0);
    setSimResult({
      itemName: sel.itemName,
      whName: sel.whName,
      lines,
      totalTake: qty - left,
      shortage: left,
      fromExpiry: used.length > 0 ? used[0].expiry : '-',
      toExpiry: used.length > 1 ? used[used.length - 1].expiry : used.length === 1 ? used[0].expiry : '-',
    });
  };

  const [mergeInfo, setMergeInfo] = useState('');
  // 날짜별 스냅샷 모드: true면 화면 데이터가 해당 날짜 확정분, false면 현재고 LIVE
  const [snapshotMode, setSnapshotMode] = useState(false);
  // DB에 저장되어 있는 전체 실사 일자 목록
  const [availableSnapDates, setAvailableSnapDates] = useState<{ date: string; count: number }[]>([]);

  // 기준일 스냅샷 확정 정보 (업로드 여부)
  const currentSnapInfo = useMemo(() => {
    return availableSnapDates.find((d) => d.date === targetDate);
  }, [availableSnapDates, targetDate]);

  const isCurrentDateUploaded = !!currentSnapInfo || snapshotMode;

  // 최근 7일 캘린더 트래커 (기준일 포함 최근 7일의 업로드 여부)
  const recentDaysTracker = useMemo(() => {
    const list: Array<{ date: string; label: string; uploaded: boolean; count?: number; isTarget: boolean }> = [];
    const base = new Date((targetDate || kstToday()) + 'T00:00:00');
    for (let i = -5; i <= 1; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const iso = toLocalISODate(d);
      const snap = availableSnapDates.find((s) => s.date === iso);
      const m = d.getMonth() + 1;
      const day = d.getDate();
      list.push({
        date: iso,
        label: `${m}/${day}`,
        uploaded: !!snap,
        count: snap?.count,
        isTarget: iso === targetDate,
      });
    }
    return list;
  }, [availableSnapDates, targetDate]);
  const estMapRef = useRef<{
    byWhAndKey: Record<string, { estDailyUsage: number; estDailyBox: number; sampleCount: number }>;
    byKeyOnly: Record<string, { estDailyUsage: number; estDailyBox: number; sampleCount: number }>;
  }>({ byWhAndKey: {}, byKeyOnly: {} });

  const loadStockData = (baseRows?: any[] | null, snapDate?: string) => {
    const isSnap = !!snapDate && !!baseRows;
    const targetDay = snapDate || targetDate || kstToday();
    const d = new Date(targetDay + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    const yesterdayStr = d.toISOString().slice(0, 10);

    setMergeInfo('불러오는 중...');
    Promise.all([
      baseRows
        ? Promise.resolve({ success: true, data: baseRows })
        : fetch('/api/inventory/stock').then((res) => res.json()),
      fetch('/api/gfs/order-sheet').then((res) => res.json()).catch(() => null),
      fetch('/api/gfs/snapshot').then((res) => res.json()).catch(() => null),
      fetch(`/api/inventory/estimated-usage?days=20&targetDate=${targetDay}`).then((res) => res.json()).catch(() => null),
      fetch(`/api/inventory/snapshot?prevTo=${targetDay}`).then((res) => res.json()).catch(() => null),
    ])
      .then(([json, orderJson, snapJson, estJson, yesterdaySnapJson]) => {
        if (estJson?.success && estJson.data) {
          estMapRef.current = {
            byWhAndKey: estJson.data.byWhAndKey || {},
            byKeyOnly: estJson.data.byKeyOnly || {},
          };
        }
        const lookupEst = (wh: string, normKey: string) => {
          if (!normKey) return null;
          return estMapRef.current.byWhAndKey[`${wh}|${normKey}`] || estMapRef.current.byKeyOnly[normKey] || null;
        };

        // 전일 재고 스냅샷 맵 구축 (품목명/창고 기준)
        const yesterdayMap = new Map<string, number>();
        const prevKnownSet = new Set<string>();
        const prevSnapDate = yesterdaySnapJson?.data?.date || '';
        if (yesterdaySnapJson?.success && Array.isArray(yesterdaySnapJson.data?.rows)) {
          yesterdaySnapJson.data.rows.forEach((r: any) => {
            const nm = normName(r.productName || r.product?.name || '');
            const wh = r.warehouse || '상온';
            const qty = Number(r.currentQty) || (Number(r.boxQty) * Number(r.packUnit || 1) + Number(r.pieceQty || 0));
            if (nm) {
              yesterdayMap.set(`${wh}|${nm}`, qty);
              prevKnownSet.add(`${wh}|${nm}`);
              if (!yesterdayMap.has(nm)) {
                yesterdayMap.set(nm, qty);
                prevKnownSet.add(nm);
              }
            }
          });
        }

        if (json.success && json.data && json.data.length > 0) {
          // 발주서 정본 맵 (품명 정규화 기준) — 엑셀 우선
          const orderByNorm = new Map<string, any>();
          if (orderJson?.success && Array.isArray(orderJson.data?.rows)) {
            orderJson.data.rows.forEach((r: any) => {
              const k = normName(r.name);
              if (k && !orderByNorm.has(k)) orderByNorm.set(k, r);
            });
          }
          let merged = 0;
          let added = 0;
          let estMatched = 0;
          const snapMap: Record<string, { stockDays: number | null; asOf: string; productName: string }> =
            snapJson?.success && snapJson.data?.map ? snapJson.data.map : {};
          const snapAsOf: string = snapJson?.success ? snapJson.data?.asOf || '' : '';
          const snapByNorm = new Map<string, { stockDays: number | null; asOf: string }>();
          Object.values(snapMap).forEach((s: any) => {
            const k = normName(s.productName || '');
            if (k && !snapByNorm.has(k) && s.stockDays != null) snapByNorm.set(k, s);
          });
          const snapOf = (code: string, name: string) => {
            if (code && snapMap[code] && snapMap[code].stockDays != null) return snapMap[code];
            const n = snapByNorm.get(normName(name || ''));
            return n || null;
          };
          const snapSrc: Record<string, number> = snapJson?.success && snapJson.data?.sources ? snapJson.data.sources : {};
          const loaded: StockItem[] = [];
          const seen = new Set<string>();
          json.data.forEach((inv: any, idx: number) => {
            const price = Number(inv.unitPrice) > 0
              ? Number(inv.unitPrice)
              : (inv.currentQty > 0 ? inv.stockAmount / inv.currentQty : 2000);
            const name = inv.productName || inv.product?.name || '';
            const wh = inv.warehouse || '상온';
            const norm = normName(name);
            seen.add(norm);
            const o = norm ? orderByNorm.get(norm) : undefined;
            // 스마트발주 최신 발주서 마스터(o) 반영:
            // 확정 스냅샷 모드(isSnap)에서는 과거 실사 당일의 inv.inQty만 사용하고 발주서 시트의 o.incoming 개입 차단
            const inQty = isSnap
              ? (Number(inv.inQty) || 0)
              : (o && o.incoming != null && !isNaN(Number(o.incoming))
                  ? Number(o.incoming)
                  : (Number(inv.inQty) || 0));

            // 현재고: LIVE 모드에서는 최신 발주서 o.currentStock 최우선, 스냅샷 모드에서는 스냅샷 실사값 유지
            const current = isSnap
              ? (Number(inv.currentQty) || 0)
              : (o && o.currentStock != null && !isNaN(Number(o.currentStock))
                  ? Number(o.currentStock)
                  : (inv.currentQty !== undefined && inv.currentQty !== null
                      ? Number(inv.currentQty)
                      : 0));

            // 스마트발주 최신 발주서 마스터(o) 우선: 입수량 및 일사용량 일원화
            const pack =
              (isSnap && Number(inv.packUnit) > 0 ? Number(inv.packUnit) : 0) ||
              (o && Number(o.packUnit) > 0 ? Number(o.packUnit) : 0) ||
              inv.product?.boxQty ||
              1;
            const box = isSnap && inv.boxQty !== undefined && Number(inv.boxQty) > 0
              ? Number(inv.boxQty)
              : Math.floor(current / pack);
            const piece = isSnap && inv.pieceQty !== undefined && Number(inv.pieceQty) > 0
              ? Number(inv.pieceQty)
              : Math.round((current % pack) * 10) / 10;
            const uprice = isSnap && Number(inv.unitPrice) > 0
              ? Number(inv.unitPrice)
              : (o && Number(o.bagPrice) > 0 ? Number(o.bagPrice) : (Number(inv.unitPrice) > 0 ? Number(inv.unitPrice) : price));
            const rawDailyU = isSnap
              ? (Number(inv.dailyUsage) > 0 ? Number(inv.dailyUsage) : (o && o.dailyUsage != null && !isNaN(Number(o.dailyUsage)) ? Number(o.dailyUsage) : 0))
              : (o && o.dailyUsage != null && !isNaN(Number(o.dailyUsage))
                  ? Number(o.dailyUsage)
                  : (Number(inv.dailyUsage) > 0 ? Number(inv.dailyUsage) : 0));
            const dailyU = Math.round(rawDailyU * 100) / 100;
            const estEntry = lookupEst(wh, norm);
            const estDaily = estEntry ? Math.round((Number(estEntry.estDailyUsage) || 0) * 100) / 100 : 0;
            const estSamples = estEntry ? Number(estEntry.sampleCount) || 0 : 0;
            if (estDaily > 0) estMatched += 1;
            const cleanCode = String(inv.itemCode || inv.productCode || inv.product?.productCode || '').split('#')[0];
            const snapEntry = snapOf(cleanCode, name);
            const fallbackDays =
              (o && o.stockDays != null && !isNaN(Number(o.stockDays)) ? Number(o.stockDays) : null) ??
              (snapEntry && snapEntry.stockDays != null ? Number(snapEntry.stockDays) : null);
            const effectiveDaily = dailyU > 0 ? dailyU : estDaily;
            const inbound = inv.lastInDate
              ? String(inv.lastInDate).slice(5)
              : inv.inboundDate
              ? String(inv.inboundDate)
              : inv.product?.partner?.leadTime
              ? `D+${inv.product.partner.leadTime}`
              : 'D+2';
            const autoSafety = calcSafetyStock(effectiveDaily, pack, parseLeadDays(inbound || o?.supplier || ''));
            const safety =
              isSnap && Number(inv.safetyStock) > 0
                ? Number(inv.safetyStock)
                : autoSafety > 0
                ? autoSafety
                : Number(inv.product?.safetyStockQty) > 0
                ? Number(inv.product.safetyStockQty)
                : 0;
            const nDays = calcStockDays(current, effectiveDaily, fallbackDays, inQty);
            if (o) merged += 1;

            const yKeyWh = `${wh}|${norm}`;
            const hasY = prevKnownSet.has(yKeyWh) || prevKnownSet.has(norm);
            const yQty = yesterdayMap.get(yKeyWh) ?? yesterdayMap.get(norm);
            const hasPrevStock = hasY || (inv.prevStock != null && !isNaN(Number(inv.prevStock)));
            const prevStockVal = yQty != null
              ? yQty
              : (inv.prevStock != null && !isNaN(Number(inv.prevStock))
                ? Number(inv.prevStock)
                : current);
            const diffStockVal = Math.round((current - prevStockVal) * 10) / 10;
            const rawUsage = (prevStockVal + inQty) - current;
            const actualUsageVal = hasPrevStock && rawUsage > 0 ? Math.round(rawUsage * 100) / 100 : 0;

            loaded.push({
              id: inv.id || idx + 1,
              snapId: isSnap ? inv.id : 0,
              whName: wh,
              vendor: inv.vendor || inv.product?.partner?.name || inv.product?.partnerId || '',
              orderSupplier: o?.supplier || '',
              orderDays: o ? Number(o.days) || 0 : 0,
              itemCode: cleanCode,
              lotNo: inv.lotNo || '',
              lotDate: inv.lastInDate || '',
              itemType: inv.itemType || inv.category || inv.product?.category || '원자재',
              category: inv.product?.kind || inv.category || '원부자재',
              itemName: name,
              spec: inv.spec || inv.product?.spec || '',
              unit: inv.unit || inv.product?.unit || 'kg',
              inboundDate: inbound,
              expiryDate: inv.expiryDate || '',
              orderDay: inv.product?.partner?.orderDay || '',
              dailyUsage: dailyU,
              actualDailyUsage: actualUsageVal,
              avg20DailyUsage: estDaily > 0 ? estDaily : 0,
              avg7DailyUsage: estDaily > 0 ? estDaily : 0,
              hasPrevStock,
              prevSnapDate,
              estDailyUsage: estDaily,
              estSampleCount: estSamples,
              packUnit: pack,
              boxQty: box,
              pieceQty: piece,
              prevStock: prevStockVal,
              diffStock: diffStockVal,
              inQty: inQty,
              outQty: 0,
              currentStock: current,
              safetyStock: safety,
              shortage: current - safety,
              status: calcStockStatus(current, safety),
              stockDays: nDays,
              gfsDays: nDays,
              gfsAsOf: snapAsOf,
              burnRank: 0,
              fefoWarn: false,
              unitPrice: uprice,
              totalAmount: current * uprice,
            });
          });
          // LIVE 모드에서 엑셀에만 있는 품목은 신규행으로 추가 (저장 시 품목 자동생성)
          let tempId = -(Date.now() % 1000000) - 1;
          const freshIds = new Set<number>();
          if (!isSnap && orderByNorm.size > 0) {
            orderByNorm.forEach((o: any, norm: string) => {
              if (seen.has(norm) || !o.name) return;
              const wh = o.warehouse || '상온';
              const pack = Number(o.packUnit) > 0 ? Number(o.packUnit) : 1;
              const current = Number(o.currentStock) || 0;
              const price = Number(o.bagPrice) || 0;
              const box = Math.floor(current / pack);
              const piece = Math.round((current % pack) * 10) / 10;
              const daily = Math.round((Number(o.dailyUsage) || 0) * 100) / 100;
              const estEntry = lookupEst(wh, norm);
              const estDaily = estEntry ? Math.round((Number(estEntry.estDailyUsage) || 0) * 100) / 100 : 0;
              const estSamples = estEntry ? Number(estEntry.sampleCount) || 0 : 0;
              if (estDaily > 0) estMatched += 1;
              const leadM = /D-(\d+)/.exec(o.supplier || '');
              const autoSafety = calcSafetyStock(daily > 0 ? daily : estDaily, pack, leadM ? Math.max(1, parseInt(leadM[1], 10)) : 2);
              const s = snapOf(o.itemId || '', o.name || '');
              const fallbackDays =
                (o.stockDays != null && !isNaN(Number(o.stockDays)) ? Number(o.stockDays) : null) ??
                (s && s.stockDays != null ? Number(s.stockDays) : null);
              const inQty = Number(o.incoming) || 0;
              const rowDays = (o.stockDays != null && !isNaN(Number(o.stockDays)))
                ? Math.round(Number(o.stockDays) * 10) / 10
                : calcStockDays(current, daily > 0 ? daily : estDaily, fallbackDays, inQty);

              const yKeyWh = `${wh}|${norm}`;
              const hasY = prevKnownSet.has(yKeyWh) || prevKnownSet.has(norm);
              const yQty = yesterdayMap.get(yKeyWh) ?? yesterdayMap.get(norm);
              const hasPrevStock = hasY || (o.prevStock != null && !isNaN(Number(o.prevStock)));
              const prevStockVal = yQty != null
                ? yQty
                : (o.prevStock != null && !isNaN(Number(o.prevStock))
                  ? Number(o.prevStock)
                  : current);
              const diffStockVal = Math.round((current - prevStockVal) * 10) / 10;
              const rawUsage = (prevStockVal + inQty) - current;
              const actualUsageVal = hasPrevStock && rawUsage > 0 ? Math.round(rawUsage * 100) / 100 : 0;

              const row: StockItem = {
                id: tempId--,
                whName: wh,
                vendor: o.vendor || o.supplierHeader || '',
                orderSupplier: o.supplier || o.supplierHeader || '',
                orderDays: Number(o.days) || 0,
                itemCode: o.itemId || '',
                lotNo: '',
                lotDate: '',
                itemType: '원재료',
                category: '원부자재',
                itemName: o.name,
                spec: '',
                unit: 'box',
                inboundDate: '',
                expiryDate: '',
                orderDay: '',
                dailyUsage: daily,
                actualDailyUsage: actualUsageVal,
                avg20DailyUsage: estDaily > 0 ? estDaily : 0,
                avg7DailyUsage: estDaily > 0 ? estDaily : 0,
                hasPrevStock,
                prevSnapDate,
                estDailyUsage: estDaily,
                estSampleCount: estSamples,
                packUnit: pack,
                boxQty: box,
                pieceQty: piece,
                prevStock: prevStockVal,
                diffStock: diffStockVal,
                inQty: inQty,
                outQty: 0,
                currentStock: current,
                safetyStock: autoSafety,
                shortage: current - autoSafety,
                status: calcStockStatus(current, autoSafety),
                stockDays: rowDays,
                gfsDays: rowDays,
                gfsAsOf: snapAsOf,
                burnRank: 0,
                fefoWarn: false,
                unitPrice: price,
                totalAmount: current * price,
              };
              loaded.push(row);
              freshIds.add(row.id);
              added += 1;
            });
          }
          setData(applyBurnRank(loaded));
          setDirtyRowIds(new Set());
          setNewRowIds(freshIds);
          setSnapshotMode(isSnap);
          const prevLabel = prevSnapDate ? `전일(${prevSnapDate.slice(5)}) 대비 ` : '';
          setMergeInfo(
            isSnap
              ? `${snapDate ? snapDate.slice(5) : ''} 확정 실사 ${loaded.length}건 · ${prevLabel}실사 기반 당일 실사용량 자동 산출`
              : (orderByNorm.size > 0
                  ? `정본 병합: ${merged}건 반영 · ${prevLabel}당일 실사용량 자동 산출${added > 0 ? ` · 신규 ${added}건` : ''}${snapAsOf ? ` · 재고유지일 ${snapAsOf} 기준` : ''}`
                  : orderJson?.data?.errors?.length
                  ? `정본 실패: ${orderJson.data.errors[0]}`
                  : orderJson && !orderJson.success
                  ? `정본 실패: ${orderJson.error || '알 수 없음'}`
                  : `${prevLabel}당일 실사용량 자동 산출`)
          );
        }
      })
      .catch((err) => console.error('Failed to load stock data', err));
  };

  // 날짜별 로드: 해당 날짜 스냅샷이 있으면 확정분, 없으면 현재고 LIVE
  const loadByDate = async (date: string) => {
    try {
      const res = await fetch(`/api/inventory/snapshot?date=${date}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data?.exists && Array.isArray(json.data.rows)) {
        loadStockData(json.data.rows, date);
        return;
      }
    } catch {
      /* 스냅샷 조회 실패 시 현재고로 폴백 */
    }
    loadStockData();
  };

  // DB에 보관된 전체 실사 일자 목록 로드
  const loadAvailableSnapDates = async () => {
    try {
      const res = await fetch('/api/inventory/snapshot?dates=1', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAvailableSnapDates(json.data);
      }
    } catch (err) {
      console.error('Failed to load snapshot dates', err);
    }
  };

  useEffect(() => {
    // 진입 시 당일 스냅샷이 있으면 확정 실사 로드, 없으면 최신 발주서 기준 LIVE 로드
    const today = kstToday();
    setTargetDate(today);
    void loadByDate(today);
    void loadAvailableSnapDates();
  }, []);

  // 단축키 Ctrl+S / Cmd+S 로 저장 지원
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dirtyRowIds, data]);

  // 셀 직접입력 시 연계 자동 계산 및 변경점 추적
  const handleCellChange = (rowId: any, columnKey: string, newValue: any) => {
    setData((prev) => {
      const next = prev.map((item, idx) => {
        const match = item.id === rowId || idx === rowId;
        if (!match) return item;

        const updated: StockItem = { ...item, [columnKey]: newValue };

        // 박스/낱개/입수량 수정 시 현재고 연동 계산 (엑셀 수식: 박스×입수+낱개)
        if (columnKey === 'boxQty' || columnKey === 'pieceQty' || columnKey === 'packUnit') {
          const box = Number(columnKey === 'boxQty' ? newValue : updated.boxQty) || 0;
          const piece = Number(columnKey === 'pieceQty' ? newValue : updated.pieceQty) || 0;
          const pack = Number(columnKey === 'packUnit' ? newValue : updated.packUnit) || 0;
          updated.currentStock = box * pack + piece;
        }

        // 이월재고, 입출고 수정 시 현재고 연동 계산
        const prevStock = Number(columnKey === 'prevStock' ? newValue : updated.prevStock) || 0;
        const inQty = Number(columnKey === 'inQty' ? newValue : updated.inQty) || 0;
        const outQty = Number(columnKey === 'outQty' ? newValue : updated.outQty) || 0;

        if (columnKey === 'prevStock' || columnKey === 'inQty' || columnKey === 'outQty') {
          updated.currentStock = prevStock + inQty - outQty;
        }

        // 현재고(또는 이월/입고/출고) 직접 수정 시 박스/낱개 역산 동기화
        if (
          columnKey === 'currentStock' ||
          columnKey === 'prevStock' ||
          columnKey === 'inQty' ||
          columnKey === 'outQty'
        ) {
          const pack = Number(updated.packUnit) || 0;
          const cur = Number(updated.currentStock) || 0;
          if (pack > 0) {
            updated.boxQty = Math.floor(cur / pack);
            updated.pieceQty = Math.round((cur % pack) * 10) / 10;
          }
        }

        const currentStock = Number(updated.currentStock) || 0;
        const curPrev = Number(updated.prevStock) || 0;
        const curInQ = Number(updated.inQty) || 0;
        updated.diffStock = Math.round((currentStock - curPrev) * 10) / 10;
        const netConsumed = curPrev + curInQ - currentStock;
        updated.actualDailyUsage = updated.hasPrevStock !== false && netConsumed > 0 ? Math.round(netConsumed * 100) / 100 : 0;
        const unitPrice = Number(updated.unitPrice) || 0;
        const dailyUsage = Number(updated.dailyUsage) || 0;
        const estDaily = Number(updated.estDailyUsage) || 0;
        const effectiveDaily = dailyUsage > 0 ? dailyUsage : estDaily;

        if (columnKey === 'dailyUsage') {
          updated.safetyStock = calcSafetyStock(
            effectiveDaily,
            Number(updated.packUnit) || 1,
            parseLeadDays(updated.inboundDate || updated.orderSupplier || '')
          );
        }
        const safetyStock = Number(updated.safetyStock) || 0;

        // 과부족, 재고유지일 및 재고금액 실시간 자동 계산 (총재고 = 현재고 + 입고량)
        const curIn = Number(updated.inQty) || 0;
        updated.shortage = currentStock - safetyStock;
        updated.status = calcStockStatus(currentStock, safetyStock);
        updated.stockDays = effectiveDaily > 0
          ? Math.round(((currentStock + curIn) / effectiveDaily) * 10) / 10
          : (updated.stockDays ?? null);
        updated.gfsDays = updated.stockDays;
        updated.totalAmount = currentStock * unitPrice;

        return updated;
      });
      // 유통기한 수정 시 FEFO 역전 여부만 재계산
      if (columnKey === 'expiryDate') {
        return applyBurnRank(next);
      }
      return next;
    });
    setDirtyRowIds((prev) => new Set(prev).add(Number(rowId)));
  };

  // ERP LIVE 재계산: 금일 수주 x BOM = 자재별 일사용량 → 재고유지일 스냅샷 갱신
  const handleLiveRecalc = async () => {
    setIsLiving(true);
    try {
      const res = await fetch('/api/gfs/live-usage');
      const json = await res.json();
      if (!json.success) {
        alert('LIVE 계산 실패: ' + (json.error || '알 수 없는 오류'));
        return;
      }
      const rows = json.data?.rows || [];
      if (rows.length === 0) {
        alert(`수주 없음 (${json.data?.asOf || ''}). 수주 등록 후 다시 시도하세요.`);
        return;
      }
      const saveRes = await fetch('/api/gfs/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'erp',
          asOf: json.data.asOf,
          items: rows.map((r: any) => ({
            productCode: r.productCode,
            productName: r.productName,
            warehouse: r.warehouse || '',
            stockDays: r.liveDays,
          })),
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveJson.success) {
        alert('스냅샷 저장 실패: ' + (saveJson.error || '알 수 없는 오류'));
        return;
      }
      alert(`LIVE 재계산 완료 (${json.data.asOf} 수주 ${json.data.orderCount}건 · 메뉴 ${json.data.menuCount}종)\n재고유지일 ${saveJson.data.saved}건 갱신됨`);
      void loadByDate(targetDate);
    } catch (e: any) {
      alert('LIVE 계산 중 오류: ' + e.message);
    } finally {
      setIsLiving(false);
    }
  };

  // 일일 재고조사표 엑셀 업로드 → 표 자동채움 (5시트 정본 그대로)
  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      // 파일명에서 일자 자동 감지 (예: 2026-11-03, 20261103, 11월 3일, 261103 등)
      let uploadTargetDate = targetDate;
      const matchYMD = file.name.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
      if (matchYMD) {
        uploadTargetDate = `${matchYMD[1]}-${matchYMD[2].padStart(2, '0')}-${matchYMD[3].padStart(2, '0')}`;
      } else {
        const matchCompact = file.name.match(/(20\d{2})(\d{2})(\d{2})/);
        if (matchCompact) {
          uploadTargetDate = `${matchCompact[1]}-${matchCompact[2]}-${matchCompact[3]}`;
        } else {
          const matchMD = file.name.match(/(\d{1,2})월\s*(\d{1,2})일/);
          if (matchMD) {
            const nowY = new Date().getFullYear();
            uploadTargetDate = `${nowY}-${matchMD[1].padStart(2, '0')}-${matchMD[2].padStart(2, '0')}`;
          }
        }
      }
      if (uploadTargetDate !== targetDate) {
        setTargetDate(uploadTargetDate);
      }

      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      // 발주서 정본 맵 (유지일 계산용 J/I/H) — 엑셀 우선
      let orderByNorm = new Map<string, any>();
      try {
        const orderJson = await fetch('/api/gfs/order-sheet').then((r) => r.json());
        if (orderJson?.success && Array.isArray(orderJson.data?.rows)) {
          orderJson.data.rows.forEach((o: any) => {
            const k = normName(o.name);
            if (k && !orderByNorm.has(k)) orderByNorm.set(k, o);
          });
        }
      } catch {
        /* 정본 없으면 감사값으로 표시 */
      }
      // 시트별 행 수집: R3 헤더, R4~ 데이터 (1거래처 2ID 3제품명 4입고일 5일사용량 7박스 8낱개 9현재고 10입수량 12봉단가)
      const byNorm = new Map<string, StockItem>();
      data.forEach((d) => {
        const k = normName(d.itemName);
        if (k && !byNorm.has(k)) byNorm.set(k, d);
      });
      const next = data.map((d) => ({ ...d }));
      const nextByNorm = new Map<string, StockItem>();
      next.forEach((d) => {
        const k = normName(d.itemName);
        if (k && !nextByNorm.has(k)) nextByNorm.set(k, d);
      });
      const dirtyIds = new Set<number>(dirtyRowIds);
      const freshIds = new Set<number>(newRowIds);
      const review: { id: number; name: string; kind: string; oldQty: number; curQty: number }[] = [];
      let added = 0;
      let updated = 0;
      let same = 0;
      let autoFilled = 0;
      let parsed = 0;
      let tempId = -(Date.now() % 1000000) - 1;
      for (const sheet of AUDIT_SHEETS) {
        const ws = wb.Sheets[sheet];
        if (!ws) continue;
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        for (let i = 4; i < rows.length; i++) {
          const r = rows[i];
          if (!r) continue;
          const name = String(r[3] ?? '').trim();
          if (name.length < 2) continue;
          const norm = normName(name);
          if (!norm) continue;
          const box = Number(r[7]) || 0;
          const piece = Number(r[8]) || 0;
          const pack = Number(r[10]) || 0;
          const current = Number(r[9]) || box * (pack || 0) + piece;
          const price = Number(r[12]) || 0;
          const vendor = String(r[1] ?? '').trim();
          const itemId = r[2] != null && String(r[2]).trim() !== '' ? String(r[2]).trim() : '';
          const inbound = String(r[4] ?? '').trim();
          const fCell = ws[XLSX.utils.encode_cell({ r: i, c: 5 })];
          const fFormula = String(fCell?.f || '');
          const rawDaily = Number(r[5]) || 0;
          const daily =
            rawDaily > 0 && (sheet !== '부자재' || fFormula.includes('/K')) && pack > 0
              ? Math.round(rawDaily * pack * 100) / 100
              : Math.round(rawDaily * 100) / 100;
          const estEntry = estMapRef.current.byWhAndKey[`${sheet}|${norm}`] || estMapRef.current.byKeyOnly[norm] || null;
          const estDaily = estEntry ? Math.round((Number(estEntry.estDailyUsage) || 0) * 100) / 100 : 0;
          const estSamples = estEntry ? Number(estEntry.sampleCount) || 0 : 0;
          const expiry = r[6] != null && String(r[6]).trim() !== '' ? String(r[6]).trim() : '';
          const exist = nextByNorm.get(norm);
          // 안전재고 자동계산 (신규·0인 것만, 기존 수기값 유지)
          const autoSafety = calcSafetyStock(daily > 0 ? daily : estDaily, pack, parseLeadDays(inbound));
          if (exist) {
            const oldStock = exist.currentStock;
            const newSafety = (!exist.safetyStock || exist.safetyStock <= 0) && autoSafety > 0 ? autoSafety : exist.safetyStock;
            // 유지일: 현재고 ÷ 일사용량 실시간 계산 (폴백: 발주서 정본 N열)
            const oRef = orderByNorm.get(norm);
            const fallbackDays = oRef && oRef.stockDays != null ? Number(oRef.stockDays) : exist.stockDays;
            const masterDaily = oRef && oRef.dailyUsage != null && !isNaN(Number(oRef.dailyUsage))
              ? Math.round(Number(oRef.dailyUsage) * 100) / 100
              : null;
            const effDaily = masterDaily ?? (daily || exist.dailyUsage || estDaily);
            const nDays = calcStockDays(current, effDaily, fallbackDays);
            const changed =
              exist.whName !== sheet ||
              (vendor && exist.vendor !== vendor) ||
              exist.currentStock !== current ||
              (price > 0 && exist.unitPrice !== price) ||
              (expiry && exist.expiryDate !== expiry) ||
              (pack > 0 && exist.packUnit !== pack) ||
              newSafety !== exist.safetyStock ||
              nDays !== exist.stockDays;
            exist.whName = sheet;
            if (vendor) exist.vendor = vendor;
            if (!exist.itemCode && itemId) exist.itemCode = itemId;
            if (inbound) exist.inboundDate = inbound;
            if (masterDaily != null) {
              exist.dailyUsage = masterDaily;
            } else if (daily) {
              exist.dailyUsage = daily;
            }
            exist.estDailyUsage = estDaily;
            exist.estSampleCount = estSamples;
            if (expiry) exist.expiryDate = expiry;
            if (pack > 0) exist.packUnit = pack;
            exist.boxQty = box;
            exist.pieceQty = piece;
            exist.currentStock = current;
            exist.prevStock = oldStock;
            exist.diffStock = Math.round((current - oldStock) * 10) / 10;
            const netUse = (oldStock + (exist.inQty || 0)) - current;
            exist.actualDailyUsage = netUse > 0 ? Math.round(netUse * 100) / 100 : 0;
            exist.hasPrevStock = true;
            if (price > 0) exist.unitPrice = price;
            exist.totalAmount = current * exist.unitPrice;
            exist.safetyStock = newSafety;
            exist.shortage = current - newSafety;
            exist.status = calcStockStatus(current, newSafety);
            exist.stockDays = nDays;
            // 빨간펜: 기존 대비 ±50% 이상 급변 행 표시
            if (oldStock > 0 && Math.abs(current - oldStock) / oldStock >= 0.5) {
              review.push({ id: exist.id, name: exist.itemName, kind: current > oldStock ? '급증' : '급감', oldQty: oldStock, curQty: current });
            }
            if (changed) {
              updated += 1;
              if (autoSafety > 0) autoFilled += 1;
              dirtyIds.add(exist.id);
            } else {
              same += 1;
            }
          } else {
            const newSafety = autoSafety > 0 ? autoSafety : 0;
            if (autoSafety > 0) autoFilled += 1;
            const oo = orderByNorm.get(norm);
            const orderDaily = oo && oo.dailyUsage != null && !isNaN(Number(oo.dailyUsage))
              ? Math.round(Number(oo.dailyUsage) * 100) / 100
              : (daily > 0 ? daily : 0);
            const nEffDaily = orderDaily > 0 ? orderDaily : estDaily;
            const nDays = calcStockDays(current, nEffDaily, oo && oo.stockDays != null ? Number(oo.stockDays) : null);
            const row: StockItem = {
              id: tempId--,
              whName: sheet,
              vendor,
              lotNo: '',
              lotDate: '',
              orderSupplier: '',
              orderDays: 0,
              itemCode: itemId,
              burnRank: 0,
              fefoWarn: false,
              itemType: sheet === '부자재' ? '부자재' : '원자재',
              category: '원부자재',
              itemName: name,
              spec: '',
              unit: 'box',
              inboundDate: inbound,
              expiryDate: expiry,
              orderDay: '',
              dailyUsage: orderDaily,
              actualDailyUsage: 0,
              hasPrevStock: false,
              estDailyUsage: estDaily,
              estSampleCount: estSamples,
              packUnit: pack,
              boxQty: box,
              pieceQty: piece,
              prevStock: current,
              inQty: 0,
              outQty: 0,
              currentStock: current,
              safetyStock: newSafety,
              shortage: current - newSafety,
              status: calcStockStatus(current, newSafety),
              stockDays: nDays,
              gfsDays: null,
              gfsAsOf: '',
              unitPrice: price,
              totalAmount: current * price,
            };
            next.push(row);
            nextByNorm.set(norm, row);
            freshIds.add(row.id);
            dirtyIds.add(row.id);
            added += 1;
            if (current > 0) {
              review.push({ id: row.id, name, kind: '신규', oldQty: 0, curQty: current });
            }
          }
          parsed += 1;
        }
      }
      if (parsed === 0) {
        alert('엑셀에서 품목 행을 찾지 못했습니다. 일일 재고조사표 양식인지 확인하세요.');
        return;
      }
      setData(applyBurnRank(next));
      setDirtyRowIds(dirtyIds);
      setNewRowIds(freshIds);
      setReviewList(review);
      setReviewOpen(review.length > 0);
      alert(
        `업로드 반영 완료 (${uploadTargetDate} 기준):\n` +
        `신규 ${added}건 · 변경 ${updated}건 · 동일 ${same}건 · 안전재고 자동계산 ${autoFilled}건 · 확인필요 ${review.length}건\n\n` +
        `⚠️ 알림: 현재 화면 표에만 임시 반영된 상태입니다.\n` +
        `반드시 상단의 [저장 (Ctrl+S)] 버튼을 누르셔야 데이터베이스에 [${uploadTargetDate} 확정 실사]로 영구 저장됩니다.`
      );
    } catch (e: any) {
      alert('엑셀 파싱 실패: ' + (e.message || '알 수 없는 오류'));
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // 재고 직접 수정 내역 일괄 DB 저장 (선(先) 검증 가드레일 + 청크 분할 고속 저장)
  const handleSave = async () => {
    if (dirtyRowIds.size === 0) {
      alert('수정된 재고 내역이 없습니다.');
      return;
    }

    // 0) 사전 정합성 검사 (Client-side Pre-flight Check - 서버 500 에러 및 타임아웃 100% 예방)
    setSaveStatusMsg('데이터 무결성 검증 중...');
    const validationErrors: string[] = [];
    data.forEach((d, idx) => {
      if (!d.itemName || !d.itemName.trim()) {
        validationErrors.push(`행 #${idx + 1}: 품명이 비어 있습니다.`);
      }
      if (isNaN(Number(d.currentStock))) {
        validationErrors.push(`행 #${idx + 1} [${d.itemName}]: 현재고 수량이 유효한 숫자가 아닙니다.`);
      }
    });

    if (validationErrors.length > 0) {
      alert(
        `저장 전 데이터 무결성 검사 실패 (${validationErrors.length}건):\n` +
          validationErrors.slice(0, 5).join('\n') +
          (validationErrors.length > 5 ? `\n...외 ${validationErrors.length - 5}건` : '')
      );
      setSaveStatusMsg(null);
      return;
    }

    setIsSaving(true);
    try {
      const dirty = data.filter((d) => dirtyRowIds.has(d.id));
      const existing = dirty.filter((d) => !newRowIds.has(d.id));
      const fresh = dirty.filter((d) => newRowIds.has(d.id));
      const existingInv = existing.filter((d) => !(d.snapId || 0));
      const isToday = targetDate === kstToday();
      const shouldSyncLive = isToday || !snapshotMode || existingInv.length > 0;

      // 1) 신규행: 품목 자동생성(materialize) — 스냅샷/재고 공통으로 품번 확보
      const codeByNorm = new Map<string, string>();
      if (fresh.length > 0) {
        setSaveStatusMsg(`신규 품목 기준정보 등록 중 (${fresh.length}건)...`);
        const matRes = await fetch('/api/gfs/materialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: fresh.map((d) => ({
              name: d.itemName,
              boxes: 1,
              packUnit: d.packUnit,
              bagPrice: d.unitPrice,
              supplierHeader: d.vendor,
              safetyStock: d.safetyStock,
            })),
          }),
        });
        const matJson = await matRes.json();
        if (!matJson.success) {
          alert(`신규 품목 생성 실패: ${matJson.error || '알 수 없는 오류'}`);
          return;
        }
        (matJson.data?.matched || []).forEach((m: any) => {
          if (m.productCode && m.productName) codeByNorm.set(normName(m.productName), m.productCode);
        });
      }
      const codeOf = (d: StockItem) =>
        (newRowIds.has(d.id) ? codeByNorm.get(normName(d.itemName)) : undefined) || d.itemCode || '';

      // 2) 날짜별 스냅샷 저장 (표 전체 상태 = 해당 날짜 확정분, 멱등 교체)
      setSaveStatusMsg(`확정 스냅샷 저장 중 (${data.length}건)...`);
      const snapRes = await fetch('/api/inventory/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          rows: data.map((d) => ({
            productCode: codeOf(d),
            productName: d.itemName,
            warehouse: d.whName,
            lotNo: d.lotNo || '',
            expiryDate: d.expiryDate || '',
            currentQty: d.currentStock,
            dailyUsage: d.dailyUsage,
            packUnit: d.packUnit,
            boxQty: d.boxQty,
            pieceQty: d.pieceQty,
            unit: d.unit,
            unitPrice: d.unitPrice,
            safetyStock: d.safetyStock,
            inboundDate: d.inboundDate || '',
            vendor: d.vendor || '',
            itemCode: d.itemCode || '',
            category: d.category || '',
            itemType: d.itemType || '',
            spec: d.spec || '',
          })),
        }),
      });
      const snapJson = await snapRes.json();
      if (!snapJson.success) {
        alert(`스냅샷 저장 실패: ${snapJson.error || '알 수 없는 오류'}`);
        return;
      }

      // 3) 오늘분이거나 명시적 LIVE 현재고 수정일 때만 현재고(Inventory)에 동기화
      const isTodayOrFuture = targetDate >= kstToday();
      let liveSyncSuccess = false;
      if (shouldSyncLive && isTodayOrFuture) {
        try {
          setSaveStatusMsg('LIVE 현재고 동기화 중...');
          // 3-1) 유효한 ID가 있는 기존 행만 PUT 일괄 갱신
          const validExisting = existingInv.filter((d) => Number(d.id) > 0);
          if (validExisting.length > 0) {
            const updates = validExisting.map((d) => ({
              id: Number(d.id),
              warehouse: d.whName,
              currentQty: d.currentStock,
              dailyUsage: d.dailyUsage,
              unitPrice: d.unitPrice,
              stockAmount: d.totalAmount,
              safetyStock: d.safetyStock,
              expiryDate: d.expiryDate,
            }));

            await fetch('/api/inventory/stock', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates }),
            });
          }

          // 3-2) 변경된 행(dirty) 중심 고속 동기화 (불필요한 650건 전송 제거 및 150건 청크 분할)
          const syncRows = dirty.length > 0 ? dirty : data;
          const syncItems = syncRows.map((d) => ({
            productCode: codeOf(d) || undefined,
            productName: d.itemName,
            warehouse: d.whName,
            currentQty: d.currentStock,
            unitPrice: d.unitPrice,
            expiryDate: d.expiryDate,
            vendor: d.vendor,
            safetyStock: d.safetyStock,
          }));

          const CHUNK = 150;
          for (let i = 0; i < syncItems.length; i += CHUNK) {
            const chunk = syncItems.slice(i, i + CHUNK);
            await fetch('/api/inventory/stock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: chunk }),
            });
          }
          liveSyncSuccess = true;
        } catch (syncErr) {
          console.warn('현재고 LIVE 동기화 경고:', syncErr);
        }
      }

      setDirtyRowIds(new Set());
      setNewRowIds(new Set());
      alert(
        `저장 완료 (${targetDate} 실사 확정 ${snapJson.count}건 저장됨${
          liveSyncSuccess ? ' · 현재고 LIVE 동기화 완료' : ''
        })`
      );
      void loadByDate(targetDate);
      void loadAvailableSnapDates();
    } catch (err: any) {
      console.error(err);
      alert(`저장 중 오류 발생: ${err.message}`);
    } finally {
      setIsSaving(false);
      setSaveStatusMsg(null);
    }
  };

  // Day shift
  const shiftDay = (delta: number) => {
    const d = new Date(targetDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const next = toLocalISODate(d);
    setTargetDate(next);
    void loadByDate(next);
  };

  // Filtered rows
  const vendors = useMemo(() => {
    const s = new Set<string>();
    data.forEach((d) => { if (d.vendor) s.add(d.vendor); });
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      if (selectedWh !== '전체' && item.whName !== selectedWh) return false;
      if (selectedType !== '전체' && item.itemType !== selectedType) return false;
      if (selectedVendor !== '전체' && item.vendor !== selectedVendor) return false;
      if (selectedStatus !== '전체' && item.status !== selectedStatus) return false;
      if (selectedExpiry !== '전체') {
        const dd = expiryInDays(item.expiryDate, targetDate);
        if (dd === null) return false;
        if (selectedExpiry === '만료' && dd >= 0) return false;
        if (selectedExpiry === 'D-7' && !(dd >= 0 && dd <= 7)) return false;
        if (selectedExpiry === 'D-30' && !(dd >= 0 && dd <= 30)) return false;
      }
      if (onlyShortage && item.shortage >= 0) return false;
      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        const matchName = item.itemName.toLowerCase().includes(kw);
        const matchCode = item.itemCode.toLowerCase().includes(kw);
        const matchCat = item.category.toLowerCase().includes(kw);
        const matchVendor = (item.vendor || '').toLowerCase().includes(kw);
        if (!matchName && !matchCode && !matchCat && !matchVendor) return false;
      }
      return true;
    });
  }, [data, selectedWh, selectedType, selectedVendor, selectedStatus, selectedExpiry, targetDate, onlyShortage, keyword]);

  // Summaries
  const summaries = useMemo(() => {
    let prevStock = 0;
    let inQty = 0;
    let outQty = 0;
    let currentStock = 0;
    let diffStock = 0;
    let totalAmount = 0;

    filteredData.forEach((row) => {
      prevStock += row.prevStock;
      inQty += row.inQty;
      outQty += row.outQty;
      currentStock += row.currentStock;
      diffStock += (row.diffStock ?? (row.currentStock - row.prevStock));
      totalAmount += row.totalAmount;
    });

    return {
      prevStock,
      inQty,
      outQty,
      currentStock,
      diffStock,
      totalAmount,
    };
  }, [filteredData]);

  const columns: MasterGridColumnDef[] = [
    {
      key: 'whName',
      label: locked ? '창고명 🔒' : '창고명',
      width: '3.8%',
      minWidth: '54px',
      align: 'center',
      sortable: true,
      filterable: true,
      editable: !locked,
      ...(locked ? { format: 'text' as const } : { format: 'dropdown' as const, options: WAREHOUSES }),
    },
    {
      key: 'vendor',
      label: '거래처',
      width: '6.6%',
      minWidth: '88px',
      align: 'left',
      sortable: true,
      filterable: true,
      editable: false,
      render: (v) => <span title={String(v || '')}>{v}</span>,
    },
    {
      key: 'itemCode',
      label: '품번',
      width: '4.2%',
      minWidth: '58px',
      align: 'center',
      sortable: true,
      filterable: true,
      editable: false,
    },
    {
      key: 'itemType',
      label: '구분',
      width: '3.2%',
      minWidth: '44px',
      align: 'center',
      sortable: true,
      editable: false,
    },
    {
      key: 'category',
      label: '품종',
      width: '3.7%',
      minWidth: '50px',
      align: 'center',
      sortable: true,
      editable: false,
    },
    {
      key: 'itemName',
      label: '품명',
      width: '15.0%',
      minWidth: '180px',
      sortable: true,
      filterable: true,
      editable: false,
      render: (v) => (
        <span className="font-medium text-gray-900" title={String(v || '')}>
          {v}
        </span>
      ),
    },
    {
      key: 'unit',
      label: '단위',
      width: '2.6%',
      minWidth: '36px',
      align: 'center',
      editable: false,
    },
    {
      key: 'inboundDate',
      label: '입고일',
      width: '3.1%',
      minWidth: '44px',
      align: 'center',
      editable: false,
    },
    {
      key: 'dailyUsage',
      label: locked ? '예측 일사용량 🔒' : '예측 일사용량',
      width: '5.1%',
      minWidth: '76px',
      align: 'right',
      format: 'number',
      sortable: true,
      editable: !locked,
      render: (v, row) => {
        const num = Number(v);
        if (!(num > 0)) return <span className="text-gray-400">-</span>;
        const pack = Number(row.packUnit) || 1;
        const disp = Number(num.toFixed(2)).toLocaleString();
        const boxTxt = pack > 1 ? `(${Number((num / pack).toFixed(1))}박)` : '';
        return (
          <span
            className="font-mono text-gray-800 whitespace-nowrap"
            title={
              pack > 1
                ? `예측 일사용량: ${disp} (기준 발주 단위 · 약 ${(num / pack).toFixed(2)}박스/일, 입수량 ${pack})`
                : `예측 일사용량: ${disp} (기준 발주 단위)`
            }
          >
            {disp}
            {boxTxt && <span className="ml-0.5 text-[10px] text-gray-500 font-sans">{boxTxt}</span>}
          </span>
        );
      },
    },
    {
      key: 'actualDailyUsage',
      label: '당일 실사용량',
      width: '5.1%',
      minWidth: '76px',
      align: 'right',
      format: 'number',
      sortable: true,
      editable: false,
      render: (v, row) => {
        if (row.hasPrevStock === false || row.prevStock === undefined || row.prevStock === null) {
          return <span className="text-gray-400 font-mono text-xs" title="비교할 전일 실사 재고 없음">-</span>;
        }

        const prev = Number(row.prevStock) || 0;
        const inQ = Number(row.inQty) || 0;
        const cur = Number(row.currentStock) || 0;
        const pack = Number(row.packUnit) || 1;
        const netConsumed = prev + inQ - cur;
        const usage = Number(v) > 0 ? Number(v) : (netConsumed > 0 ? Math.round(netConsumed * 100) / 100 : 0);
        const prevLabel = row.prevSnapDate ? `${row.prevSnapDate.slice(5)} 대비 ` : '전일 대비 ';

        if (usage > 0) {
          const disp = Number(usage.toFixed(2)).toLocaleString();
          const boxVal = pack > 1 ? Number((usage / pack).toFixed(1)) : 0;
          const boxTxt = pack > 1 ? `(${boxVal}박)` : '';
          return (
            <span
              className="font-mono font-bold text-emerald-700 whitespace-nowrap"
              title={`${prevLabel}실사용량: ${disp} (전일 ${prev.toLocaleString()} + 입고 ${inQ.toLocaleString()} - 현재 ${cur.toLocaleString()})${
                pack > 1 ? ` · 약 ${(usage / pack).toFixed(2)}박스 (입수량 ${pack})` : ''
              }`}
            >
              {disp}
              {boxTxt && <span className="ml-0.5 text-[10px] text-emerald-600 font-normal font-sans">{boxTxt}</span>}
            </span>
          );
        }

        if (cur > prev + inQ) {
          const increase = Math.round((cur - (prev + inQ)) * 10) / 10;
          return (
            <span
              className="font-mono text-blue-600 font-semibold text-xs whitespace-nowrap"
              title={`${prevLabel}재고 증가 (+${increase.toLocaleString()}): 전일 ${prev.toLocaleString()} → 현재 ${cur.toLocaleString()} (신규 입고 반영)`}
            >
              0 <span className="text-[10px] text-blue-500 font-sans">(+입고)</span>
            </span>
          );
        }

        return <span className="text-gray-400 font-mono text-xs" title={`${prevLabel}재고 변동 없음 (사용량 0)`}>0</span>;
      },
    },
    {
      key: 'avg20DailyUsage',
      label: '실사용 평균(20일)',
      width: '5.3%',
      minWidth: '82px',
      align: 'right',
      format: 'number',
      sortable: true,
      editable: false,
      render: (v, row) => {
        const num = Number(v);
        if (!(num > 0)) return <span className="text-gray-400 font-mono text-xs">-</span>;
        const pack = Number(row.packUnit) || 1;
        const disp = Number(num.toFixed(1)).toLocaleString();
        const boxVal = pack > 1 ? Number((num / pack).toFixed(1)) : 0;
        const boxTxt = pack > 1 ? `(${boxVal}박)` : '';
        const samples = row.estSampleCount || 0;
        return (
          <span
            className="font-mono font-bold text-violet-700 whitespace-nowrap"
            title={`최근 20일 실사용 평균: ${Number(num.toFixed(2)).toLocaleString()} (일평균 실소진량 · 관측 ${samples}회)${
              pack > 1 ? ` · 약 ${(num / pack).toFixed(2)}박스/일 (입수량 ${pack})` : ''
            }`}
          >
            {disp}
            {boxTxt && <span className="ml-0.5 text-[10px] text-violet-500 font-normal font-sans">{boxTxt}</span>}
          </span>
        );
      },
    },
    {
      key: 'packUnit',
      label: '입수량',
      width: '2.8%',
      minWidth: '38px',
      align: 'right',
      format: 'number',
      editable: false,
    },
    {
      key: 'boxQty',
      label: locked ? '박스 🔒' : '박스',
      width: '2.8%',
      minWidth: '38px',
      align: 'right',
      format: 'number',
      editable: !locked,
    },
    {
      key: 'pieceQty',
      label: locked ? '낱개 🔒' : '낱개',
      width: '2.8%',
      minWidth: '38px',
      align: 'right',
      format: 'number',
      editable: !locked,
    },
    {
      key: 'inQty',
      label: '입고수량',
      width: '3.4%',
      minWidth: '48px',
      align: 'right',
      format: 'number',
      sortable: true,
      editable: true,
    },
    {
      key: 'prevStock',
      label: locked ? '전일재고 🔒' : '전일재고',
      width: '3.8%',
      minWidth: '52px',
      align: 'right',
      format: 'number',
      sortable: true,
      editable: !locked,
    },
    {
      key: 'currentStock',
      label: locked ? '현재고 🔒' : '현재고',
      width: '4.0%',
      minWidth: '56px',
      align: 'right',
      format: 'number',
      sortable: true,
      editable: !locked,
      isDangerText: (v, row) => row.currentStock < row.safetyStock,
      render: (v, row) => (
        <span
          className={`font-bold ${
            row.currentStock < row.safetyStock ? 'text-red-600 font-bold' : 'text-gray-900'
          }`}
        >
          {Number(v).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'diffStock',
      label: '전일대비증감',
      width: '4.4%',
      minWidth: '60px',
      align: 'right',
      sortable: true,
      editable: false,
      render: (v, row) => {
        const diff = row.diffStock != null ? Number(row.diffStock) : (Number(row.currentStock || 0) - Number(row.prevStock || 0));
        if (diff > 0) {
          return <span className="text-blue-600 font-bold font-mono">+{diff.toLocaleString()}</span>;
        } else if (diff < 0) {
          return <span className="text-rose-600 font-bold font-mono">{diff.toLocaleString()}</span>;
        }
        return <span className="text-gray-400 font-mono">0</span>;
      },
    },
    {
      key: 'stockDays',
      label: '재고유지일',
      width: '4.2%',
      minWidth: '58px',
      align: 'right',
      sortable: true,
      editable: false,
      render: (v) => {
        const num = Number(v);
        const hasVal = v != null && v !== '' && !isNaN(num);
        const colorCls = !hasVal
          ? 'text-gray-400'
          : num < 1.5
          ? 'text-red-600 font-bold'
          : num < 3
          ? 'text-amber-700 font-bold'
          : 'text-indigo-700 font-bold';
        return (
          <span className={`font-mono ${colorCls}`}>
            {hasVal ? `${num.toFixed(1)}일` : '-'}
          </span>
        );
      },
    },
    {
      key: 'safetyStock',
      label: '안전재고',
      width: '3.8%',
      minWidth: '54px',
      align: 'right',
      format: 'number',
      sortable: true,
      editable: true,
      render: (v, row) => {
        const num = Number(v) || 0;
        const effDaily = Number(row.dailyUsage) > 0 ? Number(row.dailyUsage) : Number(row.estDailyUsage) || 0;
        const lead = parseLeadDays(row.inboundDate || row.orderSupplier || '');
        return (
          <span
            className="font-mono text-gray-800"
            title={
              effDaily > 0
                ? `자동 산출: ROUND(일소모량 ${Number(effDaily.toFixed(2))} × 조달 ${lead}일(${row.inboundDate || 'D+2'}) × 1.5) = ${num.toLocaleString()} (클릭하여 직접 수정 가능)`
                : '일사용량 미확인 품목 (클릭하여 직접 입력 가능)'
            }
          >
            {num > 0 ? num.toLocaleString() : '-'}
          </span>
        );
      },
    },
    {
      key: 'shortage',
      label: '과부족',
      width: '3.8%',
      minWidth: '54px',
      align: 'right',
      format: 'number',
      highlightNegative: true,
      sortable: true,
      editable: false,
      render: (v) => (
        <span className={Number(v) < 0 ? 'text-red-600 font-bold' : 'text-blue-700'}>
          {Number(v) > 0 ? `+${Number(v).toLocaleString()}` : Number(v).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      width: '3.0%',
      minWidth: '44px',
      align: 'center',
      sortable: true,
      filterable: true,
      editable: false,
      render: (v) => {
        const s = String(v || '정상');
        const cls =
          s === '품절'
            ? 'bg-gray-800 text-white border-gray-800'
            : s === '부족'
            ? 'bg-red-100 text-red-700 border-red-300'
            : s === '과잉'
            ? 'bg-amber-100 text-amber-800 border-amber-300'
            : 'bg-emerald-50 text-emerald-700 border-emerald-300';
        return (
          <span className={`inline-block px-1 py-0.2 text-[10.5px] font-bold border rounded ${cls}`}>
            {s}
          </span>
        );
      },
    },
    {
      key: 'unitPrice',
      label: locked ? '단가 🔒' : '단가',
      width: '4.4%',
      minWidth: '62px',
      align: 'right',
      format: 'currency',
      editable: !locked,
    },
    {
      key: 'totalAmount',
      label: '재고금액',
      width: '5.8%',
      minWidth: '78px',
      align: 'right',
      format: 'currency',
      sortable: true,
      editable: false,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] text-[12px] select-none">
      {/* 1. Header Action Bar */}
      <MasterActionBar
        title="재고조회"
        buttons={[
          {
            key: 'save',
            label: isSaving ? (saveStatusMsg || '저장 중...') : dirtyRowIds.size > 0 ? `저장 (${dirtyRowIds.size}건)` : '저장',
            icon: 'save',
            onClick: handleSave,
          },
          {
            key: 'upload',
            label: isUploading
              ? '업로드 중...'
              : isCurrentDateUploaded
              ? '✅ 재고조사표 덮어쓰기'
              : '📤 재고조사표 업로드',
            icon: 'upload',
            onClick: () => fileRef.current?.click(),
          },
          {
            key: 'lock',
            label: locked ? '🔒 잠금중 (수정모드 켜기)' : '✏️ 수정모드 (잠그기)',
            icon: 'reset',
            onClick: () => setLocked((v) => !v),
          },
          {
            key: 'live',
            label: isLiving ? 'LIVE 계산중...' : '재고유지일 LIVE 재계산',
            icon: 'search',
            onClick: handleLiveRecalc,
          },
          {
            key: 'download',
            label: '엑셀다운로드',
            icon: 'download',
            onClick: () =>
              exportGridToExcel({
                filename: `현재고조회_${targetDate}`,
                sheetName: '현재고',
                columns: columns,
                data: filteredData,
              }),
          },
        ]}
        helpContent="창고별/품목별 실시간 재고를 조회하고 수정/저장할 수 있습니다. 엑셀이 채운 셀(창고명·유통기한·박스·낱개·현재고·단가)은 기본 잠금(🔒)이며, 수정모드에서만 편집됩니다. 이월·입고·출고·안전재고는 항상 수정 가능합니다. (Ctrl+S로 저장)"
      />
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadFile(f);
        }}
      />

      {/* 2. Filter Bar (단일 1줄 레이아웃) */}
      <div className="bg-[#e4e8ee] border-b border-[#b0b8c2] px-3 py-1 flex items-center justify-between gap-x-2.5 text-[12px] shrink-0 overflow-x-auto whitespace-nowrap w-full">
        <div className="flex items-center gap-x-2.5 min-w-0">
          {/* Target Date with prev/next */}
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-semibold text-gray-700">기준일</span>
            <button
              onClick={() => shiftDay(-1)}
              className="p-0.5 bg-white border border-gray-400 rounded hover:bg-gray-100"
              title="이전 날짜"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => {
                const next = e.target.value;
                setTargetDate(next);
                if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
                  void loadByDate(next);
                }
              }}
              className="bg-white border border-gray-400 rounded px-1.5 py-0.5 text-[12px]"
            />
            <button
              onClick={() => shiftDay(1)}
              className="p-0.5 bg-white border border-gray-400 rounded hover:bg-gray-100"
              title="다음 날짜"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* 1. 당일 재고조사표 업로드 실시간 상태 뱃지 (Check Badge) */}
            {isCurrentDateUploaded ? (
              <span
                className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-2.5 py-0.5 rounded text-[11px] shadow-2xs shrink-0"
                title={`${targetDate} 일일 재고조사표 실사 확정 데이터 (${currentSnapInfo?.count || data.length}건)`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>재고조사표 등록완료 ({currentSnapInfo?.count || data.length}건 확정)</span>
              </span>
            ) : (
              <div className="inline-flex items-center gap-1 shrink-0">
                <span
                  className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded text-[11px] shadow-2xs"
                  title={`${targetDate} 일자의 확정 재고조사표가 아직 업로드되지 않았습니다.`}
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>재고조사표 미등록 (LIVE 추정치)</span>
                </span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-bold px-2 py-0.5 rounded text-[11px] shadow-2xs cursor-pointer transition-colors"
                  title="지금 당일 재고조사표 엑셀 업로드하기"
                >
                  <Upload className="w-3 h-3" />
                  <span>지금 업로드</span>
                </button>
              </div>
            )}

            {/* 2. 최근 7일 주간 출석부 신호등 트래커 (원클릭 날짜 이동) */}
            <div className="hidden lg:flex items-center gap-1 pl-2 border-l border-slate-300 ml-1 shrink-0">
              <span className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>주간현황:</span>
              </span>
              <div className="flex items-center gap-1">
                {recentDaysTracker.map((item) => (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => {
                      setTargetDate(item.date);
                      void loadByDate(item.date);
                    }}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      item.isTarget
                        ? 'ring-2 ring-blue-600 font-black shadow-xs bg-white text-blue-900'
                        : 'hover:opacity-80'
                    } ${
                      item.uploaded
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                        : 'bg-white text-slate-400 border border-dashed border-slate-300'
                    }`}
                    title={`${item.date}: ${item.uploaded ? `재고조사표 등록됨 (${item.count}건)` : '미등록 (LIVE 추정재고)'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${item.uploaded ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 저장된 실사일자 퀵선택 드롭다운 */}
            {availableSnapDates.length > 0 && (
              <select
                value={availableSnapDates.some((d) => d.date === targetDate) ? targetDate : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    setTargetDate(val);
                    void loadByDate(val);
                  }
                }}
                className="bg-emerald-50 text-emerald-800 border border-emerald-400 font-semibold rounded px-1.5 py-0.5 text-[12px] hover:bg-emerald-100 cursor-pointer shadow-sm ml-1"
                title="데이터베이스에 저장된 실사 일자 목록"
              >
                <option value="">📅 실사 히스토리 ({availableSnapDates.length}일분) ▾</option>
                {availableSnapDates.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.date} ({d.count}건 확정)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Warehouse */}
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-semibold text-gray-700">창고</span>
            <select
              value={selectedWh}
              onChange={(e) => setSelectedWh(e.target.value)}
              className="bg-white border border-gray-400 rounded px-1.5 py-0.5 text-[12px]"
            >
              <option value="전체">전체</option>
              {WAREHOUSES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor (거래처) */}
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-semibold text-gray-700">거래처</span>
            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="bg-white border border-gray-400 rounded px-1.5 py-0.5 text-[12px] max-w-[130px]"
            >
              <option value="전체">전체</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Status */}
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-semibold text-gray-700">상태</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white border border-gray-400 rounded px-1.5 py-0.5 text-[12px]"
            >
              {['전체', '정상', '부족', '과잉', '품절'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Search keyword */}
          <div className="flex shrink-0 items-center">
            <div className="relative">
              <input
                type="text"
                placeholder="품명/품번/거래처 검색"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="bg-white border border-gray-400 rounded pl-2 pr-6 py-0.5 text-[12px] w-40"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute right-1.5 top-1.5 pointer-events-none" />
            </div>
          </div>

          {/* Safety Shortage Filter */}
          <label className="flex shrink-0 items-center gap-1 cursor-pointer text-red-700 font-semibold">
            <input
              type="checkbox"
              checked={onlyShortage}
              onChange={(e) => setOnlyShortage(e.target.checked)}
              className="rounded border-red-400 text-red-600 focus:ring-0"
            />
            <span>안전재고 미달만</span>
          </label>
        </div>

        <div className="flex shrink-0 items-center gap-2 ml-auto">
          {dirtyRowIds.size > 0 && (
            <span className="bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded text-[11px] font-bold animate-pulse">
              수정 {dirtyRowIds.size}건
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-700" title={mergeInfo}>
            {snapshotMode ? (
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded text-[11px] font-bold">
                {targetDate.slice(5)} 확정분
              </span>
            ) : (
              <span className="bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded text-[11px] font-bold">
                현재고 LIVE
              </span>
            )}
            <span>
              총 <span className="text-blue-700">{filteredData.length.toLocaleString()}</span>건
            </span>
          </span>
          <button
            onClick={() => {
              setKeyword('');
              setSelectedWh('전체');
              setSelectedType('전체');
              setSelectedVendor('전체');
              setSelectedStatus('전체');
              setSelectedExpiry('전체');
              setOnlyShortage(false);
              void loadByDate(targetDate);
            }}
            title="필터 초기화 및 새로고침"
            className="p-1 text-gray-600 hover:text-black rounded hover:bg-gray-200 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2-0. 당일 재고조사표 미등록 안내 슬림 배너 */}
      {!isCurrentDateUploaded && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center justify-between text-amber-900 text-[12px] shrink-0 w-full">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>[재고조사표 미등록 안내]</strong> <strong>{targetDate}</strong> 일자의 현장 실사 재고조사표가 아직 업로드되지 않아,{' '}
              <span className="text-amber-800 font-bold bg-amber-100 px-1 py-0.5 rounded">실시간 전산 추정치(LIVE 현재고)</span>가 표시되고 있습니다.
              현장 재고조사표 엑셀을 업로드하시면 해당 일자의 확정 실사 재고로 영구 보관됩니다.
            </span>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5 py-0.5 rounded text-[11px] shrink-0 cursor-pointer transition-colors shadow-2xs"
          >
            <Upload className="w-3 h-3" />
            <span>재고조사표 엑셀 올리기</span>
          </button>
        </div>
      )}

      {/* 2-1. 빨간펜 확인필요 패널 (담당자 판단용, 클릭하면 해당 행으로 이동) */}
      {reviewOpen && reviewList.length > 0 && (
        <div className="bg-red-50 border-b border-red-300 px-3 py-1.5 shrink-0 w-full">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-red-800 text-[12px]">
              확인필요 {reviewList.length}건
            </span>
            <span className="text-[11px] text-red-600">클릭하면 해당 품목으로 이동 · 확인 후 저장하세요</span>
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              className="ml-auto px-2 py-0.5 bg-white border border-gray-400 rounded text-[11px] hover:bg-gray-100"
            >
              닫기
            </button>
          </div>
          <div className="mt-1 flex gap-1.5 flex-wrap max-h-[76px] overflow-auto">
            {reviewList.map((rv) => (
              <button
                key={`${rv.kind}-${rv.id}`}
                type="button"
                onClick={() => {
                  setKeyword(rv.name);
                  setSelectedRowId(rv.id);
                }}
                title="클릭하면 해당 품목만 표시"
                className="px-2 py-0.5 bg-white border border-red-300 rounded text-[11px] hover:bg-red-100 text-left"
              >
                <span className={`font-bold ${rv.kind === '신규' ? 'text-emerald-700' : 'text-red-700'}`}>
                  [{rv.kind}]
                </span>{' '}
                <span className="text-gray-800">{rv.name}</span>{' '}
                <span className="font-mono text-gray-600">
                  {rv.oldQty.toLocaleString()} → {rv.curQty.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Main Grid (여백 없이 전체 가로, 세로폭 100% 활용) */}
      <div className="flex-1 w-full bg-white overflow-hidden flex flex-col">
        <MasterDataGrid
          columns={columns}
          data={filteredData}
          selectedRowId={selectedRowId}
          onRowClick={(row) => setSelectedRowId(row.id)}
          onCellChange={handleCellChange}
          showRowIndex={true}
          summaryRow={false}
          enablePagination={false}
        />
      </div>
    </div>
  );
};

