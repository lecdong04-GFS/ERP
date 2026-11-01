const CUTOFF_TIMES = ['11:00', '13:00'];

/** 다음 마감 시각(HH:mm) */
export function nextCutoff(): string | null {
  const now = new Date();
  const kstMinutes = ((now.getUTCHours() + 9) % 24) * 60 + now.getUTCMinutes();
  for (const t of CUTOFF_TIMES) {
    const [h, m] = t.split(':').map(Number);
    if (h * 60 + m > kstMinutes) return t;
  }
  return CUTOFF_TIMES[0];
}
