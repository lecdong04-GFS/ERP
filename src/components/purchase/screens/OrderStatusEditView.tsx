'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { SalesFilterBar } from '@/components/sales/common/SalesFilterBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '../common/PurchaseDataGrid';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Save,
  Printer,
  Truck,
  ExternalLink,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
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
  status: '발주' | '미입고' | '부분입고' | '입고완료' | '발주취소';
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
  { key: 'orderNo', label: '발주번호', width: '145px', align: 'center' },
  { key: 'orderDate', label: '발주일자', width: '95px', align: 'center', format: 'date' },
  {
    key: 'status',
    label: '발주상태',
    width: '90px',
    align: 'center',
    render: (val) => {
      let bg = 'bg-slate-100 text-slate-700 border-slate-300';
      if (val === '발주' || val === '미입고') bg = 'bg-blue-50 text-blue-700 border-blue-300 font-bold';
      if (val === '부분입고') bg = 'bg-amber-50 text-amber-700 border-amber-300 font-bold';
      if (val === '입고완료') bg = 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold';
      if (val === '발주취소') bg = 'bg-rose-50 text-rose-600 border-rose-300 font-bold';
      return (
        <span className={`inline-block px-2 py-0.5 text-[11px] rounded border ${bg}`}>
          {val === '발주' ? '미입고(발주)' : val}
        </span>
      );
    },
  },
  { key: 'supplier', label: '거래처', width: '140px', align: 'left' },
  { key: 'itemCount', label: '품목수', width: '60px', align: 'right', format: 'number' },
  { key: 'orderAmt', label: '발주금액(합계)', width: '120px', align: 'right', format: 'currency' },
  { key: 'receivedAmt', label: '기입고금액', width: '110px', align: 'right', format: 'currency' },
  { key: 'unreceivedAmt', label: '미입고금액', width: '110px', align: 'right', format: 'currency' },
  { key: 'expectedDate', label: '입고예정일', width: '90px', align: 'center', format: 'date' },
  { key: 'manager', label: '담당자', width: '90px', align: 'center' },
  { key: 'tel', label: '연락처', width: '110px', align: 'center' },
  { key: 'remark', label: '비고', width: '160px', align: 'left' },
];

const DETAIL_COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'itemCode', label: '품목코드', width: '110px', align: 'center' },
  { key: 'type', label: '구분', width: '65px', align: 'center' },
  { key: 'name', label: '품명', minWidth: '220px', align: 'left' },
  { key: 'spec', label: '규격', width: '100px', align: 'center' },
  { key: 'unit', label: '단위', width: '50px', align: 'center' },
  {
    key: 'orderQty',
    label: '발주수량(✏️)',
    width: '95px',
    align: 'right',
    format: 'number',
    editable: true,
    highlight: true,
  },
  {
    key: 'unitPrice',
    label: '발주단가(✏️)',
    width: '90px',
    align: 'right',
    format: 'currency',
    editable: true,
  },
  { key: 'orderAmt', label: '발주금액(합계)', width: '110px', align: 'right', format: 'currency' },
  { key: 'receivedQty', label: '기입고수량', width: '85px', align: 'right', format: 'number' },
  { key: 'unreceivedQty', label: '미입고수량', width: '85px', align: 'right', format: 'number' },
  { key: 'expectedDate', label: '납품예정일', width: '90px', align: 'center', format: 'date' },
  { key: 'warehouse', label: '보관창고', width: '95px', align: 'center' },
  { key: 'remark', label: '비고(✏️)', width: '150px', align: 'left', editable: true },
];

export const OrderStatusEditView: React.FC = () => {
  const { openTab } = useTabs();

  // 검색 조건
  const [startDate, setStartDate] = useState(() => kstDaysAgo(29));
  const [endDate, setEndDate] = useState(() => kstToday());
  const [supplierFilter, setSupplierFilter] = useState('전체');
  const [statusFilter, setStatusFilter] = useState('전체');

  // 데이터 상태
  const [masterList, setMasterList] = useState<OrderMasterRow[]>([]);
  const [selectedMasterId, setSelectedMasterId] = useState<number | null>(null);
  const [detailsMap, setDetailsMap] = useState<Record<number, OrderDetailRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 탭 이동 헬퍼
  const handleNavigate = (menuId: string) => {
    const item = getMenuItemById(menuId);
    if (item) {
      openTab(item);
    }
  };

  // DB에서 실제 발주 내역 로드 (기간 조회)
  const loadData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    setHasChanges(false);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      const res = await fetch(`/api/purchase/order?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) {
        setMasterList([]);
        setDetailsMap({});
        setSelectedMasterId(null);
        return;
      }
      const newMaster: OrderMasterRow[] = [];
      const newDetails: Record<number, OrderDetailRow[]> = {};

      json.data.forEach((po: any, idx: number) => {
        const masterId = po.id || idx + 1;
        const details = po.details || [];
        const receivedAmt = details.reduce(
          (sum: number, d: any) => sum + (d.receivedQty || 0) * (d.unitPrice || 0),
          0
        );
        const totalAmt =
          po.totalAmount ||
          details.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);

        newMaster.push({
          id: masterId,
          checked: false,
          orderNo: po.orderNo,
          orderDate: po.orderDate,
          status: (po.status as any) || '발주',
          supplier: po.partnerName || po.partner?.name || '미지정',
          itemCount: details.length,
          orderAmt: totalAmt,
          receivedAmt,
          unreceivedAmt: Math.max(0, totalAmt - receivedAmt),
          expectedDate: po.deliveryDate || po.orderDate,
          manager: po.createdBy || '-',
          tel: po.partner?.tel || '-',
          remark: po.remark || '',
        });

        newDetails[masterId] = details.map((d: any, dIdx: number) => ({
          id: d.id ?? Number(`${masterId}${dIdx}`),
          itemCode: d.productCode || '',
          type: d.category || '원재료',
          name: d.productName || d.product?.name || '',
          spec: d.product?.spec || '',
          unit: d.unit || 'ea',
          orderQty: Number(d.orderQty) || 0,
          unitPrice: Number(d.unitPrice) || 0,
          orderAmt: Number(d.amount) || (Number(d.orderQty) || 0) * (Number(d.unitPrice) || 0),
          receivedQty: Number(d.receivedQty) || 0,
          unreceivedQty: Math.max(0, (Number(d.orderQty) || 0) - (Number(d.receivedQty) || 0)),
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
      setMasterList([]);
      setDetailsMap({});
      setSelectedMasterId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 필터링
  const filteredMasterList = masterList.filter((row) => {
    if (supplierFilter !== '전체' && row.supplier !== supplierFilter) return false;
    if (statusFilter !== '전체') {
      if (statusFilter === '미입고' && row.status !== '미입고' && row.status !== '발주')
        return false;
      if (statusFilter !== '미입고' && row.status !== statusFilter) return false;
    }
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

  // 체크박스 핸들러
  const handleMasterCheck = (id: number, checked: boolean) => {
    setMasterList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked } : item))
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setMasterList((prev) => prev.map((item) => ({ ...item, checked })));
  };

  // 상세 품목 수량/단가/비고 인라인 수정 핸들러
  const handleDetailCellChange = (detailId: any, key: string, val: any) => {
    if (selectedMasterId == null) return;
    setHasChanges(true);

    setDetailsMap((prev) => {
      const details = prev[selectedMasterId] || [];
      const updatedDetails = details.map((d) => {
        if (d.id === detailId) {
          const updated = { ...d, [key]: val };
          if (key === 'orderQty' || key === 'unitPrice') {
            const q = Number(updated.orderQty) || 0;
            const p = Number(updated.unitPrice) || 0;
            updated.orderAmt = q * p;
            updated.unreceivedQty = Math.max(0, q - (updated.receivedQty || 0));
          }
          return updated;
        }
        return d;
      });

      // 마스터 행 금액 갱신
      const newTotalAmt = updatedDetails.reduce((sum, d) => sum + d.orderAmt, 0);
      const newRecvAmt = updatedDetails.reduce((sum, d) => sum + d.receivedQty * d.unitPrice, 0);

      setMasterList((mPrev) =>
        mPrev.map((m) =>
          m.id === selectedMasterId
            ? {
                ...m,
                orderAmt: newTotalAmt,
                receivedAmt: newRecvAmt,
                unreceivedAmt: Math.max(0, newTotalAmt - newRecvAmt),
              }
            : m
        )
      );

      return {
        ...prev,
        [selectedMasterId]: updatedDetails,
      };
    });
  };

  // 발주서 수정 내용 DB 저장
  const handleSaveOrderDetails = async () => {
    if (selectedMasterId == null || !selectedMaster) {
      alert('수정할 발주서를 먼저 선택해주세요.');
      return;
    }

    const detailsToSave = detailsMap[selectedMasterId] || [];
    if (detailsToSave.length === 0) {
      alert('발주 품목이 없습니다.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/purchase/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_order',
          orderId: selectedMaster.id,
          orderNo: selectedMaster.orderNo,
          details: detailsToSave.map((d) => ({
            id: d.id,
            orderQty: d.orderQty,
            unitPrice: d.unitPrice,
            remark: d.remark,
          })),
        }),
      });

      const json = await res.json();
      if (json.success) {
        alert(`✅ 발주서(${selectedMaster.orderNo}) 수정 내용이 성공적으로 저장되었습니다!`);
        setHasChanges(false);
        loadData(startDate, endDate);
      } else {
        alert('발주서 수정 실패: ' + (json.error || '오류가 발생했습니다.'));
      }
    } catch (e: any) {
      alert('발주서 저장 통신 오류: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 선택 발주서 영구 삭제 (DB 삭제)
  const handleDeleteOrdersPermanently = async () => {
    const checkedItems = masterList.filter((m) => m.checked);
    if (checkedItems.length === 0) {
      alert('삭제할 발주서를 먼저 체크박스로 선택해주세요.');
      return;
    }

    const hasReceived = checkedItems.some((m) => m.status === '입고완료' || m.receivedAmt > 0);
    if (hasReceived) {
      alert(
        '선택한 발주서 중 이미 입고되었거나 부분 입고된 발주서가 포함되어 있습니다.\n입고 처리된 발주서는 삭제할 수 없으며, 입고등록 화면에서 먼저 입고를 취소해야 합니다.'
      );
      return;
    }

    const ok = await erpConfirm(
      `선택한 ${checkedItems.length}건의 발주서를 데이터베이스에서 완전히 영구 삭제하시겠습니까?\n\n` +
        `• 대상 발주번호: ${checkedItems.map((x) => x.orderNo).slice(0, 5).join(', ')}${
          checkedItems.length > 5 ? ` 외 ${checkedItems.length - 5}건` : ''
        }\n• 총 금액: ₩${Math.round(
          checkedItems.reduce((acc, x) => acc + x.orderAmt, 0)
        ).toLocaleString()}원\n\n⚠️ 삭제된 발주서는 복구할 수 없습니다.`,
      '발주서 영구 삭제 확인',
      'danger'
    );
    if (!ok) return;

    try {
      const res = await fetch('/api/purchase/order', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: checkedItems.map((m) => m.id),
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`✅ ${json.message || '선택한 발주서가 성공적으로 삭제되었습니다.'}`);
        loadData(startDate, endDate);
      } else {
        alert('발주서 삭제 실패: ' + (json.error || '오류가 발생했습니다.'));
      }
    } catch (err: any) {
      alert('발주서 삭제 통신 오류: ' + err.message);
    }
  };

  // 선택 발주서 취소 (상태만 '발주취소'로 변경)
  const handleCancelChecked = async () => {
    const checkedItems = masterList.filter((m) => m.checked);
    if (checkedItems.length === 0) {
      alert('취소할 발주서를 체크박스로 선택해주세요.');
      return;
    }
    const ok = await erpConfirm(
      `선택한 ${checkedItems.length}건의 발주서를 '발주취소' 상태로 변경하시겠습니까?`,
      '발주 취소 확인',
      'danger'
    );
    if (ok) {
      try {
        const res = await fetch('/api/purchase/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cancel',
            ids: checkedItems.map((m) => m.id),
            cancelReason: '발주현황 화면에서 취소',
          }),
        });
        const json = await res.json();
        if (json.success) {
          alert('선택한 발주서가 성공적으로 취소되었습니다.');
          loadData(startDate, endDate);
        } else {
          alert('발주 취소 처리 실패: ' + (json.error || '오류'));
        }
      } catch (err: any) {
        alert('발주 취소 처리 중 오류: ' + err.message);
      }
    }
  };

  // 개별 품목 삭제 핸들러
  const handleDeleteDetailRow = async (detailId: number, itemName: string) => {
    const ok = await erpConfirm(
      `해당 발주 품목 [${itemName}]을(를) 발주서에서 삭제하시겠습니까?\n(발주서 내 마지막 품목인 경우 발주서도 함께 삭제됩니다)`,
      '발주 품목 삭제',
      'danger'
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/purchase/order?detailId=${detailId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        alert(`✅ ${json.message || '품목이 삭제되었습니다.'}`);
        loadData(startDate, endDate);
      } else {
        alert('품목 삭제 실패: ' + (json.error || '오류가 발생했습니다.'));
      }
    } catch (err: any) {
      alert('품목 삭제 통신 오류: ' + err.message);
    }
  };

  // 엑셀 내보내기 (Master & Detail 전체)
  const handleExportExcel = () => {
    exportGridToExcel({
      filename: `발주현황_${startDate}_${endDate}`,
      sheetName: '발주마스터',
      columns: MASTER_COLUMNS,
      data: filteredMasterList,
    });
  };

  // 상세 품목 컬럼 (개별 품목 삭제 버튼 포함)
  const detailColumns = useMemo<PurchaseGridColumnDef[]>(() => {
    return [
      ...DETAIL_COLUMNS,
      {
        key: '_delete',
        label: '품목삭제',
        width: '75px',
        align: 'center',
        render: (_val, row) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (row?.id) {
                handleDeleteDetailRow(row.id, row.name);
              }
            }}
            className="px-2 py-0.5 text-[11px] font-bold text-rose-600 hover:text-white hover:bg-rose-600 rounded border border-rose-300 transition-colors shadow-2xs"
            title="이 품목만 발주서에서 삭제"
          >
            삭제
          </button>
        ),
      },
    ];
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px] font-sans">
      {/* 1. 상단 액션 바 */}
      <SalesActionBar
        title="발주현황/수정"
        buttons={[
          {
            key: 'search',
            label: '조회',
            icon: 'search',
            variant: 'primary',
            onClick: () => void loadData(startDate, endDate),
          },
          {
            key: 'save',
            label: hasChanges ? '수정저장(반영필요)' : '수정저장',
            icon: 'save',
            variant: hasChanges ? 'primary' : 'secondary',
            onClick: () => void handleSaveOrderDetails(),
          },
          {
            key: 'delete',
            label: '선택삭제(영구)',
            icon: 'delete',
            variant: 'danger',
            onClick: () => void handleDeleteOrdersPermanently(),
          },
          {
            key: 'cancel',
            label: '발주취소(상태변경)',
            icon: 'reset',
            variant: 'secondary',
            onClick: () => void handleCancelChecked(),
          },
          {
            key: 'reset',
            label: '초기화',
            icon: 'reset',
            variant: 'secondary',
            onClick: () => {
              const s = kstDaysAgo(29);
              const t = kstToday();
              setStartDate(s);
              setEndDate(t);
              setSupplierFilter('전체');
              setStatusFilter('전체');
              void loadData(s, t);
            },
          },
          {
            key: 'excel',
            label: '엑셀다운로드',
            icon: 'excel',
            variant: 'secondary',
            onClick: handleExportExcel,
          },
        ]}
        helpContent="스마트발주(GFS) 등에서 생성된 모든 발주서(PO) 전표를 조회하고, 세부 품목의 수량·단가를 실시간으로 수정하거나 불필요한 발주서를 영구 삭제/취소합니다."
      />

      {/* 2. 파이프라인 바로가기 바 */}
      <div className="bg-[#edf2f7] border-b border-[#cbd5e1] px-3 py-1 flex items-center justify-between shrink-0 text-[11.5px]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-600">🔗 발주 파이프라인 연계:</span>
          <button
            type="button"
            onClick={() => handleNavigate('pur-gfs-smart-order')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 shadow-2xs transition-colors cursor-pointer"
          >
            🍱 스마트발주(GFS) 열기 <ExternalLink size={10} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pur-order-req-confirm')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
          >
            📑 발주소요량확정 <ExternalLink size={10} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pur-mat-order-day')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
          >
            📅 자재발주(요일별) <ExternalLink size={10} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pur-order-print')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-white hover:bg-blue-50 text-indigo-700 border border-indigo-300 shadow-2xs transition-colors cursor-pointer"
          >
            🖨️ 발주서출력 <ExternalLink size={10} />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pur-receiving-reg')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-white hover:bg-blue-50 text-emerald-700 border border-emerald-300 shadow-2xs transition-colors cursor-pointer"
          >
            📥 입고등록(GSR) <ExternalLink size={10} />
          </button>
        </div>

        <div className="text-[11px] text-slate-500">
          💡 하단 발주 상세 그리드에서 수량·단가를 직접 수정한 후 [수정저장]을 누르면 즉시 DB에 반영됩니다.
        </div>
      </div>

      {/* 3. 검색 필터 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-inner">
        <div className="flex flex-wrap items-center gap-4">
          <SalesFilterBar
            label="발주일자"
            startDate={startDate}
            endDate={endDate}
            onDateRangeChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
              void loadData(s, e);
            }}
          />

          <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
            <span className="font-semibold text-gray-700">매입처:</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] rounded focus:outline-blue-500 shadow-xs"
            >
              <option value="전체">전체 매입처 ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">발주상태:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] rounded focus:outline-blue-500 shadow-xs"
            >
              <option value="전체">전체 상태</option>
              <option value="미입고">미입고 (발주)</option>
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
          <span className="text-[11px] text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-300 font-semibold shadow-xs">
            총 발주액:{' '}
            <span className="text-emerald-700 font-bold">
              ₩
              {Math.round(
                filteredMasterList.reduce((acc, m) => acc + m.orderAmt, 0)
              ).toLocaleString()}
            </span>
          </span>
        </div>
      </div>

      {/* 4. 상하 2분할 레이아웃 */}
      <div className="flex-1 flex flex-col min-h-0 p-2 gap-2">
        {/* 상단: 발주 마스터 현황 (Master) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <div className="flex items-center gap-3">
              <span className="font-bold text-gray-800 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                발주 마스터 현황 (PO 전표)
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
            <div className="flex items-center gap-3 text-[11px] text-gray-600 font-medium">
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-blue-600" />
                미입고:{' '}
                <span className="font-semibold text-blue-800">
                  {masterList.filter((m) => m.status === '미입고' || m.status === '발주').length}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle size={12} className="text-amber-600" />
                부분입고:{' '}
                <span className="font-semibold text-amber-800">
                  {masterList.filter((m) => m.status === '부분입고').length}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-600" />
                입고완료:{' '}
                <span className="font-semibold text-emerald-800">
                  {masterList.filter((m) => m.status === '입고완료').length}
                </span>
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-500 font-bold">
                발주 전표 로딩 중...
              </div>
            ) : (
              <PurchaseDataGrid
                columns={MASTER_COLUMNS}
                data={filteredMasterList}
                selectedRowId={selectedMasterId}
                onRowClick={(row) => setSelectedMasterId(row.id)}
                onCellChange={(id, key, val) => {
                  if (key === 'checked') handleMasterCheck(id, val);
                }}
                summaryRowTitle="합계 (발주 마스터)"
              />
            )}
          </div>
        </div>

        {/* 하단: 발주 상세 품목 내역 (Detail - 실시간 수정 가능) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-[#94a3b8] rounded shadow-xs">
          <div className="bg-[#dfe3ec] px-2.5 py-1 flex items-center justify-between border-b border-[#b0b8c8]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">
                발주 상세 품목 내역 (수정 가능 ✏️) ▶
              </span>
              {selectedMaster ? (
                <span className="bg-blue-100 text-blue-900 border border-blue-300 font-semibold px-2 py-0.5 rounded text-[11px]">
                  발주번호: <strong className="font-mono text-blue-800">{selectedMaster.orderNo}</strong> | 거래처:{' '}
                  <strong>{selectedMaster.supplier}</strong> | 상태: <strong>{selectedMaster.status}</strong>
                </span>
              ) : (
                <span className="text-gray-500 text-[11px]">선택된 발주서가 없습니다.</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {hasChanges && (
                <span className="text-[11px] font-extrabold text-rose-600 bg-rose-50 border border-rose-300 px-2 py-0.5 rounded animate-pulse">
                  ⚠️ 수정된 항목이 있습니다. 상단 [수정저장]을 눌러 반영하세요.
                </span>
              )}
              <span className="text-[11px] text-gray-600 font-medium">
                품목수: <strong className="text-blue-700">{currentDetails.length}</strong> 건
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {currentDetails.length > 0 ? (
              <PurchaseDataGrid
                columns={detailColumns}
                data={currentDetails}
                onCellChange={handleDetailCellChange}
                summaryRowTitle="합계 (발주 품목)"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-[13px]">
                상단에서 발주 전표를 클릭하시면 세부 품목 목록이 표시되며, 발주수량 및 단가를 직접 수정하실 수 있습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
