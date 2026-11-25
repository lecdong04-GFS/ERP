import { normalizeDateYmd, pickLatestValidPrice } from '@/lib/gfs/bomMatch';
import { isTerminalProductStatus } from '@/lib/gfs/productStatus';

export { normalizeDateYmd, pickLatestValidPrice };

export type StrategyMode = 'tight' | 'standard' | 'safety';

/** 발주주기 문자열(예: 'D+2', 'D+2/1', 'D-2')에서 리드타임 일수 파싱 */
export function parseLeadTimeDays(orderCycle?: string): number {
  const nums = String(orderCycle || '')
    .match(/\d+/g)
    ?.map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums || nums.length === 0) return 1;
  return Math.min(14, Math.max(...nums));
}

/** YYYY-MM-DD 문자열 기준 날짜 덧셈/뺄셈 (타임존 안전 UTC 연산) */
export function addDaysYmd(ymd: string, days: number): string {
  const norm = normalizeDateYmd(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) return '';
  const [y, m, d] = norm.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + (Number(days) || 0)));
  return dt.toISOString().slice(0, 10);
}

const WEEKDAY_SUN0 = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** YYYY-MM-DD -> 한국어 요일 한 글자 ('월'~'일', 유효하지 않으면 '') */
export function getWeekdayCharYmd(ymd?: string | null): string {
  const norm = normalizeDateYmd(ymd || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) return '';
  const [y, m, d] = norm.split('-').map(Number);
  return WEEKDAY_SUN0[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * 발주일 + 품목 발주주기(orderCycle) / 협력사 리드타임 기반 입고예정일 계산
 * - explicitDeliveryDate가 유효한 YYYY-MM-DD면 우선 사용
 */
export function calcExpectedDeliveryInfo(params: {
  orderDate?: string | null;
  orderCycle?: string | null;
  explicitDeliveryDate?: string | null;
  partnerLeadTime?: number | null;
}): { expectedDate: string; leadDays: number; orderCycle: string } {
  const baseOrderDate = normalizeDateYmd(params.orderDate || '');
  const rawCycle = String(params.orderCycle || '').trim();
  const resolvedCycle =
    rawCycle ||
    (params.partnerLeadTime && params.partnerLeadTime > 0 ? `D+${params.partnerLeadTime}` : '');
  const leadDays = parseLeadTimeDays(resolvedCycle);
  const explicit = normalizeDateYmd(params.explicitDeliveryDate || '');
  const expectedDate = /^\d{4}-\d{2}-\d{2}$/.test(explicit)
    ? explicit
    : /^\d{4}-\d{2}-\d{2}$/.test(baseOrderDate)
      ? addDaysYmd(baseOrderDate, leadDays)
      : '';
  return {
    expectedDate,
    leadDays,
    orderCycle: resolvedCycle || `D+${leadDays}`,
  };
}

/**
 * 3대 발주 전략 모드(타이트/표준/안전)별 적용 발주일수 및 로스 버퍼 산출
 * - 365일 가동(토·일 포함 매일 소진) 기준: orderDowMon0 전달 시 오늘 발주분이 다음 발주 입고일 전날까지 버텨야 하는
 *   실제 달력 일수(calendarCoverageDays)를 하한으로 자동 보장 (예: 목요일 발주 → 월요일 입고)
 * - 표준: max(마스터 발주일수, 365일 기준 실제 커버 일수)
 * - 타이트: 리드타임·납품주기·365일 커버 일수 하한선을 유지하면서 여유일 압축
 * - 안전: 기준 일수 +1.0일 및 공정 감모 버퍼 +5% 가산 (0일 미설정 품목은 0 유지)
 */
export function calcStrategyOrderDays(params: {
  masterOrderDays: number;
  pattern: string;
  orderCycle?: string;
  strategyMode: StrategyMode;
  orderDowMon0?: number;
  supplier?: string;
  orderDay?: string;
  leadDays?: number;
}): {
  effectiveDays: number;
  lossRate: number;
  minFloorDays: number;
  calendarCoverageDays: number;
  isSingleOrderCoverage: boolean;
} {
  const master = Number(params.masterOrderDays) || 0;
  if (master <= 0) {
    return {
      effectiveDays: 0,
      lossRate: 1.0,
      minFloorDays: 0,
      calendarCoverageDays: 0,
      isSingleOrderCoverage: false,
    };
  }

  const calendarCoverageDays = calcCalendarCoverageDays365({
    orderDowMon0: params.orderDowMon0,
    supplier: params.supplier,
    orderDay: params.orderDay,
    orderCycle: params.orderCycle,
    leadDays: params.leadDays,
  });
  const baseDays = Math.max(master, calendarCoverageDays);
  const isSingleOrderCoverage = calendarCoverageDays > 0 && calendarCoverageDays >= master;

  if (params.strategyMode === 'standard') {
    return {
      effectiveDays: baseDays,
      lossRate: 1.0,
      minFloorDays: baseDays,
      calendarCoverageDays,
      isSingleOrderCoverage,
    };
  }
  if (params.strategyMode === 'safety') {
    return {
      effectiveDays: Math.round((baseDays + 1.0) * 100) / 100,
      lossRate: 1.05,
      minFloorDays: baseDays,
      calendarCoverageDays,
      isSingleOrderCoverage,
    };
  }

  // 타이트 모드: 리드타임 + 납품주기 + 365일 실제 커버 일수 기반 최소 방어 하한선 아래로는 절대 내리지 않음
  const leadDays =
    params.leadDays && params.leadDays > 0 ? params.leadDays : parseLeadTimeDays(params.orderCycle);
  const isDaily = params.pattern === '매일';
  const isTwiceWeekly = params.pattern === '수금' || params.pattern === '화금';
  const rawFloor = isDaily
    ? Math.max(2.0, leadDays + 0.5)
    : isTwiceWeekly
    ? Math.max(4.0, leadDays + 2.0)
    : Math.max(3.0, leadDays + 1.0);
  const minFloorDays = Math.max(calendarCoverageDays, Math.min(baseDays, rawFloor));
  const ratio = isDaily ? 0.7 : 0.8;
  const compressed = Math.round(baseDays * ratio * 2) / 2;
  const effectiveDays = Math.min(baseDays, Math.max(minFloorDays, compressed));
  return {
    effectiveDays,
    lossRate: 1.0,
    minFloorDays,
    calendarCoverageDays,
    isSingleOrderCoverage,
  };
}

// GFS 발주시트 공용 계산 (일반/요일별 화면 공용, 클라이언트 안전)
export interface SheetRowInput {
  id: number;
  productId?: number;
  targetOrderDays?: number;
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
  status?: string;
  orderCycle?: string;
  leadDays?: number;
  consumedSinceSnap?: number;
  snapAsOfDate?: string;
  discontinuedDate?: string;
  isDormant?: boolean;
  dormantTier?: 'active' | 'dormant' | 'unlinked_dormant';
  activeBomCount?: number;
  lastBomOrderDate?: string;
  lastSnapDecreaseDate?: string;
  suppressedSurveyDailyUsage?: number;
  isReplaced?: boolean;
  replacementNote?: string;
  orderMethod?: string;
  partnerRemark?: string;
  partnerTel?: string;
  partnerEmail?: string;
  partnerContact?: string;
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
  const incoming = Number(r.incoming) || 0;
  const currentStock = Number(r.currentStock) || 0;
  const consumedSinceSnap = Math.max(0, Number(r.consumedSinceSnap) || 0);
  const dailyUsage = Math.max(0, Number(r.dailyUsage) || 0);
  const days = Math.max(0, Number(r.days) || 0);
  const bagPrice = Math.max(0, Number(r.bagPrice) || 0);

  const totalStock = Math.max(0, incoming + currentStock - consumedSinceSnap);
  const required = dailyUsage * days;
  const diff = totalStock - required;
  const stockDays = dailyUsage > 0 ? totalStock / dailyUsage : NaN;
  const shortageBags = required - totalStock;
  const boxesStd = pack > 0 ? shortageBags / pack : NaN;
  const suggest = pack > 0 ? Math.ceil(Math.max(0, shortageBags) / pack) : 0;
  const finalBoxes = Math.max(0, Number(r.manual ? r.finalBoxes : suggest) || 0);
  const amount = finalBoxes * pack * bagPrice;
  const dailyBox = dailyUsage > 0 && pack > 0 ? (dailyUsage * 7.5) / pack / 7 : NaN;
  return { pack, totalStock, required, diff, stockDays, shortageBags, boxesStd, suggest, finalBoxes, amount, dailyBox };
}

/** 거래처 헤더 및 DB orderDay 에서 납품요일 파싱 (월~일 순서 boolean) */
export function parseDeliveryDays(header: string, orderDay?: string): boolean[] {
  const h = (orderDay || header || '').replace(/\s+/g, '');
  if (/월화수목금토|월~토/.test(h) || (/월수금/.test(h) && /화목토/.test(h))) {
    return [true, true, true, true, true, true, false];
  }
  // '매일' 단독 키워드만 매칭 (매일유업/일미 등 오매칭 방지)
  if (/^매일$/.test(h)) return [true, true, true, true, true, true, false];
  if (/월화수목금|주5일|월~금/.test(h)) return [true, true, true, true, true, false, false];
  if (/월수금/.test(h)) return [true, false, true, false, true, false, false];
  if (/화목토/.test(h)) return [false, true, false, true, false, true, false];
  if (/[월화수목금토일]/.test(h)) {
    return DAY_CHARS.map((d) => h.includes(d));
  }
  // 기본 기본값: 주 5일 (월~금) 정상 배분 (특정 요일 몰림 방지)
  return [true, true, true, true, true, false, false];
}

export interface SplitWeekOptions {
  /**
   * 토요 입고배려 (기본 true: 토요일 입고 부담을 ~20% 완화하고 평일로 부드럽게 분산)
   * 예: 화목토 패턴 시 1:1:1 대신 1.1 : 1.1 : 0.8 비율 적용
   */
  weekendRelief?: boolean;
  /**
   * 365일 가동 기준 단일 발주 사이클 커버 (오늘 발주분이 다음 발주 입고일 전날까지 1회분 전체인 경우)
   * true이면 주중 분할 없이 해당 발주일(idx[0])에 전량 배정
   */
  singleOrderCoverage?: boolean;
  /**
   * 365일 가동 기준 특정 발주일(dow)에 다음 발주 입고일 전날까지 결품이 나지 않도록 보장하는 최소 박스 수
   */
  minDayCoverage?: { dow: number; boxes: number };
}

function isFlexibleAdvanceOrder(header: string, orderDay?: string, leadDays?: number): boolean {
  if (leadDays && leadDays >= 7) return true;
  const h = (orderDay || header || '').replace(/\s+/g, '');
  return /미리발주|수시/.test(h);
}

/**
 * 발주 요일(0=월..6=일)에서 리드타임과 휴무일(일요일, 토요 미납품 거래처의 토요일)을 건너뛴 예상 입고 요일(0=월..6=일) 및 실제 일수 오프셋 산출
 */
export function advanceOrderToArrivalDow(
  orderDowMon0: number,
  leadDays: number,
  arrivalDays: boolean[]
): { arrDow: number | null; calendarShift: number } {
  const skipSun = !arrivalDays[6];
  const skipSat = !arrivalDays[5];
  if (orderDowMon0 === 6 && skipSun) return { arrDow: null, calendarShift: 0 };
  if (orderDowMon0 === 5 && skipSat) return { arrDow: null, calendarShift: 0 };

  let d = orderDowMon0;
  let calendarShift = 0;
  let remaining = Math.max(1, Math.min(21, Math.round(leadDays || 1)));
  while (remaining > 0 && calendarShift < 28) {
    d = (d + 1) % 7;
    calendarShift++;
    if ((d === 6 && skipSun) || (d === 5 && skipSat)) continue;
    remaining--;
  }
  return { arrDow: d, calendarShift };
}

/** 거래처 헤더·입고요일·리드타임 기준 실제 발주 가능 요일(0=월..6=일 boolean) 산출 */
export function getOrderAllowedDays(
  header: string,
  orderDay?: string,
  orderCycle?: string,
  leadDaysInput?: number
): boolean[] {
  const arrivalDays = parseDeliveryDays(header, orderDay);
  const resolvedLead = leadDaysInput && leadDaysInput > 0 ? leadDaysInput : parseLeadTimeDays(orderCycle);
  if (isFlexibleAdvanceOrder(header, orderDay, resolvedLead)) {
    return [true, true, true, true, true, false, false];
  }
  return arrivalDays.map((_, d) => {
    const { arrDow } = advanceOrderToArrivalDow(d, resolvedLead, arrivalDays);
    return arrDow !== null && Boolean(arrivalDays[arrDow]);
  });
}

/** 기준 발주일 기준 다음 유효 발주일 및 리드타임·휴무 반영 입고예정일 계산 */
export function getExpectedArrivalSchedule(params: {
  baseOrderYmd: string;
  supplier?: string;
  orderDay?: string;
  orderCycle?: string;
  leadDays?: number;
}): {
  effectiveOrderYmd: string;
  expectedInYmd: string;
  shiftDays: number;
  leadDays: number;
  isNextOrderDay: boolean;
} {
  const leadDays =
    params.leadDays && params.leadDays > 0 ? params.leadDays : parseLeadTimeDays(params.orderCycle);
  const baseYmd = params.baseOrderYmd;
  const arrivalDays = parseDeliveryDays(params.supplier || '', params.orderDay);
  const allowedOrderDays = getOrderAllowedDays(
    params.supplier || '',
    params.orderDay,
    params.orderCycle,
    leadDays
  );
  const monIdx = (new Date(`${baseYmd}T00:00:00+09:00`).getDay() + 6) % 7;
  let shiftDays = 0;
  if (allowedOrderDays.some(Boolean) && !allowedOrderDays[monIdx]) {
    for (let offset = 1; offset <= 7; offset++) {
      if (allowedOrderDays[(monIdx + offset) % 7]) {
        shiftDays = offset;
        break;
      }
    }
  }
  const effectiveOrderYmd = shiftDays > 0 ? addDaysYmd(baseYmd, shiftDays) : baseYmd;
  const effMonIdx = (monIdx + shiftDays) % 7;
  const calendarShift = isFlexibleAdvanceOrder(params.supplier || '', params.orderDay, leadDays)
    ? leadDays
    : advanceOrderToArrivalDow(effMonIdx, leadDays, arrivalDays).calendarShift || leadDays;
  const expectedInYmd = addDaysYmd(effectiveOrderYmd, calendarShift);
  return {
    effectiveOrderYmd,
    expectedInYmd,
    shiftDays,
    leadDays,
    isNextOrderDay: shiftDays > 0,
  };
}

/**
 * 365일 가동(토·일 포함 매일 소진) 기준 발주일(0=월..6=일)에서의 실제 커버 필요 일수 산출
 * - 오늘 발주분이 "다음 발주일의 입고일" 전날까지 버텨야 하는 달력 일수
 * - 예) 목요일(3) 발주 → 월요일 입고, 다음 월요일(0) 발주 → 수요일 입고(D+2)라면 총 6일(목~화)
 */
export function calcCalendarCoverageDays365(params: {
  orderDowMon0?: number;
  supplier?: string;
  orderDay?: string;
  orderCycle?: string;
  leadDays?: number;
}): number {
  const dow = params.orderDowMon0;
  if (dow === undefined || dow === null || dow < 0 || dow > 6) return 0;

  const supplier = params.supplier || '';
  const orderDay = params.orderDay;
  const resolvedLead =
    params.leadDays && params.leadDays > 0
      ? params.leadDays
      : parseLeadTimeDays(params.orderCycle);

  if (isFlexibleAdvanceOrder(supplier, orderDay, resolvedLead)) return 0;

  const arrivalDays = parseDeliveryDays(supplier, orderDay);
  const allowedOrderDays = getOrderAllowedDays(supplier, orderDay, params.orderCycle, resolvedLead);
  if (!allowedOrderDays[dow]) return 0;

  let nextOrderOffset = 0;
  for (let off = 1; off <= 7; off++) {
    if (allowedOrderDays[(dow + off) % 7]) {
      nextOrderOffset = off;
      break;
    }
  }
  if (nextOrderOffset <= 0) return 0;

  const nextOrderDow = (dow + nextOrderOffset) % 7;
  const nextArr = advanceOrderToArrivalDow(nextOrderDow, resolvedLead, arrivalDays);
  if (nextArr.arrDow === null || nextArr.calendarShift <= 0) return 0;

  return nextOrderOffset + nextArr.calendarShift;
}

/**
 * 확정량을 실제 발주 가능 요일(입고요일 - 리드타임)과 목표재고일수 창 내 입고 횟수에 맞춰 비례 분할 (해밀턴 최대잔여법)
 * activeDayMask 전달 시 해당 주에서 실제 발주 가능한 요일에만 배분하며, 주 후반부 몰림 방지를 위해 차주 입고 슬롯까지 분할 모수에 반영
 */
export function splitWeek(
  r: SheetRowInput,
  finalBoxes: number,
  activeDayMask?: boolean[],
  options?: SplitWeekOptions
): number[] {
  const arrivalDays = parseDeliveryDays(r.supplier || '', r.orderDay);
  const resolvedLead =
    r.leadDays && r.leadDays > 0 ? r.leadDays : parseLeadTimeDays(r.orderCycle);
  const days = getOrderAllowedDays(r.supplier || '', r.orderDay, r.orderCycle, resolvedLead);
  const eligible = activeDayMask ? days.map((on, i) => Boolean(on && activeDayMask[i])) : days;
  const idx = eligible.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  const out = [0, 0, 0, 0, 0, 0, 0];
  if (finalBoxes <= 0 || idx.length === 0) return out;
  if (options?.singleOrderCoverage) {
    out[idx[0]] = finalBoxes;
    return out;
  }

  const targetDays = Number(r.targetOrderDays ?? r.days) || 0;
  const flexible = isFlexibleAdvanceOrder(r.supplier || '', r.orderDay, resolvedLead);

  let winDelivs = idx.length;
  if (!flexible && targetDays > 0) {
    const firstArr = advanceOrderToArrivalDow(idx[0], resolvedLead, arrivalDays).arrDow;
    if (firstArr !== null) {
      const horizon = Math.min(7, Math.max(1, Math.round(targetDays)));
      let cnt = 0;
      for (let off = 0; off < horizon; off++) {
        if (arrivalDays[(firstArr + off) % 7]) cnt++;
      }
      winDelivs = Math.max(1, cnt);
    }
  }

  const activeSlots = idx.slice(0, Math.max(1, winDelivs));
  const overflowCount = Math.max(0, winDelivs - activeSlots.length);

  if (activeSlots.length === 1 && overflowCount === 0) {
    out[activeSlots[0]] = finalBoxes;
    return out;
  }

  const applyWeekendRelief = options?.weekendRelief === true;

  // 1. 금주 활성 발주 요일 가중치 맵 구성
  const weights: Record<number, number> = {};
  activeSlots.forEach((i) => {
    weights[i] = WEEKDAY_DEMAND_FACTORS[i]?.factor || 1.0;
  });

  // 토요 입고배려: 토요일(5)이 포함되어 있고 주중 활성 요일(0~4)이 존재하는 경우
  if (applyWeekendRelief && activeSlots.includes(5)) {
    const weekdayIndices = activeSlots.filter((i) => i < 5);
    if (weekdayIndices.length > 0) {
      const pat = classifyPattern(r.supplier || '', r.orderDay);
      const isTueThuSat =
        pat === '화목토' ||
        (activeSlots.includes(1) && activeSlots.includes(3) && activeSlots.includes(5)) ||
        (activeSlots.length === 2 && (activeSlots.includes(1) || activeSlots.includes(3)) && activeSlots.includes(5));

      if (isTueThuSat) {
        if (weights[1] !== undefined) weights[1] = 1.1;
        if (weights[3] !== undefined) weights[3] = 1.1;
        weights[5] = 0.8;
      } else {
        const origSatWeight = weights[5];
        const reliefSatWeight = origSatWeight * 0.8;
        const savedWeight = origSatWeight - reliefSatWeight;
        weights[5] = reliefSatWeight;
        const addPerWeekday = savedWeight / weekdayIndices.length;
        weekdayIndices.forEach((wIdx) => {
          weights[wIdx] = weights[wIdx] + addPerWeekday;
        });
      }
    }
  }

  // 차주 이월 슬롯(가상 분할 모수) 구성: 금주 말에 전체 부족분을 한 번에 몰지 않음
  const weeklyOrderIndices = days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  const allSlots: Array<{ dow: number; weight: number; isOverflow: boolean; slotPos: number }> = [];
  activeSlots.forEach((dow, pos) => {
    allSlots.push({ dow, weight: weights[dow] || 1.0, isOverflow: false, slotPos: pos });
  });
  for (let k = 0; k < overflowCount; k++) {
    const nextDow = weeklyOrderIndices.length > 0 ? weeklyOrderIndices[k % weeklyOrderIndices.length] : k % 7;
    allSlots.push({
      dow: nextDow,
      weight: WEEKDAY_DEMAND_FACTORS[nextDow]?.factor || 1.0,
      isOverflow: true,
      slotPos: activeSlots.length + k,
    });
  }

  // 2. 전체 분할 모수(금주 + 차주 이월 슬롯) 기준 가중치 합산
  const totalWeight = allSlots.reduce((acc, s) => acc + s.weight, 0);
  if (totalWeight <= 0) {
    const base = Math.floor(finalBoxes / allSlots.length);
    let rem = finalBoxes - base * allSlots.length;
    allSlots.forEach((s) => {
      const qty = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      if (!s.isOverflow) out[s.dow] += qty;
    });
    return out;
  }

  // 3. 가중치 비례 실수 배분 및 기초 정수 할당
  let allocatedSum = 0;
  const fractions: { dow: number; isOverflow: boolean; remainder: number; weight: number; slotPos: number }[] = [];

  allSlots.forEach((s) => {
    const exact = (finalBoxes * s.weight) / totalWeight;
    const floor = Math.floor(exact);
    if (!s.isOverflow) out[s.dow] += floor;
    allocatedSum += floor;
    fractions.push({
      dow: s.dow,
      isOverflow: s.isOverflow,
      remainder: exact - floor,
      weight: s.weight,
      slotPos: s.slotPos,
    });
  });

  // 4. 남은 잔여 박스는 금주 슬롯(결품 방지 우선) → 잔여 소수점 큰 순 → 가중치/이른 요일 순 배정
  const remainder = finalBoxes - allocatedSum;
  fractions.sort(
    (a, b) =>
      (a.isOverflow ? 1 : 0) - (b.isOverflow ? 1 : 0) ||
      b.remainder - a.remainder ||
      b.weight - a.weight ||
      a.slotPos - b.slotPos
  );

  for (let k = 0; k < remainder; k++) {
    const target = fractions[k % fractions.length];
    if (!target.isOverflow) out[target.dow] += 1;
  }

  // 5. 365일 가동 기준 당일 최소 결품 방어선(다음 발주 입고일 전날까지 부족분) 보장
  if (options?.minDayCoverage && options.minDayCoverage.boxes > 0) {
    const { dow, boxes } = options.minDayCoverage;
    if (eligible[dow] && boxes > out[dow]) {
      out[dow] = Math.min(finalBoxes, boxes);
    }
  }

  return out;
}

/** 납품 패턴 분류 */
export function classifyPattern(header: string, orderDay?: string): '매일' | '월수금' | '화목토' | '수금' | '화금' | '주5일' | '기타' {
  const h = (orderDay || header || '').replace(/\s+/g, '');
  if (!h) return '기타';
  if (/월화수목금토|월~토/.test(h)) return '매일';
  // '매일' 단독 키워드: 정확히 '매일'만 (매일유업/일미 등 오매칭 방지)
  if (/^매일$/.test(h)) return '매일';
  if (/월화수목금|주5일|월~금/.test(h)) return '주5일';
  const hasMonWedFri = h.includes('월') && h.includes('수') && h.includes('금');
  const hasTueThuSat = h.includes('화') && h.includes('목') && h.includes('토');
  if (hasMonWedFri && !hasTueThuSat) return '월수금';
  if (hasTueThuSat && !hasMonWedFri) return '화목토';
  // 수금, 화금 패턴
  const hasWed = h.includes('수'), hasFri = h.includes('금');
  const hasTue = h.includes('화');
  if (hasWed && hasFri && !h.includes('월') && !hasTue && !h.includes('목') && !h.includes('토')) return '수금';
  if (hasTue && hasFri && !h.includes('월') && !hasWed && !h.includes('목') && !h.includes('토')) return '화금';
  // 나머지 요일 조합
  if (/[월화수목금토일]/.test(h)) return '기타';
  return '기타';
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
  '오이피클랠리쉬',
  '순성)당근채',
];

export interface ScheduledExclusion {
  keyword: string;
  effectiveDate: string; // YYYY-MM-DD (해당 일자부터 발주 자동 제외)
  label: string;
}

/** 삭제 예정 일자별 자동 발주 제외 목록 */
export const SCHEDULED_ORDER_EXCLUSIONS: ScheduledExclusion[] = [
  { keyword: '늘푸른피클랠리쉬', effectiveDate: '2026-11-11', label: '11/11 삭제예정' },
];

function kstTodayStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function getScheduledExclusion(name?: string | null): ScheduledExclusion | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  const clean = lower.replace(/\s+/g, '');
  return (
    SCHEDULED_ORDER_EXCLUSIONS.find((s) => {
      const k = s.keyword.toLowerCase();
      return lower.includes(k) || clean.includes(k.replace(/\s+/g, ''));
    }) || null
  );
}

export function isExcludedFromOrder(name?: string | null, targetDate?: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  const clean = lower.replace(/\s+/g, '');
  // '[상온] 피클랠리쉬 (3KG * 6캔)' 등 단독 피클랠리쉬만 즉시 제외 ('늘푸른피클랠리쉬' 오매칭 방지)
  const cleanNoTag = clean.replace(/^\[[^\]]+\]/, '');
  if (cleanNoTag.startsWith('피클랠리쉬')) {
    return true;
  }
  // 중복 품목 방어: 단독 '[상온]흑미'만 제외 ('[상온] 흑미 10KG*1개입', '[냉동]흑미송편(2kg*4p)' 등 유지)
  if (clean === '[상온]흑미') {
    return true;
  }
  // 중복 품목 방어: '[냉동] 당근채(10kg/box)', 단독 '[냉장]당근채' 제외 ('[냉장] 당근채(4kg*3봉 - 1박스)', '[냉장] 당근(10kg*1box)' 유지)
  if (clean.includes('냉동]당근채') || cleanNoTag.startsWith('당근채(10kg') || clean === '[냉장]당근채') {
    return true;
  }

  if (
    EXCLUDED_ORDER_KEYWORDS.some((kw) => {
      const k = kw.toLowerCase();
      return lower.includes(k) || clean.includes(k.replace(/\s+/g, ''));
    })
  ) {
    return true;
  }

  const scheduled = getScheduledExclusion(name);
  if (scheduled) {
    const todayStr = kstTodayStr();
    const normTarget = targetDate ? targetDate.trim().replace(/\./g, '-').slice(0, 10) : '';
    const validTarget = /^\d{4}-\d{2}-\d{2}$/.test(normTarget) ? normTarget : '';
    if (todayStr >= scheduled.effectiveDate && validTarget === '') {
      // targetDate 미지정 시에만 서버 날짜 기준 제외
      return true;
    }
    if (validTarget !== '' && validTarget >= scheduled.effectiveDate) {
      // 명시적 targetDate가 주어졌을 때는 그 날짜만 기준
      return true;
    }
  }

  return false;
}

export function isExcludedOrderMaterial(
  product: { name?: string | null; isUsed?: boolean | null; discontinuedDate?: string | null; status?: string | null },
  targetDate?: string
): boolean {
  if (!product) return true;
  if (product.isUsed === false) return true;
  if (isTerminalProductStatus(product.status)) return true;
  const checkDate = targetDate ? normalizeDateYmd(targetDate) : kstTodayStr();
  if (isExcludedFromOrder(product.name, checkDate)) return true;
  const discDate = product.discontinuedDate ? normalizeDateYmd(product.discontinuedDate) : '';
  if (discDate && checkDate >= discDate) return true;
  return false;
}
