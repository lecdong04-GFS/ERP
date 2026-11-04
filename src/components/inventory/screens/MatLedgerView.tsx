'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  Search,
  RotateCcw,
  Printer,
  Download,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { usePipeline } from '@/context/PipelineContext';
import { usePrintReport } from '@/context/PrintReportContext';
import { exportGridToExcel } from '@/lib/excelExport';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

interface MatLedgerRow {
  id: number;
  ledgerDate: string;
  category: string;
  partName: string;
  partSpec: string;
  unit: string;
  warehouse: string;
  carriedOverQty: number; // 이월재고량
  inQty: number; // 입고량
  outQty: number; // 출고량
  currentStock: number; // 현재고
  unitPrice: number;
  stockAmount: number;
  txnType: string;
  refNo: string;
  remark: string;
}

export const MatLedgerView: React.FC = () => {
  const { openPipelineModal } = usePipeline();
  const { openPrintModal } = usePrintReport();

  // 검색 조건
  const [startDate, setStartDate] = useState(() => kstDaysAgo(7));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [periodPreset, setPeriodPreset] = useState<string>('7days');
  const [keyword, setKeyword] = useState<string>('');
  const [txnTypeFilter, setTxnTypeFilter] = useState<string>('전체');

  const [ledgerData, setLedgerData] = useState<MatLedgerRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // 자재수불부 데이터 조회
  const loadLedger = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/inventory/ledger', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setLedgerData(
          json.data.map((item: any, idx: number) => ({
            id: item.id ?? idx + 1,
            ledgerDate: item.ledgerDate || String(item.createdAt || '').slice(0, 10),
            category: item.category || '원재료',
            partName: item.productName || item.product?.name || '',
            partSpec: item.product?.spec || '',
            unit: item.unit || 'ea',
            warehouse: item.warehouse || item.product?.warehouse || '냉장',
            carriedOverQty: Number(item.carryOverQty) || 0,
            inQty: Number(item.inQty) || 0,
            outQty: Number(item.outQty) || 0,
            currentStock: Number(item.currentQty) || 0,
            unitPrice: Number(item.unitPrice) || 0,
            stockAmount: Number(item.stockAmount) || 0,
            txnType: item.txnType || '정규입고',
            refNo: item.refNo || '',
            remark: item.remark || '',
          }))
        );
      } else {
        setLedgerData([]);
      }
    } catch (err) {
      console.error('Fetch ledger failed:', err);
      setLedgerData([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  // 빠른 기간 선택 프리셋
  const handleSelectPeriod = (preset: 'today' | '7days' | '30days' | 'thisMonth') => {
    setPeriodPreset(preset);
    const today = kstToday();
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === '7days') {
      setStartDate(kstDaysAgo(6));
      setEndDate(today);
    } else if (preset === '30days') {
      setStartDate(kstDaysAgo(29));
      setEndDate(today);
    } else if (preset === 'thisMonth') {
      const firstDay = today.slice(0, 8) + '01';
      setStartDate(firstDay);
      setEndDate(today);
    }
  };

  // 필터링된 수불부 목록
  const filteredData = useMemo(() => {
    return ledgerData.filter((r) => {
      const d = r.ledgerDate || '';
      if (d < startDate || d > endDate) return false;
      if (txnTypeFilter !== '전체' && r.txnType !== txnTypeFilter) return false;
      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        const matchName = r.partName.toLowerCase().includes(kw);
        const matchRef = r.refNo.toLowerCase().includes(kw);
        const matchRemark = r.remark.toLowerCase().includes(kw);
        if (!matchName && !matchRef && !matchRemark) return false;
      }
      return true;
    });
  }, [ledgerData, startDate, endDate, txnTypeFilter, keyword]);

  // 상단 KPI 집계
  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let totalCurrent = 0;
    let totalAmount = 0;
    filteredData.forEach((r) => {
      totalIn += r.inQty;
      totalOut += r.outQty;
      totalCurrent += r.currentStock;
      totalAmount += r.stockAmount || r.currentStock * r.unitPrice;
    });
    return {
      totalIn,
      totalOut,
      totalCurrent,
      totalAmount,
      count: filteredData.length,
    };
  }, [filteredData]);

  // 엑셀 내보내기
  const handleExportExcel = () => {
    const exportData = filteredData.map((r, idx) => ({
      No: idx + 1,
      수불일자: r.ledgerDate,
      구분: r.category,
      품목명: r.partName,
      규격: r.partSpec,
      단위: r.unit,
      창고: r.warehouse,
      거래구분: r.txnType,
      전표번호: r.refNo,
      이월재고: r.carriedOverQty,
      입고량: r.inQty,
      출고량: r.outQty,
      현재고: r.currentStock,
      단가: r.unitPrice,
      재고금액: r.stockAmount,
      비고: r.remark,
    }));

    exportGridToExcel({
      filename: `자재수불부_${startDate}_${endDate}`,
      sheetName: '자재수불부',
      columns: [
        { key: 'No', label: 'No' },
        { key: '수불일자', label: '수불일자' },
        { key: '구분', label: '구분' },
        { key: '품목명', label: '품목명' },
        { key: '규격', label: '규격' },
        { key: '단위', label: '단위' },
        { key: '창고', label: '창고' },
        { key: '거래구분', label: '거래구분' },
        { key: '전표번호', label: '전표번호' },
        { key: '이월재고', label: '이월재고' },
        { key: '입고량', label: '입고량(+)' },
        { key: '출고량', label: '출고량(-)' },
        { key: '현재고', label: '현재고' },
        { key: '단가', label: '단가' },
        { key: '재고금액', label: '재고금액' },
        { key: '비고', label: '비고' },
      ],
      data: exportData,
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 text-slate-800 p-4 sm:p-5 overflow-hidden gap-3.5 select-none font-sans">
      {/* ── 1. 상단 마스터 헤더 & KPI 카드 ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs shrink-0 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-black tracking-wide">
                재고 수불 장부
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                자재수불부 <span className="text-indigo-600 font-extrabold">(입출고 거래통장)</span>
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                실시간 재고 원장 동기화
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-slate-500 font-medium">
              거래처 입고(GSR) 및 생산 출고에 따른 기초 이월, 입고량(+), 출고량(-), 최종 기말 현재고 변동 이력을 통장처럼 투명하게 추적합니다.
            </p>
          </div>

          {/* 액션 버튼 그룹 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[13px] font-bold transition cursor-pointer"
              title="엑셀 다운로드"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>엑셀 다운로드</span>
            </button>

            <button
              type="button"
              onClick={() => openPrintModal('MATERIAL_LEDGER')}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[13px] font-bold transition cursor-pointer"
              title="A4 수불부 인쇄"
            >
              <Printer className="w-4 h-4 text-blue-600" />
              <span>수불부 인쇄(A4)</span>
            </button>

            <button
              type="button"
              onClick={() => void loadLedger()}
              disabled={loadingList}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[13px] font-bold transition cursor-pointer disabled:opacity-50"
              title="수불 내역 새로고침"
            >
              <RefreshCw className={`w-4 h-4 text-blue-600 ${loadingList ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 핵심 KPI 4종 지표 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11.5px] font-bold text-emerald-700">기간 총 입고량 (가산+)</span>
              <div className="text-lg sm:text-xl font-black font-mono text-emerald-900 tracking-tight mt-0.5">
                +{stats.totalIn.toLocaleString()} <span className="text-xs font-sans">ea/box</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-rose-50/60 rounded-xl p-3 border border-rose-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11.5px] font-bold text-rose-700">기간 총 생산출고량 (차감-)</span>
              <div className="text-lg sm:text-xl font-black font-mono text-rose-900 tracking-tight mt-0.5">
                -{stats.totalOut.toLocaleString()} <span className="text-xs font-sans">ea/box</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-blue-50/60 rounded-xl p-3 border border-blue-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11.5px] font-bold text-blue-700">기말 현재고 합계</span>
              <div className="text-lg sm:text-xl font-black font-mono text-blue-900 tracking-tight mt-0.5">
                {stats.totalCurrent.toLocaleString()}{' '}
                <span className="text-xs font-sans">ea/box</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11.5px] font-bold text-slate-500">수불 거래 건수</span>
              <div className="text-lg sm:text-xl font-black font-mono text-slate-800 tracking-tight mt-0.5">
                {stats.count.toLocaleString()} <span className="text-xs font-sans">건</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-200/70 text-slate-700 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. 기간 및 검색 필터 바 ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs shrink-0 flex flex-wrap items-center justify-between gap-3">
        {/* 빠른 기간 프리셋 버튼 그룹 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleSelectPeriod('today')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodPreset === 'today'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('7days')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodPreset === '7days'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              최근 7일
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('30days')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodPreset === '30days'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              최근 30일
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('thisMonth')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodPreset === 'thisMonth'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              이번 달
            </button>
          </div>

          {/* 달력 날짜 직접 지정 */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="bg-transparent font-mono font-bold text-slate-800 outline-none w-28"
            />
            <span className="text-slate-400">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="bg-transparent font-mono font-bold text-slate-800 outline-none w-28"
            />
          </div>
        </div>

        {/* 거래구분 필터 & 검색 */}
        <div className="flex items-center gap-2.5">
          <select
            value={txnTypeFilter}
            onChange={(e) => setTxnTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="전체">전체 거래구분</option>
            <option value="정규입고">정규입고 (GSR)</option>
            <option value="생산출고">생산출고</option>
            <option value="재고조정">재고실사 조정</option>
          </select>

          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="품목명 / 전표번호 / 비고 검색..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* ── 3. 자재수불부 메인 거래내역 테이블 ── */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col">
        <div className="flex-1 overflow-auto">
          {loadingList ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-16 gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
              <div className="text-sm font-bold text-slate-600">
                자재수불부 거래 원장을 불러오고 있습니다...
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 text-[13px] font-black border-b border-slate-200 uppercase tracking-tight select-none">
                <tr>
                  <th className="py-3 px-3 text-center w-12">No</th>
                  <th className="py-3 px-3 w-28 text-center">수불일자</th>
                  <th className="py-3 px-3 w-28 text-center">거래구분</th>
                  <th className="py-3 px-3.5 w-32 text-center">전표번호</th>
                  <th className="py-3 px-4 min-w-[220px]">품목명</th>
                  <th className="py-3 px-3 w-24 text-center">규격/단위</th>
                  <th className="py-3 px-3 w-24 text-center">창고</th>
                  <th className="py-3 px-3 w-28 text-right bg-slate-200/50">이월재고</th>
                  <th className="py-3 px-3 w-28 text-right bg-emerald-50 text-emerald-900 border-x border-emerald-100">
                    입고량(+)
                  </th>
                  <th className="py-3 px-3 w-28 text-right bg-rose-50 text-rose-900 border-r border-rose-100">
                    출고량(-)
                  </th>
                  <th className="py-3 px-3.5 w-32 text-right bg-blue-50/70 font-black text-blue-900">
                    현재고
                  </th>
                  <th className="py-3 px-4 min-w-[160px]">적요 / 비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13.5px]">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-20 text-center">
                      <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                        <Package className="w-12 h-12 text-slate-300" />
                        <div className="text-[15px] font-black text-slate-700">
                          조회 기간({startDate} ~ {endDate}) 내 수불 거래 내역이 없습니다.
                        </div>
                        <p className="text-[13px] text-slate-500">
                          상단에서 기간을 넓히거나 다른 검색 조건을 선택해 주세요.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      {/* No */}
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-xs">
                        {idx + 1}
                      </td>

                      {/* 수불일자 */}
                      <td className="py-2.5 px-3 text-center font-mono text-xs font-bold text-slate-700">
                        {row.ledgerDate}
                      </td>

                      {/* 거래구분 뱃지 */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black border ${
                            row.txnType.includes('입고')
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : row.txnType.includes('출고')
                              ? 'bg-rose-50 text-rose-700 border-rose-300'
                              : 'bg-amber-50 text-amber-700 border-amber-300'
                          }`}
                        >
                          {row.txnType}
                        </span>
                      </td>

                      {/* 전표번호 */}
                      <td className="py-2.5 px-3.5 text-center font-mono text-xs text-slate-600">
                        {row.refNo || '-'}
                      </td>

                      {/* 품목명 */}
                      <td className="py-2.5 px-4 font-black text-slate-900 tracking-tight">
                        {row.partName}
                      </td>

                      {/* 규격/단위 */}
                      <td className="py-2.5 px-3 text-center text-slate-500 text-xs font-medium">
                        {row.partSpec || '-'} {row.unit ? `(${row.unit})` : ''}
                      </td>

                      {/* 창고 */}
                      <td className="py-2.5 px-3 text-center text-slate-600 text-xs font-medium">
                        {row.warehouse || '냉장'}
                      </td>

                      {/* 이월재고 */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 text-xs bg-slate-50/50">
                        {row.carriedOverQty.toLocaleString()}
                      </td>

                      {/* 입고량(+) */}
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700 bg-emerald-50/30">
                        {row.inQty > 0 ? `+${row.inQty.toLocaleString()}` : '-'}
                      </td>

                      {/* 출고량(-) */}
                      <td className="py-2.5 px-3 text-right font-mono font-black text-rose-700 bg-rose-50/30">
                        {row.outQty > 0 ? `-${row.outQty.toLocaleString()}` : '-'}
                      </td>

                      {/* 현재고 (통장 잔액) */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-black text-[14px] text-blue-900 bg-blue-50/40">
                        {row.currentStock.toLocaleString()}{' '}
                        <span className="text-[11px] font-sans font-normal text-slate-500">
                          {row.unit}
                        </span>
                      </td>

                      {/* 적요 / 비고 */}
                      <td className="py-2.5 px-4 text-xs text-slate-500 truncate max-w-[200px]" title={row.remark}>
                        {row.remark || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── 하단 요약 바 ── */}
        <div className="bg-slate-100 border-t border-slate-300 px-5 py-3 flex flex-wrap items-center justify-between text-[13.5px] font-extrabold shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-slate-600">조회 기간:</span>
            <span className="font-mono text-slate-900 font-bold">
              {startDate} ~ {endDate}
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">표시 거래건수:</span>
            <span className="text-indigo-700 font-mono font-black">{filteredData.length}건</span>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <span className="text-slate-600 mr-2">기간 총 입고량:</span>
              <span className="font-mono font-black text-emerald-700 text-base">
                +{stats.totalIn.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-600 mr-2">기간 총 출고량:</span>
              <span className="font-mono font-black text-rose-700 text-base">
                -{stats.totalOut.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-600 mr-2">기말 현재고 합계:</span>
              <span className="font-mono font-black text-blue-900 text-lg">
                {stats.totalCurrent.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
