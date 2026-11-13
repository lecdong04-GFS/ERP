'use client';

import React, { useState, useMemo } from 'react';
import { AdminActionBar } from '../common/AdminActionBar';
import { useAdmin } from '../context/AdminContext';
import { ChevronLeft, ChevronRight, RotateCw, Activity, History } from 'lucide-react';
import { kstToday } from '@/lib/kst';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
export const SystemUsageView: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    usageSummary,
    usageLogs,
    selectedSummaryPageCode,
    setSelectedSummaryPageCode,
  } = useAdmin();

  const [selectedActionName, setSelectedActionName] = useState<string>('조회');
  const [selectedSummaryRowId, setSelectedSummaryRowId] = useState<number>(2); // Default to Uc_BOM

  // Shift date by delta days
  const shiftDay = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  // Grand total of calls in summary
  const totalCalls = useMemo(() => {
    return usageSummary.reduce((sum, item) => sum + item.callCount, 0);
  }, [usageSummary]);

  // Filtered detail audit logs based on selected top row
  const filteredLogs = useMemo(() => {
    if (!selectedSummaryPageCode) return usageLogs;
    return usageLogs.filter(
      (log) =>
        log.pageCode === selectedSummaryPageCode &&
        (!selectedActionName || log.actionName === selectedActionName)
    );
  }, [usageLogs, selectedSummaryPageCode, selectedActionName]);

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

  const handleSelectSummaryRow = (rowId: number, pageCode: string, actionName: string) => {
    setSelectedSummaryRowId(rowId);
    setSelectedSummaryPageCode(pageCode);
    setSelectedActionName(actionName);
  };

  const handleReset = () => {
    setSelectedDate(kstToday());
    setSelectedSummaryPageCode('Uc_BOM');
    setSelectedActionName('조회');
    setSelectedSummaryRowId(2);
    alert('시스템 사용현황 조회가 새로고침되었습니다.');
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] text-[12.5px] select-none">
      {/* 1. Header Action Bar */}
      <AdminActionBar
        title="시스템사용현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', onClick: () => {} },
          { key: 'reset', label: '초기화', icon: 'reset', onClick: handleReset },
        ]}
        helpContent="ERP 화면별/기능별(조회, 저장, 엑셀업로드, 초기화 등) 호출 횟수 및 각 기능별 실사용자 타임스탬프 감사 로그(Audit Log)를 추적합니다. 상단 요약 행을 클릭하면 하단에 실시간 상세 호출 이력이 필터링됩니다."
      />

      {/* 2. Filter Bar */}
      <div className="bg-[#e4e8ee] border-b border-[#b0b8c2] px-3 py-1.5 flex items-center justify-between gap-4 text-[12.5px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">날짜</span>
            <button
              onClick={() => shiftDay(-1)}
              className="p-1 bg-white border border-gray-400 rounded hover:bg-gray-100"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-gray-400 rounded px-2 py-0.5 text-[12.5px] font-semibold text-gray-800"
            >
            </input>
            <button
              onClick={() => shiftDay(1)}
              className="p-1 bg-white border border-gray-400 rounded hover:bg-gray-100"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-[11px] text-gray-600 ml-3">
            * 기준일자: <b>{selectedDate}</b> 전체 ERP 모듈 실시간 감사 로그 추적 중
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[12.5px] font-bold text-gray-700">
            총 호출수: <span className="text-blue-700">{totalCalls.toLocaleString()}</span> 회
          </span>
          <button
            onClick={handleReset}
            title="새로고침"
            className="p-1 text-gray-600 hover:text-black rounded hover:bg-gray-200 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. 50:50 Vertical Split Layout */}
      <div className="flex-1 p-2 bg-[#d8dde5] overflow-hidden flex flex-col gap-2">
        {/* UPPER: 요약 그리드 (50% height) */}
        <div className="h-1/2 bg-white border border-[#9aa2ad] shadow-sm flex flex-col overflow-hidden">
          <div className="bg-[#dde3ea] px-3 py-1 border-b border-[#b8c1cc] flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-gray-800 text-[12.5px]">
              <Activity className="w-4 h-4 text-blue-700" />
              <span>요약</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-gray-700">
                데이터수: <span className="text-blue-700">{usageSummary.length}</span>
              </span>
              <button
                onClick={() => {}}
                title="새로고침"
                className="p-0.5 text-gray-600 hover:text-black"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full border-collapse text-[12.5px]">
              <thead className="whitespace-nowrap sticky top-0 bg-[#c0c7ea] text-gray-900 border-b border-[#9aa2ad] z-10 shadow-sm">
                <tr className="h-[27px]">
                  <th className="w-14 border-r border-[#a0a8be] text-center font-bold">순번</th>
                  <th className="w-56 border-r border-[#a0a8be] text-center font-bold">
                    페이지코드
                  </th>
                  <th className="w-56 border-r border-[#a0a8be] text-center font-bold">
                    페이지명
                  </th>
                  <th className="w-32 border-r border-[#a0a8be] text-center font-bold">기능</th>
                  <th className="border-r border-[#a0a8be] text-center font-bold">횟수</th>
                </tr>
              </thead>
              <tbody>
                {usageSummary.map((item, index) => {
                  const isSelected = selectedSummaryRowId === item.id;
                  return (
                    <tr
                      key={item.id}
                      onClick={() =>
                        handleSelectSummaryRow(item.id, item.pageCode, item.actionName)
                      }
                      className={`border-b border-gray-200 transition-colors h-[26px] cursor-pointer ${
                        isSelected
                          ? 'bg-blue-100 font-bold text-blue-900'
                          : index % 2 === 1
                          ? 'bg-gray-50/70 hover:bg-blue-50/50'
                          : 'bg-white hover:bg-blue-50/50'
                      }`}
                    >
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center bg-[#f2f2f2] border-r border-gray-300 font-semibold text-gray-600">
                        {index + 1}
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 border-r border-gray-300 font-mono text-[11px] text-gray-700">
                        {item.pageCode}
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 border-r border-gray-300 font-medium text-gray-900">
                        {item.pageName}
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 text-center border-r border-gray-300 text-gray-700">
                        {item.actionName}
                      </td>
                      <td
                        className={`cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-4 text-right font-bold ${
                          item.callCount > 0 ? 'text-blue-800' : 'text-gray-400'
                        }`}
                      >
                        {item.callCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-[#ffffcc] font-bold border-t-2 border-[#9aa2ad] z-10">
                <tr className="h-[28px]">
                  <td colSpan={4} className="text-center border-r border-[#c8c890] text-gray-900">
                    합계
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-4 text-right border-r border-[#c8c890] text-blue-900 font-bold">
                    {totalCalls}
                  </td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* LOWER: 내역 그리드 (50% height) */}
        <div className="h-1/2 bg-white border border-[#9aa2ad] shadow-sm flex flex-col overflow-hidden">
          <div className="bg-[#dde3ea] px-3 py-1 border-b border-[#b8c1cc] flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-gray-800 text-[12.5px]">
              <History className="w-4 h-4 text-emerald-700" />
              <span>
                내역 - [{selectedSummaryPageCode || '전체'}] ({selectedActionName})
              </span>
            </div>
            <span className="text-[11px] font-bold text-gray-700">
              상세 로그수: <span className="text-blue-700">{filteredLogs.length}</span> 건
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full border-collapse text-[12.5px]">
              <thead className="whitespace-nowrap sticky top-0 bg-[#c0c7ea] text-gray-900 border-b border-[#9aa2ad] z-10 shadow-sm">
                <tr className="h-[27px]">
                  <th className="w-14 border-r border-[#a0a8be] text-center font-bold">순번</th>
                  <th className="w-32 border-r border-[#a0a8be] text-center font-bold">기능</th>
                  <th className="w-40 border-r border-[#a0a8be] text-center font-bold">
                    사용자이름
                  </th>
                  <th className="w-48 border-r border-[#a0a8be] text-center font-bold">시각</th>
                  <th className="w-40 border-r border-[#a0a8be] text-center font-bold">접속IP</th>
                  <th className="border-r border-[#a0a8be] text-center font-bold">
                    클라이언트버전
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log, index) => (
                    <tr
                      key={log.id}
                      className="border-b border-gray-200 hover:bg-blue-50/50 transition-colors h-[26px]"
                    >
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 text-center bg-[#f2f2f2] border-r border-gray-300 font-semibold text-gray-600">
                        {index + 1}
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 text-center border-r border-gray-300 font-semibold text-gray-800">
                        {log.actionName}
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 text-center border-r border-gray-300 font-bold text-blue-900">
                        {log.userName}
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 text-center border-r border-gray-300 font-mono text-[11px] text-gray-700">
                        {log.timestamp}
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 text-center border-r border-gray-300 font-mono text-[11px] text-gray-600">
                        {log.ipAddress}
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 px-3 text-center border-r border-gray-300 font-mono text-[11px] text-gray-600">
                        {log.clientVersion}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      선택된 기능의 호출 내역 로그가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table></EditableTableWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};

