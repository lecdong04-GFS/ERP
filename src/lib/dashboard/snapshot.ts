import { DashboardStats } from '@/components/dashboard/dashboardData';
import { kstToday } from '@/lib/kst';
import { pgQuery } from '@/lib/db/pg';
import { nextCutoff } from './cutoff';

const KEY = 'dashboard';
const MEM_TTL_MS = 5_000;
const STALE_MS = 60_000;

let mem: { at: number; data: DashboardStats } | null = null;
let inflight: Promise<void> | null = null;

interface SnapshotRow {
  payload: DashboardStats;
  as_of: string;
  updated_at: Date;
}

async function readSnapshot(): Promise<SnapshotRow | null> {
  const res = await pgQuery<SnapshotRow>(
    `select payload, as_of, updated_at from "DashboardSnapshot" where key = $1`,
    [KEY]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  if (!row.payload || typeof row.payload !== 'object' || !(row.payload as any).kpiSummary) {
    return null;
  }
  return row;
}

async function writeSnapshot(data: DashboardStats): Promise<void> {
  await pgQuery(
    `insert into "DashboardSnapshot" (key, payload, as_of, updated_at, refresh_started_at)
     values ($1, $2::jsonb, $3, now(), null)
     on conflict (key) do update
       set payload = excluded.payload,
           as_of = excluded.as_of,
           updated_at = now(),
           refresh_started_at = null`,
    [KEY, JSON.stringify(data), kstToday()]
  );
}

/** 여러 인스턴스가 동시에 갱신하지 않도록 2분 락 */
async function acquireRefreshLock(): Promise<boolean> {
  await pgQuery(
    `insert into "DashboardSnapshot" (key, payload, as_of, updated_at)
     values ($1, '{}'::jsonb, '1970-01-01', now())
     on conflict (key) do nothing`,
    [KEY]
  );
  const res = await pgQuery<{ key: string }>(
    `update "DashboardSnapshot"
        set refresh_started_at = now()
      where key = $1
        and (refresh_started_at is null or refresh_started_at < now() - interval '2 minutes')
      returning key`,
    [KEY]
  );
  return res.rows.length > 0;
}

export async function refreshSnapshot(): Promise<DashboardStats | null> {
  const locked = await acquireRefreshLock().catch(() => false);
  if (!locked) return null;
  try {
    const { computeDashboardStats } = await import('./compute');
    const data = await computeDashboardStats();
    await writeSnapshot(data);
    mem = { at: Date.now(), data };
    return data;
  } finally {
    await pgQuery(
      `update "DashboardSnapshot" set refresh_started_at = null where key = $1`,
      [KEY]
    ).catch(() => {});
  }
}

/** 응답 후 백그라운드 갱신 (중복 방지) */
export function scheduleRefresh(): void {
  if (inflight) return;
  inflight = refreshSnapshot()
    .then(() => undefined)
    .catch((error) => {
      console.error('[dashboard] background refresh failed:', error?.message || error);
    })
    .finally(() => {
      inflight = null;
    });
}

export interface DashboardResult {
  data: DashboardStats;
  source: 'memory' | 'snapshot' | 'live';
  stale: boolean;
}

export async function getDashboardStats(options: { force?: boolean } = {}): Promise<DashboardResult> {
  const force = options.force === true;
  const today = kstToday();

  if (!force && mem && Date.now() - mem.at < MEM_TTL_MS) {
    return { data: mem.data, source: 'memory', stale: false };
  }

  if (!force) {
    try {
      const snapshot = await readSnapshot();
      if (snapshot) {
        const data: DashboardStats = {
          ...snapshot.payload,
          fetchedAt: new Date(snapshot.updated_at).toISOString(),
          pipeline: { ...snapshot.payload.pipeline, cutoffAt: nextCutoff() },
        };
        mem = { at: Date.now(), data };
        const stale =
          snapshot.as_of !== today ||
          Date.now() - new Date(snapshot.updated_at).getTime() > STALE_MS;
        return { data, source: 'snapshot', stale };
      }
    } catch (error: any) {
      console.error('[dashboard] snapshot read failed:', error?.message || error);
    }
  }

  // 스냅샷이 없거나 수동 새로고침 → 즉시 계산
  const { computeDashboardStats } = await import('./compute');
  const data = await computeDashboardStats();
  await writeSnapshot(data).catch((error) => {
    console.error('[dashboard] snapshot write failed:', error?.message || error);
  });
  mem = { at: Date.now(), data };
  return { data, source: 'live', stale: false };
}

/** 업로드 성공 후 다음 조회에서 갱신되도록 표시 */
export async function touchDashboardSnapshot(): Promise<void> {
  await pgQuery(
    `update "DashboardSnapshot" set as_of = '1970-01-01' where key = $1`,
    [KEY]
  ).catch(() => {});
}
