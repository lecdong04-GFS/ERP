'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ProductionActionBar } from '../common/ProductionActionBar';
import {
  DailyProductionItem,
  INITIAL_DAILY_PRODUCTION_REPORT,
  SHIFT1_CENTER_LIST,
  SHIFT2_CENTER_LIST,
  GSR_SHORTAGE_MONITOR_CENTERS,
  calculateReportTotals,
} from '../data/dailyProductionReportData';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Package,
  Truck,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Search,
  RotateCw,
  Printer,
  Sparkles,
  Layers,
  Info,
} from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';
import { usePrintReport } from '@/context/PrintReportContext';
import { erpConfirm } from '@/context/ConfirmContext';

export const ProductionResultStatusView: React.FC = () => {
  const { openPrintModal } = usePrintReport();
  const [baseDate, setBaseDate] = useState('2026-11-08');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | '삼각' | '줄김밥' | '도시락' | '조리빵'>('ALL');
  const [viewMode, setViewMode] = useState<'SUMMARY' | 'SHIFT1' | 'SHIFT2' | 'FULL'>('SUMMARY');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [items, setItems] = useState<DailyProductionItem[]>(INITIAL_DAILY_PRODUCTION_REPORT);
  const [issueMemo, setIssueMemo] = useState('2026-11-08(일) 정규 수주 59,676개 전량 생산 완료. 미출·결품 0건 정상 출하.');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isModified, setIsModified] = useState(false);

  // ── 1. 데이터 로드 (API) ──
  const loadDailyReport = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/production/daily-report?date=${date}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.items) && json.items.length > 0) {
        setItems(json.items);
        if (json.issueMemo) setIssueMemo(json.issueMemo);
        setIsModified(false);
      }
    } catch (err) {
      console.error('Failed to load daily production report:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDailyReport(baseDate);
  }, [baseDate, loadDailyReport]);

  // ── 2. 날짜 이동 ──
  const handleShiftDay = (direction: -1 | 1) => {
    const cur = new Date(baseDate);
    cur.setDate(cur.getDate() + direction);
    const newStr = cur.toISOString().split('T')[0];
    setBaseDate(newStr);
  };

  // ── 3. 필터링된 품목 ──
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        return item.productName.toLowerCase().includes(kw);
      }
      return true;
    });
  }, [items, categoryFilter, searchKeyword]);

  // ── 4. 통계 및 소계 계산 ──
  const totals = useMemo(() => {
    return calculateReportTotals(filteredItems);
  }, [filteredItems]);

  const allTotals = useMemo(() => {
    return calculateReportTotals(items);
  }, [items]);

  // 카테고리별 그룹핑
  const categoryGroups = useMemo(() => {
    const order: Array<'삼각' | '줄김밥' | '도시락' | '조리빵'> = ['삼각', '줄김밥', '도시락', '조리빵'];
    return order
      .map((cat) => {
        const catItems = filteredItems.filter((i) => i.category === cat);
        return {
          category: cat,
          items: catItems,
          totals: calculateReportTotals(catItems),
        };
      })
      .filter((g) => g.items.length > 0);
  }, [filteredItems]);

  // ── 5. 셀 수량 인라인 수정 ──
  const handleQtyChange = (no: number, field: 'shift1Qty' | 'shift2Qty' | 'totalQty', newVal: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.no === no) {
          let s1 = item.shift1Qty;
          let s2 = item.shift2Qty;
          let tot = item.totalQty;

          if (field === 'shift1Qty') {
            s1 = Math.max(0, newVal);
            tot = s1 + s2;
          } else if (field === 'shift2Qty') {
            s2 = Math.max(0, newVal);
            tot = s1 + s2;
          } else if (field === 'totalQty') {
            tot = Math.max(0, newVal);
            // 58:42 비율 분할
            s1 = Math.round(tot * 0.58);
            s2 = tot - s1;
          }

          const s1Amt = s1 * item.deliveryPrice;
          const s2Amt = s2 * item.deliveryPrice;
          const totAmt = tot * item.deliveryPrice;

          return {
            ...item,
            totalQty: tot,
            totalAmount: totAmt,
            shift1Qty: s1,
            shift1Amount: s1Amt,
            shift2Qty: s2,
            shift2Amount: s2Amt,
          };
        }
        return item;
      })
    );
    setIsModified(true);
  };

  // ── 6. 저장 핸들러 ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/production/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: baseDate,
          issueMemo,
          items,
          createdBy: '관리자',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModified(false);
        alert(`[${baseDate}] GFS 생산일보가 데이터베이스에 성공적으로 저장되었습니다.\n(총 ${items.length}개 품목 실적 동기화 완료)`);
      } else {
        alert('저장 실패: ' + (data.error || '오류가 발생했습니다.'));
      }
    } catch (err: any) {
      alert('저장 중 네트워크 오류가 발생했습니다: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── 7. 엑셀 다운로드 ──
  const handleExportExcel = () => {
    const exportData = items.map((i) => ({
      카테고리: i.category,
      제품명: i.productName,
      납품단가: i.deliveryPrice,
      소비자가: i.retailPrice,
      생산총수량: i.totalQty,
      수량비중: `${i.qtyRatio}%`,
      납품총금액: i.totalAmount,
      금액비중: `${i.amtRatio}%`,
      '1편수량': i.shift1Qty,
      '1편금액': i.shift1Amount,
      '2편수량': i.shift2Qty,
      '2편금액': i.shift2Amount,
      비고: i.remark || '',
    }));

    exportGridToExcel({
      filename: `GFS_생산일보_${baseDate}`,
      sheetName: '생산일보',
      columns: [
        { key: '카테고리', label: '카테고리' },
        { key: '제품명', label: '제품명' },
        { key: '납품단가', label: '납품단가(원)' },
        { key: '소비자가', label: '소비자가(원)' },
        { key: '생산총수량', label: '총생산수량(Ea)' },
        { key: '수량비중', label: '수량비중' },
        { key: '납품총금액', label: '납품총금액(원)' },
        { key: '금액비중', label: '금액비중' },
        { key: '1편수량', label: '1편수량' },
        { key: '1편금액', label: '1편금액' },
        { key: '2편수량', label: '2편수량' },
        { key: '2편금액', label: '2편금액' },
        { key: '비고', label: '비고' },
      ],
      data: exportData,
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px] overflow-hidden">
      {/* ── 1. 최상단 액션 바 ── */}
      <ProductionActionBar
        title="GFS 생산일보 (일일 생산실적 및 거래처별 납품현황)"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', onClick: () => loadDailyReport(baseDate) },
          { key: 'save', label: saving ? '저장중...' : isModified ? '저장*' : '저장', icon: 'save', onClick: handleSave },
          {
            key: 'excel',
            label: '엑셀 다운로드',
            icon: 'excel',
            onClick: handleExportExcel,
          },
          {
            key: 'print',
            label: '인쇄 출력',
            icon: 'print',
            onClick: () => {
              openPrintModal('작업지시서', { date: baseDate, totals: allTotals });
            },
          },
          {
            key: 'reset',
            label: '초기화',
            icon: 'reset',
            onClick: async () => {
              const ok = await erpConfirm('당일 생산일보 데이터를 초기 정본값으로 되돌리시겠습니까?', '생산일보 초기화');
              if (ok) {
                setItems(INITIAL_DAILY_PRODUCTION_REPORT);
                setIsModified(false);
              }
            },
          },
        ]}
        helpContent="GFS 공장 당일 39개 완제품의 원가/소비자가, 1편/2편 분할 생산량, GS리테일 12개 물류센터별 생산수량을 종합 집계하는 공장 정본 생산일보입니다."
      />

      {/* ── 2. 상단 4대 핵심 KPI 콕핏 ── */}
      <div className="bg-white border-b border-gray-300 px-4 py-2.5 shadow-xs">
        <div className="grid grid-cols-4 gap-3">
          {/* KPI 1: 당일 총 생산수량 */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 rounded-md p-2.5 flex items-center justify-between shadow-2xs">
            <div>
              <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                <Package size={13} className="text-amber-600" /> 당일 총 생산수량
              </div>
              <div className="text-[20px] font-extrabold text-amber-950 font-mono tracking-tight mt-0.5">
                {allTotals.totalQty.toLocaleString()} <span className="text-[12px] font-normal text-amber-700">Ea</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-semibold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                달성률 100%
              </span>
              <div className="text-[10px] text-amber-700 mt-1">39개 완제품 합계</div>
            </div>
          </div>

          {/* KPI 2: 총 생산 납품매출액 */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-300 rounded-md p-2.5 flex items-center justify-between shadow-2xs">
            <div>
              <div className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
                <TrendingUp size={13} className="text-emerald-600" /> 총 생산 납품금액 (매출)
              </div>
              <div className="text-[20px] font-extrabold text-emerald-950 font-mono tracking-tight mt-0.5">
                {allTotals.totalAmount.toLocaleString()} <span className="text-[12px] font-normal text-emerald-700">원</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-semibold bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">
                공급가액 기준
              </span>
              <div className="text-[10px] text-emerald-700 mt-1">납품단가 100% 반영</div>
            </div>
          </div>

          {/* KPI 3: 1편 생산실적 */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-300 rounded-md p-2.5 flex items-center justify-between shadow-2xs">
            <div>
              <div className="text-[11px] font-semibold text-blue-800 flex items-center gap-1">
                <Truck size={13} className="text-blue-600" /> 1편 생산 (오전 출하)
              </div>
              <div className="text-[18px] font-bold text-blue-950 font-mono mt-0.5">
                {allTotals.shift1Qty.toLocaleString()} <span className="text-[11px] font-normal text-blue-700">Ea</span>
              </div>
              <div className="text-[11px] text-blue-700 font-mono">
                {allTotals.shift1Amount.toLocaleString()}원
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-extrabold bg-blue-200 text-blue-900 px-2 py-0.5 rounded">
                58.0%
              </span>
              <div className="text-[10px] text-blue-600 mt-1">12개 센터 공급</div>
            </div>
          </div>

          {/* KPI 4: 2편 생산실적 */}
          <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 border border-purple-300 rounded-md p-2.5 flex items-center justify-between shadow-2xs">
            <div>
              <div className="text-[11px] font-semibold text-purple-800 flex items-center gap-1">
                <Truck size={13} className="text-purple-600" /> 2편 생산 (오후 출하)
              </div>
              <div className="text-[18px] font-bold text-purple-950 font-mono mt-0.5">
                {allTotals.shift2Qty.toLocaleString()} <span className="text-[11px] font-normal text-purple-700">Ea</span>
              </div>
              <div className="text-[11px] text-purple-700 font-mono">
                {allTotals.shift2Amount.toLocaleString()}원
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-extrabold bg-purple-200 text-purple-900 px-2 py-0.5 rounded">
                42.0%
              </span>
              <div className="text-[10px] text-purple-600 mt-1">특판 535개 포함</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. 이미지 정본 헤더 배너 (Issue & Memo + 미출 현황표 + 추가발주) ── */}
      <div className="bg-[#f8fafc] border-b border-gray-300 px-4 py-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
        {/* 주요 Issue & Memo 바 */}
        <div className="flex-1 bg-amber-400/90 text-amber-950 rounded px-3 py-1.5 flex items-center gap-2 shadow-2xs border border-amber-500">
          <span className="font-extrabold text-[11.5px] whitespace-nowrap bg-amber-600 text-white px-2 py-0.5 rounded">
            주요 Issue & Memo
          </span>
          <input
            type="text"
            value={issueMemo}
            onChange={(e) => {
              setIssueMemo(e.target.value);
              setIsModified(true);
            }}
            placeholder="당일 공장 생산 이슈 및 특이사항 입력..."
            className="flex-1 bg-white/90 text-[12px] font-medium text-gray-800 px-2 py-1 rounded border border-amber-500 focus:outline-none focus:bg-white"
          />
        </div>

        {/* 미출 현황표 배너 & 추가발주 박스 */}
        <div className="flex items-center gap-2">
          {/* 미출 현황표 모니터 */}
          <div className="bg-[#e0f2fe] border border-sky-300 rounded px-2.5 py-1 flex items-center gap-2 shadow-2xs">
            <div className="flex flex-col">
              <div className="text-[10px] font-extrabold text-sky-900 flex items-center gap-1">
                <CheckCircle2 size={11} className="text-sky-600" /> GSR 12개 센터 미출 현황
              </div>
              <div className="text-[11px] font-bold text-sky-800">
                미출: <span className="text-emerald-700 font-extrabold font-mono">0건</span> (수량: 0 / 금액: 0원)
              </div>
            </div>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-300">
              클린 출하 완료
            </span>
          </div>

          {/* 추가발주 박스 */}
          <div className="bg-[#fce7f3] border border-pink-300 rounded px-3 py-1 flex items-center gap-1.5 shadow-2xs">
            <span className="text-[11px] font-extrabold text-pink-900">추가발주</span>
            <span className="text-[11px] font-bold text-pink-700 font-mono">0건 (정규 수주 마감)</span>
          </div>
        </div>
      </div>

      {/* ── 4. 검색 필터 & 뷰 모드 전환 바 ── */}
      <div className="bg-[#e2e8f0] border-b border-gray-300 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-[12px]">
        {/* 좌측: 날짜 선택기 & 카테고리 탭 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 날짜 선택기 */}
          <div className="flex items-center bg-white border border-gray-300 rounded shadow-2xs overflow-hidden">
            <button
              onClick={() => handleShiftDay(-1)}
              className="p-1.5 hover:bg-gray-100 text-gray-600 border-r border-gray-200"
              title="이전 날짜"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex items-center gap-1 px-2.5 py-1">
              <Calendar size={13} className="text-blue-700" />
              <input
                type="date"
                value={baseDate}
                onChange={(e) => setBaseDate(e.target.value)}
                className="font-mono text-[12px] font-bold text-gray-800 outline-none bg-transparent cursor-pointer"
              />
            </div>
            <button
              onClick={() => handleShiftDay(1)}
              className="p-1.5 hover:bg-gray-100 text-gray-600 border-l border-gray-200"
              title="다음 날짜"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* 카테고리 필터 탭 */}
          <div className="flex bg-gray-200 p-0.5 rounded border border-gray-300">
            {[
              { id: 'ALL', label: `전체 (${allTotals.totalQty > 0 ? 39 : items.length})` },
              { id: '삼각', label: '삼각 (12)' },
              { id: '줄김밥', label: '줄김밥 (13)' },
              { id: '도시락', label: '도시락 (12)' },
              { id: '조리빵', label: '조리빵 (2)' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id as any)}
                className={`px-2.5 py-1 rounded text-[11.5px] font-semibold transition-all ${
                  categoryFilter === cat.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-gray-700 hover:text-black hover:bg-gray-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* 우측: 뷰 모드 탭 & 제품 검색 */}
        <div className="flex items-center gap-2">
          {/* 뷰 모드 전환 버튼 */}
          <div className="flex bg-gray-200 p-0.5 rounded border border-gray-300">
            <button
              onClick={() => setViewMode('SUMMARY')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 ${
                viewMode === 'SUMMARY' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-gray-700 hover:bg-gray-300'
              }`}
            >
              📊 종합 실적
            </button>
            <button
              onClick={() => setViewMode('SHIFT1')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 ${
                viewMode === 'SHIFT1' ? 'bg-blue-600 text-white shadow-2xs' : 'text-gray-700 hover:bg-gray-300'
              }`}
            >
              🚚 1편 센터별 (12개)
            </button>
            <button
              onClick={() => setViewMode('SHIFT2')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 ${
                viewMode === 'SHIFT2' ? 'bg-purple-600 text-white shadow-2xs' : 'text-gray-700 hover:bg-gray-300'
              }`}
            >
              🚛 2편 센터별 (10개)
            </button>
            <button
              onClick={() => setViewMode('FULL')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 ${
                viewMode === 'FULL' ? 'bg-amber-600 text-white shadow-2xs' : 'text-gray-700 hover:bg-gray-300'
              }`}
            >
              🌐 전체 매트릭스
            </button>
          </div>

          {/* 검색창 */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="제품명 검색..."
              className="pl-7 pr-2.5 py-1 bg-white border border-gray-300 rounded text-[11.5px] w-36 focus:outline-none focus:w-48 transition-all focus:border-blue-600"
            />
          </div>
        </div>
      </div>

      {/* ── 5. 메인 생산일보 데이터 테이블 ── */}
      <div className="flex-1 overflow-auto bg-white p-3">
        <div className="border border-gray-300 shadow-sm rounded-xs overflow-hidden">
          <table className="w-full border-collapse text-[11.5px] font-sans">
            {/* 테이블 헤더 */}
            <thead>
              <tr className="bg-[#cbd5e1] text-gray-800 font-bold border-b border-gray-400 text-center select-none">
                <th className="py-2 px-1 border-r border-gray-300 w-10">구분</th>
                <th className="py-2 px-2 border-r border-gray-300 min-w-[190px] text-left">제 품 명</th>
                <th className="py-2 px-1.5 border-r border-gray-300 w-16 bg-[#e2e8f0]">납품단가</th>
                <th className="py-2 px-1.5 border-r border-gray-300 w-16 bg-[#e2e8f0]">소비자가</th>

                {/* 당일 집계 열 */}
                {(viewMode === 'SUMMARY' || viewMode === 'FULL') && (
                  <>
                    <th className="py-2 px-1.5 border-r border-gray-300 w-20 bg-amber-100 text-amber-950">당일수량</th>
                    <th className="py-2 px-1 border-r border-gray-300 w-12 bg-amber-50 text-amber-900">(%)</th>
                    <th className="py-2 px-2 border-r border-gray-300 w-28 bg-amber-100 text-amber-950">납품총금액</th>
                    <th className="py-2 px-1 border-r border-gray-300 w-12 bg-amber-50 text-amber-900">(%)</th>
                    <th className="py-2 px-1.5 border-r border-gray-300 w-20 bg-blue-100 text-blue-950">1편 수량</th>
                    <th className="py-2 px-2 border-r border-gray-300 w-24 bg-blue-50 text-blue-900">1편 금액</th>
                    <th className="py-2 px-1.5 border-r border-gray-300 w-20 bg-purple-100 text-purple-950">2편 수량</th>
                    <th className="py-2 px-2 border-r border-gray-300 w-24 bg-purple-50 text-purple-900">2편 금액</th>
                  </>
                )}

                {/* 1편 거래처별 열 */}
                {(viewMode === 'SHIFT1' || viewMode === 'FULL') && (
                  <>
                    {SHIFT1_CENTER_LIST.map((c) => (
                      <th
                        key={c}
                        className={`py-2 px-1 border-r border-gray-300 w-14 text-center ${
                          c.startsWith('신양산') ? 'bg-amber-200 text-amber-950' : 'bg-blue-100 text-blue-950'
                        }`}
                      >
                        {c}
                      </th>
                    ))}
                  </>
                )}

                {/* 2편 거래처별 열 */}
                {(viewMode === 'SHIFT2' || viewMode === 'FULL') && (
                  <>
                    {SHIFT2_CENTER_LIST.map((c) => (
                      <th
                        key={c}
                        className={`py-2 px-1 border-r border-gray-300 w-14 text-center ${
                          c === '특판' ? 'bg-fuchsia-200 text-fuchsia-950 font-extrabold' : 'bg-purple-100 text-purple-950'
                        }`}
                      >
                        {c}
                      </th>
                    ))}
                  </>
                )}
                <th className="py-2 px-2 w-28 text-left">비고</th>
              </tr>

              {/* ── 최상단 GRAND TOTAL 행 (이미지 원본 Gold 하이라이트) ── */}
              <tr className="bg-[#fef3c7] text-amber-950 font-black border-b-2 border-amber-500 text-center text-[12px] shadow-2xs">
                <td className="py-2 px-1 border-r border-amber-300">Total</td>
                <td className="py-2 px-2 border-r border-amber-300 text-left font-extrabold text-amber-900">
                  {filteredItems.length}Unit (전체 총계)
                </td>
                <td className="py-2 px-1.5 border-r border-amber-300 text-gray-500">-</td>
                <td className="py-2 px-1.5 border-r border-amber-300 text-gray-500">-</td>

                {(viewMode === 'SUMMARY' || viewMode === 'FULL') && (
                  <>
                    <td className="py-2 px-1.5 border-r border-amber-300 text-right font-mono font-extrabold text-[12.5px]">
                      {totals.totalQty.toLocaleString()}
                    </td>
                    <td className="py-2 px-1 border-r border-amber-300 text-center font-mono">100.0%</td>
                    <td className="py-2 px-2 border-r border-amber-300 text-right font-mono font-extrabold text-[12.5px] text-amber-900">
                      {totals.totalAmount.toLocaleString()}
                    </td>
                    <td className="py-2 px-1 border-r border-amber-300 text-center font-mono">100.0%</td>
                    <td className="py-2 px-1.5 border-r border-amber-300 text-right font-mono font-bold text-blue-900">
                      {totals.shift1Qty.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 border-r border-amber-300 text-right font-mono font-bold text-blue-900">
                      {totals.shift1Amount.toLocaleString()}
                    </td>
                    <td className="py-2 px-1.5 border-r border-amber-300 text-right font-mono font-bold text-purple-900">
                      {totals.shift2Qty.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 border-r border-amber-300 text-right font-mono font-bold text-purple-900">
                      {totals.shift2Amount.toLocaleString()}
                    </td>
                  </>
                )}

                {(viewMode === 'SHIFT1' || viewMode === 'FULL') && (
                  <>
                    {SHIFT1_CENTER_LIST.map((c) => (
                      <td key={c} className="py-2 px-1 border-r border-amber-300 text-right font-mono font-bold text-blue-950">
                        {totals.shift1Centers[c]?.toLocaleString() || 0}
                      </td>
                    ))}
                  </>
                )}

                {(viewMode === 'SHIFT2' || viewMode === 'FULL') && (
                  <>
                    {SHIFT2_CENTER_LIST.map((c) => (
                      <td key={c} className="py-2 px-1 border-r border-amber-300 text-right font-mono font-bold text-purple-950">
                        {totals.shift2Centers[c]?.toLocaleString() || 0}
                      </td>
                    ))}
                  </>
                )}
                <td className="py-2 px-2 text-left text-[11px] text-amber-900">100% 정상 출하</td>
              </tr>
            </thead>

            {/* 테이블 본문 */}
            <tbody>
              {categoryGroups.map((group) => (
                <React.Fragment key={group.category}>
                  {group.items.map((item, idx) => {
                    return (
                      <tr
                        key={item.no}
                        className={`border-b border-gray-200 transition-colors hover:bg-amber-50/50 ${
                          idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'
                        }`}
                      >
                        {/* 카테고리 구분 열 (그룹 첫 번째 행에만 rowspan) */}
                        {idx === 0 ? (
                          <td
                            rowSpan={group.items.length + 1}
                            className="py-2 px-1 border-r border-gray-300 text-center font-extrabold bg-[#f1f5f9] text-gray-800 align-middle"
                          >
                            {group.category}
                          </td>
                        ) : null}

                        {/* 제품명 */}
                        <td className="py-1.5 px-2 border-r border-gray-300 font-medium text-gray-900 truncate">
                          {item.productName}
                        </td>

                        {/* 단가 2종 */}
                        <td className="py-1.5 px-1.5 border-r border-gray-300 text-right font-mono text-gray-700 bg-gray-50">
                          {item.deliveryPrice.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-1.5 border-r border-gray-300 text-right font-mono text-gray-600 bg-gray-50">
                          {item.retailPrice.toLocaleString()}
                        </td>

                        {/* 당일 집계 */}
                        {(viewMode === 'SUMMARY' || viewMode === 'FULL') && (
                          <>
                            <td className="py-1.5 px-1.5 border-r border-gray-300 text-right font-mono font-bold text-gray-900 bg-amber-50/30">
                              <input
                                type="number"
                                value={item.totalQty}
                                onChange={(e) => handleQtyChange(item.no, 'totalQty', Number(e.target.value) || 0)}
                                className="w-full text-right bg-transparent font-mono font-bold focus:outline-none focus:bg-white focus:border-amber-500 rounded px-1"
                              />
                            </td>
                            <td className="py-1.5 px-1 border-r border-gray-300 text-center font-mono text-gray-500 text-[10.5px]">
                              {item.qtyRatio}%
                            </td>
                            <td className="py-1.5 px-2 border-r border-gray-300 text-right font-mono font-semibold text-gray-900 bg-amber-50/30">
                              {item.totalAmount.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-1 border-r border-gray-300 text-center font-mono text-gray-500 text-[10.5px]">
                              {item.amtRatio}%
                            </td>
                            <td className="py-1.5 px-1.5 border-r border-gray-300 text-right font-mono text-blue-900">
                              <input
                                type="number"
                                value={item.shift1Qty}
                                onChange={(e) => handleQtyChange(item.no, 'shift1Qty', Number(e.target.value) || 0)}
                                className="w-full text-right bg-transparent font-mono text-blue-900 focus:outline-none focus:bg-white focus:border-blue-500 rounded px-1"
                              />
                            </td>
                            <td className="py-1.5 px-2 border-r border-gray-300 text-right font-mono text-blue-800">
                              {item.shift1Amount.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-1.5 border-r border-gray-300 text-right font-mono text-purple-900">
                              <input
                                type="number"
                                value={item.shift2Qty}
                                onChange={(e) => handleQtyChange(item.no, 'shift2Qty', Number(e.target.value) || 0)}
                                className="w-full text-right bg-transparent font-mono text-purple-900 focus:outline-none focus:bg-white focus:border-purple-500 rounded px-1"
                              />
                            </td>
                            <td className="py-1.5 px-2 border-r border-gray-300 text-right font-mono text-purple-800">
                              {item.shift2Amount.toLocaleString()}
                            </td>
                          </>
                        )}

                        {/* 1편 센터별 수량 */}
                        {(viewMode === 'SHIFT1' || viewMode === 'FULL') && (
                          <>
                            {SHIFT1_CENTER_LIST.map((c) => {
                              const qty = item.shift1Centers[c] || 0;
                              const isHighlighted = item.highlightShift1Centers?.includes(c);
                              return (
                                <td
                                  key={c}
                                  className={`py-1 px-1 border-r border-gray-200 text-right font-mono ${
                                    isHighlighted
                                      ? 'bg-rose-200 text-rose-950 font-black ring-1 ring-rose-400'
                                      : qty === 0
                                      ? 'text-gray-300'
                                      : 'text-gray-800'
                                  }`}
                                >
                                  {qty > 0 ? qty.toLocaleString() : '0'}
                                </td>
                              );
                            })}
                          </>
                        )}

                        {/* 2편 센터별 수량 */}
                        {(viewMode === 'SHIFT2' || viewMode === 'FULL') && (
                          <>
                            {SHIFT2_CENTER_LIST.map((c) => {
                              const qty = item.shift2Centers[c] || 0;
                              const isHighlighted = item.highlightShift2Centers?.includes(c);
                              return (
                                <td
                                  key={c}
                                  className={`py-1 px-1 border-r border-gray-200 text-right font-mono ${
                                    isHighlighted
                                      ? 'bg-rose-200 text-rose-950 font-black ring-1 ring-rose-400'
                                      : qty === 0
                                      ? 'text-gray-300'
                                      : c === '특판'
                                      ? 'text-fuchsia-950 font-bold bg-fuchsia-50/50'
                                      : 'text-gray-800'
                                  }`}
                                >
                                  {qty > 0 ? qty.toLocaleString() : '0'}
                                </td>
                              );
                            })}
                          </>
                        )}

                        {/* 비고 */}
                        <td className="py-1.5 px-2 text-left text-[11px] text-gray-500 truncate">
                          {item.remark || ''}
                        </td>
                      </tr>
                    );
                  })}

                  {/* ── 카테고리별 소계 행 ── */}
                  <tr className="bg-gray-100 font-bold text-gray-900 border-b border-gray-400 text-center">
                    <td className="py-1.5 px-2 border-r border-gray-300 text-left font-bold text-gray-800 bg-gray-200">
                      {group.items.length} Unit ({group.category} 소계)
                    </td>
                    <td className="py-1.5 px-1.5 border-r border-gray-300 text-gray-400">-</td>
                    <td className="py-1.5 px-1.5 border-r border-gray-300 text-gray-400">-</td>

                    {(viewMode === 'SUMMARY' || viewMode === 'FULL') && (
                      <>
                        <td className="py-1.5 px-1.5 border-r border-gray-300 text-right font-mono font-bold text-amber-900 bg-amber-50">
                          {group.totals.totalQty.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-1 border-r border-gray-300 text-center font-mono text-[11px]">
                          {((group.totals.totalQty / allTotals.totalQty) * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-2 border-r border-gray-300 text-right font-mono font-bold text-amber-900 bg-amber-50">
                          {group.totals.totalAmount.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-1 border-r border-gray-300 text-center font-mono text-[11px]">
                          {((group.totals.totalAmount / allTotals.totalAmount) * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-1.5 border-r border-gray-300 text-right font-mono font-bold text-blue-900">
                          {group.totals.shift1Qty.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-2 border-r border-gray-300 text-right font-mono font-bold text-blue-900">
                          {group.totals.shift1Amount.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-1.5 border-r border-gray-300 text-right font-mono font-bold text-purple-900">
                          {group.totals.shift2Qty.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-2 border-r border-gray-300 text-right font-mono font-bold text-purple-900">
                          {group.totals.shift2Amount.toLocaleString()}
                        </td>
                      </>
                    )}

                    {(viewMode === 'SHIFT1' || viewMode === 'FULL') && (
                      <>
                        {SHIFT1_CENTER_LIST.map((c) => (
                          <td key={c} className="py-1.5 px-1 border-r border-gray-300 text-right font-mono font-bold text-blue-900">
                            {group.totals.shift1Centers[c]?.toLocaleString() || 0}
                          </td>
                        ))}
                      </>
                    )}

                    {(viewMode === 'SHIFT2' || viewMode === 'FULL') && (
                      <>
                        {SHIFT2_CENTER_LIST.map((c) => (
                          <td key={c} className="py-1.5 px-1 border-r border-gray-300 text-right font-mono font-bold text-purple-900">
                            {group.totals.shift2Centers[c]?.toLocaleString() || 0}
                          </td>
                        ))}
                      </>
                    )}
                    <td className="py-1.5 px-2 text-left text-gray-500 font-normal">카테고리 소계</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
