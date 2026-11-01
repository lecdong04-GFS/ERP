import { Redis } from '@upstash/redis';

const DASHBOARD_KEY = 'gfs:dashboard:v1';
const globalForRedis = globalThis as unknown as { gfsUpstash?: Redis };

export function getSharedRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  if (!globalForRedis.gfsUpstash) {
    globalForRedis.gfsUpstash = new Redis({ url, token });
  }
  return globalForRedis.gfsUpstash;
}

export interface SharedDashboardEntry {
  data: unknown;
  updatedAt: string;
  asOf: string;
}

export async function readSharedDashboard(): Promise<SharedDashboardEntry | null> {
  const redis = getSharedRedis();
  if (!redis) return null;
  try {
    return await redis.get<SharedDashboardEntry>(DASHBOARD_KEY);
  } catch (error: any) {
    console.error('[cache] read failed:', error?.message || error);
    return null;
  }
}

export async function writeSharedDashboard(entry: SharedDashboardEntry): Promise<void> {
  const redis = getSharedRedis();
  if (!redis) return;
  try {
    await redis.set(DASHBOARD_KEY, entry, { ex: 120 });
  } catch (error: any) {
    console.error('[cache] write failed:', error?.message || error);
  }
}

export async function invalidateSharedDashboard(): Promise<void> {
  const redis = getSharedRedis();
  if (!redis) return;
  try {
    await redis.del(DASHBOARD_KEY);
  } catch (error: any) {
    console.error('[cache] invalidate failed:', error?.message || error);
  }
}
