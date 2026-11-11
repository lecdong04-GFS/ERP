import { getSharedRedis } from '@/lib/cache/shared';

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as unknown as {
  gfsLoginRateLimit?: Map<string, MemoryBucket>;
};

const WINDOW_SEC = 15 * 60; // 15분
const MAX_ATTEMPTS = 10;

function getMemoryMap(): Map<string, MemoryBucket> {
  if (!globalForRateLimit.gfsLoginRateLimit) {
    globalForRateLimit.gfsLoginRateLimit = new Map();
  }
  return globalForRateLimit.gfsLoginRateLimit;
}

/**
 * 로그인 브루트포스 방어용 레이트 리미트 확인 (Redis 우선, 미설정 시 인메모리 폴백)
 */
export async function checkLoginRateLimit(key: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return { allowed: true, retryAfterSec: 0 };

  const redis = getSharedRedis();
  if (redis) {
    try {
      const redisKey = `gfs:login:rl:${normalized}`;
      const count = await redis.get<number>(redisKey);
      if (count !== null && count >= MAX_ATTEMPTS) {
        const ttl = await redis.ttl(redisKey);
        return { allowed: false, retryAfterSec: ttl > 0 ? ttl : WINDOW_SEC };
      }
      return { allowed: true, retryAfterSec: 0 };
    } catch {
      // Redis 장애 시 인메모리 폴백
    }
  }

  const map = getMemoryMap();
  const now = Date.now();
  const bucket = map.get(normalized);
  if (!bucket || bucket.resetAt <= now) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** 로그인 실패 카운트 증가 */
export async function recordLoginFailure(key: string): Promise<void> {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return;

  const redis = getSharedRedis();
  if (redis) {
    try {
      const redisKey = `gfs:login:rl:${normalized}`;
      const next = await redis.incr(redisKey);
      if (next === 1) {
        await redis.expire(redisKey, WINDOW_SEC);
      }
      return;
    } catch {
      // 인메모리 폴백
    }
  }

  const map = getMemoryMap();
  const now = Date.now();
  const bucket = map.get(normalized);
  if (!bucket || bucket.resetAt <= now) {
    map.set(normalized, { count: 1, resetAt: now + WINDOW_SEC * 1000 });
  } else {
    bucket.count += 1;
  }
}

/** 로그인 성공 시 실패 카운트 초기화 */
export async function clearLoginRateLimit(key: string): Promise<void> {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return;

  const redis = getSharedRedis();
  if (redis) {
    try {
      await redis.del(`gfs:login:rl:${normalized}`);
    } catch {
      // ignore
    }
  }
  getMemoryMap().delete(normalized);
}
