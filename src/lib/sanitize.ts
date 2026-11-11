/**
 * HTML 특수문자 이스케이프 (document.write 등 인쇄 템플릿 XSS 방지)
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/** 허용된 이미지 Data URL 또는 내부 정적 경로 검증 */
export function isSafeImageSrc(src: string): boolean {
  const trimmed = String(src || '').trim();
  if (!trimmed) return false;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed.length <= 2_000_000;
  }
  return trimmed.startsWith('/') && !trimmed.startsWith('//');
}
