'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardStats, EMPTY_STATS } from './dashboardData';

const STORAGE_KEY = 'gfs.dashboard.v1';
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  data: DashboardStats;
  savedAt: number;
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.data?.kpiSummary || !parsed?.data?.pipeline) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_CACHE_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: DashboardStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    /* storage full/blocked */
  }
}

export function useDashboardStats() {
  // 서버/클라이언트 첫 렌더를 일치시키기 위해 초기값은 항상 빈 상태.
  // localStorage 캐시는 마운트 후(useEffect, 클라이언트 전용)에만 읽는다.
  // 렌더 중에 캐시를 읽으면 서버(스켈레톤)와 클라이언트(캐시 데이터)가 달라져 hydration mismatch가 난다.
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async (force: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (force) setRefreshing(true);
    try {
      const res = await fetch(`/api/dashboard/stats${force ? '?fresh=1' : ''}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data);
        setError(null);
        setCachedAt(json.data.fetchedAt || null);
        writeCache(json.data);
      } else {
        setError(json.error || '대시보드 데이터를 불러오지 못했습니다.');
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
      setError('대시보드 데이터를 불러오지 못했습니다.');
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // 마운트 후 캐시 적용 (깜빡임 최소화) + 서버에서 최신 조회
    const cached = readCache();
    if (cached?.data) {
      setStats(cached.data);
      setCachedAt(cached.data.fetchedAt ?? null);
      setLoading(false);
    }
    void load(false);
    const timer = setInterval(() => void load(false), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return {
    stats,
    loading,
    refreshing,
    error,
    cachedAt,
    refresh: () => load(true),
  };
}
