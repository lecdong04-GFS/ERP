'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { SalesFilterBar } from '@/components/sales/common/SalesFilterBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '../common/PurchaseDataGrid';
import { usePrintReport, PurchaseOrderPrintPayload } from '@/context/PrintReportContext';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { exportGridToExcel } from '@/lib/excelExport';
import {
  Printer,
  FileSpreadsheet,
  Search,
  RotateCcw,
  ExternalLink,
  CheckCircle2,
  Clock,
  Truck,
  Building2,
  Calendar,
} from 'lucide-react';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

const SUMMARY_COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'checked', label: '선택', width: '45px', align: 'center', format: 'checkbox' },
  { key: 'issued', label: '발행여부', width: '65px', align: 'center', format: 'checkbox' },
  { key: 'printBtn', label: '발주서발행', width: '75px', align: 'center' },
  { key: 'orderDate', label: '발주일', width: '90px', align: 'center', format: 'date' },
  { key: 'orderNo', label: '발주번호', width: '100px', align: 'center' },
  { key: 'status', label: '상태', width: '70px', align: 'center' },
  { key: 'supplier', label: '거래처', width: '140px', align: 'left' },
  { key: 'orderAmt', label: '발주금액(합계)', width: '120px', align: 'right', format: 'currency', highlight: true },
  { key: 'method', label: '발주수단', width: '80px', align: 'center' },
  { key: 'manager', label: '담당자', width: '90px', align: 'center' },
  { key: 'tel', label: '연락처', width: '110px', align: 'center' },
  { key: 'email', label: 'email', width: '180px', align: 'left' },
  { key: 'remark', label: '비고', width: '160px', align: 'left' },
];

const DETAIL_COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'type', label: '구분', width: '70px', align: 'center' },
  { key: 'name', label: '품명', width: '220px', align: 'left' },
  { key: 'spec', label: '규격', width: '110px', align: 'center' },
  { key: 'unit', label: '단위', width: '50px', align: 'center' },
  { key: 'packUnit', label: '입수', width: '55px', align: 'right', format: 'number' },
  { key: 'orderQty', label: '발주수량', width: '90px', align: 'right', format: 'number' },
  { key: 'bagPrice', label: '봉단가', width: '80px', align: 'right', format: 'currency' },
  { key: 'unitPrice', label: '발주단가', width: '90px', align: 'right', format: 'currency' },
  { key: 'orderAmt', label: '발주금액(합계)', width: '120px', align: 'right', format: 'currency' },
  { key: 'recvDate', label: '입고예정일', width: '95px', align: 'center', format: 'date' },
  { key: 'remark', label: '비고 / 품질기준', width: '180px', align: 'left' },
];

export const OrderPrintView: React.FC = () => {
  const { openPrintModal, setPoPayload, setPoPayloadList } = usePrintReport();
  const { openTab } = useTabs();

  const [startDate, setStartDate] = useState<string>(kstDaysAgo(7));
  const [endDate, setEndDate] = useState<string>(kstToday());
  const [summaryList, setSummaryList] = useState<any[]>([]);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number | string | null>(null);
  const [detailMap, setDetailMap] = useState<Record<string | number, any[]>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');

  const fetchOrders = useCallback(async (s: string, e: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      const res = await fetch(`/api/purchase/order?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `조회 실패 (HTTP ${res.status})`);
      }

      if (Array.isArray(json.data) && json.data.length > 0) {
        const dMap: Record<string | number, any[]> = {};
        const loaded: any[] = json.data.map((o: any, idx: number) => {
          const id = o.id || idx + 1;
          const details = o.details || [];
          dMap[id] = details.map((d: any, dIdx: number) => ({
            id: d.id || `${id}-${dIdx}`,
            type: d.product?.category || (d.product?.itemCode?.startsWith('R') ? '원재료' : '부재료'),
            name: d.product?.name || d.productName || '자재품목',
            spec: d.product?.spec || '-',
            unit: d.unit || d.product?.unit || 'box',
            packUnit: Number(d.packUnit) || 1,
            orderQty: d.orderQty || 0,
            bagPrice: Number(d.bagPrice) || 0,
            boxPrice: Number(d.boxPrice) || 0,
            unitPrice: d.unitPrice || 0,
            orderAmt: d.amount || (d.orderQty || 0) * (d.unitPrice || 0),
            recvDate: o.deliveryDate || o.orderDate,
            remark: d.remark || '',
          }));

          const totalAmt =
            o.totalAmount ||
            details.reduce((acc: number, cur: any) => acc + (cur.amount || (cur.orderQty * cur.unitPrice) || 0), 0);

          return {
            id,
            checked: false,
            issued: o.status !== '발주',
            printBtn: '인쇄',
            orderDate: o.orderDate,
            orderNo: o.orderNo,
            status: o.status || '미입고',
            supplier: o.partnerName || o.partner?.name || '공급처',
            orderAmt: totalAmt,
            method: '전산/카톡',
            manager: o.partner?.ceo || o.createdBy || '',
            tel: o.partner?.tel || '',
            email: o.partner?.email || '',
            remark: o.remark || '',
            deliveryDate: o.deliveryDate || o.orderDate,
          };
        });

        setSummaryList(loaded);
        setDetailMap(dMap);
        setSelectedSummaryId(loaded[0]?.id || null);
      } else {
        setSummaryList([]);
        setDetailMap({});
        setSelectedSummaryId(null);
      }
    } catch (err: any) {
      console.error('Failed to load purchase orders for print', err);
      setLoadError(err?.message || '발주 목록 조회 중 오류가 발생했습니다.');
      setSummaryList([]);
      setDetailMap({});
      setSelectedSummaryId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders(startDate, endDate);
  }, [fetchOrders, startDate, endDate]);

  const currentDetails = useMemo(() => {
    if (!selectedSummaryId) return [];
    return detailMap[selectedSummaryId] || [];
  }, [detailMap, selectedSummaryId]);

  const selectedOrder = useMemo(() => {
    return summaryList.find((s) => s.id === selectedSummaryId);
  }, [summaryList, selectedSummaryId]);

  const allChecked = summaryList.length > 0 && summaryList.every((s) => s.checked);

  const handleSelectAll = (checked: boolean) => {
    setSummaryList((prev) => prev.map((s) => ({ ...s, checked })));
  };

  const handleSummaryRowChange = (id: any, key: string, val: any) => {
    setSummaryList((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: val } : s)));
  };

  const toPoPrintPayload = (order: any): PurchaseOrderPrintPayload => {
    const details = detailMap[order.id] || [];
    return {
      orderNo: order.orderNo,
      orderDate: order.orderDate,
      deliveryDate: order.deliveryDate || order.orderDate,
      supplierName: order.supplier,
      manager: order.manager,
      tel: order.tel,
      email: order.email,
      remark: order.remark,
      totalAmount: order.orderAmt,
      items: details.map((d: any, idx: number) => ({
        no: idx + 1,
        name: d.name,
        spec: d.spec,
        unit: d.unit,
        qty: d.orderQty,
        price: d.unitPrice,
        amt: d.orderAmt,
        recvDate: d.recvDate,
        remark: d.remark,
      })),
    };
  };

  // Launch single print modal with exact payload
  const handlePrintSingle = (order: any) => {
    const payload = toPoPrintPayload(order);
    setPoPayload(payload);
    setPoPayloadList([payload]);
    openPrintModal('PURCHASE_ORDER');
  };

  // Launch batch print
  const handleBatchPrint = () => {
    const checkedOrders = summaryList.filter((s) => s.checked);
    const targets =
      checkedOrders.length > 0 ? checkedOrders : selectedOrder ? [selectedOrder] : [];
    if (targets.length === 0) {
      alert('인쇄할 발주서를 선택해주세요.');
      return;
    }
    const payloads = targets.map(toPoPrintPayload);
    setPoPayload(payloads[0]);
    setPoPayloadList(payloads);
    openPrintModal('PURCHASE_ORDER');
  };

  // Excel Export
  const handleExportExcel = () => {
    if (summaryList.length === 0) {
      alert('내보낼 발주 데이터가 없습니다.');
      return;
    }
    exportGridToExcel({
      filename: `GFS_원부자재발주목록_${startDate}_${endDate}`,
      sheetName: '발주서목록',
      columns: SUMMARY_COLUMNS.filter((c) => c.key !== 'checked' && c.key !== 'printBtn').map((c) => ({
        key: c.key,
        label: c.label,
        format: c.format,
      })),
      data: summaryList,
    });
  };

  const totalOrderAmt = useMemo(() => {
    return summaryList.reduce((acc, cur) => acc + (Number(cur.orderAmt) || 0), 0);
  }, [summaryList]);

  const openPipelineTab = (menuId: string) => {
    const item = getMenuItemById(menuId);
    if (item) {
      openTab(item);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션바 */}
      <SalesActionBar
        title="발주서출력 (PURCHASE ORDER PRINT)"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => fetchOrders(startDate, endDate) },
          { key: 'print', label: '발주서발행/인쇄', icon: 'print', variant: 'success', onClick: handleBatchPrint },
          { key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: handleExportExcel },
          { key: 'reset', label: '새로고침', icon: 'reset', variant: 'secondary', onClick: () => fetchOrders(startDate, endDate) },
        ]}
        helpContent="확정된 실시간 원부자재 발주서를 조회하고 거래처용 A4 표준 발주서 양식(PURCHASE ORDER)을 인쇄하거나 엑셀로 내보냅니다."
      />

      {/* 2. 파이프라인 바로가기 퀵 네비게이션 */}
      <div className="bg-slate-800 text-white px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 shadow-inner">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            발주 파이프라인 연계:
          </span>
          <span className="text-[11px] text-slate-300">
            [자재발주(요일별) 확정] → [소요량확정] → [발주현황/수정] → <strong>[발주서출력]</strong> → [입고등록(GSR)]
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => openPipelineTab('pur-mat-order-day')}
            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1"
          >
            <span>자재발주(요일별)</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={() => openPipelineTab('pur-order-req-confirm')}
            className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1"
          >
            <span>발주소요량확정</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={() => openPipelineTab('pur-order-status-edit')}
            className="px-2 py-0.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1"
          >
            <span>발주현황/수정</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={() => openPipelineTab('pur-receiving-reg')}
            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1"
          >
            <span>입고등록(GSR)</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 3. 필터바 */}
      <SalesFilterBar
        label="발주일자"
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        dataCount={summaryList.length}
        onRefresh={() => fetchOrders(startDate, endDate)}
      />

      {/* 4. 메인 화면 (상단 마스터 요약 + 하단 디테일 내역) */}
      <div className="flex-1 flex flex-col p-1.5 gap-1.5 overflow-hidden">
        {loadError && (
          <div className="px-3 py-1.5 bg-rose-50 border border-rose-300 text-rose-700 text-[11px] font-semibold rounded">
            발주 목록 조회 오류: {loadError}
          </div>
        )}
        {/* 상단 [요약] 그리드 */}
        <div className="flex flex-col h-1/2 min-h-0 bg-white border border-gray-400">
          <div className="px-2 py-1 bg-[#e2e8f0] border-b border-gray-300 font-bold text-gray-800 text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-blue-900">
                <span className="w-2 h-2 bg-blue-600 inline-block" />
                발주처별 발주서 목록 (선택 시 하단에 세부 발주품목 출력)
              </span>
              <label className="flex items-center gap-1 text-[11px] text-gray-800 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="cursor-pointer"
                />
                <span>전체선택</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-medium text-[11px]">
                조회건수: <strong className="text-blue-700">{summaryList.length}</strong>건 /
                총 발주금액: <strong className="text-blue-900">{totalOrderAmt.toLocaleString()}</strong>원
              </span>
              {selectedOrder && (
                <button
                  onClick={() => handlePrintSingle(selectedOrder)}
                  className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-sm"
                >
                  <Printer className="w-3 h-3" />
                  선택 발주서 인쇄 [{selectedOrder.orderNo}]
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PurchaseDataGrid
              columns={SUMMARY_COLUMNS}
              data={summaryList}
              selectedRowId={selectedSummaryId}
              onSelectRow={(row) => setSelectedSummaryId(row.id)}
              onRowChange={handleSummaryRowChange}
              summaryData={{
                orderAmt: totalOrderAmt,
              }}
            />
          </div>
        </div>

        {/* 하단 [내역] 그리드 */}
        <div className="flex flex-col h-1/2 min-h-0 bg-white border border-gray-400">
          <div className="px-2 py-1 bg-[#e2e8f0] border-b border-gray-300 font-bold text-gray-800 text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-600 inline-block" />
              <span className="text-blue-900">
                원부자재 세부 발주내역 —
                {selectedOrder ? (
                  <span className="ml-1 text-slate-800 font-extrabold">
                    [{selectedOrder.supplier}] 발주번호: {selectedOrder.orderNo} (입고예정: {selectedOrder.deliveryDate || selectedOrder.orderDate})
                  </span>
                ) : (
                  <span className="text-gray-500 font-normal">발주서를 선택하세요</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-800 font-bold text-[11px]">
                품목수: {currentDetails.length}건
              </span>
              <span className="text-gray-700 font-bold text-[11px]">
                품목합계: {currentDetails.reduce((sum, d) => sum + (d.orderAmt || 0), 0).toLocaleString()}원
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PurchaseDataGrid
              columns={DETAIL_COLUMNS}
              data={currentDetails}
              summaryData={{
                orderQty: currentDetails.reduce((sum, d) => sum + (Number(d.orderQty) || 0), 0),
                orderAmt: currentDetails.reduce((sum, d) => sum + (Number(d.orderAmt) || 0), 0),
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
