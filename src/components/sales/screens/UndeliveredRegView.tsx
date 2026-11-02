'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesFilterBar } from '../common/SalesFilterBar';
import { SalesDataGrid, GridColumnDef } from '../common/SalesDataGrid';
import { displayRemark } from '@/lib/gfs/docKey';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface SalesRegRow {
  id: string;
  salesOrderId: number;
  orderDate: string;
  centerCode: string;
  storeName: string;
  productCode: string;
  productName: string;
  spec: string;
  unit: string;
  shift: string;
  orderQty: number;
  orderAmt: number;
  delivQty: number;
  delivAmt: number;
  unDelivQty: number;
  unDelivAmt: number;
  unDelivReason: string;
}

const COLUMNS: GridColumnDef[] = [
  { key: 'orderDate', label: '주문일자', width: '90px', align: 'center', format: 'date' },
  { key: 'centerCode', label: '거래처', width: '120px', align: 'left' },
  { key: 'storeName', label: '점포명', width: '130px', align: 'left' },
  { key: 'productName', minWidth: '220px', label: '상품명', align: 'left' },
  { key: 'spec', label: '규격', width: '70px', align: 'center' },
  { key: 'shift', label: '편수', width: '55px', align: 'center' },
  { key: 'orderQty', label: '발주수량', width: '80px', align: 'right', format: 'number' },
  { key: 'delivQty', label: '납품수량', width: '80px', align: 'right', format: 'number', editable: true },
  { key: 'unDelivQty', label: '미납수량', width: '80px', align: 'right', format: 'number' },
  { key: 'unitPrice', label: '납품단가', width: '85px', align: 'right', format: 'currency' },
  { key: 'delivAmt', label: '납품금액', width: '100px', align: 'right', format: 'currency' },
  { key: 'unDelivAmt', label: '미납금액', width: '100px', align: 'right', format: 'currency' },
  { key: 'unDelivReason', label: '미납사유', width: '160px', align: 'left', editable: true },
];

export const UndeliveredRegView: React.FC = () => {
  const { data: session } = useSession();
  const me = session?.user as any;

  const [startDate, setStartDate] = useState(kstToday());
  const [endDate, setEndDate] = useState(kstToday());
  const [delivDate, setDelivDate] = useState(kstToday());
  const [rows, setRows] = useState<SalesRegRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/undelivered?startDate=${s}&endDate=${e}`, { cache: 'no-store' });
      const json = await res.json();
      const list: any[] = json.success && Array.isArray(json.data?.rows) ? json.data.rows : [];
      setRows(
        list.map((r: any, idx: number) => {
          const price = Number(r.unitPrice) || 0;
          const oQ = Number(r.orderQty) || 0;
          const already = Number(r.deliveredQty) || 0;
          // 이번 회차 납품 입력 기본값 = 잔여 미납분
          const dQ = Math.max(0, oQ - already);
          return {
            id: `${r.salesOrderId}:${r.productId}:${idx}`,
            salesOrderId: r.salesOrderId,
            orderDate: r.orderDate,
            centerCode: r.centerCode || '-',
            storeName: displayRemark(r.storeName) || '-',
            productCode: r.productCode || '',
            productName: r.productName || '',
            spec: r.spec || '',
            unit: r.unit || 'ea',
            shift: r.shift || '-',
            orderQty: oQ,
            orderAmt: Math.round(oQ * price),
            delivQty: dQ,
            delivAmt: Math.round(dQ * price),
            unDelivQty: Math.max(0, oQ - already - dQ),
            unDelivAmt: Math.round(Math.max(0, oQ - already - dQ) * price),
            unDelivReason: '',
          };
        })
      );
    } catch (err) {
      console.error('Failed to load undelivered for sales reg', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(startDate, endDate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRowChange = (id: any, key: string, val: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [key]: val };
        if (key === 'delivQty') {
          const unitPrice = r.orderQty > 0 ? Math.round(r.orderAmt / r.orderQty) : 0;
          const dQ = Math.max(0, Math.min(Number(val) || 0, r.orderQty));
          updated.delivQty = dQ;
          updated.delivAmt = dQ * unitPrice;
          updated.unDelivQty = Math.max(0, r.orderQty - dQ);
          updated.unDelivAmt = updated.unDelivQty * unitPrice;
        }
        return updated;
      })
    );
  };

  const handleSave = async () => {
    const targets = rows.filter((r) => Number(r.delivQty) > 0);
    if (targets.length === 0) {
      alert('납품수량이 입력된 행이 없습니다.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(delivDate)) {
      alert('납품일자를 입력하세요.');
      return;
    }
    if (!window.confirm(`${targets.length}건明細, 납품일자 ${delivDate}로 납품을 등록할까요?`)) return;
    setSaving(true);
    try {
      const byOrder = new Map<number, SalesRegRow[]>();
      targets.forEach((r) => {
        const list = byOrder.get(r.salesOrderId) || [];
        list.push(r);
        byOrder.set(r.salesOrderId, list);
      });
      let created = 0;
      for (const [orderId, list] of byOrder) {
        const res = await fetch('/api/sales/delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deliveryDate: delivDate,
            centerCode: list[0].centerCode,
            shift: list[0].shift !== '-' ? list[0].shift : '1편',
            salesOrderId: orderId,
            createdBy: me?.name || me?.loginId || '담당자',
            items: list.map((r) => ({
              productCode: r.productCode,
              productName: r.productName,
              deliveryQty: Math.round(Number(r.delivQty) || 0),
              unitPrice: r.orderQty > 0 ? Math.round(r.orderAmt / r.orderQty) : 0,
              boxQty: 0,
              remark: r.unDelivReason.trim(),
            })),
          }),
        });
        const json = await res.json();
        if (!json.success) {
          alert(`저장 실패 (${list[0].orderDate} 수주): ${json.error || '알 수 없는 오류'}`);
          return;
        }
        created += 1;
      }
      alert(`납품 등록 완료 (${created}건). 미출현황에 즉시 반영됩니다.`);
      void loadData(startDate, endDate);
    } catch (err: any) {
      alert('저장 중 오류: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const t = kstToday();
    setStartDate(t); setEndDate(t); setDelivDate(t);
    void loadData(t, t);
  };

  const totals = useMemo(() => ({
    orderQty: rows.reduce((s, r) => s + r.orderQty, 0),
    delivQty: rows.reduce((s, r) => s + r.delivQty, 0),
    unDelivQty: rows.reduce((s, r) => s + r.unDelivQty, 0),
    orderAmt: rows.reduce((s, r) => s + r.orderAmt, 0),
    delivAmt: rows.reduce((s, r) => s + r.delivAmt, 0),
    unDelivAmt: rows.reduce((s, r) => s + r.unDelivAmt, 0),
  }), [rows]);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="매출등록"
        buttons={[
          { key: 'save', label: saving ? '저장 중...' : '저장', icon: 'save', variant: 'primary', onClick: () => void handleSave() },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
        ]}
        helpContent="수주 대비 납품수량을 입력해 납품으로 확정합니다. 저장 즉시 미출현황에 반영되고, 수주와 연결되어 추적됩니다."
      />

      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex flex-wrap items-center gap-2 shrink-0">
        <span className="font-semibold text-gray-700">주문일자:</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
          className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs h-6" />
        <span className="text-gray-500">~</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
          className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs h-6" />
        <button type="button" onClick={() => void loadData(startDate, endDate)}
          className="px-2 py-0.5 bg-white border border-gray-400 rounded hover:bg-gray-100 font-bold h-6">조회</button>
        <span className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-300">
          <span className="font-semibold text-gray-700">납품일자:</span>
          <input type="date" value={delivDate} onChange={(e) => setDelivDate(e.target.value)}
            className="bg-white border border-gray-400 px-1.5 py-0.5 text-[11px] font-mono rounded-xs h-6" />
        </span>
        <span className="ml-auto text-[11px] text-gray-600">납품수량 수정 → 미납 자동계산 → 저장 시 수주 연결 납품 등록</span>
      </div>

      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-white text-gray-400">불러오는 중...</div>
        ) : (
          <SalesDataGrid columns={COLUMNS} data={rows} onRowChange={handleRowChange} />
        )}
      </div>

      <div className="h-[26px] bg-[#fdfde0] border-t border-gray-400 px-3 flex items-center gap-6 text-[12px] font-bold shrink-0">
        <span className="text-gray-700">합계</span>
        <span className="text-gray-500">{rows.length}건</span>
        <span className="num text-blue-900">주문 {totals.orderQty.toLocaleString()}</span>
        <span className="num text-emerald-800">납품 {totals.delivQty.toLocaleString()}</span>
        <span className="num text-rose-700">미납 {totals.unDelivQty.toLocaleString()}</span>
        <span className="num text-blue-900 ml-auto">₩{totals.delivAmt.toLocaleString()}</span>
      </div>
    </div>
  );
};
