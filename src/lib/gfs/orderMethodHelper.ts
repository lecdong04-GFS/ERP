/**
 * 거래처 발주방법 · 발주마감시각 인라인 표시 및 스마트 정렬을 위한 순수 헬퍼
 */

export type OrderChannelKind =
  | '발주고(GS)'
  | '발주고(네트웍스)'
  | '발주고'
  | '통합구매'
  | '자사전산'
  | '카톡'
  | '이메일'
  | '전화'
  | '기타';

export interface ResolvedOrderMethod {
  channel: OrderChannelKind;
  /** 표에 표시할 짧은 채널명 (예: '발주고(GS)', '발주고(네트웍스)', '자사전산', '카톡', '이메일') */
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
  if (/발주고\s*\(?\s*GS\s*\)?|GS\s*전용\s*발주고/i.test(raw)) {
    return { kind: '발주고(GS)', label: '발주고(GS)' };
  }
  if (/발주고\s*\(?\s*(네트웍스|네트워크|NW)\s*\)?|네트웍스\s*발주고/i.test(raw)) {
    return { kind: '발주고(네트웍스)', label: '발주고(네트웍스)' };
  }
  if (/발주고/.test(raw)) {
    if (/네트웍스/.test(supplier)) return { kind: '발주고(네트웍스)', label: '발주고(네트웍스)' };
    if (/리테일|직배|DS유통/.test(supplier)) return { kind: '발주고(GS)', label: '발주고(GS)' };
    return { kind: '발주고', label: '발주고' };
  }
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

export interface OrderGuideItem {
  name: string;
  boxes: number;
  packUnit?: number;
}

export interface OrderMethodGuide {
  title: string;
  steps: string[];
  copyLabel: string;
  copyText: string;
  emailSubject?: string;
}

/** 발주방법별 실무 안내 및 복/붙 문구 생성 (거래처의 오늘 발주 품목 일괄 반영) */
export function buildOrderMethodGuide(params: {
  info: ResolvedOrderMethod;
  supplier: string;
  orderDate: string;
  items: OrderGuideItem[];
}): OrderMethodGuide {
  const { info, supplier, orderDate, items } = params;
  const activeItems = items.filter((it) => it.boxes > 0);
  const targetItems = activeItems.length > 0 ? activeItems : items.slice(0, 1);

  const itemLines = targetItems
    .map((it) => {
      const qtyStr = it.boxes > 0 ? `${it.boxes}박스` : '수량 입력 필요';
      const packStr = it.packUnit && it.packUnit > 0 ? ` (${it.packUnit}입)` : '';
      return `• ${it.name}${packStr} : ${qtyStr}`;
    })
    .join('\n');

  const cutoffDesc = info.cutoffTime ? `${info.cutoffTime} 마감` : '마감시각 확인 필요';

  if (info.channel === '카톡') {
    return {
      title: '카카오톡 발주 안내 및 복/붙 문구',
      steps: [
        `1. 아래 [발주 문구 복사] 버튼을 눌러 전체 내용을 복사합니다.`,
        `2. 카카오톡에서 '${supplier}' 담당자(또는 단체방)를 열어 붙여넣기 후 전송합니다.`,
        `3. 마감(${cutoffDesc}) 전 답장/접수 확인 후 ERP에서 [발주 확정]을 눌러주세요.`,
      ],
      copyLabel: '카톡 발주 문구 복사',
      copyText: [
        `안녕하세요, (주)GFS입니다.`,
        `[${orderDate} 발주 요청] 아래와 같이 발주 부탁드립니다.`,
        ``,
        itemLines,
        ``,
        info.note ? `※ 참고: ${info.note}` : '',
        `확인 후 회신 부탁드립니다. 감사합니다.`,
      ]
        .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
        .join('\n'),
    };
  }

  if (info.channel === '이메일') {
    const emailSubject = `[GFS 발주 요청] ${orderDate} / ${supplier}`;
    return {
      title: '이메일 발주 안내 및 본문 양식',
      steps: [
        `1. 아래 본문을 복사하거나 [메일 앱 열기] 버튼으로 바로 작성 창을 엽니다.`,
        `2. 마감(${cutoffDesc}) 전 발송 후 회신 메일을 확인합니다.`,
      ],
      copyLabel: '이메일 본문 복사',
      emailSubject,
      copyText: [
        `제목: ${emailSubject}`,
        ``,
        `안녕하세요, (주)GFS 구매팀입니다.`,
        `${orderDate} 기준 발주 내역 전달드립니다.`,
        ``,
        itemLines,
        ``,
        info.note ? `특이사항: ${info.note}` : '',
        `확인 부탁드립니다. 감사합니다.`,
      ]
        .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
        .join('\n'),
    };
  }

  if (info.channel === '발주고(GS)') {
    return {
      title: '발주고(GS리테일) 발주 진행 안내',
      steps: [
        `1. 발주고 사이트 > GS리테일(전용) 로그인 후 거래처 '${supplier}'를 선택합니다.`,
        `2. 아래 품목 및 박스 수량을 입력하고 납품일을 확인합니다.`,
        `3. 마감(${cutoffDesc}) 전 최종 전송 완료 후 ERP에서 전표 확정을 진행하세요.`,
      ],
      copyLabel: '발주고(GS) 입력용 품목·수량 복사',
      copyText: `[발주고(GS)] ${supplier} (${orderDate})\n${itemLines}`,
    };
  }

  if (info.channel === '발주고(네트웍스)') {
    return {
      title: '발주고(GS네트웍스) 발주 진행 안내',
      steps: [
        `1. 발주고 사이트 > GS네트웍스 로그인 후 거래처 '${supplier}'를 선택합니다.`,
        `2. 아래 품목 및 박스 수량을 입력하고 납품일을 확인합니다.`,
        `3. 마감(${cutoffDesc}) 전 최종 전송 완료 후 ERP에서 전표 확정을 진행하세요.`,
      ],
      copyLabel: '발주고(네트웍스) 입력용 품목·수량 복사',
      copyText: `[발주고(네트웍스)] ${supplier} (${orderDate})\n${itemLines}`,
    };
  }

  if (info.channel === '발주고') {
    return {
      title: '발주고(전산) 발주 진행 안내',
      steps: [
        `1. 발주고 사이트에 로그인 후 거래처 '${supplier}'를 선택합니다.`,
        `2. 아래 품목 및 박스 수량을 입력하고 납품일을 확인합니다.`,
        `3. 마감(${cutoffDesc}) 전 최종 전송 완료 후 ERP에서 전표 확정을 진행하세요.`,
      ],
      copyLabel: '발주고 입력용 품목·수량 복사',
      copyText: `[발주고 입력] ${supplier} (${orderDate})\n${itemLines}`,
    };
  }

  if (info.channel === '통합구매') {
    return {
      title: 'GS통합구매 발주 진행 안내',
      steps: [
        `1. GS통합구매 포털 접속 후 납품요청일(${orderDate})과 입고처를 선택합니다.`,
        `2. '${supplier}' 품목별 발주 수량(박스)을 입력합니다.`,
        `3. 마감(${cutoffDesc}) 전 발주 확정을 눌러 전송을 완료합니다.`,
      ],
      copyLabel: '통합구매 입력용 품목·수량 복사',
      copyText: `[GS통합구매] ${supplier} (${orderDate})\n${itemLines}`,
    };
  }

  if (info.channel === '자사전산') {
    return {
      title: `업체 자사전산 발주 안내${info.tempTag ? ` (${info.tempTag})` : ''}`,
      steps: [
        `1. '${supplier}' 전용 발주 사이트에 접속합니다.${info.tempTag ? ` (보관구분 '${info.tempTag}' 마감시각 주의)` : ''}`,
        `2. 아래 품목 및 박스 수량을 입력한 뒤 마감(${cutoffDesc}) 전 전송합니다.`,
      ],
      copyLabel: '입력용 품목·수량 복사',
      copyText: `[자사전산] ${supplier} (${orderDate})\n${itemLines}`,
    };
  }

  return {
    title: '전화 / 일반 발주 안내',
    steps: [
      `1. 아래 담당자 연락처와 특이사항을 확인한 뒤 발주를 진행합니다.`,
      `2. 통화/전달 시 아래 품목과 박스 수량을 안내해 주세요.`,
    ],
    copyLabel: '품목·수량 요약 복사',
    copyText: `[발주 내역] ${supplier} (${orderDate})\n${itemLines}`,
  };
}

