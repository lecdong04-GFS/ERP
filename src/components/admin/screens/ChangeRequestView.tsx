'use client';

import React, { useState, useMemo, useRef } from 'react';
import { AdminActionBar } from '../common/AdminActionBar';
import { useAdmin } from '../context/AdminContext';
import { ChangeRequestItem } from '../data/adminData';
import { RotateCw, Search, Image as ImageIcon, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { erpConfirm } from '@/context/ConfirmContext';
import { isSafeImageSrc } from '@/lib/sanitize';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
const RESULT_OPTIONS: ('완료' | '진행중' | '접수대기' | '보류')[] = [
  '완료',
  '진행중',
  '접수대기',
  '보류',
];

export const ChangeRequestView: React.FC = () => {
  const { changeRequests, setChangeRequests, addChangeRequest, deleteChangeRequest } = useAdmin();

  const [keyword, setKeyword] = useState('');
  const [resultFilter, setResultFilter] = useState<string>('전체');
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [previewPhotoReq, setPreviewPhotoReq] = useState<ChangeRequestItem | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<Record<number, string>>({});
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !previewPhotoReq) return;
    if (file.size > 1_500_000) {
      alert('이미지 파일 크기는 1.5MB 이하만 첨부할 수 있습니다.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!isSafeImageSrc(dataUrl)) {
        alert('지원되는 PNG, JPG, WEBP, GIF 이미지 파일만 첨부할 수 있습니다.');
        return;
      }
      const targetId = previewPhotoReq.id;
      setPhotoPreviews((prev) => ({ ...prev, [targetId]: dataUrl }));
      setChangeRequests((prev) =>
        prev.map((row) => (row.id === targetId ? { ...row, hasPhoto: true } : row))
      );
      setPreviewPhotoReq((prev) => (prev && prev.id === targetId ? { ...prev, hasPhoto: true } : prev));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Dynamic KPI counts
  const totalCount = changeRequests.length;
  const completedCount = useMemo(
    () => changeRequests.filter((r) => r.result === '완료').length,
    [changeRequests]
  );
  const incompleteCount = totalCount - completedCount;
  const completedPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const incompletePct = totalCount > 0 ? 100 - completedPct : 0;

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return changeRequests.filter((req) => {
      if (resultFilter !== '전체' && req.result !== resultFilter) return false;
      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        const matchTitle = req.title.toLowerCase().includes(kw);
        const matchRequester = req.requester.toLowerCase().includes(kw);
        const matchId = String(req.reqId).includes(kw);
        const matchRemark = req.remark.toLowerCase().includes(kw);
        if (!matchTitle && !matchRequester && !matchId && !matchRemark) return false;
      }
      return true;
    });
  }, [changeRequests, resultFilter, keyword]);

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

  // Handle cell edit
  const handleCellChange = (id: number, field: keyof ChangeRequestItem, val: any) => {
    setChangeRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  // Add new ticket
  const handleNewTicket = () => {
    const maxReqId = Math.max(...changeRequests.map((r) => r.reqId), 88);
    const newReq: ChangeRequestItem = {
      id: Date.now(),
      reqId: maxReqId + 1,
      reqDate: new Date().toISOString().slice(0, 10),
      title: '신규 프로그램 수정/개발 요청건',
      priority: 1,
      result: '접수대기',
      execDate: '',
      remark: '개발 검토 요청',
      hasPhoto: false,
      client: '(주)GFS',
      requester: '전정우',
    };
    addChangeRequest(newReq);
    setSelectedRowId(newReq.id);
  };

  // Delete selected ticket
  const handleDeleteTicket = async () => {
    if (!selectedRowId) {
      alert('삭제할 요청 행을 먼저 선택해주세요.');
      return;
    }
    const target = changeRequests.find((r) => r.id === selectedRowId);
    if (!target) return;

    const ok = await erpConfirm(`요청ID [${target.reqId}]: "${target.title}" 항목을 삭제하시겠습니까?`, '수정 요청 삭제 확인', 'danger');
    if (ok) {
      deleteChangeRequest(selectedRowId);
      setSelectedRowId(null);
    }
  };

  const handleSave = () => {
    alert('프로그램 수정요청/결과 내역이 성공적으로 저장되었습니다.');
  };

  const handleReset = () => {
    setKeyword('');
    setResultFilter('전체');
    setSelectedRowId(null);
    alert('프로그램 수정요청 현황이 새로고침되었습니다.');
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] text-[12.5px] select-none">
      {/* 1. Header Action Bar */}
      <AdminActionBar
        title="프로그램수정요청/결과"
        buttons={[
          { key: 'new', label: '신규', icon: 'new', onClick: handleNewTicket },
          { key: 'search', label: '조회', icon: 'search', onClick: () => {} },
          { key: 'save', label: '저장', icon: 'save', onClick: handleSave },
          { key: 'delete', label: '삭제X', icon: 'delete', onClick: handleDeleteTicket },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: handleReset },
        ]}
        helpContent="현장 요구사항 및 시스템 개발/수정 티켓의 접수, 중요도, 개발 일정, 실행 결과 및 첨부 이미지를 통합 관리합니다. 행을 선택하고 [삭제X]를 누르면 선택된 티켓이 삭제됩니다."
      />

      {/* 2. 요청 현황 KPI 카드 대시보드 (헤더 바로 아래 배치) */}
      <div className="bg-[#e9edf3] border-b border-[#b0b8c2] px-3 py-1.5 flex items-center justify-between text-[12.5px]">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-gray-800 text-[12.5px] mr-1">요청 현황 집계:</span>

          {/* 총과제수 배지 */}
          <div className="flex items-center gap-1.5 bg-[#f0f2f7] text-gray-800 font-bold px-3 py-0.5 rounded-full border border-gray-400 shadow-2xs">
            <span className="text-[11px] text-gray-600 font-semibold">총과제수:</span>
            <span className="text-[12.5px] text-blue-900">{totalCount}</span>
          </div>

          {/* 완료 배지 */}
          <div className="flex items-center gap-1.5 bg-[#e6f4ea] text-emerald-800 font-bold px-3 py-0.5 rounded-full border border-emerald-400 shadow-2xs">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[11px] text-gray-700 font-semibold">완료:</span>
            <span className="text-[12.5px] text-emerald-900">
              {completedCount} ({completedPct}%)
            </span>
          </div>

          {/* 미완료 배지 */}
          <div className="flex items-center gap-1.5 bg-[#fce8e6] text-red-800 font-bold px-3 py-0.5 rounded-full border border-red-300 shadow-2xs">
            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            <span className="text-[11px] text-gray-700 font-semibold">미완료:</span>
            <span className="text-[12.5px] text-red-900">
              {incompleteCount} ({incompletePct}%)
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">진행결과</span>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="bg-white border border-gray-400 rounded px-2 py-0.5 text-[12.5px] focus:outline-none focus:border-blue-600"
            >
              <option value="전체">전체</option>
              {RESULT_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 ml-2">
            <div className="relative">
              <input
                type="text"
                placeholder="제목/요청자/ID 검색"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="bg-white border border-gray-400 rounded px-2 py-0.5 text-[12.5px] w-48 focus:outline-none focus:border-blue-600"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1.5 pointer-events-none" />
            </div>
          </div>

          <button
            onClick={() => {
              setKeyword('');
              setResultFilter('전체');
            }}
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
            <EditableTableWrapper><table className="w-full border-collapse text-[12.5px] min-w-[1500px]">
              <thead className="whitespace-nowrap sticky top-0 bg-[#c0c7ea] text-gray-900 border-b border-[#9aa2ad] z-10 shadow-sm">
                <tr className="h-[27px]">
                  <th className="w-12 border-r border-[#a0a8be] text-center font-bold">순번</th>
                  <th className="w-20 border-r border-[#a0a8be] text-center font-bold">요청id</th>
                  <th className="w-24 border-r border-[#a0a8be] text-center font-bold">요청일</th>
                  <th className="w-80 border-r border-[#a0a8be] text-center font-bold">제목</th>
                  <th className="w-20 border-r border-[#a0a8be] text-center font-bold">중요도</th>
                  <th className="w-24 border-r border-[#a0a8be] text-center font-bold">결과</th>
                  <th className="w-24 border-r border-[#a0a8be] text-center font-bold">실행일</th>
                  <th className="border-r border-[#a0a8be] text-center font-bold">비고</th>
                  <th className="w-16 border-r border-[#a0a8be] text-center font-bold">사진</th>
                  <th className="w-20 border-r border-[#a0a8be] text-center font-bold">사진첨부</th>
                  <th className="w-24 border-r border-[#a0a8be] text-center font-bold">고객사</th>
                  <th className="w-24 border-r border-[#a0a8be] text-center font-bold">요청자</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req, index) => {
                  const isSelected = selectedRowId === req.id;
                  const isDone = req.result === '완료';
                  const isInProgress = req.result === '진행중';

                  return (
                    <tr
                      key={req.id}
                      onClick={() => setSelectedRowId(req.id)}
                      className={`border-b border-gray-200 transition-colors h-[27px] cursor-pointer ${
                        isSelected
                          ? 'bg-blue-100 font-medium'
                          : index % 2 === 1
                          ? 'bg-gray-50/70 hover:bg-blue-50/50'
                          : 'bg-white hover:bg-blue-50/50'
                      }`}
                    >
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center bg-[#f2f2f2] border-r border-gray-300 font-semibold text-gray-600">
                        {index + 1}
                      </td>

                      {/* 요청 ID */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300 font-bold text-gray-800">
                        {req.reqId}
                      </td>

                      {/* 요청일 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300 text-gray-700">
                        {req.reqDate}
                      </td>

                      {/* 제목 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 border-r border-gray-300 font-medium text-gray-900 whitespace-nowrap">
                        {req.title}
                      </td>

                      {/* 중요도 */}
                      <td
                        className={`cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300 font-bold ${
                          req.priority === 99
                            ? 'text-red-600'
                            : req.priority >= 10
                            ? 'text-amber-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {req.priority}
                      </td>

                      {/* 결과 드롭다운 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 p-0 border-r border-gray-300 text-center">
                        <select
                          value={req.result}
                          onChange={(e) =>
                            handleCellChange(req.id, 'result', e.target.value as any)
                          }
                          className={`w-full h-full px-1 text-center font-bold text-[11px] focus:outline-none ${
                            isDone
                              ? 'text-emerald-700 bg-emerald-50/40'
                              : isInProgress
                              ? 'text-blue-700 bg-blue-50/40'
                              : 'text-amber-800 bg-amber-50/40'
                          }`}
                        >
                          {RESULT_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 실행일 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300 text-gray-700">
                        {req.execDate || '-'}
                      </td>

                      {/* 비고 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-2 border-r border-gray-300 text-gray-600">
                        {req.remark}
                      </td>

                      {/* 사진 아이콘 미리보기 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300">
                        {req.hasPhoto ? (
                          <ImageIcon className="w-4 h-4 text-blue-600 mx-auto" />
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>

                      {/* 사진첨부 [...] 버튼 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-1 text-center border-r border-gray-300">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewPhotoReq(req);
                          }}
                          title="스크린샷 첨부/보기"
                          className="px-2 py-0.5 bg-[#e8ecf2] hover:bg-[#d6dbe3] text-gray-800 border border-gray-400 rounded text-[11px] font-bold mx-auto"
                        >
                          [...]
                        </button>
                      </td>

                      {/* 고객사 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300 text-gray-700">
                        {req.client}
                      </td>

                      {/* 요청자 */}
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center border-r border-gray-300 font-semibold text-gray-800">
                        {req.requester}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-[#ffffcc] font-bold border-t-2 border-[#9aa2ad] z-10">
                <tr className="h-[28px]">
                  <td colSpan={3} className="text-center border-r border-[#c8c890] text-gray-900">
                    전체 과제 현황
                  </td>
                  <td colSpan={9} className="px-3 text-left border-r border-[#c8c890] text-blue-900">
                    총과제: <b>{totalCount}</b>건 | 완료: <b>{completedCount}</b>건 ({completedPct}%) | 미완료: <b>{incompleteCount}</b>건 ({incompletePct}%)
                  </td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>

      {/* 4. 스크린샷 첨부/미리보기 모달 */}
      {previewPhotoReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-md shadow-2xl border border-gray-400 w-[520px] text-gray-800 text-[12.5px] overflow-hidden">
            <div className="bg-[#333333] text-white px-3 py-2 flex items-center justify-between font-bold">
              <span>
                [사진첨부/미리보기] 요청ID {previewPhotoReq.reqId} - {previewPhotoReq.title}
              </span>
              <button
                onClick={() => setPreviewPhotoReq(null)}
                className="text-gray-300 hover:text-white font-bold text-sm px-1"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex flex-col items-center gap-3 bg-[#f8f9fc]">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handlePhotoFileChange}
                className="hidden"
              />
              {photoPreviews[previewPhotoReq.id] ? (
                <div className="w-full h-56 bg-white border border-gray-300 rounded overflow-hidden flex items-center justify-center p-1">
                  <img
                    src={photoPreviews[previewPhotoReq.id]}
                    alt={previewPhotoReq.title}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-full h-56 bg-gray-100 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-500 gap-2">
                  <ImageIcon className="w-12 h-12 text-blue-500 opacity-60" />
                  <span className="font-semibold text-gray-700">
                    {previewPhotoReq.hasPhoto
                      ? '기존 첨부 상태가 기록되어 있습니다. 새 파일로 교체할 수 있습니다.'
                      : '등록된 첨부 이미지가 없습니다.'}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    파일 형식: PNG, JPG, WEBP (최대 1.5MB)
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 w-full justify-between">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="px-3 py-1 bg-[#4a72a8] hover:bg-[#3d5e8c] text-white font-semibold rounded text-[11px] cursor-pointer"
                >
                  새 이미지 첨부...
                </button>
                <span className="text-[11px] text-gray-600">
                  작성자: {previewPhotoReq.requester} ({previewPhotoReq.reqDate})
                </span>
              </div>
            </div>
            <div className="bg-[#f0f0f0] border-t border-gray-300 px-3 py-2 flex justify-end">
              <button
                onClick={() => setPreviewPhotoReq(null)}
                className="px-4 py-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold rounded text-[11px]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

