'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Pencil,
  Plus, RefreshCw, Trash2, X,
} from 'lucide-react';

interface ScheduleItem {
  id: number;
  title: string;
  content: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  category: string;
  allDay: boolean;
  department: string;
  authorName: string;
  authorLoginId: string;
}

interface ScheduleDetail extends ScheduleItem {
  authorId: number | null;
}

interface EditorState {
  mode: 'create' | 'edit';
  id?: number;
  title: string;
  content: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  category: string;
  allDay: boolean;
  department: string;
}

const CATEGORIES = ['생산', '회의', '휴무', '검사', '납품', '교육', '기타'] as const;

const CAT: Record<string, { solid: string; bg: string; text: string }> = {
  '생산': { solid: '#2b7de9', bg: '#eff6ff', text: '#1d4ed8' },
  '회의': { solid: '#10b981', bg: '#ecfdf5', text: '#047857' },
  '휴무': { solid: '#94a3b8', bg: '#f1f5f9', text: '#64748b' },
  '검사': { solid: '#f59e0b', bg: '#fffbeb', text: '#b45309' },
  '납품': { solid: '#8b5cf6', bg: '#f5f3ff', text: '#7c3aed' },
  '교육': { solid: '#06b6d4', bg: '#ecfeff', text: '#0e7490' },
  '기타': { solid: '#64748b', bg: '#f8fafc', text: '#475569' },
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n: number): string { return String(n).padStart(2, '0'); }
function ymd(y: number, m: number, d: number): string { return `${y}-${pad(m)}-${pad(d)}`; }

export const ScheduleView: React.FC = () => {
  const { data: session } = useSession();
  const me = session?.user as any;
  const isAdmin = me?.role === '관리자';
  const myId = Number(me?.id) || 0;

  const today = useMemo(() => {
    const d = new Date(Date.now() + 9 * 3600 * 1000);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }, []);

  const [viewYear, setViewYear] = useState(() => Number(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(today.slice(5, 7)));
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('전체');

  const monthStr = `${viewYear}-${pad(viewMonth)}`;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const loadSchedules = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ month: monthStr });
      if (categoryFilter !== '전체') params.set('category', categoryFilter);
      const res = await fetch(`/api/schedule?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSchedules(json.data);
      } else setError(json.error || '일정을 불러오지 못했습니다.');
    } catch (err) {
      console.error('Failed to load schedules:', err);
      setError('일정을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [monthStr, categoryFilter]);

  useEffect(() => { void loadSchedules(); }, [loadSchedules]);

  const schedulesByDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    schedules.forEach((s) => {
      const list = map.get(s.scheduleDate) || [];
      list.push(s);
      map.set(s.scheduleDate, list);
    });
    return map;
  }, [schedules]);

  // 캘린더 셀 생성
  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth - 1, 0).getDate();
    const cells: { date: string; day: number; isCurrentMonth: boolean; isToday: boolean; isWeekend: number }[] = [];
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startDow + 1;
      const dow = i % 7;
      let y = viewYear, m = viewMonth, d = dayNum;
      let isCurrentMonth = true;
      if (dayNum < 1) { m = viewMonth - 1; d = prevMonthDays + dayNum; if (m < 1) { m = 12; y--; } isCurrentMonth = false; }
      else if (dayNum > daysInMonth) { m = viewMonth + 1; d = dayNum - daysInMonth; if (m > 12) { m = 1; y++; } isCurrentMonth = false; }
      const dateStr = ymd(y, m, d);
      cells.push({ date: dateStr, day: d, isCurrentMonth, isToday: dateStr === today, isWeekend: dow });
    }
    return cells;
  }, [viewYear, viewMonth, today]);

  // 통계
  const stats = useMemo(() => {
    const monthCount = schedules.length;
    const weekStart = new Date(Date.now() + 9 * 3600 * 1000);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    const weekStr = [weekStart, weekEnd].map(d => ymd(d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate()));
    const weekCount = schedules.filter(s => s.scheduleDate >= weekStr[0] && s.scheduleDate <= weekStr[1]).length;
    const todayCount = (schedulesByDate.get(today) || []).length;
    return { monthCount, weekCount, todayCount };
  }, [schedules, schedulesByDate, today]);

  const navMonth = (delta: number) => {
    let m = viewMonth + delta, y = viewYear;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    setViewYear(y); setViewMonth(m); setSelectedDate(null);
  };

  const openCreate = (date?: string) => {
    setEditorError(null);
    setEditor({
      mode: 'create', title: '', content: '',
      scheduleDate: date || today, startTime: '', endTime: '',
      category: '생산', allDay: true, department: me?.department || '',
    });
  };

  const openEdit = (item: ScheduleDetail) => {
    setEditorError(null);
    setEditor({
      mode: 'edit', id: item.id, title: item.title, content: item.content,
      scheduleDate: item.scheduleDate, startTime: item.startTime, endTime: item.endTime,
      category: item.category, allDay: item.allDay, department: item.department,
    });
  };

  const saveSchedule = async () => {
    if (!editor) return;
    const title = editor.title.trim();
    if (!title) { setEditorError('제목을 입력하세요.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editor.scheduleDate)) { setEditorError('날짜를 선택하세요.'); return; }
    setSaving(true); setEditorError(null);
    try {
      const res = await fetch(editor.mode === 'create' ? '/api/schedule' : `/api/schedule/${editor.id}`, {
        method: editor.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editor, title }),
      });
      const json = await res.json();
      if (!json.success) { setEditorError(json.error || '저장에 실패했습니다.'); return; }
      setEditor(null);
      showToast(editor.mode === 'create' ? '일정이 등록되었습니다.' : '일정이 수정되었습니다.');
      await loadSchedules();
    } catch { setEditorError('저장에 실패했습니다.'); }
    finally { setSaving(false); }
  };

  const deleteSchedule = async (id: number) => {
    if (!window.confirm('이 일정을 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { setDetail(null); showToast('일정이 삭제되었습니다.'); await loadSchedules(); }
      else showToast(json.error || '삭제에 실패했습니다.');
    } catch { showToast('삭제에 실패했습니다.'); }
  };

  const selectedSchedules = selectedDate ? (schedulesByDate.get(selectedDate) || []) : [];
  const upcoming = useMemo(() => {
    return schedules.filter(s => s.scheduleDate >= today).sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate)).slice(0, 5);
  }, [schedules, today]);

  return (
    <div className="flex flex-col w-full h-full bg-[var(--canvas)] overflow-hidden">
      {toast && (
        <div className="fixed top-14 right-6 z-[300] flex items-center gap-2 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2 text-[11.5px] font-semibold text-[#047857] shadow-lg">
          <CheckCircle2 className="w-4 h-4" />{toast}
        </div>
      )}

      {/* 툴바 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--line)] bg-white shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13.5px] font-bold text-[var(--ink-900)] mr-2 flex items-center gap-1.5">
            <span className="w-[3px] h-4 rounded-full bg-[#2b7de9]" />
            공장 일정관리
          </span>
          <button type="button" onClick={() => navMonth(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] hover:bg-[#f8fafc]">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="num text-[16px] font-bold text-[var(--ink-900)] min-w-[130px] text-center">
            {viewYear}년 {viewMonth}월
          </span>
          <button type="button" onClick={() => navMonth(1)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] hover:bg-[#f8fafc]">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => { const d = new Date(Date.now() + 9*3600*1000); setViewYear(d.getUTCFullYear()); setViewMonth(d.getUTCMonth()+1); setSelectedDate(null); }}
            className="h-7 rounded-md border border-[var(--line)] bg-white px-2 text-[11.5px] font-semibold text-[var(--ink-600)] hover:bg-[#f8fafc]">
            오늘
          </button>
          <span className="chip bg-[#f8fafc] text-[var(--ink-600)] border border-[var(--line)] num ml-1">
            {stats.monthCount}건
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-7 rounded-md border border-[var(--line)] bg-white px-2 text-[11.5px] outline-none focus:border-[#2b7de9]">
            <option value="전체">전체</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" onClick={() => void loadSchedules()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] hover:bg-[#f8fafc]" title="새로고침">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => openCreate(selectedDate || today)}
            className="flex h-7 items-center gap-1 rounded-md bg-[#0f172a] px-2.5 text-[11.5px] font-semibold text-white hover:bg-[#1e293b]">
            <Plus className="w-3.5 h-3.5" />새 일정
          </button>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-1.5 border-b border-[var(--line)] bg-white shrink-0">
        {CATEGORIES.map((c) => (
          <button key={c} type="button"
            onClick={() => setCategoryFilter(categoryFilter === c ? '전체' : c)}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              categoryFilter === c ? 'bg-[var(--ink-900)] text-white' : 'text-[var(--ink-600)] hover:bg-[#f8fafc]'
            }`}>
            <span className="w-2 h-2 rounded-full" style={{ background: CAT[c].solid }} />
            {c}
          </button>
        ))}
      </div>

      {/* 캘린더 그리드 */}
      <div className="flex-1 overflow-auto p-3">
        <div className="erp-card overflow-hidden">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 border-b border-[var(--line)]">
            {DAY_LABELS.map((label, i) => (
              <div key={label}
                className={`py-1.5 text-center text-[10.5px] font-bold ${
                  i === 0 ? 'text-[#e11d48]' : i === 6 ? 'text-[#2b7de9]' : 'text-[var(--ink-600)]'
                } bg-[#eef2f7]`}>
                {label}
              </div>
            ))}
          </div>
          {/* 날짜 셀 */}
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              const daySchedules = schedulesByDate.get(cell.date) || [];
              const isDow = i % 7;
              const isSelected = selectedDate === cell.date;
              return (
                <div key={i}
                  onClick={() => setSelectedDate(isSelected ? null : cell.date)}
                  className={`min-h-[76px] border-b border-r border-[var(--line)] p-1 cursor-pointer transition-colors ${
                    !cell.isCurrentMonth ? 'bg-[#fafbfc]' : 'bg-white'
                  } ${isSelected ? 'ring-1 ring-inset ring-[#2b7de9] bg-[#eff6ff]' : 'hover:bg-[#f8fafc]'}`}
                >
                  <div className="flex items-center justify-end mb-0.5">
                    <span className={`num text-[10.5px] font-semibold inline-flex items-center justify-center w-5 h-5 rounded-full ${
                      cell.isToday ? 'bg-[#2b7de9] text-white' :
                      !cell.isCurrentMonth ? 'text-[var(--ink-400)]' :
                      isDow === 0 ? 'text-[#e11d48]' : isDow === 6 ? 'text-[#2b7de9]' : 'text-[var(--ink-700)]'
                    }`}>
                      {cell.day}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {daySchedules.slice(0, 3).map((s) => (
                      <div key={s.id}
                        onClick={(e) => { e.stopPropagation(); openEdit(s as ScheduleDetail); }}
                        className="truncate rounded-sm px-1 py-px text-[9.5px] font-medium cursor-pointer hover:opacity-80"
                        style={{ background: CAT[s.category]?.bg || '#f8fafc', color: CAT[s.category]?.text || '#475569', borderLeft: `2px solid ${CAT[s.category]?.solid || '#64748b'}` }}
                        title={s.title}>
                        {s.startTime && <span className="num mr-0.5">{s.startTime}</span>}
                        {s.title}
                      </div>
                    ))}
                    {daySchedules.length > 3 && (
                      <div className="pl-1 text-[9px] font-semibold text-[var(--ink-400)]">
                        +{daySchedules.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 선택된 날짜 상세 */}
        {selectedDate && (
          <div className="mt-3 erp-card p-3.5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="num text-[13px] font-bold text-[var(--ink-900)]">{selectedDate}</h4>
              <button type="button" onClick={() => openCreate(selectedDate)}
                className="flex h-6.5 items-center gap-1 rounded-md bg-[#2b7de9] px-2 text-[10.5px] font-semibold text-white hover:bg-[#1b6fd6]">
                <Plus className="w-3 h-3" />일정 추가
              </button>
            </div>
            {selectedSchedules.length === 0 ? (
              <div className="py-3 text-center text-[11px] text-[var(--ink-400)]">이 날짜에 등록된 일정이 없습니다.</div>
            ) : (
              <ul className="space-y-1.5">
                {selectedSchedules.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5">
                    <span className="w-1 h-6 rounded-full" style={{ background: CAT[s.category]?.solid }} />
                    <span className={`chip border`} style={{ background: CAT[s.category]?.bg, color: CAT[s.category]?.text, borderColor: CAT[s.category]?.bg }}>
                      {s.category}
                    </span>
                    <span className="flex-1 truncate text-[11.5px] font-medium text-[var(--ink-900)]">{s.title}</span>
                    {s.startTime && <span className="num text-[10px] text-[var(--ink-400)]">{s.startTime}{s.endTime ? `~${s.endTime}` : ''}</span>}
                    <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(s as ScheduleDetail); }}
                      className="rounded p-0.5 text-[var(--ink-400)] hover:text-[var(--ink-900)]">
                      <Pencil className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 예정된 일정 */}
        {upcoming.length > 0 && (
          <div className="mt-3 erp-card p-3.5">
            <h4 className="mb-2 text-[11px] font-bold text-[var(--ink-600)]">예정된 일정</h4>
            <ul className="flex flex-wrap gap-1.5">
              {upcoming.map((s) => (
                <li key={s.id}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-[10.5px]">
                  <span className="w-2 h-2 rounded-full" style={{ background: CAT[s.category]?.solid }} />
                  <span className="num font-semibold text-[var(--ink-900)]">{s.scheduleDate.slice(5)}</span>
                  <span className="truncate text-[var(--ink-600)] max-w-[140px]">{s.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {detail && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[var(--line)] px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="chip border" style={{ background: CAT[detail.category]?.bg, color: CAT[detail.category]?.text, borderColor: CAT[detail.category]?.bg }}>
                    {detail.category}
                  </span>
                  <span className="num text-[12px] font-bold text-[var(--ink-900)]">{detail.scheduleDate}</span>
                </div>
                <h3 className="mt-1.5 text-[15px] font-bold text-[var(--ink-900)]">{detail.title}</h3>
                <div className="mt-1 flex items-center gap-2 text-[10.5px] text-[var(--ink-400)]">
                  {detail.startTime && <span className="flex items-center gap-1 num"><Clock className="w-3 h-3" />{detail.startTime}{detail.endTime ? `~${detail.endTime}` : ''}</span>}
                  {detail.department && <span>{detail.department}</span>}
                  <span>{detail.authorName || detail.authorLoginId || '-'}</span>
                </div>
              </div>
              <button type="button" onClick={() => setDetail(null)}
                className="rounded-md p-1 text-[var(--ink-400)] hover:bg-[#f8fafc] hover:text-[var(--ink-900)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                {detail.content || '내용 없음'}
              </div>
            </div>
            {(isAdmin || detail.authorId === myId) && (
              <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] px-4 py-2.5">
                <button type="button" onClick={() => openEdit(detail)}
                  className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--ink-700)] hover:bg-[#f8fafc]">
                  <Pencil className="w-3.5 h-3.5" />수정
                </button>
                <button type="button" onClick={() => void deleteSchedule(detail.id)}
                  className="flex items-center gap-1 rounded-md border border-[#fecdd3] bg-[#fff1f2] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#be123c] hover:bg-[#ffe4e6]">
                  <Trash2 className="w-3.5 h-3.5" />삭제
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 작성/수정 모달 */}
      {editor && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h3 className="text-[14px] font-bold text-[var(--ink-900)]">
                {editor.mode === 'create' ? '새 일정' : '일정 수정'}
              </h3>
              <button type="button" onClick={() => setEditor(null)}
                className="rounded-md p-1 text-[var(--ink-400)] hover:bg-[#f8fafc] hover:text-[var(--ink-900)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">제목</label>
                <input value={editor.title} onChange={(e) => setEditor((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  maxLength={200} placeholder="일정 제목"
                  className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2.5 text-[12px] outline-none focus:border-[#2b7de9]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">날짜</label>
                  <input type="date" value={editor.scheduleDate}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, scheduleDate: e.target.value } : prev))}
                    className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2 text-[12px] outline-none focus:border-[#2b7de9]" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">구분</label>
                  <select value={editor.category} onChange={(e) => setEditor((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                    className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2 text-[12px] outline-none focus:border-[#2b7de9]">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {!editor.allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">시작</label>
                    <input type="time" value={editor.startTime} onChange={(e) => setEditor((prev) => (prev ? { ...prev, startTime: e.target.value } : prev))}
                      className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2 text-[12px] outline-none focus:border-[#2b7de9]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">종료</label>
                    <input type="time" value={editor.endTime} onChange={(e) => setEditor((prev) => (prev ? { ...prev, endTime: e.target.value } : prev))}
                      className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2 text-[12px] outline-none focus:border-[#2b7de9]" />
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">담당 부서</label>
                <input value={editor.department} onChange={(e) => setEditor((prev) => (prev ? { ...prev, department: e.target.value } : prev))}
                  maxLength={100} placeholder="예: 생산팀, 품질관리팀"
                  className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2.5 text-[12px] outline-none focus:border-[#2b7de9]" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">내용</label>
                <textarea value={editor.content} onChange={(e) => setEditor((prev) => (prev ? { ...prev, content: e.target.value } : prev))}
                  rows={4} maxLength={2000} placeholder="일정 상세 내용 (선택)"
                  className="w-full resize-y rounded-md border border-[var(--line)] bg-white px-2.5 py-2 text-[12px] leading-relaxed outline-none focus:border-[#2b7de9]" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ink-700)]">
                  <input type="checkbox" checked={editor.allDay}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, allDay: e.target.checked } : prev))} />
                  종일
                </label>
                {editorError && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-[#be123c]">
                    <AlertTriangle className="w-3.5 h-3.5" />{editorError}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] px-4 py-2.5">
              <button type="button" onClick={() => setEditor(null)}
                className="rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink-600)] hover:bg-[#f8fafc]">취소</button>
              <button type="button" onClick={() => void saveSchedule()} disabled={saving}
                className="rounded-md bg-[#2b7de9] px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#1b6fd6] disabled:opacity-60">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
