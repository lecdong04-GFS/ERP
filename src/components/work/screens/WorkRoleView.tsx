'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  CheckCircle2, ChevronLeft, ChevronRight, Pencil, Plus,
  RefreshCw, Search, Trash2, Users, X,
} from 'lucide-react';

interface RoleItem {
  id: number;
  dutyName: string;
  category: string;
  department: string;
  managerName: string;
  subManagerName: string;
  cycle: string;
  remark: string;
  isUsed: boolean;
  authorId: number | null;
  authorName: string;
  authorLoginId: string;
}

const CATEGORIES = ['생산', '매입', '매출', '재고', '경영', '관리', '기타'] as const;
const CYCLES = ['매일', '주간', '월간', '수시'] as const;

const CATEGORY_META: Record<string, { dot: string; chip: string }> = {
  '생산': { dot: '#2b7de9', chip: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]' },
  '매입': { dot: '#8b5cf6', chip: 'bg-[#f5f3ff] text-[#7c3aed] border-[#ddd6fe]' },
  '매출': { dot: '#059669', chip: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]' },
  '재고': { dot: '#d97706', chip: 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]' },
  '경영': { dot: '#e11d48', chip: 'bg-[#fff1f2] text-[#be123c] border-[#fecdd3]' },
  '관리': { dot: '#0ea5e9', chip: 'bg-[#f0f9ff] text-[#0369a1] border-[#bae6fd]' },
  '기타': { dot: '#64748b', chip: 'bg-[#f8fafc] text-[var(--ink-600)] border-[var(--line)]' },
};

export const WorkRoleView: React.FC = () => {
  const { data: session } = useSession();
  const me = session?.user as any;
  const isAdmin = me?.role === '관리자';
  const myId = Number(me?.id) || 0;

  const [items, setItems] = useState<RoleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('전체');
  const [keyword, setKeyword] = useState('');
  const [usedOnly, setUsedOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formDuty, setFormDuty] = useState('');
  const [formCategory, setFormCategory] = useState<string>('생산');
  const [formDept, setFormDept] = useState('');
  const [formManager, setFormManager] = useState('');
  const [formSub, setFormSub] = useState('');
  const [formCycle, setFormCycle] = useState<string>('매일');
  const [formRemark, setFormRemark] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editItem, setEditItem] = useState<RoleItem | null>(null);
  const [editForm, setEditForm] = useState({ dutyName: '', category: '생산', department: '', managerName: '', subManagerName: '', cycle: '매일', remark: '' });

  const pageSize = 50;

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (categoryFilter !== '전체') params.set('category', categoryFilter);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (usedOnly) params.set('usedOnly', '1');
      const res = await fetch(`/api/work-role?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setItems(json.data.items || []);
        setTotal(json.data.total || 0);
      } else setError(json.error || '업무분장을 불러오지 못했습니다.');
    } catch {
      setError('업무분장을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [page, categoryFilter, keyword, usedOnly]);

  useEffect(() => { void loadList(); }, [loadList]);

  const grouped = useMemo(() => {
    const order = categoryFilter === '전체' ? [...CATEGORIES] : [categoryFilter];
    const map = new Map<string, RoleItem[]>();
    items.forEach((i) => {
      const list = map.get(i.category) || [];
      list.push(i);
      map.set(i.category, list);
    });
    return order
      .map((c) => ({ category: c, list: map.get(c) || [] }))
      .filter((g) => g.list.length > 0);
  }, [items, categoryFilter]);

  const canEdit = (item: RoleItem) => isAdmin || (item.authorId !== null && item.authorId === myId);

  const quickSave = async () => {
    if (formDuty.trim().length < 2) { setFormError('업무명을 2자 이상 입력하세요.'); return; }
    if (!formManager.trim()) { setFormError('정담당자를 입력하세요.'); return; }
    setSaving(true); setFormError(null);
    try {
      const res = await fetch('/api/work-role', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dutyName: formDuty.trim(), category: formCategory, department: formDept.trim(),
          managerName: formManager.trim(), subManagerName: formSub.trim(),
          cycle: formCycle, remark: formRemark.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFormDuty(''); setFormDept(''); setFormManager(''); setFormSub(''); setFormRemark('');
        setFormOpen(false); setPage(1);
        void loadList();
      } else setFormError(json.error || '등록 실패');
    } catch {
      setFormError('등록 중 오류가 발생했습니다.');
    } finally { setSaving(false); }
  };

  const toggleUsed = async (item: RoleItem) => {
    try {
      const res = await fetch(`/api/work-role/${item.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isUsed: !item.isUsed }),
      });
      const json = await res.json();
      if (json.success) void loadList();
      else alert(json.error || '변경 실패');
    } catch {
      alert('변경 중 오류가 발생했습니다.');
    }
  };

  const startEdit = (item: RoleItem) => {
    setEditItem(item);
    setEditForm({
      dutyName: item.dutyName, category: item.category, department: item.department,
      managerName: item.managerName, subManagerName: item.subManagerName || '',
      cycle: item.cycle, remark: item.remark || '',
    });
  };

  const saveEdit = async () => {
    if (!editItem) return;
    if (editForm.dutyName.trim().length < 2) { alert('업무명을 2자 이상 입력하세요.'); return; }
    try {
      const res = await fetch(`/api/work-role/${editItem.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, dutyName: editForm.dutyName.trim() }),
      });
      const json = await res.json();
      if (json.success) { setEditItem(null); void loadList(); }
      else alert(json.error || '수정 실패');
    } catch {
      alert('수정 중 오류가 발생했습니다.');
    }
  };

  const removeItem = async (item: RoleItem) => {
    if (!window.confirm(`'${item.dutyName}' 분장을 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/work-role/${item.id}`, { method: 'DELETE' });
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
        <Users className="w-4 h-4 text-blue-600" />
        <span className="font-bold text-gray-700">업무분장관리</span>
        <span className="text-gray-500">총 <b className="text-blue-700 num">{total}</b>건</span>
        <label className="flex items-center gap-1 text-gray-600 ml-1">
          <input type="checkbox" checked={usedOnly} onChange={(e) => { setUsedOnly(e.target.checked); setPage(1); }} />
          사용중만
        </label>
        <span className="ml-auto" />
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
          <Plus className="w-3.5 h-3.5" />분장 등록
        </button>
      </div>

      {/* 등록 폼 */}
      {formOpen && (
        <div className="bg-white border-b border-gray-300 px-3 py-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text" value={formDuty} onChange={(e) => setFormDuty(e.target.value)}
              placeholder="업무명 (2자 이상)"
              className="flex-1 min-w-[200px] bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
            />
            <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-1 outline-none">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={formCycle} onChange={(e) => setFormCycle(e.target.value)}
              className="bg-white border border-gray-400 px-1.5 py-1 outline-none">
              {CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text" value={formDept} onChange={(e) => setFormDept(e.target.value)}
              placeholder="담당부서"
              className="w-32 bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
            />
            <input
              type="text" value={formManager} onChange={(e) => setFormManager(e.target.value)}
              placeholder="정담당자 *"
              className="w-28 bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
            />
            <input
              type="text" value={formSub} onChange={(e) => setFormSub(e.target.value)}
              placeholder="부담당자"
              className="w-28 bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="text" value={formRemark} onChange={(e) => setFormRemark(e.target.value)}
              placeholder="비고 (인수인계·특이사항 등)"
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
        <div className="flex items-center gap-1">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text" value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            placeholder="업무명 / 담당자 / 비고"
            className="bg-white border border-gray-400 px-2 py-0.5 w-48 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 목록 (분야별 그룹) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {loading ? (
          <div className="py-16 text-center text-gray-400">불러오는 중...</div>
        ) : error ? (
          <div className="py-16 text-center text-rose-600">{error}</div>
        ) : grouped.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-blue-200" />
            등록된 업무분장이 없습니다. 상단 [분장 등록]으로 추가해 보세요.
          </div>
        ) : (
          grouped.map(({ category, list }) => {
            const cm = CATEGORY_META[category] || CATEGORY_META['기타'];
            return (
              <section key={category} className="bg-white border border-gray-300 rounded-md overflow-hidden">
                <header className="px-3 py-1.5 bg-[#f8fafc] border-b border-[var(--line)] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: cm.dot }} />
                  <span className="font-bold text-gray-800">{category}</span>
                  <span className="text-[11px] text-gray-500 num">{list.length}건</span>
                </header>
                <ul className="divide-y divide-[var(--line)]">
                  {list.map((item) => {
                    const editable = canEdit(item);
                    return (
                      <li key={item.id} className={`px-3 py-2 ${item.isUsed ? '' : 'opacity-55 bg-gray-50'}`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-gray-900">{item.dutyName}</span>
                          <span className="chip border border-gray-300 bg-white text-gray-600 num">{item.cycle}</span>
                          {!item.isUsed && <span className="chip border bg-gray-200 text-gray-500">미사용</span>}
                          {item.department && <span className="text-[11px] text-gray-500">{item.department}</span>}
                          {editable && (
                            <span className="ml-auto flex items-center gap-1">
                              <button
                                type="button" onClick={() => void toggleUsed(item)}
                                title={item.isUsed ? '미사용 처리' : '사용 처리'}
                                className="p-1 text-gray-400 hover:text-emerald-600"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
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
                        <div className="mt-0.5 text-[11.5px] text-gray-700">
                          <span className="font-semibold text-blue-900">{item.managerName || '-'}</span>
                          <span className="text-gray-400 text-[10px]"> 정</span>
                          {item.subManagerName && (
                            <>
                              <span className="text-gray-300 mx-1.5">|</span>
                              <span className="text-gray-700">{item.subManagerName}</span>
                              <span className="text-gray-400 text-[10px]"> 부</span>
                            </>
                          )}
                          {item.remark && <span className="text-gray-500 ml-2">· {item.remark}</span>}
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
              <span className="font-bold text-[13px]">업무분장 수정</span>
              <button type="button" onClick={() => setEditItem(null)} className="p-1 text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 space-y-2">
              <input
                type="text" value={editForm.dutyName}
                onChange={(e) => setEditForm({ ...editForm, dutyName: e.target.value })}
                placeholder="업무명" className="w-full bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
              />
              <div className="flex items-center gap-2">
                <select value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="bg-white border border-gray-400 px-1.5 py-1 outline-none">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={editForm.cycle}
                  onChange={(e) => setEditForm({ ...editForm, cycle: e.target.value })}
                  className="bg-white border border-gray-400 px-1.5 py-1 outline-none">
                  {CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="text" value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  placeholder="담당부서" className="flex-1 bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text" value={editForm.managerName}
                  onChange={(e) => setEditForm({ ...editForm, managerName: e.target.value })}
                  placeholder="정담당자" className="flex-1 bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
                />
                <input
                  type="text" value={editForm.subManagerName}
                  onChange={(e) => setEditForm({ ...editForm, subManagerName: e.target.value })}
                  placeholder="부담당자" className="flex-1 bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
                />
              </div>
              <input
                type="text" value={editForm.remark}
                onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                placeholder="비고" className="w-full bg-white border border-gray-400 px-2 py-1 outline-none focus:border-blue-500"
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
