'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesDataGrid, GridColumnDef } from '../common/SalesDataGrid';
import { usePrintReport } from '@/context/PrintReportContext';
import type { DeliveryBoxLabelData } from '@/components/print/labels/DeliveryBoxLabel';
import { exportGridToExcel } from '@/lib/excelExport';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 박스라벨 최대 출력 매수 (과다 출력 방지) */
const MAX_BOX_LABELS = 200;

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
  { key: 'boxInQty', label: '박스내입수', width: '80px', align: 'right', format: 'number', hideSummary: true },
  { key: 'qtyInfo', label: '수량정보', width: '110px', align: 'center' },
  { key: 'boxCount', label: 'BOX수량', width: '75px', align: 'right', format: 'number' },
];

export const ShippingOrderStatusView: React.FC = () => {
  const [delivDate, setDelivDate] = useState(kstToday());
  const [shiftFilter, setShiftFilter] = useState<'1편' | '2편' | '모두'>('모두');
  const [rows, setRows] = useState<ShippingOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { openPrintModal, setBoxPayload } = usePrintReport();

  const loadData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      // 납품일자 서버 필터 (전체 조회 후 잘라내기 방지)
      const params = new URLSearchParams({ deliveryDate: date });
      const [delivRes, prodRes] = await Promise.all([
        fetch(`/api/sales/delivery?${params}`, { cache: 'no-store' }).then((r) => r.json()),
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

  // 납품박스라벨 인쇄: 화면의 실출고 기준으로 박스별 라벨 생성 (최대 200매)
  const handleBoxLabel = () => {
    const stamp = delivDate.replace(/-/g, '');
    const items: DeliveryBoxLabelData[] = [];
    filteredRows.forEach((r, idx) => {
      const act = Math.max(0, Math.round(r.actualQty));
      if (act <= 0) return;
      const per = Math.max(1, Math.round(r.boxInQty) || 1);
      const full = Math.floor(act / per);
      const rem = act % per;
      const tag = String(idx + 1).padStart(2, '0');
      for (let i = 0; i < full && items.length < MAX_BOX_LABELS; i++) {
        items.push({
          boxNo: `BOX-${stamp}-${tag}-${String(i + 1).padStart(2, '0')}`,
          orderNo: '',
          centerName: r.clientName,
          centerCode: r.clientName,
          productCode: r.partNo === '-' ? '' : r.partNo,
          productName: `${r.partName} ${per}입`,
          boxQty: per,
          unit: 'ea/Box',
          shippingDate: `${delivDate} 출하`,
          deliveryDate: delivDate,
          coldChainTemp: '저온냉장 (0~10℃)',
        });
      }
      if (rem > 0 && items.length < MAX_BOX_LABELS) {
        items.push({
          boxNo: `BOX-${stamp}-${tag}-${String(full + 1).padStart(2, '0')}`,
          orderNo: '',
          centerName: r.clientName,
          centerCode: r.clientName,
          productCode: r.partNo === '-' ? '' : r.partNo,
          productName: `${r.partName} ${per}입`,
          boxQty: rem,
          unit: 'ea/Box',
          shippingDate: `${delivDate} 출하`,
          deliveryDate: delivDate,
          coldChainTemp: '저온냉장 (0~10℃)',
        });
      }
    });
    if (items.length === 0) {
      alert('출력할 박스라벨이 없습니다. (실출고 수량 확인)');
      return;
    }
    setBoxPayload(items);
    openPrintModal('DELIVERY_BOX_LABEL');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="출하지시현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(delivDate) },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => { const t = kstToday(); setDelivDate(t); setShiftFilter('모두'); void loadData(t); } },
          { key: 'centerPrint', label: '센터용출력', icon: 'print', variant: 'secondary', onClick: () => openPrintModal('WORK_ORDER') },
          { key: 'boxLabel', label: '납품박스라벨인쇄', icon: 'print', variant: 'secondary', onClick: () => void handleBoxLabel() },
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
    </div>
  );
};
