// 원부자재·제품 생애주기 상태(삭제/삭제예정/이관/불용/출고정지) 파싱 및 배지·발주통제 공용 헬퍼
// 주의: 클라이언트/서버 공용이므로 Node 전용 모듈(fs, path 등)을 import 하지 않음.

export type ProductLifecycleTone = 'deleted' | 'scheduled' | 'transfer' | 'unused' | 'hold';

export interface ProductLifecycleInfo {
  status: string;
  label: string;
  shortLabel: string;
  tone: ProductLifecycleTone;
  isTerminal: boolean;
  isBlocked: boolean;
  effectiveDate: string;
}

export const TERMINAL_PRODUCT_STATUSES = new Set([
  '삭제',
  '이관',
  '불용',
  '출고정지',
  '단종',
  '발주제외',
]);

export function isTerminalProductStatus(status?: string | null): boolean {
  const s = String(status ?? '').trim();
  return TERMINAL_PRODUCT_STATUSES.has(s);
}

/** YYYY-MM-DD 포맷 또는 "" 반환 (KST 안전) */
export function normalizeLifecycleDate(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const mFull = s.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
  if (mFull) {
    return `${mFull[1]}-${mFull[2].padStart(2, '0')}-${mFull[3].padStart(2, '0')}`;
  }
  const compact = s.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return '';
}

function getKstTodayYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function formatLifecycleMonthDay(dateStr?: string | null): string {
  const ymd = normalizeLifecycleDate(dateStr);
  if (!ymd) return '';
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  if (!m || !d) return '';
  return `${m}/${d}`;
}

/**
 * 재고조사표 엑셀 G열(유통기한/상태) 또는 비고에서 수명주기 상태를 추출.
 * - '11/18 삭제', '11/18 삭제예정', '6/3삭제', '10/23이관', '불용', '출고정지' 등을 인식
 * - '스티커', '용기', '대체', '임시용', 일반 유통기한(2027-04-30 등)은 무시하여 '정상' 반환
 */
export function parseExcelLifecycle(
  rawText: unknown,
  refDateYmd?: string
): {
  status: string;
  discontinuedDate: string | null;
  isTerminal: boolean;
  isScheduled: boolean;
} {
  const text = String(rawText ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!text) {
    return { status: '정상', discontinuedDate: null, isTerminal: false, isScheduled: false };
  }

  const refDate = normalizeLifecycleDate(refDateYmd) || getKstTodayYmd();
  const refYear = Number(refDate.slice(0, 4)) || 2026;

  // 키워드 미포함 시 일반 유통기한·카테고리('대체', '임시용', '스티커', '2026-12-31' 등)로 간주
  if (!/(삭제|단종|이관|불용|출고정지|발주제외)/.test(text)) {
    return { status: '정상', discontinuedDate: null, isTerminal: false, isScheduled: false };
  }

  // 날짜 추출 (YYYY-MM-DD / YYYY.M.D 우선, 없으면 M/D 또는 M월 D일)
  let parsedDate: string | null = null;
  const fullMatch = text.match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (fullMatch) {
    parsedDate = `${fullMatch[1]}-${fullMatch[2].padStart(2, '0')}-${fullMatch[3].padStart(2, '0')}`;
  } else {
    const mdMatch = text.match(/(\d{1,2})\s*(?:\/|\.|월|-)\s*(\d{1,2})\s*일?/);
    if (mdMatch) {
      const m = Number(mdMatch[1]);
      const d = Number(mdMatch[2]);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        // 연말(11~12월) 기준 1~2월 날짜면 익년도 처리
        const refMonth = Number(refDate.slice(5, 7));
        const yr = refMonth >= 11 && m <= 2 ? refYear + 1 : refYear;
        parsedDate = `${yr}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  if (text.includes('출고정지')) {
    return { status: '출고정지', discontinuedDate: parsedDate, isTerminal: true, isScheduled: false };
  }
  if (text.includes('불용')) {
    return { status: '불용', discontinuedDate: parsedDate, isTerminal: true, isScheduled: false };
  }
  if (text.includes('이관')) {
    return { status: '이관', discontinuedDate: parsedDate, isTerminal: true, isScheduled: false };
  }
  if (text.includes('발주제외')) {
    return { status: '발주제외', discontinuedDate: parsedDate, isTerminal: true, isScheduled: false };
  }
  if (text.includes('삭제예정') || (parsedDate && parsedDate > refDate)) {
    return { status: '삭제예정', discontinuedDate: parsedDate, isTerminal: false, isScheduled: true };
  }
  // 그 외 '삭제' / '단종'
  return { status: '삭제', discontinuedDate: parsedDate, isTerminal: true, isScheduled: false };
}

/**
 * UI 배지 및 발주 차단 여부 통합 계산
 * - 정상 품목(예정일 없음)이면 null 반환
 */
export function getProductLifecycleInfo(
  input: {
    status?: string | null;
    discontinuedDate?: string | null;
    isUsed?: boolean | null;
    name?: string | null;
  },
  refDate?: string
): ProductLifecycleInfo | null {
  const checkDate = normalizeLifecycleDate(refDate) || getKstTodayYmd();
  const rawStatus = String(input.status ?? '').trim();
  const discDate = normalizeLifecycleDate(input.discontinuedDate);
  const md = formatLifecycleMonthDay(discDate);

  if (rawStatus === '이관') {
    const label = md ? `${md} 이관` : '이관';
    return { status: '이관', label, shortLabel: '이관', tone: 'transfer', isTerminal: true, isBlocked: true, effectiveDate: discDate };
  }
  if (rawStatus === '불용') {
    const label = md ? `${md} 불용` : '불용';
    return { status: '불용', label, shortLabel: '불용', tone: 'unused', isTerminal: true, isBlocked: true, effectiveDate: discDate };
  }
  if (rawStatus === '출고정지') {
    const label = md ? `${md} 출고정지` : '출고정지';
    return { status: '출고정지', label, shortLabel: '출고정지', tone: 'hold', isTerminal: true, isBlocked: true, effectiveDate: discDate };
  }
  if (rawStatus === '발주제외') {
    const label = md ? `${md} 발주제외` : '발주제외';
    return { status: '발주제외', label, shortLabel: '발주제외', tone: 'deleted', isTerminal: true, isBlocked: true, effectiveDate: discDate };
  }
  if (rawStatus === '삭제' || rawStatus === '단종') {
    const label = md ? `${md} ${rawStatus}` : rawStatus;
    return { status: rawStatus, label, shortLabel: rawStatus, tone: 'deleted', isTerminal: true, isBlocked: true, effectiveDate: discDate };
  }
  if (rawStatus === '삭제예정' || discDate) {
    const isDue = Boolean(discDate) && checkDate >= discDate;
    const label = md ? (isDue ? `${md} 삭제(도래)` : `${md} 삭제예정`) : isDue ? '삭제(도래)' : '삭제예정';
    return {
      status: '삭제예정',
      label,
      shortLabel: isDue ? '삭제' : '삭제예정',
      tone: isDue ? 'deleted' : 'scheduled',
      isTerminal: isDue,
      isBlocked: isDue,
      effectiveDate: discDate,
    };
  }
  if (input.isUsed === false) {
    return { status: '미사용', label: '미사용(삭제)', shortLabel: '삭제', tone: 'deleted', isTerminal: true, isBlocked: true, effectiveDate: '' };
  }
  return null;
}

/** DB Product.orderCycle 정규화 (예: "D+2/1", "D+1", "D+7") */
export function normalizeOrderCycleText(raw: unknown): string {
  const s = String(raw ?? '').replace(/[\r\n\s]+/g, '').trim();
  if (!s) return '';
  if (/^D[+-]\d+(?:\/\d+)?$/i.test(s)) return s.toUpperCase();
  return '';
}

