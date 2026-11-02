'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { SalesDataGrid, GridColumnDef } from '../common/SalesDataGrid';
import { exportGridToExcel } from '@/lib/excelExport';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface OrderCancelRow {
  id: number;
  orderNo: string;
  orderDate: string;
  cancelDate: string;
  clientName: string;
  gubun: string;
  partName: string;
  spec: string;
  unit: string;
  orderPrice: number;
  orderQty: number;
  orderAmt: number;
  remark: string;
}

const COLUMNS: GridColumnDef[] = [
  { key: 'orderNo', label: '주문번호', width: '130px', align: 'center' },
  { key: 'orderDate', label: '주문날짜', width: '90px', align: 'center', format: 'date' },
  { key: 'cancelDate', label: '주문취소일', width: '90px', align: 'center', format: 'date' },
  { key: 'clientName', label: '거래처', width: '120px', align: 'left' },
  { key: 'gubun', label: '구분', width: '60px', align: 'center' },
  { key: 'partName', minWidth: '260px', label: '품명', align: 'left' },
  { key: 'spec', label: '규격', width: '70px', align: 'center' },
  { key: 'unit', label: '단위', width: '45px', align: 'center' },
  { key: 'orderPrice', label: '주문단가', width: '85px', align: 'right', format: 'currency' },
  { key: 'orderQty', label: '주문수량', width: '80px', align: 'right', format: 'number' },
  { key: 'orderAmt', label: '주문금액', width: '100px', align: 'right', format: 'currency' },
  { key: 'remark', label: '취소사유', width: '200px', align: 'left' },
];

export const OrderCancelStatusView: React.FC = () => {
  const [startDate, setStartDate] = useState(kstToday);
  const [endDate, setEndDate] = useState(kstToday);
  const [rows, setRows] = useState<OrderCancelRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e, status: '취소' });
      const res = await fetch(`/api/sales/order?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const loaded: OrderCancelRow[] = [];
        json.data.forEach((o: any) => {
          (o.details || []).forEach((dt: any, idx: number) => {
            loaded.push({
              id: dt.id ?? `${o.id}-${idx}`,
              orderNo: o.orderNo,
              orderDate: o.orderDate,
              cancelDate: o.cancelDate || (o.updatedAt || '').slice(0, 10),
              clientName: o.centerCode || '-',
              gubun: dt.product?.category || '완성품',
              partName: dt.product?.name || '',
              spec: dt.product?.spec || '',
              unit: dt.product?.unit || 'ea',
              orderPrice: dt.unitPrice ?? 0,
              orderQty: dt.totalQty ?? 0,
              orderAmt: dt.amount ?? 0,
              remark: o.cancelReason || '주문 취소',
            });
          });
        });
        setRows(loaded);
      } else {
        setRows([]);
      }
    } catch (err) {
      console.error('Failed to load cancelled orders', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(startDate, endDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => ({
    qty: rows.reduce((s, r) => s + r.orderQty, 0),
    amt: rows.reduce((s, r) => s + r.orderAmt, 0),
  }), [rows]);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="주문취소현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: () => exportGridToExcel({ filename: '주문취소현황', sheetName: '주문취소현황', columns: COLUMNS, data: rows }) },
        ]}
        helpContent="접수 후 취소 처리된 GS리테일 주문 건의 일자별, 품목별 취소 수량 및 사유를 조회합니다."
      />

      <SalesFilterBar
        label="기준일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={rows.length}
      />

      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-white text-gray-400">불러오는 중...</div>
        ) : (
          <SalesDataGrid columns={COLUMNS} data={rows} />
        )}
      </div>

      <div className="h-[26px] bg-[#fdfde0] border-t border-gray-400 px-3 flex items-center gap-6 text-[12px] font-bold shrink-0">
        <span className="text-gray-700">합계</span>
        <span className="text-gray-500">{rows.length}건</span>
        <span className="num text-blue-900">{totals.qty.toLocaleString()} ea</span>
        <span className="num text-blue-900 ml-auto">₩{totals.amt.toLocaleString()}</span>
      </div>
    </div>
  );
};
