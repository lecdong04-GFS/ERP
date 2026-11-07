'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Eye, Pencil,
  Plus, RefreshCw, Search, Trash2, X, Send,
} from 'lucide-react';

interface ContactItem {
  id: number; title: string; contactType: string; receiverName: string;
  status: string; senderId: number | null; senderName: string; senderLoginId: string;
  createdAt: string; updatedAt: string;
}

interface ContactDetail extends ContactItem {
  content: string; response: string; respondedAt: string | null; senderId: number | null;
}

interface EditorState {
  mode: 'create' | 'edit'; id?: number; title: string; content: string;
  contactType: string; receiverName: string;
}

const TYPES = ['요청', '보고', '문의', '전달'];
const STATUSES = ['접수', '진행중', '완료'];

function fmtDate(v: string): string {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v.slice(0, 10);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

function typeChip(t: string): string {
  if (t === '요청') return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
  if (t === '보고') return 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]';
  if (t === '문의') return 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]';
  return 'bg-[#f8fafc] text-[var(--ink-600)] border-[var(--line)]';
}

function statusChip(s: string): string {
  if (s === '완료') return 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]';
  if (s === '진행중') return 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]';
  return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
}

export const ContactView: React.FC = () => {
  const { data: session } = useSession();
  const me = session?.user as any;
  const isAdmin = me?.role === '관리자';
  const myId = Number(me?.id) || 0;

  const [items, setItems] = useState<ContactItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [respondText, setRespondText] = useState('');
  const [respondStatus, setRespondStatus] = useState('진행중');
  const [responding, setResponding] = useState(false);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      if (typeFilter !== '전체') params.set('type', typeFilter);
      if (statusFilter !== '전체') params.set('status', statusFilter);
      const res = await fetch(`/api/work-contact?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setItems(json.data.items || []);
        setTotal(json.data.total || 0);
      } else setError(json.error || '업무연락을 불러오지 못했습니다.');
    } catch (err) {
      console.error('Failed to load contacts:', err);
      setError('업무연락을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [page, search, typeFilter, statusFilter]);

  useEffect(() => { void loadList(); }, [loadList]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/work-contact/${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setDetail(json.data);
        setRespondText(json.data.response || '');
        setRespondStatus(json.data.status || '진행중');
      } else showToast(json.error || '업무연락을 불러오지 못했습니다.');
    } catch { showToast('업무연락을 불러오지 못했습니다.'); }
    finally { setDetailLoading(false); }
  };

  const openCreate = () => {
    setEditorError(null);
    setEditor({ mode: 'create', title: '', content: '', contactType: '요청', receiverName: '' });
  };

  const openEdit = () => {
    if (!detail) return;
    setEditorError(null);
    setEditor({ mode: 'edit', id: detail.id, title: detail.title, content: detail.content, contactType: detail.contactType, receiverName: detail.receiverName });
  };

  const saveContact = async () => {
    if (!editor) return;
    const title = editor.title.trim();
    const content = editor.content.trim();
    if (title.length < 2) { setEditorError('제목은 2자 이상 입력하세요.'); return; }
    if (!content) { setEditorError('내용을 입력하세요.'); return; }
    setSaving(true); setEditorError(null);
    try {
      const res = await fetch(editor.mode === 'create' ? '/api/work-contact' : `/api/work-contact/${editor.id}`, {
        method: editor.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, contactType: editor.contactType, receiverName: editor.receiverName }),
      });
      const json = await res.json();
      if (!json.success) { setEditorError(json.error || '저장에 실패했습니다.'); return; }
      setEditor(null);
      showToast(editor.mode === 'create' ? '업무연락이 등록되었습니다.' : '업무연락이 수정되었습니다.');
      await loadList();
    } catch { setEditorError('저장에 실패했습니다.'); }
    finally { setSaving(false); }
  };

  const respondContact = async () => {
    if (!detail) return;
    setResponding(true);
    try {
      const res = await fetch(`/api/work-contact/${detail.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: respondText, status: respondStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setDetail({ ...detail, response: respondText, status: respondStatus, respondedAt: new Date().toISOString() });
        showToast('처리가 완료되었습니다.');
        await loadList();
      } else showToast(json.error || '처리에 실패했습니다.');
    } catch { showToast('처리에 실패했습니다.'); }
    finally { setResponding(false); }
  };

  const deleteContact = async (id: number) => {
    if (!window.confirm('이 업무연락을 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/work-contact/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { setDetail(null); showToast('삭제되었습니다.'); await loadList(); }
      else showToast(json.error || '삭제에 실패했습니다.');
    } catch { showToast('삭제에 실패했습니다.'); }
  };

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    for (let p = start; p <= end; p += 1) pages.push(p);
    return pages;
  }, [page, totalPages]);

  const canEdit = (item: ContactItem) => isAdmin || item.senderId === myId;

  return (
    <div className="flex flex-col w-full h-full bg-[var(--canvas)] overflow-hidden">
      {toast && (
        <div className="fixed top-14 right-6 z-[300] flex items-center gap-2 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2 text-[11.5px] font-semibold text-[#047857] shadow-lg">
          <CheckCircle2 className="w-4 h-4" />{toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--line)] bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-4 rounded-full bg-[#2b7de9]" />
          <h2 className="text-[13.5px] font-bold text-[var(--ink-900)]">업무연락 및 지침</h2>
          <span className="chip bg-[#f8fafc] text-[var(--ink-600)] border border-[var(--line)] num">{total}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput.trim()); }} className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ink-400)]" />
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="제목/내용/받는곳 검색"
                className="h-7 w-[180px] rounded-md border border-[var(--line)] bg-white pl-7 pr-2 text-[11.5px] outline-none focus:border-[#2b7de9]" />
            </div>
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
            <button type="submit" className="flex h-7 items-center gap-1 rounded-md bg-[#2b7de9] px-2.5 text-[11.5px] font-semibold text-white hover:bg-[#1b6fd6]">
              <Search className="w-3.5 h-3.5" />조회
            </button>
          </form>
          <button type="button" onClick={() => void loadList()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] hover:bg-[#f8fafc]" title="새로고침">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={openCreate}
            className="flex h-7 items-center gap-1 rounded-md bg-[#0f172a] px-2.5 text-[11.5px] font-semibold text-white hover:bg-[#1e293b]">
            <Plus className="w-3.5 h-3.5" />새 연락
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-3.5 mt-2.5 flex items-center gap-2 rounded-md border border-[#fecdd3] bg-[#fff1f2] px-3 py-2 text-[11.5px] text-[#9f1239]">
          <AlertTriangle className="w-4 h-4" />{error}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3.5">
        <div className="erp-card overflow-hidden">
          <table className="w-full border-collapse text-[11.5px]">
            <thead className="bg-[#eef2f7] text-[var(--ink-700)]">
              <tr>
                <th className="w-12 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">No</th>
                <th className="w-16 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">구분</th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-left font-semibold">제목</th>
                <th className="w-24 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">보낸사람</th>
                <th className="w-28 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">받는곳</th>
                <th className="w-16 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">상태</th>
                <th className="w-36 border-b border-[var(--line)] px-2 py-2 text-center font-semibold">등록일</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-[var(--ink-400)]">불러오는 중...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-[var(--ink-400)]">
                    <div className="text-[12px]">등록된 업무연락이 없습니다.</div>
                    <button type="button" onClick={openCreate}
                      className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[var(--ink-700)] hover:bg-[#f8fafc]">
                      <Plus className="w-3.5 h-3.5" />첫 연락 등록
                    </button>
                  </div>
                </td></tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id} onClick={() => void openDetail(item.id)}
                    className="cursor-pointer border-b border-[var(--line)] last:border-b-0 hover:bg-[#f8fafc]">
                    <td className="px-2 py-2 text-center text-[var(--ink-400)] num">{total - (page - 1) * pageSize - index}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`chip border ${typeChip(item.contactType)}`}>{item.contactType}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="truncate font-medium text-[var(--ink-900)]">{item.title}</span>
                    </td>
                    <td className="px-2 py-2 text-center text-[var(--ink-600)]">
                      {item.senderName || item.senderLoginId || '-'}
                    </td>
                    <td className="px-2 py-2 text-center text-[var(--ink-600)]">{item.receiverName || '-'}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`chip border ${statusChip(item.status)}`}>{item.status}</span>
                    </td>
                    <td className="px-2 py-2 text-center text-[var(--ink-500)] num">{fmtDate(item.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] disabled:opacity-40">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {pageNumbers.map((p) => (
              <button key={p} type="button" onClick={() => setPage(p)}
                className={`h-7 min-w-7 rounded-md border px-2 text-[11.5px] font-semibold ${
                  p === page ? 'border-[#2b7de9] bg-[#2b7de9] text-white' : 'border-[var(--line)] bg-white text-[var(--ink-600)] hover:bg-[#f8fafc]'
                }`}>{p}</button>
            ))}
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-600)] disabled:opacity-40">
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
                      {detail && <span className={`chip border ${typeChip(detail.contactType)}`}>{detail.contactType}</span>}
                      {detail && <span className={`chip border ${statusChip(detail.status)}`}>{detail.status}</span>}
                    </div>
                    <h3 className="mt-1.5 truncate text-[15px] font-bold text-[var(--ink-900)]">{detail?.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--ink-400)]">
                      <span>보낸사람: {detail?.senderName || detail?.senderLoginId || '-'}</span>
                      <span>·</span>
                      <span>받는곳: {detail?.receiverName || '-'}</span>
                      <span>·</span>
                      <span className="num">{detail ? fmtDate(detail.createdAt) : ''}</span>
                    </div>
                  </>
                )}
              </div>
              <button type="button" onClick={() => setDetail(null)}
                className="rounded-md p-1 text-[var(--ink-400)] hover:bg-[#f8fafc] hover:text-[var(--ink-900)]" title="닫기">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                {detail?.content || ''}
              </div>

              {detail?.response && (
                <div className="mt-4 rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10.5px] font-bold text-[#1d4ed8]">처리내용</span>
                    <span className="num text-[9.5px] text-[var(--ink-400)]">
                      {detail.respondedAt ? fmtDate(detail.respondedAt) : ''}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-[11.5px] text-[var(--ink-700)]">{detail.response}</div>
                </div>
              )}
            </div>

            {/* 관리자 응답 폼 */}
            {isAdmin && detail && (
              <div className="border-t border-[var(--line)] px-4 py-2.5 bg-[#fbfcfe]">
                <div className="mb-1.5 flex items-center gap-2">
                  <label className="text-[10.5px] font-bold text-[var(--ink-600)]">처리</label>
                  <select value={respondStatus} onChange={(e) => setRespondStatus(e.target.value)}
                    className="h-6.5 rounded border border-[var(--line)] bg-white px-1.5 text-[11px] outline-none">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-1.5">
                  <textarea value={respondText} onChange={(e) => setRespondText(e.target.value)} rows={2}
                    placeholder="처리 내용을 입력하세요."
                    className="flex-1 resize-none rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11.5px] outline-none focus:border-[#2b7de9]" />
                  <button type="button" onClick={() => void respondContact()} disabled={responding || !respondText.trim()}
                    className="flex items-center gap-1 rounded-md bg-[#2b7de9] px-3 py-2 text-[11.5px] font-semibold text-white hover:bg-[#1b6fd6] disabled:opacity-50">
                    <Send className="w-3.5 h-3.5" />{responding ? '...' : '처리'}
                  </button>
                </div>
              </div>
            )}

            {detail && canEdit({ ...detail, senderId: detail.senderId }) && (
              <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] px-4 py-2.5">
                <button type="button" onClick={openEdit}
                  className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--ink-700)] hover:bg-[#f8fafc]">
                  <Pencil className="w-3.5 h-3.5" />수정
                </button>
                <button type="button" onClick={() => void deleteContact(detail.id)}
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
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <h3 className="text-[14px] font-bold text-[var(--ink-900)]">
                {editor.mode === 'create' ? '새 업무연락' : '업무연락 수정'}
              </h3>
              <button type="button" onClick={() => setEditor(null)}
                className="rounded-md p-1 text-[var(--ink-400)] hover:bg-[#f8fafc] hover:text-[var(--ink-900)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">구분</label>
                  <select value={editor.contactType} onChange={(e) => setEditor((prev) => (prev ? { ...prev, contactType: e.target.value } : prev))}
                    className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2 text-[12px] outline-none focus:border-[#2b7de9]">
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">받는곳</label>
                  <input value={editor.receiverName}
                    onChange={(e) => setEditor((prev) => (prev ? { ...prev, receiverName: e.target.value } : prev))}
                    maxLength={100} placeholder="예: 생산팀, 정보전산팀, 김과장"
                    className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2.5 text-[12px] outline-none focus:border-[#2b7de9]" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">제목</label>
                <input value={editor.title} onChange={(e) => setEditor((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  maxLength={200} placeholder="업무연락 제목"
                  className="h-8 w-full rounded-md border border-[var(--line)] bg-white px-2.5 text-[12px] outline-none focus:border-[#2b7de9]" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-600)]">내용</label>
                <textarea value={editor.content} onChange={(e) => setEditor((prev) => (prev ? { ...prev, content: e.target.value } : prev))}
                  rows={10} maxLength={20000} placeholder="업무연락 내용을 입력하세요."
                  className="w-full resize-y rounded-md border border-[var(--line)] bg-white px-2.5 py-2 text-[12px] leading-relaxed outline-none focus:border-[#2b7de9]" />
              </div>
              {editorError && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[#be123c]">
                  <AlertTriangle className="w-3.5 h-3.5" />{editorError}
                </span>
              )}
            </div>
            <div className="flex items-center justify-end gap-1.5 border-t border-[var(--line)] px-4 py-2.5">
              <button type="button" onClick={() => setEditor(null)}
                className="rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink-600)] hover:bg-[#f8fafc]">취소</button>
              <button type="button" onClick={() => void saveContact()} disabled={saving}
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
