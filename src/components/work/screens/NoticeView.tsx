'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

interface NoticeItem {
  id: number;
  title: string;
  category: string;
  isPinned: boolean;
  isPublished: boolean;
  authorName: string;
  authorLoginId: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

interface NoticeDetail extends NoticeItem {
  content: string;
}

interface EditorState {
  mode: 'create' | 'edit';
  id?: number;
  title: string;
  content: string;
  category: string;
  isPinned: boolean;
  isPublished: boolean;
}

const CATEGORIES = ['공지', '긴급', '일반'];

function fmtDate(value: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value.slice(0, 10);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(
    kst.getUTCHours()
  )}:${pad(kst.getUTCMinutes())}`;
}

function categoryChip(category: string): string {
  if (category === '긴급') return 'bg-[#fff1f2] text-[#be123c] border-[#fecdd3]';
  if (category === '공지') return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
  return 'bg-[#f8fafc] text-[var(--ink-600)] border-[var(--line)]';
}

export const NoticeView: React.FC = () => {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === '관리자';

  const [items, setItems] = useState<NoticeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('전체');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [detail, setDetail] = useState<NoticeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (category !== '전체') params.set('category', category);
      const res = await fetch(`/api/notice?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setItems(json.data.items || []);
        setTotal(json.data.total || 0);
      } else {
        setError(json.error || '공지사항을 불러오지 못했습니다.');
      }
    } catch (err) {
      console.error('Failed to load notices:', err);
      setError('공지사항을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, search, category]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const changeCategory = (value: string) => {
    setCategory(value);
    setPage(1);
  };

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/notice/${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setDetail(json.data);
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, viewCount: json.data.viewCount } : item))
        );
      } else {
        showToast(json.error || '공지를 불러오지 못했습니다.');
      }
    } catch (err) {
      console.error('Failed to load notice:', err);
      showToast('공지를 불러오지 못했습니다.');
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreate = () => {
    setEditorError(null);
    setEditor({
      mode: 'create',
      title: '',
      content: '',
      category: '공지',
      isPinned: false,
      isPublished: true,
    });
  };

  const openEdit = () => {
    if (!detail) return;
    setEditorError(null);
    setEditor({
      mode: 'edit',
      id: detail.id,
      title: detail.title,
      content: detail.content,
      category: detail.category,
      isPinned: detail.isPinned,
      isPublished: detail.isPublished,
    });
  };

  const saveNotice = async () => {
    if (!editor) return;
    const title = editor.title.trim();
    const content = editor.content.trim();
    if (title.length < 2) {
      setEditorError('제목은 2자 이상 입력하세요.');
      return;
    }
    if (!content) {
      setEditorError('본문을 입력하세요.');
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const res = await fetch(
        editor.mode === 'create' ? '/api/notice' : `/api/notice/${editor.id}`,
        {
          method: editor.mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content,
            category: editor.category,
            isPinned: editor.isPinned,
            isPublished: editor.isPublished,
          }),
        }
      );
      const json = await res.json();
      if (!json.success) {
        setEditorError(json.error || '저장에 실패했습니다.');
        return;
      }
      setEditor(null);
      showToast(editor.mode === 'create' ? '공지가 등록되었습니다.' : '공지가 수정되었습니다.');
      if (editor.mode === 'edit' && detail) {
        await openDetail(detail.id);
      }
      await loadList();
    } catch (err) {
      console.error('Failed to save notice:', err);
      setEditorError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const deleteNotice = async (id: number) => {
    if (!window.confirm('이 공지를 삭제할까요? 삭제 후에는 목록에서 보이지 않습니다.')) return;
    try {
      const res = await fetch(`/api/notice/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setDetail(null);
        showToast('공지가 삭제되었습니다.');
        await loadList();
      } else {
        showToast(json.error || '삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to delete notice:', err);
      showToast('삭제에 실패했습니다.');
    }
  };

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    for (let p = start; p <= end; p += 1) pages.push(p);
    return pages;
  }, [page, totalPages]);

  return (
    <div className="flex flex-col w-full h-full bg-[var(--canvas)] overflow-hidden">
      {toast && (
        <div className="fixed top-14 right-6 z-[300] flex items-center gap-2 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2 text-[11.5px] font-semibold text-[#047857] shadow-lg">
          <CheckCircle2 className="w-4 h-4" />
          {toast}
        </div>
      )}

      {/* 툴바 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--line)] bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-4 rounded-full bg-[#2b7de9]" />
          <h2 className="text-[13.5px] font-bold text-[var(--ink-900)]">공지사항</h2>
          <span className="chip bg-[#f8fafc] text-[var(--ink-600)] border border-[var(--line)] num">
            {total}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <form onSubmit={submitSearch} className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-400)]" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="제목/본문 검색"
                className="h-7 w-[190px] rounded-md border border-[var(--line)] bg-white pl-7 pr-2 text-[11.5px] text-[var(--ink-900)] outline-none focus:border-[#2b7de9]"
              />
            </div>
            <select
              value={category}
              onChange={(e) => changeCategory(e.target.value)}
              className="h-7 rounded-md border border-[var(--line)] bg-white px-2 text-[11.5px] text-[var(--ink-700)] outline-none focus:border-[#2b7de9]"
            >
              <option value="전체">전체 구분</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="flex h-7 items-center gap-1 rounded-md bg-[#2b7de9] px-2.5 text-[11.5px] font-semibold text-white hover:bg-[#1b6fd6]"
            >
              <Search className="w-3.5 h-3.5" />
              조회
            </button>
          </form>
          <button
            type="button"
            onClick={() => void loadList()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] hover:bg-[#f8fafc]"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={openCreate}
              className="flex h-7 items-center gap-1 rounded-md bg-[#0f172a] px-2.5 text-[11.5px] font-semibold text-white hover:bg-[#1e293b]"
            >
              <Plus className="w-3.5 h-3.5" />
              새 공지
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3.5 mt-2.5 flex items-center gap-2 rounded-md border border-[#fecdd3] bg-[#fff1f2] px-3 py-2 text-[11.5px] text-[#9f1239]">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 overflow-auto p-3.5">
        <div className="erp-card overflow-hidden">
          <table className="w-full border-collapse text-[11.5px]">
            <thead className="bg-[#eef2f7] text-[var(--ink-700)]">
              <tr>
                <th className="w-12 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">No</th>
                <th className="w-14 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">고정</th>
                <th className="w-16 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">구분</th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-left font-semibold">제목</th>
                <th className="w-24 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">작성자</th>
                <th className="w-36 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">등록일</th>
                <th className="w-16 border-b border-[var(--line)] px-2 py-2 text-right font-semibold">조회</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[var(--ink-400)]">
                    불러오는 중...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-[var(--ink-400)]">
                      <div className="text-[12px]">등록된 공지사항이 없습니다.</div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={openCreate}
                          className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--ink-700)] hover:bg-[#f8fafc]"
                        >
                          <Plus className="w-3.5 h-3.5" />첫 공지 작성
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr
                    key={item.id}
                    onClick={() => void openDetail(item.id)}
                    className="cursor-pointer border-b border-[var(--line)] last:border-b-0 hover:bg-[#f8fafc]"
                  >
                    <td className="px-2 py-2 text-center text-[var(--ink-400)] num">
                      {total - (page - 1) * pageSize - index}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {item.isPinned ? (
                        <Pin className="mx-auto h-3.5 w-3.5 text-[#b45309]" />
                      ) : (
                        <span className="text-[var(--ink-300)]">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`chip border ${categoryChip(item.category)}`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`truncate text-[var(--ink-900)] ${
                          item.isPinned ? 'font-bold' : 'font-medium'
                        }`}
                      >
                        {item.title}
                      </span>
                      {!item.isPublished && isAdmin && (
                        <span className="ml-2 chip border border-[#fde68a] bg-[#fffbeb] text-[#b45309]">
                          임시
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center text-[var(--ink-600)]">
                      {item.authorName || item.authorLoginId || '-'}
                    </td>
                    <td className="px-2 py-2 text-center text-[var(--ink-500)] num">
                      {fmtDate(item.createdAt)}
                    </td>
                    <td className="px-2 py-2 text-right text-[var(--ink-500)] num">
                      {item.viewCount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {!loading && totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {pageNumbers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`h-7 min-w-7 rounded-md border px-2 text-[11.5px] font-semibold ${
                  p === page
                    ? 'border-[#2b7de9] bg-[#2b7de9] text-white'
                    : 'border-[var(--line)] bg-white text-[var(--ink-600)] hover:bg-[#f8fafc]'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div className="min-w-0">
                {detailLoading && !detail ? (
                  <div className="text-[12px] text-[var(--ink-400)]">불러오는 중...</div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {detail && (
                        <span className={`chip border ${categoryChip(detail.category)}`}>
                          {detail.category}
                        </span>
                      )}
                      {detail?.isPinned && (
                        <span className="chip border border-[#fde68a] bg-[#fffbeb] text-[#b45309]">
                          <Pin className="w-3 h-3" />고정
                        </span>
                      )}
                      {detail && !detail.isPublished && (
                        <span className="chip border border-[var(--line)] bg-[#f8fafc] text-[var(--ink-500)]">
                          임시저장
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 truncate text-[15px] font-bold text-[var(--ink-900)]">
                      {detail?.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--ink-400)]">
                      <span>{detail?.authorName || detail?.authorLoginId || '-'}</span>
                      <span>·</span>
                      <span className="num">{detail ? fmtDate(detail.createdAt) : ''}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1 num">
                        <Eye className="w-3 h-3" />
                        {detail?.viewCount ?? 0}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-md p-1 text-[var(--ink-400)] hover:bg-[#f8fafc] hover:text-[var(--ink-900)]"
                title="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                {detail?.content || ''}
              </div>
            </div>

            {isAdmin && detail && (
              <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] px-4 py-2.5">
                <button
                  type="button"
                  onClick={openEdit}
                  className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--ink-700)] hover:bg-[#f8fafc]"
                >
                  <Pencil className="w-3.5 h-3.5" />수정
                </button>
                <button
                  type="button"
                  onClick={() => void deleteNotice(detail.id)}
                  className="flex items-center gap-1 rounded-md border border-[#fecdd3] bg-[#fff1f2] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#be123c] hover:bg-[#ffe4e6]"
                >
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
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h3 className="text-[14px] font-bold text-[var(--ink-900)]">
                {editor.mode === 'create' ? '새 공지 작성' : '공지 수정'}
              </h3>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-md p-1 text-[var(--ink-400)] hover:bg-[#f8fafc] hover:text-[var(--ink-900)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">구분</label>
                  <select
                    value={editor.category}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                    className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2 text-[12px] outline-none focus:border-[#2b7de9]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">제목</label>
                  <input
                    value={editor.title}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                    maxLength={200}
                    placeholder="공지 제목"
                    className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2.5 text-[12px] outline-none focus:border-[#2b7de9]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">본문</label>
                <textarea
                  value={editor.content}
                  onChange={(e) => setEditor((prev) => (prev ? { ...prev, content: e.target.value } : prev))}
                  rows={12}
                  maxLength={20000}
                  placeholder="공지 내용을 입력하세요."
                  className="w-full resize-y rounded-md border border-[var(--line)] bg-white px-2.5 py-2 text-[12px] leading-relaxed outline-none focus:border-[#2b7de9]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ink-700)]">
                  <input
                    type="checkbox"
                    checked={editor.isPinned}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, isPinned: e.target.checked } : prev))}
                  />
                  상단 고정
                </label>
                <label className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ink-700)]">
                  <input
                    type="checkbox"
                    checked={editor.isPublished}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, isPublished: e.target.checked } : prev))}
                  />
                  게시
                </label>
                {editorError && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-[#be123c]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {editorError}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] px-4 py-2.5">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink-600)] hover:bg-[#f8fafc]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void saveNotice()}
                disabled={saving}
                className="rounded-md bg-[#2b7de9] px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#1b6fd6] disabled:opacity-60"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
