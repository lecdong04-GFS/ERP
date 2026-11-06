import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { readWorkbookFromFile } from './canonical';
import { strictNormName, canonNormName } from './norm';

export { strictNormName, canonNormName };

export const WAREHOUSE_SHEETS = ['냉장1', '냉장2', '냉동', '상온', '부자재'] as const;
const DELETE_MARK = /삭제|이관|불용/;
const EXCLUDE_FILE = '일일 재고조사표 새 양식(10월 5일).xlsx';

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export interface EstimatedUsageEntry {
  warehouse: string;
  canonKey: string;
  productName: string;
  packUnit: number;
  estDailyUsage: number; // 현재고(봉/낱개/롤) 기준 일추정소모량
  estDailyBox: number; // 박스 기준 일추정소모량 (estDailyUsage / packUnit)
  sampleCount: number; // 소진(감소) 관측 구간 수
  observedDays: number; // 재고 관측일 수
  noDecreaseObserved?: boolean; // 재고 감소(소진) 흔적 0회
  isFrozenStock?: boolean; // 재고 수량이 변동 없이 동일하게 멈춰있는 동결 재고
}

export interface EstimatedUsageResult {
  byWhAndKey: Record<string, EstimatedUsageEntry>; // `${warehouse}|${canonKey}`
  byKeyOnly: Record<string, EstimatedUsageEntry>; // `${canonKey}` (단일 창고 또는 냉장1↔냉장2 이동 폴백용)
  fileCount: number;
  dateRange: [string, string];
}

let cachedResult: EstimatedUsageResult | null = null;
let cachedAt = 0;

function collectStocktakeFiles(): Array<{ date: string; filePath: string }> {
  const base = path.join(process.cwd(), '26년도');
  const out: Array<{ date: string; filePath: string }> = [];
  for (const [mdir, mnum] of [
    ['10월', '10'],
    ['11월', '11'],
  ] as const) {
    const dir = path.join(base, mdir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.xlsx') || f.startsWith('~$')) continue;
      const fn = f.normalize('NFC');
      if (fn === EXCLUDE_FILE) continue;
      const m = /(\d{1,2})일/.exec(fn);
      if (!m) continue;
      const day = m[1].padStart(2, '0');
      out.push({ date: `2026-${mnum}-${day}`, filePath: path.join(dir, f) });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function daysBetween(d1: string, d2: string): number {
  const t1 = new Date(`${d1}T00:00:00Z`).getTime();
  const t2 = new Date(`${d2}T00:00:00Z`).getTime();
  return Math.round((t2 - t1) / 86400000);
}

function computeTrimmedRate(pts: Array<{ date: string; qty: number }>): { rate: number; count: number } {
  const rates: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const days = daysBetween(p1.date, p2.date);
    if (days <= 0 || days > 7) continue;
    if (p1.qty > p2.qty && p1.qty > 0) {
      rates.push((p1.qty - p2.qty) / days);
    }
  }
  if (rates.length === 0) return { rate: 0, count: 0 };
  rates.sort((a, b) => a - b);
  const sampleCount = rates.length;
  let trimmed = rates;
  if (rates.length >= 5) {
    trimmed = rates.slice(1, -1);
  } else if (rates.length >= 3) {
    const med = rates[Math.floor(rates.length / 2)];
    if (med > 0 && rates[rates.length - 1] > med * 2.5) {
      trimmed = rates.slice(0, -1);
    }
  }
  const avg = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
  const rounded = avg >= 10 ? Math.round(avg * 10) / 10 : Math.round(avg * 100) / 100;
  return { rate: rounded, count: sampleCount };
}

export function getEstimatedDailyUsage(forceRefresh = false): EstimatedUsageResult {
  if (!forceRefresh && cachedResult && Date.now() - cachedAt < 5 * 60 * 1000) {
    return cachedResult;
  }

  const files = collectStocktakeFiles();
  const series = new Map<string, Array<{ date: string; qty: number }>>();
  const meta = new Map<string, { warehouse: string; canonKey: string; productName: string; packUnit: number }>();

  for (const { date, filePath } of files) {
    let wb: XLSX.WorkBook;
    try {
      wb = readWorkbookFromFile(filePath);
    } catch {
      continue;
    }
    const sheetByNorm = new Map<string, string>();
    for (const sn of wb.SheetNames) sheetByNorm.set(sn.normalize('NFC'), sn);

    for (const wh of WAREHOUSE_SHEETS) {
      const realSn = sheetByNorm.get(wh);
      const ws = realSn ? wb.Sheets[realSn] : undefined;
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
      const dayItems = new Map<string, number>();

      for (let r = 4; r < rows.length; r++) {
        const row = (rows[r] || []) as unknown[];
        const rawName = String(row[3] ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
        if (!rawName || rawName === '제품명') continue;
        const note = String(row[6] ?? '').normalize('NFC');
        if (DELETE_MARK.test(note) || DELETE_MARK.test(rawName)) continue;

        const ck = canonNormName(rawName);
        if (!ck) continue;

        const box = num(row[7]);
        const piece = num(row[8]);
        const pack = num(row[10]) > 0 ? num(row[10]) : 1;
        const cur = row[9] != null && String(row[9]).trim() !== '' ? num(row[9]) : box * pack + piece;

        dayItems.set(ck, (dayItems.get(ck) || 0) + cur);
        const mk = `${wh}|${ck}`;
        const prevMeta = meta.get(mk);
        if (!prevMeta || (prevMeta.packUnit <= 1 && pack > 1)) {
          meta.set(mk, { warehouse: wh, canonKey: ck, productName: rawName, packUnit: pack });
        } else {
          // 최신 일자 품명 유지
          prevMeta.productName = rawName;
          if (pack > 0) prevMeta.packUnit = pack;
        }
      }

      // 부자재는 주 2회(일·화) 실사하므로 전체 수량이 0인 비실사일은 시계열에서 제외 (허위 급감 방지)
      if (wh === '부자재') {
        let totalSubQty = 0;
        dayItems.forEach((v) => {
          totalSubQty += v;
        });
        if (totalSubQty === 0) continue;
      }

      dayItems.forEach((qty, ck) => {
        const mk = `${wh}|${ck}`;
        if (!series.has(mk)) series.set(mk, []);
        series.get(mk)!.push({ date, qty });
      });
    }
  }

  const byWhAndKey: Record<string, EstimatedUsageEntry> = {};
  const byKeyCounts = new Map<string, string[]>();

  series.forEach((pts, mk) => {
    const m = meta.get(mk);
    if (!m) return;
    const { rate, count } = computeTrimmedRate(pts);
    const pack = m.packUnit > 0 ? m.packUnit : 1;
    const qtys = pts.map((p) => p.qty);
    const minQ = Math.min(...qtys);
    const maxQ = Math.max(...qtys);
    const noDecrease = pts.length >= 3 && count === 0;
    const isFrozen = pts.length >= 3 && minQ === maxQ && maxQ > 0;

    const entry: EstimatedUsageEntry = {
      warehouse: m.warehouse,
      canonKey: m.canonKey,
      productName: m.productName,
      packUnit: pack,
      estDailyUsage: rate,
      estDailyBox: rate > 0 ? Math.round((rate / pack) * 100) / 100 : 0,
      sampleCount: count,
      observedDays: pts.length,
      noDecreaseObserved: noDecrease,
      isFrozenStock: isFrozen,
    };
    byWhAndKey[mk] = entry;
    if (!byKeyCounts.has(m.canonKey)) byKeyCounts.set(m.canonKey, []);
    byKeyCounts.get(m.canonKey)!.push(mk);
  });

  // 단일 창고에만 존재하거나 냉장1↔냉장2 이동 품목을 위한 canonKey 폴백 맵
  // (단, 상온 핫도그번 vs 냉동 핫도그번처럼 서로 다른 두 창고에서 둘 다 활성 소진 중인 품목은 창고별 키만 사용)
  const byKeyOnly: Record<string, EstimatedUsageEntry> = {};
  byKeyCounts.forEach((mks, ck) => {
    if (mks.length === 1) {
      byKeyOnly[ck] = byWhAndKey[mks[0]];
      return;
    }
    const activeEntries = mks.map((k) => byWhAndKey[k]).filter((e) => e && e.estDailyUsage > 0);
    if (activeEntries.length === 1) {
      byKeyOnly[ck] = activeEntries[0];
    } else if (activeEntries.length === 0 && mks.length > 0) {
      byKeyOnly[ck] = byWhAndKey[mks[0]];
    }
  });

  cachedResult = {
    byWhAndKey,
    byKeyOnly,
    fileCount: files.length,
    dateRange: files.length > 0 ? [files[0].date, files[files.length - 1].date] : ['', ''],
  };
  cachedAt = Date.now();
  return cachedResult;
}

/**
 * 로컬 엑셀 파일(26년도) 우선 계산 + 서버리스(Vercel) 환경이거나 신규 스냅샷이 DB에 추가된 경우
 * InventorySnapshot 테이블로부터 동일 알고리즘으로 추정 일사용량을 산출
 */
export async function getEstimatedDailyUsageWithDb(prisma: any, forceRefresh = false): Promise<EstimatedUsageResult> {
  if (!forceRefresh && cachedResult && cachedResult.fileCount > 0 && Date.now() - cachedAt < 5 * 60 * 1000) {
    return cachedResult;
  }
  const localRes = getEstimatedDailyUsage(forceRefresh);
  try {
    const dbRows: Array<{
      snapshotDate: string;
      warehouse: string;
      productName: string;
      currentQty: number;
      packUnit: number;
    }> = await prisma.inventorySnapshot.findMany({
      select: {
        snapshotDate: true,
        warehouse: true,
        productName: true,
        currentQty: true,
        packUnit: true,
      },
      orderBy: [{ snapshotDate: 'asc' }],
    });
    if (!dbRows || dbRows.length === 0) {
      return localRes;
    }
    const dates = Array.from(new Set(dbRows.map((r) => r.snapshotDate))).sort();
    // 로컬 파일에 이미 모든 날짜가 있으면 localRes 그대로 반환
    if (localRes.fileCount >= dates.length && localRes.fileCount > 0) {
      return localRes;
    }

    const series = new Map<string, Array<{ date: string; qty: number }>>();
    const meta = new Map<string, { warehouse: string; canonKey: string; productName: string; packUnit: number }>();

    // 날짜별·창고별 그룹핑
    const byDateWh = new Map<string, Map<string, number>>();
    for (const r of dbRows) {
      const wh = r.warehouse;
      if (!WAREHOUSE_SHEETS.includes(wh as any)) continue;
      const ck = canonNormName(r.productName);
      if (!ck) continue;
      const dKey = `${r.snapshotDate}|${wh}`;
      if (!byDateWh.has(dKey)) byDateWh.set(dKey, new Map());
      const m = byDateWh.get(dKey)!;
      m.set(ck, (m.get(ck) || 0) + (Number(r.currentQty) || 0));

      const mk = `${wh}|${ck}`;
      const pack = Number(r.packUnit) > 0 ? Number(r.packUnit) : 1;
      const prevMeta = meta.get(mk);
      if (!prevMeta || (prevMeta.packUnit <= 1 && pack > 1)) {
        meta.set(mk, { warehouse: wh, canonKey: ck, productName: r.productName, packUnit: pack });
      } else {
        prevMeta.productName = r.productName;
        if (pack > 0) prevMeta.packUnit = pack;
      }
    }

    let prevSubSignature = '';
    for (const date of dates) {
      for (const wh of WAREHOUSE_SHEETS) {
        const dayItems = byDateWh.get(`${date}|${wh}`);
        if (!dayItems || dayItems.size === 0) continue;
        if (wh === '부자재') {
          let totalSub = 0;
          const sigParts: string[] = [];
          dayItems.forEach((v, k) => {
            totalSub += v;
            sigParts.push(`${k}:${v}`);
          });
          if (totalSub === 0) continue;
          const sig = sigParts.sort().join('|');
          // 비실사일 이월분(직전 실사일과 모든 부자재 수량이 100% 동일)은 시계열에서 제외
          if (sig === prevSubSignature) continue;
          prevSubSignature = sig;
        }
        dayItems.forEach((qty, ck) => {
          const mk = `${wh}|${ck}`;
          if (!series.has(mk)) series.set(mk, []);
          series.get(mk)!.push({ date, qty });
        });
      }
    }

    const byWhAndKey: Record<string, EstimatedUsageEntry> = {};
    const byKeyCounts = new Map<string, string[]>();
    series.forEach((pts, mk) => {
      const m = meta.get(mk);
      if (!m) return;
      const { rate, count } = computeTrimmedRate(pts);
      const pack = m.packUnit > 0 ? m.packUnit : 1;
      const qtys = pts.map((p) => p.qty);
      const minQ = Math.min(...qtys);
      const maxQ = Math.max(...qtys);
      const noDecrease = pts.length >= 3 && count === 0;
      const isFrozen = pts.length >= 3 && minQ === maxQ && maxQ > 0;

      const entry: EstimatedUsageEntry = {
        warehouse: m.warehouse,
        canonKey: m.canonKey,
        productName: m.productName,
        packUnit: pack,
        estDailyUsage: rate,
        estDailyBox: rate > 0 ? Math.round((rate / pack) * 100) / 100 : 0,
        sampleCount: count,
        observedDays: pts.length,
        noDecreaseObserved: noDecrease,
        isFrozenStock: isFrozen,
      };
      byWhAndKey[mk] = entry;
      if (!byKeyCounts.has(m.canonKey)) byKeyCounts.set(m.canonKey, []);
      byKeyCounts.get(m.canonKey)!.push(mk);
    });

    const byKeyOnly: Record<string, EstimatedUsageEntry> = {};
    byKeyCounts.forEach((mks, ck) => {
      if (mks.length === 1) {
        byKeyOnly[ck] = byWhAndKey[mks[0]];
        return;
      }
      const activeEntries = mks.map((k) => byWhAndKey[k]).filter((e) => e && e.estDailyUsage > 0);
      if (activeEntries.length === 1) {
        byKeyOnly[ck] = activeEntries[0];
      } else if (activeEntries.length === 0 && mks.length > 0) {
        byKeyOnly[ck] = byWhAndKey[mks[0]];
      }
    });

    cachedResult = {
      byWhAndKey,
      byKeyOnly,
      fileCount: dates.length,
      dateRange: dates.length > 0 ? [dates[0], dates[dates.length - 1]] : ['', ''],
    };
    cachedAt = Date.now();
    return cachedResult;
  } catch {
    return localRes;
  }
}

/**
 * 최근 7일(약 1주일 이동평균) 기준 실사용 평균 산출
 * targetDate 기준 이전 8일 이내의 스냅샷 데이터만 추출하여 일평균 소진량을 계산
 */
export async function getRollingUsage7DaysWithDb(
  prisma: any,
  targetDate?: string,
  _forceRefresh = false,
): Promise<EstimatedUsageResult> {
  try {
    const allDates = await prisma.inventorySnapshot.groupBy({
      by: ['snapshotDate'],
      orderBy: { snapshotDate: 'desc' },
    });
    const dateList: string[] = allDates.map((d: any) => d.snapshotDate);
    if (dateList.length === 0) {
      return { byWhAndKey: {}, byKeyOnly: {}, fileCount: 0, dateRange: ['', ''] };
    }
    const curTarget = targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : dateList[0];
    const tDateObj = new Date(curTarget + 'T00:00:00Z');

    const windowDates = dateList
      .filter((d) => {
        const diff = (tDateObj.getTime() - new Date(d + 'T00:00:00Z').getTime()) / 86400000;
        return diff >= 0 && diff <= 8; // 최근 7~8일 구간
      })
      .sort();

    if (windowDates.length < 2) {
      return { byWhAndKey: {}, byKeyOnly: {}, fileCount: windowDates.length, dateRange: [curTarget, curTarget] };
    }

    const dbRows: Array<{
      snapshotDate: string;
      warehouse: string;
      productName: string;
      currentQty: number;
      packUnit: number;
    }> = await prisma.inventorySnapshot.findMany({
      where: { snapshotDate: { in: windowDates } },
      select: {
        snapshotDate: true,
        warehouse: true,
        productName: true,
        currentQty: true,
        packUnit: true,
      },
      orderBy: [{ snapshotDate: 'asc' }],
    });

    const series = new Map<string, Array<{ date: string; qty: number }>>();
    const meta = new Map<string, { warehouse: string; canonKey: string; productName: string; packUnit: number }>();

    for (const r of dbRows) {
      const wh = r.warehouse || '상온';
      const ck = canonNormName(r.productName);
      if (!ck) continue;
      const mk = `${wh}|${ck}`;
      const pack = Number(r.packUnit) > 0 ? Number(r.packUnit) : 1;
      if (!meta.has(mk) || (meta.get(mk)!.packUnit <= 1 && pack > 1)) {
        meta.set(mk, { warehouse: wh, canonKey: ck, productName: r.productName, packUnit: pack });
      }
      if (!series.has(mk)) series.set(mk, []);
      series.get(mk)!.push({ date: r.snapshotDate, qty: Number(r.currentQty) || 0 });
    }

    const byWhAndKey: Record<string, EstimatedUsageEntry> = {};
    const byKeyCounts = new Map<string, string[]>();

    series.forEach((pts, mk) => {
      const m = meta.get(mk);
      if (!m) return;
      const drops: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const d = daysBetween(p1.date, p2.date);
        if (p1.qty > p2.qty && p1.qty > 0) {
          drops.push((p1.qty - p2.qty) / d);
        }
      }
      if (drops.length === 0) return;
      const avg = drops.reduce((s, v) => s + v, 0) / drops.length;
      const rounded = avg >= 10 ? Math.round(avg * 10) / 10 : Math.round(avg * 100) / 100;
      const pack = m.packUnit > 0 ? m.packUnit : 1;
      const entry: EstimatedUsageEntry = {
        warehouse: m.warehouse,
        canonKey: m.canonKey,
        productName: m.productName,
        packUnit: pack,
        estDailyUsage: rounded,
        estDailyBox: rounded > 0 ? Math.round((rounded / pack) * 100) / 100 : 0,
        sampleCount: drops.length,
        observedDays: pts.length,
      };
      byWhAndKey[mk] = entry;
      if (!byKeyCounts.has(m.canonKey)) byKeyCounts.set(m.canonKey, []);
      byKeyCounts.get(m.canonKey)!.push(mk);
    });

    const byKeyOnly: Record<string, EstimatedUsageEntry> = {};
    byKeyCounts.forEach((mks, ck) => {
      if (mks.length === 1) {
        byKeyOnly[ck] = byWhAndKey[mks[0]];
      } else {
        const active = mks.map((k) => byWhAndKey[k]).filter((e) => e && e.estDailyUsage > 0);
        if (active.length > 0) byKeyOnly[ck] = active[0];
      }
    });

    return {
      byWhAndKey,
      byKeyOnly,
      fileCount: windowDates.length,
      dateRange: [windowDates[0], windowDates[windowDates.length - 1]],
    };
  } catch {
    return { byWhAndKey: {}, byKeyOnly: {}, fileCount: 0, dateRange: ['', ''] };
  }
}
