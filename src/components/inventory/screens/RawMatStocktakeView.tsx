'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Save, Download, Printer, RefreshCw, Layers, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface StocktakeItem {
  id: number;
  no: number;
  warehouse: string;
  category: string;
  supplier: string;
  itemCode: string;
  itemName: string;
  leadTime: string;
  expiryDate: string;
  boxQty: number;
  pieceQty: number;
  currentStock: number;
  boxUnitQty: number;
  unitPrice: number;
  amount: number;
  remark: string;
}

export const RawMatStocktakeView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [stockDate, setStockDate] = useState<string>('2026-10-29');
  const [rows, setRows] = useState<StocktakeItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // DB에서 10월 29일 기준 실사 재고 데이터 로드
  const fetchStocktakeData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/inventory/stocktake');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRows(json.data);
      }
    } catch (err) {
      console.error('Failed to load stocktake data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStocktakeData();
  }, []);

  // 탭별 필터링
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // 탭 필터
      if (activeTab === '냉장1' && r.warehouse !== '냉장1') return false;
      if (activeTab === '냉장2' && r.warehouse !== '냉장2') return false;
      if (activeTab === '냉동' && r.warehouse !== '냉동') return false;
      if (activeTab === '상온' && r.warehouse !== '상온') return false;
      if (activeTab === '부자재' && r.warehouse !== '부자재') return false;

      // 검색어 필터
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const matchName = r.itemName.toLowerCase().includes(kw);
        const matchCode = r.itemCode.toLowerCase().includes(kw);
        const matchSupplier = r.supplier.toLowerCase().includes(kw);
        if (!matchName && !matchCode && !matchSupplier) return false;
      }
      return true;
    });
  }, [rows, activeTab, searchKeyword]);

  // 실사 박스 또는 낱개 수량 변경 핸들러
  const handleBoxChange = (id: number, val: string) => {
    const num = Number(val) || 0;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const totalStock = num * r.boxUnitQty + r.pieceQty;
          return {
            ...r,
            boxQty: num,
            currentStock: totalStock,
            amount: totalStock * r.unitPrice,
          };
        }
        return r;
      })
    );
    setIsSaved(false);
  };

  const handlePieceChange = (id: number, val: string) => {
    const num = Number(val) || 0;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const totalStock = r.boxQty * r.boxUnitQty + num;
          return {
            ...r,
            pieceQty: num,
            currentStock: totalStock,
            amount: totalStock * r.unitPrice,
          };
        }
        return r;
      })
    );
    setIsSaved(false);
  };

  // 통계 계산
  const totalAmount = useMemo(() => {
    return filteredRows.reduce((acc, r) => acc + r.amount, 0);
  }, [filteredRows]);

  const totalQty = useMemo(() => {
    return filteredRows.reduce((acc, r) => acc + r.currentStock, 0);
  }, [filteredRows]);

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

  // 저장 (실사 확정)
  const handleSave = async () => {
    try {
      const res = await fetch('/api/inventory/stocktake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stocktakeDate: stockDate,
          rows: filteredRows,
          createdBy: 'admin',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsSaved(true);
        alert(`✅ 일일 재고조사표 저장이 완료되었습니다!\n(${data.message || '현재고 및 실사 기록에 즉각 반영되었습니다.'})`);
      } else {
        alert('저장 안내: ' + (data.error || '저장 중 오류가 발생했습니다.'));
      }
    } catch (err: any) {
      alert('저장 실패: ' + err.message);
    }
  };

  // 엑셀 다운로드
  const handleExportExcel = () => {
    const exportData = filteredRows.map((r, idx) => ({
      'No': idx + 1,
      '창고구분': r.warehouse,
      '구분': r.category,
      '거래처': r.supplier,
      'ID(품번)': r.itemCode,
      '제품명': r.itemName,
      '입고일': r.leadTime,
      '유통기한': r.expiryDate,
      '박스(BOX)': r.boxQty,
      '낱개(봉)': r.pieceQty,
      '현재고(봉)': r.currentStock,
      '입수량': r.boxUnitQty,
      '봉단가': r.unitPrice,
      '금액': r.amount,
      '비고': r.remark,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab === 'ALL' ? '전체재고조사' : activeTab);
    XLSX.writeFile(wb, `일일재고조사표_${stockDate}_${activeTab}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f0f2f5] select-none text-[12px] font-sans">
      {/* 1. 상단 다크 타이틀 & 결재 라인 바 (새 양식 헤더) */}
      <div className="bg-[#1e293b] text-white px-4 py-2 border-b border-slate-700 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="w-2 h-4 bg-emerald-500 rounded-2xs inline-block" />
          <div>
            <h1 className="text-[14px] font-black tracking-tight text-white flex items-center gap-2">
              일일 재고조사표
              <span className="text-[11px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/60 px-2 py-0.5 rounded">
                새 양식 (10월 29일 기준 실데이터)
              </span>
            </h1>
          </div>
        </div>

        {/* 결재 라인 (작성 / 검토 / 승인) */}
        <div className="flex items-center gap-2">
          <div className="flex border border-slate-600 rounded bg-slate-800 text-[11px] text-center overflow-hidden">
            <div className="border-r border-slate-600 px-2.5 py-1">
              <span className="text-gray-400 block text-[10px]">작성</span>
              <span className="font-bold text-gray-200">김재고</span>
            </div>
            <div className="border-r border-slate-600 px-2.5 py-1">
              <span className="text-gray-400 block text-[10px]">검토</span>
              <span className="font-bold text-gray-200">이과장</span>
            </div>
            <div className="px-2.5 py-1">
              <span className="text-gray-400 block text-[10px]">승인</span>
              <span className="font-bold text-emerald-400">박팀장</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 ml-2">
            <button
              type="button"
              onClick={fetchStocktakeData}
              className="flex items-center gap-1 h-7.5 px-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded text-[11.5px] border border-slate-600 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              조회
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1 h-7.5 px-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-[11.5px] shadow-sm cursor-pointer border border-blue-700"
            >
              <Save className="w-3.5 h-3.5" />
              실사확정(저장)
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1 h-7.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[11.5px] shadow-sm cursor-pointer border border-emerald-700"
            >
              <Download className="w-3.5 h-3.5" />
              엑셀 다운로드
            </button>
          </div>
        </div>
      </div>

      {/* 2. 탭 바 (부자재, 냉장1, 냉장2, 냉동, 상온) */}
      <div className="bg-[#e2e8f0] border-b border-gray-300 px-3 flex items-center justify-between shrink-0 h-[38px]">
        <div className="flex items-center gap-1">
          {[
            { id: 'ALL', label: '전체', count: rows.length },
            { id: '냉장1', label: '냉장1', count: rows.filter((r) => r.warehouse === '냉장1').length },
            { id: '냉장2', label: '냉장2', count: rows.filter((r) => r.warehouse === '냉장2').length },
            { id: '냉동', label: '냉동', count: rows.filter((r) => r.warehouse === '냉동').length },
            { id: '상온', label: '상온', count: rows.filter((r) => r.warehouse === '상온').length },
            { id: '부자재', label: '부자재', count: rows.filter((r) => r.warehouse === '부자재').length },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 h-[32px] px-3.5 rounded-t text-[12px] font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-blue-700 border-t-2 border-t-blue-600 border-x border-gray-300 shadow-xs'
                    : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-slate-200/80'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-300 text-gray-700'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 검색 인풋 */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="품명 / 품번 / 거래처 검색..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="h-7 w-[220px] pl-2.5 pr-7 bg-white border border-gray-300 rounded text-[11.5px] outline-none focus:border-blue-500 shadow-inner"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-2" />
          </div>
        </div>
      </div>

      {/* 3. 대형 데이터 그리드 */}
      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 min-h-0 overflow-auto border border-gray-300 shadow-2xs">
          <EditableTableWrapper><table className="w-full min-w-full border-collapse text-[12.5px] font-sans">
            <thead className="sticky top-0 z-20 bg-[#eef2f7] text-gray-900 font-bold border-b border-[#dbe3ee] shadow-xs">
              <tr className="h-[32px] text-center leading-tight whitespace-nowrap">
                <th className="border border-[#dbe3ee] px-1.5 py-1 w-[40px] bg-[#e8edf4] text-[11px]">No</th>
                <th className="border border-[#dbe3ee] px-2 py-1 w-[75px] min-w-[75px]">창고구분</th>
                <th className="border border-[#dbe3ee] px-2 py-1 w-[55px] min-w-[55px]">구분</th>
                <th className="border border-[#dbe3ee] px-2.5 py-1 min-w-[160px] text-left">거래처</th>
                <th className="border border-[#dbe3ee] px-2 py-1 min-w-[90px]">품번(ID)</th>
                <th className="border border-[#dbe3ee] px-3 py-1 min-w-[320px] text-left">제품명</th>
                <th className="border border-[#dbe3ee] px-2 py-1 min-w-[65px]">입고일</th>
                <th className="border border-[#dbe3ee] px-2 py-1 min-w-[85px]">유통기한</th>
                <th className="border border-[#dbe3ee] px-2 py-1 min-w-[75px] bg-[#b5bbf5]">박스(BOX)</th>
                <th className="border border-[#dbe3ee] px-2 py-1 min-w-[75px] bg-[#b5bbf5]">낱개(봉)</th>
                <th className="border border-[#dbe3ee] px-2 py-1 min-w-[85px] bg-[#abb2f2]">현재고(봉)</th>
                <th className="border border-[#dbe3ee] px-2 py-1 min-w-[65px]">입수량</th>
                <th className="border border-[#dbe3ee] px-2.5 py-1 min-w-[85px] text-right">봉단가</th>
                <th className="border border-[#dbe3ee] px-3 py-1 min-w-[105px] text-right bg-[#e8edf4]">금액</th>
                <th className="border border-[#dbe3ee] px-2.5 py-1 min-w-[150px] text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={15} className="py-20 text-center text-gray-500 font-medium">
                    새 엑셀 양식 데이터를 로드 중입니다...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-20 text-center text-gray-400 font-medium italic">
                    조회된 재고 조사 품목이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="h-[26px] border-b border-gray-200 hover:bg-blue-50/60 bg-white transition-colors"
                  >
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 text-center text-gray-500 font-mono text-[11px] bg-gray-50">
                      {idx + 1}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-2 py-0.5 text-center font-medium text-slate-700">
                      {r.warehouse}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${r.category === '부자재' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-2.5 py-0.5 text-left font-medium text-gray-800 " title={r.supplier}>
                      {r.supplier}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-2 py-0.5 text-center font-mono font-semibold text-gray-700">
                      {r.itemCode}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-3 py-0.5 text-left font-bold text-gray-900 " title={r.itemName}>
                      {r.itemName}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center font-mono text-gray-600">
                      {r.leadTime}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-2 py-0.5 text-center font-mono text-gray-600">
                      {r.expiryDate}
                    </td>
                    {/* 박스 수량 입력 셀 */}
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 p-0 text-right font-mono bg-amber-50/40">
                      <input
                        type="number"
                        value={r.boxQty}
                        onChange={(e) => handleBoxChange(r.id, e.target.value)}
                        className="w-full h-full text-right font-bold text-gray-900 px-2 border-none outline-none focus:ring-1 focus:ring-blue-500 bg-transparent"
                      />
                    </td>
                    {/* 낱개 수량 입력 셀 */}
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 p-0 text-right font-mono bg-amber-50/40">
                      <input
                        type="number"
                        value={r.pieceQty}
                        onChange={(e) => handlePieceChange(r.id, e.target.value)}
                        className="w-full h-full text-right font-bold text-gray-900 px-2 border-none outline-none focus:ring-1 focus:ring-blue-500 bg-transparent"
                      />
                    </td>
                    {/* 현재고 (자동 계산) */}
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-black text-blue-700 bg-blue-50/30">
                      {r.currentStock.toLocaleString()}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-2 py-0.5 text-center font-mono text-gray-600">
                      {r.boxUnitQty}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-2.5 py-0.5 text-right font-mono text-gray-800">
                      {r.unitPrice.toLocaleString()}원
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-3 py-0.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                      {r.amount.toLocaleString()}원
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-200 whitespace-nowrap px-2 py-0.5 text-left text-gray-500 " title={r.remark}>
                      {r.remark || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></EditableTableWrapper>
        </div>

        {/* 4. 하단 요약 서머리 바 */}
        <div className="h-[34px] bg-[#f8fafc] border-t border-gray-300 px-4 flex items-center justify-between text-[12px] font-bold shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-gray-600">
              조회 품목수: <strong className="text-blue-700">{filteredRows.length}</strong>건 / 전체 <strong>{rows.length}</strong>건
            </span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-600">
              기준일자: <strong className="font-mono text-gray-800">{stockDate}</strong>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-600">총 실사수량:</span>
              <span className="font-mono text-blue-700 font-black text-[13px]">{totalQty.toLocaleString()}</span>
              <span className="text-gray-500 text-[11px]">봉(EA)</span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
              <span className="text-gray-600">총 재고금액:</span>
              <span className="font-mono text-emerald-700 font-black text-[14px]">{totalAmount.toLocaleString()}</span>
              <span className="text-gray-500 text-[11px]">원</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
