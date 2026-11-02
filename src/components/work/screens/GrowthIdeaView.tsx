'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  CheckCircle2, ChevronLeft, ChevronRight, Lightbulb, Pencil,
  Plus, RefreshCw, Search, Trash2, X,
} from 'lucide-react';

interface IdeaItem {
  id: number;
  ideaDate: string;
  category: string;
  title: string;
  content: string;
  expectedEffect: string;
  status: string;
  department: string;
  authorId: number | null;
  authorName: string;
  authorLoginId: string;
  createdAt: string;
}

const CATEGORIES = ['신제품', '원가절감', '매출확대', '업무개선', '기타'] as const;
const STATUSES = ['제안', '검토중', '채택', '보류', '완료'] as const;

const NEXT_STATUS: Record<string, string[]> = {
  '제안': ['검토중', '보류'],
  '검토중': ['채택', '보류', '제안'],
  '채택': ['완료', '보류'],
  '보류': ['제안', '검토중'],
  '완료': [],
};

const CATEGORY_META: Record<string, { dot: string; chip: string }> = {
  '신제품': { dot: '#2b7de9', chip: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]' },
  '원가절감': { dot: '#059669', chip: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]' },
  '매출확대': { dot: '#d97706', chip: 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]' },
  '업무개선': { dot: '#8b5cf6', chip: 'bg-[#f5f3ff] text-[#7c3aed] border-[#ddd6fe]' },
  '기타': { dot: '#64748b', chip: 'bg-[#f8fafc] text-[var(--ink-600)] border-[var(--line)]' },
};

const STATUS_META: Record<string, { chip: string; dot: string }> = {
  '제안': { chip: 'bg-white text-[#1d4ed8] border-[#bfdbfe]', dot: 'bg-[#2b7de9]' },
  '검토중': { chip: 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]', dot: 'bg-[#d97706]' },
  '채택': { chip: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]', dot: 'bg-[#2b7de9]' },
  '보류': { chip: 'bg-[#f8fafc] text-[var(--ink-600)] border-[var(--line)]', dot: 'bg-[#94a3b8]' },
  '완료': { chip: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]', dot: 'bg-[#059669]' },
};

export const GrowthIdeaView: React.FC = () => {
  const { data: session } = useSession();
  const me = session?.user as any;
  const isAdmin = me?.role === '관리자';
  const myId = Number(me?.id) || 0;

  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [items, setItems] = useState<IdeaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('전체');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 등록 폼
  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState(kstToday);
  const [formCategory, setFormCategory] = useState<string>('업무개선');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formEffect, setFormEffect] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 수정 폼
  const [editItem, setEditItem] = useState<IdeaItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editEffect, setEditEffect] = useState('');
  const [editCategory, setEditCategory] = useState('');

  const pageSize = 30;

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (categoryFilter !== '전체') params.set('category', categoryFilter);
      if (statusFilter !== '전체') params.set('status', statusFilter);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await fetch(`/api/growth-idea?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setItems(json.data.items || []);
        setTotal(json.data.total || 0);
      } else setError(json.error || '아이디어를 불러오지 못했습니다.');
    } catch {
      setError('아이디어를 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [page, categoryFilter, statusFilter, keyword]);

  useEffect(() => { void loadList(); }, [loadList]);

  const stats = useMemo(() => {
    const m: Record<string, number> = {};
    STATUSES.forEach((s) => { m[s] = 0; });
    items.forEach((i) => { if (m[i.status] !== undefined) m[i.status]++; });
    return m;
  }, [items]);

  const grouped = useMemo(() => {
    const order = statusFilter === '전체' ? [...STATUSES] : [statusFilter];
    return order
      .map((s) => ({ status: s, list: items.filter((i) => i.status === s) }))
      .filter((g) => g.list.length > 0);
  }, [items, statusFilter]);

  const canEdit = (item: IdeaItem) => isAdmin || (item.authorId !== null && item.authorId === myId);

  const quickSave = async () => {
    const title = formTitle.trim();
    if (title.length < 2) { setFormError('제목을 2자 이상 입력하세요.'); return; }
    setSaving(true); setFormError(null);
    try {
      const res = await fetch('/api/growth-idea', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideaDate: formDate, category: formCategory, title,
          content: formContent.trim(), expectedEffect: formEffect.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFormTitle(''); setFormContent(''); setFormEffect('');
        setFormOpen(false); setPage(1);
        void loadList();
      } else setFormError(json.error || '등록 실패');
    } catch {
      setFormError('등록 중 오류가 발생했습니다.');
    } finally { setSaving(false); }
  };

  const changeStatus = async (item: IdeaItem, status: string) => {
    try {
      const res = await fetch(`/api/growth-idea/${item.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) void loadList();
      else alert(json.error || '상태 변경 실패');
    } catch {
      alert('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const startEdit = (item: IdeaItem) => {
    setEditItem(item);
    setEditTitle(item.title);
    setEditContent(item.content || '');
    setEditEffect(item.expectedEffect || '');
    setEditCategory(item.category);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    if (editTitle.trim().length < 2) { alert('제목을 2자 이상 입력하세요.'); return; }
    try {
      const res = await fetch(`/api/growth-idea/${editItem.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(), content: editContent.trim(),
          expectedEffect: editEffect.trim(), category: editCategory,
        }),
      });
      const json = await res.json();
      if (json.success) { setEditItem(null); void loadList(); }
      else alert(json.error || '수정 실패');
    } catch {
      alert('수정 중 오류가 발생했습니다.');
    }
  };

  const removeItem = async (item: IdeaItem) => {
    if (!window.confirm(`'${item.title}' 아이디어를 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/growth-idea/${item.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) void loadList();
      else alert(json.error || '삭제 실패');
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] text-[12px] overflow-hidden">
      {/* 요약 바 */}
      <div className="bg-white border-b border-gray-300 px-3 py-1.5 flex flex-wrap items-center gap-2 shrink-0">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <span className="font-bold text-gray-700">성장전략 idea</span>
        {STATUSES.map((s) => {
          const m = STATUS_META[s];
          return (
            <span key={s} className={`chip border num ${m.chip}`}>{s} {stats[s] || 0}</span>
          );
        })}
        <span className="ml-auto text-gray-500">총 <b className="text-blue-700">{total}</b>건</span>
        <button
          type="button" onClick={() => void loadList()}
          className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-400 rounded hover:bg-gray-100 font-bold"
        >
          <RefreshCw className="w-3 h-3" />새로고침
        </button>
        <button
          type="button" onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold"
        >
          <Plus className="w-3.5 h-3.5" />아이디어 등록
        </button>
      </div>

      {/* 등록 폼 */}
      {formOpen && (
        <div className="bg-white border-b border-gray-300 px-3 py-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-1 font-mono outline-none"
            />
            <select
              value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-1 outline-none"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
              placeholder="아이디어 제목 (2자 이상)"
              className="flex-1 min-w-[200px] bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
            />
          </div>
          <textarea
            value={formContent} onChange={(e) => setFormContent(e.target.value)}
            placeholder="내용 (현황·문제점·개선안 등)"
            rows={2}
            className="mt-1.5 w-full bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500 resize-y"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="text" value={formEffect} onChange={(e) => setFormEffect(e.target.value)}
              placeholder="기대효과 (예: 월 200만원 절감, 불량률 1%p 개선)"
              className="flex-1 bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
            />
            <button
              type="button" onClick={() => void quickSave()} disabled={saving}
              className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold disabled:opacity-50"
            >
              {saving ? '등록 중...' : '등록'}
            </button>
          </div>
          {formError && <div className="mt-1 text-rose-600">{formError}</div>}
        </div>
      )}

      {/* 조회 조건 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex flex-wrap items-center gap-2 shrink-0">
        <select
          value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="bg-white border border-gray-400 px-1.5 py-0.5 outline-none"
        >
          <option value="전체">분야 전체</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-white border border-gray-400 px-1.5 py-0.5 outline-none"
        >
          <option value="전체">상태 전체</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text" value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            placeholder="제목 / 내용 검색"
            className="bg-white border border-gray-400 px-2 py-0.5 w-44 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 목록 (상태별 그룹) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {loading ? (
          <div className="py-16 text-center text-gray-400">불러오는 중...</div>
        ) : error ? (
          <div className="py-16 text-center text-rose-600">{error}</div>
        ) : grouped.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Lightbulb className="w-8 h-8 mx-auto mb-2 text-amber-300" />
            등록된 아이디어가 없습니다. 상단 [아이디어 등록]으로 제안해 보세요.
          </div>
        ) : (
          grouped.map(({ status, list }) => {
            const sm = STATUS_META[status];
            return (
              <section key={status} className="bg-white border border-gray-300 rounded-md overflow-hidden">
                <header className="px-3 py-1.5 bg-[#f8fafc] border-b border-[var(--line)] flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${sm.dot}`} />
                  <span className="font-bold text-gray-800">{status}</span>
                  <span className="text-[11px] text-gray-500 num">{list.length}건</span>
                </header>
                <ul className="divide-y divide-[var(--line)]">
                  {list.map((item) => {
                    const cm = CATEGORY_META[item.category] || CATEGORY_META['기타'];
                    const editable = canEdit(item);
                    return (
                      <li key={item.id} className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`chip border ${cm.chip}`}>{item.category}</span>
                          <span className="font-semibold text-gray-900">{item.title}</span>
                          <span className="text-[10.5px] text-gray-400 num">{item.ideaDate}</span>
                          {editable && (
                            <span className="ml-auto flex items-center gap-1">
                              <button
                                type="button" onClick={() => startEdit(item)} title="수정"
                                className="p-1 text-gray-400 hover:text-blue-600"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button" onClick={() => void removeItem(item)} title="삭제"
                                className="p-1 text-gray-400 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          )}
                        </div>
                        {item.content && (
                          <div className="text-[11.5px] text-gray-600 mt-1 whitespace-pre-wrap break-words">{item.content}</div>
                        )}
                        {item.expectedEffect && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            <CheckCircle2 className="w-3 h-3 inline mr-1" />기대효과: {item.expectedEffect}
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10.5px] text-gray-400 mr-1">
                            {item.authorName || item.authorLoginId || '-'}
                            {item.department && ` · ${item.department}`}
                          </span>
                          {(NEXT_STATUS[item.status] || []).map((ns) => (
                            <button
                              key={ns} type="button"
                              onClick={() => void changeStatus(item, ns)}
                              className="px-2 py-0.5 text-[11px] font-bold bg-white border border-gray-400 rounded hover:bg-gray-100"
                            >
                              → {ns}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
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

      {/* 수정 모달 */}
      {editItem && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-[520px] max-w-full flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-300 flex items-center justify-between">
              <span className="font-bold text-[13px]">아이디어 수정</span>
              <button type="button" onClick={() => setEditItem(null)} className="p-1 text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                  className="bg-white border border-gray-400 px-1.5 py-1 outline-none"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  className="flex-1 bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
                />
              </div>
              <textarea
                value={editContent} onChange={(e) => setEditContent(e.target.value)}
                rows={3} placeholder="내용"
                className="w-full bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500 resize-y"
              />
              <input
                type="text" value={editEffect} onChange={(e) => setEditEffect(e.target.value)}
                placeholder="기대효과"
                className="w-full bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
              />
            </div>
            <div className="px-4 py-2 border-t border-gray-300 flex justify-end gap-2">
              <button
                type="button" onClick={() => setEditItem(null)}
                className="px-3 py-1 border border-gray-400 rounded bg-white hover:bg-gray-100"
              >
                취소
              </button>
              <button
                type="button" onClick={() => void saveEdit()}
                className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
