/**
 * 거래처 발주방법 · 발주마감시각 인라인 표시 및 스마트 정렬을 위한 순수 헬퍼
 */

export type OrderChannelKind =
  | '발주고'
  | '통합구매'
  | '자사전산'
  | '카톡'
  | '이메일'
  | '전화'
  | '기타';

export interface ResolvedOrderMethod {
  channel: OrderChannelKind;
  /** 표에 표시할 짧은 채널명 (예: '발주고', '자사전산', '카톡', '통합구매', '이메일') */
  channelLabel: string;
  /** 'HH:MM' (24시간 표기) 또는 null */
  cutoffTime: string | null;
  /** 자정 기준 분(minute) — 정렬·카운트다운용 */
  cutoffMinutes: number | null;
  /** CJ 등 보관온도별 마감 분리 시 표시 태그 */
  tempTag: '저온' | '상온' | null;
  /** 특이사항 / 최소발주 / 담당자 연락처 요약 (툴팁용) */
  note: string;
  /** 원본 orderMethod 문자열 */
  raw: string;
}

export type CutoffBadgeKind = 'overdue' | 'urgent' | 'normal' | 'completed' | 'none';

export interface CutoffBadgeState {
  kind: CutoffBadgeKind;
  label: string;
}

const KNOWN_SUPPLIER_NOTES: Array<{ match: RegExp; note: string }> = [
  { match: /^상지/i, note: '최소 70박스 이상 발주 (70박스 기준)' },
  { match: /대동전산폼/i, note: '최소 5박스 이상 발주' },
];

function isColdItem(warehouse: string, productName: string): boolean {
  const combined = `${warehouse || ''} ${productName || ''}`;
  return /냉장|냉동|저온/.test(combined);
}

function normalizeHourTo24(hour: number): number {
  if (hour >= 1 && hour <= 6) return hour + 12;
  return hour;
}

interface ParsedTimeToken {
  time: string;
  minutes: number;
}

function extractTimeTokens(text: string): ParsedTimeToken[] {
  const results: ParsedTimeToken[] = [];
  if (!text) return results;

  // 1) HH:MM 형식 (예: 10:30, 13:00, 1:30)
  const colonRegex = /(\d{1,2}):(\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = colonRegex.exec(text)) !== null) {
    const rawH = Number(m[1]);
    const min = Number(m[2]);
    if (rawH >= 0 && rawH <= 23 && min >= 0 && min <= 59) {
      const h = normalizeHourTo24(rawH);
      results.push({
        time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        minutes: h * 60 + min,
      });
    }
  }
  if (results.length > 0) return results;

  // 2) N시(반/M분) 형식 (예: 11시, 1시, 10시반, 10시 30분)
  const korRegex = /(\d{1,2})\s*시(?:\s*(반|(\d{1,2})\s*분))?/g;
  while ((m = korRegex.exec(text)) !== null) {
    const rawH = Number(m[1]);
    const min = m[2] === '반' ? 30 : m[3] ? Number(m[3]) : 0;
    if (rawH >= 0 && rawH <= 23 && min >= 0 && min <= 59) {
      const h = normalizeHourTo24(rawH);
      results.push({
        time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        minutes: h * 60 + min,
      });
    }
  }

  return results;
}

function detectChannel(raw: string, supplier: string): { kind: OrderChannelKind; label: string } {
  const s = `${raw} ${supplier}`.trim();
  if (/발주고/.test(raw)) return { kind: '발주고', label: '발주고' };
  if (/통합구매|GS통합/i.test(raw)) return { kind: '통합구매', label: '통합구매' };
  if (/카톡|카카오/i.test(raw)) return { kind: '카톡', label: '카톡' };
  if (/이메일|메일|email/i.test(raw)) return { kind: '이메일', label: '이메일' };
  if (/전산|EDI|웹/i.test(raw)) return { kind: '자사전산', label: '자사전산' };
  if (/전화|유선/.test(raw)) return { kind: '전화', label: '전화' };
  if (/CJ|대상|삼립|동원|오뚜기|풀무원/i.test(s) && raw) {
    return { kind: '자사전산', label: '자사전산' };
  }
  return { kind: '기타', label: raw ? raw.split(/\s+/)[0] : '' };
}

export function resolveOrderMethodInfo(params: {
  orderMethod?: string;
  supplier?: string;
  warehouse?: string;
  productName?: string;
  partnerRemark?: string;
  partnerTel?: string;
  partnerEmail?: string;
  partnerContact?: string;
}): ResolvedOrderMethod {
  const raw = (params.orderMethod || '').trim();
  const supplier = (params.supplier || '').trim();
  const warehouse = (params.warehouse || '').trim();
  const productName = (params.productName || '').trim();

  const { kind, label } = detectChannel(raw, supplier);
  const times = extractTimeTokens(raw);
  const cold = isColdItem(warehouse, productName);

  let chosen: ParsedTimeToken | null = times[0] || null;
  let tempTag: '저온' | '상온' | null = null;
  let finalChannel = kind;
  let finalLabel = label;

  // CJ 등 2개 이상 마감시각이 슬래시 등으로 구분된 경우 보관온도 기준 분리
  if (times.length >= 2) {
    const sorted = [...times].sort((a, b) => a.minutes - b.minutes);
    if (/CJ|저온|상온|냉장|냉동/i.test(`${supplier} ${raw}`)) {
      chosen = cold ? sorted[0] : sorted[sorted.length - 1];
      tempTag = cold ? '저온' : '상온';
    } else if (/대상/.test(supplier)) {
      // 대상: 발주고 13시 vs 통합구매 14시
      if (cold) {
        chosen = sorted[0];
      } else {
        chosen = sorted[0];
      }
    } else {
      chosen = sorted[0];
    }
  } else if (/CJ/i.test(supplier) && chosen) {
    tempTag = cold ? '저온' : '상온';
  }

  // 특이사항 + 연락처 조합 (툴팁용)
  const noteParts: string[] = [];
  const remark = (params.partnerRemark || '').trim();
  if (remark) noteParts.push(remark);

  for (const rule of KNOWN_SUPPLIER_NOTES) {
    if (rule.match.test(supplier) && !remark.includes(rule.note.slice(0, 4))) {
      noteParts.push(rule.note);
    }
  }

  const contactParts = [params.partnerContact, params.partnerTel].filter((v) => v && v.trim());
  if (contactParts.length > 0) {
    noteParts.push(`담당: ${contactParts.join(' ')}`);
  }
  if (params.partnerEmail && params.partnerEmail.trim()) {
    noteParts.push(`메일: ${params.partnerEmail.trim()}`);
  }

  return {
    channel: finalChannel,
    channelLabel: finalLabel,
    cutoffTime: chosen ? chosen.time : null,
    cutoffMinutes: chosen ? chosen.minutes : null,
    tempTag,
    note: noteParts.join(' · '),
    raw,
  };
}

/** 현재 KST 기준 자정부터 경과한 분(minute) */
export function getNowKstMinutes(): number {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/** 마감 상태 계산: 평상시엔 'normal'(조용히), 60분 이내 'urgent', 초과 'overdue', 완료 'completed' */
export function getCutoffBadgeState(
  cutoffMinutes: number | null,
  nowKstMinutes: number,
  isCompleted: boolean
): CutoffBadgeState {
  if (isCompleted) {
    return { kind: 'completed', label: '발주완료' };
  }
  if (cutoffMinutes === null) {
    return { kind: 'none', label: '' };
  }
  const diff = cutoffMinutes - nowKstMinutes;
  if (diff < 0) {
    return { kind: 'overdue', label: '마감지남' };
  }
  if (diff <= 60) {
    return { kind: 'urgent', label: diff === 0 ? '곧 마감' : `${diff}분 전` };
  }
  return { kind: 'normal', label: '' };
}

/** 카톡 발주 1클릭 복사용 텍스트 생성 */
export function buildKakaoOrderText(params: {
  supplier: string;
  orderDate: string;
  productName: string;
  boxes: number;
}): string {
  const qtyText = params.boxes > 0 ? `${params.boxes}박스` : '수량확인';
  return `[${params.supplier}] ${params.orderDate} 발주 요청\n- ${params.productName} : ${qtyText}`;
}

export type CutoffSlotKey = 'all' | 'until11' | '12' | '13' | '14' | 'after15' | 'none';

export const CUTOFF_SLOTS: Array<{ key: Exclude<CutoffSlotKey, 'all'>; label: string }> = [
  { key: 'until11', label: '~11시' },
  { key: '12', label: '12시' },
  { key: '13', label: '13시' },
  { key: '14', label: '14시' },
  { key: 'after15', label: '15시~' },
  { key: 'none', label: '미정' },
];

export function getCutoffSlotKey(cutoffMinutes: number | null): Exclude<CutoffSlotKey, 'all'> {
  if (cutoffMinutes === null) return 'none';
  if (cutoffMinutes < 12 * 60) return 'until11';
  if (cutoffMinutes < 13 * 60) return '12';
  if (cutoffMinutes < 14 * 60) return '13';
  if (cutoffMinutes < 15 * 60) return '14';
  return 'after15';
}

export function getCutoffGroupLabel(cutoffMinutes: number | null, isCompleted: boolean): string {
  if (isCompleted) return '✅ 발주 완료';
  if (cutoffMinutes === null) return '마감시각 미정';
  const hh = String(Math.floor(cutoffMinutes / 60)).padStart(2, '0');
  const mm = String(cutoffMinutes % 60).padStart(2, '0');
  return `⏰ ${hh}:${mm} 마감`;
}

