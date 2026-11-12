/**
 * HTTP 응답을 안전하게 JSON으로 파싱한다.
 * Vercel 502/504 HTML 에러 페이지 등 비-JSON 응답에서도 크래시 없이 오류 메시지를 추출한다.
 */
export interface SafeJsonResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string;
}

export async function readJsonSafe<T = any>(
  res: Response,
  fallbackError?: string
): Promise<SafeJsonResult<T>> {
  const raw = await res.text();
  let parsed: any = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const ok = res.ok && (parsed ? parsed.success !== false : false);
  const errorMessage =
    parsed?.error ||
    parsed?.message ||
    (!res.ok
      ? `${fallbackError || '요청 처리 실패'} (HTTP ${res.status})`
      : fallbackError || '서버 응답 형식이 올바르지 않습니다.');

  return {
    ok,
    status: res.status,
    data: parsed,
    errorMessage,
  };
}
