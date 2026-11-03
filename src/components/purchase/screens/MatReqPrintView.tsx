'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '../common/PurchaseDataGrid';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  RotateCw,
  Printer,
  FileSpreadsheet,
  AlertTriangle,
  PackageCheck,
  TrendingUp,
  Layers,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { usePrintReport } from '@/context/PrintReportContext';
import { exportGridToExcel } from '@/lib/excelExport';

export interface MatReqRow {
  id: number;
  partCategory: string; // '원재료' | '부재료' | '포장재'
  partCode: string;
  partName: string;
  partSpec: string;
  partUnit: string;
  gyeName: string;
  recipeYield: number;
  reqCalcQty: number;
  reqQty1: number;
  reqQty2: number;
  currentStock: number;
  safetyStock: number;
  shortageQty: number;
  orderQty: number;
  orderUnit: string;
  unitPrice: number;
  totalAmt: number;
  supplier: string;
  remark: string;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'partCategory', label: '구분', width: '70px', align: 'center' },
  { key: 'partCode', label: '자재코드', width: '105px', align: 'center' },
  { key: 'partName', minWidth: '240px', label: '자재명 (파트명)', align: 'left' },
  { key: 'partSpec', label: '규격', width: '100px', align: 'center' },
  { key: 'partUnit', label: '단위', width: '50px', align: 'center' },
  { key: 'gyeName', label: '투입공정(계)', width: '135px', align: 'left' },
  { key: 'recipeYield', label: '수율(%)', width: '65px', align: 'right' },
  {
    key: 'reqCalcQty',
    label: '소요계산수량',
    width: '95px',
    align: 'right',
    format: 'number',
    highlight: true,
  },
  { key: 'currentStock', label: '현재고', width: '85px', align: 'right', format: 'number' },
  {
    key: 'shortageQty',
    label: '부족수량',
    width: '85px',
    align: 'right',
    format: 'number',
  },
  { key: 'orderQty', label: '추천발주량', width: '85px', align: 'right', format: 'number' },
  { key: 'orderUnit', label: '발주단위', width: '65px', align: 'center' },
  { key: 'unitPrice', label: '매입단가', width: '80px', align: 'right', format: 'currency' },
  { key: 'totalAmt', label: '발주예상액', width: '95px', align: 'right', format: 'currency' },
  { key: 'supplier', label: '거래처/매입처', width: '120px', align: 'left' },
  { key: 'remark', label: '상태/비고', width: '130px', align: 'left' },
];

export const MatReqPrintView: React.FC = () => {
  const { openPrintModal, setMatReqPayload } = usePrintReport();

  // 검색 조건 상태
  const [reqDate, setReqDate] = useState<string>(kstToday());
  const [shift, setShift] = useState<'ALL' | '1편' | '2편'>('ALL');
  const [selectedGye, setSelectedGye] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // 데이터 상태
  const [data, setData] = useState<MatReqRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gyeList, setGyeList] = useState<string[]>([]);
  const [latestDateWithOrders, setLatestDateWithOrders] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    totalItemCount: 0,
    totalReqQty: 0,
    totalShortageCount: 0,
    totalOrderAmt: 0,
    totalFinishedOrderQty: 0,
    totalFinishedItemCount: 0,
    orderCount: 0,
  });

  // 데이터 로드 함수
  const loadData = useCallback(
    async (
      overrideDate?: string,
      overrideShift?: string,
      overrideGye?: string,
      overrideCat?: string
    ) => {
      setLoading(true);
      setError(null);

      const targetDate = overrideDate !== undefined ? overrideDate : reqDate;
      const targetShift = overrideShift !== undefined ? overrideShift : shift;
      const targetGye = overrideGye !== undefined ? overrideGye : selectedGye;
      const targetCat = overrideCat !== undefined ? overrideCat : selectedCategory;

      try {
        const params = new URLSearchParams({
          date: targetDate,
          shift: targetShift,
          gye: targetGye,
          category: targetCat,
          search: searchTerm,
        });

        const res = await fetch(`/api/purchase/mat-req-print?${params}`, {
          cache: 'no-store',
        });
        const json = await res.json();

        if (json.success) {
          setData(json.data || []);
          if (Array.isArray(json.gyeList) && json.gyeList.length > 0) {
            setGyeList(json.gyeList);
          }
          setLatestDateWithOrders(json.latestDateWithOrders || null);
          setSummary({
            totalItemCount: json.summary?.totalItemCount || (json.data?.length ?? 0),
            totalReqQty: json.summary?.totalReqQty || 0,
            totalShortageCount: json.summary?.totalShortageCount || 0,
            totalOrderAmt: json.summary?.totalOrderAmt || 0,
            totalFinishedOrderQty: json.totalFinishedOrderQty || 0,
            totalFinishedItemCount: json.totalFinishedItemCount || 0,
            orderCount: json.orderCount || 0,
          });
        } else {
          setError(json.error || '자재소요량 데이터를 불러오지 못했습니다.');
          setData([]);
        }
      } catch (err: any) {
        console.error('Failed to load mat requirements', err);
        setError('서버 연결 중 오류가 발생했습니다.');
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [reqDate, shift, selectedGye, selectedCategory, searchTerm]
  );

  // 초기 로딩
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 날짜 이동 핸들러
  const handlePrevDay = () => {
    const d = new Date(reqDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const newDate = d.toISOString().slice(0, 10);
    setReqDate(newDate);
    loadData(newDate);
  };

  const handleNextDay = () => {
    const d = new Date(reqDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const newDate = d.toISOString().slice(0, 10);
    setReqDate(newDate);
    loadData(newDate);
  };

  // 소요량 인쇄 모달 열기
  const handleOpenPrint = () => {
    setMatReqPayload({
      date: reqDate,
      shift: shift === 'ALL' ? '전체 (1편+2편)' : shift,
      gyeName: selectedGye === 'ALL' ? '전체 공정(ALL)' : selectedGye,
      totalFinishedOrderQty: summary.totalFinishedOrderQty,
      rows: data,
    });
    openPrintModal('MATERIAL_REQUIREMENT');
  };

  // 엑셀 내보내기
  const handleExcelExport = () => {
    exportGridToExcel({
      filename: `GS25_자재소요량_${reqDate}_${shift}_${selectedGye === 'ALL' ? '전체공정' : selectedGye}`,
      sheetName: '소요량산출',
      columns: COLUMNS,
      data,
    });
  };

  // 조건 초기화
  const handleReset = () => {
    const today = kstToday();
    setReqDate(today);
    setShift('ALL');
    setSelectedGye('ALL');
    setSelectedCategory('ALL');
    setSearchTerm('');
    loadData(today, 'ALL', 'ALL', 'ALL');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <SalesActionBar
        title="자재소요량출력(GSR)"
        buttons={[
          {
            key: 'search',
            label: '조회',
            icon: 'search',
            variant: 'primary',
            onClick: () => loadData(),
          },
          {
            key: 'print',
            label: '소요량출력(A4)',
            icon: 'print',
            variant: 'secondary',
            onClick: handleOpenPrint,
          },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: handleExcelExport,
          },
          {
            key: 'reset',
            label: '초기화',
            icon: 'reset',
            variant: 'secondary',
            onClick: handleReset,
          },
        ]}
        helpContent="GS리테일 수주 데이터와 완제품별 BOM(레시피)을 실시간 연동하여 공정(계)별 원·부자재 소요계산량, 현재고 대비 부족량, 추천 발주량을 산출합니다."
      />

      {/* 2. 조건 검색 바 */}
      <div className="bg-[#f8fafc] border-b border-slate-300 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 기준일자 */}
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-300 shadow-2xs">
            <span className="font-bold text-slate-700 flex items-center gap-1 text-[11.5px]">
              <Calendar size={13} className="text-blue-600" />
              기준일자:
            </span>
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
              title="전일"
            >
              <ChevronLeft size={13} />
            </button>
            <input
              type="date"
              value={reqDate}
              onChange={(e) => {
                setReqDate(e.target.value);
                loadData(e.target.value);
              }}
              className="bg-transparent border-0 font-bold text-slate-900 text-[12px] w-[120px] focus:outline-hidden"
            />
            <button
              type="button"
              onClick={handleNextDay}
              className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
              title="익일"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* 편수 선택 */}
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-300 shadow-2xs">
            <span className="font-bold text-slate-700 text-[11.5px]">편수:</span>
            <select
              value={shift}
              onChange={(e) => {
                const s = e.target.value as 'ALL' | '1편' | '2편';
                setShift(s);
                loadData(reqDate, s);
              }}
              className="bg-transparent border-0 font-bold text-blue-700 text-[11.5px] focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">전체 (1편+2편)</option>
              <option value="1편">1편(밤)</option>
              <option value="2편">2편(낮)</option>
            </select>
          </div>

          {/* 공정(계) 선택 */}
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-300 shadow-2xs">
            <span className="font-bold text-slate-700 text-[11.5px]">투입공정(계):</span>
            <select
              value={selectedGye}
              onChange={(e) => {
                const g = e.target.value;
                setSelectedGye(g);
                loadData(reqDate, shift, g);
              }}
              className="bg-transparent border-0 font-semibold text-slate-800 text-[11.5px] focus:outline-hidden cursor-pointer max-w-[150px]"
            >
              <option value="ALL">전체 공정 (ALL)</option>
              {gyeList.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* 파트구분 선택 */}
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-slate-300 shadow-2xs">
            <span className="font-bold text-slate-700 text-[11.5px]">구분:</span>
            <select
              value={selectedCategory}
              onChange={(e) => {
                const c = e.target.value;
                setSelectedCategory(c);
                loadData(reqDate, shift, selectedGye, c);
              }}
              className="bg-transparent border-0 font-semibold text-slate-800 text-[11.5px] focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">전체 구분</option>
              <option value="원재료">원재료</option>
              <option value="부재료">부재료</option>
              <option value="포장재">포장재</option>
            </select>
          </div>

          {/* 자재명 검색 */}
          <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-300 shadow-2xs">
            <Search size={13} className="text-slate-400" />
            <input
              type="text"
              placeholder="자재명 / 코드 / 거래처"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadData();
              }}
              className="bg-transparent border-0 text-[11.5px] text-slate-900 w-[140px] focus:outline-hidden"
            />
          </div>
        </div>

        {/* 새로고침 버튼 */}
        <button
          type="button"
          onClick={() => loadData()}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md shadow-2xs cursor-pointer disabled:opacity-50 transition-colors"
        >
          <RotateCw size={12} className={loading ? 'animate-spin text-blue-600' : ''} />
          새로고침
        </button>
      </div>

      {/* 3. 상단 4대 실물 현황 KPI 요약 칩 */}
      <div className="bg-white border-b border-slate-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
        <div className="flex flex-wrap items-center gap-3">
          {/* 완제품 수주량 */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
            <span className="text-slate-500 font-bold">🍱 GS25 완제품 수주:</span>
            <span className="font-mono font-extrabold text-blue-800 text-[12px]">
              {summary.totalFinishedOrderQty.toLocaleString()} ea
            </span>
            <span className="text-slate-400 text-[10.5px]">
              ({summary.totalFinishedItemCount}개 품목 / {summary.orderCount}건)
            </span>
          </div>

          {/* 산출 자재 품목 */}
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
            <span className="text-emerald-700 font-bold">📦 소요 자재:</span>
            <span className="font-mono font-black text-emerald-900 text-[12px]">
              {data.length} 품목
            </span>
            <span className="text-emerald-600 text-[10.5px]">
              (총 소요량: {Math.round(summary.totalReqQty).toLocaleString()})
            </span>
          </div>

          {/* 결품/부족 발생 */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
              summary.totalShortageCount > 0
                ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <AlertTriangle size={13} className={summary.totalShortageCount > 0 ? 'text-rose-600' : 'text-slate-400'} />
            <span className="font-bold">
              {summary.totalShortageCount > 0 ? '🚨 재고부족 주의:' : '재고상태:'}
            </span>
            <span className="font-mono font-black text-[12px]">
              {summary.totalShortageCount > 0 ? `${summary.totalShortageCount} 품목 부족` : '전품목 안전재고 충족'}
            </span>
          </div>

          {/* 추천 발주 예상액 */}
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
            <span className="text-amber-700 font-bold">💰 추천 발주액:</span>
            <span className="font-mono font-black text-amber-900 text-[12px]">
              ₩{Math.round(summary.totalOrderAmt).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          조회 결과: <strong className="text-blue-700">{data.length}</strong> 건
        </div>
      </div>

      {/* 4. 에러 또는 해당 일자 수주 없음 안내 배너 */}
      {error && (
        <div className="mx-3 mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-[12px] text-rose-800 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => loadData()}
            className="text-xs font-bold text-rose-700 underline cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="mx-3 mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              선택하신 일자(<strong>{reqDate}</strong>)에 등록된 GS25 완제품 수주 데이터가 없습니다.
              {latestDateWithOrders && (
                <span className="ml-1 text-slate-700">
                  (가장 최근 등록된 수주일자: <strong>{latestDateWithOrders}</strong>)
                </span>
              )}
            </span>
          </div>
          {latestDateWithOrders && latestDateWithOrders !== reqDate && (
            <button
              type="button"
              onClick={() => {
                setReqDate(latestDateWithOrders);
                loadData(latestDateWithOrders);
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-2xs cursor-pointer transition-colors"
            >
              최근 수주일자({latestDateWithOrders})로 조회 <ArrowRight size={12} />
            </button>
          )}
        </div>
      )}

      {/* 5. 실물 데이터 그리드 */}
      <div className="flex-1 p-2.5 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-lg border border-slate-300 gap-2">
            <RotateCw className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="text-xs font-bold text-slate-600">
              GS25 수주 데이터 및 BOM 레시피 전개 중...
            </span>
          </div>
        ) : (
          <PurchaseDataGrid
            columns={COLUMNS}
            data={data}
            summaryRowTitle="합계"
          />
        )}
      </div>
    </div>
  );
};
