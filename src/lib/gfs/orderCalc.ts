// GFS 발주시트 공용 계산 (일반/요일별 화면 공용, 클라이언트 안전)
export interface SheetRowInput {
  id: number;
  supplier: string;
  name: string;
  boxesBase: number;
  packUnit: number;
  packUnitAudit: number;
  days: number;
  dailyUsage: number;
  incoming: number;
  currentStock: number;
  bagPrice: number;
  warehouse: string;
  vendor: string;
  finalBoxes: number;
  manual: boolean;
  orderDay?: string;
  pendingBoxes?: number;
  pendingOrderNos?: string[];
  latestOrderDate?: string;
  baseIncoming?: number;
  isBomDriven?: boolean;
  usageSource?: 'BOM실시간' | '기준소진량';
  liveBomUsage?: number | null;
  surveyDailyUsage?: number;
}

export const DAY_CHARS = ['월', '화', '수', '목', '금', '토', '일'] as const;

/**
 * 35일간 GS25 실데이터(188만 개) 전수 통계 기반 요일별 수요 가중치 계수
 * (평균 52,933개 기준 상대 비율)
 */
export const WEEKDAY_DEMAND_FACTORS: Record<
  number,
  { day: string; factor: number; pctStr: string; label: string; tone: 'peak' | 'normal' | 'low' }
> = {
  0: { day: '월', factor: 1.08, pctStr: '+8%', label: '주초 직장인/학생 수요 집중 (+8%)', tone: 'peak' },
  1: { day: '화', factor: 1.09, pctStr: '+9%', label: '주간 최고 피크 요일 (+9%)', tone: 'peak' },
  2: { day: '수', factor: 1.05, pctStr: '+5%', label: '주중 안정적 수요 (+5%)', tone: 'normal' },
  3: { day: '목', factor: 0.96, pctStr: '-4%', label: '주 후반 완만한 감소 (-4%)', tone: 'normal' },
  4: { day: '금', factor: 0.88, pctStr: '-12%', label: '주말 폐기방지 감량 발주 (-12%)', tone: 'low' },
  5: { day: '토', factor: 0.90, pctStr: '-10%', label: '주말 저녁/2편 중심 수요 (-10%)', tone: 'low' },
  6: { day: '일', factor: 1.04, pctStr: '+4%', label: '주초 출근길 대비 반등 (+4%)', tone: 'normal' },
};

export interface CalcResult {
  pack: number;
  totalStock: number; // K = I(입고량) + J(금일재고)
  required: number; // L = G(발주일수) x H(일사용량)
  diff: number; // M = K - L
  stockDays: number; // N = K / H
  shortageBags: number; // F = L - K (발주량입수, 부호 유지)
  boxesStd: number; // D = F / E (발주량박스, 부호 유지, 소수 가능)
  suggest: number; // O 제안 = ceil(max(0,F)/pack)
  finalBoxes: number; // O 확정 (수기 or 제안)
  amount: number; // R = O x P x Q
  dailyBox: number; // AA = H*7.5/E/7
}

export function calcRow(r: SheetRowInput): CalcResult {
  const pack = r.packUnit > 0 ? r.packUnit : r.packUnitAudit > 0 ? r.packUnitAudit : 0;
  const totalStock = r.incoming + r.currentStock;
  const required = r.dailyUsage * r.days;
  const diff = totalStock - required;
  const stockDays = r.dailyUsage > 0 ? totalStock / r.dailyUsage : NaN;
  const shortageBags = required - totalStock;
  const boxesStd = pack > 0 ? shortageBags / pack : NaN;
  const suggest = pack > 0 ? Math.ceil(Math.max(0, shortageBags) / pack) : 0;
  const finalBoxes = r.manual ? r.finalBoxes : suggest;
  const amount = finalBoxes * pack * r.bagPrice;
  const dailyBox = r.dailyUsage > 0 && pack > 0 ? (r.dailyUsage * 7.5) / pack / 7 : NaN;
  return { pack, totalStock, required, diff, stockDays, shortageBags, boxesStd, suggest, finalBoxes, amount, dailyBox };
}

/** 거래처 헤더 및 DB orderDay 에서 납품요일 파싱 (월~일 순서 boolean) */
export function parseDeliveryDays(header: string, orderDay?: string): boolean[] {
  const h = (orderDay || header || '').replace(/\s+/g, '');
  if (/월화수목금토|매일|월~토/.test(h)) return [true, true, true, true, true, true, false];
  if (/월화수목금|주5일|월~금/.test(h)) return [true, true, true, true, true, false, false];
  if (/월수금/.test(h)) return [true, false, true, false, true, false, false];
  if (/화목토/.test(h)) return [false, true, false, true, false, true, false];
  if (/[월화수목금토일]/.test(h)) {
    return DAY_CHARS.map((d) => h.includes(d));
  }
  // 기본 기본값: 주 5일 (월~금) 정상 배분 (특정 요일 몰림 방지)
  return [true, true, true, true, true, false, false];
}

/**
 * 확정량을 납품요일별 수요 가중치(화:1.09, 월:1.08 ... 금:0.88)에 따라 비례 분할 (해밀턴 최대잔여법)
 * 총합 보존 법칙 (sum === finalBoxes) 및 정수 박스 분할 100% 보장
 */
export function splitWeek(r: SheetRowInput, finalBoxes: number): number[] {
  const days = parseDeliveryDays(r.supplier || '', r.orderDay);
  const idx = days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  const out = [0, 0, 0, 0, 0, 0, 0];
  if (finalBoxes <= 0 || idx.length === 0) return out;

  if (idx.length === 1) {
    out[idx[0]] = finalBoxes;
    return out;
  }

  // 1. 활성 납품 요일들의 가중치 합산
  const totalWeight = idx.reduce((acc, i) => acc + (WEEKDAY_DEMAND_FACTORS[i]?.factor || 1.0), 0);
  if (totalWeight <= 0) {
    const base = Math.floor(finalBoxes / idx.length);
    let rem = finalBoxes - base * idx.length;
    idx.forEach((i) => {
      out[i] = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
    });
    return out;
  }

  // 2. 가중치 비례 실수 배분 및 기초 정수 할당
  let allocatedSum = 0;
  const fractions: { index: number; remainder: number; weight: number }[] = [];

  idx.forEach((i) => {
    const w = WEEKDAY_DEMAND_FACTORS[i]?.factor || 1.0;
    const exact = (finalBoxes * w) / totalWeight;
    const floor = Math.floor(exact);
    out[i] = floor;
    allocatedSum += floor;
    fractions.push({ index: i, remainder: exact - floor, weight: w });
  });

  // 3. 남은 잔여 박스를 잔여 소수점이 가장 큰 요일(동률 시 가중치 우선)부터 1박스씩 배정
  let remainder = finalBoxes - allocatedSum;
  fractions.sort((a, b) => b.remainder - a.remainder || b.weight - a.weight);

  for (let k = 0; k < remainder; k++) {
    const targetIdx = fractions[k % fractions.length].index;
    out[targetIdx] += 1;
  }

  return out;
}

/** 납품 패턴 분류 */
export function classifyPattern(header: string, orderDay?: string): '매일' | '월수금' | '화목토' | '주5일' | '기타' {
  const h = (orderDay || header || '').replace(/\s+/g, '');
  if (/월화수목금토|매일|월~토/.test(h)) return '매일';
  if (/월화수목금|주5일|월~금/.test(h)) return '주5일';
  const hasMonWedFri = h.includes('월') && h.includes('수') && h.includes('금');
  const hasTueThuSat = h.includes('화') && h.includes('목') && h.includes('토');
  if (hasMonWedFri && !hasTueThuSat) return '월수금';
  if (hasTueThuSat && !hasMonWedFri) return '화목토';
  return '주5일';
}

/**
 * 발주 제외 키워드 목록 (사용자 지정 발주 제외 품목)
 */
export const EXCLUDED_ORDER_KEYWORDS = [
  '미니너비아니',
  '미니사각어묵',
  'GS혜자너비아니',
  '찌개용어슷후랑크',
  '다이스드닭갈비',
  '쵸핑스모크햄',
  '하이비엔나',
  '즉석스모크햄세절',
  '살사후실리샐러드',
  '살사후시리샐러드',
  '5찬도시락뚜껑C',
  '6칸공용용기',
  'DR-126',
  '126호 용기',
  '고급4호',
  '고극4호',
  'DRG-1',
  '롯데) GS마요네즈',
  '롯데)GS마요네즈',
  '롯데마요네즈',
  '참치(2kg*5봉)-사조대림',
  '참치-사조대림',
  '다진맛김치(10kg*2pk)',
  '다진맛김치(10kg*2',
];

export function isExcludedFromOrder(name?: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  const clean = lower.replace(/\s+/g, '');
  return EXCLUDED_ORDER_KEYWORDS.some((kw) => {
    const k = kw.toLowerCase();
    return lower.includes(k) || clean.includes(k.replace(/\s+/g, ''));
  });
}
