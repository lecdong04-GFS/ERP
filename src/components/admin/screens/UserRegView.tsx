'use client';

import React, { useState } from 'react';
import { AdminActionBar } from '../common/AdminActionBar';
import { useAdmin } from '../context/AdminContext';
import { AdminUserItem } from '../data/adminData';
import { RotateCw, Search, KeyRound, Unlock, UserPlus } from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
const LEVEL_OPTIONS = [
  '00:시스템관리자',
  '01:경영관리자',
  '02:현장반장',
  '03:일반사용자',
  '04:조회전용',
];

const DEPT_OPTIONS = [
  '(주)GFS',
  '(주)GFS-영업부',
  '(주)GFS-생산팀',
  '(주)GFS-품질관리',
  '(주)GFS-자재물류',
  '(주)GFS-전산실',
  '(주)GFS-경영기획',
];

export const UserRegView: React.FC = () => {
  const { users, setUsers, updateUser, addUser, resetUserLogin, resetUserPassword } = useAdmin();

  const [keyword, setKeyword] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'MODIFY' | 'NEW'>('MODIFY');

  // Modal Form State
  const [formCompany, setFormCompany] = useState('(주)GFS');
  const [formUserId, setFormUserId] = useState('');
  const [formUserName, setFormUserName] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formOldPw, setFormOldPw] = useState('');
  const [formNewPw, setFormNewPw] = useState('');
  const [formConfirmPw, setFormConfirmPw] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formEmpNo, setFormEmpNo] = useState('');
  const [formRemark, setFormRemark] = useState('');

  // ── 인라인 편집 ──
  const { editingCell, editValue, setEditValue, startEditing, cancelEditing, isEditing } = useInlineEdit();
  const saveEdit = (rowId: string | number, colKey: string, rows: any[], setRows: (r: any[]) => void) => {
    setRows(rows.map(r => {
      const id = r.id ?? r.no ?? r.idx ?? r.index;
      if (id === rowId) {
        const numVal = Number(editValue);
        return { ...r, [colKey]: isNaN(numVal) || editValue.trim() === '' ? editValue : numVal };
      }
      return r;
    }));
    cancelEditing();
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    if (!keyword.trim()) return true;
    const kw = keyword.trim().toLowerCase();
    return (
      u.userId.toLowerCase().includes(kw) ||
      u.userName.toLowerCase().includes(kw) ||
      u.department.toLowerCase().includes(kw)
    );
  });

  // Open modal for editing
  const handleOpenEdit = (user: AdminUserItem) => {
    setSelectedUser(user);
    setModalMode('MODIFY');
    setFormCompany(user.company || '(주)GFS');
    setFormUserId(user.userId);
    setFormUserName(user.userName);
    setFormDepartment(user.department || '');
    setFormOldPw('');
    setFormNewPw('');
    setFormConfirmPw('');
    setFormPhone(user.phone || '');
    setFormEmail(user.email || '');
    setFormEmpNo(user.empNo || '');
    setFormRemark(user.remark || '');
    setIsModalOpen(true);
  };

  // Open modal for new user
  const handleOpenNew = () => {
    setSelectedUser(null);
    setModalMode('NEW');
    setFormCompany('(주)GFS');
    setFormUserId('');
    setFormUserName('');
    setFormDepartment('(주)GFS');
    setFormOldPw('');
    setFormNewPw('');
    setFormConfirmPw('');
    setFormPhone('');
    setFormEmail('');
    setFormEmpNo('');
    setFormRemark('');
    setIsModalOpen(true);
  };

  // Submit modal
  const handleSaveModal = () => {
    if (!formUserId.trim()) {
      alert('사용자 ID를 입력해주세요.');
      return;
    }
    if (!formUserName.trim()) {
      alert('사용자 이름을 입력해주세요.');
      return;
    }
    if (formNewPw && formNewPw !== formConfirmPw) {
      alert('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    if (modalMode === 'NEW') {
      const exists = users.some((u) => u.userId.toLowerCase() === formUserId.trim().toLowerCase());
      if (exists) {
        alert('이미 존재하는 사용자 ID입니다.');
        return;
      }
      const newUser: AdminUserItem = {
        id: Date.now(),
        userId: formUserId.trim(),
        userName: formUserName.trim(),
        status: '정상',
        lastLogin: '-',
        permLevel: '03',
        levelName: '03:일반사용자',
        company: formCompany,
        department: formDepartment.trim() || '(주)GFS',
        remark: formRemark,
        phone: formPhone,
        email: formEmail,
        empNo: formEmpNo,
        used: true,
      };
      addUser(newUser);
      alert(`신규 사용자 [${newUser.userId}]가 성공적으로 등록되었습니다.`);
    } else if (selectedUser) {
      const updated: AdminUserItem = {
        ...selectedUser,
        userName: formUserName.trim(),
        department: formDepartment.trim() || selectedUser.department,
        phone: formPhone,
        email: formEmail,
        empNo: formEmpNo,
        remark: formRemark,
      };
      updateUser(updated);
      alert(`사용자 [${updated.userId}] 정보가 수정되었습니다.\n• 이름: ${updated.userName}\n• 소속부서: ${updated.department}`);
    }

    setIsModalOpen(false);
  };

  const handleCellChange = (id: number, field: keyof AdminUserItem, val: any) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === id) {
          if (field === 'levelName') {
            const levelCode = String(val).slice(0, 2);
            return { ...u, levelName: val, permLevel: levelCode };
          }
          return { ...u, [field]: val };
        }
        return u;
      })
    );
  };

  const handleSave = () => {
    alert('사용자 마스터 변경사항이 성공적으로 저장되었습니다.');
  };

  const handleReset = () => {
    setKeyword('');
    alert('사용자 목록 조회가 새로고침되었습니다.');
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] text-[12.5px] select-none">
      {/* 1. Header Action Bar */}
      <AdminActionBar
        title="사용자 마스터 2"
        buttons={[
          { key: 'new', label: '신규', icon: 'new', onClick: handleOpenNew },
          { key: 'search', label: '조회', icon: 'search', onClick: () => {} },
          { key: 'save', label: '저장', icon: 'save', onClick: handleSave },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: handleReset },
          {
            key: 'download',
            label: '엑셀다운로드',
            icon: 'download',
            onClick: () =>
              exportGridToExcel({
                filename: '사용자_마스터_계정목록',
                sheetName: '사용자목록',
                columns: [
                  { key: 'userId', label: '사용자ID' },
                  { key: 'userName', label: '성명' },
                  { key: 'department', label: '부서' },
                  { key: 'levelName', label: '권한등급' },
                  { key: 'phone', label: '연락처' },
                  { key: 'email', label: '이메일' },
                  { key: 'status', label: '상태' },
                  { key: 'lastLogin', label: '최근접속일시', format: 'date' },
                ],
                data: filteredUsers,
              }),
          },
        ]}
        helpContent="시스템 접속 사용자 계정, 소속, 권한 레벨, 계정 활성화 상태를 관리합니다. 신규 등록 또는 사용자를 더블클릭하여 세부 정보 수정 모달을 호출할 수 있습니다."
      />

      {/* 2. Filter Bar */}
      <div className="bg-[#e4e8ee] border-b border-[#b0b8c2] px-3 py-1.5 flex items-center justify-between gap-4 text-[12.5px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">사용자 검색</span>
            <div className="relative">
              <input
                type="text"
                placeholder="ID / 이름 / 소속부서 검색"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="bg-white border border-gray-400 rounded px-2 py-0.5 text-[12.5px] w-56 focus:outline-none focus:border-blue-600"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1.5 pointer-events-none" />
            </div>
          </div>
          <span className="text-[11px] text-gray-600 ml-2">
            * 행을 더블클릭하면 <b>[사용자정보등록/수정]</b> 모달 팝업이 열립니다.
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[12.5px] font-bold text-gray-700">
            데이터수: <span className="text-blue-700">{filteredUsers.length}</span>
          </span>
          <button
            onClick={() => setKeyword('')}
            title="새로고침"
            className="p-1 text-gray-600 hover:text-black rounded hover:bg-gray-200 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Main DataGrid */}
      <div className="flex-1 p-2 bg-[#d8dde5] overflow-hidden flex flex-col">
        <div className="flex-1 bg-white border border-[#9aa2ad] shadow-sm flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full border-collapse text-[12.5px] min-w-[1400px]">
              <thead className="whitespace-nowrap sticky top-0 bg-[#c0c7ea] text-gray-900 border-b border-[#9aa2ad] z-10 shadow-sm">
                <tr className="h-[27px]">
                  <th className="w-12 border-r border-[#a0a8be] text-center font-bold">순번</th>
                  <th className="w-16 border-r border-[#a0a8be] text-center font-bold">사용</th>
                  <th className="w-28 border-r border-[#a0a8be] text-center font-bold">사용자id</th>
                  <th className="w-28 border-r border-[#a0a8be] text-center font-bold">사용자이름</th>
                  <th className="w-20 border-r border-[#a0a8be] text-center font-bold">상태</th>
                  <th className="w-40 border-r border-[#a0a8be] text-center font-bold">최종접속일시</th>
                  <th className="w-28 border-r border-[#a0a8be] text-center font-bold">로그인초기화</th>
                  <th className="w-28 border-r border-[#a0a8be] text-center font-bold">비번초기화</th>
                  <th className="w-20 border-r border-[#a0a8be] text-center font-bold">권한레벨</th>
                  <th className="w-40 border-r border-[#a0a8be] text-center font-bold">레벨선택</th>
                  <th className="w-28 border-r border-[#a0a8be] text-center font-bold">소속</th>
                  <th className="w-36 border-r border-[#a0a8be] text-center font-bold">소속선택</th>
                  <th className="border-r border-[#a0a8be] text-center font-bold">비고</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => {
                  const isLocked = user.status === '잠김';
                  const isDormant = user.status === '휴면';

                  return (
                    <tr
                      key={user.id}
                      onDoubleClick={() => handleOpenEdit(user)}
                      className="border-b border-gray-200 hover:bg-blue-50/70 transition-colors h-[27px] cursor-pointer"
                    >
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center bg-[#f2f2f2] border-r border-gray-300 font-semibold text-gray-600">
                        {index + 1}
                      </td>

                      {/* 사용 여부 체크박스 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300">
                        <input
                          type="checkbox"
                          checked={user.used}
                          onChange={(e) => handleCellChange(user.id, 'used', e.target.checked)}
                          className="rounded border-gray-400 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* 사용자 ID */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-2 text-center border-r border-gray-300 font-bold text-gray-900">
                        {user.userId}
                      </td>

                      {/* 사용자 이름 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-2 text-center border-r border-gray-300 font-semibold text-blue-900">
                        {user.userName}
                      </td>

                      {/* 상태 */}
                      <td
                        className={`cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300 font-bold ${
                          isLocked || isDormant ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {user.status}
                      </td>

                      {/* 최종접속일시 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-2 text-center border-r border-gray-300 text-gray-600 text-[11px]">
                        {user.lastLogin}
                      </td>

                      {/* 로그인 초기화 버튼 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-1 text-center border-r border-gray-300">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            resetUserLogin(user.userId);
                          }}
                          className="px-2 py-0.5 bg-[#e8ecf2] hover:bg-[#d6dbe3] text-gray-800 border border-gray-400 rounded text-[11px] font-semibold flex items-center justify-center gap-1 mx-auto"
                        >
                          <Unlock className="w-3 h-3 text-blue-700" />
                          <span>초기화</span>
                        </button>
                      </td>

                      {/* 비번 초기화 버튼 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-1 text-center border-r border-gray-300">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            resetUserPassword(user.userId);
                          }}
                          className="px-2 py-0.5 bg-[#e8ecf2] hover:bg-[#d6dbe3] text-gray-800 border border-gray-400 rounded text-[11px] font-semibold flex items-center justify-center gap-1 mx-auto"
                        >
                          <KeyRound className="w-3 h-3 text-amber-700" />
                          <span>비번초기화</span>
                        </button>
                      </td>

                      {/* 권한레벨 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300 font-bold text-purple-900">
                        {user.permLevel}
                      </td>

                      {/* 레벨선택 드롭다운 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 p-0 border-r border-gray-300">
                        <select
                          value={user.levelName}
                          onChange={(e) => handleCellChange(user.id, 'levelName', e.target.value)}
                          className="w-full h-full px-1 text-[11px] bg-white focus:bg-yellow-50 focus:outline-none"
                        >
                          {LEVEL_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 소속 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-2 text-center border-r border-gray-300 text-gray-700">
                        {user.company}
                      </td>

                      {/* 소속선택 드롭다운 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 p-0 border-r border-gray-300">
                        <select
                          value={user.department}
                          onChange={(e) => handleCellChange(user.id, 'department', e.target.value)}
                          className="w-full h-full px-1 text-[11px] bg-white focus:bg-yellow-50 focus:outline-none"
                        >
                          {DEPT_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 비고 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-2 border-r border-gray-300 text-gray-600">
                        {user.remark}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-[#ffffcc] font-bold border-t-2 border-[#9aa2ad] z-10">
                <tr className="h-[28px]">
                  <td colSpan={4} className="text-center border-r border-[#c8c890] text-gray-900">
                    등록된 총 사용자 수
                  </td>
                  <td colSpan={9} className="px-3 text-left border-r border-[#c8c890] text-blue-900">
                    {filteredUsers.length} 명
                  </td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>

      {/* 4. [사용자정보등록/수정] 팝업 모달 Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#f0f0f0] border-2 border-[#404040] shadow-2xl w-[440px] text-gray-900 text-[12.5px] flex flex-col overflow-hidden">
            {/* Modal Title bar: Dark Red (#800000) */}
            <div className="bg-[#800000] text-white px-3 py-1.5 flex items-center justify-between font-bold select-none">
              <div className="flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-amber-300" />
                <span>사용자정보등록/수정 (사용자등록)</span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-300 hover:text-white font-bold text-sm px-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="p-4 flex flex-col gap-2.5 bg-[#f5f5f5]">
              {/* 소속 */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">소속</label>
                <input
                  type="text"
                  value={formCompany}
                  readOnly
                  className="flex-1 bg-[#e8e8e8] border border-gray-400 rounded px-2 py-1 text-gray-700 font-semibold cursor-not-allowed"
                />
              </div>

              {/* 사용자 ID */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">사용자 ID</label>
                <input
                  type="text"
                  value={formUserId}
                  disabled={modalMode === 'MODIFY'}
                  onChange={(e) => setFormUserId(e.target.value)}
                  placeholder="예: heebee"
                  className={`flex-1 border rounded px-2 py-1 bg-white font-bold ${
                    modalMode === 'MODIFY'
                      ? 'bg-gray-100 text-gray-700 border-gray-400'
                      : 'border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 text-blue-900'
                  }`}
                />
              </div>

              {/* 이름 */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">이름</label>
                <input
                  type="text"
                  value={formUserName}
                  onChange={(e) => setFormUserName(e.target.value)}
                  placeholder="예: 홍길동"
                  className="flex-1 border border-gray-400 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-600 font-semibold"
                />
              </div>

              {/* 부서 (헤더 괄호 표시 부분) */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">부서(소속팀)</label>
                <input
                  type="text"
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  placeholder="예: 대표이사실, 경영관리팀, 생산총괄"
                  className="flex-1 border border-blue-400 rounded px-2 py-1 bg-blue-50/40 focus:outline-none focus:border-blue-600 font-bold text-blue-900"
                />
              </div>

              {/* 비밀번호 (기존) */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">비밀번호</label>
                <input
                  type="password"
                  value={formOldPw}
                  onChange={(e) => setFormOldPw(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 border border-gray-400 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* 새 비밀번호 */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">새 비밀번호</label>
                <input
                  type="password"
                  value={formNewPw}
                  onChange={(e) => setFormNewPw(e.target.value)}
                  placeholder="변경 시 입력"
                  className="flex-1 border border-gray-400 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* 비밀번호 확인 */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">비밀번호 확인</label>
                <input
                  type="password"
                  value={formConfirmPw}
                  onChange={(e) => setFormConfirmPw(e.target.value)}
                  placeholder="새 비밀번호 재입력"
                  className="flex-1 border border-gray-400 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* 전화번호 */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">전화번호</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  className="flex-1 border border-gray-400 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* 이메일 */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">이메일</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="user@gfs.co.kr"
                  className="flex-1 border border-gray-400 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* 사번 */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">사번</label>
                <input
                  type="text"
                  value={formEmpNo}
                  onChange={(e) => setFormEmpNo(e.target.value)}
                  placeholder="GFS-2026001"
                  className="flex-1 border border-gray-400 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* 비고 */}
              <div className="flex items-center">
                <label className="w-24 font-bold text-gray-700">비고</label>
                <input
                  type="text"
                  value={formRemark}
                  onChange={(e) => setFormRemark(e.target.value)}
                  placeholder="담당 업무 및 특이사항"
                  className="flex-1 border border-gray-400 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {/* Modal Bottom Buttons */}
            <div className="bg-[#e4e4e4] border-t border-gray-300 px-4 py-2 flex items-center justify-end gap-2">
              <button
                onClick={handleSaveModal}
                className="px-4 py-1.5 bg-[#4a72a8] hover:bg-[#3d5e8c] text-white font-bold rounded shadow-sm border border-[#2d4970] text-[12.5px] active:bg-[#283e5c]"
              >
                확인
              </button>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 bg-[#d8dde5] hover:bg-[#c8cfda] text-gray-800 font-semibold rounded shadow-sm border border-gray-400 text-[12.5px]"
              >
                닫기
              </button>
            </div>

            {/* Modal Bottom Status Bar: Fluorescent Green (#00ff00) */}
            <div className="bg-[#00ff00] text-black font-extrabold px-3 py-0.5 text-[11px] select-none tracking-wider border-t border-gray-400">
              {modalMode === 'MODIFY' ? 'Modify' : 'New'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

