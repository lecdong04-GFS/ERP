'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { SalesFilterBar } from '@/components/sales/common/SalesFilterBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '../common/PurchaseDataGrid';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';
import { erpConfirm } from '@/context/ConfirmContext';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 N일 전 YYYY-MM-DD */
function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

interface OrderMasterRow {
  id: number;
  checked: boolean;
  orderNo: string;
  orderDate: string;
  status: '미입고' | '부분입고' | '입고완료' | '발주취소';
  supplier: string;
  itemCount: number;
  orderAmt: number;
  receivedAmt: number;
  unreceivedAmt: number;
  expectedDate: string;
  manager: string;
  tel: string;
  remark: string;
}

interface OrderDetailRow {
  id: number;
  itemCode: string;
  type: string;
  name: string;
  spec: string;
  unit: string;
  orderQty: number;
  unitPrice: number;
  orderAmt: number;
  receivedQty: number;
  unreceivedQty: number;
  expectedDate: string;
  warehouse: string;
  remark: string;
}

const MASTER_COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'checked', label: '선택', width: '45px', align: 'center', format: 'checkbox' },
  { key: 'orderNo', label: '발주번호', width: '130px', align: 'center' },
  { key: 'orderDate', label: '발주일자', width: '90px', align: 'center', format: 'date' },
  {
    key: 'status',
    label: '발주상태',
    width: '85px',
    align: 'center',
    render: (val) => {
      let bg = 'bg-slate-100 text-slate-700 border-slate-300';
      if (val === '미입고') bg = 'bg-blue-50 text-blue-700 border-blue-300 font-bold';
      if (val === '부분입고') bg = 'bg-amber-50 text-amber-700 border-amber-300 font-bold';
      if (val === '입고완료') bg = 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold';
      if (val === '발주취소') bg = 'bg-rose-50 text-rose-600 border-rose-300 font-bold';
      return (
        <span className={`inline-block px-1.5 py-0.5 text-[11px] rounded border ${bg}`}>
          {val}
        </span>
      );
    },
  },
  { key: 'supplier', label: '거래처', width: '130px', align: 'left' },
  { key: 'itemCount', label: '품목수', width: '60px', align: 'right', format: 'number' },
  { key: 'orderAmt', label: '발주금액(합계)', width: '120px', align: 'right', format: 'currency' },
  { key: 'receivedAmt', label: '기입고금액', width: '110px', align: 'right', format: 'currency' },
  { key: 'unreceivedAmt', label: '미입고금액', width: '110px', align: 'right', format: 'currency' },
  { key: 'expectedDate', label: '입고예정일', width: '90px', align: 'center', format: 'date' },
  { key: 'manager', label: '담당자', width: '90px', align: 'center' },
  { key: 'tel', label: '연락처', width: '110px', align: 'center' },
  { key: 'remark', label: '비고', width: '140px', align: 'left' },
];

const DETAIL_COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'itemCode', label: '품목코드', width: '100px', align: 'center' },
  { key: 'type', label: '구분', width: '65px', align: 'center' },
  { key: 'name', label: '품명', width: '220px', align: 'left' },
  { key: 'spec', label: '규격', width: '100px', align: 'center' },
  { key: 'unit', label: '단위', width: '50px', align: 'center' },
  { key: 'orderQty', label: '발주수량', width: '85px', align: 'right', format: 'number' },
  { key: 'unitPrice', label: '발주단가', width: '85px', align: 'right', format: 'currency' },
  { key: 'orderAmt', label: '발주금액(합계)', width: '110px', align: 'right', format: 'currency' },
  { key: 'receivedQty', label: '기입고수량', width: '85px', align: 'right', format: 'number' },
  { key: 'unreceivedQty', label: '미입고수량', width: '85px', align: 'right', format: 'number' },
  { key: 'expectedDate', label: '납품예정일', width: '90px', align: 'center', format: 'date' },
  { key: 'warehouse', label: '보관창고', width: '95px', align: 'center' },
  { key: 'remark', label: '비고', width: '150px', align: 'left' },
];


export const OrderStatusEditView: React.FC = () => {
  const [startDate, setStartDate] = useState(() => kstDaysAgo(29));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [supplierFilter, setSupplierFilter] = useState('전체');
  const [statusFilter, setStatusFilter] = useState('전체');

  const [masterList, setMasterList] = useState<OrderMasterRow[]>([]);
  const [selectedMasterId, setSelectedMasterId] = useState<number | null>(null);
  const [detailsMap, setDetailsMap] = useState<Record<number, OrderDetailRow[]>>({});
  const [loading, setLoading] = useState(true);

  // DB에서 실제 발주 내역 로드 (기간 조회)
  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      const res = await fetch(`/api/purchase/order?${params}`).then((r) => r.json());
      if (!res.success || !Array.isArray(res.data)) {
        setMasterList([]); setDetailsMap({}); setSelectedMasterId(null);
        return;
      }
      const newMaster: OrderMasterRow[] = [];
      const newDetails: Record<number, OrderDetailRow[]> = {};

      res.data.forEach((po: any, idx: number) => {
        const masterId = po.id || idx + 1;
        const details = po.details || [];
        const receivedAmt = details.reduce((sum: number, d: any) => sum + (d.receivedQty * d.unitPrice), 0);
        const totalAmt = po.totalAmount || details.reduce((sum: number, d: any) => sum + d.amount, 0);

        newMaster.push({
          id: masterId,
          checked: false,
          orderNo: po.orderNo,
          orderDate: po.orderDate,
          status: (po.status as any) || '미입고',
          supplier: po.partnerName || po.partner?.name || '미지정',
          itemCount: details.length,
          orderAmt: totalAmt,
          receivedAmt,
          unreceivedAmt: totalAmt - receivedAmt,
          expectedDate: po.deliveryDate || po.orderDate,
          manager: po.createdBy || '-',
          tel: po.partner?.tel || '-',
          remark: po.remark || '',
        });

        newDetails[masterId] = details.map((d: any, dIdx: number) => ({
          id: d.id ?? `${masterId}-${dIdx}`,
          itemCode: d.productCode || '',
          type: d.category || '원재료',
          name: d.productName || d.product?.name || '',
          spec: d.product?.spec || '',
          unit: d.unit || 'ea',
          orderQty: d.orderQty || 0,
          unitPrice: d.unitPrice || 0,
          orderAmt: d.amount || 0,
          receivedQty: d.receivedQty || 0,
          unreceivedQty: Math.max(0, (d.orderQty || 0) - (d.receivedQty || 0)),
          expectedDate: po.deliveryDate || po.orderDate,
          warehouse: d.product?.warehouse || '상온보관고',
          remark: d.remark || '',
        }));
      });

      setMasterList(newMaster);
      setDetailsMap(newDetails);
      setSelectedMasterId((prev) => {
        if (prev !== null && newMaster.some((x) => x.id === prev)) return prev;
        return newMaster.length > 0 ? newMaster[0].id : null;
      });
    } catch (err) {
      console.error('Failed to load purchase orders from DB:', err);
      setMasterList([]); setDetailsMap({}); setSelectedMasterId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMasterList = masterList.filter((row) => {
    if (supplierFilter !== '전체' && row.supplier !== supplierFilter) return false;
    if (statusFilter !== '전체' && row.status !== statusFilter) return false;
    return true;
  });

  const suppliers = useMemo(() => {
    const s = new Set<string>();
    masterList.forEach((m) => {
      const name = String(m.supplier || '').trim();
      if (name && name !== '미지정') s.add(name);
    });
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [masterList]);

  const selectedMaster = masterList.find((m) => m.id === selectedMasterId);
  const currentDetails = (selectedMasterId != null && detailsMap[selectedMasterId]) || [];

  const handleMasterCheck = (id: number, checked: boolean) => {
    setMasterList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked } : item))
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setMasterList((prev) => prev.map((item) => ({ ...item, checked })));
  };

  const handleDeleteChecked = async () => {
    const checkedItems = masterList.filter((m) => m.checked);
    if (checkedItems.length === 0) {
      alert('취소/삭제할 발주 항목을 선택해주세요.');
      return;
    }
    const ok = await erpConfirm(`선택한 ${checkedItems.length}건의 발주서를 취소하시겠습니까?`, '발주 취소 확인', 'danger');
    if (ok) {
      try {
        for (const item of checkedItems) {
          await fetch('/api/purchase/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'cancel',
              orderNo: item.orderNo,
              cancelReason: '사용자 선택 취소',
            }),
          });
        }
        setMasterList((prev) =>
          prev.map((m) => (m.checked ? { ...m, status: '발주취소' as any, checked: false } : m))
        );
        alert('선택한 발주서가 성공적으로 취소되었습니다.');
      } catch (err: any) {
        alert('발주 취소 처리 중 오류: ' + err.message);
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <SalesActionBar
        title="발주현황/수정"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => void loadData(startDate, endDate) },
          { key: 'delete', label: '삭제', icon: 'delete', variant: 'danger', onClick: () => void handleDeleteChecked() },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => { const s = kstDaysAgo(29); const t = kstToday(); setStartDate(s); setEndDate(t); setSupplierFilter('전체'); setStatusFilter('전체'); void loadData(s, t); } },
          { key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: () => exportGridToExcel({ filename: '발주현황', sheetName: '발주현황', columns: MASTER_COLUMNS, data: filteredMasterList }) },
        ]}
        helpContent="공급사별 발주 진행 현황을 조회하고 발주 정보 및 세부 품목 내역을 조회/수정/삭제합니다."
      />

      {/* 2. 검색 필터 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-inner">
        <div className="flex flex-wrap items-center gap-4">
          <SalesFilterBar
            label="발주일자"
            startDate={startDate}
            endDate={endDate}
            onDateRangeChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />

          <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
            <span className="font-semibold text-gray-700">매입처:</span>
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] rounded focus:outline-blue-500 shadow-sm"
                >
                  <option value="전체">전체 매입처 ({suppliers.length})</option>
                  {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">발주상태:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] rounded focus:outline-blue-500 shadow-sm"
            >
              <option value="전체">전체 상태</option>
              <option value="미입고">미입고</option>
              <option value="부분입고">부분입고</option>
              <option value="입고완료">입고완료</option>
              <option value="발주취소">발주취소</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-semibold shadow-xs">
            조회건수: <span className="text-blue-700 font-bold">{filteredMasterList.length}</span> 건
          </span>
        </div>
      </div>

      {/* 3. 상하 2분할 레이아웃 */}
      <div className="flex-1 flex flex-col min-h-0 p-2 gap-2">
        {/* 상단: 요약 발주 목록 (Master) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <div className="flex items-center gap-3">
              <span className="font-bold text-gray-800 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                발주 마스터 현황
              </span>
              <label className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded cursor-pointer"
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
                전체선택
              </label>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-600">
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-blue-600" />
                미입고: <span className="font-semibold">{masterList.filter((m) => m.status === '미입고').length}</span>
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle size={12} className="text-amber-600" />
                부분입고: <span className="font-semibold">{masterList.filter((m) => m.status === '부분입고').length}</span>
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-600" />
                입고완료: <span className="font-semibold">{masterList.filter((m) => m.status === '입고완료').length}</span>
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <PurchaseDataGrid
              columns={MASTER_COLUMNS}
              data={filteredMasterList}
              selectedRowId={selectedMasterId}
              onRowClick={(row) => setSelectedMasterId(row.id)}
              onCellChange={(id, key, val) => {
                if (key === 'checked') handleMasterCheck(id, val);
              }}
              summaryRowTitle="합계 (총 발주)"
            />
          </div>
        </div>

        {/* 하단: 내역 상세 그리드 (Detail) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">
                발주 상세 품목 내역 ▶
              </span>
              {selectedMaster ? (
                <span className="bg-blue-100 text-blue-900 border border-blue-300 font-semibold px-2 py-0.5 rounded text-[11px]">
                  발주번호: <span className="font-mono font-bold text-blue-700">{selectedMaster.orderNo}</span> | 거래처: <span className="font-bold">{selectedMaster.supplier}</span> | 상태: <span className="font-bold">{selectedMaster.status}</span>
                </span>
              ) : (
                <span className="text-gray-500 text-[11px]">선택된 발주가 없습니다.</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-600 font-medium">
                품목수: <span className="text-blue-700 font-bold">{currentDetails.length}</span> 건
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {currentDetails.length > 0 ? (
              <PurchaseDataGrid
                columns={DETAIL_COLUMNS}
                data={currentDetails}
                summaryRowTitle="합계 (품목)"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-[13px]">
                상단에서 발주 건을 선택하면 상세 품목 리스트가 표시됩니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

