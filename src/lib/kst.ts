/** KST 기준 오늘 (YYYY-MM-DD) */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 현재 시각 문자열 (HHmmss) */
export function kstTime(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

/** 충돌 방지 문서번호: PREFIX-YYYYMMDD-HHmmss-XX */
export function makeDocNo(prefix: string, date?: string): string {
  const base = (date || kstToday()).replace(/-/g, '');
  const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${prefix}-${base}-${kstTime()}${rand}`;
}
