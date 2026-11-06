// 본발주(B2B EDI ordview) 수주 파서 — 클라이언트/서버 공용, fs 없음
// 대상: 제작관련 데이터/2026년 10월 ERP/본발주/*.xlsx
// 헤더(2행): 배달일시/문서번호/발주번호/발주타입/발주일자/납품일자/주문자/납품처/공급자/상품명/상품코드/입수/발주량/낱개수량/단위/발주단가/세액/발주금액
export interface BonbaljuItem {
  menuName: string;
  productCode: string;
  category: string;
  qty1: number;
  qty2: number;
  total: number;
  unitPrice: number;
  amount: number;
}

export type BonbaljuKind = '정규' | '추가' | '슈퍼';

export interface BonbaljuParseResult {
  orderDate: string; // 발주일자(수주받은 날짜) 기준 YYYY-MM-DD
  kind: BonbaljuKind; // 정규(본발주) / 추가(1편주문) / 슈퍼(GS슈퍼)
  docKeys: string[]; // 문서번호(없으면 발주번호) 목록 — 같은 파일 재업로드 감지용
  items: BonbaljuItem[];
  totalQty: number;
  totalAmount: number;
  centerCount: number;
  rowCount: number;
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val == null) return 0;
  const n = parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/** 엑셀 시리얼(46297) 또는 문자열 → YYYY-MM-DD (KST +9시간 보정) */
export function excelDateToISO(val: unknown): string | null {
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000) + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const kst = new Date(val.getTime() + 9 * 3600 * 1000);
    return kst.toISOString().slice(0, 10);
  }
  const s = String(val ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // YYYYMMDD / YYYY/MM/DD
  const m = s.replace(/[./]/g, '-').match(/(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const n = parseNumber(s);
  if (n > 20000 && n < 80000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000) + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** 파일명에서 날짜 추출 (예: '11월4일 본발주.xlsx' -> 2026-11-04, '1027.xlsx' -> 2026-10-27) */
export function extractDateFromFilename(filename?: string): string | null {
  if (!filename) return null;
  const s = filename.normalize('NFC').trim();
  // 1. 2026-11-04, 20261104
  const mFull = s.match(/(20\d{2})[-_.]?(\d{1,2})[-_.]?(\d{1,2})/);
  if (mFull) {
    return `${mFull[1]}-${mFull[2].padStart(2, '0')}-${mFull[3].padStart(2, '0')}`;
  }
  // 2. 11월4일, 11월 4일
  const mKo = s.match(/(\d{1,2})월\s*(\d{1,2})일?/);
  if (mKo) {
    const year = 2026;
    return `${year}-${mKo[1].padStart(2, '0')}-${mKo[2].padStart(2, '0')}`;
  }
  // 3. 1027, 1030 (4자리 월일)
  const mShort = s.match(/(?:슈퍼|주문|본발주|미출)?(\d{2})(\d{2})/);
  if (mShort) {
    const mm = parseInt(mShort[1], 10);
    const dd = parseInt(mShort[2], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const year = 2026;
      return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
  return null;
}

/** 헤더행 탐지: 상품코드+낱개수량+발주단가 포함 여부 */
export function isBonbaljuHeaderRow(row: any[]): boolean {
  const joined = row.map((c) => String(c ?? '').replace(/\s+/g, '')).join('|');
  return joined.includes('상품코드') && joined.includes('낱개수량') && joined.includes('발주단가');
}

/** 단일 시트 rows(header:1) 파싱 → null이면 본발주 아님 */
export function parseBonbaljuRows(rows: any[][], filename?: string): BonbaljuParseResult | null {
  let headerIdx = -1;
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    if (isBonbaljuHeaderRow(rows[r] || [])) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const hdr = rows[headerIdx] || [];
  const norm = (v: any) => String(v ?? '').replace(/\s+/g, '');
  const col = (names: string[]): number => {
    for (let c = 0; c < hdr.length; c++) {
      const h = norm(hdr[c]);
      if (names.some((n) => h === n || h.includes(n))) return c;
    }
    return -1;
  };

  const iName = col(['상품명']);
  const iCode = col(['상품코드']);
  const iEa = col(['낱개수량']);
  const iPrice = col(['발주단가']);
  const iAmt = col(['발주금액']);
  const iSup = col(['공급자']);
  // 공장 실무 기준: 파일명 -> 납품일자/입고일/배달일시 -> 발주일자 순으로 기준일자 탐색
  const iDelDt = col(['납품일자', '입고일', '배달일시']);
  const iOrdDt = col(['발주일자', '발주일']);
  const iType = col(['발주타입']);
  const iDelTo = col(['납품처']);
  const iOrderer = col(['주문자']);
  const iDoc = col(['문서번호']);
  const iOrdNo = col(['발주번호']);

  if (iName === -1 || iCode === -1 || iEa === -1) return null;

  const byCode = new Map<string, BonbaljuItem>();
  const centers = new Set<string>();
  const docs = new Set<string>();
  const fileDate = extractDateFromFilename(filename);
  let orderDate: string | null = fileDate;
  let rowCount = 0;
  let hasSuper = filename ? filename.includes('슈퍼') : false;
  let hasAdd = filename ? (filename.includes('추가') || filename.includes('주문') || filename.includes('1편')) : false;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    // 발주타입이 취소면 제외
    if (iType !== -1) {
      const t = String(row[iType] ?? '').trim();
      if (t === '취소' || t.toLowerCase() === 'cancel') continue;
      if (t === '추가') hasAdd = true;
    }
    // 주문자가 GS슈퍼면 슈퍼 채널
    if (iOrderer !== -1 && String(row[iOrderer] ?? '').includes('슈퍼')) hasSuper = true;
    // 같은 파일 재업로드 감지용 키 (문서번호 우선, 없으면 발주번호)
    const docKey = String(
      (iDoc !== -1 && row[iDoc]) || (iOrdNo !== -1 && row[iOrdNo]) || ''
    ).trim();
    if (docKey) docs.add(docKey);
    const name = String(row[iName] ?? '').trim();
    const code = String(row[iCode] ?? '').trim();
    if (!name || !code) continue;
    const ea = parseNumber(row[iEa]);
    if (ea <= 0) continue;
    const price = iPrice !== -1 ? parseNumber(row[iPrice]) : 0;
    const rowAmt = iAmt !== -1 ? parseNumber(row[iAmt]) : 0;
    const effAmt = rowAmt > 0 ? rowAmt : (price > 0 ? ea * price : 0);
    const sup = iSup !== -1 ? String(row[iSup] ?? '') : '';
    const isShift2 = sup.includes('2편');
    const category = sup ? sup.replace(/\s+/g, ' ').trim().slice(0, 40) : '본발주';

    if (!orderDate) {
      if (iDelDt !== -1 && row[iDelDt] != null) {
        orderDate = excelDateToISO(row[iDelDt]);
      } else if (iOrdDt !== -1 && row[iOrdDt] != null) {
        orderDate = excelDateToISO(row[iOrdDt]);
      }
    }
    if (iDelTo !== -1 && row[iDelTo]) centers.add(String(row[iDelTo]).trim());

    const prev = byCode.get(code);
    if (prev) {
      if (isShift2) prev.qty2 += ea;
      else prev.qty1 += ea;
      prev.total += ea;
      prev.amount += effAmt;
      // 단가: 첫 유효값 유지, 다르면 가중평균 없이 최대값 유지하지 않고 첫 값 유지
      if (!prev.unitPrice && price) prev.unitPrice = price;
    } else {
      byCode.set(code, {
        menuName: name,
        productCode: code,
        category,
        qty1: isShift2 ? 0 : ea,
        qty2: isShift2 ? ea : 0,
        total: ea,
        unitPrice: price,
        amount: effAmt,
      });
    }
    rowCount += 1;
  }

  if (byCode.size === 0 || !orderDate) return null;

  const items = [...byCode.values()];
  // 소수점(박스 환산 오차) 반올림
  for (const it of items) {
    it.qty1 = Math.round(it.qty1);
    it.qty2 = Math.round(it.qty2);
    it.total = Math.round(it.total);
    it.amount = Math.round(it.amount);
  }
  const totalQty = items.reduce((s, it) => s + it.total, 0);
  const totalAmount = items.reduce((s, it) => s + (it.amount || it.total * (it.unitPrice || 0)), 0);
  // 종류 판별: 슈퍼 우선 → 추가 → 정규
  const kind: BonbaljuKind = hasSuper ? '슈퍼' : hasAdd ? '추가' : '정규';

  return { orderDate, kind, docKeys: [...docs], items, totalQty, totalAmount, centerCount: centers.size, rowCount };
}
