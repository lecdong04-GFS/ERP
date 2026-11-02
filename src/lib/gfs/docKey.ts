// intake 문서키(DOC 마커) 공용 유틸 — 같은 파일 재업로드 감지용
// remark에는 `DOC:<hash>:<건수>` 형태로 저장되고, 화면 표시 시에는 제거한다.

/** 문서키 목록 → 해시 (`<hex>:<건수>`), 없으면 null */
export function docHashOf(keys: unknown): string | null {
  if (!Array.isArray(keys)) return null;
  const uniq = [...new Set(keys.map((k) => String(k ?? '').trim()).filter(Boolean))].sort();
  if (uniq.length === 0) return null;
  let h = 5381;
  const s = uniq.join('|');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(16)}:${uniq.length}`;
}

const DOC_RE = /(?:^|\s)DOC:[0-9a-f]+:\d+(?=\s|$)/g;

/** 화면 표시용 remark — DOC 마커 제거 (마커만 있으면 빈 문자열) */
export function displayRemark(remark: unknown): string {
  const s = String(remark ?? '');
  if (!s.includes('DOC:')) return s;
  return s.replace(DOC_RE, '').replace(/\s{2,}/g, ' ').trim();
}
