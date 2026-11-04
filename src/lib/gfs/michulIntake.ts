// GS리테일 미출고(미납정보) 엑셀 파서
// 대상: 제작관련 데이터/2026년 10월 ERP/미출/*.xlsx 및 11월 ERP/미출/*.xlsx
// 시트 헤더: [ 납품정보-미납정보-점포별/제품별 미납정보 ]

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

function excelDateToISO(val: unknown): string | null {
  if (typeof val === 'number' && val > 20000 && val < 80000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val ?? '').trim();
  const m = s.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** 미출고(미납정보) 엑셀 시트인지 판별 */
export function isMichulSheet(rows: any[][]): boolean {
  if (!rows || rows.length < 5) return false;
  return rows.slice(0, 6).some((r) =>
    (r || []).some((c) => {
      const s = String(c ?? '').replace(/\s+/g, '');
      return s.includes('납품정보') || s.includes('미납정보') || s.includes('점포별/제품별미납');
    })
  );
}

/** 단일 시트 rows 파싱 */
export function parseMichulRows(rows: any[][]): MichulParseResult | null {
  if (!isMichulSheet(rows)) return null;

  // 1. 헤더에서 조회기간(거래일자) 추출
  let headerDate: string | null = null;
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const line = (rows[r] || []).map((c) => String(c ?? '')).join(' ');
    const m = line.match(/(\d{4}-\d{2}-\d{2})\s*~/);
    if (m) {
      headerDate = m[1];
      break;
    }
  }

  // 2. 테이블 헤더행('미납수량' 또는 '미납금액') 찾기
  let dataStart = -1;
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const line = (rows[r] || []).map((c) => String(c ?? '')).join(' ');
    if (line.includes('미납수량') || line.includes('미납금액')) {
      dataStart = r + 2; // 2줄 헤더 아래부터 데이터 시작
      break;
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
      const productName = String(nextRow[3] ?? '').trim();
      const orderAmt = Number(nextRow[4]) || 0;
      const delivAmt = Number(nextRow[5]) || 0;
      const undelivAmt = Number(nextRow[6]) || 0;

      if (productCode && (orderQty > 0 || undelivQty > 0 || undelivAmt > 0)) {
        items.push({
          storeCode: currentStoreCode,
          storeName: currentStoreName,
          tradeDate: currentDate || headerDate || new Date().toISOString().slice(0, 10),
          productCode,
          productName,
          orderQty,
          delivQty,
          undelivQty,
          orderAmt,
          delivAmt,
          undelivAmt,
        });
        r++; // 2줄 1쌍이므로 다음 줄 건너뜀
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

      if (productCode && (orderQty > 0 || undelivQty > 0 || undelivAmt > 0)) {
        items.push({
          storeCode: storeCode || currentStoreCode,
          storeName: storeName || currentStoreName,
          tradeDate: currentDate || headerDate || new Date().toISOString().slice(0, 10),
          productCode,
          productName,
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

