'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminActionBar } from '../common/AdminActionBar';
import {
  ShieldCheck,
  UserCheck,
  Search,
  CheckSquare,
  Square,
  Copy,
  RotateCw,
  Users,
  Lock,
  Unlock,
  KeyRound,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface UserPermItem {
  id?: number;
  userId: number;
  loginId: string;
  userName: string;
  menuId: string;
  menuName: string;
  categoryId: string;
  categoryName: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canExport: boolean;
  seq: number;
}

interface UserSummary {
  id: number;
  loginId: string;
  name: string;
  department: string;
  role: string;
  isActive: boolean;
}

export const UserPermMgmtView: React.FC = () => {
  // 1. 사용자 목록
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [userKeyword, setUserKeyword] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // 2. 권한 매트릭스
  const [perms, setPerms] = useState<UserPermItem[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [menuKeyword, setMenuKeyword] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState('ALL');

  // 3. 복사 모달
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copySourceUserId, setCopySourceUserId] = useState<number | null>(null);

  // 카테고리 접기/펼치기
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  // 1) 사용자 목록 로드
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/user');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: UserSummary[] = json.data.map((u: any) => ({
          id: u.id,
          loginId: u.loginId,
          name: u.name,
          department: u.department || '기획팀',
          role: u.role || '일반',
          isActive: u.isActive !== false,
        }));
        setUsers(mapped);
        if (!selectedUser && mapped.length > 0) {
          setSelectedUser(mapped[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, [selectedUser]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // 2) 선택된 사용자의 전체 메뉴 권한 로드
  const loadPermissions = useCallback(async (userId: number) => {
    setLoadingPerms(true);
    try {
      const res = await fetch(`/api/admin/permission?userId=${userId}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setPerms(json.data);
        setIsDirty(false);
      }
    } catch (err) {
      console.error('Failed to load permissions:', err);
    } finally {
      setLoadingPerms(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUser) {
      void loadPermissions(selectedUser.id);
    }
  }, [selectedUser, loadPermissions]);

  // 필터링된 사용자
  const filteredUsers = useMemo(() => {
    if (!userKeyword.trim()) return users;
    const kw = userKeyword.trim().toLowerCase();
    return users.filter(
      (u) =>
        u.loginId.toLowerCase().includes(kw) ||
        u.name.toLowerCase().includes(kw) ||
        u.department.toLowerCase().includes(kw) ||
        u.role.toLowerCase().includes(kw)
    );
  }, [users, userKeyword]);

  // 카테고리별 그룹핑
  const groupedPerms = useMemo(() => {
    const map = new Map<string, { categoryId: string; categoryName: string; items: UserPermItem[] }>();

    perms.forEach((item) => {
      // 메뉴 검색 필터
      if (menuKeyword.trim()) {
        const kw = menuKeyword.trim().toLowerCase();
        const matches =
          item.menuName.toLowerCase().includes(kw) ||
          item.menuId.toLowerCase().includes(kw) ||
          item.categoryName.toLowerCase().includes(kw);
        if (!matches) return;
      }
      // 카테고리 셀렉트 필터
      if (selectedCatFilter !== 'ALL' && item.categoryId !== selectedCatFilter) {
        return;
      }

      if (!map.has(item.categoryId)) {
        map.set(item.categoryId, {
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          items: [],
        });
      }
      map.get(item.categoryId)!.items.push(item);
    });

    return Array.from(map.values());
  }, [perms, menuKeyword, selectedCatFilter]);

  // 단일 체크박스 토글
  const handleToggleCheck = (menuId: string, field: 'canRead' | 'canWrite' | 'canDelete' | 'canExport') => {
    setPerms((prev) =>
      prev.map((p) => {
        if (p.menuId === menuId) {
          const nextVal = !p[field];
          // 쓰기/삭제가 켜지면 읽기는 자동으로 켜져야 함
          let nextRead = p.canRead;
          if ((field === 'canWrite' || field === 'canDelete') && nextVal) {
            nextRead = true;
          }
          // 읽기가 꺼지면 쓰기/삭제도 자동으로 꺼져야 함
          let nextWrite = p.canWrite;
          let nextDelete = p.canDelete;
          if (field === 'canRead' && !nextVal) {
            nextWrite = false;
            nextDelete = false;
          }

          return {
            ...p,
            [field]: nextVal,
            canRead: field === 'canRead' ? nextVal : nextRead,
            canWrite: field === 'canWrite' ? nextVal : nextWrite,
            canDelete: field === 'canDelete' ? nextVal : nextDelete,
          };
        }
        return p;
      })
    );
    setIsDirty(true);
  };

  // 특정 카테고리 전체 일괄 토글
  const handleToggleCategory = (catId: string, field: 'canRead' | 'canWrite', check: boolean) => {
    setPerms((prev) =>
      prev.map((p) => {
        if (p.categoryId === catId) {
          if (field === 'canRead') {
            return {
              ...p,
              canRead: check,
              canWrite: check ? p.canWrite : false,
              canDelete: check ? p.canDelete : false,
            };
          } else {
            return {
              ...p,
              canWrite: check,
              canRead: check ? true : p.canRead,
            };
          }
        }
        return p;
      })
    );
    setIsDirty(true);
  };

  // 전역 전체 토글 (조회 전체, 저장 전체)
  const handleToggleAllGlobal = (field: 'canRead' | 'canWrite', check: boolean) => {
    setPerms((prev) =>
      prev.map((p) => {
        if (field === 'canRead') {
          return {
            ...p,
            canRead: check,
            canWrite: check ? p.canWrite : false,
            canDelete: check ? p.canDelete : false,
          };
        } else {
          return {
            ...p,
            canWrite: check,
            canRead: check ? true : p.canRead,
          };
        }
      })
    );
    setIsDirty(true);
  };

  // 템플릿 프리셋: 관리자 권한 100% 부여
  const handleApplyAdminPreset = () => {
    if (!confirm(`[${selectedUser?.name}] 사용자에게 시스템 전체 메뉴의 관리자(모든 읽기/쓰기/삭제) 권한을 일괄 부여할까요?`)) return;
    setPerms((prev) =>
      prev.map((p) => ({
        ...p,
        canRead: true,
        canWrite: true,
        canDelete: true,
        canExport: true,
      }))
    );
    setIsDirty(true);
  };

  // 템플릿 프리셋: 일반 실무자 권한 부여 (어드민 제외 전체 쓰기)
  const handleApplyGeneralPreset = () => {
    if (!confirm(`[${selectedUser?.name}] 사용자에게 일반 실무자 권한을 부여할까요? (관리자/원가 제외 실무메뉴 쓰기 허용)`)) return;
    setPerms((prev) =>
      prev.map((p) => {
        const isRestricted = ['admin', 'cost'].includes(p.categoryId);
        return {
          ...p,
          canRead: true,
          canWrite: !isRestricted,
          canDelete: false,
          canExport: true,
        };
      })
    );
    setIsDirty(true);
  };

  // 템플릿 프리셋: 조회 전용 권한 부여
  const handleApplyViewOnlyPreset = () => {
    if (!confirm(`[${selectedUser?.name}] 사용자에게 조회 전용 권한을 부여할까요? (모든 메뉴 쓰기/삭제 차단, 조회만 허용)`)) return;
    setPerms((prev) =>
      prev.map((p) => ({
        ...p,
        canRead: true,
        canWrite: false,
        canDelete: false,
        canExport: true,
      }))
    );
    setIsDirty(true);
  };

  // 권한 복사 실행
  const handleExecuteCopy = async () => {
    if (!selectedUser || !copySourceUserId) return;
    if (copySourceUserId === selectedUser.id) {
      alert('동일한 사용자 간에는 권한을 복사할 수 없습니다.');
      return;
    }
    const source = users.find((u) => u.id === copySourceUserId);

    try {
      const res = await fetch('/api/admin/permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'copy',
          copyFromUserId: copySourceUserId,
          copyToUserId: selectedUser.id,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`✅ [${source?.name || copySourceUserId}] 사용자의 권한이 [${selectedUser.name}] 사용자에게 성공적으로 복사되었습니다!`);
        setIsCopyModalOpen(false);
        void loadPermissions(selectedUser.id);
      } else {
        alert(`복사 실패: ${json.error}`);
      }
    } catch (err: any) {
      alert(`오류 발생: ${err.message}`);
    }
  };

  // 권한 DB 영구 저장
  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          permissions: perms,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`✅ [${selectedUser.name} (${selectedUser.loginId})] 사용자의 메뉴 권한 ${perms.length}건이 데이터베이스에 성공적으로 저장되었습니다!`);
        setIsDirty(false);
        void loadPermissions(selectedUser.id);
      } else {
        alert(`저장 실패: ${json.error || '알 수 없는 오류'}`);
      }
    } catch (err: any) {
      alert(`저장 중 오류 발생: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 카테고리 접기 토글
  const toggleCatCollapse = (catId: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f8fafc] text-[12.5px] select-none">
      {/* 1. Header Action Bar */}
      <AdminActionBar
        title="사용자권한관리"
        buttons={[
          {
            key: 'search',
            label: loadingPerms ? '조회중...' : '조회',
            icon: 'search',
            onClick: () => selectedUser && loadPermissions(selectedUser.id),
          },
          {
            key: 'save',
            label: saving ? '저장중...' : isDirty ? '저장 (수정됨)' : '저장',
            icon: 'save',
            onClick: handleSave,
          },
          {
            key: 'copy',
            label: '권한복사',
            icon: 'copy',
            onClick: () => setIsCopyModalOpen(true),
          },
        ]}
        helpContent="사용자별 ERP 전체 실무 메뉴에 대한 조회(읽기), 저장/수정(쓰기), 삭제, 엑셀 출력 권한을 1:1로 정밀하게 부여합니다. 프리셋 버튼으로 관리자/실무자 권한을 1초 만에 일괄 부여하거나 다른 사용자의 권한을 즉시 복제할 수 있습니다."
      />

      {/* 2. Main 30:70 Split Layout */}
      <div className="flex-1 w-full p-2 bg-[#d8dde5] overflow-hidden flex flex-row gap-2">
        {/* Left: 사용자 선택 목록 (30% 너비) */}
        <div className="w-[30%] min-w-[280px] max-w-[380px] bg-white border border-[#9aa2ad] shadow-sm flex flex-col overflow-hidden">
          {/* List Header */}
          <div className="bg-[#dde3ea] px-3 py-2 border-b border-[#b8c1cc] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 font-bold text-gray-800 text-[12.5px]">
              <Users className="w-4 h-4 text-blue-700" />
              <span>사용자 계정 목록</span>
            </div>
            <span className="text-[11.5px] font-bold text-blue-700 font-mono">
              총 {filteredUsers.length}명
            </span>
          </div>

          {/* User Search Input */}
          <div className="p-2 border-b border-gray-200 bg-slate-50">
            <div className="relative">
              <input
                type="text"
                placeholder="ID / 이름 / 소속부서 검색"
                value={userKeyword}
                onChange={(e) => setUserKeyword(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded px-2.5 py-1 text-[12px] focus:outline-none focus:border-blue-600"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-2 pointer-events-none" />
            </div>
          </div>

          {/* User Scrollable List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredUsers.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              const isAdmin = u.loginId === 'admin' || u.role.includes('관리자');

              return (
                <div
                  key={u.id}
                  onClick={() => {
                    if (isDirty) {
                      if (!confirm('수정 중인 권한이 저장되지 않았습니다. 다른 사용자로 전환하시겠습니까?')) {
                        return;
                      }
                    }
                    setSelectedUser(u);
                  }}
                  className={`p-2.5 cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-50/90 border-l-4 border-l-blue-700 text-blue-900 shadow-2xs font-bold'
                      : 'hover:bg-slate-50 text-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-[12px] shrink-0 ${
                        isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {u.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[12.5px] truncate">{u.name}</span>
                        <span className="font-mono text-[11px] text-gray-500 font-normal">({u.loginId})</span>
                      </div>
                      <div className="text-[11px] text-gray-500 truncate mt-0.5">{u.department}</div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                        isAdmin ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {u.role}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold">
                      {u.isActive ? '🟢 정상' : '🔴 잠김'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: 메뉴권한 매트릭스 (70% 너비) */}
        <div className="flex-1 bg-white border border-[#9aa2ad] shadow-sm flex flex-col overflow-hidden">
          {/* Header Bar */}
          <div className="bg-[#dde3ea] px-3.5 py-2 border-b border-[#b8c1cc] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              <span className="font-extrabold text-gray-900 text-[13.5px]">
                [{selectedUser?.name} ({selectedUser?.loginId})] 님의 ERP 메뉴 접근 권한
              </span>
              <span className="text-gray-500 text-[12px] font-normal">· {selectedUser?.department}</span>
              {isDirty && (
                <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 rounded font-bold text-[11px] animate-pulse">
                  ⚠️ 수정사항 미저장 (상단 [저장] 필요)
                </span>
              )}
            </div>

            {/* Quick Action Presets */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleApplyAdminPreset}
                className="px-2 py-1 bg-purple-50 hover:bg-purple-100 border border-purple-300 text-purple-900 rounded text-[11.5px] font-bold transition-colors flex items-center gap-1"
                title="모든 메뉴 읽기/쓰기/삭제 100% 부여"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>관리자전체</span>
              </button>
              <button
                type="button"
                onClick={handleApplyGeneralPreset}
                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-900 rounded text-[11.5px] font-bold transition-colors"
                title="관리자/원가 제외 실무메뉴 쓰기 허용"
              >
                <span>실무자표준</span>
              </button>
              <button
                type="button"
                onClick={handleApplyViewOnlyPreset}
                className="px-2 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-300 text-gray-700 rounded text-[11.5px] font-semibold transition-colors"
                title="모든 메뉴 쓰기 차단, 조회만 허용"
              >
                <span>조회전용</span>
              </button>
            </div>
          </div>

          {/* Sub Control Filter Bar */}
          <div className="bg-[#f1f5f9] px-3.5 py-1.5 border-b border-gray-300 flex items-center justify-between gap-4 shrink-0 text-[12px]">
            <div className="flex items-center gap-3">
              {/* 대메뉴 분류 필터 */}
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-gray-700">대메뉴:</span>
                <select
                  value={selectedCatFilter}
                  onChange={(e) => setSelectedCatFilter(e.target.value)}
                  className="bg-white border border-gray-300 rounded px-2 py-0.5 text-[11.5px] focus:outline-none focus:border-blue-600 font-semibold"
                >
                  <option value="ALL">전체 대메뉴 (10대 분류)</option>
                  <option value="work">업무관리 (7)</option>
                  <option value="sales">매출관리 (14)</option>
                  <option value="purchase">매입관리 (15)</option>
                  <option value="production">생산관리 (7)</option>
                  <option value="inventory">재고관리 (21)</option>
                  <option value="management">경영현황 (4)</option>
                  <option value="master">기준정보 (12)</option>
                  <option value="cost">원가관리 (4)</option>
                  <option value="admin">관리자전용 (5)</option>
                  <option value="help">도움말 (1)</option>
                </select>
              </div>

              {/* 메뉴 검색 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="메뉴명 / 메뉴ID 검색"
                  value={menuKeyword}
                  onChange={(e) => setMenuKeyword(e.target.value)}
                  className="bg-white border border-gray-300 rounded px-2.5 py-0.5 text-[11.5px] w-48 focus:outline-none focus:border-blue-600"
                />
                <Search className="w-3 h-3 text-gray-400 absolute right-2 top-1.5 pointer-events-none" />
              </div>
            </div>

            {/* 전역 체크박스 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleAllGlobal('canRead', true)}
                className="px-2 py-0.5 bg-white border border-blue-300 text-blue-700 rounded text-[11px] font-bold hover:bg-blue-50"
              >
                조회 전체 켜기
              </button>
              <button
                type="button"
                onClick={() => handleToggleAllGlobal('canRead', false)}
                className="px-2 py-0.5 bg-white border border-gray-300 text-gray-600 rounded text-[11px] hover:bg-gray-100"
              >
                조회 전체 끄기
              </button>
              <div className="w-[1px] h-3.5 bg-gray-300 mx-1" />
              <button
                type="button"
                onClick={() => handleToggleAllGlobal('canWrite', true)}
                className="px-2 py-0.5 bg-white border border-emerald-300 text-emerald-700 rounded text-[11px] font-bold hover:bg-emerald-50"
              >
                저장 전체 켜기
              </button>
              <button
                type="button"
                onClick={() => handleToggleAllGlobal('canWrite', false)}
                className="px-2 py-0.5 bg-white border border-gray-300 text-gray-600 rounded text-[11px] hover:bg-gray-100"
              >
                저장 전체 끄기
              </button>
            </div>
          </div>

          {/* Matrix Grid (Table with Group Headers) */}
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[780px] border-collapse text-[12px] table-fixed">
              <thead className="sticky top-0 z-20 bg-[#c0c7ea] text-gray-900 border-b border-[#9aa2ad] shadow-xs">
                <tr className="h-[30px]">
                  <th className="w-[45px] border-r border-[#a0a8be] text-center font-bold">순번</th>
                  <th className="w-[140px] border-r border-[#a0a8be] text-center font-bold">대메뉴 분류</th>
                  <th className="border-r border-[#a0a8be] text-center font-bold">ERP 세부 메뉴명</th>
                  <th className="w-[150px] border-r border-[#a0a8be] text-center font-bold">고유 메뉴ID</th>
                  <th className="w-[95px] border-r border-[#a0a8be] text-center font-bold bg-[#b5beea]">
                    조회 (읽기)
                  </th>
                  <th className="w-[95px] border-r border-[#a0a8be] text-center font-bold bg-[#b5beea]">
                    저장/수정 (쓰기)
                  </th>
                  <th className="w-[85px] border-r border-[#a0a8be] text-center font-bold">삭제 권한</th>
                  <th className="w-[85px] text-center font-bold">엑셀 출력</th>
                </tr>
              </thead>
              <tbody>
                {groupedPerms.map((group) => {
                  const isCollapsed = collapsedCats.has(group.categoryId);
                  const allCatRead = group.items.every((i) => i.canRead);
                  const allCatWrite = group.items.every((i) => i.canWrite);

                  return (
                    <React.Fragment key={group.categoryId}>
                      {/* Category Header Row */}
                      <tr className="bg-[#e4ebf5] border-b border-t border-gray-300 h-[28px] sticky z-10">
                        <td colSpan={4} className="px-3 font-bold text-gray-800 text-[12px]">
                          <button
                            type="button"
                            onClick={() => toggleCatCollapse(group.categoryId)}
                            className="flex items-center gap-1.5 hover:text-blue-700"
                          >
                            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <span>{group.categoryName}</span>
                            <span className="text-gray-500 font-normal">({group.items.length}개 메뉴)</span>
                          </button>
                        </td>
                        {/* 해당 카테고리 일괄 읽기 체크 */}
                        <td className="px-2 text-center border-r border-gray-300">
                          <label className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-900 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allCatRead}
                              onChange={(e) => handleToggleCategory(group.categoryId, 'canRead', e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
                            />
                            <span>분류전체</span>
                          </label>
                        </td>
                        {/* 해당 카테고리 일괄 쓰기 체크 */}
                        <td className="px-2 text-center border-r border-gray-300">
                          <label className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allCatWrite}
                              onChange={(e) => handleToggleCategory(group.categoryId, 'canWrite', e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer"
                            />
                            <span>분류전체</span>
                          </label>
                        </td>
                        <td colSpan={2} className="bg-transparent" />
                      </tr>

                      {/* Menu Items Rows */}
                      {!isCollapsed &&
                        group.items.map((item, idx) => (
                          <tr
                            key={item.menuId}
                            className="h-[28px] border-b border-gray-200 hover:bg-blue-50/40 transition-colors"
                          >
                            {/* 순번 */}
                            <td className="text-center bg-[#f8fafc] border-r border-gray-200 text-gray-500 font-mono text-[11px]">
                              {item.seq}
                            </td>

                            {/* 대메뉴 분류 */}
                            <td className="px-3 border-r border-gray-200 text-gray-600 font-medium text-[11.5px]">
                              {item.categoryName}
                            </td>

                            {/* 메뉴명 */}
                            <td className="px-3 border-r border-gray-200 font-bold text-gray-900 text-[12px]">
                              {item.menuName}
                            </td>

                            {/* 메뉴ID */}
                            <td className="px-2 border-r border-gray-200 font-mono text-gray-500 text-[11px] truncate">
                              {item.menuId}
                            </td>

                            {/* 조회 (읽기) */}
                            <td className="px-2 border-r border-gray-200 text-center bg-blue-50/20">
                              <input
                                type="checkbox"
                                checked={item.canRead}
                                onChange={() => handleToggleCheck(item.menuId, 'canRead')}
                                className="w-4 h-4 rounded text-blue-600 cursor-pointer focus:ring-0"
                              />
                            </td>

                            {/* 저장/수정 (쓰기) */}
                            <td className="px-2 border-r border-gray-200 text-center bg-emerald-50/20">
                              <input
                                type="checkbox"
                                checked={item.canWrite}
                                onChange={() => handleToggleCheck(item.menuId, 'canWrite')}
                                className="w-4 h-4 rounded text-emerald-600 cursor-pointer focus:ring-0"
                              />
                            </td>

                            {/* 삭제 권한 */}
                            <td className="px-2 border-r border-gray-200 text-center">
                              <input
                                type="checkbox"
                                checked={item.canDelete}
                                onChange={() => handleToggleCheck(item.menuId, 'canDelete')}
                                className="w-4 h-4 rounded text-rose-600 cursor-pointer focus:ring-0"
                              />
                            </td>

                            {/* 엑셀 출력 */}
                            <td className="px-2 text-center">
                              <input
                                type="checkbox"
                                checked={item.canExport}
                                onChange={() => handleToggleCheck(item.menuId, 'canExport')}
                                className="w-4 h-4 rounded text-indigo-600 cursor-pointer focus:ring-0"
                              />
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. 다른 사용자 권한 복사 모달 */}
      {isCopyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-gray-300 w-full max-w-[420px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-5 py-3 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-[13.5px]">
                <Copy className="w-4 h-4 text-blue-200" />
                <span>다른 사용자 권한 복사</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCopyModalOpen(false)}
                className="text-white/80 hover:text-white text-[16px] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3 text-[12.5px]">
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-blue-900 leading-relaxed">
                원본 사용자의 전체 메뉴 권한 설정을 현재 선택된{' '}
                <strong>
                  [{selectedUser?.name} ({selectedUser?.loginId})]
                </strong>{' '}
                사용자에게 그대로 복제합니다.
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1.5">권한을 복사해 올 원본 사용자 선택:</label>
                <select
                  value={copySourceUserId || ''}
                  onChange={(e) => setCopySourceUserId(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded px-2.5 py-2 font-semibold bg-white focus:outline-none focus:border-blue-600"
                >
                  <option value="">-- 복사할 원본 사용자 선택 --</option>
                  {users
                    .filter((u) => u.id !== selectedUser?.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.loginId}) · {u.role} [{u.department}]
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="bg-gray-100 px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCopyModalOpen(false)}
                className="px-4 py-1.5 rounded border border-gray-400 bg-white hover:bg-gray-50 text-gray-700 font-semibold"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleExecuteCopy}
                disabled={!copySourceUserId}
                className="px-5 py-1.5 rounded bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white font-bold shadow-sm"
              >
                권한 복사 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
