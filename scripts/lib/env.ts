import fs from 'node:fs';
import path from 'node:path';

/** .env를 수동 로드 (tsx 실행 시 자동 로드되지 않으므로) */
export function loadEnv(file = '.env'): void {
  if (process.env.DATABASE_URL) return;
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** KST 기준 오늘 (YYYY-MM-DD) */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD + 일수 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ymd(date: string): string {
  return date.replace(/-/g, '');
}
