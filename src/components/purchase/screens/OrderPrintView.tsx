'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { SalesFilterBar } from '@/components/sales/common/SalesFilterBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '../common/PurchaseDataGrid';
import { usePrintReport } from '@/context/PrintReportContext';
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

// Fallback sample data in case DB is initially empty
const FALLBACK_ORDER_SUMMARY = [
  { id: 1, checked: false, issued: false, printBtn: '...', orderDate: '2026-10-30', orderNo: 'pc25345', status: '미입고', supplier: '평화영농조합', orderAmt: 27000000, method: '카톡', manager: '이창승 상무', tel: '010-3565-92XX', email: 'peace_rice@nonghyup.com', remark: '당일 도정미 직납' },
  { id: 2, checked: false, issued: false, printBtn: '...', orderDate: '2026-10-30', orderNo: 'pc25344', status: '미입고', supplier: '사조오양', orderAmt: 84000, method: '카톡', manager: '김영하 대리', tel: '010-4236-04XX', email: 'yhkim@sajo.co.kr', remark: '' },
  { id: 3, checked: false, issued: true, printBtn: '...', orderDate: '2026-10-30', orderNo: 'pc25343', status: '미입고', supplier: '이우유통', orderAmt: 4414600, method: '카톡13시', manager: '구동서 부장', tel: '010-4717-25XX', email: 'leewoo_dist@naver.com', remark: '오후 배송 지정' },
  { id: 4, checked: false, issued: true, printBtn: '...', orderDate: '2026-10-30', orderNo: 'pc25342', status: '미입고', supplier: '야미푸드', orderAmt: 153000, method: '카톡', manager: '이하경 이사', tel: '010-5661-11XX', email: 'yummy_hk@daum.net', remark: '' },
  { id: 5, checked: false, issued: true, printBtn: '...', orderDate: '2026-10-30', orderNo: 'pc25341', status: '미입고', supplier: '한성기업', orderAmt: 3980400, method: '이메일', manager: '정재근 대리', tel: '010-7191-71XX', email: 'hansung_jg@hansung.co.kr', remark: '콜드체인 검수필' },
  { id: 6, checked: false, issued: true, printBtn: '...', orderDate: '2026-10-30', orderNo: 'pc25340', status: '미입고', supplier: '한성기업', orderAmt: 4608600, method: '이메일', manager: '정재근 대리', tel: '010-7191-71XX', email: 'hansung_jg@hansung.co.kr', remark: '크래미 및 맛살 2편' },
];

const FALLBACK_DETAILS: Record<number, any[]> = {
  1: [
    { id: 101, type: '원재료', name: '국내산 경기미 백미(햅쌀)', spec: '20kg/포', unit: '포', orderQty: 500, unitPrice: 54000, orderAmt: 27000000, recvDate: '2026-10-31', remark: '수분함량 15% 이하' },
  ],
  2: [
    { id: 201, type: '원재료', name: '가공 참치플레이크(오일)', spec: '1.8kg*6캔', unit: 'box', orderQty: 1, unitPrice: 84000, orderAmt: 84000, recvDate: '2026-10-31', remark: '샘플 발주' },
  ],
  3: [
    { id: 301, type: '원재료', name: '골드마요네즈 3.2kg', spec: '3.2kg*4통', unit: 'box', orderQty: 60, unitPrice: 38000, orderAmt: 2280000, recvDate: '2026-10-31', remark: '' },
    { id: 302, type: '원재료', name: '슬라이스치즈(고소한맛)', spec: '1kg*10팩', unit: 'box', orderQty: 30, unitPrice: 71153, orderAmt: 2134600, recvDate: '2026-10-31', remark: '' },
  ],
  4: [
    { id: 401, type: '부재료', name: '도시락용 조미김 포션', spec: '2g*500봉', unit: 'box', orderQty: 3, unitPrice: 51000, orderAmt: 153000, recvDate: '2026-10-31', remark: '' },
  ],
  5: [
    { id: 501, type: '원재료', name: '[냉장]다진맛살 10kg', spec: '10kg*2ea', unit: 'box', orderQty: 40, unitPrice: 52000, orderAmt: 2080000, recvDate: '2026-10-31', remark: '김밥용 원료' },
    { id: 502, type: '원재료', name: '[냉동]궁채나물 1kg', spec: '1kg*10ea', unit: 'box', orderQty: 30, unitPrice: 63346, orderAmt: 1900400, recvDate: '2026-10-31', remark: '' },
  ],
  6: [
    { id: 601, type: '원재료', name: '[냉장]볶음김치 5kg', spec: '5kg*3ea', unit: 'box', orderQty: 80, unitPrice: 42000, orderAmt: 3360000, recvDate: '2026-10-31', remark: '제육도시락 볶음김치' },
    { id: 602, type: '원재료', name: '[냉동]우양지 슬라이스', spec: '2kg*5팩', unit: 'box', orderQty: 10, unitPrice: 124860, orderAmt: 1248600, recvDate: '2026-10-31', remark: '' },
  ],
};

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
  const { openPrintModal, setPoPayload } = usePrintReport();
  const { openTab } = useTabs();

  const [startDate, setStartDate] = useState<string>(kstDaysAgo(7));
  const [endDate, setEndDate] = useState<string>(kstToday());
  const [summaryList, setSummaryList] = useState<any[]>([]);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number | string | null>(null);
  const [detailMap, setDetailMap] = useState<Record<string | number, any[]>>({});
  const [loading, setLoading] = useState<boolean>(false);

  const fetchOrders = useCallback(async (s: string, e: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      const res = await fetch(`/api/purchase/order?${params}`, { cache: 'no-store' });
      const json = await res.json();

      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
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
            manager: o.partner?.ceo || o.createdBy || '담당자',
            tel: o.partner?.tel || '010-0000-0000',
            email: o.partner?.email || 'partner@gfs.com',
            remark: o.remark || '',
            deliveryDate: o.deliveryDate || o.orderDate,
          };
        });

        setSummaryList(loaded);
        setDetailMap(dMap);
        setSelectedSummaryId(loaded[0]?.id || null);
      } else {
        // Fallback to sample data if no PO in range
        setSummaryList(FALLBACK_ORDER_SUMMARY);
        setDetailMap(FALLBACK_DETAILS);
        setSelectedSummaryId(FALLBACK_ORDER_SUMMARY[0].id);
      }
    } catch (err) {
      console.error('Failed to load purchase orders for print', err);
      setSummaryList(FALLBACK_ORDER_SUMMARY);
      setDetailMap(FALLBACK_DETAILS);
      setSelectedSummaryId(FALLBACK_ORDER_SUMMARY[0].id);
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

  // Launch single print modal with exact payload
  const handlePrintSingle = (order: any) => {
    const details = detailMap[order.id] || [];
    setPoPayload({
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
    });
    openPrintModal('PURCHASE_ORDER');
  };

  // Launch batch print
  const handleBatchPrint = () => {
    const checkedOrders = summaryList.filter((s) => s.checked);
    const target = checkedOrders.length > 0 ? checkedOrders[0] : selectedOrder;
    if (!target) {
      alert('인쇄할 발주서를 선택해주세요.');
      return;
    }
    handlePrintSingle(target);
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
