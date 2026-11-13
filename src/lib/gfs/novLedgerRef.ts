import novLedgerData from '@/data/nov_ledger_ref.json';
import { normName, strictNormName } from '@/lib/gfs/norm';

export interface NovLedgerDay {
  date: string;
  inQty: number;
  stockQty: number;
  orderQty: number;
}

export interface NovLedgerItem {
  no: number;
  category: string;
  name: string;
  spec: string;
  totalIn: number;
  totalOrder: number;
  dailyAvgIn: number;
  dailyAvgOrder: number;
  days: NovLedgerDay[];
}

const ITEMS = novLedgerData as NovLedgerItem[];

// 정규화 키 인덱스 맵 (1회 초기화)
const byNorm = new Map<string, NovLedgerItem>();
const byStrict = new Map<string, NovLedgerItem>();

for (const item of ITEMS) {
  const k1 = normName(item.name);
  const k2 = strictNormName(item.name);
  if (k1 && !byNorm.has(k1)) byNorm.set(k1, item);
  if (k2 && !byStrict.has(k2)) byStrict.set(k2, item);
}

/**
 * ERP 품목명으로 2026-11-01 ~ 2026-11-12 원부자재 수불 관리대장 레퍼런스 조회
 * (실제 발주 전표/미입고 계산은 건드리지 않고 순수 의사결정 참고용으로만 사용)
 */
export function findNovLedgerRef(productName: string): NovLedgerItem | null {
  if (!productName) return null;
  const k1 = normName(productName);
  if (k1 && byNorm.has(k1)) return byNorm.get(k1)!;

  const k2 = strictNormName(productName);
  if (k2 && byStrict.has(k2)) return byStrict.get(k2)!;

  // 부분 포함 보조 매칭 (예: 규격 표기가 붙거나 떨어진 경우, 너무 짧은 키 제외)
  if (k2.length >= 4) {
    let best: NovLedgerItem | null = null;
    let bestScore = 0;
    for (const item of ITEMS) {
      const ik = strictNormName(item.name);
      if (ik.length < 4) continue;
      if (ik.includes(k2) || k2.includes(ik)) {
        const score = Math.min(ik.length, k2.length);
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
    }
    if (best) return best;
  }

  return null;
}

