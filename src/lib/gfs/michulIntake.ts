// GS리테일 미출고(미납정보) 엑셀 파서 - 고도화 버전
// 대상: GS리테일 B2B 포털 발주/납품/미납정보 엑셀 (.xlsx, .xls)
// 지원:
//  1) GS리테일 2줄 1쌍 포맷 (점포별/제품별 미납정보: 위 행 점포/수량, 아래 행 상품명/금액)
//  2) 1줄 단일행 표준 포맷 (점포, 상품코드, 상품명, 발주, 납품, 미출, 금액)
//  3) 천 단위 쉼표(,) 및 통화기호(₩, \) 포함 숫자 자동 정규화
//  4) 컬럼 위치 밀림(No, 센터명 등 추가) 자동 헤더 감지 매핑

import { kstToday } from '@/lib/kst';

export interface MichulItem {
  storeCode: string;
  storeName: string;
  tradeDate: string; // YYYY-MM-DD
  productCode: string;
  productName: string;
  orderQty: number;
  delivQty: number;
  undelivQty: number;
  orderAmt: number;
  delivAmt: number;
  undelivAmt: number;
}

export interface MichulParseResult {
  tradeDate: string; // YYYY-MM-DD
  items: MichulItem[];
  totalOrderQty: number;
  totalDelivQty: number;
  totalUndelivQty: number;
  totalOrderAmt: number;
  totalDelivAmt: number;
  totalUndelivAmt: number;
  storeCount: number;
  productCount: number;
}

/** 쉼표, 원화기호, 음수 괄호 등 안전한 숫자 파싱 */
export function parseCleanNumber(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val === null || val === undefined) return 0;
  let s = String(val).trim().replace(/\u00a0/g, ' ').replace(/[₩\\,]/g, '');
  if (s.startsWith('(') && s.endsWith(')')) {
    s = '-' + s.slice(1, -1);
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function excelDateToISO(val: unknown): string | null {
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    // XLSX Date 객체는 타임존/초 오프셋 왜곡(한국 역사적 52초 왜곡 등) 방지를 위해 정오(+12시간) 기준 보정
    const d = new Date(val.getTime() + 12 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000) + 12 * 3600 * 1000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(val ?? '').trim().replace(/\u00a0/g, ' ');
  const m1 = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) {
    return `${m1[1]}-${String(m1[2]).padStart(2, '0')}-${String(m1[3]).padStart(2, '0')}`;
  }
  const m2 = s.match(/(\d{4})(\d{2})(\d{2})/);
  if (m2) {
    return `${m2[1]}-${m2[2]}-${m2[3]}`;
  }
  const m3 = s.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m3) {
    const y = new Date().getFullYear();
    return `${y}-${String(m3[1]).padStart(2, '0')}-${String(m3[2]).padStart(2, '0')}`;
  }
  return null;
}

/** 엑셀 상단 헤더 또는 파일명에서 조회일자/거래일자 안전 추출 */
export function extractDateFromHeaderOrFileName(rows: any[][], fileName?: string): string | null {
  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const line = (rows[r] || []).map((c) => String(c ?? '')).join(' ');
    // 기간 형태: 2026-11-06 ~ 2026-11-06
    const mRange = line.match(/(\d{4}[-./]\d{1,2}[-./]\d{1,2})\s*~/);
    if (mRange) {
      const d = excelDateToISO(mRange[1]);
      if (d) return d;
    }
    // 단일 일자 형태
    if (line.includes('조회') || line.includes('일자') || line.includes('납품') || line.includes('기준') || line.includes('거래')) {
      const mSingle = line.match(/(\d{4}[-./]\d{1,2}[-./]\d{1,2})/);
      if (mSingle) {
        const d = excelDateToISO(mSingle[1]);
        if (d) return d;
      }
    }
  }

  // 파일명 백업 추출
  if (fileName) {
    const fn = fileName.trim();
    const mFn1 = fn.match(/(\d{4})[-_./](\d{1,2})[-_./](\d{1,2})/);
    if (mFn1) {
      return `${mFn1[1]}-${String(mFn1[2]).padStart(2, '0')}-${String(mFn1[3]).padStart(2, '0')}`;
    }
    const mFn2 = fn.match(/(20\d{2})(\d{2})(\d{2})/);
    if (mFn2) {
      return `${mFn2[1]}-${mFn2[2]}-${mFn2[3]}`;
    }
    const mFn3 = fn.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (mFn3) {
      const y = new Date().getFullYear();
      return `${y}-${String(mFn3[1]).padStart(2, '0')}-${String(mFn3[2]).padStart(2, '0')}`;
    }
    const mFn4 = fn.match(/(?:미출|미납|결품)[-_ ]*(\d{2})(\d{2})/);
    if (mFn4) {
      const y = new Date().getFullYear();
      return `${y}-${mFn4[1]}-${mFn4[2]}`;
    }
  }

  return null;
}

/** 미출고(미납정보) 엑셀 시트인지 유연 판별 */
export function isMichulSheet(rows: any[][], fileName?: string): boolean {
  if (fileName) {
    const fn = fileName.toLowerCase();
    if (
      fn.includes('미출') ||
      fn.includes('미납') ||
      fn.includes('결품') ||
      fn.includes('undeliv') ||
      fn.includes('shortage')
    ) {
      return true;
    }
  }
  if (!rows || rows.length < 3) return false;
  return rows.slice(0, 25).some((r) =>
    (r || []).some((c) => {
      const s = String(c ?? '').replace(/\s+/g, '');
      return (
        s.includes('납품정보') ||
        s.includes('미납정보') ||
        s.includes('미출정보') ||
        s.includes('점포별/제품별미납') ||
        s.includes('점포별미납') ||
        s.includes('미납수량') ||
        s.includes('미출수량') ||
        s.includes('결품수량') ||
        s.includes('납품차이') ||
        s.includes('미납금액') ||
        s.includes('미출금액') ||
        s.includes('결품금액') ||
        s.includes('미출고') ||
        s.includes('미납') ||
        s.includes('미출') ||
        s.includes('결품')
      );
    })
  );
}

/** 단일 시트 rows 파싱 (동적 컬럼 매핑 + 2행/1행 구조 자동 대응 + 쉼표 정규화) */
export function parseMichulRows(rows: any[][], fileName?: string): MichulParseResult | null {
  if (!isMichulSheet(rows, fileName)) return null;

  const headerDate = extractDateFromHeaderOrFileName(rows, fileName);
  const defaultDate = headerDate || kstToday();

  // 1. 헤더 행 및 2단 헤더 여부 탐색
  let headerRowIdx = -1;
  let isTwoLineHeader = false;

  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const line = (rows[r] || []).map((c) => String(c ?? '')).join(' ');
    if (
      line.includes('미납수량') ||
      line.includes('미출수량') ||
      line.includes('결품수량') ||
      line.includes('미납금액') ||
      line.includes('미출금액') ||
      (line.includes('발주') && line.includes('납품')) ||
      (line.includes('수량') && (line.includes('점포') || line.includes('상품') || line.includes('센터')))
    ) {
      headerRowIdx = r;
      const nextLine = (rows[r + 1] || []).map((c) => String(c ?? '')).join(' ');
      if (
        (nextLine.includes('상품명') || nextLine.includes('금액')) &&
        (rows[r + 1] || []).some((c) => c !== null && c !== undefined && String(c).trim() !== '')
      ) {
        isTwoLineHeader = true;
      }
      break;
    }
  }

  // 헤더 텍스트 행이 누락되었으나 GS리테일 2행 1쌍 포맷인 경우 자동 감지
  if (headerRowIdx === -1) {
    const topText = rows.slice(0, 10).map((r) => (r || []).join(' ')).join(' ');
    if (
      topText.includes('점포별/제품별') ||
      topText.includes('납품정보') ||
      topText.includes('조회기간') ||
      (fileName && (fileName.includes('미출') || fileName.includes('미납')))
    ) {
      isTwoLineHeader = true;
    }
  }

  // 2. 동적 컬럼 위치 매핑
  const colMap = {
    storeCode: -1,
    storeName: -1,
    date: -1,
    productCode: -1,
    productName: -1,
    orderQty: -1,
    delivQty: -1,
    undelivQty: -1,
    orderAmt: -1,
    delivAmt: -1,
    undelivAmt: -1,
  };

  if (headerRowIdx !== -1) {
    const h1 = rows[headerRowIdx] || [];
    const h2 = isTwoLineHeader ? rows[headerRowIdx + 1] || [] : [];

    // 1행 헤더 탐색
    for (let c = 0; c < h1.length; c++) {
      const t1 = String(h1[c] ?? '').replace(/\s+/g, '');
      if (
        colMap.storeCode === -1 &&
        (t1.includes('점포코드') || t1.includes('점포ID') || t1.includes('사업장코드') || t1.includes('센터코드') || t1.includes('거래처코드'))
      ) {
        colMap.storeCode = c;
      }
      if (
        colMap.storeName === -1 &&
        (t1.includes('점포명') || t1.includes('사업장명') || t1.includes('센터명') || t1.includes('거래처명') || t1.includes('배송지') || (t1.includes('점포') && !t1.includes('코드')))
      ) {
        colMap.storeName = c;
      }
      if (
        colMap.date === -1 &&
        (t1.includes('거래일자') || t1.includes('납품일자') || t1.includes('배송일자') || t1.includes('출고일자') || t1.includes('일자'))
      ) {
        colMap.date = c;
      }
      if (
        colMap.productCode === -1 &&
        (t1.includes('상품코드') || t1.includes('단품코드') || t1.includes('품목코드') || t1.includes('바코드') || t1.includes('자재코드'))
      ) {
        colMap.productCode = c;
      }
      if (
        colMap.productName === -1 &&
        (t1.includes('상품명') || t1.includes('단품명') || t1.includes('품목명') || t1.includes('제품명') || t1.includes('규격'))
      ) {
        colMap.productName = c;
      }
      if (
        colMap.orderQty === -1 &&
        (t1.includes('발주수량') || t1.includes('주문수량') || t1.includes('수주수량') || t1.includes('청구수량') || t1.includes('발주량') || (t1.includes('발주') && !t1.includes('금액')))
      ) {
        colMap.orderQty = c;
      }
      if (
        colMap.delivQty === -1 &&
        (t1.includes('납품수량') || t1.includes('입고수량') || t1.includes('출고수량') || t1.includes('납품량') || (t1.includes('납품') && !t1.includes('금액')))
      ) {
        colMap.delivQty = c;
      }
      if (
        colMap.undelivQty === -1 &&
        (t1.includes('미납수량') || t1.includes('미출수량') || t1.includes('결품수량') || t1.includes('차이수량') || ((t1.includes('미납') || t1.includes('미출') || t1.includes('결품')) && !t1.includes('금액')))
      ) {
        colMap.undelivQty = c;
      }

      // 1행 테이블의 경우 금액 열도 h1에 위치
      if (!isTwoLineHeader) {
        if (colMap.orderAmt === -1 && (t1.includes('발주금액') || t1.includes('주문금액') || t1.includes('청구금액'))) colMap.orderAmt = c;
        if (colMap.delivAmt === -1 && (t1.includes('납품금액') || t1.includes('입고금액') || t1.includes('출고금액'))) colMap.delivAmt = c;
        if (colMap.undelivAmt === -1 && (t1.includes('미납금액') || t1.includes('미출금액') || t1.includes('결품금액') || t1.includes('차이금액'))) colMap.undelivAmt = c;
      }
    }

    // 2행 헤더 탐색 (2단 헤더 구조 시 금액 및 상품명 위치 보완)
    if (isTwoLineHeader) {
      for (let c = 0; c < h2.length; c++) {
        const t2 = String(h2[c] ?? '').replace(/\s+/g, '');
        if (
          colMap.productName === -1 &&
          (t2.includes('상품명') || t2.includes('단품명') || t2.includes('품목명') || t2.includes('제품명') || t2.includes('규격'))
        ) {
          colMap.productName = c;
        }
        if (
          colMap.orderAmt === -1 &&
          (t2.includes('발주금액') || t2.includes('주문금액') || t2.includes('청구금액') || (t2.includes('발주') && t2.includes('금액')))
        ) {
          colMap.orderAmt = c;
        }
        if (
          colMap.delivAmt === -1 &&
          (t2.includes('납품금액') || t2.includes('입고금액') || t2.includes('출고금액') || (t2.includes('납품') && t2.includes('금액')))
        ) {
          colMap.delivAmt = c;
        }
        if (
          colMap.undelivAmt === -1 &&
          (t2.includes('미납금액') || t2.includes('미출금액') || t2.includes('결품금액') || t2.includes('차이금액') || ((t2.includes('미납') || t2.includes('미출') || t2.includes('결품')) && t2.includes('금액')))
        ) {
          colMap.undelivAmt = c;
        }
      }
    }
  }

  // 매핑 실패 시의 기본 위치 폴백 (GS리테일 B2B 표준 레이아웃)
  if (colMap.storeCode === -1) colMap.storeCode = 0;
  if (colMap.storeName === -1) colMap.storeName = 1;
  if (colMap.date === -1) colMap.date = 2;
  if (colMap.productCode === -1) colMap.productCode = 3;
  if (colMap.productName === -1) colMap.productName = 3;
  if (colMap.orderQty === -1) colMap.orderQty = 4;
  if (colMap.delivQty === -1) colMap.delivQty = 5;
  if (colMap.undelivQty === -1) colMap.undelivQty = 6;
  if (isTwoLineHeader) {
    if (colMap.orderAmt === -1) colMap.orderAmt = 4;
    if (colMap.delivAmt === -1) colMap.delivAmt = 5;
    if (colMap.undelivAmt === -1) colMap.undelivAmt = 6;
  }

  // 데이터 시작 행 탐색
  let dataStart = 8;
  if (headerRowIdx !== -1) {
    dataStart = headerRowIdx + (isTwoLineHeader ? 2 : 1);
  } else {
    for (let r = 0; r < Math.min(20, rows.length); r++) {
      const c0 = String(rows[r]?.[0] ?? '').trim();
      const c3 = String(rows[r]?.[3] ?? '').trim();
      if (c0.includes('합계') || c0.startsWith('CVV') || c0.startsWith('C6') || /^\d{13}/.test(c3)) {
        dataStart = r;
        break;
      }
    }
  }
  const items: MichulItem[] = [];

  let currentStoreCode = '';
  let currentStoreName = '';
  let currentDate = defaultDate;

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    // 합계/총계 행 필터링
    const firstFew = row.slice(0, 4).map((c) => String(c ?? '').replace(/\s+/g, '')).join(' ');
    if (firstFew.includes('전체합계') || firstFew.includes('총계') || firstFew.includes('총합계')) break;
    if (firstFew.includes('합계') || firstFew.includes('소계')) {
      if (isTwoLineHeader) {
        r++; // 2줄 1쌍 구조 시 소계 금액 행까지 함께 건너뜀
      }
      continue;
    }

    // 헤더/메타 정보 행 건너뜀
    const c0 = String(row[0] ?? '').replace(/\s+/g, '');
    if (
      c0.includes('점포코드') ||
      c0.includes('미납수량') ||
      c0.includes('납품정보') ||
      c0.includes('상호명') ||
      c0.includes('유통회사') ||
      c0.includes('거래선코드') ||
      c0.includes('조회기간')
    ) {
      continue;
    }

    const rowStr = row.map((c) => String(c ?? '').trim()).join('');
    if (!rowStr) continue;

    // 2줄 1쌍 구조인지 자동 감지
    const nextRow = rows[r + 1] || [];
    const nextFirstCell = String(nextRow[0] ?? '').trim();
    const nextRowStr = nextRow.map((c) => String(c ?? '').trim()).join('');
    const isNextTotal =
      nextFirstCell.includes('합계') ||
      nextFirstCell.includes('소계') ||
      nextFirstCell.includes('총계') ||
      nextFirstCell.includes('전체합계');

    const isPair =
      isTwoLineHeader &&
      !isNextTotal &&
      nextRow.length > 0 &&
      nextRowStr.length > 0 &&
      (!nextFirstCell || nextFirstCell === String(row[0] ?? '').trim());

    // 점포 및 일자 추출
    const rawStoreCode = colMap.storeCode !== -1 ? String(row[colMap.storeCode] ?? '').trim() : '';
    const rawStoreName = colMap.storeName !== -1 ? String(row[colMap.storeName] ?? '').trim() : '';
    if (rawStoreCode && !rawStoreCode.includes('합계') && !rawStoreCode.includes('소계') && rawStoreCode !== 'null' && rawStoreCode !== 'undefined') {
      currentStoreCode = rawStoreCode;
    }
    if (rawStoreName && !rawStoreName.includes('합계') && !rawStoreName.includes('소계') && rawStoreName !== 'null' && rawStoreName !== 'undefined') {
      currentStoreName = rawStoreName;
    }

    if (colMap.date !== -1 && row[colMap.date]) {
      const d = excelDateToISO(row[colMap.date]);
      if (d) currentDate = d;
    }

    // 2줄 1쌍 구조에서 고아 2행(금액 행이 상단에 잔존하거나 선행 수량 행 누락 시) 자동 스킵
    if (isTwoLineHeader && !rawStoreCode && !row[colMap.date]) {
      const c3 = String(row[colMap.productCode] ?? '').trim();
      const val4 = parseCleanNumber(row[colMap.orderQty]);
      if (!/^\d{12,14}$/.test(c3) && val4 > 1000) {
        continue;
      }
    }

    // 상품코드 및 수량 추출 (쉼표 제거 안전 파싱)
    let productCode = colMap.productCode !== -1 ? String(row[colMap.productCode] ?? '').trim() : '';
    if (productCode === 'null' || productCode === 'undefined' || productCode === '상품명' || productCode === '단품명') {
      productCode = '';
    }
    let productName = (!isTwoLineHeader && colMap.productName !== -1) ? String(row[colMap.productName] ?? '').trim() : '';
    let orderQty = colMap.orderQty !== -1 ? parseCleanNumber(row[colMap.orderQty]) : 0;
    let delivQty = colMap.delivQty !== -1 ? parseCleanNumber(row[colMap.delivQty]) : 0;
    let undelivQty = colMap.undelivQty !== -1 ? parseCleanNumber(row[colMap.undelivQty]) : 0;

    let orderAmt = (!isTwoLineHeader && colMap.orderAmt !== -1) ? parseCleanNumber(row[colMap.orderAmt]) : 0;
    let delivAmt = (!isTwoLineHeader && colMap.delivAmt !== -1) ? parseCleanNumber(row[colMap.delivAmt]) : 0;
    let undelivAmt = (!isTwoLineHeader && colMap.undelivAmt !== -1) ? parseCleanNumber(row[colMap.undelivAmt]) : 0;

    // 2줄 1쌍 구조일 경우 두 번째 줄에서 상품명 및 금액 추출
    if (isPair) {
      if (colMap.productName !== -1 && nextRow[colMap.productName] !== undefined && nextRow[colMap.productName] !== null) {
        productName = String(nextRow[colMap.productName] ?? '').trim();
      } else if (colMap.productCode !== -1 && nextRow[colMap.productCode] !== undefined && nextRow[colMap.productCode] !== null) {
        productName = String(nextRow[colMap.productCode] ?? '').trim();
      }

      if (colMap.orderAmt !== -1 && nextRow[colMap.orderAmt] !== undefined) {
        orderAmt = parseCleanNumber(nextRow[colMap.orderAmt]);
      }
      if (colMap.delivAmt !== -1 && nextRow[colMap.delivAmt] !== undefined) {
        delivAmt = parseCleanNumber(nextRow[colMap.delivAmt]);
      }
      if (colMap.undelivAmt !== -1 && nextRow[colMap.undelivAmt] !== undefined) {
        undelivAmt = parseCleanNumber(nextRow[colMap.undelivAmt]);
      }
    }

    // 미출금액 자동 산출 보정 (수량은 있는데 금액이 누락된 경우 단가 역산)
    if (undelivAmt === 0 && undelivQty > 0) {
      if (orderAmt > 0 && orderQty > 0) {
        undelivAmt = Math.round(undelivQty * (orderAmt / orderQty));
      } else if (delivAmt > 0 && delivQty > 0) {
        undelivAmt = Math.round(undelivQty * (delivAmt / delivQty));
      }
    }

    // 상품코드가 없고 상품명만 있는 경우
    if (!productCode && productName) {
      productCode = productName;
    }

    if (productCode && (orderQty > 0 || delivQty > 0 || undelivQty > 0 || undelivAmt > 0)) {
      items.push({
        storeCode: currentStoreCode || 'GSR-001',
        storeName: currentStoreName || 'GS리테일 미지정 센터',
        tradeDate: currentDate,
        productCode,
        productName: productName || productCode,
        orderQty,
        delivQty,
        undelivQty,
        orderAmt,
        delivAmt,
        undelivAmt,
      });

      if (isPair) {
        r++; // 2줄 1쌍 처리 시 다음 행 건너뜀
      }
    }
  }

  if (items.length === 0) return null;

  const totalOrderQty = items.reduce((s, it) => s + it.orderQty, 0);
  const totalDelivQty = items.reduce((s, it) => s + it.delivQty, 0);
  const totalUndelivQty = items.reduce((s, it) => s + it.undelivQty, 0);
  const totalOrderAmt = items.reduce((s, it) => s + it.orderAmt, 0);
  const totalDelivAmt = items.reduce((s, it) => s + it.delivAmt, 0);
  const totalUndelivAmt = items.reduce((s, it) => s + it.undelivAmt, 0);

  return {
    tradeDate: currentDate,
    items,
    totalOrderQty,
    totalDelivQty,
    totalUndelivQty,
    totalOrderAmt,
    totalDelivAmt,
    totalUndelivAmt,
    storeCount: new Set(items.map((it) => it.storeName)).size,
    productCount: new Set(items.map((it) => it.productCode)).size,
  };
}
