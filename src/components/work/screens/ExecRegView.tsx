'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  Pencil, Plus, RefreshCw, Trash2, X, Zap,
} from 'lucide-react';

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

const TYPES = ['정기업무', '임시업무', '개선업무', '고장처리', '교육'] as const;
const STATUSES = ['완료', '진행중', '보류'] as const;

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

function fmtDate(v: string): string {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v.slice(0, 10);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

function fmtDay(dateStr: string): { display: string; isToday: boolean; weekday: string } {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = days[d.getDay()];
  const yesterday = new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
  const label = dateStr === today ? '오늘' : dateStr === yesterday ? '어제' : `${dateStr} (${weekday})`;
  return { display: label, isToday: dateStr === today, weekday };
}

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
  updatedAt: string;
}

export const ExecRegView: React.FC = () => {
  const { data: session } = useSession();
  const me = session?.user as any;
  const isAdmin = me?.role === '관리자';
  const myId = Number(me?.id) || 0;

  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [items, setItems] = useState<ExecItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('전체');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 빠른 입력 폼
  const [formDate, setFormDate] = useState(kstToday);
  const [formType, setFormType] = useState<string>('정기업무');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formStatus, setFormStatus] = useState('완료');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editItem, setEditItem] = useState<ExecItem | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; content: string; hours: string; status: string; execType: string } | null>(null);

  const pageSize = 30;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (typeFilter !== '전체') params.set('type', typeFilter);
      if (statusFilter !== '전체') params.set('status', statusFilter);
      const res = await fetch(`/api/work-exec?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setItems(json.data.items || []);
        setTotal(json.data.total || 0);
      } else setError(json.error || '업무실행 데이터를 불러오지 못했습니다.');
    } catch (err) {
      console.error('Failed to load work executions:', err);
      setError('업무실행 데이터를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [page, typeFilter, statusFilter]);

  useEffect(() => { void loadList(); }, [loadList]);

  // 날짜별 그룹화
  const grouped = useMemo(() => {
    const map = new Map<string, ExecItem[]>();
    items.forEach((item) => {
      const list = map.get(item.execDate) || [];
      list.push(item);
      map.set(item.execDate, list);
    });
    return [...map.entries()];
  }, [items]);

  // 통계
  const stats = useMemo(() => {
    const today = kstToday;
    const todayCount = items.filter((i) => i.execDate === today).length;
    const weekAgo = new Date(Date.now() + 9 * 3600 * 1000 - 7 * 86400000).toISOString().slice(0, 10);
    const weekCount = items.filter((i) => i.execDate >= weekAgo).length;
    const totalHours = items.filter((i) => i.execDate === today).reduce((s, i) => s + i.hours, 0);
    return { todayCount, weekCount, totalHours };
  }, [items, kstToday]);

  const quickSave = async () => {
    const title = formTitle.trim();
    if (title.length < 2) { setFormError('제목을 입력하세요.'); return; }
    setSaving(true); setFormError(null);
    try {
      const res = await fetch('/api/work-exec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          execDate: formDate, execType: formType, title, content: formContent.trim(),
          hours: Number(formHours) || 0, status: formStatus, department: me?.department || '',
        }),
      });
      const json = await res.json();
      if (!json.success) { setFormError(json.error || '등록에 실패했습니다.'); return; }
      setFormTitle(''); setFormContent(''); setFormHours('');
      showToast('업무가 등록되었습니다.');
      setPage(1);
      await loadList();
    } catch { setFormError('등록에 실패했습니다.'); }
    finally { setSaving(false); }
  };

  const updateExec = async (id: number, data: any) => {
    try {
      const res = await fetch(`/api/work-exec/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) { showToast('수정되었습니다.'); await loadList(); }
      else showToast(json.error || '수정에 실패했습니다.');
    } catch { showToast('수정에 실패했습니다.'); }
  };

  const deleteExec = async (id: number) => {
    if (!window.confirm('이 업무실행 기록을 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/work-exec/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { showToast('삭제되었습니다.'); await loadList(); }
      else showToast(json.error || '삭제에 실패했습니다.');
    } catch { showToast('삭제에 실패했습니다.'); }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col w-full h-full bg-[var(--canvas)] overflow-y-auto">
      {toast && (
        <div className="fixed top-14 right-6 z-[300] flex items-center gap-2 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2 text-[11.5px] font-semibold text-[#047857] shadow-lg">
          <CheckCircle2 className="w-4 h-4" />{toast}
        </div>
      )}

      {/* 툴바 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--line)] bg-white shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-4 rounded-full bg-[#2b7de9]" />
          <h2 className="text-[13.5px] font-bold text-[var(--ink-900)]">업무실행등록</h2>
          <span className="chip bg-[#f8fafc] text-[var(--ink-600)] border border-[var(--line)] num">{total}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="h-7 rounded-md border border-[var(--line)] bg-white px-2 text-[11.5px] outline-none focus:border-[#2b7de9]">
            <option value="전체">전체 구분</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-7 rounded-md border border-[var(--line)] bg-white px-2 text-[11.5px] outline-none focus:border-[#2b7de9]">
            <option value="전체">전체 상태</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={() => void loadList()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] hover:bg-[#f8fafc]" title="새로고침">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* 통계 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '오늘 등록', value: `${stats.todayCount}건`, color: '#2b7de9' },
            { label: '이번 주', value: `${stats.weekCount}건`, color: '#10b981' },
            { label: '오늘 소요시간', value: `${stats.totalHours.toFixed(1)}h`, color: '#f59e0b' },
          ].map((s) => (
            <div key={s.label} className="erp-card px-3 py-2">
              <div className="text-[10px] font-semibold text-[var(--ink-400)]">{s.label}</div>
              <div className="num text-[16px] font-black mt-0.5" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* 빠른 입력 폼 */}
        <div className="erp-card p-3.5">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Zap className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span className="text-[11px] font-bold text-[var(--ink-700)]">빠른 등록</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_100px_1fr_70px_80px_70px]">
            <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
              className="h-8 rounded-md border border-[var(--line)] bg-white px-2 text-[11.5px] outline-none focus:border-[#2b7de9]" />
            <select value={formType} onChange={(e) => setFormType(e.target.value)}
              className="h-8 rounded-md border border-[var(--line)] bg-white px-2 text-[11.5px] outline-none focus:border-[#2b7de9]">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
              placeholder="업무 제목" maxLength={200}
              className="h-8 rounded-md border border-[var(--line)] bg-white px-2.5 text-[11.5px] outline-none focus:border-[#2b7de9]" />
            <input value={formHours} onChange={(e) => setFormHours(e.target.value)}
              type="number" step="0.5" min="0" max="24" placeholder="시간"
              className="h-8 rounded-md border border-[var(--line)] bg-white px-2 text-[11.5px] num outline-none focus:border-[#2b7de9]" />
            <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)}
              className="h-8 rounded-md border border-[var(--line)] bg-white px-2 text-[11.5px] outline-none focus:border-[#2b7de9]">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" onClick={() => void quickSave()} disabled={saving || !formTitle.trim()}
              className="flex h-8 items-center justify-center gap-1 rounded-md bg-[#2b7de9] text-[11.5px] font-semibold text-white hover:bg-[#1b6fd6] disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" />등록
            </button>
          </div>
          <textarea value={formContent} onChange={(e) => setFormContent(e.target.value)}
            rows={2} maxLength={5000} placeholder="상세 내용 (선택)"
            className="mt-2 w-full resize-none rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11.5px] outline-none focus:border-[#2b7de9]" />
          {formError && (
            <div className="mt-1.5 flex items-center gap-1 text-[10.5px] font-semibold text-[#be123c]">
              <AlertTriangle className="w-3 h-3" />{formError}
            </div>
          )}
        </div>

        {/* 타임라인 */}
        {loading ? (
          <div className="erp-card p-8 text-center text-[var(--ink-400)] text-[12px]">불러오는 중...</div>
        ) : grouped.length === 0 ? (
          <div className="erp-card p-12 text-center">
            <div className="text-[var(--ink-400)] text-[12px]">등록된 업무실행 기록이 없습니다.</div>
            <div className="mt-1 text-[10.5px] text-[var(--ink-400)]">위 빠른 등록 폼에서 첫 기록을 남겨보세요.</div>
          </div>
        ) : (
          grouped.map(([date, dayItems]) => {
            const dayInfo = fmtDay(date);
            const dayHours = dayItems.reduce((s, i) => s + i.hours, 0);
            return (
              <div key={date} className="erp-card overflow-hidden">
                <div className={`flex items-center justify-between px-3.5 py-2 border-b border-[var(--line)] ${dayInfo.isToday ? 'bg-[#eff6ff]' : 'bg-[#fbfcfe]'}`}>
                  <div className="flex items-center gap-2">
                    {dayInfo.isToday && (
                      <span className="chip border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]">오늘</span>
                    )}
                    <span className="num text-[12px] font-bold text-[var(--ink-900)]">{dayInfo.display}</span>
                  </div>
                  <span className="num text-[10.5px] text-[var(--ink-400)]">
                    {dayItems.length}건 · {dayHours.toFixed(1)}h
                  </span>
                </div>
                <div className="relative pl-6 pr-3 py-2">
                  <div className="absolute left-[22px] top-3 bottom-3 w-px bg-[var(--line)]" />
                  {dayItems.map((item) => {
                    const tm = TYPE_META[item.execType] || TYPE_META['정기업무'];
                    const st = STATUS_META[item.status] || STATUS_META['완료'];
                    const canEdit = isAdmin || item.authorId === myId;
                    const time = fmtDate(item.createdAt).slice(11);
                    return (
                      <div key={item.id} className="relative flex items-start gap-3 py-1.5">
                        <span className="num absolute -left-[18px] text-[9.5px] text-[var(--ink-400)] mt-0.5">{time}</span>
                        <span className={`relative z-10 mt-1 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${st.dot}`} />
                        <div className="flex-1 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`chip border ${tm.chip}`}>{item.execType}</span>
                            <span className={`chip border ${st.chip}`}>{item.status}</span>
                            <span className="num ml-auto text-[10px] text-[var(--ink-400)]">{item.hours.toFixed(1)}h</span>
                            {canEdit && (
                              <span className="flex items-center gap-0.5">
                                <button type="button"
                                  onClick={() => { setEditItem(item); setEditForm({ title: item.title, content: item.content, hours: String(item.hours), status: item.status, execType: item.execType }); }}
                                  className="rounded p-0.5 text-[var(--ink-400)] hover:text-[var(--ink-900)]" title="수정">
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button type="button" onClick={() => void deleteExec(item.id)}
                                  className="rounded p-0.5 text-[var(--ink-400)] hover:text-[#be123c]" title="삭제">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11.5px] font-semibold text-[var(--ink-900)]">{item.title}</div>
                          {item.content && (
                            <div className="mt-0.5 truncate text-[10.5px] text-[var(--ink-400)]">{item.content}</div>
                          )}
                          <div className="mt-0.5 text-[9.5px] text-[var(--ink-400)]">
                            {item.authorName || item.authorLoginId || '-'}{item.department ? ` · ${item.department}` : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* 페이지네이션 */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 pb-3">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] disabled:opacity-40">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="num text-[11.5px] text-[var(--ink-600)] px-2">{page} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] disabled:opacity-40">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {editItem && editForm && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h3 className="text-[14px] font-bold text-[var(--ink-900)]">업무실행 수정</h3>
              <button type="button" onClick={() => setEditItem(null)}
                className="rounded-md p-1 text-[var(--ink-400)] hover:bg-[#f8fafc] hover:text-[var(--ink-900)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">구분</label>
                  <select value={editForm.execType} onChange={(e) => setEditForm({ ...editForm, execType: e.target.value })}
                    className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2 text-[12px] outline-none">
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">상태</label>
                  <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2 text-[12px] outline-none">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">제목</label>
                <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  maxLength={200} className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2.5 text-[12px] outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">내용</label>
                <textarea value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                  rows={5} maxLength={5000}
                  className="w-full resize-y rounded-md border border-[var(--line)] bg-white px-2.5 py-2 text-[12px] outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">소요시간 (시간)</label>
                <input type="number" step="0.5" min="0" max="24" value={editForm.hours}
                  onChange={(e) => setEditForm({ ...editForm, hours: e.target.value })}
                  className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2.5 text-[12px] num outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] px-4 py-2.5">
              <button type="button" onClick={() => setEditItem(null)}
                className="rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink-600)] hover:bg-[#f8fafc]">취소</button>
              <button type="button"
                onClick={() => { void updateExec(editItem.id, editForm); setEditItem(null); }}
                className="rounded-md bg-[#2b7de9] px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#1b6fd6]">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
