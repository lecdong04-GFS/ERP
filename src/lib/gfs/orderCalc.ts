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
  pendingBoxes?: number;
  pendingOrderNos?: string[];
  latestOrderDate?: string;
  baseIncoming?: number;
}

export const DAY_CHARS = ['월', '화', '수', '목', '금', '토', '일'] as const;

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

/** 거래처 헤더에서 납품요일 파싱 (월~일 순서 boolean) */
export function parseDeliveryDays(header: string): boolean[] {
  const h = header || '';
  if (/월화수목금토/.test(h)) return [true, true, true, true, true, true, false];
  if (!/[월화수목금토일]/.test(h)) return [false, false, false, true, false, false, false];
  return DAY_CHARS.map((d) => h.includes(d));
}

/** 확정량을 납품요일에 균등분할 (월~일 순서) */
export function splitWeek(r: SheetRowInput, finalBoxes: number): number[] {
  const days = parseDeliveryDays(r.supplier || '');
  const idx = days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  const out = [0, 0, 0, 0, 0, 0, 0];
  if (finalBoxes <= 0 || idx.length === 0) return out;
  const base = Math.floor(finalBoxes / idx.length);
  let rem = finalBoxes - base * idx.length;
  idx.forEach((i) => {
    out[i] = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
  });
  return out;
}

/** 납품 패턴 분류 */
export function classifyPattern(header: string): '매일' | '월수금' | '화목토' | '기타' {
  const h = header || '';
  if (/월화수목금토/.test(h)) return '매일';
  const hasMonWedFri = h.includes('월') && h.includes('수') && h.includes('금');
  const hasTueThuSat = h.includes('화') && h.includes('목') && h.includes('토');
  if (hasMonWedFri && !hasTueThuSat) return '월수금';
  if (hasTueThuSat && !hasMonWedFri) return '화목토';
  return '기타';
}
