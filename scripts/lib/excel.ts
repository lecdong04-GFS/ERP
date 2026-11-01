import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseOrderStatusRows } from '../../src/lib/gfs/salesIntake';

export interface InventoryRow {
  warehouse: string;
  name: string;
  partnerName: string;
  legacyCode: string;
  category: '원재료' | '부자재';
  boxQty: number;
  usageBox: number;
  qty: number;
  unitPrice: number;
  amount: number;
  expiryDate: string;
  note: string;
  sheetRow: number;
}

export interface OrderMaterialRow {
  name: string;
  partnerName: string;
  stockDays: number | null;
  price: number | null;
  sheetRow: number;
}

export interface SalesImportRow {
  name: string;
  category: string;
  qty1: number;
  qty2: number;
  total: number;
}

export interface ParseReport {
  inventory: InventoryRow[];
  orderMaterials: OrderMaterialRow[];
  sales: SalesImportRow[];
  salesSourceDate: string;
  counts: {
    inventoryRaw: number;
    inventorySkipped: number;
    inventoryDuplicate: number;
    orderRaw: number;
    orderDuplicate: number;
    salesRaw: number;
  };
}

export const WAREHOUSES = ['냉장1', '냉장2', '냉동', '상온', '부자재'] as const;
const DELETE_MARK = /삭제|이관|불용/;

export function normName(value: unknown): string {
  return String(value ?? '')
    .replace(/[\s()[\]{}*_\-.,/]/g, '')
    .toLowerCase();
}

function text(value: unknown): string {
  return String(value ?? '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null || value === '') return 0;
  const parsed = parseFloat(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = num(value);
  return Number.isFinite(n) ? n : null;
}

function toISODate(value: unknown): string {
  if (typeof value === 'number' && value > 20000 && value < 60000) {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return '';
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = text(value);
  const iso = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  return '';
}

export function findExcelFiles(root = process.cwd()) {
  const files = fs.readdirSync(root);
  const pick = (keyword: string) => {
    const hit = files.find((f) => f.toLowerCase().endsWith('.xlsx') && f.includes(keyword));
    if (!hit) throw new Error(`엑셀 파일을 찾지 못했습니다: ${keyword}`);
    return path.join(root, hit);
  };
  return {
    orderFile: pick('발주서양식통합'),
    auditFile: pick('재고조사표'),
    salesFile: pick('발주현황'),
  };
}

function readSheetRows(file: string, sheet: string): unknown[][] {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`시트가 없습니다: ${file} > ${sheet}`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
}

/** 일일 재고조사표 → 5개 창고 현재고 */
export function parseInventory(file: string): { rows: InventoryRow[]; raw: number; skipped: number } {
  const out: InventoryRow[] = [];
  let raw = 0;
  let skipped = 0;

  for (const warehouse of WAREHOUSES) {
    const rows = readSheetRows(file, warehouse);
    for (let r = 4; r < rows.length; r++) {
      const row = rows[r] || [];
      const name = text(row[3]);
      if (!name) continue;
      raw += 1;
      const note = text(row[6]);
      if (DELETE_MARK.test(note)) {
        skipped += 1;
        continue;
      }
      const qty = num(row[9]);
      const unitPrice = num(row[12]);
      const amount = num(row[13]) || qty * unitPrice;
      out.push({
        warehouse,
        name,
        partnerName: text(row[1]),
        legacyCode: text(row[2]),
        category: warehouse === '부자재' ? '부자재' : '원재료',
        boxQty: num(row[10]),
        usageBox: num(row[5]),
        qty,
        unitPrice,
        amount,
        expiryDate: warehouse === '부자재' ? '' : toISODate(row[6]),
        note: warehouse === '부자재' ? note : '',
        sheetRow: r + 1,
      });
    }
  }
  return { rows: out, raw, skipped };
}

/** 같은 창고 내 동일 품명 중복 정리 (수량 많은 행 우선) */
export function dedupeInventory(rows: InventoryRow[]): { rows: InventoryRow[]; removed: number } {
  const map = new Map<string, InventoryRow>();
  let removed = 0;
  for (const row of rows) {
    const key = `${row.warehouse}|${normName(row.name)}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    removed += 1;
    if (row.amount > prev.amount || (row.amount === prev.amount && row.qty > prev.qty)) {
      map.set(key, row);
    }
  }
  return { rows: [...map.values()], removed };
}

/** 발주서양식통합 > 발주시트 → 자재/거래처/재고유지일/단가 */
export function parseOrderSheet(file: string): { rows: OrderMaterialRow[]; raw: number } {
  const rows = readSheetRows(file, '발주시트');
  const map = new Map<string, OrderMaterialRow>();
  let raw = 0;
  let supplier = '';

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const first = text(row[0]);
    const supplierHit = /^(.+?)\s*\(D[-+]/.exec(first);
    if (supplierHit) supplier = supplierHit[1].trim();

    const name = text(row[2]);
    if (!name) continue;
    const d = row[3];
    if (d == null || d === '' || isNaN(Number(d)) || Number(d) === 0) continue;

    raw += 1;
    const key = normName(name);
    const next: OrderMaterialRow = {
      name,
      partnerName: supplier,
      stockDays: numOrNull(row[13]),
      price: numOrNull(row[16]),
      sheetRow: r + 1,
    };
    const prev = map.get(key);
    if (!prev) {
      map.set(key, next);
      continue;
    }
    // 재고유지일/단가가 있는 행을 우선 유지
    map.set(key, {
      ...prev,
      partnerName: prev.partnerName || next.partnerName,
      stockDays: prev.stockDays ?? next.stockDays,
      price: prev.price ?? next.price,
    });
  }
  return { rows: [...map.values()], raw };
}

/** 발주현황(카톡보내기) → 완성품 수주 */
export function parseSales(file: string): { rows: SalesImportRow[]; sourceDate: string; raw: number } {
  const wb = XLSX.readFile(file);
  const names = wb.SheetNames.filter((n) => n.includes('발주현황'));
  let rows: SalesImportRow[] = [];
  let sourceDate = '';

  for (const sheet of names) {
    const ws = wb.Sheets[sheet];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    const parsed = parseOrderStatusRows(matrix as any[][]);
    if (!parsed || parsed.length === 0) continue;
    // 헤더의 엑셀 시리얼 날짜에서 기준일 추출
    for (let r = 0; r < Math.min(6, matrix.length) && !sourceDate; r++) {
      for (const cell of matrix[r] || []) {
        const date = typeof cell === 'number' ? toISODate(cell) : '';
        if (date) {
          sourceDate = date;
          break;
        }
      }
    }
    rows = parsed.map((p) => ({
      name: p.menuName,
      category: p.category,
      qty1: p.qty1,
      qty2: p.qty2,
      total: p.total,
    }));
    break;
  }
  return { rows, sourceDate, raw: rows.length };
}

export function parseAll(): ParseReport {
  const files = findExcelFiles();
  const inv = parseInventory(files.auditFile);
  const dedup = dedupeInventory(inv.rows);
  const order = parseOrderSheet(files.orderFile);
  const sales = parseSales(files.salesFile);
  return {
    inventory: dedup.rows,
    orderMaterials: order.rows,
    sales: sales.rows,
    salesSourceDate: sales.sourceDate,
    counts: {
      inventoryRaw: inv.raw,
      inventorySkipped: inv.skipped,
      inventoryDuplicate: dedup.removed,
      orderRaw: order.raw,
      orderDuplicate: order.raw - order.rows.length,
      salesRaw: sales.raw,
    },
  };
}

export function summarizeInventory(rows: InventoryRow[]) {
  const byWarehouse: Record<string, { items: number; qty: number; amount: number; priced: number }> = {};
  let withQty = 0;
  let withExpiry = 0;
  let totalAmount = 0;
  for (const w of WAREHOUSES) byWarehouse[w] = { items: 0, qty: 0, amount: 0, priced: 0 };
  for (const row of rows) {
    const bucket = byWarehouse[row.warehouse];
    bucket.items += 1;
    bucket.qty += row.qty;
    bucket.amount += row.amount;
    if (row.unitPrice > 0) bucket.priced += 1;
    if (row.qty > 0) withQty += 1;
    if (row.expiryDate) withExpiry += 1;
    totalAmount += row.amount;
  }
  return { byWarehouse, withQty, withExpiry, totalAmount };
}
