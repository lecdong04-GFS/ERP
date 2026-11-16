export type OrderChannelCode = 'WEB' | 'KAKAO' | 'EMAIL' | 'PHONE' | 'FAX' | 'EDI' | '';

export interface OrderChannelMeta {
  value: Exclude<OrderChannelCode, ''>;
  label: string;
  shortLabel: string;
  emoji: string;
  badgeClass: string;
}

export const ORDER_CHANNEL_OPTIONS: OrderChannelMeta[] = [
  {
    value: 'WEB',
    label: '웹포털(B2B)',
    shortLabel: '웹포털',
    emoji: '🌐',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    value: 'KAKAO',
    label: '카톡/문자',
    shortLabel: '카톡·문자',
    emoji: '💬',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    value: 'EMAIL',
    label: '이메일',
    shortLabel: '이메일',
    emoji: '✉️',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    value: 'PHONE',
    label: '전화',
    shortLabel: '전화',
    emoji: '📞',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    value: 'FAX',
    label: '팩스(FAX)',
    shortLabel: 'FAX',
    emoji: '📠',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    value: 'EDI',
    label: 'EDI/자체엑셀',
    shortLabel: 'EDI',
    emoji: '📄',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
];

export interface PartnerOrderProfile {
  id: string;
  name: string;
  orderMethod: string;
  orderChannel: string;
  orderCutoffTime: string;
  orderPortalUrl: string;
  orderDay: string;
  orderNote: string;
  email: string;
  tel: string;
  fax: string;
  contactPerson: string;
  contactTel: string;
  leadTime: number;
}

export function inferOrderChannel(
  orderChannel?: string | null,
  orderMethod?: string | null
): Exclude<OrderChannelCode, ''> {
  const ch = String(orderChannel || '').trim().toUpperCase();
  if (ch === 'WEB' || ch === 'KAKAO' || ch === 'EMAIL' || ch === 'PHONE' || ch === 'FAX' || ch === 'EDI') {
    return ch;
  }
  const m = String(orderMethod || '').trim().toLowerCase();
  if (m.includes('웹') || m.includes('포털') || m.includes('사이트') || m.includes('web')) return 'WEB';
  if (m.includes('카톡') || m.includes('카카오') || m.includes('문자') || m.includes('sms')) return 'KAKAO';
  if (m.includes('팩스') || m.includes('fax')) return 'FAX';
  if (m.includes('전화') || m.includes('유선')) return 'PHONE';
  if (m.includes('edi') || m.includes('엑셀')) return 'EDI';
  if (m.includes('메일') || m.includes('email')) return 'EMAIL';
  return 'EMAIL';
}

export function getOrderChannelMeta(
  orderChannel?: string | null,
  orderMethod?: string | null
): OrderChannelMeta {
  const code = inferOrderChannel(orderChannel, orderMethod);
  return ORDER_CHANNEL_OPTIONS.find((o) => o.value === code) || ORDER_CHANNEL_OPTIONS[2];
}

export function parseCutoffMinutes(cutoffTime?: string | null): number | null {
  const raw = String(cutoffTime || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export interface CutoffStatusInfo {
  status: 'overdue' | 'urgent' | 'soon' | 'scheduled' | 'unset';
  minutesLeft: number | null;
  cutoffMinutes: number | null;
  label: string;
  badgeClass: string;
}

export function getCutoffStatus(cutoffTime?: string | null, nowDate?: Date): CutoffStatusInfo {
  const cutoffMinutes = parseCutoffMinutes(cutoffTime);
  if (cutoffMinutes === null) {
    return {
      status: 'unset',
      minutesLeft: null,
      cutoffMinutes: null,
      label: '마감미지정',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
    };
  }
  const base = nowDate || new Date();
  const kst = new Date(base.getTime() + 9 * 3600 * 1000);
  const nowMinutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const minutesLeft = cutoffMinutes - nowMinutes;

  if (minutesLeft < 0) {
    const over = Math.abs(minutesLeft);
    const overLabel = over >= 60 ? `${Math.floor(over / 60)}h ${over % 60}m 초과` : `${over}분 초과`;
    return {
      status: 'overdue',
      minutesLeft,
      cutoffMinutes,
      label: `${cutoffTime} (${overLabel})`,
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    };
  }
  if (minutesLeft <= 60) {
    return {
      status: 'urgent',
      minutesLeft,
      cutoffMinutes,
      label: `${cutoffTime} (${minutesLeft}분 남음)`,
      badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
    };
  }
  if (minutesLeft <= 180) {
    const h = Math.floor(minutesLeft / 60);
    const m = minutesLeft % 60;
    return {
      status: 'soon',
      minutesLeft,
      cutoffMinutes,
      label: `${cutoffTime} (${h}h${m > 0 ? ` ${m}m` : ''} 남음)`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    };
  }
  return {
    status: 'scheduled',
    minutesLeft,
    cutoffMinutes,
    label: `${cutoffTime} 마감`,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
}

const WEEKDAY_CHARS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function isOrderDayMatch(orderDay?: string | null, ymd?: string): boolean {
  const raw = String(orderDay || '').trim();
  if (!raw || raw.includes('매일') || raw.includes('상시')) return true;
  const targetYmd = ymd || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dt = new Date(`${targetYmd}T00:00:00+09:00`);
  if (Number.isNaN(dt.getTime())) return true;
  const dayChar = WEEKDAY_CHARS[dt.getUTCDay()];
  // Also handle '주6일' / '평일'
  if (raw.includes('평일')) return dayChar !== '토' && dayChar !== '일';
  if (raw.includes('주6일')) return dayChar !== '일';
  return raw.includes(dayChar);
}

export interface OrderTextLineItem {
  name: string;
  spec?: string;
  qty: number;
  unit?: string;
}

export function formatOrderMessageText(params: {
  partnerName: string;
  orderDate: string;
  deliveryDate?: string;
  items: OrderTextLineItem[];
  orderNote?: string;
}): string {
  const { partnerName, orderDate, deliveryDate, items, orderNote } = params;
  const lines: string[] = [
    `[GFS 발주] ${partnerName}`,
    `• 발주일: ${orderDate}${deliveryDate ? ` / 입고요청: ${deliveryDate}` : ''}`,
    `──────────────────`,
  ];
  items.forEach((it, idx) => {
    const specPart = it.spec ? ` (${it.spec})` : '';
    const unitLabel = it.unit || 'BOX';
    lines.push(`${idx + 1}. ${it.name}${specPart} : ${it.qty}${unitLabel}`);
  });
  lines.push(`──────────────────`);
  lines.push(`총 ${items.length}품목 / 확인 부탁드립니다.`);
  if (orderNote && orderNote.trim()) {
    lines.push(`※ 참고: ${orderNote.trim()}`);
  }
  return lines.join('\n');
}

