'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { SalesFilterBar } from '@/components/sales/common/SalesFilterBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '../common/PurchaseDataGrid';
import { exportGridToExcel } from '@/lib/excelExport';

const COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'cancelTime', label: '취소일시', width: '120px', align: 'center' },
  { key: 'orderId', label: '발주id', width: '90px', align: 'center' },
  { key: 'orderDate', label: '발주일', width: '90px', align: 'center', format: 'date' },
  { key: 'recvDate', label: '입고일', width: '90px', align: 'center', format: 'date' },
  { key: 'supplier', label: '거래처', width: '120px', align: 'left' },
  { key: 'type', label: '구분', width: '65px', align: 'center' },
  { key: 'name', label: '품명', width: '200px', align: 'left' },
  { key: 'spec', label: '규격', width: '90px', align: 'center' },
  { key: 'unit', label: '단위', width: '45px', align: 'center' },
  { key: 'orderPrice', label: '발주단가', width: '85px', align: 'right', format: 'currency' },
  { key: 'orderQty', label: '발주수량', width: '70px', align: 'right', format: 'number' },
  { key: 'cancelQty', label: '취소수량', width: '70px', align: 'right', format: 'number' },
  { key: 'unitPrice', label: '단가', width: '85px', align: 'right', format: 'currency' },
  { key: 'cancelAmt', label: '취소금액(합계)', width: '110px', align: 'right', format: 'currency' },
  { key: 'remark', label: '비고', width: '160px', align: 'left' },
  { key: 'cancelUser', label: '취소자', width: '80px', align: 'center' },
];

const SAMPLE_DATA: any[] = [];

export const ReceivingCancelStatusView: React.FC = () => {
  const [startDate, setStartDate] = useState('2026-10-29');
  const [endDate, setEndDate] = useState('2026-10-30');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/purchase/receiving?status=취소')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loaded = json.data.map((rcv: any, idx: number) => ({
            id: rcv.id || idx + 1,
            cancelTime: rcv.cancelDate || '2026-10-30 09:00',
            orderId: rcv.receivingNo,
            orderDate: rcv.receivingDate,
            recvDate: rcv.receivingDate,
            supplier: rcv.partner?.name || rcv.partnerName || '거래처',
            type: '원재료',
            name: rcv.details?.[0]?.product?.name || '원료',
            spec: rcv.details?.[0]?.product?.spec || '',
            unit: rcv.details?.[0]?.unit || 'box',
            orderPrice: rcv.details?.[0]?.unitPrice || 50000,
            orderQty: rcv.details?.[0]?.receivedQty || 2,
            cancelQty: rcv.details?.[0]?.receivedQty || 2,
            unitPrice: rcv.details?.[0]?.unitPrice || 50000,
            cancelAmt: rcv.totalAmount || 100000,
            remark: rcv.cancelReason || '입고 취소',
            cancelUser: rcv.createdBy || '관리자',
          }));
          setData(loaded);
        }
      })
      .catch((err) => console.error('Failed to load cancelled receivings', err));
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none">
      <SalesActionBar
        title="입고취소현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('조회 완료') },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => alert('초기화 완료') },
          { key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: () => exportGridToExcel({ filename: '입고취소현황', sheetName: '입고취소현황', columns: COLUMNS, data: data }) },
        ]}
        helpContent="입고 검수 불량 또는 공급사 공급불가로 반품/취소 처리된 입고 내역을 조회합니다."
      />

      <SalesFilterBar
        label="출하일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={data.length}
        onRefresh={() => alert('새로고침')}
      >
        <div className="flex items-center gap-1.5 pl-2 border-l border-gray-300">
          <span className="font-semibold text-gray-700 text-[11px]">거래처:</span>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="border border-gray-300 px-1 py-0.5 bg-white text-gray-800 text-[11px] h-5"
          >
            <option value="ALL">ALL (전체 거래처)</option>
            <option value="대림">[네트웍스]대림</option>
            <option value="두레">[네트웍스]두레</option>
            <option value="한성">[네트웍스]한성</option>
            <option value="CJ">[네트웍스]CJ</option>
          </select>
        </div>
      </SalesFilterBar>

      <div className="flex-1 p-1.5 min-h-0 overflow-hidden flex flex-col">
        <PurchaseDataGrid
          columns={COLUMNS}
          data={data}
        />
      </div>
    </div>
  );
};

