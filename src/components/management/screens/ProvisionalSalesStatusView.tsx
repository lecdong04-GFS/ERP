'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { MasterDataGrid, MasterGridColumnDef } from '@/components/master/common/MasterDataGrid';
import {
  Calendar,
  Building2,
  PackageCheck,
  AlertCircle,
  CheckCircle2,
  Download,
  Search,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  X,
  TrendingUp,
} from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';
import { usePipeline } from '@/context/PipelineContext';
import { kstToday } from '@/lib/kst';

export interface SettlementDetailItem {
  id: number;
  deliveryId?: number;
  centerCode: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  orderQty: number;
  orderAmt: number;
  delivQty: number;
  delivAmt: number;
  unDelivQty: number;
  unDelivAmt: number;
  remark: string;
}

export interface SettlementCenterRow {
  id: number;
  centerCode: string;
  partnerName: string; // 거래처(센터명)
  provQty: number; // 가매출(주문)수량
  provAmt: number; // 가매출금액
  undelivQty: number; // 미출수량
  undelivAmt: number; // 미출금액
  confirmQty: number; // 확정수량
  confirmAmt: number; // 최종 확정금액
  achieveRate: number; // 달성율(%)
  itemCount: number; // 품목수
  details: SettlementDetailItem[];
}

export const ProvisionalSalesStatusView: React.FC = () => {
  const { openExcelOrderModal } = usePipeline();

  // 날짜 및 필터 상태
  const [date, setDate] = useState<string>(() => kstToday());
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [centerFilter, setCenterFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 데이터 상태
  const [centerList, setCenterList] = useState<SettlementCenterRow[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 종합 요약 상태
  const [summary, setSummary] = useState({
    totalProvQty: 0,
    totalProvAmt: 0,
    totalUndelivQty: 0,
    totalUndelivAmt: 0,
    totalConfirmQty: 0,
    totalConfirmAmt: 0,
    overallRate: 100,
    centerCount: 0,
  });

  // DB에서 해당 일자의 가매출/미출/확정 정산 데이터 로드
  const loadData = useCallback(async (targetDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/management/status?date=${targetDate}`);
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        if (d.availableDates && d.availableDates.length > 0) {
          setAvailableDates(d.availableDates);
        }

        const rows: SettlementCenterRow[] = (d.settlement || []).map((s: any, idx: number) => ({
          id: s.id || idx + 1,
          centerCode: s.centerCode || '',
          partnerName: s.partnerName || `센터 ${idx + 1}`,
          provQty: Number(s.provQty) || 0,
          provAmt: Number(s.provAmt) || 0,
          undelivQty: Number(s.undelivQty) || 0,
          undelivAmt: Number(s.undelivAmt) || 0,
          confirmQty: Number(s.confirmQty) || 0,
          confirmAmt: Number(s.confirmAmt) || 0,
          achieveRate: Number(s.achieveRate) || 0,
          itemCount: s.itemCount || s.details?.length || 0,
          details: s.details || [],
        }));

        setCenterList(rows);

        if (d.summary) {
          setSummary(d.summary);
        }

        // 첫 번째 센터 자동 선택
        if (rows.length > 0) {
          setSelectedCenterId(rows[0].id);
        } else {
          setSelectedCenterId(null);
        }
      } else {
        setCenterList([]);
        setSelectedCenterId(null);
      }
    } catch (err) {
      console.error('정산 데이터 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(date);
  }, [date, loadData]);

  // 필터링된 센터 목록
  const filteredCenters = useMemo(() => {
    return centerList.filter((c) => {
      if (centerFilter !== 'ALL' && c.centerCode !== centerFilter) return false;
      const kw = searchKeyword.trim().toLowerCase();
      if (!kw) return true;

      const matchCenter =
        c.partnerName.toLowerCase().includes(kw) ||
        c.centerCode.toLowerCase().includes(kw);

      if (matchCenter) return true;

      // 하위 품목명 검색
      return c.details.some(
        (dt) =>
          dt.productName.toLowerCase().includes(kw) ||
          dt.productCode.toLowerCase().includes(kw)
      );
    });
  }, [centerList, centerFilter, searchKeyword]);

  // 현재 선택된 센터 객체
  const selectedCenter = useMemo(() => {
    if (!selectedCenterId) return filteredCenters[0] || null;
    return centerList.find((c) => c.id === selectedCenterId) || filteredCenters[0] || null;
  }, [centerList, filteredCenters, selectedCenterId]);

  // 현재 선택된 센터의 품목별 상세 목록
  const currentDetails = useMemo(() => {
    if (!selectedCenter) return [];
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return selectedCenter.details;

    return selectedCenter.details.filter(
      (dt) =>
        dt.productName.toLowerCase().includes(kw) ||
        dt.productCode.toLowerCase().includes(kw) ||
        (dt.remark && dt.remark.toLowerCase().includes(kw))
    );
  }, [selectedCenter, searchKeyword]);

  // 상단 센터별 정산 총괄 그리드 컬럼 정의
  const UPPER_COLUMNS: MasterGridColumnDef[] = [
    {
      key: 'centerCode',
      label: '센터코드',
      width: '85px',
      align: 'center',
      render: (val) => <span className="font-mono text-slate-700 font-bold">{val}</span>,
    },
    {
      key: 'partnerName',
      label: '거래처 (물류센터명)',
      minWidth: '220px',
      align: 'left',
      render: (val, row) => (
        <span className="font-bold text-slate-900 flex items-center gap-1.5">
          <Building2 size={13} className="text-blue-600 shrink-0" />
          {val}
        </span>
      ),
    },
    {
      key: 'itemCount',
      label: '품목수',
      width: '65px',
      align: 'right',
      render: (val) => (
        <span className="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[11px]">
          {val}종
        </span>
      ),
    },
    { key: 'provQty', label: '가매출수량', width: '95px', align: 'right', format: 'number' },
    { key: 'provAmt', label: '가매출금액(주문)', width: '125px', align: 'right', format: 'currency' },
    {
      key: 'undelivQty',
      label: '미출수량',
      width: '85px',
      align: 'right',
      render: (val) => {
        const num = Number(val) || 0;
        return num > 0 ? (
          <span className="text-rose-600 font-bold">{num.toLocaleString()}</span>
        ) : (
          <span className="text-gray-400">-</span>
        );
      },
    },
    {
      key: 'undelivAmt',
      label: '미출금액(결품)',
      width: '115px',
      align: 'right',
      render: (val) => {
        const num = Number(val) || 0;
        return num > 0 ? (
          <span className="text-rose-600 font-black">{num.toLocaleString()}원</span>
        ) : (
          <span className="text-gray-400">-</span>
        );
      },
    },
    { key: 'confirmQty', label: '확정수량', width: '95px', align: 'right', format: 'number' },
    {
      key: 'confirmAmt',
      label: '최종 확정금액',
      width: '135px',
      align: 'right',
      render: (val) => (
        <span className="font-black text-blue-700 text-[12.5px]">{Number(val).toLocaleString()}원</span>
      ),
    },
    {
      key: 'achieveRate',
      label: '달성율(%)',
      width: '90px',
      align: 'right',
      render: (val) => {
        const rate = Number(val) || 0;
        const color =
          rate >= 99
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : rate >= 95
            ? 'bg-blue-100 text-blue-800 border-blue-300'
            : 'bg-rose-100 text-rose-800 border-rose-300';
        return (
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${color}`}>
            {rate.toFixed(1)}%
          </span>
        );
      },
    },
  ];

  // 하단 선택 센터의 품목별 납품/미출 상세 그리드 컬럼 정의
  const LOWER_COLUMNS: MasterGridColumnDef[] = [
    {
      key: 'productCode',
      label: '품목코드',
      width: '120px',
      align: 'center',
      render: (val) => <span className="font-mono text-gray-600">{val}</span>,
    },
    {
      key: 'productName',
      label: '완제품 품명',
      minWidth: '240px',
      align: 'left',
      render: (val, row) => (
        <div className="flex items-center gap-1.5">
          {row.unDelivQty > 0 ? (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title="결품 발생" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="전량 출하완료" />
          )}
          <span className="font-bold text-slate-800">{val}</span>
        </div>
      ),
    },
    { key: 'unitPrice', label: '납품단가', width: '90px', align: 'right', format: 'currency' },
    { key: 'orderQty', label: '주문수량(가매출)', width: '105px', align: 'right', format: 'number' },
    { key: 'orderAmt', label: '주문금액', width: '115px', align: 'right', format: 'currency' },
    {
      key: 'unDelivQty',
      label: '미출수량',
      width: '85px',
      align: 'right',
      render: (val) => {
        const num = Number(val) || 0;
        return num > 0 ? (
          <span className="text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
            {num}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        );
      },
    },
    {
      key: 'unDelivAmt',
      label: '미출금액',
      width: '105px',
      align: 'right',
      render: (val) => {
        const num = Number(val) || 0;
        return num > 0 ? (
          <span className="text-rose-600 font-bold">{num.toLocaleString()}원</span>
        ) : (
          <span className="text-gray-400">-</span>
        );
      },
    },
    { key: 'delivQty', label: '출고수량(확정)', width: '105px', align: 'right', format: 'number' },
    {
      key: 'delivAmt',
      label: '확정금액(정산)',
      width: '125px',
      align: 'right',
      render: (val) => (
        <span className="font-bold text-emerald-700">{Number(val).toLocaleString()}원</span>
      ),
    },
    {
      key: 'remark',
      label: '미출내역 및 특이사항',
      width: '180px',
      align: 'left',
      render: (val) => {
        if (!val) return <span className="text-gray-400 text-[11px]">-</span>;
        const isMichul = val.includes('미출');
        return (
          <span className={isMichul ? 'text-rose-700 font-medium' : 'text-gray-600'}>
            {val}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px]">
      {/* 1. 최상단 마스터 액션바 */}
      <SalesActionBar
        title="가매출·미출·확정금액 정산"
        buttons={[
          { key: 'search', label: loading ? '조회중...' : '조회', icon: 'search', variant: 'secondary', onClick: () => loadData(date) },
          { key: 'upload', label: '미출/수주 엑셀 업로드', icon: 'excel', variant: 'primary', onClick: openExcelOrderModal },
          {
            key: 'excelSummary',
            label: '센터별 정산 총괄 엑셀',
            icon: 'excel',
            variant: 'secondary',
            onClick: () =>
              exportGridToExcel({
                filename: `가매출_미출_확정정산_센터총괄_${date}`,
                sheetName: '센터별정산',
                columns: UPPER_COLUMNS,
                data: filteredCenters,
              }),
          },
          {
            key: 'excelDetail',
            label: '선택센터 품목별 엑셀',
            icon: 'excel',
            variant: 'secondary',
            onClick: () => {
              if (!selectedCenter) return;
              exportGridToExcel({
                filename: `정산상세_${selectedCenter.partnerName}_${date}`,
                sheetName: '품목상세정산',
                columns: LOWER_COLUMNS,
                data: currentDetails,
              });
            },
          },
          { key: 'reset', label: '새로고침', icon: 'reset', variant: 'secondary', onClick: () => loadData(date) },
        ]}
        helpContent="수주 주문 기준 가매출액(수량)에서 생산/물류 결품으로 인한 미출액을 정확히 차감하여 당일 최종 확정 매출금액을 센터별·품목별로 정밀 정산합니다."
      />

      {/* 2. 조건 검색 바 및 빠른 일자 선택 태그 */}
      <div className="bg-white border-b border-[#cbd5e1] px-3 py-2 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* 일자 선택기 */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-700 flex items-center gap-1 text-[12px]">
              <Calendar size={13} className="text-blue-700" />
              정산일자:
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[12px] font-bold rounded shadow-2xs w-[130px] focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* 최근 가용 일자 빠른 선택 칩 */}
          {availableDates.length > 0 && (
            <div className="flex items-center gap-1 pl-2 border-l border-gray-300">
              <span className="text-[11px] text-gray-500 font-semibold">최근일:</span>
              <div className="flex items-center gap-1">
                {availableDates.slice(0, 5).map((dStr) => (
                  <button
                    key={dStr}
                    type="button"
                    onClick={() => setDate(dStr)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                      date === dStr
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {dStr.slice(5)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 물류센터 필터 */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
            <span className="font-bold text-gray-700 text-[12px]">센터:</span>
            <select
              value={centerFilter}
              onChange={(e) => setCenterFilter(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[12px] rounded font-semibold focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">전체 센터 (12개 물류센터)</option>
              {centerList.map((c) => (
                <option key={c.id} value={c.centerCode}>
                  {c.partnerName}
                </option>
              ))}
            </select>
          </div>

          {/* 검색창 */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="센터명, 품번, 또는 완제품명 검색"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="bg-white border border-gray-300 pl-2 pr-6 py-0.5 text-[12px] rounded shadow-2xs w-60 focus:border-blue-500 focus:outline-none"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-1 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        <span className="text-[11.5px] text-gray-600 bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200 font-semibold shadow-2xs">
          집계 센터수: <span className="text-blue-700 font-bold">{filteredCenters.length}</span> / {centerList.length}개소
        </span>
      </div>

      {/* 3. 상단 4대 정산 종합 KPI Cockpit 배너 */}
      <div className="mx-2 mt-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-2.5 rounded shadow-xs border border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-cyan-400" size={18} />
          <div>
            <div className="font-bold text-[13px] text-white">
              {date} 일자 가매출·미출·확정 정산 종합
            </div>
            <div className="text-[11px] text-slate-300">
              전체 12개 GS 물류센터 수주 대비 출하 정산 파이프라인 집계 결과입니다.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          {/* 가매출 (주문) */}
          <div className="bg-slate-700/60 px-3 py-1.5 rounded border border-slate-600 flex flex-col items-end">
            <span className="text-slate-300 text-[11px]">총 가매출 (수주주문)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-yellow-300 font-bold text-[11px]">
                {summary.totalProvQty.toLocaleString()}개
              </span>
              <span className="text-white font-black text-[13.5px]">
                {summary.totalProvAmt.toLocaleString()}원
              </span>
            </div>
          </div>

          {/* 결품 미출 */}
          <div className="bg-rose-950/50 px-3 py-1.5 rounded border border-rose-800/80 flex flex-col items-end">
            <span className="text-rose-300 text-[11px]">총 결품 미출액 (차감)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-rose-300 font-bold text-[11px]">
                -{summary.totalUndelivQty.toLocaleString()}개
              </span>
              <span className="text-rose-400 font-black text-[13.5px]">
                -{summary.totalUndelivAmt.toLocaleString()}원
              </span>
            </div>
          </div>

          {/* 최종 확정 금액 */}
          <div className="bg-emerald-950/50 px-3 py-1.5 rounded border border-emerald-700/80 flex flex-col items-end">
            <span className="text-emerald-300 text-[11px]">최종 확정금액 (정산청구)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-emerald-300 font-bold text-[11px]">
                {summary.totalConfirmQty.toLocaleString()}개
              </span>
              <span className="text-emerald-400 font-black text-[14px]">
                {summary.totalConfirmAmt.toLocaleString()}원
              </span>
            </div>
          </div>

          {/* 전체 달성률 */}
          <div className="bg-blue-950/60 px-3 py-1.5 rounded border border-blue-700/80 flex flex-col items-center justify-center">
            <span className="text-blue-200 text-[11px]">정산 달성률</span>
            <span
              className={`font-black text-[14px] ${
                summary.overallRate >= 99
                  ? 'text-emerald-300'
                  : summary.overallRate >= 95
                  ? 'text-cyan-300'
                  : 'text-amber-300'
              }`}
            >
              {summary.overallRate.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* 4. 본문 영역: 상단 센터별 정산 총괄 그리드 (55%) & 하단 품목별 상세 내역 (45%) */}
      <div className="flex-1 flex flex-col min-h-0 p-2 gap-2">
        {/* 상단 그리드: 센터별 가매출/미출/확정금액 현황 */}
        <div className="flex-[11] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-2xs">
          <div className="bg-[#e2e8f0] px-3 py-1 flex items-center justify-between border-b border-[#cbd5e1]">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800 text-[12.5px] flex items-center gap-1">
                <Layers size={14} className="text-blue-700" /> 센터별 가매출·미출·확정금액 정산표
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                (센터 행을 클릭하시면 하단에 납품 품목별 미출 결품 상세가 실시간 조회됩니다)
              </span>
            </div>
            {selectedCenter && (
              <span className="text-[11.5px] text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-semibold">
                선택됨: <span className="font-bold text-blue-800">{selectedCenter.partnerName}</span> (확정: {selectedCenter.confirmAmt.toLocaleString()}원)
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={UPPER_COLUMNS}
              data={filteredCenters}
              selectedRowId={selectedCenter?.id}
              onRowClick={(row) => setSelectedCenterId(row.id)}
              summaryRowTitle="센터 합계"
              emptyMessage={
                loading
                  ? '정산 데이터를 안전하게 불러오는 중입니다...'
                  : `${date} 일자에 등록된 정산 데이터가 없습니다. 상단에서 최근 일자를 선택해보세요.`
              }
            />
          </div>
        </div>

        {/* 하단 그리드: 선택 센터의 품목별 납품/결품 미출 정밀 내역 */}
        <div className="flex-[9] flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-2xs">
          <div className="bg-[#e2e8f0] px-3 py-1 flex items-center justify-between border-b border-[#cbd5e1]">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800 text-[12.5px] flex items-center gap-1">
                <PackageCheck size={14} className="text-emerald-700" />
                {selectedCenter ? `[${selectedCenter.partnerName}] 품목별 납품 및 미출 상세 내역` : '품목별 납품 및 미출 상세 내역'}
              </span>
              {selectedCenter && (
                <span className="text-[11px] text-slate-600">
                  (총 {selectedCenter.details.length}개 품목 중 결품 {selectedCenter.details.filter((d) => d.unDelivQty > 0).length}건)
                </span>
              )}
            </div>

            {selectedCenter && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportGridToExcel({
                      filename: `품목정산상세_${selectedCenter.partnerName}_${date}`,
                      sheetName: '품목상세',
                      columns: LOWER_COLUMNS,
                      data: currentDetails,
                    })
                  }
                  className="px-2 py-0.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded text-[11px] flex items-center gap-1 shadow-2xs transition-colors"
                >
                  <FileSpreadsheet size={12} /> 상세 엑셀 저장
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0">
            <MasterDataGrid
              columns={LOWER_COLUMNS}
              data={currentDetails}
              summaryRowTitle="품목 합계"
              emptyMessage={
                selectedCenter
                  ? '조회된 품목 정산 내역이 없습니다.'
                  : '상단에서 물류센터를 먼저 선택하세요.'
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
