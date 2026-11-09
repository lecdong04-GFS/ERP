import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { normName } from './norm';

export { normName };

export interface AuditEntry {
  name: string;
  norm: string;
  warehouse: string; // 냉장1 | 냉장2 | 냉동 | 상온 | 부자재
  vendor: string;
  itemId: string;
  packUnit: number;
  bagPrice: number;
}

export interface OrderSheetItem {
  name: string;
  norm: string;
  supplierHeader: string;
  boxes: number;
  packUnit: number;
  days: number; // 발주일수 (G열)
  dailyUsage: number;
  incoming: number;
  currentStock: number;
  bagPrice: number;
  stockDays: number | null; // N열 재고유지일 (엑셀 보이는 숫자 그대로, 없으면 null)
}

export interface BomChildLink {
  menu: string;
  normMenu: string;
  qty: number; // B열 수량 (야채 실주문량으로 보정 전)
  perUnit: number; // C열 개당소요량
}

export interface BomMaterial {
  name: string;
  norm: string;
  supplierHeader: string;
  packUnit: number;
  bagPrice: number;
  days: number;
  dailyUsage: number; // H열 일사용량(박스)
  menus: BomChildLink[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

/** 발주시트 내장 BOM 파싱: 자재행 + 하위 메뉴행(A=메뉴,B=수량,C=개당소요량,E=0) */
export function parseOrderSheetBom(wb: XLSX.WorkBook): BomMaterial[] {
  const ws = wb.Sheets['발주시트'];
  if (!ws) return [];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const mats: BomMaterial[] = [];
  let cur: BomMaterial | null = null;
  let currentSupplier = '';

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const a = r[0];
    const b = r[1];
    const c = r[2];
    const aStr = a != null ? String(a).trim() : '';
    const cStr = c != null ? String(c).trim() : '';
    const isSupplierHeader =
      aStr.length > 1 && (typeof b === 'string' || b == null) && (c == null || cStr === '' || cStr === 'null');
    if (isSupplierHeader) {
      currentSupplier = aStr;
      cur = null;
      continue;
    }

    const packUnit = num(r[4]);
    const days = num(r[6]);
    const dailyUsage = num(r[7]);
    const boxes = r[3];
    const hasBoxNum = typeof boxes === 'number' && !isNaN(boxes);

    // 자재행 여부 판단:
    // C열이 비어있지 않고, 숫자가 아니어야 함 (C열이 숫자인 경우는 하위 메뉴행의 개당 소요량)
    if (cStr !== '' && cStr !== 'null' && isNaN(Number(cStr))) {
      // 비자재 메모/안내 행 필터링
      if (packUnit === 0 && days === 0 && dailyUsage === 0 && !hasBoxNum) {
        continue;
      }
      // A열이 비어있거나, A열에 비고 메모가 적혀있어도 자재 속성(packUnit, days, dailyUsage, boxes)을 가진 경우 유효 자재행으로 수용
      const isMaterial = aStr === '' || packUnit > 0 || days > 0 || dailyUsage > 0 || hasBoxNum;
      if (isMaterial) {
        cur = {
          name: cStr,
          norm: normName(cStr),
          supplierHeader: currentSupplier,
          packUnit,
          bagPrice: num(r[16]),
          days,
          dailyUsage,
          menus: [],
        };
        mats.push(cur);
        continue;
      }
    }

    // 하위 메뉴행 (packUnit이 0이고 A열에 완제품 메뉴명이 있는 경우)
    if (cur && packUnit === 0 && aStr !== '') {
      cur.menus.push({ menu: aStr, normMenu: normName(aStr), qty: num(b), perUnit: num(c) });
    }
  }

  // 보조 계산기 시트(볶음참깨, 참기름, 마요네즈, 참치 등)의 정밀 레시피 연동
  try {
    const sesameSheet = wb.Sheets['볶음참깨, 참기름'];
    if (sesameSheet) {
      const sRows: any[][] = XLSX.utils.sheet_to_json(sesameSheet, { header: 1, defval: null });
      const oilMenus: BomChildLink[] = [];
      const seedMenus: BomChildLink[] = [];
      for (let i = 4; i < sRows.length; i++) {
        const r = sRows[i];
        if (!r) continue;
        const oilQty = num(r[7]);
        const oilMenu = r[8] != null ? String(r[8]).trim() : '';
        const oilPerUnit = num(r[9]);
        if (oilMenu && oilPerUnit > 0) {
          oilMenus.push({ menu: oilMenu, normMenu: normName(oilMenu), qty: oilQty, perUnit: oilPerUnit });
        }
        const seedQty = num(r[1]);
        const seedMenu = r[2] != null ? String(r[2]).trim() : '';
        const seedPerUnit = num(r[3]);
        if (seedMenu && seedPerUnit > 0) {
          seedMenus.push({ menu: seedMenu, normMenu: normName(seedMenu), qty: seedQty, perUnit: seedPerUnit });
        }
      }
      for (const m of mats) {
        if (m.name.includes('청학동참기름(1.8L') && oilMenus.length > 0) {
          m.menus = oilMenus;
        } else if (m.name.includes('볶음참깨') && !m.name.includes('흑임자') && seedMenus.length > 0) {
          m.menus = seedMenus;
        }
      }
    }

    const mayoSheet = wb.Sheets['마요네즈, 참치'];
    if (mayoSheet) {
      const mRows: any[][] = XLSX.utils.sheet_to_json(mayoSheet, { header: 1, defval: null });
      const mayoMenus: BomChildLink[] = [];
      const tunaMenus: BomChildLink[] = [];
      for (let i = 4; i < mRows.length; i++) {
        const r = mRows[i];
        if (!r) continue;
        const mayoQty = num(r[1]);
        const mayoMenu = r[2] != null ? String(r[2]).trim() : '';
        const mayoPerUnit = num(r[3]);
        if (mayoMenu && mayoPerUnit > 0) {
          mayoMenus.push({ menu: mayoMenu, normMenu: normName(mayoMenu), qty: mayoQty, perUnit: mayoPerUnit });
        }
        const tunaQty = num(r[7]);
        const tunaMenu = r[8] != null ? String(r[8]).trim() : '';
        const tunaPerUnit = num(r[9]);
        if (tunaMenu && tunaPerUnit > 0) {
          tunaMenus.push({ menu: tunaMenu, normMenu: normName(tunaMenu), qty: tunaQty, perUnit: tunaPerUnit });
        }
      }
      for (const m of mats) {
        if (m.name.includes('마요네즈') && mayoMenus.length > 0) {
          m.menus = mayoMenus;
        } else if ((m.name.includes('동원가라') || (m.name.includes('참치') && !m.name.includes('김치') && !m.name.includes('액젓'))) && tunaMenus.length > 0) {
          m.menus = tunaMenus;
        }
      }
    }
  } catch (subErr) {
    console.warn('Sub-calculator sheets parsing failed:', subErr);
  }

  return mats;
}

/** GFS식 개수품목 판별 (app.js isPieceOrCountItem 미러) */
export function isPieceOrCountItem(name: string): boolean {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return /패티|돈까스|돈카츠|까스|카츠|치킨|가라야게|스테이크|함박|너비아니|떡갈비|츠쿠네|산적|소시지|소세지|후랑크|핫도그번|핫바|어묵바|전\b|부추전|옥수수전|계란|란\b|알\b|메추리알|장어|유부|동그랑땡|완자|소포장|김밥김|삼각김|롤김|재래김|도시락김|곱창김|절김|1\/2김|용기|뚜껑|필름|스티커|라벨|바코드|컵|트레이|봉투|내피|외피|바란|간지|감열지|밴드|수축/.test(n) || /\(([0-9]{3,5})\)/.test(n);
}

/** BOM 투입단위 추론: 개수품목→장/매, 벌크→g */
export function inferBomUnit(materialName: string): string {
  if (!isPieceOrCountItem(materialName)) return 'g';
  const n = materialName;
  if (/김\b|김\(|김밥김|삼각김|롤김|재래김|도시락김|곱창김|절김|1\/2김|장\b/.test(n)) return '장';
  return '매';
}

/** 메뉴명 → 품종 추론 (완성품 kind) */
export function inferMenuKind(menu: string): string {
  const n = menu;
  if (/삼각|무스비/.test(n)) return '주먹밥';
  if (/김밥/.test(n)) return '김밥';
  if (/도시락|한상|고추장제육$|제육$/.test(n) && /도시락|한상|찬|반상/.test(n)) return '도시락';
  if (/도시락/.test(n)) return '도시락';
  if (/버거|샌드위치/.test(n)) return n.includes('버거') ? '햄버거' : '샌드위치';
  if (/우동|국수|면|파스타|라멘/.test(n)) return '조리면';
  return '';
}

export const AUDIT_SHEETS = ['부자재', '냉장1', '냉장2', '냉동', '상온'] as const;

/** Next.js ESM 번들(xlsx.mjs)에서 XLSX.readFile이 _fs 미바인딩으로 실패하는 문제 방지 */
export function readWorkbookFromFile(filePath: string): XLSX.WorkBook {
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer' });
}

/** 프로젝트 루트 기준 엑셀 경로 탐색 (GFS-ERP 안에 커밋된 정본 우선) */
function findFile(candidates: string[]): string | null {
  const root = process.cwd();
  for (const c of candidates) {
    const p = path.isAbsolute(c) ? c : path.join(root, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 루트 및 26년도/11월·10월에서 패턴 매칭 → 수정시각 최신 파일 (날짜 바뀐 정본 자동 추적, 엑셀 임시파일 및 macOS NFD 정규화 대응) */
function findLatestByPattern(pattern: RegExp): string | null {
  const root = process.cwd();
  const dirs = [
    path.join(root, '26년도', '11월'),
    path.join(root, '26년도', '10월'),
    root,
  ];
  const hits: Array<{ p: string; m: number }> = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('~$')) continue;
        if (!pattern.test(f.normalize('NFC'))) continue;
        const p = path.join(dir, f);
        hits.push({ p, m: fs.statSync(p).mtimeMs });
      }
    } catch {
      /* 읽기 실패 시 무시 */
    }
  }
  hits.sort((a, b) => b.m - a.m);
  return hits.length > 0 ? hits[0].p : null;
}

export function getAuditFilePath(): string | null {
  return (
    findLatestByPattern(/^일일 재고조사표 새 양식.*\.xlsx$/) ||
    findFile([
      '일일 재고조사표 새 양식(10월 29일) (2).xlsx',
      '/Users/bunker/GFS/일일 재고조사표 새 양식(10월 29일) (2).xlsx',
    ])
  );
}

export function getOrderSheetFilePath(): string | null {
  return (
    findLatestByPattern(/^★★발주서양식통합★★.*\.xlsx$/) ||
    findFile([
      '★★발주서양식통합★★(정준오)(v.260831) (2).xlsx',
      'GFS.xlsx',
      '/Users/bunker/GFS/★★발주서양식통합★★(정준오)(v.260831) (2).xlsx',
      '/Users/bunker/GFS/GFS.xlsx',
    ])
  );
}

/** 재고조사표 5시트 → 정본 맵 (norm → AuditEntry) */
export function buildAuditMap(wb: XLSX.WorkBook): Map<string, AuditEntry> {
  const map = new Map<string, AuditEntry>();
  for (const sheet of AUDIT_SHEETS) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    // R3 헤더, R4부터 데이터: 1거래처 2ID 3제품명 7박스 8낱개 9현재고 10입수량 12봉단가
    for (let i = 4; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const name = r[3];
      if (!name || String(name).trim().length < 2) continue;
      const norm = normName(name);
      if (!norm || map.has(norm)) continue;
      map.set(norm, {
        name: String(name).trim(),
        norm,
        warehouse: sheet,
        vendor: String(r[1] ?? '').trim(),
        itemId: r[2] != null ? String(r[2]).trim() : '',
        packUnit: Number(r[10]) || 0,
        bagPrice: Number(r[12]) || 0,
      });
    }
  }
  return map;
}

/** 발주시트 파싱 (발주서양식통합 / GFS.xlsx 공용) */
export function parseOrderSheet(wb: XLSX.WorkBook): { items: OrderSheetItem[]; suppliers: string[] } {
  const ws = wb.Sheets['발주시트'];
  if (!ws) return { items: [], suppliers: [] };
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const items: OrderSheetItem[] = [];
  const suppliers = new Set<string>();
  let header = '';
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const a = r[0];
    const b = r[1];
    const c = r[2];
    const aStr = a != null ? String(a).trim() : '';
    const cStr = c != null ? String(c).trim() : '';
    // 공급사 헤더행: A 있음 + B는 문자열/빈값 + C 비어있음 (메뉴행과 구분)
    if (aStr.length > 1 && (typeof b === 'string' || b == null) && (c == null || cStr === '' || cStr === 'null')) {
      header = aStr;
      suppliers.add(header);
      continue;
    }

    // 자재행 판단 조건:
    // 1. C가 비어있지 않음
    // 2. C가 숫자가 아님 (하위 메뉴행의 C는 개당소요량 숫자임)
    if (cStr === '' || cStr === 'null' || !isNaN(Number(cStr))) continue;

    const packUnit = Number(r[4]) || 0;
    const days = Number(r[6]) || 0;
    const dailyUsage = Number(r[7]) || 0;
    const boxes = r[3];
    const hasBoxNum = typeof boxes === 'number' && !isNaN(boxes);

    // 단순 메모/연락처 행 필터링 (입수, 일수, 사용량, 발주수량 모두 없는 비자재 행)
    if (packUnit === 0 && days === 0 && dailyUsage === 0 && !hasBoxNum) {
      continue;
    }

    // A열이 비어있거나, A열에 비고 메모가 적혀있어도 자재 속성(packUnit/days/dailyUsage/boxes)을 가진 유효 자재행 수용
    const isMaterial = aStr === '' || packUnit > 0 || days > 0 || dailyUsage > 0 || hasBoxNum;
    if (!isMaterial) continue;

    const name = cStr;
    const nRaw = r[13];
    const nVal = nRaw == null || (typeof nRaw === 'string' && nRaw.trim() === '') ? NaN : Number(nRaw);
    items.push({
      name: String(name).trim(),
      norm: normName(name),
      supplierHeader: header,
      boxes: typeof boxes === 'number' ? boxes : 0,
      packUnit,
      days,
      dailyUsage,
      incoming: Number(r[8]) || 0,
      currentStock: Number(r[9]) || 0,
      bagPrice: Number(r[16]) || 0,
      stockDays: isNaN(nVal) ? null : nVal,
    });
  }
  return { items, suppliers: [...suppliers] };
}

/** 서버 커밋된 정본 파일에서 정본 맵 로드 (파일별 독립, 실패해도 나머지는 반환) */
export function loadCanonicalFromRepo(): {
  audit: AuditEntry[];
  orderItems: OrderSheetItem[];
  suppliers: string[];
  auditFile: string | null;
  orderFile: string | null;
  errors: string[];
} {
  let audit: AuditEntry[] = [];
  let orderItems: OrderSheetItem[] = [];
  let suppliers: string[] = [];
  const errors: string[] = [];
  const auditFile = getAuditFilePath();
  const orderFile = getOrderSheetFilePath();
  if (auditFile) {
    try {
      const wb = readWorkbookFromFile(auditFile);
      audit = [...buildAuditMap(wb).values()];
    } catch (e: any) {
      errors.push(`재고조사표 로드 실패: ${e?.message || e}`);
    }
  } else {
    errors.push('재고조사표 파일을 찾을 수 없음');
  }
  if (orderFile) {
    try {
      const wb = readWorkbookFromFile(orderFile);
      const parsed = parseOrderSheet(wb);
      orderItems = parsed.items;
      suppliers = parsed.suppliers;
    } catch (e: any) {
      errors.push(`발주서 로드 실패: ${e?.message || e}`);
    }
  } else {
    errors.push('발주서 파일을 찾을 수 없음');
  }
  return { audit, orderItems, suppliers, auditFile, orderFile, errors };
}
