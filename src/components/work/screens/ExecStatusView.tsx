'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, RefreshCw } from 'lucide-react';

interface ExecItem {
  id: number;
  execDate: string;
  execType: string;
  title: string;
  content: string;
  hours: number;
  status: string;
  department: string;
  authorId: number | null;
  authorName: string;
  authorLoginId: string;
  createdAt: string;
}

const TYPES = ['전체', '정기업무', '임시업무', '개선업무', '고장처리', '교육'] as const;
const STATUSES = ['전체', '완료', '진행중', '보류'] as const;

const TYPE_META: Record<string, { dot: string; chip: string }> = {
  '정기업무': { dot: '#2b7de9', chip: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]' },
  '임시업무': { dot: '#f59e0b', chip: 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]' },
  '개선업무': { dot: '#10b981', chip: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]' },
  '고장처리': { dot: '#e11d48', chip: 'bg-[#fff1f2] text-[#be123c] border-[#fecdd3]' },
  '교육': { dot: '#8b5cf6', chip: 'bg-[#f5f3ff] text-[#7c3aed] border-[#ddd6fe]' },
};

const STATUS_META: Record<string, { chip: string; dot: string }> = {
  '완료': { chip: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]', dot: 'bg-[#059669]' },
  '진행중': { chip: 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]', dot: 'bg-[#d97706]' },
  '보류': { chip: 'bg-[#f8fafc] text-[var(--ink-600)] border-[var(--line)]', dot: 'bg-[#94a3b8]' },
};

function fmtDay(dateStr: string): string {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const yesterday = new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return '오늘';
  if (dateStr === yesterday) return '어제';
  return `${dateStr} (${days[d.getDay()]})`;
}

export const ExecStatusView: React.FC = () => {
  const [items, setItems] = useState<ExecItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [dateFilter, setDateFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('전체');
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 30;

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (dateFilter) params.set('date', dateFilter);
      if (typeFilter !== '전체') params.set('type', typeFilter);
      if (statusFilter !== '전체') params.set('status', statusFilter);
      const res = await fetch(`/api/work-exec?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setItems(json.data.items || []);
        setTotal(json.data.total || 0);
      } else setError(json.error || '업무실행 데이터를 불러오지 못했습니다.');
    } catch {
      setError('업무실행 데이터를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [page, dateFilter, typeFilter, statusFilter]);

  useEffect(() => { void loadList(); }, [loadList]);

  const grouped = useMemo(() => {
    const map = new Map<string, ExecItem[]>();
    items.forEach((item) => {
      const list = map.get(item.execDate) || [];
      list.push(item);
      map.set(item.execDate, list);
    });
    return [...map.entries()];
  }, [items]);

  const stats = useMemo(() => {
    const done = items.filter((i) => i.status === '완료').length;
    const active = items.filter((i) => i.status === '진행중').length;
    const pending = items.filter((i) => i.status === '보류').length;
    const hours = items.reduce((s, i) => s + (Number(i.hours) || 0), 0);
    return { done, active, pending, hours };
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] text-[12px] overflow-hidden">
      {/* 요약 바 */}
      <div className="bg-white border-b border-gray-300 px-3 py-1.5 flex flex-wrap items-center gap-2 shrink-0">
        <span className="font-bold text-gray-700">업무실행현황</span>
        <span className="chip bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0] num">완료 {stats.done}</span>
        <span className="chip bg-[#fffbeb] text-[#b45309] border border-[#fde68a] num">진행중 {stats.active}</span>
        <span className="chip bg-[#f8fafc] text-[var(--ink-600)] border border-[var(--line)] num">보류 {stats.pending}</span>
        <span className="chip bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe] num">투입 {stats.hours}h</span>
        <span className="ml-auto text-gray-500">총 <b className="text-blue-700">{total}</b>건</span>
        <button
          type="button" onClick={() => void loadList()}
          className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-400 rounded hover:bg-gray-100 font-bold"
        >
          <RefreshCw className="w-3 h-3" />새로고침
        </button>
      </div>

      {/* 조회 조건 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex flex-wrap items-center gap-2 shrink-0">
        <input
          type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
          className="bg-white border border-gray-400 px-1.5 py-0.5 text-[12px] font-mono outline-none"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-white border border-gray-400 px-1.5 py-0.5 outline-none"
        >
          {TYPES.map((t) => <option key={t} value={t}>{t === '전체' ? '유형 전체' : t}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-white border border-gray-400 px-1.5 py-0.5 outline-none"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s === '전체' ? '상태 전체' : s}</option>)}
        </select>
        {(dateFilter || typeFilter !== '전체' || statusFilter !== '전체') && (
          <button
            type="button"
            onClick={() => { setDateFilter(''); setTypeFilter('전체'); setStatusFilter('전체'); setPage(1); }}
            className="px-2 py-0.5 bg-white border border-gray-400 rounded hover:bg-gray-100"
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {loading ? (
          <div className="py-16 text-center text-gray-400">불러오는 중...</div>
        ) : error ? (
          <div className="py-16 text-center text-rose-600">{error}</div>
        ) : grouped.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
            조건에 맞는 업무실행 내역이 없습니다.
          </div>
        ) : (
          grouped.map(([date, list]) => (
            <section key={date} className="bg-white border border-gray-300 rounded-md overflow-hidden">
              <header className="px-3 py-1.5 bg-[#f8fafc] border-b border-[var(--line)] flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                <span className="font-bold text-gray-800">{fmtDay(date)}</span>
                <span className="text-[11px] text-gray-500 num">{list.length}건 · {list.reduce((s, i) => s + (Number(i.hours) || 0), 0)}h</span>
              </header>
              <ul className="divide-y divide-[var(--line)]">
                {list.map((item) => {
                  const tm = TYPE_META[item.execType] || TYPE_META['정기업무'];
                  const sm = STATUS_META[item.status] || STATUS_META['보류'];
                  return (
                    <li key={item.id} className="px-3 py-1.5 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: tm.dot }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-gray-900 truncate">{item.title}</span>
                          <span className={`chip border ${tm.chip}`}>{item.execType}</span>
                        </div>
                        {item.content && (
                          <div className="text-[11px] text-gray-500 truncate mt-0.5">{item.content}</div>
                        )}
                        <div className="text-[10.5px] text-gray-400 mt-0.5">
                          {item.department && <span className="mr-1.5">{item.department}</span>}
                          <span className="mr-1.5">{item.authorName || item.authorLoginId || '-'}</span>
                          <span className="num">{Number(item.hours) || 0}h</span>
                        </div>
                      </div>
                      <span className={`chip border shrink-0 flex items-center gap-1 ${sm.chip}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                        {item.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* 페이징 */}
      <div className="h-[30px] bg-white border-t border-gray-300 px-3 flex items-center justify-center gap-2 shrink-0">
        <button
          type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="p-1 border border-gray-400 rounded bg-white hover:bg-gray-100 disabled:opacity-40"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="num text-gray-700">{page} / {totalPages}</span>
        <button
          type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
          className="p-1 border border-gray-400 rounded bg-white hover:bg-gray-100 disabled:opacity-40"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
