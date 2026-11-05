'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminActionBar } from '../common/AdminActionBar';
import { AdminUserItem } from '../data/adminData';
import {
  RotateCw,
  Search,
  KeyRound,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Users,
  Building,
  UserCog,
} from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';

const ROLE_OPTIONS = ['시스템관리자', '중간관리자', '일반사용자', '조회전용'];
const DEPT_OPTIONS = [
  '기획팀',
  '생산관리팀',
  '품질관리팀',
  '영업관리팀',
  '자재물류팀',
  '전산실',
  '경영지원팀',
  '(주)GFS',
];

export const UserRegView: React.FC = () => {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Dirty tracking for batch table save
  const [dirtyUserIds, setDirtyUserIds] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'NEW' | 'MODIFY'>('NEW');
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [formLoginId, setFormLoginId] = useState('');
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formConfirmPw, setFormConfirmPw] = useState('');
  const [formDept, setFormDept] = useState('기획팀');
  const [formPosition, setFormPosition] = useState('');
  const [formTel, setFormTel] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState('일반사용자');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formRemark, setFormRemark] = useState('');

  // 1. DB에서 사용자 목록 조회
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/user');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: AdminUserItem[] = json.data.map((u: any, idx: number) => {
          let roleName = '일반사용자';
          let permLevel = '03';
          if (u.role === '관리자' || u.role === '시스템관리자' || u.loginId === 'admin') {
            roleName = '시스템관리자';
            permLevel = '00';
          } else if (u.role === '중간관리자' || u.role === '생산') {
            roleName = '중간관리자';
            permLevel = '02';
          } else if (u.role === '조회전용') {
            roleName = '조회전용';
            permLevel = '04';
          }

          return {
            id: u.id || idx + 1,
            company: '(주)GFS',
            userId: u.loginId,
            userName: u.name,
            permLevel,
            levelName: roleName,
            department: u.department || '기획팀',
            phone: u.tel || '',
            email: u.email || '',
            status: u.isActive ? '정상' : '잠김',
            lastLogin: u.lastLoginAt ? u.lastLoginAt.slice(0, 19).replace('T', ' ') : '-',
            empNo: u.position || '',
            used: u.isActive !== false,
            remark: u.remark || '',
          };
        });
        setUsers(mapped);
        setDirtyUserIds(new Set());
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // 2. 필터링된 사용자 목록
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (deptFilter !== 'ALL' && u.department !== deptFilter) return false;
      if (roleFilter !== 'ALL' && u.levelName !== roleFilter) return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (!keyword.trim()) return true;
      const kw = keyword.trim().toLowerCase();
      return (
        u.userId.toLowerCase().includes(kw) ||
        u.userName.toLowerCase().includes(kw) ||
        u.department.toLowerCase().includes(kw) ||
        (u.phone && u.phone.includes(kw)) ||
        (u.email && u.email.toLowerCase().includes(kw))
      );
    });
  }, [users, keyword, deptFilter, roleFilter, statusFilter]);

  // 통계 집계
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === '정상').length;
    const locked = users.filter((u) => u.status === '잠김').length;
    const adminCount = users.filter((u) => u.levelName.includes('관리자')).length;
    return { total, active, locked, adminCount };
  }, [users]);

  // 3. 모달 열기: 신규 등록
  const handleOpenNew = () => {
    setModalMode('NEW');
    setTargetUserId('');
    setFormLoginId('');
    setFormName('');
    setFormPassword('');
    setFormConfirmPw('');
    setFormDept('기획팀');
    setFormPosition('');
    setFormTel('');
    setFormEmail('');
    setFormRole('일반사용자');
    setFormIsActive(true);
    setFormRemark('');
    setIsModalOpen(true);
  };

  // 4. 모달 열기: 수정
  const handleOpenEdit = (user: AdminUserItem) => {
    setModalMode('MODIFY');
    setTargetUserId(user.userId);
    setFormLoginId(user.userId);
    setFormName(user.userName);
    setFormPassword('');
    setFormConfirmPw('');
    setFormDept(user.department || '기획팀');
    setFormPosition(user.empNo || '');
    setFormTel(user.phone || '');
    setFormEmail(user.email || '');
    setFormRole(user.levelName || '일반사용자');
    setFormIsActive(user.status === '정상');
    setFormRemark(user.remark || '');
    setIsModalOpen(true);
  };

  // 5. 모달 제출 (신규 등록 or 수정)
  const handleSaveModal = async () => {
    if (!formLoginId.trim()) {
      alert('사용자 아이디(ID)를 입력해주세요.');
      return;
    }
    if (!formName.trim()) {
      alert('사용자 이름을 입력해주세요.');
      return;
    }
    if (modalMode === 'NEW' && !formPassword.trim()) {
      alert('신규 등록 시 비밀번호를 입력해주세요.');
      return;
    }
    if (formPassword && formPassword !== formConfirmPw) {
      alert('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    try {
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: formLoginId.trim(),
          name: formName.trim(),
          password: formPassword.trim() || undefined,
          department: formDept,
          position: formPosition.trim(),
          tel: formTel.trim(),
          email: formEmail.trim(),
          role: formRole.includes('관리자') ? '관리자' : '일반',
          isActive: formIsActive,
          remark: formRemark.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(`저장 실패: ${json.error || '알 수 없는 오류'}`);
        return;
      }

      alert(
        modalMode === 'NEW'
          ? `신규 사용자 [${formLoginId}]가 성공적으로 등록되었습니다.`
          : `사용자 [${formLoginId}] 정보가 성공적으로 수정되었습니다.`
      );
      setIsModalOpen(false);
      void loadUsers();
    } catch (err: any) {
      console.error(err);
      alert(`오류 발생: ${err.message}`);
    }
  };

  // 6. 인라인 셀 편집 핸들러
  const handleCellChange = (userId: string, field: keyof AdminUserItem, val: any) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.userId === userId) {
          return { ...u, [field]: val };
        }
        return u;
      })
    );
    setDirtyUserIds((prev) => new Set(prev).add(userId));
  };

  // 7. 계정 잠금 / 활성화 1클릭 토글
  const handleToggleStatus = async (user: AdminUserItem) => {
    if (user.userId === 'admin') {
      alert('최고관리자(admin) 계정은 잠금 처리할 수 없습니다.');
      return;
    }
    const nextStatus = user.status === '정상' ? '잠김' : '정상';
    const nextActive = nextStatus === '정상';

    try {
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: user.userId,
          name: user.userName,
          isActive: nextActive,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setUsers((prev) =>
          prev.map((u) => (u.userId === user.userId ? { ...u, status: nextStatus, used: nextActive } : u))
        );
      }
    } catch (err) {
      console.error('Failed to toggle user status:', err);
    }
  };

  // 8. 비밀번호 초기화
  const handleResetPassword = async (user: AdminUserItem) => {
    const inputPw = prompt(
      `[${user.userId} : ${user.userName}] 사용자의 새 비밀번호를 입력하세요.\n(비워두고 확인을 누르면 'password123!' 로 자동 초기화됩니다):`,
      'password123!'
    );
    if (inputPw === null) return;

    try {
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_password',
          loginId: user.userId,
          newPassword: inputPw.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(json.message);
        void loadUsers();
      } else {
        alert(`비밀번호 초기화 실패: ${json.error}`);
      }
    } catch (err: any) {
      alert(`오류 발생: ${err.message}`);
    }
  };

  // 9. 사용자 삭제
  const handleDeleteUser = async (user: AdminUserItem) => {
    if (user.userId === 'admin' || user.id === 1) {
      alert('최고관리자(admin) 계정은 시스템 보호를 위해 삭제할 수 없습니다.');
      return;
    }
    if (
      !confirm(
        `⚠️ 경고: [${user.userId} : ${user.userName}] 사용자를 정말 삭제하시겠습니까?\n(해당 사용자의 모든 접근 권한 및 이력이 함께 정리됩니다.)`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/user?loginId=${encodeURIComponent(user.userId)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        alert(`사용자 [${user.userId}] 계정이 안전하게 삭제되었습니다.`);
        void loadUsers();
      } else {
        alert(`삭제 실패: ${json.error}`);
      }
    } catch (err: any) {
      alert(`오류 발생: ${err.message}`);
    }
  };

  // 10. 테이블 일괄 저장 (DB 영구 보관)
  const handleSave = async () => {
    if (dirtyUserIds.size === 0) {
      alert('수정된 사용자 내역이 없습니다.');
      return;
    }

    setSaving(true);
    try {
      const dirtyList = users.filter((u) => dirtyUserIds.has(u.userId));
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: dirtyList.map((u) => ({
            loginId: u.userId,
            name: u.userName,
            department: u.department,
            position: u.empNo,
            tel: u.phone,
            email: u.email,
            role: u.levelName,
            status: u.status,
            remark: u.remark,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`✅ 총 ${json.count || dirtyList.length}명의 사용자 정보가 데이터베이스에 성공적으로 저장되었습니다!`);
        setDirtyUserIds(new Set());
        void loadUsers();
      } else {
        alert(`저장 실패: ${json.error || '알 수 없는 오류'}`);
      }
    } catch (err: any) {
      alert(`저장 중 오류 발생: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f8fafc] text-[12.5px] select-none">
      {/* 1. Header Action Bar */}
      <AdminActionBar
        title="사용자등록/수정"
        buttons={[
          { key: 'new', label: '신규등록', icon: 'new', onClick: handleOpenNew },
          { key: 'search', label: loading ? '조회중...' : '조회', icon: 'search', onClick: loadUsers },
          {
            key: 'save',
            label: saving ? '저장중...' : dirtyUserIds.size > 0 ? `저장 (${dirtyUserIds.size}건)` : '저장',
            icon: 'save',
            onClick: handleSave,
          },
          {
            key: 'download',
            label: '엑셀다운로드',
            icon: 'download',
            onClick: () =>
              exportGridToExcel({
                filename: `GFS_사용자마스터_${new Date().toISOString().slice(0, 10)}`,
                sheetName: '사용자계정목록',
                columns: [
                  { key: 'userId', label: '사용자ID' },
                  { key: 'userName', label: '성명' },
                  { key: 'department', label: '소속부서' },
                  { key: 'empNo', label: '직급' },
                  { key: 'levelName', label: '권한등급' },
                  { key: 'phone', label: '연락처' },
                  { key: 'email', label: '이메일' },
                  { key: 'status', label: '계정상태' },
                  { key: 'lastLogin', label: '최근접속일시', format: 'date' },
                  { key: 'remark', label: '비고' },
                ],
                data: filteredUsers,
              }),
          },
        ]}
        helpContent="ERP 시스템에 접속 가능한 사용자 계정, 소속 부서, 권한 등급, 계정 활성화 상태를 통합 관리합니다. 신규등록 버튼으로 새 계정을 생성하거나, 표에서 직접 수정 후 [저장]을 눌러 DB에 영구 반영할 수 있습니다."
      />

      {/* 2. Top Summary KPI Cards */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-md">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-gray-600 font-semibold">총 계정:</span>
            <span className="font-extrabold text-blue-700 text-[13px]">{stats.total}명</span>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-md">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-emerald-800 font-semibold">정상 사용:</span>
            <span className="font-extrabold text-emerald-700 text-[13px]">{stats.active}명</span>
          </div>
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1 rounded-md">
            <XCircle className="w-4 h-4 text-rose-600" />
            <span className="text-rose-800 font-semibold">잠김/비활성:</span>
            <span className="font-extrabold text-rose-700 text-[13px]">{stats.locked}명</span>
          </div>
          <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 px-3 py-1 rounded-md">
            <ShieldCheck className="w-4 h-4 text-purple-600" />
            <span className="text-purple-800 font-semibold">관리자 권한:</span>
            <span className="font-extrabold text-purple-700 text-[13px]">{stats.adminCount}명</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11.5px] text-gray-500">
          <span>* 테이블 셀 직접 수정 후 상단 <b>[저장]</b> 클릭 시 DB 일괄 반영</span>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div className="bg-[#e9edf3] border-b border-[#b0b8c2] px-3.5 py-1.5 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 소속부서 필터 */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-700 text-[12px]">소속부서:</span>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="bg-white border border-gray-300 rounded px-2 py-0.5 text-[12px] focus:outline-none focus:border-blue-600"
            >
              <option value="ALL">전체 부서</option>
              {DEPT_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* 권한등급 필터 */}
          <div className="flex items-center gap-1.5 ml-2">
            <span className="font-bold text-gray-700 text-[12px]">권한등급:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white border border-gray-300 rounded px-2 py-0.5 text-[12px] focus:outline-none focus:border-blue-600"
            >
              <option value="ALL">전체 권한</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* 계정상태 필터 */}
          <div className="flex items-center gap-1.5 ml-2">
            <span className="font-bold text-gray-700 text-[12px]">상태:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-gray-300 rounded px-2 py-0.5 text-[12px] focus:outline-none focus:border-blue-600"
            >
              <option value="ALL">전체 상태</option>
              <option value="정상">정상 (활성)</option>
              <option value="잠김">잠김 (비활성)</option>
            </select>
          </div>

          {/* 통합 검색창 */}
          <div className="relative ml-2">
            <input
              type="text"
              placeholder="ID / 이름 / 연락처 / 이메일 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="bg-white border border-gray-400 rounded px-2.5 py-0.5 text-[12px] w-64 focus:outline-none focus:border-blue-600"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1.5 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-600 font-semibold">
            조회결과: <strong className="text-blue-700">{filteredUsers.length}</strong>건
          </span>
          <button
            type="button"
            onClick={loadUsers}
            title="새로고침"
            className="p-1 text-gray-600 hover:text-black rounded hover:bg-gray-200 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4. Main Data Grid (Edge-to-Edge 100% Full Width) */}
      <div className="flex-1 w-full bg-white overflow-auto flex flex-col">
        <table className="w-full min-w-[1280px] border-collapse text-[12px] table-fixed">
          <thead className="sticky top-0 z-20 bg-[#c0c7ea] text-gray-900 border-b border-[#9aa2ad] shadow-xs">
            <tr className="h-[30px]">
              <th className="w-[42px] border-r border-[#a0a8be] text-center font-bold">순번</th>
              <th className="w-[100px] border-r border-[#a0a8be] text-center font-bold">사용자ID</th>
              <th className="w-[110px] border-r border-[#a0a8be] text-center font-bold">성명</th>
              <th className="w-[130px] border-r border-[#a0a8be] text-center font-bold">소속부서</th>
              <th className="w-[85px] border-r border-[#a0a8be] text-center font-bold">직급</th>
              <th className="w-[125px] border-r border-[#a0a8be] text-center font-bold">연락처</th>
              <th className="w-[160px] border-r border-[#a0a8be] text-center font-bold">이메일</th>
              <th className="w-[115px] border-r border-[#a0a8be] text-center font-bold">권한등급</th>
              <th className="w-[85px] border-r border-[#a0a8be] text-center font-bold">계정상태</th>
              <th className="w-[140px] border-r border-[#a0a8be] text-center font-bold">최근접속일시</th>
              <th className="border-r border-[#a0a8be] text-center font-bold">비고</th>
              <th className="w-[155px] text-center font-bold">관리작업</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-12 text-gray-400">
                  {loading ? '사용자 목록을 불러오는 중입니다...' : '검색 조건에 일치하는 사용자가 없습니다.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u, idx) => {
                const isDirty = dirtyUserIds.has(u.userId);
                const isLocked = u.status === '잠김';
                const isAdmin = u.userId === 'admin' || u.levelName.includes('시스템관리자');

                return (
                  <tr
                    key={u.userId}
                    className={`h-[30px] border-b border-gray-200 transition-colors ${
                      isDirty ? 'bg-amber-50/80' : isLocked ? 'bg-gray-100 text-gray-400' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    {/* 순번 */}
                    <td className="text-center bg-[#f8fafc] border-r border-gray-200 text-gray-500 font-mono text-[11px]">
                      {idx + 1}
                    </td>

                    {/* 사용자ID */}
                    <td className="px-2.5 border-r border-gray-200 font-mono font-bold text-blue-900 text-[12px] truncate">
                      {u.userId}
                    </td>

                    {/* 성명 (인라인 수정 가능) */}
                    <td className="px-1 border-r border-gray-200 font-semibold text-gray-900">
                      <input
                        type="text"
                        value={u.userName}
                        onChange={(e) => handleCellChange(u.userId, 'userName', e.target.value)}
                        className="w-full px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white bg-transparent outline-none font-semibold text-gray-900"
                      />
                    </td>

                    {/* 소속부서 */}
                    <td className="px-1 border-r border-gray-200">
                      <select
                        value={u.department}
                        onChange={(e) => handleCellChange(u.userId, 'department', e.target.value)}
                        className="w-full px-1 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white bg-transparent outline-none text-gray-800 text-[11.5px]"
                      >
                        {DEPT_OPTIONS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* 직급 */}
                    <td className="px-1 border-r border-gray-200 text-center">
                      <input
                        type="text"
                        value={u.empNo || ''}
                        placeholder="직급"
                        onChange={(e) => handleCellChange(u.userId, 'empNo', e.target.value)}
                        className="w-full text-center px-1 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white bg-transparent outline-none text-gray-700 text-[11.5px]"
                      />
                    </td>

                    {/* 연락처 */}
                    <td className="px-1 border-r border-gray-200 font-mono text-[11.5px]">
                      <input
                        type="text"
                        value={u.phone || ''}
                        placeholder="010-0000-0000"
                        onChange={(e) => handleCellChange(u.userId, 'phone', e.target.value)}
                        className="w-full px-1 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white bg-transparent outline-none text-gray-800 font-mono"
                      />
                    </td>

                    {/* 이메일 */}
                    <td className="px-1 border-r border-gray-200 text-[11.5px]">
                      <input
                        type="email"
                        value={u.email || ''}
                        placeholder="email@gfs.co.kr"
                        onChange={(e) => handleCellChange(u.userId, 'email', e.target.value)}
                        className="w-full px-1 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white bg-transparent outline-none text-gray-800"
                      />
                    </td>

                    {/* 권한등급 */}
                    <td className="px-1 border-r border-gray-200 text-center">
                      <select
                        value={u.levelName}
                        disabled={u.userId === 'admin'}
                        onChange={(e) => handleCellChange(u.userId, 'levelName', e.target.value)}
                        className={`w-full px-1 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white bg-transparent outline-none font-bold text-[11.5px] ${
                          isAdmin ? 'text-purple-700' : 'text-gray-800'
                        }`}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* 계정상태 (1클릭 토글) */}
                    <td className="px-2 border-r border-gray-200 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u)}
                        disabled={u.userId === 'admin'}
                        title={u.userId === 'admin' ? '최고관리자는 잠금 불가' : '클릭하여 상태 전환'}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold cursor-pointer transition-all ${
                          u.status === '정상'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                        }`}
                      >
                        {u.status === '정상' ? '🟢 정상' : '🔴 잠김'}
                      </button>
                    </td>

                    {/* 최근접속일시 */}
                    <td className="px-2 border-r border-gray-200 text-center font-mono text-[11px] text-gray-500">
                      {u.lastLogin}
                    </td>

                    {/* 비고 */}
                    <td className="px-1 border-r border-gray-200 text-[11.5px]">
                      <input
                        type="text"
                        value={u.remark || ''}
                        placeholder="메모/비고"
                        onChange={(e) => handleCellChange(u.userId, 'remark', e.target.value)}
                        className="w-full px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white bg-transparent outline-none text-gray-700"
                      />
                    </td>

                    {/* 관리작업 버튼들 */}
                    <td className="px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(u)}
                          title="상세 수정"
                          className="px-1.5 py-0.5 bg-white border border-gray-300 hover:bg-gray-100 rounded text-[11px] text-gray-700 flex items-center gap-0.5"
                        >
                          <Edit2 className="w-3 h-3 text-blue-600" />
                          <span>수정</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(u)}
                          title="비밀번호 초기화"
                          className="p-1 bg-white border border-gray-300 hover:bg-amber-50 rounded text-amber-700"
                        >
                          <KeyRound className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          disabled={u.userId === 'admin'}
                          title={u.userId === 'admin' ? '최고관리자 삭제 불가' : '계정 삭제'}
                          className={`p-1 bg-white border rounded ${
                            u.userId === 'admin'
                              ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                              : 'border-gray-300 hover:bg-rose-50 text-rose-600'
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. 사용자 등록 / 수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-gray-300 w-full max-w-[540px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-5 py-3 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-[14px]">
                <UserCog className="w-5 h-5 text-blue-200" />
                <span>{modalMode === 'NEW' ? '신규 사용자 계정 등록' : `사용자 정보 수정 [${formLoginId}]`}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white text-[16px] font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-3.5 text-[12.5px] max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                {/* 사용자 ID */}
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    사용자 ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={modalMode === 'MODIFY'}
                    value={formLoginId}
                    onChange={(e) => setFormLoginId(e.target.value)}
                    placeholder="예: hong123"
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none font-mono disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>

                {/* 성명 */}
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    사용자 성명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="예: 홍길동"
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none font-semibold"
                  />
                </div>
              </div>

              {/* 비밀번호 영역 */}
              <div className="bg-slate-50 border border-slate-200 rounded p-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    {modalMode === 'NEW' ? '비밀번호' : '새 비밀번호 (변경 시에만 입력)'}
                    {modalMode === 'NEW' && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={modalMode === 'NEW' ? '초기 비밀번호' : '미입력 시 기존유지'}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">비밀번호 확인</label>
                  <input
                    type="password"
                    value={formConfirmPw}
                    onChange={(e) => setFormConfirmPw(e.target.value)}
                    placeholder="비밀번호 재입력"
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none bg-white font-mono"
                  />
                </div>
              </div>

              {/* 소속 부서 & 직급 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">소속 부서</label>
                  <select
                    value={formDept}
                    onChange={(e) => setFormDept(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none bg-white"
                  >
                    {DEPT_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">직급</label>
                  <input
                    type="text"
                    value={formPosition}
                    onChange={(e) => setFormPosition(e.target.value)}
                    placeholder="예: 과장, 대리, 팀장"
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* 연락처 & 이메일 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">휴대폰 / 연락처</label>
                  <input
                    type="text"
                    value={formTel}
                    onChange={(e) => setFormTel(e.target.value)}
                    placeholder="010-1234-5678"
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">이메일 주소</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="user@gfs.co.kr"
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* 권한 등급 & 계정 상태 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">권한 등급</label>
                  <select
                    value={formRole}
                    disabled={formLoginId === 'admin'}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none bg-white font-semibold"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">계정 활성화 상태</label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="isActive"
                        checked={formIsActive}
                        onChange={() => setFormIsActive(true)}
                        className="text-blue-600"
                      />
                      <span className="text-emerald-700 font-bold">정상 (사용가능)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="isActive"
                        checked={!formIsActive}
                        disabled={formLoginId === 'admin'}
                        onChange={() => setFormIsActive(false)}
                        className="text-rose-600"
                      />
                      <span className="text-rose-700 font-bold">잠김 (차단)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 비고 */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">비고 / 담당 업무 메모</label>
                <input
                  type="text"
                  value={formRemark}
                  onChange={(e) => setFormRemark(e.target.value)}
                  placeholder="예: 발주 및 입고등록 담당"
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-100 px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 rounded border border-gray-400 bg-white hover:bg-gray-50 text-gray-700 font-semibold"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                className="px-5 py-1.5 rounded bg-blue-700 hover:bg-blue-800 text-white font-bold shadow-sm"
              >
                {modalMode === 'NEW' ? '신규 등록' : '수정사항 저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
