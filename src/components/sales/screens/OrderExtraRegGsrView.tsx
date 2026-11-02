'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesDataGrid, GridColumnDef } from '../common/SalesDataGrid';
import { displayRemark } from '@/lib/gfs/docKey';

interface ExtraOrderItem {
  id: number;
  gubun: string;      // 구분
  productCode: string; // 품번 (저장용, 화면 미표시)
  partName: string;   // 품명
  spec: string;       // 규격
  unit: string;       // 단위
  orderQty: number;   // 주문수량
  delivDate: string;  // 납품일자
  shift: string;      // 편수
  storeName: string;  // 편의점명(상세 remark에 저장)
  currentStock: number; // 현재고(참고표시)
  unitPrice: number;  // 납품단가
  orderAmt: number;   // 주문금액
  poNo: string;       // P/O no. (저장 후 발주번호)
  remark: string;     // 비고
}

const COLUMNS: GridColumnDef[] = [
  { key: 'gubun', label: '구분', width: '60px', align: 'center' },
  { key: 'partName', minWidth: '260px', label: '품명', align: 'left', editable: true },
  { key: 'spec', label: '규격', width: '75px', align: 'center', editable: true },
  { key: 'unit', label: '단위', width: '45px', align: 'center', editable: true },
  { key: 'orderQty', label: '주문수량', width: '80px', align: 'right', format: 'number', editable: true },
  { key: 'delivDate', label: '납품일자', width: '90px', align: 'center', format: 'date', editable: true },
  { key: 'shift', label: '편수', width: '55px', align: 'center', editable: true },
  { key: 'storeName', label: '편의점명', width: '130px', align: 'left', editable: true },
  { key: 'currentStock', label: '현재고', width: '75px', align: 'right', format: 'number' },
  { key: 'unitPrice', label: '납품단가', width: '85px', align: 'right', format: 'currency', hideSummary: true, editable: true },
  { key: 'orderAmt', label: '주문금액', width: '100px', align: 'right', format: 'currency' },
  { key: 'poNo', label: 'P/O no.', width: '125px', align: 'center' },
  { key: 'remark', label: '비고', width: '130px', align: 'left', editable: true },
];

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export const OrderExtraRegGsrView: React.FC = () => {
  const { data: session } = useSession();
  const me = session?.user as any;

  const [filterDate, setFilterDate] = useState(kstToday);
  const [partners, setPartners] = useState<string[]>([]);
  const [customer, setCustomer] = useState('');
  const [storeKeyword, setStoreKeyword] = useState('');
  const [shift, setShift] = useState<'1편' | '2편'>('1편');
  const [rows, setRows] = useState<ExtraOrderItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [lastUpload, setLastUpload] = useState('');

  const loadPartners = useCallback(async () => {
    try {
      const res = await fetch('/api/master/partner?type=P', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const names = json.data.map((p: any) => String(p.name || '').trim()).filter(Boolean);
        setPartners(names);
        setCustomer((prev) => prev || names[0] || '');
      }
    } catch (err) {
      console.error('Failed to load partners', err);
    }
  }, []);

  const loadStock = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/stock', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const map = new Map<string, number>();
        json.data.forEach((inv: any) => {
          const code = String(inv.product?.productCode || inv.productCode || '');
          if (code && !map.has(code)) map.set(code, Number(inv.currentQty) || 0);
        });
        setStockMap(map);
      }
    } catch (err) {
      console.error('Failed to load stock', err);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ orderDate: filterDate, orderType: '추가' });
      const res = await fetch(`/api/sales/order?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const loaded: ExtraOrderItem[] = [];
        json.data.forEach((o: any) => {
          (o.details || []).forEach((dt: any, dtIdx: number) => {
            const code = dt.product?.productCode || '';
            loaded.push({
              id: dt.id || `${o.orderNo}-${dtIdx}`,
              gubun: '추가',
              productCode: code,
              partName: dt.product?.name || '',
              spec: dt.product?.spec || '',
              unit: dt.product?.unit || 'ea',
              orderQty: dt.totalQty ?? 0,
              delivDate: o.orderDate,
              shift: o.shift || '1편',
              storeName: displayRemark(dt.remark || o.remark || ''),
              currentStock: code ? stockMap.get(code) ?? 0 : 0,
              unitPrice: dt.unitPrice ?? 0,
              orderAmt: dt.amount ?? 0,
              poNo: o.orderNo,
              remark: '',
            });
          });
        });
        setRows(loaded);
        if (json.data.length > 0) {
          const latest = json.data.reduce((a: string, o: any) => (o.createdAt > a ? o.createdAt : a), '');
          setLastUpload(latest);
        } else {
          setLastUpload('');
        }
      } else {
        setRows([]);
      }
    } catch (err) {
      console.error('Failed to load extra orders', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterDate, stockMap]);

  useEffect(() => { void loadPartners(); void loadStock(); }, [loadPartners, loadStock]);
  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const handleNew = () => {
    const newRow: ExtraOrderItem = {
      id: Date.now(),
      gubun: '추가',
      productCode: '',
      partName: '',
      spec: '',
      unit: 'ea',
      orderQty: 0,
      delivDate: filterDate,
      shift,
      storeName: storeKeyword || '',
      currentStock: 0,
      unitPrice: 0,
      orderAmt: 0,
      poNo: '',
      remark: '',
    };
    setRows((prev) => [...prev, newRow]);
  };

  const handleDeleteRow = () => {
    if (selectedId == null) {
      alert('삭제할 행을 먼저 선택하세요.');
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== selectedId));
    setSelectedId(null);
  };

  const handleReset = () => {
    if (rows.some((r) => !r.poNo) && !window.confirm('미저장 행이 있습니다. 모두 지울까요?')) return;
    setRows([]);
    setStoreKeyword('');
  };

  const resolveProductCode = async (name: string): Promise<{ code: string; spec: string; unit: string } | null> => {
    const q = name.trim();
    if (!q) return null;
    try {
      const res = await fetch(`/api/master/product?search=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const exact = json.data.find((p: any) => p.name === q || p.productCode === q) || json.data[0];
        return { code: exact.productCode, spec: exact.spec || '', unit: exact.unit || 'ea' };
      }
    } catch (err) {
      console.error('Product resolve failed', err);
    }
    return null;
  };

  const handleSave = async () => {
    const targets = rows.filter((r) => !r.poNo);
    if (targets.length === 0) {
      alert('저장할 신규 행이 없습니다. (이미 저장된 행은 발주번호가 표시됩니다)');
      return;
    }
    const invalid = targets.filter((r) => !r.partName.trim() || !(Number(r.orderQty) > 0));
    if (invalid.length > 0) {
      alert(`품명과 주문수량(>0)을 입력하세요. (${invalid.length}건 미입력)`);
      return;
    }
    if (!customer) {
      alert('거래처를 선택하세요.');
      return;
    }
    setSaving(true);
    try {
      // 품목 코드 확인 + 규격/단위 자동보정
      const resolved = new Map<number, { code: string; spec: string; unit: string }>();
      const missing: string[] = [];
      for (const r of targets) {
        const hit = await resolveProductCode(r.partName);
        if (!hit) missing.push(r.partName.trim());
        else resolved.set(Number(r.id), hit);
      }
      if (missing.length > 0) {
        alert(`기준정보에 없는 품목이 있습니다. 먼저 제품등록을 하세요:\n${[...new Set(missing)].join('\n')}`);
        return;
      }
      setRows((prev) =>
        prev.map((r) => {
          const hit = resolved.get(Number(r.id));
          if (!hit) return r;
          return {
            ...r,
            productCode: hit.code,
            spec: r.spec || hit.spec,
            unit: r.unit || hit.unit,
            currentStock: stockMap.get(hit.code) ?? r.currentStock,
          };
        })
      );

      // 납품일자별 그룹 → 일자별 1건씩 발주 생성
      const byDate = new Map<string, ExtraOrderItem[]>();
      targets.forEach((r) => {
        const d = /^\d{4}-\d{2}-\d{2}$/.test(r.delivDate) ? r.delivDate : filterDate;
        const list = byDate.get(d) || [];
        list.push(r);
        byDate.set(d, list);
      });

      const createdNos: string[] = [];
      for (const [delivDate, list] of byDate) {
        const stores = [...new Set(list.map((r) => r.storeName.trim()).filter(Boolean))];
        const items = list.map((r) => {
          const hit = resolved.get(Number(r.id))!;
          const qty = Math.round(Number(r.orderQty) || 0);
          const price = Math.round(Number(r.unitPrice) || 0);
          const isShift1 = (r.shift || shift) === '1편';
          return {
            productCode: hit.code,
            orderQty1: isShift1 ? qty : 0,
            orderQty2: isShift1 ? 0 : qty,
            unitPrice: price,
            remark: r.storeName.trim(),
          };
        });
        const res = await fetch('/api/sales/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderDate: delivDate,
            centerCode: customer,
            shift,
            orderType: '추가',
            uploadMethod: '개별등록',
            createdBy: me?.name || me?.loginId || '담당자',
            remark: stores.join(', '),
            items,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          alert(`저장 실패 (${delivDate}): ` + (json.error || '알 수 없는 오류'));
          return;
        }
        createdNos.push(json.data.orderNo);
      }
      alert(`추가 주문 저장 완료 (${createdNos.join(', ')})\n품목 ${targets.length}건`);
      void loadOrders();
    } catch (err: any) {
      alert('저장 중 오류: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRowChange = (id: any, key: string, val: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const updated = { ...r, [key]: val };
          if (key === 'orderQty' || key === 'unitPrice') {
            const q = Number(key === 'orderQty' ? val : updated.orderQty) || 0;
            const p = Number(key === 'unitPrice' ? val : updated.unitPrice) || 0;
            updated.orderAmt = q * p;
          }
          return updated;
        }
        return r;
      })
    );
  };

  const filteredRows = useMemo(() => {
    const kw = storeKeyword.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(
      (r) =>
        (r.storeName || '').toLowerCase().includes(kw) ||
        (r.partName || '').toLowerCase().includes(kw)
    );
  }, [rows, storeKeyword]);
  const totalQty = useMemo(() => filteredRows.reduce((s, r) => s + (Number(r.orderQty) || 0), 0), [filteredRows]);
  const totalAmt = useMemo(() => filteredRows.reduce((s, r) => s + (Number(r.orderAmt) || 0), 0), [filteredRows]);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      <SalesActionBar
        title="추가주문등록GSR(개별등록)"
        buttons={[
          { key: 'new', label: '신규', icon: 'reset', variant: 'secondary', onClick: handleNew },
          { key: 'delete', label: '행삭제', icon: 'delete', variant: 'secondary', onClick: handleDeleteRow },
          { key: 'save', label: saving ? '저장 중...' : '저장', icon: 'save', variant: 'primary', onClick: () => void handleSave() },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
        ]}
        helpContent="정기 발주 마감 후 점포 유선/메신저로 긴급 접수된 추가 수량을 점포별/편수별로 개별 등록합니다. 저장된 행은 해당 납품일자로 추가수주 발주가 생성됩니다."
      />

      {/* 조건 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">주문일:</span>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[11px] font-mono rounded-xs shadow-2xs h-6"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">거래처:</span>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[11px] font-medium rounded-xs shadow-2xs h-6 w-36"
            >
              {partners.length === 0 && <option value="">거래처 없음</option>}
              {partners.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">편의점:</span>
            <input
              type="text"
              placeholder="점포명 검색"
              value={storeKeyword}
              onChange={(e) => setStoreKeyword(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[11px] rounded-xs shadow-2xs h-6 w-36"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">편수:</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="shift"
                checked={shift === '1편'}
                onChange={() => setShift('1편')}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="font-medium text-gray-800">1편</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="shift"
                checked={shift === '2편'}
                onChange={() => setShift('2편')}
                className="w-3.5 h-3.5 text-blue-600"
              />
              <span className="font-medium text-gray-800">2편</span>
            </label>
          </div>
        </div>

        <div className="text-[11px] text-gray-600 font-sans">
          <span>최종업로드일시: </span>
          {lastUpload ? (
            <span className="font-mono text-blue-900 font-bold">
              {new Date(lastUpload).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      </div>

      {/* 그리드 영역 */}
      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-white text-gray-400">불러오는 중...</div>
        ) : (
          <SalesDataGrid
            columns={COLUMNS}
            data={filteredRows}
            onRowChange={handleRowChange}
            onSelectRow={(row) => setSelectedId(row.id)}
          />
        )}
      </div>

      {/* 합계 푸터 */}
      <div className="h-[26px] bg-[#fdfde0] border-t border-gray-400 px-3 flex items-center gap-6 text-[12px] font-bold shrink-0">
        <span className="text-gray-700">합계</span>
        <span className="text-gray-500">{rows.length}건</span>
        <span className="num text-blue-900">{totalQty.toLocaleString()} ea</span>
        <span className="num text-blue-900 ml-auto">₩{totalAmt.toLocaleString()}</span>
      </div>
    </div>
  );
};
