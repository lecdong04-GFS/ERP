// 일일 재고조사표(26년도/10월·11월) → InventorySnapshot 백필
// 실행: npx tsx scripts/backfill-inventory-snapshots.ts [--write]
// 기본 dry-run (DB 무변경, 리포트만). --write 시 날짜별 교체 저장.
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from './lib/env';

loadEnv();

const WRITE = process.argv.includes('--write');
const BASE = path.join(process.cwd(), '26년도');
const EXCLUDE_FILE = '일일 재고조사표 새 양식(10월 5일).xlsx';
const CREATED_BY = 'BACKFILL-재고조사표';
const DELETE_MARK = /삭제|이관|불용/;

// 표준 5대 창고 시트 (Sheet1은 발주시트 VLOOKUP용 합본 사본이므로 절대 부자재에 혼입하지 않음)
const STD_SHEETS = ['냉장1', '냉장2', '냉동', '상온', '부자재'];

import { canonNormName as normName } from '../src/lib/gfs/norm';
import { getEstimatedDailyUsage } from '../src/lib/gfs/estimatedUsage';

function parseLeadDays(s: string): number {
  const m = /D[+-](\d+)/i.exec(s || '');
  if (m) return Math.max(1, parseInt(m[1], 10));
  return 2;
}

function calcSafetyStock(dailyInBaseUnit: number, leadDays: number): number {
  if (!(dailyInBaseUnit > 0)) return 0;
  return Math.max(1, Math.round(dailyInBaseUnit * leadDays * 1.5));
}
function text(v: unknown): string {
  return String(v ?? '')
    .normalize('NFC')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
function normExpiry(s: string): string {
  const m = /^(\d{2}|\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(s.trim());
  if (!m) return '';
  const yy = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${yy}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
/** 입수량 텍스트 → 박스당 개수 ("1100ea/box"→1100, "10장/묶음"→10, 숫자→그대로, 치수 등→1) */
function parsePack(s: unknown): number {
  const t = String(s ?? '').replace(/,/g, '').trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  let m = /(\d+(?:\.\d+)?)\s*ea\s*\/\s*box/i.exec(t);
  if (m) return Number(m[1]);
  m = /(\d+(?:\.\d+)?)\s*장\s*\/\s*묶음/.exec(t);
  if (m) return Number(m[1]);
  m = /(\d+(?:\.\d+)?)\s*(?:매|장|ea|개|식)\b/i.exec(t);
  if (m) return Number(m[1]);
  return 1;
}

interface SnapRow {
  warehouse: string;
  productName: string;
  vendor: string;
  itemCode: string;
  category: string;
  itemType: string;
  inboundDate: string;
  expiryDate: string;
  currentQty: number;
  dailyUsage: number;
  packUnit: number;
  boxQty: number;
  pieceQty: number;
  unit: string;
  unitPrice: number;
  stockAmount: number;
  remark: string;
  sheetRow: number;
}

function parseStandard(
  ws: XLSX.WorkSheet,
  rows: unknown[][],
  warehouse: string,
  headerIdx: number,
  flags: string[],
): SnapRow[] {
  const out: SnapRow[] = [];
  const seenCodeInSheet = new Map<string, string>(); // itemCode -> normName(first productName)
  for (let r = headerIdx + 1; r < rows.length; i_noop(r), r++) {
    const row = (rows[r] || []) as unknown[];
    if (typeof row[0] !== 'number') continue;
    const name = text(row[3]);
    if (!name) continue;
    const note6 = text(row[6]);
    if (DELETE_MARK.test(note6)) continue;
    const exp = normExpiry(note6);
    const extra: string[] = [];
    if (note6 && !exp) extra.push(note6);
    const orderNote = text(row[11]);
    if (orderNote) extra.push(`발주일:${orderNote}`);
    for (const c of (rows[r] as unknown[]).slice(14)) {
      const t = text(c);
      if (t) extra.push(t);
    }
    const itemCode = text(row[2]);
    const nName = normName(name);
    let isCopiedCodeCollision = false;
    if (itemCode) {
      const firstOwner = seenCodeInSheet.get(itemCode);
      if (!firstOwner) {
        seenCodeInSheet.set(itemCode, nName);
      } else if (firstOwner !== nName) {
        isCopiedCodeCollision = true;
      }
    }
    const packUnit = num(row[10]) > 0 ? num(row[10]) : 1;
    const fCell = ws[XLSX.utils.encode_cell({ r, c: 5 })];
    const fFormula = String(fCell?.f || '');
    const rawDaily = isCopiedCodeCollision && fFormula.includes('VLOOKUP') ? 0 : num(row[5]);
    // 냉장1·냉장2·냉동·상온 및 /K 수식이 있는 부자재 행은 F열이 박스 단위이므로 입수량(packUnit)을 곱해 현재고(봉/낱개) 단위로 통일
    const dailyInBaseUnit =
      rawDaily > 0 && (warehouse !== '부자재' || fFormula.includes('/K'))
        ? rawDaily * packUnit
        : rawDaily;

    out.push({
      warehouse,
      productName: name,
      vendor: text(row[1]),
      itemCode,
      category: warehouse === '부자재' ? text(row[6]) || '부자재' : '',
      itemType: warehouse === '부자재' ? '부자재' : '원재료',
      inboundDate: text(row[4]),
      expiryDate: warehouse === '부자재' ? '' : exp,
      currentQty: Math.round(num(row[9]) * 100) / 100,
      dailyUsage: Math.round(dailyInBaseUnit * 100) / 100,
      packUnit,
      boxQty: Math.round(num(row[7]) * 100) / 100,
      pieceQty: Math.round(num(row[8]) * 100) / 100,
      unit: '',
      unitPrice: Math.round(num(row[12]) * 100) / 100,
      stockAmount: Math.round(num(row[13])),
      remark: extra.join(' / '),
      sheetRow: r + 1,
    });
  }
  return out;
}
function i_noop(_: number) {}

function parseLatest(rows: unknown[][], flags: string[]): SnapRow[] {
  // 헤더: row3(순서..입수량..) + row4(박스/봉/롤/단가..), 데이터 row5~
  let headerIdx = rows.findIndex((r) => (r as unknown[]).some((c) => String(c).includes('제품명')));
  if (headerIdx < 0) headerIdx = 3;
  const out: SnapRow[] = [];
  for (let r = headerIdx + 2; r < rows.length; r++) {
    const row = (rows[r] || []) as unknown[];
    if (typeof row[0] !== 'number') continue;
    const name = text(row[4]);
    if (!name) continue;
    const remark = text(row[14]);
    if (DELETE_MARK.test(remark) || DELETE_MARK.test(name)) continue;
    const box = num(row[7]);
    const bong = num(row[8]);
    const roll = num(row[9]);
    const rollBased = roll > 0 && box === 0 && bong === 0;
    const boxP = num(row[10]);
    const bongP = num(row[11]);
    let pack = 1;
    if (boxP > 0 && bongP > 0) pack = boxP / bongP;
    else pack = parsePack(row[6]);
    if (!(pack > 0) || !Number.isFinite(pack)) pack = 1;
    const qty = rollBased ? roll : box * pack + bong + roll;
    const rollP = num(row[12]);
    const cands = rollBased
      ? [rollP, bongP, boxP]
      : [bongP, rollP, pack > 0 ? boxP / pack : 0];
    const valid = cands.filter((p) => p > 0);
    let price = valid[0] ?? 0;
    const amount = num(row[13]);
    if (amount > 0 && qty > 0 && valid.length > 1) {
      let best = valid[0];
      let bestDiff = Math.abs(qty * valid[0] - amount) / amount;
      for (const c of valid.slice(1)) {
        const d = Math.abs(qty * c - amount) / amount;
        if (d < bestDiff) {
          best = c;
          bestDiff = d;
        }
      }
      price = best;
      if (bestDiff > 0.05) flags.push(`최신판 금액불일치: ${name} (계산 ${Math.round(qty * price)} vs 시트 ${amount})`);
    }
    out.push({
      warehouse: '부자재',
      productName: name,
      vendor: text(row[2]),
      itemCode: '',
      category: text(row[3]) || '부자재',
      itemType: '부자재',
      inboundDate: text(row[5]),
      expiryDate: '',
      currentQty: Math.round(qty * 100) / 100,
      dailyUsage: 0,
      packUnit: rollBased ? 1 : pack,
      boxQty: box,
      pieceQty: bong + roll,
      unit: rollBased ? '롤' : 'ea',
      unitPrice: Math.round(price * 100) / 100,
      stockAmount: amount,
      remark,
      sheetRow: r + 1,
    });
  }
  return out;
}

interface FileResult {
  file: string;
  date: string;
  rows: SnapRow[];
  sheets: string[];
  flags: string[];
}

function parseFile(filePath: string, date: string): FileResult {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetByNorm = new Map<string, string>();
  for (const sn of wb.SheetNames) sheetByNorm.set(sn.normalize('NFC'), sn);
  const rows: SnapRow[] = [];
  const flags: string[] = [];
  const sheets: string[] = [];
  for (const sn of STD_SHEETS) {
    const real = sheetByNorm.get(sn.normalize('NFC'));
    const ws = real ? wb.Sheets[real] : undefined;
    if (!ws) {
      flags.push(`시트 없음: ${sn}`);
      continue;
    }
    const sr = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    if (!sr.length) continue;
    sheets.push(sn);
    const hi = sr.findIndex((r) => (r as unknown[]).some((c) => String(c).includes('제품명')));
    rows.push(...parseStandard(ws, sr, sn, hi >= 0 ? hi : 3, flags));
  }
  return { file: path.basename(filePath), date, rows, sheets, flags };
}

function collectFiles(): { filePath: string; date: string }[] {
  const out: { filePath: string; date: string }[] = [];
  for (const monthDir of ['10월', '11월']) {
    const dir = path.join(BASE, monthDir);
    const month = monthDir === '10월' ? '10' : '11';
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.xlsx') || f.startsWith('~$')) continue;
      const fn = f.normalize('NFC');
      if (fn === EXCLUDE_FILE) continue;
      const m = /(\d{1,2})일/.exec(fn);
      if (!m) continue;
      const day = m[1].padStart(2, '0');
      out.push({ filePath: path.join(dir, f), date: `2026-${month}-${day}` });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function main() {
  const files = collectFiles();
  console.log(`대상 파일: ${files.length}개`);
  const prisma = new PrismaClient();
  try {
    const allProds = await prisma.product.findMany({ select: { id: true, productCode: true, name: true } });
    const byNorm = new Map<string, { id: number; productCode: string }>();
    for (const p of allProds) {
      const k = normName(p.name);
      if (k && !byNorm.has(k)) byNorm.set(k, { id: p.id, productCode: p.productCode });
    }
    const estUsage = getEstimatedDailyUsage(true);
    console.log(`기준정보 품목: ${allProds.length}건 · 추정일사용량 산출: ${Object.keys(estUsage.byWhAndKey).length}건`);

    const unmatched = new Map<string, Set<string>>();
    let totalRows = 0;
    let totalDup = 0;
    const snapCodeCheck = new Map<string, string>(); // snapCode -> normName (충돌 검출)
    const codeCollisions: string[] = [];
    let lastSurveyedSubRows: SnapRow[] = [];

    for (const { filePath, date } of files) {
      const fr = parseFile(filePath, date);
      // 부자재는 주 2회(일·화)만 실사하므로 비실사일(부자재 합계=0)에는 직전 실사일의 부자재 재고를 이월 유지
      const subRows = fr.rows.filter((r) => r.warehouse === '부자재');
      const subTotalQty = subRows.reduce((s, r) => s + r.currentQty, 0);
      if (subTotalQty > 0) {
        lastSurveyedSubRows = subRows.map((r) => ({ ...r }));
      } else if (lastSurveyedSubRows.length > 0) {
        const nonSub = fr.rows.filter((r) => r.warehouse !== '부자재');
        fr.rows = [...nonSub, ...lastSurveyedSubRows.map((r) => ({ ...r }))];
      }
      // 1단계: LOT 그룹 (창고|품명norm|ID|유통기한) — 그룹 내 완전중복(수량 동일) 1건만 유지
      const lots = new Map<string, SnapRow[]>();
      for (const r of fr.rows) {
        const key = `${r.warehouse}|${normName(r.productName)}|${r.itemCode}|${r.expiryDate}`;
        if (!lots.has(key)) lots.set(key, []);
        lots.get(key)!.push(r);
      }
      const lotRows: SnapRow[] = [];
      let exactDups = 0;
      for (const group of lots.values()) {
        const seenQty = new Set<string>();
        for (const r of group) {
          const qk = `${r.boxQty}|${r.pieceQty}|${r.currentQty}|${r.stockAmount}`;
          if (seenQty.has(qk)) {
            exactDups += 1;
            continue;
          }
          seenQty.add(qk);
          lotRows.push({ ...r });
        }
      }
      // 2단계: (창고|품명norm) 합산 — DB 유일키(날짜,품번,창고) 보장
      const agg = new Map<string, SnapRow>();
      let merged = 0;
      for (const r of lotRows) {
        const key = `${r.warehouse}|${normName(r.productName)}`;
        const prev = agg.get(key);
        if (!prev) {
          agg.set(key, { ...r });
          continue;
        }
        merged += 1;
        prev.currentQty += r.currentQty;
        prev.boxQty += r.boxQty;
        prev.pieceQty += r.pieceQty;
        prev.stockAmount += r.stockAmount;
        prev.dailyUsage = Math.max(prev.dailyUsage, r.dailyUsage);
        if (!prev.vendor && r.vendor) prev.vendor = r.vendor;
        if (!prev.itemCode && r.itemCode) prev.itemCode = r.itemCode;
        if (!prev.expiryDate && r.expiryDate) prev.expiryDate = r.expiryDate;
        if (!prev.inboundDate && r.inboundDate) prev.inboundDate = r.inboundDate;
        if (!prev.unitPrice && r.unitPrice) prev.unitPrice = r.unitPrice;
        if (r.remark && !prev.remark.includes(r.remark)) prev.remark = prev.remark ? `${prev.remark} / ${r.remark}` : r.remark;
      }
      const final = [...agg.values()];
      let matched = 0;
      let snapCoded = 0;
      const byWh = new Map<string, number>();
      for (const r of final) {
        byWh.set(r.warehouse, (byWh.get(r.warehouse) || 0) + 1);
        const hit = byNorm.get(normName(r.productName));
        if (hit) {
          matched += 1;
        } else {
          snapCoded += 1;
          if (!unmatched.has(r.productName)) unmatched.set(r.productName, new Set());
          unmatched.get(r.productName)!.add(date);
          const code = `SNAP-${fnv1a(normName(r.productName))}`;
          const prevName = snapCodeCheck.get(code);
          if (prevName && prevName !== normName(r.productName)) codeCollisions.push(`${code}: ${prevName} vs ${r.productName}`);
          else snapCodeCheck.set(code, normName(r.productName));
        }
      }
      totalRows += final.length;
      totalDup += merged;
      console.log(
        `${date} ${fr.file} | 파싱 ${fr.rows.length} → LOT ${lotRows.length}(완전중복 ${exactDups} 제거) → 집계 ${final.length}(합산 ${merged}) | 매칭 ${matched} / 미매칭 ${snapCoded} | 창고 ${[...byWh].map(([w, c]) => `${w}:${c}`).join(',')}`,
      );
      for (const fl of fr.flags.slice(0, 8)) console.log(`   ! ${fl}`);
      if (fr.flags.length > 8) console.log(`   ! ... 외 ${fr.flags.length - 8}건`);

      if (WRITE) {
        const data = final.map((r) => {
          const nKey = normName(r.productName);
          const hit = byNorm.get(nKey);
          const code = hit ? hit.productCode : `SNAP-${fnv1a(nKey)}`;
          const est = estUsage.byWhAndKey[`${r.warehouse}|${nKey}`] || estUsage.byKeyOnly[nKey];
          const effDaily = r.dailyUsage > 0 ? r.dailyUsage : est?.estDailyUsage || 0;
          const safety = calcSafetyStock(effDaily, parseLeadDays(r.inboundDate));
          return {
            snapshotDate: date,
            productId: hit?.id ?? null,
            productCode: code,
            productName: r.productName,
            category: r.category,
            warehouse: r.warehouse,
            lotNo: '',
            expiryDate: r.expiryDate,
            currentQty: r.currentQty,
            dailyUsage: r.dailyUsage,
            packUnit: r.packUnit,
            boxQty: r.boxQty,
            pieceQty: r.pieceQty,
            unit: r.unit,
            unitPrice: r.unitPrice,
            stockAmount: r.stockAmount,
            safetyStock: safety,
            inboundDate: r.inboundDate,
            vendor: r.vendor,
            itemCode: r.itemCode,
            itemType: r.itemType,
            spec: '',
            remark: r.remark,
            createdBy: CREATED_BY,
          };
        });
        await prisma.$transaction([
          prisma.inventorySnapshot.deleteMany({ where: { snapshotDate: date } }),
          prisma.inventorySnapshot.createMany({ data }),
        ]);
        console.log(`   → 저장 ${data.length}건`);
      }
    }
    console.log(`\n합계: ${totalRows}건 (중복합산 ${totalDup}건), 미매칭 품목 ${unmatched.size}종`);
    if (codeCollisions.length > 0) {
      console.log('!! SNAP 코드 충돌:');
      codeCollisions.forEach((c) => console.log('  ' + c));
    }
    const top = [...unmatched.entries()].map(([n, s]) => [n, s.size] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 30);
    console.log('미매칭 상위 30종 (등장일자수):');
    top.forEach(([n, c]) => console.log(`  ${c}일: ${n}`));
    fs.writeFileSync('/tmp/unmatched-products.txt', [...unmatched.entries()].map(([n, s]) => `${s.size}\t${n}`).sort().reverse().join('\n'));
    console.log('전체 미매칭 목록: /tmp/unmatched-products.txt');
    if (!WRITE) console.log('\nDRY-RUN (저장 안 함). 저장하려면 --write');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
