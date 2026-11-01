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
  // 첫 렌더 전에 localStorage 캐시를 읽어 스켈레톤 깜빡임 제거
  const boot = useRef<CacheEntry | null | undefined>(undefined);
  if (boot.current === undefined) {
    boot.current = typeof window !== 'undefined' ? readCache() : null;
  }
  const initial = boot.current;

  const [stats, setStats] = useState<DashboardStats>(initial?.data ?? EMPTY_STATS);
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(initial?.data.fetchedAt ?? null);
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
