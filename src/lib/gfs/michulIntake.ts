// GS리테일 미출고(미납정보) 엑셀 파서
// 대상: GS리테일 포털 발주/납품/미납정보 엑셀 (.xlsx, .xls)
// 시트 헤더: [ 납품정보-미납정보-점포별/제품별 미납정보 ] 또는 헤더 생략본

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

export function excelDateToISO(val: unknown): string | null {
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val ?? '').trim();
  const m1 = s.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = s.match(/(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

/** 미출고(미납정보) 엑셀 시트인지 판별 */
export function isMichulSheet(rows: any[][], fileName?: string): boolean {
  if (fileName) {
    const fn = fileName.toLowerCase();
    if (fn.includes('미출') || fn.includes('미납') || fn.includes('결품')) return true;
  }
  if (!rows || rows.length < 5) return false;
  return rows.slice(0, 15).some((r) =>
    (r || []).some((c) => {
      const s = String(c ?? '').replace(/\s+/g, '');
      return (
        s.includes('납품정보') ||
        s.includes('미납정보') ||
        s.includes('미출정보') ||
        s.includes('점포별/제품별미납') ||
        s.includes('미납수량') ||
        s.includes('미출수량') ||
        s.includes('미납금액') ||
        s.includes('미출금액') ||
        s.includes('결품')
      );
    })
  );
}

/** 단일 시트 rows 파싱 (헤더 유무 및 2행/1행 구조 자동 대응) */
export function parseMichulRows(rows: any[][], fileName?: string): MichulParseResult | null {
  if (!isMichulSheet(rows, fileName)) return null;

  // 1. 헤더에서 조회기간(거래일자) 추출
  let headerDate: string | null = null;
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const line = (rows[r] || []).map((c) => String(c ?? '')).join(' ');
    const m = line.match(/(\d{4}[-./]\d{2}[-./]\d{2})\s*~/);
    if (m) {
      headerDate = m[1].replace(/[./]/g, '-');
      break;
    }
  }

  // 파일명에서 날짜 추출 백업 (예: "11월4일 미출.xlsx", "미출1031.xlsx")
  if (!headerDate && fileName) {
    const mFn = fileName.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (mFn) {
      const month = String(mFn[1]).padStart(2, '0');
      const day = String(mFn[2]).padStart(2, '0');
      const year = new Date().getFullYear();
      headerDate = `${year}-${month}-${day}`;
    } else {
      const mCompact = fileName.match(/(?:미출|미납|결품)(\d{2})(\d{2})/);
      if (mCompact) {
        const month = mCompact[1];
        const day = mCompact[2];
        const year = new Date().getFullYear();
        headerDate = `${year}-${month}-${day}`;
      }
    }
  }

  // 2. 테이블 데이터 시작 위치 탐색
  let dataStart = -1;

  // (1) 명시적 헤더 행('미납수량' 또는 '발주수량') 찾기
  for (let r = 0; r < Math.min(20, rows.length); r++) {
    const line = (rows[r] || []).map((c) => String(c ?? '')).join(' ');
    if (
      line.includes('미납수량') ||
      line.includes('미납금액') ||
      (line.includes('발주수량') && line.includes('납품수량'))
    ) {
      const nextLine = (rows[r + 1] || []).map((c) => String(c ?? '')).join(' ');
      if (
        nextLine.includes('상품명') ||
        nextLine.includes('미납금액') ||
        nextLine.includes('발주금액')
      ) {
        dataStart = r + 2; // 2줄 헤더 아래부터 데이터 시작
      } else {
        dataStart = r + 1; // 1줄 헤더
      }
      break;
    }
  }

  // (2) 헤더 행이 생략된 경우 (GS리테일 직접 엑셀 뷰 등): 첫 데이터/합계 행 직접 탐색
  if (dataStart === -1) {
    for (let r = 4; r < Math.min(25, rows.length); r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const c0 = String(row[0] ?? '').trim();
      const c3 = String(row[3] ?? '').trim();
      const hasQty =
        typeof row[4] === 'number' ||
        typeof row[5] === 'number' ||
        typeof row[6] === 'number' ||
        !isNaN(Number(row[4]));

      if (c0.includes('합 계') || c0.includes('합계')) {
        dataStart = r;
        break;
      }
      if ((c0 || c3) && hasQty && row.length >= 6) {
        dataStart = r;
        break;
      }
    }
  }

  if (dataStart === -1) return null;

  const items: MichulItem[] = [];
  let currentStoreCode = '';
  let currentStoreName = '';
  let currentDate = headerDate;

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const firstCell = String(row[0] ?? '').trim();
    if (firstCell.includes('전체합계') || firstCell.includes('총계')) break;
    if (firstCell.includes('합계') || firstCell.includes('합 계')) continue;

    const c0 = String(row[0] ?? '').trim();
    const c1 = String(row[1] ?? '').trim();
    const c3 = String(row[3] ?? '').trim();

    // 점포 정보 행인지 확인
    if (c0 || c1) {
      currentStoreCode = c0.replace(/\u00a0/g, '').trim();
      currentStoreName = c1.replace(/\u00a0/g, '').trim();
      const d = excelDateToISO(row[2]);
      if (d) currentDate = d;

      const productCode = c3.replace(/\u00a0/g, '').trim();
      const orderQty = Number(row[4]) || 0;
      const delivQty = Number(row[5]) || 0;
      const undelivQty = Number(row[6]) || 0;

      const nextRow = rows[r + 1] || [];
      const nextC0 = String(nextRow[0] ?? '').trim();
      const nextC1 = String(nextRow[1] ?? '').trim();
      const isTwoLinePair = !nextC0 && !nextC1;

      let productName = '';
      let orderAmt = 0;
      let delivAmt = 0;
      let undelivAmt = 0;

      if (isTwoLinePair) {
        productName = String(nextRow[3] ?? '').trim();
        orderAmt = Number(nextRow[4]) || 0;
        delivAmt = Number(nextRow[5]) || 0;
        undelivAmt = Number(nextRow[6]) || 0;
      }

      if (productCode && (orderQty > 0 || delivQty > 0 || undelivQty > 0 || undelivAmt > 0)) {
        items.push({
          storeCode: currentStoreCode,
          storeName: currentStoreName,
          tradeDate: currentDate || headerDate || new Date().toISOString().slice(0, 10),
          productCode,
          productName: productName || productCode,
          orderQty,
          delivQty,
          undelivQty,
          orderAmt,
          delivAmt,
          undelivAmt,
        });
        if (isTwoLinePair) {
          r++; // 2줄 1쌍일 때만 다음 행 건너뜀
        }
      }
    } else if (c3) {
      // 상품 정보가 먼저 나오는 엑셀 레이아웃 처리
      const productName = c3;
      const orderAmt = Number(row[4]) || 0;
      const delivAmt = Number(row[5]) || 0;
      const undelivAmt = Number(row[6]) || 0;

      const nextRow = rows[r + 1] || [];
      const storeCode = String(nextRow[0] ?? '').replace(/\u00a0/g, '').trim();
      const storeName = String(nextRow[1] ?? '').replace(/\u00a0/g, '').trim();
      const d = excelDateToISO(nextRow[2]);
      if (d) currentDate = d;
      const productCode = String(nextRow[3] ?? '').replace(/\u00a0/g, '').trim();
      const orderQty = Number(nextRow[4]) || 0;
      const delivQty = Number(nextRow[5]) || 0;
      const undelivQty = Number(nextRow[6]) || 0;

      if (productCode && (orderQty > 0 || delivQty > 0 || undelivQty > 0 || undelivAmt > 0)) {
        items.push({
          storeCode: storeCode || currentStoreCode,
          storeName: storeName || currentStoreName,
          tradeDate: currentDate || headerDate || new Date().toISOString().slice(0, 10),
          productCode,
          productName: productName || productCode,
          orderQty,
          delivQty,
          undelivQty,
          orderAmt,
          delivAmt,
          undelivAmt,
        });
        r++;
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
    tradeDate: currentDate || headerDate || new Date().toISOString().slice(0, 10),
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
