'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '@/components/purchase/common/PurchaseDataGrid';
import { Calendar, RefreshCw } from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';
import { usePipeline } from '@/context/PipelineContext';

interface ProvisionalSalesRow {
  id: number;
  partnerName: string; // 거래처명
  provQty: number; // 가매출수량
  provAmt: number; // 가매출금액
  undelivQty: number; // 미출수량
  undelivAmt: number; // 미출금액
  confirmQty: number; // 확정수량
  confirmAmt: number; // 확정금액
  achieveRate: number; // 달성율(%)
}

const SAMPLE_PROV_DATA: ProvisionalSalesRow[] = [
  { id: 1, partnerName: '양산조리센터(수D)', provQty: 1, provAmt: 2480, undelivQty: 1, undelivAmt: 2480, confirmQty: 0, confirmAmt: 0, achieveRate: 0.0 },
  { id: 2, partnerName: '부산조리센터(수D)', provQty: 4, provAmt: 9920, undelivQty: 4, undelivAmt: 9920, confirmQty: 0, confirmAmt: 0, achieveRate: 0.0 },
  { id: 3, partnerName: '(주)지에스리테일(해인CVS)', provQty: 2540, provAmt: 4625000, undelivQty: 12, undelivAmt: 19800, confirmQty: 2528, confirmAmt: 4605200, achieveRate: 99.6 },
  { id: 4, partnerName: '㈜지에스리테일익산일배', provQty: 1200, provAmt: 2180000, undelivQty: 5, undelivAmt: 8500, confirmQty: 1195, confirmAmt: 2171500, achieveRate: 99.6 },
  { id: 5, partnerName: '(주)지에스리테일김해일배', provQty: 1850, provAmt: 3350000, undelivQty: 8, undelivAmt: 14200, confirmQty: 1842, confirmAmt: 3335800, achieveRate: 99.6 },
  { id: 6, partnerName: '지에스리테일경산저온', provQty: 820, provAmt: 1480000, undelivQty: 3, undelivAmt: 5400, confirmQty: 817, confirmAmt: 1474600, achieveRate: 99.6 },
  { id: 7, partnerName: '(주)지에스리테일신광주저', provQty: 672, provAmt: 1215960, undelivQty: 54, undelivAmt: 125753, confirmQty: 618, confirmAmt: 1090207, achieveRate: 89.7 },
];

const COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'partnerName', label: '거래처(센터명)', minWidth: '240px', align: 'left', sticky: true, leftOffset: '36px' },
  { key: 'provQty', label: '가매출수량', width: '95px', align: 'right', format: 'number' },
  { key: 'provAmt', label: '가매출금액', width: '125px', align: 'right', format: 'currency' },
  { key: 'undelivQty', label: '미출수량', width: '90px', align: 'right', format: 'number', dangerIfNegative: true },
  { key: 'undelivAmt', label: '미출금액', width: '115px', align: 'right', format: 'currency', dangerIfNegative: true },
  { key: 'confirmQty', label: '확정수량', width: '95px', align: 'right', format: 'number' },
  { key: 'confirmAmt', label: '최종 확정금액', width: '140px', align: 'right', format: 'currency', highlight: true },
  { key: 'achieveRate', label: '달성율(%)', width: '90px', align: 'right' },
];

export const ProvisionalSalesStatusView: React.FC = () => {
  const { openExcelOrderModal } = usePipeline();
  const [date, setDate] = useState('2026-11-03');
  const [periodType, setPeriodType] = useState('일간');
  const [dataList, setDataList] = useState<ProvisionalSalesRow[]>(SAMPLE_PROV_DATA);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async (targetDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/management/status?date=${targetDate}`);
      const json = await res.json();
      if (json.success && json.data?.provisional && json.data.provisional.length > 0) {
        const rows: ProvisionalSalesRow[] = json.data.provisional.map((p: any, idx: number) => {
          const provAmt = Number(p.provisionalSales) || 0;
          const undelivAmt = Number(p.undeliveredAmount) || 0;
          const confirmAmt = Number(p.confirmedAmount) || Math.max(0, provAmt - undelivAmt);
          // 단가 역산 또는 기준 수량 환산
          const estPrice = provAmt > 0 ? 1800 : 1;
          const provQty = Math.round(provAmt / estPrice);
          const undelivQty = Math.round(undelivAmt / estPrice);
          const confirmQty = Math.max(0, provQty - undelivQty);
          const rate = provAmt > 0 ? ((confirmAmt / provAmt) * 100).toFixed(1) : '100.0';
          return {
            id: idx + 1,
            partnerName: p.remark || `GSR 센터 ${idx + 1}`,
            provQty,
            provAmt,
            undelivQty,
            undelivAmt,
            confirmQty,
            confirmAmt,
            achieveRate: parseFloat(rate),
          };
        });
        setDataList(rows);
      } else {
        // 해당 일자 데이터가 없으면 기본 샘플 유지
        setDataList(SAMPLE_PROV_DATA);
      }
    } catch (err) {
      console.error('Fetch provisional sales failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(date);
  }, [date, loadData]);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <SalesActionBar
        title="가매출·미출·확정금액 정산"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'secondary', onClick: () => loadData(date) },
          { key: 'upload', label: '미출/수주 엑셀 업로드', icon: 'excel', variant: 'primary', onClick: openExcelOrderModal },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: () =>
              exportGridToExcel({
                filename: `가매출미출확정현황_${date}`,
                sheetName: '가매출미출확정',
                columns: COLUMNS,
                data: dataList,
              }),
          },
          { key: 'reset', label: '새로고침', icon: 'reset', variant: 'secondary', onClick: () => loadData(date) },
        ]}
        helpContent="수주 주문 기준 가매출액과 생산/물류 결품으로 인한 미출액을 차감하여 당일 최종 확정 매출금액을 센터별로 집계합니다."
      />

      {/* 2. 조건 검색 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700 flex items-center gap-1">
              <Calendar size={13} className="text-blue-700" />
              일자:
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] font-medium rounded-xs shadow-2xs w-[130px]"
            />
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-gray-300">
            {['일간', '주간', '월간', '분기', '반기', '연간'].map((p) => (
              <label key={p} className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="provPeriod"
                  checked={periodType === p}
                  onChange={() => setPeriodType(p)}
                  className="accent-blue-600"
                />
                {p}
              </label>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-gray-600 font-semibold bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs">
          데이터수: <span className="font-bold text-blue-700">{dataList.length}</span> 건
        </div>
      </div>

      {/* 3. 데이터 그리드 */}
      <div className="flex-1 p-2 min-h-0 overflow-hidden flex flex-col">
        <PurchaseDataGrid
          columns={COLUMNS}
          data={dataList}
          summaryRowTitle="합계"
        />
      </div>
    </div>
  );
};

