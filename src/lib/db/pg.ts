import { Pool, QueryResult, QueryResultRow } from 'pg';

/** Prisma 전용 파라미터를 제거한 pg 연결 문자열 */
export function cleanPgUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ['connection_limit', 'pool_timeout', 'pgbouncer']) {
      u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

const globalForPg = globalThis as unknown as { gfsPgPool?: Pool };

export function getPgPool(): Pool {
  if (!globalForPg.gfsPgPool) {
    const url = cleanPgUrl(process.env.DATABASE_URL || '');
    if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다.');
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX || 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
    });
    pool.on('error', (error) => {
      console.error('[pg] pool error:', error.message);
    });
    globalForPg.gfsPgPool = pool;
  }
  return globalForPg.gfsPgPool;
}

/** 연결성 오류(간헐적 TLS/네트워크 실패) 시 1회 재시도 */
const RETRYABLE_CODES = new Set([
  'EPROTO',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
]);

function isRetryable(error: any): boolean {
  if (!error) return false;
  if (RETRYABLE_CODES.has(error.code)) return true;
  const msg = String(error.message || '');
  return /timeout|terminat|closed|reset|handshake|TLS/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  try {
    return await getPgPool().query<T>(text, params as any[]);
  } catch (error: any) {
    if (!isRetryable(error)) throw error;
    console.error('[pg] transient connection error, retrying once:', error.code || error.message);
    await sleep(800);
    return getPgPool().query<T>(text, params as any[]);
  }
}
