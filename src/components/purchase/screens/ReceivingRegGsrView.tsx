'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesActionBar } from '@/components/sales/common/SalesActionBar';
import { PurchaseDataGrid, PurchaseGridColumnDef } from '../common/PurchaseDataGrid';
import { usePrintReport } from '@/context/PrintReportContext';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { exportGridToExcel } from '@/lib/excelExport';
import {
  calcBagPriceFromBox,
  calcBoxPrice,
  isBagUnitLabel,
  isBoxUnitLabel,
  normalizePackUnit,
  unitPriceForOrderUnit,
} from '@/lib/gfs/pricing';
import {
  ExternalLink,
  Printer,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  Truck,
  RotateCcw,
  Sparkles,
  Save,
  Search,
} from 'lucide-react';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

function getKoreanDayOfWeek(dateStr: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '목' : days[d.getDay()];
}

function normalizeYmd(val: any): string {
  if (!val) return kstToday();
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    let y = Number(mdy[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(mdy[1]).padStart(2, '0')}-${String(mdy[2]).padStart(2, '0')}`;
  }
  return s.replace(/\./g, '-').slice(0, 10);
}

// 빈 기본값
const INITIAL_RECEIVING_DATA: any[] = [];

const COLUMNS: PurchaseGridColumnDef[] = [
  { key: 'manualClose', label: '수기종결', width: '60px', align: 'center', format: 'checkbox', sticky: true, leftOffset: '36px' },
  { key: 'orderDate', label: '발주일', width: '85px', align: 'center', format: 'date', sticky: true, leftOffset: '96px' },
  { key: 'dayOfWeek', label: '요일', width: '40px', align: 'center', sticky: true, leftOffset: '181px' },
  { key: 'orderNo', label: '발주번호', width: '90px', align: 'center', sticky: true, leftOffset: '221px' },
  { key: 'method', label: '입고방법', width: '70px', align: 'center' },
  { key: 'supplier', label: '거래처', width: '120px', align: 'left' },
  { key: 'type', label: '구분', width: '60px', align: 'center' },
  { key: 'name', label: '품명', width: '180px', align: 'left' },
  { key: 'spec', label: '규격', width: '100px', align: 'center' },
  { key: 'unit', label: '단위', width: '45px', align: 'center' },
  { key: 'orderQty', label: '발주수량', width: '70px', align: 'right', format: 'number' },
  { key: 'prevRecvQty', label: '기입고수량', width: '70px', align: 'right', format: 'number' },
  { key: 'clientOutQty', label: '(거래처)출고량', width: '90px', align: 'right', format: 'number' },
  { key: 'carNo', label: '차량번호', width: '95px', align: 'center', editable: true },
  { key: 'recvQty', label: '입고수량', width: '75px', align: 'right', format: 'number', editable: true },
  { key: 'unitQty', label: '입수량', width: '65px', align: 'right', format: 'number', dangerIfNegative: true },
  { key: 'pieceQty', label: '낱개수량', width: '65px', align: 'right', format: 'number', editable: true },
  { key: 'warehouse', label: '창고명', width: '100px', align: 'center', warehouseDropdown: true },
  { key: 'expiryDate', label: '유통기한', width: '95px', align: 'center', datePicker: true },
  { key: 'carTemp', label: '차량온도', width: '70px', align: 'center', editable: true },
  { key: 'markStatus', label: '표시상태', width: '60px', align: 'center', haccpToggle: true },
  { key: 'lookStatus', label: '외관상태', width: '60px', align: 'center', haccpToggle: true },
  { key: 'carClean', label: '차량청결', width: '60px', align: 'center', haccpToggle: true },
  { key: 'totalJudge', label: '종합판정', width: '60px', align: 'center', haccpToggle: true },
  { key: 'bagPrice', label: '봉단가', width: '90px', align: 'right', format: 'currency', editable: true },
  { key: 'boxPrice', label: '박스단가', width: '95px', align: 'right', format: 'currency', editable: true },
  { key: 'unitPrice', label: '적용단가', width: '95px', align: 'right', format: 'currency', editable: true },
  { key: 'recvAmt', label: '입고금액(합계)', width: '110px', align: 'right', format: 'currency' },
  { key: 'diffQty', label: '차이수량', width: '70px', align: 'right', format: 'number', dangerIfNegative: true },
  { key: 'lotNo', label: 'LOT no.', width: '120px', align: 'center', editable: true },
  { key: 'remark', label: '비고', width: '140px', align: 'left', editable: true },
];

export const ReceivingRegGsrView: React.FC = () => {
  const { openPrintModal } = usePrintReport();
  const { openTab } = useTabs();

  const [baseStd, setBaseStd] = useState<'order' | 'recv'>('recv');
  const [startDate, setStartDate] = useState<string>(kstDaysAgo(7));
  const [endDate, setEndDate] = useState<string>(kstToday());
  const [recvDate, setRecvDate] = useState<string>(kstToday());
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [preview, setPreview] = useState<boolean>(false);
  const [selectAll, setSelectAll] = useState<boolean>(false);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 스마트발주(GFS) 및 발주소요량확정에서 생성된 실시간 미입고 발주(PurchaseOrderDetail) 목록 로드
  const loadPendingOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/purchase/receiving?type=pending_orders&startDate=${startDate}&endDate=${endDate}`, {
        cache: 'no-store',
      });
      const json = await res.json();

      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        let idx = 1;
        const loaded = json.data.map((dt: any) => {
          const po = dt.purchaseOrder || {};
          const isCold1 = (dt.category || '').includes('육류') || (dt.productName || '').includes('육류') || (dt.productName || '').includes('패티');
          const isCold = (dt.category || '').includes('냉장') || (dt.productName || '').includes('냉장') || (dt.product?.name || '').includes('냉장');
          const isFrozen = (dt.category || '').includes('냉동') || (dt.productName || '').includes('냉동') || (dt.product?.name || '').includes('냉동');
          const isSub = (dt.category || '').includes('부자재') || (dt.productCode || '').startsWith('R');
          const defaultWarehouse = isFrozen ? '냉동' : isCold1 ? '냉장1' : isCold ? '냉장2' : isSub ? '부자재' : '상온';
          const defaultTemp = isFrozen ? '-18.0℃' : isCold ? '3.0℃' : '18.0℃';

          const remainQty = Number(dt.remainQty) > 0 ? Number(dt.remainQty) : Number(dt.orderQty) - Number(dt.receivedQty || 0);
          const packUnit = normalizePackUnit(dt.packUnit || dt.product?.boxQty || dt.orderUnitQty);
          const unitStr = dt.unit || 'box';
          const isBox = isBoxUnitLabel(unitStr) || (!isBagUnitLabel(unitStr) && packUnit > 1);
          const rawUnitPrice = Number(dt.unitPrice || 0);
          const derivedBagPrice =
            Number(dt.bagPrice) > 0
              ? Number(dt.bagPrice)
              : isBox && packUnit > 1 && rawUnitPrice > 0
                ? calcBagPriceFromBox(rawUnitPrice, packUnit)
                : rawUnitPrice;
          const bagPrice = derivedBagPrice;
          const boxPrice =
            Number(dt.boxPrice) > 0
              ? Number(dt.boxPrice)
              : calcBoxPrice(bagPrice, packUnit);
          const unitPrice =
            rawUnitPrice > 0
              ? rawUnitPrice
              : unitPriceForOrderUnit(bagPrice, unitStr, packUnit);

          const normOrderDate = normalizeYmd(po.orderDate || kstToday());

          return {
            id: idx++,
            orderDetailId: dt.id,
            purchaseOrderId: po.id,
            productId: dt.productId || dt.product?.id,
            productCode: dt.productCode || dt.product?.productCode || '',
            partnerId: po.partnerId || dt.product?.partnerId || '',
            manualClose: false,
            orderDate: normOrderDate,
            dayOfWeek: getKoreanDayOfWeek(normOrderDate),
            orderNo: po.orderNo || `PO-${dt.id}`,
            method: po.orderType || '스마트발주',
            supplier: po.partnerName || po.partner?.name || '협력사',
            type: dt.category || (dt.productCode?.startsWith('R') ? '부자재' : '원재료'),
            name: dt.productName || dt.product?.name,
            spec: dt.product?.spec || '-',
            unit: unitStr,
            orderQty: Number(dt.orderQty || 0),
            prevRecvQty: Number(dt.receivedQty || 0),
            clientOutQty: remainQty,
            carNo: '경기88바1234',
            recvQty: remainQty, // 기본값: 잔량 전량 입고 제안
            unitQty: packUnit,
            pieceQty: 0,
            warehouse: dt.product?.warehouse && ['냉장1', '냉장2', '냉동', '상온', '부자재'].includes(dt.product.warehouse)
              ? dt.product.warehouse
              : defaultWarehouse,
            expiryDate: kstDaysAgo(-90), // 기본 유통기한 D+90
            carTemp: defaultTemp,
            markStatus: 'O',
            lookStatus: 'O',
            carClean: 'O',
            totalJudge: 'O',
            bagPrice,
            boxPrice,
            unitPrice,
            recvAmt: Math.round(remainQty * unitPrice),
            diffQty: 0,
            lotNo: `LOT-${normOrderDate.replace(/-/g, '').slice(2)}-${(dt.productCode || 'MAT').slice(-4)}`,
            remark: po.remark ? `[발주연계] ${po.remark}` : '스마트발주(GFS) 정상입고',
          };
        });

        setRows(loaded);
      } else {
        // Fallback to sample GSR data if no pending orders
        setRows(INITIAL_RECEIVING_DATA);
      }
    } catch (e) {
      console.warn('Failed to load pending purchase orders in receiving view', e);
      setRows(INITIAL_RECEIVING_DATA);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadPendingOrders();
  }, [loadPendingOrders]);

  // 거래처 고유 목록 추출
  const distinctSuppliers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.supplier) set.add(r.supplier);
    });
    return Array.from(set);
  }, [rows]);

  // 필터링 적용된 행 목록
  const filteredRows = useMemo(() => {
    if (supplierFilter === 'ALL') return rows;
    return rows.filter((r) => r.supplier === supplierFilter);
  }, [rows, supplierFilter]);

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    setRows((prev) => prev.map((r) => ({ ...r, manualClose: checked })));
  };

  const handleRowChange = (id: any, key: string, val: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const updated = { ...r, [key]: val };
          const pack = normalizePackUnit(updated.unitQty);
          const isBox =
            isBoxUnitLabel(updated.unit) ||
            (!isBagUnitLabel(updated.unit) && pack > 1);
          // 입고수량 변경 시 차이수량 및 입고금액 즉시 자동 재계산
          if (key === 'recvQty') {
            const inQty = Number(val) || 0;
            const diff = inQty - updated.clientOutQty;
            updated.diffQty = diff;
            updated.recvAmt = Math.round(inQty * (updated.unitPrice || 0));
          }
          if (key === 'bagPrice') {
            const bag = Number(val) || 0;
            const box = calcBoxPrice(bag, pack);
            updated.bagPrice = bag;
            updated.boxPrice = box;
            updated.unitPrice = isBox && pack > 1 ? box : bag;
            updated.recvAmt = Math.round((updated.recvQty || 0) * updated.unitPrice);
          }
          if (key === 'boxPrice') {
            const box = Number(val) || 0;
            const bag = calcBagPriceFromBox(box, pack);
            updated.boxPrice = box;
            updated.bagPrice = bag;
            updated.unitPrice = isBox && pack > 1 ? box : bag;
            updated.recvAmt = Math.round((updated.recvQty || 0) * updated.unitPrice);
          }
          if (key === 'unitPrice') {
            const price = Number(val) || 0;
            updated.unitPrice = price;
            if (isBox && pack > 1) {
              updated.boxPrice = price;
              updated.bagPrice = calcBagPriceFromBox(price, pack);
            } else {
              updated.bagPrice = price;
              updated.boxPrice = calcBoxPrice(price, pack);
            }
            updated.recvAmt = Math.round((updated.recvQty || 0) * price);
          }
          return updated;
        }
        return r;
      })
    );
  };

  // 1-Click: 전 품목 발주잔량 전량 입고 채움
  const handleFillAllRemain = () => {
    setRows((prev) =>
      prev.map((r) => {
        const fullQty = r.clientOutQty || r.orderQty - r.prevRecvQty;
        return {
          ...r,
          recvQty: fullQty,
          diffQty: 0,
          recvAmt: fullQty * (r.unitPrice || 0),
        };
      })
    );
  };

  // 1-Click: 전 품목 입고수량 0으로 비우기 (도착한 품목만 직접 입력할 때)
  const handleClearAllQty = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        recvQty: 0,
        diffQty: -Number(r.clientOutQty || 0),
        recvAmt: 0,
      }))
    );
  };

  // 1-Click: 전 품목 HACCP 검수 적합(O) 일괄 지정
  const handlePassAllHaccp = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        markStatus: 'O',
        lookStatus: 'O',
        carClean: 'O',
        totalJudge: 'O',
      }))
    );
  };

  // DB 영구 저장 트랜잭션 실행
  const handleSaveReceiving = async () => {
    try {
      const targetItems = filteredRows.filter((r) => (Number(r.recvQty) > 0) || r.manualClose);

      if (targetItems.length === 0) {
        alert('입고수량이 0보다 큰 품목이 없거나 수기종결로 체크된 품목이 없습니다.\n실제 공장에 도착하여 검수한 품목의 입고수량을 확인해 주세요.');
        return;
      }

      const confirmMsg = supplierFilter !== 'ALL'
        ? `[${supplierFilter}] 매입처의 ${targetItems.length}개 품목을 실입고 확정(${recvDate})하시겠습니까?\n\n• 현재고(Inventory) 실시간 가산\n• 자재수불부(MaterialLedger) 입고 기록\n• 발주서 미입고 잔량 차감`
        : `현재 표시된 ${targetItems.length}개 품목을 실입고 확정(${recvDate})하시겠습니까?\n\n• 매입처별로 개별 입고전표가 자동 분할 생성됩니다.\n• 현재고(Inventory) 가산 및 발주서 잔량이 즉시 갱신됩니다.`;

      if (!confirm(confirmMsg)) return;

      setSaving(true);
      let completedBatches = 0;
      try {
        const byPartner = new Map<string, any[]>();
        targetItems.forEach((it) => {
          const pk = it.partnerId || it.supplier || 'DEFAULT';
          if (!byPartner.has(pk)) byPartner.set(pk, []);
          byPartner.get(pk)!.push(it);
        });

        const batches: any[][] = [];
        let cur: any[] = [];
        for (const group of byPartner.values()) {
          if (cur.length > 0 && cur.length + group.length > 20) {
            batches.push(cur);
            cur = [];
          }
          cur.push(...group);
        }
        if (cur.length > 0) batches.push(cur);

        for (const batchItems of batches) {
          const res = await fetch('/api/purchase/receiving', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              receivingDate: recvDate,
              partnerId: supplierFilter !== 'ALL' ? (batchItems[0]?.partnerId || 'V001') : 'V001',
              partnerName: supplierFilter !== 'ALL' ? supplierFilter : '공급사',
              items: batchItems,
              createdBy: 'admin',
            }),
          });
          const rawText = await res.text();
          let data: any = null;
          try {
            data = rawText ? JSON.parse(rawText) : null;
          } catch {
            throw new Error(`서버 응답 오류 (HTTP ${res.status}): ${rawText.slice(0, 120)}`);
          }
          if (!res.ok || !data?.success) {
            throw new Error(data?.error || `입고 등록 실패 (HTTP ${res.status})`);
          }
          completedBatches += 1;
        }

        alert(
          `[입고등록 성공]\n총 ${targetItems.length}건이 입고 완료되었습니다.\n` +
            `• 현재고(Inventory) 실시간 가산 반영 완료\n` +
            `• 자재수불부(MaterialLedger) 입고 기록 완료\n` +
            `• 발주서(PurchaseOrder) 미입고 잔량 차감 및 입고상태 갱신 완료`
        );
        loadPendingOrders();
      } catch (batchErr: any) {
        if (completedBatches > 0) {
          loadPendingOrders();
        }
        alert(`입고 등록 실패: ${batchErr?.message || '알 수 없는 오류'}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('입고 등록 중 통신 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 엑셀 내보내기
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      alert('내보낼 입고 데이터가 없습니다.');
      return;
    }
    exportGridToExcel({
      filename: `GFS_입고등록GSR_${recvDate}`,
      sheetName: '입고등록',
      columns: COLUMNS.map((c) => ({
        key: c.key,
        label: c.label,
        format: c.format,
      })),
      data: filteredRows,
    });
  };

  // KPI 집계
  const kpiTotalPendingQty = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (Number(r.clientOutQty) || 0), 0);
  }, [filteredRows]);

  const kpiTotalRecvQty = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (Number(r.recvQty) || 0), 0);
  }, [filteredRows]);

  const kpiTotalRecvAmt = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (Number(r.recvAmt) || 0), 0);
  }, [filteredRows]);

  const kpiHaccpPassCount = useMemo(() => {
    return filteredRows.filter((r) => r.totalJudge === 'O').length;
  }, [filteredRows]);

  const openPipelineTab = (menuId: string) => {
    const item = getMenuItemById(menuId);
    if (item) {
      openTab(item);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 */}
      <SalesActionBar
        title="입고등록(GSR) — 원부자재 실시간 검수 및 재고 입고등록"
        buttons={[
          { key: 'search', label: '미입고발주조회', icon: 'search', variant: 'primary', onClick: loadPendingOrders },
          { key: 'save', label: saving ? '저장중...' : '입고확정/저장 (F8)', icon: 'save', variant: 'success', onClick: handleSaveReceiving },
          { key: 'haccp', label: 'HACCP검수일지인쇄', icon: 'print', variant: 'secondary', onClick: () => openPrintModal('HACCP_INSPECTION') },
          { key: 'excel', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: handleExportExcel },
          { key: 'reset', label: '새로고침', icon: 'reset', variant: 'secondary', onClick: loadPendingOrders },
        ]}
        helpContent="공장에 도착한 원부자재의 차량 온도, HACCP 외관/표시 검수 판정 및 실입고 수량을 등록하면, 현재고와 자재수불부에 자동 가산되고 발주서 미입고 잔량이 즉시 차감됩니다."
      />

      {/* 2. 파이프라인 연계 네비게이션 */}
      <div className="bg-slate-800 text-white px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 shadow-inner">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            발주-입고 파이프라인 연계:
          </span>
          <span className="text-[11px] text-slate-300">
            [자재발주(요일별)] → [발주소요량확정] → [발주현황/수정] → <strong>[입고등록(GSR)]</strong> → [재고현황]
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
            onClick={() => openPipelineTab('pur-order-print')}
            className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1"
          >
            <span>발주서출력</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={() => openPipelineTab('pur-receiving-status-edit')}
            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1"
          >
            <span>입고현황/수정</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={() => openPipelineTab('inv-lookup')}
            className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-bold transition flex items-center gap-1"
          >
            <span>현재고현황</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 3. 상단 KPI 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 bg-slate-100 border-b border-gray-300">
        <div className="bg-white p-2 rounded border border-gray-300 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-500 font-semibold">입고 대기 발주</div>
            <div className="text-base font-extrabold text-blue-900">
              {filteredRows.length} <span className="text-xs font-normal text-gray-600">건 ({kpiTotalPendingQty.toLocaleString()} 잔량)</span>
            </div>
          </div>
          <Clock className="w-6 h-6 text-blue-600 opacity-60" />
        </div>

        <div className="bg-white p-2 rounded border border-gray-300 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-500 font-semibold">금일 실입고 등록수량</div>
            <div className="text-base font-extrabold text-emerald-800">
              {kpiTotalRecvQty.toLocaleString()} <span className="text-xs font-normal text-gray-600">개/box</span>
            </div>
          </div>
          <Truck className="w-6 h-6 text-emerald-600 opacity-60" />
        </div>

        <div className="bg-white p-2 rounded border border-gray-300 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-500 font-semibold">총 입고금액</div>
            <div className="text-base font-extrabold text-indigo-900">
              {kpiTotalRecvAmt.toLocaleString()} <span className="text-xs font-normal text-gray-600">원</span>
            </div>
          </div>
          <FileSpreadsheet className="w-6 h-6 text-indigo-600 opacity-60" />
        </div>

        <div className="bg-white p-2 rounded border border-gray-300 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-500 font-semibold">HACCP 검수 판정</div>
            <div className="text-base font-extrabold text-emerald-700">
              {kpiHaccpPassCount} / {filteredRows.length} <span className="text-xs font-normal text-emerald-600">적합(O)</span>
            </div>
          </div>
          <ShieldCheck className="w-6 h-6 text-emerald-600 opacity-60" />
        </div>
      </div>

      {/* 4. 필터 바 & 1-Click 유틸리티 바 */}
      <div className="bg-[#f4f6f9] border-b border-gray-300 px-3 py-1.5 flex flex-wrap items-center justify-between text-[11px] text-gray-700 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="flex items-center gap-1 font-semibold text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="cursor-pointer"
            />
            <span>전체수기종결</span>
          </label>

          <div className="flex items-center gap-2 pl-2 border-l border-gray-300">
            <span className="font-semibold text-gray-700">조회기준:</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="rcvStd"
                checked={baseStd === 'order'}
                onChange={() => setBaseStd('order')}
                className="cursor-pointer"
              />
              <span>발주일</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="rcvStd"
                checked={baseStd === 'recv'}
                onChange={() => setBaseStd('recv')}
                className="cursor-pointer"
              />
              <span className="font-bold text-blue-800">입고일</span>
            </label>
          </div>

          <div className="flex items-center gap-1 pl-2 border-l border-gray-300">
            <span className="font-semibold text-gray-700">발주일자:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 px-1 py-0.5 bg-white text-gray-800 text-[11px] h-6 rounded"
            />
            <span>~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 px-1 py-0.5 bg-white text-gray-800 text-[11px] h-6 rounded"
            />
          </div>

          <div className="flex items-center gap-1 pl-2 border-l border-gray-300">
            <span className="font-bold text-blue-900">실입고일:</span>
            <input
              type="date"
              value={recvDate}
              onChange={(e) => setRecvDate(e.target.value)}
              className="border border-blue-400 font-bold px-1 py-0.5 bg-yellow-50 text-blue-900 text-[11px] h-6 rounded"
            />
          </div>

          <div className="flex items-center gap-1 pl-2 border-l border-gray-300">
            <span className="font-semibold text-gray-700">매입처:</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="border border-gray-300 px-1 py-0.5 bg-white text-gray-800 text-[11px] h-6 rounded font-medium"
            >
              <option value="ALL">ALL (전체 매입처)</option>
              {distinctSuppliers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 1-Click 간편 기능 버튼들 */}
          <button
            onClick={handleFillAllRemain}
            className="px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            title="모든 품목의 입고수량을 미입고 잔량으로 자동 입력"
          >
            <Sparkles className="w-3 h-3 text-blue-600" />
            <span>발주잔량 전량채움</span>
          </button>
          <button
            onClick={handleClearAllQty}
            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            title="입고수량을 0으로 비우고 실제 도착한 품목만 직접 입력"
          >
            <RotateCcw className="w-3 h-3 text-slate-600" />
            <span>수량 비우기</span>
          </button>
          <button
            onClick={handlePassAllHaccp}
            className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            title="HACCP 표시/외관/청결/종합판정을 전체 적합(O)으로 설정"
          >
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>HACCP 전체적합(O)</span>
          </button>
          <div className="font-semibold bg-white px-2 py-0.5 border border-gray-300 text-[11px] rounded">
            표시 품목수: <span className="text-blue-700 font-bold">{filteredRows.length}</span>건
          </div>
        </div>
      </div>

      {/* 5. 단일 전체 그리드 (27개 컬럼 가로 스크롤 & 고정 컬럼) */}
      <div className="flex-1 p-1.5 min-h-0 overflow-hidden flex flex-col bg-white">
        <PurchaseDataGrid
          columns={COLUMNS}
          data={filteredRows}
          onRowChange={handleRowChange}
          summaryData={{
            orderQty: filteredRows.reduce((sum, r) => sum + (Number(r.orderQty) || 0), 0),
            prevRecvQty: filteredRows.reduce((sum, r) => sum + (Number(r.prevRecvQty) || 0), 0),
            clientOutQty: kpiTotalPendingQty,
            recvQty: kpiTotalRecvQty,
            recvAmt: kpiTotalRecvAmt,
            diffQty: filteredRows.reduce((sum, r) => sum + (Number(r.diffQty) || 0), 0),
          }}
        />
      </div>
    </div>
  );
};
