// 품명 정규화 유틸 — 클라이언트/서버 공용 (Node 전용 모듈 없음)
export function normName(s: unknown): string {
  return String(s ?? '')
    .replace(/\[.+?\]/g, '')
    .replace(/\(.+?\)/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase();
}
