'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesDataGrid, GridColumnDef } from '../common/SalesDataGrid';
import { usePrintReport } from '@/context/PrintReportContext';
import { exportGridToExcel } from '@/lib/excelExport';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface ShippingOrderRow {
  id: string;
  clientName: string;
  partNo: string;
  partName: string;
  delivQty: number;
  excludeQty: number;
  actualQty: number;
  boxInQty: number;
  qtyInfo: string;
  boxCount: number;
  shift: string;
}

const COLUMNS: GridColumnDef[] = [
  { key: 'clientName', label: '거래처명', width: '120px', align: 'left' },
  { key: 'partNo', label: '품번', width: '105px', align: 'center' },
  { key: 'partName', minWidth: '220px', label: '품명', align: 'left' },
  { key: 'delivQty', label: '납품수량', width: '80px', align: 'right', format: 'number' },
  { key: 'excludeQty', label: '제외수량', width: '80px', align: 'right', format: 'number', editable: true },
  { key: 'actualQty', label: '실출력수량', width: '85px', align: 'right', format: 'number' },
  { key: 'boxInQty', label: '박스내입수', width: '80px', align: 'right', format: 'number' },
  { key: 'qtyInfo', label: '수량정보', width: '110px', align: 'center' },
  { key: 'boxCount', label: 'BOX수량', width: '75px', align: 'right', format: 'number' },
];

export const ShippingOrderStatusView: React.FC = () => {
  const [delivDate, setDelivDate] = useState(kstToday());
  const [shiftFilter, setShiftFilter] = useState<'1편' | '2편' | '모두'>('모두');
  const [rows, setRows] = useState<ShippingOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { openPrintModal } = usePrintReport();

  const loadData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [delivRes, prodRes] = await Promise.all([
        fetch('/api/sales/delivery', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/master/product', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
      ]);
      const boxMap = new Map<string, number>();
      if (prodRes.success && Array.isArray(prodRes.data)) {
        prodRes.data.forEach((p: any) => {
          if (p.productCode && Number(p.boxQty) > 0) boxMap.set(String(p.productCode), Number(p.boxQty));
        });
      }
      let list: any[] = delivRes.success && Array.isArray(delivRes.data) ? delivRes.data : [];
      list = list.filter((d: any) => d.deliveryDate === date && d.status !== '취소');

      const loaded: ShippingOrderRow[] = [];
      list.forEach((d: any) => {
        (d.details || []).forEach((dt: any, idx: number) => {
          const code = (dt.productCode || '').trim();
          const q = Math.max(0, Math.round(Number(dt.deliveryQty) || 0));
          const boxIn = boxMap.get(code) || (q > 0 ? q : 1);
          const fullBox = Math.floor(q / boxIn);
          const remainder = q % boxIn;
          loaded.push({
            id: `${d.id}-${dt.id ?? idx}`,
            clientName: d.centerCode || '-',
            partNo: code || '-',
            partName: dt.productName || code || '-',
            delivQty: q,
            excludeQty: 0,
            actualQty: q,
            boxInQty: boxIn,
            qtyInfo: `${fullBox}Box + ${remainder}`,
            boxCount: Math.ceil(q / boxIn),
            shift: d.shift || '-',
          });
        });
      });
      setRows(loaded);
    } catch (err) {
      console.error('Failed to load shipping orders', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(delivDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRows = useMemo(
    () => (shiftFilter === '모두' ? rows : rows.filter((r) => r.shift === shiftFilter)),
    [rows, shiftFilter]
  );

  const handleRowChange = (id: any, key: string, val: any) => {
    if (key !== 'excludeQty') return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const ex = Math.max(0, Math.min(Math.round(Number(val) || 0), r.delivQty));
        const act = r.delivQty - ex;
        const fullBox = Math.floor(act / r.boxInQty);
        const remainder = act % r.boxInQty;
        return { ...r, excludeQty: ex, actualQty: act, qtyInfo: `${fullBox}Box + ${remainder}`, boxCount: Math.ceil(act / r.boxInQty) };
      })
    );
  };

  const totals = filteredRows.reduce(
    (acc, r) => ({
      delivQty: acc.delivQty + r.delivQty,
      excludeQty: acc.excludeQty + r.excludeQty,
      actualQty: acc.actualQty + r.actualQty,
      boxCount: acc.boxCount + r.boxCount,
    }),
    { delivQty: 0, excludeQty: 0, actualQty: 0, boxCount: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="출하지시현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(delivDate) },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => { const t = kstToday(); setDelivDate(t); setShiftFilter('모두'); void loadData(t); } },
          { key: 'centerPrint', label: '센터용출력', icon: 'print', variant: 'secondary', onClick: () => openPrintModal('WORK_ORDER') },
          { key: 'boxLabel', label: '납품박스라벨인쇄', icon: 'print', variant: 'secondary', onClick: () => openPrintModal('DELIVERY_BOX_LABEL') },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: () =>
              exportGridToExcel({
                filename: '출하지시현황',
                sheetName: '출하지시',
                columns: [...COLUMNS],
                data: filteredRows,
              }),
          },
        ]}
        helpContent="납품 확정분의 센터별 출하 박스 적재 수량을 계산합니다. 박스내입수는 기준정보 제품등록 값을 사용합니다."
      />

      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center gap-4 shadow-inner">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-700">납품일:</span>
          <input
            type="date" value={delivDate} onChange={(e) => setDelivDate(e.target.value)}
            className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs h-6"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700">편수:</span>
          {(['1편', '2편', '모두'] as const).map((s) => (
            <label key={s} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="shift"
                checked={shiftFilter === s}
                onChange={() => setShiftFilter(s)}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="font-medium text-gray-800">{s}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-white text-gray-400">불러오는 중...</div>
        ) : (
          <SalesDataGrid columns={COLUMNS} data={filteredRows} onRowChange={handleRowChange} />
        )}
      </div>

      <div className="h-[26px] bg-[#fdfde0] border-t border-gray-400 px-3 flex items-center gap-6 text-[12px] font-bold shrink-0">
        <span className="text-gray-700">합계</span>
        <span className="text-gray-500">{filteredRows.length}건</span>
        <span className="num text-blue-900">납품 {totals.delivQty.toLocaleString()}</span>
        <span className="num text-gray-600">제외 {totals.excludeQty.toLocaleString()}</span>
        <span className="num text-emerald-800">실출고 {totals.actualQty.toLocaleString()}</span>
        <span className="num text-blue-900 ml-auto">{totals.boxCount.toLocaleString()} BOX</span>
      </div>
    </div>
  );
};
