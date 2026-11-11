import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { normName } from './norm';
import { normalizeOrderCycleText, parseExcelLifecycle } from './productStatus';

export { normName };

export interface AuditEntry {
  name: string;
  norm: string;
  warehouse: string; // 냉장1 | 냉장2 | 냉동 | 상온 | 부자재
  vendor: string;
  itemId: string;
  packUnit: number;
  bagPrice: number;
  orderCycle?: string;
  status?: string;
  discontinuedDate?: string | null;
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
  orderBuffer?: number; // 시트별 손실/여유 버퍼 계수 (기본 1)
}

export interface BomMaterial {
  name: string;
  norm: string;
  supplierHeader: string;
  packUnit: number;
  bagPrice: number;
  days: number;
  dailyUsage: number; // H열 일사용량(박스/봉/병)
  divisor?: number; // H열 공식 내 단위 환산 분모 (예: 1000, 2000, 1.65, 40, 50 등)
  multiplier?: number; // H열 공식 내 계수 (예: 0.8)
  menus: BomChildLink[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

/** 발주시트 H열 수식에서 단위 환산 분모(divisor), 배율(multiplier), B/C 참조 행 범위, SUM(매수) 여부를 추출 */
function parseOrderFormulaMeta(formula: unknown): {
  divisor: number;
  multiplier: number;
  minRefRow: number | null;
  maxRefRow: number | null;
  isSumCount: boolean;
} {
  let divisor = 1;
  let multiplier = 1;
  if (!formula) {
    return { divisor, multiplier, minRefRow: null, maxRefRow: null, isSumCount: false };
  }
  const f = String(formula).replace(/\s+/g, '');

  // 괄호형 분모 예: /(450*1.5) → 675 (괄호 내 *1.5 를 multiplier 로 오인하지 않도록 제거)
  let rest = f;
  const parenDiv = f.match(/\/\(([0-9.]+)\*([0-9.]+)\)/);
  if (parenDiv) {
    const prod = Number(parenDiv[1]) * Number(parenDiv[2]);
    if (prod > 0) divisor = prod;
    rest = f.replace(parenDiv[0], '');
  } else {
    const divMatch = f.match(/\/([0-9.]+)/);
    if (divMatch) divisor = Number(divMatch[1]) || 1;
  }

  // % 계수(예: *90% → 0.9) 및 일반 배율(예: *0.8, *1.1) 추출
  const multMatch = rest.match(/\*([0-9.]+)(%?)/);
  if (multMatch) {
    const raw = Number(multMatch[1]) || 1;
    multiplier = multMatch[2] === '%' ? raw / 100 : raw;
  }

  // 발주시트 내 지역 B/C 행 범위 추출 (타시트 참조 '시트'!B1 제외)
  let minRefRow: number | null = null;
  let maxRefRow: number | null = null;
  const strippedCrossSheet = f.replace(/(?:'[^']+'|[가-힣A-Za-z0-9_]+)![$A-Za-z0-9:]+/g, '');
  const refMatches = strippedCrossSheet.matchAll(/(?:^|[^A-Z$])[$]?[BC][$]?(\d+)/g);
  for (const m of refMatches) {
    const rNum = Number(m[1]);
    if (rNum > 0) {
      minRefRow = minRefRow == null ? rNum : Math.min(minRefRow, rNum);
      maxRefRow = maxRefRow == null ? rNum : Math.max(maxRefRow, rNum);
    }
  }

  const isSumCount = /\bSUM\([^)]*\bB\d+(?::B\d+)?[^)]*\)/i.test(strippedCrossSheet);
  return { divisor, multiplier, minRefRow, maxRefRow, isSumCount };
}

/** 발주시트 내장 BOM 파싱: 자재행 + 하위 메뉴행(A=메뉴,B=수량,C=개당소요량,E=0) + 보조 계산기 시트 연동 */
export function parseOrderSheetBom(wb: XLSX.WorkBook): BomMaterial[] {
  const ws = wb.Sheets['발주시트'];
  if (!ws) return [];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const mats: BomMaterial[] = [];
  const matsByKey = new Map<string, BomMaterial>();
  let cur: BomMaterial | null = null;
  let curMeta: ReturnType<typeof parseOrderFormulaMeta> | null = null;
  let currentSupplier = '';

  const matDedupKey = (rawName: string, norm: string) => {
    const tag = rawName.match(/^\[(냉장1?|냉장2?|냉동|상온|부자재)\]/);
    return `${tag ? tag[1] : ''}|${norm}`;
  };

  const pushOrMergeMat = (m: BomMaterial) => {
    const key = matDedupKey(m.name, m.norm);
    const existing = matsByKey.get(key);
    if (!existing) {
      matsByKey.set(key, m);
      mats.push(m);
      return m;
    }
    if (existing.dailyUsage === 0 && m.dailyUsage > 0) existing.dailyUsage = m.dailyUsage;
    if (existing.packUnit === 0 && m.packUnit > 0) existing.packUnit = m.packUnit;
    if (existing.bagPrice === 0 && m.bagPrice > 0) existing.bagPrice = m.bagPrice;
    return existing;
  };

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
      curMeta = null;
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
        const hCell = ws['H' + (i + 1)];
        const meta = parseOrderFormulaMeta(hCell?.f);
        curMeta = meta;

        cur = pushOrMergeMat({
          name: cStr,
          norm: normName(cStr),
          supplierHeader: currentSupplier,
          packUnit,
          bagPrice: num(r[16]),
          days,
          dailyUsage,
          divisor: meta.divisor,
          multiplier: meta.multiplier,
          menus: [],
        });
        continue;
      }
    }

    // 하위 메뉴행 (packUnit이 0이고 A열에 완제품 메뉴명이 있는 경우)
    if (cur && packUnit === 0 && aStr !== '') {
      const excelRow = i + 1;
      // H열 수식에 명시된 행 범위(minRefRow..maxRefRow)가 있는 경우 범위 밖의 비활성/잔여 행 제외
      if (curMeta && curMeta.minRefRow != null && curMeta.maxRefRow != null) {
        if (excelRow < curMeta.minRefRow || excelRow > curMeta.maxRefRow) {
          continue;
        }
      }
      const cEmpty = c == null || cStr === '' || cStr === 'null';
      // 김 등 SUM(B...:B...) 매수 계산 품목에서 C열이 비어 있으면 기본 1장(매)
      const perUnit = cEmpty && curMeta?.isSumCount ? 1 : num(c);
      const normMenu = normName(aStr);
      if (!cur.menus.some((m) => m.normMenu === normMenu)) {
        cur.menus.push({ menu: aStr, normMenu, qty: num(b), perUnit });
      }
    }
  }

  // 보조 계산기 시트(볶음참깨/참기름, 마요네즈/참치, 야채 계산기, 조미식초, 정제염, 바코드) 정밀 레시피 연동
  const dedupPush = (arr: BomChildLink[], item: BomChildLink) => {
    if (!item.menu || item.perUnit <= 0) return;
    if (!arr.some((x) => x.normMenu === item.normMenu)) arr.push(item);
  };

  try {
    const sesameSheet = wb.Sheets['볶음참깨, 참기름'];
    if (sesameSheet) {
      const sRows: any[][] = XLSX.utils.sheet_to_json(sesameSheet, { header: 1, defval: null });
      const oil18Menus: BomChildLink[] = [];
      const oil165Menus: BomChildLink[] = [];
      const seedMenus: BomChildLink[] = [];
      const seedBuf = num(sRows[3]?.[4]) || 1.1;
      const oil18Buf = num(sRows[3]?.[10]) || 1.1;
      const oil165Buf = num(sRows[3]?.[18]) || 1.1;
      for (let i = 4; i < Math.min(sRows.length, 60); i++) {
        const r = sRows[i];
        if (!r) continue;
        const seedMenu = r[2] != null ? String(r[2]).trim() : '';
        dedupPush(seedMenus, { menu: seedMenu, normMenu: normName(seedMenu), qty: num(r[1]), perUnit: num(r[3]), orderBuffer: seedBuf });

        const oil18Menu = r[8] != null ? String(r[8]).trim() : '';
        dedupPush(oil18Menus, { menu: oil18Menu, normMenu: normName(oil18Menu), qty: num(r[7]), perUnit: num(r[9]), orderBuffer: oil18Buf });

        const oil165Menu = r[16] != null ? String(r[16]).trim() : '';
        dedupPush(oil165Menus, { menu: oil165Menu, normMenu: normName(oil165Menu), qty: num(r[15]), perUnit: num(r[17]), orderBuffer: oil165Buf });
      }
      for (const m of mats) {
        if (m.name.includes('청학동참기름(1.8L') && oil18Menus.length > 0) {
          m.menus = oil18Menus;
          if (!m.divisor || m.divisor < 100) m.divisor = m.divisor && m.divisor > 1 ? Math.round(m.divisor * 1000) : 1650;
        } else if (m.name.includes('참기름(16.5') && oil165Menus.length > 0) {
          m.menus = oil165Menus;
          if (!m.divisor || m.divisor < 100) m.divisor = m.divisor && m.divisor > 1 ? Math.round(m.divisor * 1000) : 16500;
        } else if (m.name.includes('볶음참깨') && !m.name.includes('흑임자') && seedMenus.length > 0) {
          m.menus = seedMenus;
          if (!m.divisor || m.divisor < 100) m.divisor = 1000;
        }
      }
    }

    const mayoSheet = wb.Sheets['마요네즈, 참치'];
    if (mayoSheet) {
      const mRows: any[][] = XLSX.utils.sheet_to_json(mayoSheet, { header: 1, defval: null });
      const mayoMenus: BomChildLink[] = [];
      const tunaMenus: BomChildLink[] = [];
      const mayoBuf = num(mRows[3]?.[4]) || 1.1;
      const tunaBuf = num(mRows[3]?.[10]) || 1.1;
      for (let i = 4; i < Math.min(mRows.length, 60); i++) {
        const r = mRows[i];
        if (!r) continue;
        const mayoMenu = r[2] != null ? String(r[2]).trim() : '';
        dedupPush(mayoMenus, { menu: mayoMenu, normMenu: normName(mayoMenu), qty: num(r[1]), perUnit: num(r[3]), orderBuffer: mayoBuf });

        const tunaMenu = r[8] != null ? String(r[8]).trim() : '';
        dedupPush(tunaMenus, { menu: tunaMenu, normMenu: normName(tunaMenu), qty: num(r[7]), perUnit: num(r[9]), orderBuffer: tunaBuf });
      }
      for (const m of mats) {
        if (m.name.includes('마요네즈') && mayoMenus.length > 0 && m.menus.length <= mayoMenus.length) {
          m.menus = mayoMenus;
          if (!m.divisor || m.divisor < 100) m.divisor = 10000;
        } else if (
          (m.name.includes('동원가라') ||
            (m.name.includes('살코기참치') && !m.name.includes('김치') && !m.name.includes('액젓') && !m.name.includes('다시'))) &&
          tunaMenus.length > 0
        ) {
          m.menus = tunaMenus;
          if (!m.divisor || m.divisor < 100) m.divisor = m.divisor && m.divisor > 1 ? Math.round(m.divisor * 1000) : 3000;
        }
      }
    }

    const vegSheet = wb.Sheets['야채 계산기'];
    if (vegSheet) {
      const vRows: any[][] = XLSX.utils.sheet_to_json(vegSheet, { header: 1, defval: null });
      const menuHeaderRow = vRows[1] || [];
      const qtyRow = vRows[2] || [];
      for (let i = 4; i < Math.min(vRows.length, 40); i++) {
        const r = vRows[i];
        if (!r) continue;
        const matName = r[1] != null ? String(r[1]).trim() : '';
        if (!matName) continue;
        const matNorm = normName(matName);
        const matchedMat = matsByKey.get(matDedupKey(matName, matNorm));
        if (!matchedMat) continue;
        const links: BomChildLink[] = [];
        for (let c = 5; c < menuHeaderRow.length; c++) {
          const menuName = menuHeaderRow[c] != null ? String(menuHeaderRow[c]).trim() : '';
          const perUnit = num(r[c]);
          if (menuName && perUnit > 0) {
            dedupPush(links, { menu: menuName, normMenu: normName(menuName), qty: num(qtyRow[c]), perUnit, orderBuffer: 1 });
          }
        }
        if (links.length > 0) {
          matchedMat.menus = links;
        }
      }
    }

    const vinegarSheet = wb.Sheets['조미식초'];
    if (vinegarSheet) {
      const aRows: any[][] = XLSX.utils.sheet_to_json(vinegarSheet, { header: 1, defval: null });
      const vinegarMenus: BomChildLink[] = [];
      for (let i = 3; i < Math.min(aRows.length, 40); i++) {
        const r = aRows[i];
        if (!r || String(r[0] ?? '').trim() !== '원물중량') continue;
        const menuRow = aRows[i - 1] || [];
        const qtyRow = aRows[i + 1] || [];
        const buf = num(aRows[i + 2]?.[0]) || 1.1;
        for (let c = 1; c < menuRow.length; c++) {
          const menuName = menuRow[c] != null ? String(menuRow[c]).trim() : '';
          const perUnit = num(r[c]);
          if (menuName && perUnit > 0) {
            dedupPush(vinegarMenus, { menu: menuName, normMenu: normName(menuName), qty: num(qtyRow[c]), perUnit, orderBuffer: buf });
          }
        }
      }
      if (vinegarMenus.length > 0) {
        for (const m of mats) {
          if (m.name.includes('조미식초소스') && !m.name.includes('다시마')) {
            m.menus = vinegarMenus;
          }
        }
      }
    }

    const saltSheet = wb.Sheets['정제염'];
    if (saltSheet) {
      const zRows: any[][] = XLSX.utils.sheet_to_json(saltSheet, { header: 1, defval: null });
      const saltMenus: BomChildLink[] = [];
      const saltBuf = num(zRows[3]?.[3]) || 1.1;
      for (let i = 4; i < Math.min(zRows.length, 60); i++) {
        const r = zRows[i];
        if (!r) continue;
        const menuName = r[1] != null ? String(r[1]).trim() : '';
        const perUnit = num(r[2]);
        if (menuName && perUnit > 0) {
          dedupPush(saltMenus, { menu: menuName, normMenu: normName(menuName), qty: num(r[0]), perUnit, orderBuffer: saltBuf });
        }
      }
      if (saltMenus.length > 0) {
        for (const m of mats) {
          if (m.name.includes('정제염')) {
            m.menus = saltMenus;
            if (!m.divisor || m.divisor <= 1) m.divisor = 25000;
          }
        }
      }
    }

    const barcodeSheet = wb.Sheets['바코드'];
    if (barcodeSheet) {
      const bRows: any[][] = XLSX.utils.sheet_to_json(barcodeSheet, { header: 1, defval: null });
      const blocks = [
        { qtyCol: 0, menuCol: 1, perCol: 2, bufCol: 3, targetName: '바코드54*45(삼각)(청색/적색)' },
        { qtyCol: 6, menuCol: 7, perCol: 8, bufCol: 9, targetName: '바코드56*45(김밥)(청색/적색)' },
        { qtyCol: 12, menuCol: 13, perCol: 14, bufCol: 15, targetName: '바코드60*35(도시락)(청색/적색)' },
      ];
      for (const blk of blocks) {
        const buf = num(bRows[3]?.[blk.bufCol]) || 1.01;
        const links: BomChildLink[] = [];
        for (let i = 4; i < Math.min(bRows.length, 60); i++) {
          const r = bRows[i];
          if (!r) continue;
          const menuName = r[blk.menuCol] != null ? String(r[blk.menuCol]).trim() : '';
          const perUnit = num(r[blk.perCol]);
          if (menuName && perUnit > 0) {
            dedupPush(links, { menu: menuName, normMenu: normName(menuName), qty: num(r[blk.qtyCol]), perUnit, orderBuffer: buf });
          }
        }
        if (links.length > 0) {
          const targetNorm = normName(blk.targetName);
          const existing = matsByKey.get(matDedupKey(blk.targetName, targetNorm));
          if (existing) {
            existing.menus = links;
          } else {
            pushOrMergeMat({
              name: blk.targetName,
              norm: targetNorm,
              supplierHeader: '바코드',
              packUnit: 1,
              bagPrice: 0,
              days: 0,
              dailyUsage: 0,
              divisor: 5000,
              multiplier: 1,
              menus: links,
            });
          }
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
  // 소스, 양념, 엑기스, 오일, 유, 장, 가루, 분말, 면류, 베이스 등 벌크 액체/분말은 무조건 중량(g) 품목
  if (/소스|양념|엑기스|시즈닝|드레싱|오일|참기름|들기름|식용유|간장|고추장|된장|식초|미림|물엿|시럽|설탕|소금|염|가루|분말|다시다|면\b|우동면|소면|라면|스프|베이스/.test(n)) {
    return false;
  }
  return (
    /패티|돈까스|돈카츠|까스|카츠|치킨|가라야게|스테이크|함박|너비아니|떡갈비|츠쿠네|산적|소시지|소세지|후랑크|핫도그번|핫바|어묵바|전\b|부추전|옥수수전|계란|란\b|알\b|메추리알|장어|유부|동그랑땡|완자|소포장|김밥김|삼각김|롤김|재래김|도시락김|곱창김|절김|1\/2김|용기|뚜껑|필름|스티커|라벨|바코드|컵|트레이|봉투|내피|외피|바란|간지|감열지|밴드|수축/.test(
      n
    ) || /\(([0-9]{3,5})\s*(매|장|개|ea|입)\)/i.test(n)
  );
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

function extractAuditFilenameDateScore(filename: string): number {
  const nfc = filename.normalize('NFC');
  const ymd = nfc.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (ymd) {
    return Number(ymd[1]) * 10000 + Number(ymd[2]) * 100 + Number(ymd[3]);
  }
  const md = nfc.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (md) {
    // 26년도 디렉터리/현재 기준 2026년 기준 점수화 (11월 10일 → 20261110)
    return 20260000 + Number(md[1]) * 100 + Number(md[2]);
  }
  return 0;
}

/** 루트 및 26년도/11월·10월에서 패턴 매칭 → 파일명 일자 우선 + 수정시각 최신 파일 */
function findLatestByPattern(pattern: RegExp): string | null {
  const root = process.cwd();
  const dirs = [
    path.join(root, '26년도', '11월'),
    path.join(root, '26년도', '10월'),
    root,
  ];
  const hits: Array<{ p: string; dateScore: number; m: number }> = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('~$')) continue;
        const nfc = f.normalize('NFC');
        if (!pattern.test(nfc)) continue;
        const p = path.join(dir, f);
        hits.push({
          p,
          dateScore: extractAuditFilenameDateScore(nfc),
          m: fs.statSync(p).mtimeMs,
        });
      }
    } catch {
      /* 읽기 실패 시 무시 */
    }
  }
  hits.sort((a, b) => (b.dateScore !== a.dateScore ? b.dateScore - a.dateScore : b.m - a.m));
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
  // DB 100% 일원화: 과거 외부 발주시트 엑셀 파일 의존성 영구 차단 (단일 진실 공급원 = PostgreSQL)
  return null;
}

/** 재고조사표 평일/주말 다중 양식 적응형 → 정본 맵 (norm → AuditEntry) */
export function buildAuditMap(wb: XLSX.WorkBook): Map<string, AuditEntry> {
  const map = new Map<string, AuditEntry>();
  // 1) 표준 5대 창고 시트 확인
  const availSheets = AUDIT_SHEETS.filter((s) => wb.Sheets[s] != null);
  const targetSheets =
    availSheets.length > 0
      ? availSheets.map((s) => ({ sheet: s, defaultWh: s }))
      : wb.SheetNames.filter((sn) => wb.Sheets[sn] && !/불용|폐기|수식|코드|참고|기준/i.test(sn.trim()))
          .map((s) => ({ sheet: s, defaultWh: '' }));

  if (targetSheets.length === 0 && wb.SheetNames.length > 0) {
    targetSheets.push({ sheet: wb.SheetNames[0], defaultWh: '' });
  }

  for (const { sheet, defaultWh } of targetSheets) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!rows || rows.length < 2) continue;

    // 헤더 행 탐색 (최대 상위 10행 스캔)
    let headerIdx = -1;
    let colName = 3, colVendor = 1, colId = 2, colCycle = 4, colExp = 6, colPack = 10, colPrice = 12, colWh = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const found = row.some((c: any) => /제품명|품명|품목명|자재명|원부자재명/.test(String(c ?? '')));
      if (found) {
        headerIdx = i;
        row.forEach((c: any, idx: number) => {
          const s = String(c ?? '').replace(/\s+/g, '');
          if (/제품명|품명|품목명|자재명|원부자재명/.test(s)) colName = idx;
          else if (/거래처|공급처|매입처|업체명|공급사/.test(s)) colVendor = idx;
          else if (/ID|품번|품목코드|자재코드|^코드$/.test(s)) colId = idx;
          else if (/입고일|발주주기|리드타임/.test(s)) colCycle = idx;
          else if (/유통기한|소비기한|카테고리|상태|비고/.test(s) && colExp === 6) colExp = idx;
          else if (/입수량|포장단위|^입수$/.test(s)) colPack = idx;
          else if (/봉단가|매입단가|^단가$/.test(s)) colPrice = idx;
          else if (/창고|보관창고|저장위치|창고명/.test(s)) colWh = idx;
        });
        break;
      }
    }

    const startRow = headerIdx >= 0 ? headerIdx + 1 : 4;
    for (let i = startRow; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const name = r[colName];
      if (!name || String(name).trim().length < 2 || String(name).trim() === 'None') continue;
      const cleanName = String(name).replace(/[\r\n]+/g, ' ').trim();
      const norm = normName(cleanName);
      if (!norm || map.has(norm)) continue;

      let wh = defaultWh;
      if (!wh && colWh >= 0 && r[colWh]) {
        wh = String(r[colWh]).trim();
      }
      if (!wh) {
        const sName = cleanName;
        if (sName.startsWith('[냉장]')) wh = '냉장1';
        else if (sName.startsWith('[냉동]')) wh = '냉동';
        else if (sName.startsWith('[상온]')) wh = '상온';
        else if (/적색|청색|필름|봉투|스티커|박스|롤|감열지|용기/i.test(sName)) wh = '부자재';
        else wh = '상온';
      }

      const lifecycle = colExp >= 0 ? parseExcelLifecycle(r[colExp]) : { status: '정상', discontinuedDate: null };
      map.set(norm, {
        name: cleanName,
        norm,
        warehouse: wh,
        vendor: colVendor >= 0 ? String(r[colVendor] ?? '').trim() : '',
        itemId: colId >= 0 && r[colId] != null ? String(r[colId]).trim() : '',
        packUnit: colPack >= 0 ? Number(r[colPack]) || 0 : 0,
        bagPrice: colPrice >= 0 ? Number(r[colPrice]) || 0 : 0,
        orderCycle: colCycle >= 0 ? normalizeOrderCycleText(r[colCycle]) : '',
        status: lifecycle.status,
        discontinuedDate: lifecycle.discontinuedDate,
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
