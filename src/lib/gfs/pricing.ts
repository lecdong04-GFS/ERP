/**
 * GFS-ERP 공용 자재 단가/입수량/박스 환산 헬퍼
 *
 * 표준 가격 모델:
 * - ProductPrice.purchasePrice / Inventory.unitPrice / InventorySnapshot.unitPrice = 봉단가 (기본 재고단위 1봉/팩/ea/kg 기준)
 * - Product.boxQty / InventorySnapshot.packUnit = 입수량 (>= 1)
 * - 박스단가 = 봉단가 × 입수량 (PurchaseOrderDetail where unit='box' 등은 박스단가 사용 가능)
 */

export interface PriceRecordLike {
  purchasePrice?: number | null;
  deliveryPrice?: number | null;
  effectiveDate?: string | null;
}

/**
 * 입수량 정규화 (0 이하 또는 비정상 값은 1로 보정)
 */
export function normalizePackUnit(boxQty?: number | null): number {
  const n = Number(boxQty);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * 최신순으로 정렬된 ProductPrice 목록에서 0보다 큰 최신 구매단가(봉단가) 선택
 */
export function pickLatestValidPurchasePrice(
  prices?: PriceRecordLike[] | null
): number {
  if (!Array.isArray(prices) || prices.length === 0) return 0;
  for (const p of prices) {
    const val = Number(p?.purchasePrice);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return 0;
}

/**
 * 최신순으로 정렬된 ProductPrice 목록에서 0보다 큰 최신 납품단가 선택
 */
export function pickLatestValidDeliveryPrice(
  prices?: PriceRecordLike[] | null
): number {
  if (!Array.isArray(prices) || prices.length === 0) return 0;
  for (const p of prices) {
    const val = Number(p?.deliveryPrice);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return 0;
}

/**
 * 봉단가 결정: ProductPrice(마스터) -> Inventory.unitPrice -> 스냅샷 단가 순으로 유효한(>0) 값 채택
 */
export function resolveBagPrice(params: {
  masterBagPrice?: number | null;
  invUnitPrice?: number | null;
  snapshotUnitPrice?: number | null;
}): number {
  const candidates = [
    params.masterBagPrice,
    params.invUnitPrice,
    params.snapshotUnitPrice,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * 봉단가 × 입수량 -> 박스단가(원 단위 반올림)
 */
export function calcBoxPrice(bagPrice?: number | null, boxQty?: number | null): number {
  const bag = Number(bagPrice);
  if (!Number.isFinite(bag) || bag <= 0) return 0;
  const pack = normalizePackUnit(boxQty);
  return Math.round(bag * pack);
}

/**
 * 박스단가 ÷ 입수량 -> 봉단가
 * 정수 나누어떨어지면 정수, 아니면 소수 2자리까지 보존해 왕복(봉단가×입수량) 오차 방지
 */
export function calcBagPriceFromBox(
  boxPrice?: number | null,
  boxQty?: number | null
): number {
  const box = Number(boxPrice);
  if (!Number.isFinite(box) || box <= 0) return 0;
  const pack = normalizePackUnit(boxQty);
  if (pack <= 1) return Math.round(box);
  const raw = box / pack;
  return Number.isInteger(raw) ? raw : Math.round(raw * 100) / 100;
}

/**
 * 단위가 박스 단위('box', '박스', 'bx', 'ctn')인지 판별
 */
export function isBoxUnitLabel(unit?: string | null): boolean {
  const u = String(unit || '').trim().toLowerCase();
  return u === 'box' || u === '박스' || u === 'bx' || u === 'ctn';
}

/**
 * 명시적 낱개/봉 단위인지 판별
 */
export function isBagUnitLabel(unit?: string | null): boolean {
  const u = String(unit || '').trim().toLowerCase();
  return (
    u === '봉' ||
    u === '봉 (팩)' ||
    u === '팩' ||
    u === 'pk' ||
    u === 'pack' ||
    u === 'ea' ||
    u === '개' ||
    u === 'kg' ||
    u === 'g' ||
    u === '통' ||
    u === '병' ||
    u === '캔' ||
    u === '롤' ||
    u === '매' ||
    u === '장' ||
    u === '포'
  );
}

/**
 * 수량 + 단위 -> 재고 기본단위(봉/팩/ea) 수량으로 환산
 */
export function toBagQty(
  qty?: number | null,
  unit?: string | null,
  boxQty?: number | null
): number {
  const q = Number(qty);
  if (!Number.isFinite(q)) return 0;
  const pack = normalizePackUnit(boxQty);
  if (isBoxUnitLabel(unit) && pack > 1) {
    return Math.round(q * pack * 1000) / 1000;
  }
  return q;
}

/**
 * 봉 수량 -> 박스 수량 환산 (소수 3자리)
 */
export function toBoxQty(bagQty?: number | null, boxQty?: number | null): number {
  const q = Number(bagQty);
  if (!Number.isFinite(q)) return 0;
  const pack = normalizePackUnit(boxQty);
  return pack > 0 ? Math.round((q / pack) * 1000) / 1000 : q;
}

/**
 * 단위에 맞는 1단위 가격 반환:
 * unit='box'이고 입수량>1이면 박스단가, 아니면 봉단가
 */
export function unitPriceForOrderUnit(
  bagPrice?: number | null,
  unit?: string | null,
  boxQty?: number | null
): number {
  const bag = Number(bagPrice);
  if (!Number.isFinite(bag) || bag <= 0) return 0;
  const pack = normalizePackUnit(boxQty);
  if (isBoxUnitLabel(unit) && pack > 1) {
    return calcBoxPrice(bag, pack);
  }
  return bag;
}

/**
 * 저장된 발주/입고 단가(rawUnitPrice)에서 봉단가(bagPrice) 및 박스단가(boxPrice) 정규화
 * 마스터 봉단가와 함께 Double-Pack-Multiply(이미 박스단가인데 또 pack을 곱한 경우 등)도 방어
 */
export function normalizeLinePricing(params: {
  rawUnitPrice?: number | null;
  unit?: string | null;
  boxQty?: number | null;
  masterBagPrice?: number | null;
}): { bagPrice: number; boxPrice: number; lineUnitPrice: number } {
  const pack = normalizePackUnit(params.boxQty);
  const raw = Number(params.rawUnitPrice) || 0;
  const masterBag = Number(params.masterBagPrice) || 0;
  const isBox = isBoxUnitLabel(params.unit);

  let bagPrice = 0;
  if (masterBag > 0) {
    bagPrice = masterBag;
  } else if (raw > 0) {
    bagPrice = isBox && pack > 1 ? calcBagPriceFromBox(raw, pack) : raw;
  }

  const boxPrice = calcBoxPrice(bagPrice, pack);
  const lineUnitPrice =
    raw > 0
      ? raw
      : isBox && pack > 1
        ? boxPrice
        : bagPrice;

  return { bagPrice, boxPrice, lineUnitPrice };
}

/**
 * 총 봉수량 & 입수량 -> (박스수량, 낱개봉수량) 분리
 * StockLookupView 재고계산(boxes * packUnit + pieceQty = currentStock) 기준과 일치
 */
export function calcStockBoxesAndPieces(
  totalBags?: number | null,
  boxQty?: number | null
): { boxQty: number; pieceQty: number; packUnit: number } {
  const qty = Number(totalBags);
  const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const pack = normalizePackUnit(boxQty);
  if (pack <= 1) {
    return { boxQty: safeQty, pieceQty: 0, packUnit: pack };
  }
  const boxes = Math.floor(safeQty / pack);
  const pieces = Math.round((safeQty - boxes * pack) * 1000) / 1000;
  return { boxQty: boxes, pieceQty: pieces, packUnit: pack };
}

/**
 * BOM / 원가 계산용 배합단위 기준 실효단가 환산 (Product.bomDivisor, Product.bomMultiplier 반영)
 * g/ml/cc 는 1000(또는 100이상 bomDivisor), 매/장 중 bomDivisor>=100 인 항목은 bomDivisor로 나눔
 */
export function calcBomEffectiveUnitPrice(
  unit: string,
  purchasePrice?: number | null,
  bomDivisor?: number | null,
  bomMultiplier?: number | null
): number {
  const bag = Number(purchasePrice) || 0;
  if (bag <= 0) return 0;
  const rawDiv = Number(bomDivisor);
  const mult = Number(bomMultiplier) > 0 ? Number(bomMultiplier) : 1;
  const u = (unit || '').toLowerCase().trim();
  const div =
    Number.isFinite(rawDiv) && rawDiv > 0
      ? rawDiv
      : u === 'g' || u === 'ml' || u === 'cc'
        ? 1000
        : 1;
  const kgScale = u === 'kg' && div >= 100 ? 1000 : 1;
  return (bag / div) * mult * kgScale;
}

/**
 * BOM / 원가 계산용 1 단위(unitQty) 순단가 환산 (bomDivisor / bomMultiplier 포함)
 */
export function calcBomMaterialUnitCost(params: {
  bagPrice?: number | null;
  bomDivisor?: number | null;
  bomMultiplier?: number | null;
}): number {
  const bag = Number(params.bagPrice) || 0;
  if (bag <= 0) return 0;
  const div = Number(params.bomDivisor);
  const mult = Number(params.bomMultiplier);
  const safeDiv = Number.isFinite(div) && div > 0 ? div : 1;
  const safeMult = Number.isFinite(mult) && mult > 0 ? mult : 1;
  return (bag / safeDiv) * safeMult;
}
