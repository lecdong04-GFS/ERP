// GFS BOM/발주 공용 헬퍼 — 클라이언트+서버 공용 (fs/prisma 무사용, pure TS)

/* ───────── 날짜 유틸 ───────── */

/** '11/9/26' → '2026-11-09', '2026-11-09' 그대로, Excel serial → ISO */
export function normalizeDateYmd(s: string | null | undefined): string {
  if (!s) return '';
  const raw = String(s).trim();
  if (!raw) return '';

  // Excel serial number (e.g. 46340)
  if (/^\d{5}$/.test(raw)) {
    const d = new Date((Number(raw) - 25569) * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // MM/DD/YY or M/D/YY (e.g. '11/9/26')
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const mm = slashMatch[1].padStart(2, '0');
    const dd = slashMatch[2].padStart(2, '0');
    let yy = Number(slashMatch[3]);
    if (yy < 100) yy += 2000;
    return `${yy}-${mm}-${dd}`;
  }

  // YYYY.MM.DD or YYYY/MM/DD
  const dotMatch = raw.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (dotMatch) {
    return `${dotMatch[1]}-${dotMatch[2].padStart(2, '0')}-${dotMatch[3].padStart(2, '0')}`;
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  return raw;
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

/* ───────── 수주 중복 제거 ───────── */

export interface MinimalOrder {
  remark?: string | null;
  orderDate?: string | null;
  totalQty?: number | null;
  totalAmount?: number | null;
}

export function dedupSalesOrders<T extends MinimalOrder>(orders: T[]): T[] {
  const seen = new Set<string>();
  return orders.filter((o) => {
    const key =
      o.remark && o.remark.startsWith('DOC:')
        ? o.remark
        : `${o.orderDate}_${o.totalQty}_${o.totalAmount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ───────── 단가 선택 ───────── */

export interface MinimalPrice {
  id: number;
  effectiveDate?: string | null;
  purchasePrice?: number | null;
  deliveryPrice?: number | null;
}

/** effectiveDate 정규화 → 최신 유효 단가 선택 (purchasePrice > 0 우선) */
export function pickLatestValidPrice(prices: MinimalPrice[]): MinimalPrice | null {
  if (!prices || prices.length === 0) return null;
  const sorted = prices
    .map((p) => ({ ...p, _eff: normalizeDateYmd(p.effectiveDate) }))
    .filter((p) => isValidYmd(p._eff))
    .sort((a, b) => {
      if (a._eff !== b._eff) return b._eff.localeCompare(a._eff);
      return b.id - a.id;
    });
  // purchasePrice > 0 우선
  const withPrice = sorted.find((p) => (p.purchasePrice ?? 0) > 0);
  return withPrice || sorted[0] || null;
}

export function pickLatestDeliveryPrice(prices: MinimalPrice[]): MinimalPrice | null {
  if (!prices || prices.length === 0) return null;
  const sorted = prices
    .map((p) => ({ ...p, _eff: normalizeDateYmd(p.effectiveDate) }))
    .filter((p) => isValidYmd(p._eff))
    .sort((a, b) => {
      if (a._eff !== b._eff) return b._eff.localeCompare(a._eff);
      return b.id - a.id;
    });
  const withPrice = sorted.find((p) => (p.deliveryPrice ?? 0) > 0);
  return withPrice || sorted[0] || null;
}

/* ───────── BOM 일사용량 계산 ───────── */

/**
 * BOM 기반 일사용량 = ROUNDUP(SUM(메뉴수량×단위소요량) / divisor × multiplier × orderBuffer, roundDigits)
 * - divisor: 단위환산분모 (1000=1kg, 2000=2kg 등) — Product.bomDivisor
 * - multiplier: Product.bomMultiplier (기본 1)
 * - orderBuffer: BomDetail.orderBuffer (기본 1, 예: 1.1, 0.85 등)
 * - roundDigits: Product.bomRoundDigits (기본 1)
 */
export function calcDailyUsageFromParams(
  dailyGrams: number,
  divisor: number,
  multiplier: number,
  orderBuffer: number,
  roundDigits: number,
): number {
  const d = divisor > 0 ? divisor : 1000;
  const m = multiplier > 0 ? multiplier : 1;
  const b = orderBuffer > 0 ? orderBuffer : 1;
  const r = roundDigits >= 0 ? roundDigits : 1;
  const raw = (dailyGrams / d) * b;
  const factor = Math.pow(10, r);
  const rounded = Math.ceil(Math.round(raw * factor * 1e6) / 1e6) / factor;
  // 엑셀 H열: ROUNDUP(SUMPRODUCT/분모, 자릿수) * 계수 (계수는 반올림 후 곱함)
  return Math.round(rounded * m * 1000) / 1000;
}

/* ───────── BOM 매칭 ───────── */

/** 완제품 이름 정규화 (BOM 매칭용): '(주문)', '1편/2편', 공백 제거 */
export function normalizeForBom(name: string): string {
  let s = (name || '').trim();
  s = s.replace(/^\(주문\)\s*/, '');
  s = s.replace(/\s*[12]편$/, '');
  s = s.replace(/[12]$/, '');
  s = s.replace(/\s+/g, '');
  return s;
}

/** BOM 공용 별명 매핑 (여러 품명이 동일 BOM을 참조하는 경우) — 키/값 모두 원본 표기, 비교는 menuKey() 기준 */
export const CUSTOM_BOM_ALIAS: Record<string, string> = {
  // 11월 신메뉴 (수주 품명 → 발주시트 정본 BOM 메뉴명)
  'NEW뭘좋아할지몰라다넣어': '뭘좋아할지몰라다넣어봤어',
  'NEW뭘좋아할지몰라다넣어봤어': '뭘좋아할지몰라다넣어봤어',
  '더큰)들기름묵은지참치': '종가)들기름묵은지참치',
  '커플)곱창김참치&비빔밥': '커플)곱창김참치마요&전주비빔',
  '넷플)더담은K떡갈비김밥': '넷플)K스타일떡갈비김밥',
  '디핑)에그햄꼬마김밥': '용기)에그햄꼬마김밥',
  '디핑)시장꼬마김밥': '용기)광장시장꼬마김밥',
  '더큰)맥적구이한상': '더큰)추석맥적구이한상',
  '더큰)오징어제육깻잎쌈밥': '더큰)오징어&제육깻잎쌈밥',
  // 기존 메뉴 표기 차이
  '혜자)두부김치제육': '두부김치제육',
  '혜자)두부김치제육한상': '두부김치제육',
  '착한참치마요김밥': '슈퍼)착한참치마요김밥',
  '착한김치김밥': '슈퍼)착한김치김밥',
  '착한1900핫도그(오리지널)': '슈퍼)착한핫도그(오리지널)',
  '착한1900핫도그(양배추사라다)': '슈퍼)착한핫도그(사라다)',
  '착한1900핫도그(사라다)': '슈퍼)착한핫도그(사라다)',
  '착한제육비빔밥': '슈퍼)착한제육비빔밥',
  '착한39)제육덮밥': '착한제육덮밥',
  '착한39)마파두부덮밥': '착한마파두부덮밥',
  '이달의도시락11월(K세일)': '이달의도시락11월',
  '이달의도시락(11월편)': '이달의도시락11월',
  '이달의도시락10월(혜자)': '이달의도시락10월',
  '이달의도시락9월(한가위)': '이달의도시락9월(한가위편)',
  '혜자)통등심돈까스도시락': '혜자)통등심돈까스&치킨까스도시락',
  '무스비)햄&참치김치': '무스비)햄&참치김치볶음밥',
  '근본김밥': '근본김밥&순살닭강정',
  'GS근본김밥': '근본김밥&순살닭강정',
};

/**
 * 메뉴 매칭 키: (주문)/예약) 접두, 1편/2편/1/2 접미, (1000장*1롤)/(3000)/(스티커) 규격, 용기)/필름) 라벨 접두,
 * '도시락' 접미, 괄호/&/공백 제거 → 동일 메뉴의 모든 수주 변형과 발주시트 BOM 메뉴명을 같은 키로 수렴
 */
function rawMenuKey(name: string): string {
  let s = String(name || '').normalize('NFC').trim();
  s = s.replace(/^\(주문\)\s*/, '').replace(/^예약\)\s*/, '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/\(\d+장\*\d+롤\)$/, '').replace(/\(스티커\)$/, '').replace(/\(성형\)$/, '').replace(/\(\d{3,5}\)$/, '');
  s = s.replace(/[12]편$/, '').replace(/[12]$/, '');
  s = s.replace(/^(용기|필름)\)/, '');
  s = s.replace(/도시락$/, '');
  return s.replace(/[()&]/g, '');
}

const ALIAS_BY_KEY = new Map<string, string>(
  Object.entries(CUSTOM_BOM_ALIAS).map(([from, to]) => [rawMenuKey(from), rawMenuKey(to)]),
);

export function menuKey(name: string): string {
  const k = rawMenuKey(name);
  return ALIAS_BY_KEY.get(k) || k;
}

/** 더미 BOM 행 판별: 1통, 1box, 1캔 등 단순 개봉 단위 */
export function isDummyBomDetail(unit: string | null | undefined, qty: number): boolean {
  if (qty !== 1) return false;
  const u = (unit || '').trim().toLowerCase().replace(/\s+/g, '');
  // '봉(팩)' 1개 = .xls 원재료 개봉 단위 더미행 (완제품 1개당 1봉 소요 아님)
  return u === '통' || u === 'box' || u === '박스' || u === '캔' || u === '봉(팩)' || u === '봉' || u === '팩';
}

export interface MinimalBomHeader {
  id: number;
  parentProductId: number;
  parentProduct?: { name?: string | null; category?: string | null } | null;
}

/** BOM 헤더 매칭: productId → menuKey(CUSTOM_BOM_ALIAS 포함) → normalizeForBom → 부분 매칭 순으로 시도 */
export function matchBomHeader<T extends MinimalBomHeader>(
  menuName: string,
  menuProductId: number | null,
  bomHeaders: T[],
): T | null {
  // 1. productId 직접 매칭
  if (menuProductId) {
    const byId = bomHeaders.find((h) => h.parentProductId === menuProductId);
    if (byId) return byId;
  }

  // 2. menuKey 정밀 매칭 (1편/2편, (주문), (1000장*1롤), 용기)/필름), 도시락, CUSTOM_BOM_ALIAS 통합)
  const mk = menuKey(menuName);
  if (mk) {
    for (const h of bomHeaders) {
      const hName = h.parentProduct?.name || '';
      if (menuKey(hName) === mk) return h;
    }
  }

  // 3. 이름 정규화 매칭
  const norm = normalizeForBom(menuName);
  if (!norm) return null;
  const aliased = CUSTOM_BOM_ALIAS[norm] || norm;

  for (const h of bomHeaders) {
    const hName = h.parentProduct?.name || '';
    const hNorm = normalizeForBom(hName);
    if (hNorm === aliased || hNorm === norm) return h;
  }

  // 4. 접두/포함 매칭 (최소 4자 이상)
  if (mk.length >= 4) {
    for (const h of bomHeaders) {
      const hk = menuKey(h.parentProduct?.name || '');
      if (hk.length >= 4 && (hk.startsWith(mk) || mk.startsWith(hk))) return h;
    }
  }

  return null;
}

/* ───────── 원가 계산 ───────── */

/**
 * BOM 기반 유효 단위원가 계산
 * = (봉단가 × 일사용량_봉) 집계
 */
export function calcBomEffectiveUnitCost(
  unitQtyGrams: number,
  bagPrice: number,
  divisor: number,
  bomMultiplier: number = 1,
): number {
  const d = divisor > 0 ? divisor : 1000;
  const m = bomMultiplier > 0 ? bomMultiplier : 1;
  return (unitQtyGrams / d) * bagPrice * m;
}

