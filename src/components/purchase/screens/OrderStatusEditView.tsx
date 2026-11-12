'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Save,
  Printer,
  Download,
  Trash2,
  XCircle,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  Layers,
  Building2,
  Package,
  Calendar,
  Sparkles,
  Maximize2,
  X,
  ArrowLeft,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { exportGridToExcel } from '@/lib/excelExport';
import { erpConfirm } from '@/context/ConfirmContext';
import { usePrintReport, PurchaseOrderPrintPayload } from '@/context/PrintReportContext';
import {
  normalizePackUnit,
  calcBoxPrice,
  calcBagPriceFromBox,
  isBoxUnitLabel,
} from '@/lib/gfs/pricing';
import {
  calcExpectedDeliveryInfo,
  getWeekdayCharYmd,
} from '@/lib/gfs/orderCalc';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

// =============================================================================
// 타입 정의
// =============================================================================

/** 단일 품목 행 (전체 품목별 모아보기용) */
export interface FlatOrderItemRow {
  id: number; // detail.id
  orderId: number; // parent purchaseOrder.id
  orderNo: string;
  orderDate: string;
  orderCycle: string;
  leadDays: number | null;
  expectedDeliveryDate: string;
  partnerId?: string;
  partnerName: string;
  productCode: string;
  productName: string;
  category: string;
  spec: string;
  unit: string;
  packUnit: number; // 입수량
  bagPrice: number; // 봉단가
  boxPrice: number; // 박스단가
  masterBagPrice?: number;
  masterBoxPrice?: number;
  orderQty: number; // 박스 수량
  unitPrice: number; // 주문 단위 단가 (box인 경우 박스단가)
  amount: number; // 라인 총액
  receivedQty: number;
  remainQty: number;
  status: string;
  warehouse: string;
  remark: string;
  checked: boolean;
  isModified?: boolean;
}

/** 거래처별 발주서 마스터 행 */
export interface OrderMasterRow {
  id: number;
  checked: boolean;
  orderNo: string;
  orderDate: string;
  status: string;
  supplier: string;
  itemCount: number;
  orderAmt: number;
  receivedAmt: number;
  unreceivedAmt: number;
  expectedDate: string;
  manager: string;
  tel: string;
  remark: string;
  details: FlatOrderItemRow[];
}

type OrderPopupState =
  | null
  | { mode: 'all' }
  | { mode: 'po'; orderId: number };

function computeUpdatedOrderItem(
  item: FlatOrderItemRow,
  field: 'orderQty' | 'unitPrice' | 'bagPrice' | 'remark',
  value: any
): FlatOrderItemRow {
  const updated: FlatOrderItemRow = { ...item, isModified: true };
  const isBox = isBoxUnitLabel(item.unit);
  const pack = normalizePackUnit(item.packUnit);
  if (field === 'orderQty') {
    const qty = Math.max(0, Number(value) || 0);
    updated.orderQty = qty;
    updated.amount = Math.round(qty * updated.unitPrice);
    updated.remainQty = Math.max(0, qty - updated.receivedQty);
  } else if (field === 'unitPrice') {
    const price = Math.max(0, Number(value) || 0);
    updated.unitPrice = price;
    if (isBox && pack > 1) {
      updated.boxPrice = price;
      updated.bagPrice = calcBagPriceFromBox(price, pack);
    } else {
      updated.bagPrice = price;
      updated.boxPrice = calcBoxPrice(price, pack);
    }
    updated.amount = Math.round(updated.orderQty * price);
  } else if (field === 'bagPrice') {
    const bag = Math.max(0, Number(value) || 0);
    updated.bagPrice = bag;
    updated.boxPrice = calcBoxPrice(bag, pack);
    updated.unitPrice = isBox ? updated.boxPrice : bag;
    updated.amount = Math.round(updated.orderQty * updated.unitPrice);
  } else if (field === 'remark') {
    updated.remark = String(value || '');
  }
  return updated;
}

// 모듈 레벨 메모리 캐시 (탭 재진입 시 0ms 즉시 표시)
let memoryOrdersData: any[] = [];
let memoryLoaded = false;
let memorySavedDates = { start: '', end: '' };

export const OrderStatusEditView: React.FC = () => {
  const { openTab } = useTabs();
  const { openPrintModal, setPoPayload, setPoPayloadList, isPrintModalOpen } = usePrintReport();

  // 빠른 조회 기간 (기본값: 최근 7일간 발주 내역 자동 탐색)
  const today = useMemo(() => kstToday(), []);
  const [startDate, setStartDate] = useState(() => memorySavedDates.start || kstDaysAgo(6));
  const [endDate, setEndDate] = useState(() => memorySavedDates.end || today);
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | '3days' | '7days' | 'custom'>(() =>
    memorySavedDates.start ? 'custom' : '7days'
  );

  // 필터 & 검색
  const [supplierFilter, setSupplierFilter] = useState('전체');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [expectedDateFilter, setExpectedDateFilter] = useState('전체');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 뷰 모드 탭: 'items'(전체 품목별 모아보기 - 추천) vs 'suppliers'(거래처별 모아보기)
  const [viewTab, setViewTab] = useState<'items' | 'suppliers'>('items');

  // 원본 및 편집 데이터 상태
  const [masterList, setMasterList] = useState<OrderMasterRow[]>([]);
  const [flatItems, setFlatItems] = useState<FlatOrderItemRow[]>([]);
  const [selectedMasterId, setSelectedMasterId] = useState<number | null>(null);

  // 로딩 & 처리 상태
  const [loading, setLoading] = useState<boolean>(() => !memoryLoaded);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // 발주내용 크게보기 팝업 상태
  const [orderPopup, setOrderPopup] = useState<OrderPopupState>(null);
  const [popupFontSize, setPopupFontSize] = useState<'normal' | 'large' | 'xlarge'>('large');
  const [popupKeyword, setPopupKeyword] = useState('');

  useEffect(() => {
    if (!orderPopup || isPrintModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOrderPopup(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [orderPopup, isPrintModalOpen]);

  // 1) 서버에서 발주 내역 로드
  const loadData = useCallback(async (sDate: string, eDate: string, silent = false) => {
    if (!silent) setLoading(true);
    setStatusMsg('발주 현황 로딩 중...');
    try {
      const params = new URLSearchParams({ startDate: sDate, endDate: eDate });
      const res = await fetch(`/api/purchase/order?${params.toString()}`);
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) {
        if (!silent) {
          setMasterList([]);
          setFlatItems([]);
          setSelectedMasterId(null);
        }
        setStatusMsg('조회 결과 없음');
        return;
      }

      const rawOrders: any[] = json.data;
      memoryOrdersData = rawOrders;
      memoryLoaded = true;
      memorySavedDates = { start: sDate, end: eDate };

      // 가공: 마스터 목록 및 평탄화된 전체 품목 목록
      const newMasters: OrderMasterRow[] = [];
      const newFlat: FlatOrderItemRow[] = [];

      rawOrders.forEach((po) => {
        const details = po.details || [];
        const supplierName = po.partnerName || po.partner?.name || '미지정';
        const poStatus = po.status || '발주';

        const poDetailItems: FlatOrderItemRow[] = details.map((d: any) => {
          const orderQty = Number(d.orderQty) || 0;
          const unitStr = d.unit || 'box';
          const packUnit = normalizePackUnit(d.packUnit || d.product?.boxQty);
          const unitPrice = Number(d.unitPrice) || 0;
          const isBox = isBoxUnitLabel(unitStr);
          const bagPrice = Number(d.bagPrice) || (isBox && packUnit > 1 ? calcBagPriceFromBox(unitPrice, packUnit) : unitPrice);
          const boxPrice = Number(d.boxPrice) || calcBoxPrice(bagPrice, packUnit);
          const masterBagPrice = Number(d.masterBagPrice) || 0;
          const masterBoxPrice = Number(d.masterBoxPrice) || 0;
          const lineAmt = Number(d.amount) != null && !isNaN(Number(d.amount)) ? Number(d.amount) : Math.round(orderQty * unitPrice);

          const fallbackExpected = calcExpectedDeliveryInfo({
            orderDate: po.orderDate,
            explicitDeliveryDate: po.deliveryDate,
            orderCycle: d.orderCycle || d.product?.orderCycle,
            partnerLeadTime: po.partner?.leadTime,
          });
          const orderCycle = d.orderCycle || fallbackExpected.orderCycle || '';
          const leadDays = d.leadDays != null ? Number(d.leadDays) : fallbackExpected.leadDays;
          const expectedDeliveryDate = d.expectedDeliveryDate || fallbackExpected.expectedDate || '';

          const itemRow: FlatOrderItemRow = {
            id: d.id,
            orderId: po.id,
            orderNo: po.orderNo,
            orderDate: po.orderDate,
            orderCycle,
            leadDays,
            expectedDeliveryDate,
            partnerId: po.partnerId || undefined,
            partnerName: supplierName,
            productCode: d.productCode || '',
            productName: d.productName || d.product?.name || '',
            category: d.category || '원부자재',
            spec: d.product?.spec || '-',
            unit: unitStr,
            packUnit,
            bagPrice,
            boxPrice,
            masterBagPrice,
            masterBoxPrice,
            orderQty,
            unitPrice,
            amount: lineAmt,
            receivedQty: Number(d.receivedQty) || 0,
            remainQty: Number(d.remainQty) != null ? Number(d.remainQty) : orderQty,
            status: poStatus,
            warehouse: d.product?.warehouse || '냉장',
            remark: d.remark || '',
            checked: false,
            isModified: false,
          };
          newFlat.push(itemRow);
          return itemRow;
        });

        const expectedCandidates = poDetailItems
          .map((item) => item.expectedDeliveryDate)
          .filter(Boolean)
          .sort();
        const derivedExpectedDate = po.deliveryDate || expectedCandidates[0] || po.orderDate;

        const totalAmt =
          po.totalAmount != null && !isNaN(Number(po.totalAmount))
            ? Number(po.totalAmount)
            : poDetailItems.reduce((sum, item) => sum + item.amount, 0);

        const receivedAmt = poDetailItems.reduce(
          (sum, item) => sum + (item.receivedQty || 0) * (item.unitPrice || 0),
          0
        );

        newMasters.push({
          id: po.id,
          checked: false,
          orderNo: po.orderNo,
          orderDate: po.orderDate,
          status: poStatus,
          supplier: supplierName,
          itemCount: details.length,
          orderAmt: totalAmt,
          receivedAmt,
          unreceivedAmt: Math.max(0, totalAmt - receivedAmt),
          expectedDate: derivedExpectedDate,
          manager: po.createdBy || '-',
          tel: po.partner?.tel || '-',
          remark: po.remark || '',
          details: poDetailItems,
        });
      });

      setMasterList(newMasters);
      setFlatItems(newFlat);
      setSelectedMasterId((prev) => (prev && newMasters.some((m) => m.id === prev) ? prev : (newMasters[0]?.id || null)));
      setStatusMsg(`총 ${newMasters.length}건 발주서 (${newFlat.length}개 품목) 조회 완료`);
    } catch (err: any) {
      console.error('발주현황 로드 실패:', err);
      setStatusMsg(`조회 오류: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 최초 로딩: 기본 오늘 일자 조회
  useEffect(() => {
    loadData(startDate, endDate);
  }, [loadData, startDate, endDate]);

  // 빠른 기간 선택 핸들러
  const handleSelectPeriod = (preset: 'today' | 'yesterday' | '3days' | '7days') => {
    setPeriodPreset(preset);
    let s = today;
    let e = today;
    if (preset === 'today') {
      s = today;
      e = today;
    } else if (preset === 'yesterday') {
      s = kstDaysAgo(1);
      e = kstDaysAgo(1);
    } else if (preset === '3days') {
      s = kstDaysAgo(2);
      e = today;
    } else if (preset === '7days') {
      s = kstDaysAgo(6);
      e = today;
    }
    setStartDate(s);
    setEndDate(e);
  };

  // 2) 필터링된 품목 목록 및 거래처 목록
  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    masterList.forEach((m) => {
      if (m.supplier) set.add(m.supplier);
    });
    return ['전체', ...Array.from(set).sort()];
  }, [masterList]);

  const expectedDateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    flatItems.forEach((item) => {
      if (item.expectedDeliveryDate) {
        counts.set(item.expectedDeliveryDate, (counts.get(item.expectedDeliveryDate) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
  }, [flatItems]);

  const filteredItems = useMemo(() => {
    return flatItems.filter((item) => {
      if (supplierFilter !== '전체' && item.partnerName !== supplierFilter) return false;
      if (statusFilter !== '전체' && item.status !== statusFilter) return false;
      if (expectedDateFilter !== '전체' && (item.expectedDeliveryDate || '') !== expectedDateFilter) {
        return false;
      }
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const matchName = item.productName.toLowerCase().includes(kw);
        const matchSupplier = item.partnerName.toLowerCase().includes(kw);
        const matchNo = item.orderNo.toLowerCase().includes(kw);
        const matchCode = item.productCode.toLowerCase().includes(kw);
        if (!matchName && !matchSupplier && !matchNo && !matchCode) return false;
      }
      return true;
    });
  }, [flatItems, supplierFilter, statusFilter, expectedDateFilter, searchKeyword]);

  const filteredMasters = useMemo(() => {
    return masterList.filter((m) => {
      if (supplierFilter !== '전체' && m.supplier !== supplierFilter) return false;
      if (statusFilter !== '전체' && m.status !== statusFilter) return false;
      if (
        expectedDateFilter !== '전체' &&
        !m.details.some((d) => (d.expectedDeliveryDate || '') === expectedDateFilter) &&
        m.expectedDate !== expectedDateFilter
      ) {
        return false;
      }
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const matchSupplier = m.supplier.toLowerCase().includes(kw);
        const matchNo = m.orderNo.toLowerCase().includes(kw);
        const matchItem = m.details.some((d) => d.productName.toLowerCase().includes(kw));
        if (!matchSupplier && !matchNo && !matchItem) return false;
      }
      return true;
    });
  }, [masterList, supplierFilter, statusFilter, expectedDateFilter, searchKeyword]);

  // 상단 요약 카드 집계 (필터된 결과 기준)
  const summaryKpi = useMemo(() => {
    const totalAmt = filteredItems.reduce((acc, x) => acc + (x.amount || 0), 0);
    const totalBoxes = filteredItems.reduce((acc, x) => acc + (x.orderQty || 0), 0);
    const itemCount = filteredItems.length;
    const supplierCount = new Set(filteredItems.map((x) => x.partnerName)).size;
    return { totalAmt, totalBoxes, itemCount, supplierCount };
  }, [filteredItems]);

  // 수정된 행 개수
  const modifiedCount = useMemo(() => {
    return flatItems.filter((x) => x.isModified).length;
  }, [flatItems]);

  // 3) 전체 품목 인라인 수정 핸들러 (수량 or 봉단가/박스단가 변경 시 금액·마스터 전표 동기 재계산)
  const handleItemFieldChange = (detailId: number, field: 'orderQty' | 'unitPrice' | 'bagPrice' | 'remark', value: any) => {
    setFlatItems((prev) =>
      prev.map((item) => (item.id === detailId ? computeUpdatedOrderItem(item, field, value) : item))
    );
    setMasterList((prev) =>
      prev.map((m) => {
        if (!m.details.some((d) => d.id === detailId)) return m;
        const nextDetails = m.details.map((d) =>
          d.id === detailId ? computeUpdatedOrderItem(d, field, value) : d
        );
        const nextOrderAmt = nextDetails.reduce((sum, d) => sum + (d.amount || 0), 0);
        return {
          ...m,
          details: nextDetails,
          orderAmt: nextOrderAmt,
          unreceivedAmt: Math.max(0, nextOrderAmt - m.receivedAmt),
        };
      })
    );
  };

  // 4) 체크박스 선택/해제 핸들러
  const handleToggleSelectAll = (checked: boolean, visibleItemIds?: Set<number>) => {
    if (visibleItemIds) {
      setFlatItems((prev) =>
        prev.map((x) => (visibleItemIds.has(x.id) ? { ...x, checked } : x))
      );
      return;
    }
    if (viewTab === 'items') {
      const visibleIds = new Set(filteredItems.map((x) => x.id));
      setFlatItems((prev) =>
        prev.map((x) => (visibleIds.has(x.id) ? { ...x, checked } : x))
      );
    } else {
      const visibleIds = new Set(filteredMasters.map((x) => x.id));
      setMasterList((prev) =>
        prev.map((x) => (visibleIds.has(x.id) ? { ...x, checked } : x))
      );
    }
  };

  const handleToggleItemCheck = (detailId: number) => {
    setFlatItems((prev) =>
      prev.map((x) => (x.id === detailId ? { ...x, checked: !x.checked } : x))
    );
  };

  const handleToggleMasterCheck = (masterId: number) => {
    setMasterList((prev) =>
      prev.map((x) => (x.id === masterId ? { ...x, checked: !x.checked } : x))
    );
  };

  // 5) 변경사항 일괄 저장 핸들러 (DB 트랜잭션 반영)
  const handleSaveAllChanges = async () => {
    const modified = flatItems.filter((x) => x.isModified);
    if (modified.length === 0) {
      alert('수정된 발주 항목이 없습니다.');
      return;
    }

    if (!window.confirm(`수정된 ${modified.length}개 품목의 발주수량 및 단가를 데이터베이스에 영구 저장하시겠습니까?`)) {
      return;
    }

    setIsSaving(true);
    setStatusMsg(`수정 내역 ${modified.length}건 저장 중...`);
    try {
      // 발주서(orderId)별로 그룹핑하여 순차 업데이트
      const byOrder = new Map<number, FlatOrderItemRow[]>();
      modified.forEach((item) => {
        if (!byOrder.has(item.orderId)) byOrder.set(item.orderId, []);
        byOrder.get(item.orderId)!.push(item);
      });

      for (const [orderId, items] of byOrder.entries()) {
        const res = await fetch('/api/purchase/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_order',
            orderId,
            details: items.map((d) => ({
              id: d.id,
              orderQty: d.orderQty,
              unitPrice: d.unitPrice,
              remark: d.remark,
            })),
          }),
        });
        const raw = await res.text();
        let json: any = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `발주서(ID: ${orderId}) 저장 실패 (HTTP ${res.status})`);
        }
      }

      alert(`✅ 총 ${modified.length}개 발주 품목의 수정 내용이 성공적으로 저장되었습니다!`);
      await loadData(startDate, endDate);
    } catch (e: any) {
      alert('저장 실패: ' + e.message);
      setStatusMsg(`저장 실패: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 6) 선택 삭제 핸들러 (품목 뷰 / 팝업 품목 단위 / 발주서 마스터 뷰)
  const handleDeleteChecked = async (overrideItemIds?: number[]) => {
    const useItemMode = Array.isArray(overrideItemIds) || viewTab === 'items';
    if (useItemMode) {
      const checkedDetails = Array.isArray(overrideItemIds)
        ? flatItems.filter((x) => overrideItemIds.includes(x.id))
        : filteredItems.filter((x) => x.checked);
      if (checkedDetails.length === 0) {
        alert('삭제할 발주 품목을 먼저 체크박스로 선택해주세요.');
        return;
      }

      const hasReceived = checkedDetails.some((x) => x.receivedQty > 0 || x.status === '입고완료');
      if (hasReceived) {
        alert('선택한 품목 중 이미 입고 처리된 품목이 포함되어 있습니다.\n입고 완료된 품목은 삭제할 수 없습니다.');
        return;
      }

      const ok = window.confirm(
        `선택하신 ${checkedDetails.length}개 발주 품목을 완전히 영구 삭제하시겠습니까?\n\n` +
          `• 대상 품목: ${checkedDetails.map((x) => x.productName).slice(0, 4).join(', ')}${
            checkedDetails.length > 4 ? ` 외 ${checkedDetails.length - 4}건` : ''
          }\n` +
          `• 삭제 총액: 약 ₩${Math.round(checkedDetails.reduce((sum, x) => sum + x.amount, 0)).toLocaleString()}원\n\n` +
          `⚠️ 발주서 내 마지막 품목이 삭제되는 경우 해당 발주서도 함께 정리됩니다.`
      );
      if (!ok) return;

      const detailIdsToDelete = checkedDetails.map((x) => x.id);
      const detailIdSet = new Set(detailIdsToDelete);

      // 즉시 로컬 상태에서 제거 (즉각 반영 0ms)
      setFlatItems((prev) => prev.filter((x) => !detailIdSet.has(x.id)));
      setMasterList((prev) =>
        prev
          .map((m) => {
            const remainingDetails = m.details.filter((d) => !detailIdSet.has(d.id));
            const newAmt = remainingDetails.reduce((sum, d) => sum + d.amount, 0);
            return {
              ...m,
              itemCount: remainingDetails.length,
              orderAmt: newAmt,
              details: remainingDetails,
            };
          })
          .filter((m) => m.itemCount > 0)
      );

      try {
        const res = await fetch('/api/purchase/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete_details',
            detailIds: detailIdsToDelete,
          }),
        });
        const rawText = await res.text();
        let json: any = null;
        try {
          json = rawText ? JSON.parse(rawText) : null;
        } catch {
          json = null;
        }
        if (res.ok && json?.success) {
          alert(`✅ ${json.message || '선택한 품목이 성공적으로 삭제되었습니다.'}`);
        } else {
          alert('삭제 실패: ' + (json?.error || `HTTP ${res.status} 오류 발생`));
          loadData(startDate, endDate, true);
        }
      } catch (err: any) {
        alert('삭제 통신 오류: ' + (err?.message || err));
        loadData(startDate, endDate, true);
      }
    } else {
      // 발주서(마스터) 단위 삭제
      const checkedMasters = filteredMasters.filter((m) => m.checked);
      if (checkedMasters.length === 0) {
        alert('삭제할 발주서를 먼저 체크박스로 선택해주세요.');
        return;
      }

      const hasReceived = checkedMasters.some((m) => m.status === '입고완료' || m.receivedAmt > 0);
      if (hasReceived) {
        alert('선택한 발주서 중 이미 입고 처리된 발주서가 포함되어 있습니다.\n입고 처리된 발주서는 삭제할 수 없습니다.');
        return;
      }

      const ok = window.confirm(
        `선택한 ${checkedMasters.length}건의 발주서를 데이터베이스에서 완전히 영구 삭제하시겠습니까?\n\n` +
          `• 대상 발주번호: ${checkedMasters.map((x) => x.orderNo).slice(0, 4).join(', ')}${
            checkedMasters.length > 4 ? ` 외 ${checkedMasters.length - 4}건` : ''
          }\n` +
          `• 총 금액: ₩${Math.round(checkedMasters.reduce((acc, x) => acc + x.orderAmt, 0)).toLocaleString()}원`
      );
      if (!ok) return;

      const masterIdsToDelete = checkedMasters.map((m) => m.id);
      const masterIdSet = new Set(masterIdsToDelete);

      setMasterList((prev) => prev.filter((m) => !masterIdSet.has(m.id)));
      setFlatItems((prev) => prev.filter((x) => !masterIdSet.has(x.orderId)));

      try {
        const res = await fetch('/api/purchase/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete',
            ids: masterIdsToDelete,
          }),
        });
        const rawText = await res.text();
        let json: any = null;
        try {
          json = rawText ? JSON.parse(rawText) : null;
        } catch {
          json = null;
        }
        if (res.ok && json?.success) {
          alert(`✅ ${json.message || '선택한 발주서가 성공적으로 삭제되었습니다.'}`);
        } else {
          alert('발주서 삭제 실패: ' + (json?.error || `HTTP ${res.status} 오류`));
          loadData(startDate, endDate, true);
        }
      } catch (err: any) {
        alert('삭제 통신 오류: ' + (err?.message || err));
        loadData(startDate, endDate, true);
      }
    }
  };

  // 7) 단일 품목 행 삭제 핸들러
  const handleDeleteSingleItem = async (item: FlatOrderItemRow) => {
    if (item.receivedQty > 0 || item.status === '입고완료') {
      alert('이미 입고 완료된 품목은 삭제할 수 없습니다.');
      return;
    }

    const ok = window.confirm(
      `품목 [${item.productName}] (${item.orderQty}box, ₩${item.amount.toLocaleString()}원)을(를) 발주서에서 삭제하시겠습니까?`
    );
    if (!ok) return;

    setFlatItems((prev) => prev.filter((x) => x.id !== item.id));
    setMasterList((prev) =>
      prev
        .map((m) => {
          if (m.id !== item.orderId) return m;
          const remainingDetails = m.details.filter((d) => d.id !== item.id);
          return {
            ...m,
            itemCount: remainingDetails.length,
            orderAmt: remainingDetails.reduce((sum, d) => sum + d.amount, 0),
            details: remainingDetails,
          };
        })
        .filter((m) => m.itemCount > 0)
    );

    try {
      const res = await fetch('/api/purchase/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_detail',
          detailId: item.id,
        }),
      });
      const json = await res.json().catch(() => null);
      if (json?.success) {
        alert(`✅ ${json.message || '품목이 삭제되었습니다.'}`);
      } else {
        alert('삭제 실패: ' + (json?.error || '오류'));
        loadData(startDate, endDate, true);
      }
    } catch (e: any) {
      alert('오류: ' + (e?.message || e));
      loadData(startDate, endDate, true);
    }
  };

  // 8) 엑셀 다운로드
  const handleExcelExport = (customRows?: FlatOrderItemRow[], customLabel?: string) => {
    const itemRowsToExport = Array.isArray(customRows) ? customRows : filteredItems;
    if (Array.isArray(customRows) || viewTab === 'items') {
      if (itemRowsToExport.length === 0) {
        alert('다운로드할 발주 내역이 없습니다.');
        return;
      }
      exportGridToExcel({
        filename: customLabel ? `발주내역_${customLabel}` : `발주현황_품목별_${startDate}_${endDate}`,
        sheetName: '발주품목목록',
        columns: [
          { key: 'orderDate', label: '발주일자', format: 'date' },
          { key: 'expectedDeliveryDate', label: '입고예정일', format: 'date' },
          { key: 'orderCycle', label: '리드타임' },
          { key: 'orderNo', label: '발주번호' },
          { key: 'partnerName', label: '거래처명' },
          { key: 'productCode', label: '품목코드' },
          { key: 'productName', label: '품명' },
          { key: 'spec', label: '규격' },
          { key: 'unit', label: '단위' },
          { key: 'orderQty', label: '발주박스수', format: 'number' },
          { key: 'packUnit', label: '입수량', format: 'number' },
          { key: 'bagPrice', label: '봉단가', format: 'currency' },
          { key: 'unitPrice', label: '발주(박스)단가', format: 'currency' },
          { key: 'amount', label: '발주금액', format: 'currency' },
          { key: 'status', label: '발주상태' },
          { key: 'remark', label: '비고' },
        ],
        data: itemRowsToExport,
      });
    } else {
      if (filteredMasters.length === 0) {
        alert('다운로드할 발주서가 없습니다.');
        return;
      }
      exportGridToExcel({
        filename: `발주현황_거래처별_${startDate}_${endDate}`,
        sheetName: '발주서목록',
        columns: [
          { key: 'orderDate', label: '발주일자', format: 'date' },
          { key: 'expectedDate', label: '입고예정일', format: 'date' },
          { key: 'orderNo', label: '발주번호' },
          { key: 'supplier', label: '거래처명' },
          { key: 'itemCount', label: '품목수', format: 'number' },
          { key: 'orderAmt', label: '발주총액', format: 'currency' },
          { key: 'status', label: '발주상태' },
          { key: 'manager', label: '작성자' },
          { key: 'remark', label: '비고' },
        ],
        data: filteredMasters,
      });
    }
  };

  const buildPoPayload = (master: OrderMasterRow): PurchaseOrderPrintPayload => {
    const liveDetails = flatItems.filter((item) => item.orderId === master.id);
    const details = liveDetails.length > 0 ? liveDetails : master.details;
    const totalAmount = details.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return {
      orderNo: master.orderNo,
      orderDate: master.orderDate,
      deliveryDate: master.expectedDate || master.orderDate,
      supplierName: master.supplier,
      manager: master.manager,
      tel: master.tel,
      remark: master.remark,
      totalAmount: totalAmount > 0 ? totalAmount : master.orderAmt,
      items: details.map((d, i) => ({
        no: i + 1,
        name: d.productName,
        spec: d.spec,
        unit: d.unit,
        qty: d.orderQty,
        price: d.unitPrice,
        amt: d.amount,
        recvDate: d.expectedDeliveryDate || master.expectedDate || master.orderDate,
        remark: d.remark,
      })),
    };
  };

  // 9) 표준 발주서 인쇄
  const handlePrintOrder = (explicitTarget?: OrderMasterRow | null) => {
    if (masterList.length === 0) {
      alert('인쇄할 발주서 내역이 없습니다.');
      return;
    }

    let targets: OrderMasterRow[] = [];

    if (explicitTarget) {
      targets = [explicitTarget];
    } else if (orderPopup?.mode === 'all' || viewTab === 'items') {
      const sourceItems = orderPopup?.mode === 'all' ? popupItems : filteredItems;
      const checkedRows = sourceItems.filter((x) => x.checked);
      const targetOrderIds = Array.from(
        new Set((checkedRows.length > 0 ? checkedRows : sourceItems).map((x) => x.orderId))
      );
      targets = targetOrderIds
        .map((oid) => masterList.find((m) => m.id === oid))
        .filter((m): m is OrderMasterRow => Boolean(m));
    } else {
      const checkedMasters = filteredMasters.filter((m) => m.checked);
      if (checkedMasters.length > 0) {
        targets = checkedMasters;
      } else if (selectedMasterId != null) {
        const selected = masterList.find((m) => m.id === selectedMasterId);
        if (selected) targets = [selected];
      } else {
        targets = filteredMasters;
      }
    }

    if (targets.length === 0) {
      alert('인쇄할 발주서를 선택하거나 조회해주세요.');
      return;
    }

    const payloads = targets.map(buildPoPayload);
    setPoPayload(payloads[0]);
    setPoPayloadList(payloads);
    openPrintModal('PURCHASE_ORDER');
  };

  // 10) 자체발주(요일별) 화면 즉시 이동
  const handleGoToOrder = () => {
    const item = getMenuItemById('pur-mat-order-day');
    if (item) openTab(item);
  };

  const selectedCount =
    viewTab === 'items'
      ? filteredItems.filter((x) => x.checked).length
      : filteredMasters.filter((x) => x.checked).length;

  // 팝업 전용 상태 파생값
  const popupMaster = useMemo(() => {
    if (!orderPopup || orderPopup.mode !== 'po') return null;
    return masterList.find((m) => m.id === orderPopup.orderId) || null;
  }, [orderPopup, masterList]);

  const popupItems = useMemo(() => {
    if (!orderPopup) return [];
    const base =
      orderPopup.mode === 'po'
        ? flatItems.filter((item) => item.orderId === orderPopup.orderId)
        : filteredItems;
    const kw = popupKeyword.trim().toLowerCase();
    if (!kw) return base;
    return base.filter(
      (item) =>
        item.productName.toLowerCase().includes(kw) ||
        item.partnerName.toLowerCase().includes(kw) ||
        item.orderNo.toLowerCase().includes(kw) ||
        item.productCode.toLowerCase().includes(kw)
    );
  }, [orderPopup, flatItems, filteredItems, popupKeyword]);

  const popupTotals = useMemo(() => {
    return popupItems.reduce(
      (acc, it) => {
        acc.boxes += it.orderQty || 0;
        acc.amt += it.amount || 0;
        if (it.checked) acc.checkedIds.push(it.id);
        return acc;
      },
      { boxes: 0, amt: 0, checkedIds: [] as number[] }
    );
  }, [popupItems]);

  const openLargePopup = (nextPopup?: OrderPopupState) => {
    setPopupKeyword('');
    if (nextPopup) {
      setOrderPopup(nextPopup);
      return;
    }
    if (viewTab === 'suppliers' && selectedMasterId) {
      setOrderPopup({ mode: 'po', orderId: selectedMasterId });
    } else {
      setOrderPopup({ mode: 'all' });
    }
  };

  // 공용 발주 품목 편집 테이블 렌더러 (기본 화면 + 크게보기 팝업 공용)
  const renderOrderItemsTable = (
    rowsToRender: FlatOrderItemRow[],
    fontScale: 'normal' | 'large' | 'xlarge' = 'normal'
  ) => {
    const visibleIdSet = new Set(rowsToRender.map((x) => x.id));
    const isAllVisibleChecked =
      rowsToRender.length > 0 && rowsToRender.every((x) => x.checked);

    const headTextCls =
      fontScale === 'xlarge'
        ? 'text-[15px]'
        : fontScale === 'large'
        ? 'text-[14px]'
        : 'text-[13px]';
    const bodyTextCls =
      fontScale === 'xlarge'
        ? 'text-[16px]'
        : fontScale === 'large'
        ? 'text-[15px]'
        : 'text-[13.5px]';
    const nameTextCls =
      fontScale === 'xlarge'
        ? 'text-[17.5px]'
        : fontScale === 'large'
        ? 'text-[16px]'
        : 'text-[14.5px]';
    const qtyInputCls =
      fontScale === 'xlarge'
        ? 'w-24 px-2.5 py-1.5 text-[16.5px]'
        : fontScale === 'large'
        ? 'w-[88px] px-2 py-1 text-[15.5px]'
        : 'w-20 px-2 py-1 text-[14px]';
    const priceInputCls =
      fontScale === 'xlarge'
        ? 'w-28 px-2.5 py-1.5 text-[16px]'
        : fontScale === 'large'
        ? 'w-[104px] px-2 py-1 text-[15px]'
        : 'w-24 px-2 py-1 text-[13.5px]';
    const bagInputCls =
      fontScale === 'xlarge'
        ? 'w-[104px] px-2.5 py-1.5 text-[15.5px]'
        : fontScale === 'large'
        ? 'w-24 px-2 py-1 text-[14.5px]'
        : 'w-20 px-2 py-1 text-[13px]';
    const amtTextCls =
      fontScale === 'xlarge'
        ? 'text-[17.5px]'
        : fontScale === 'large'
        ? 'text-[16px]'
        : 'text-[14.5px]';
    const cellPadCls =
      fontScale === 'xlarge' ? 'py-3 px-3.5' : fontScale === 'large' ? 'py-3 px-3' : 'py-2.5 px-3';

    return (
      <table className="w-full text-left border-collapse min-w-[1100px]">
        <thead
          className={`sticky top-0 z-10 bg-slate-100 text-slate-700 ${headTextCls} font-black border-b border-slate-200 uppercase tracking-tight select-none`}
        >
          <tr>
            <th className="py-3 px-3 text-center w-12">
              <input
                type="checkbox"
                checked={isAllVisibleChecked}
                onChange={(e) => handleToggleSelectAll(e.target.checked, visibleIdSet)}
                className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
                title="현재 목록 전체 선택"
              />
            </th>
            <th className="py-3 px-2 text-center w-14">No</th>
            <th className="py-3 px-3 w-28 text-center">발주일자</th>
            <th className="py-3 px-3 w-28 text-center">입고예정</th>
            <th className="py-3 px-3 w-36 text-center">발주번호</th>
            <th className="py-3 px-3 w-40">거래처명</th>
            <th className="py-3 px-4 min-w-[220px]">품명</th>
            <th className="py-3 px-3 w-28 text-center">규격/단위</th>
            <th className="py-3 px-2.5 w-20 text-right">입수량</th>
            <th className="py-3 px-3 w-32 text-right bg-blue-50/70 text-blue-900 border-x border-blue-100">
              발주박스수 (✏️)
            </th>
            <th className="py-3 px-3 w-28 text-right bg-emerald-50/60 text-emerald-900 border-r border-blue-100">
              봉단가 (✏️)
            </th>
            <th className="py-3 px-3 w-32 text-right bg-blue-50/70 text-blue-900 border-r border-blue-100">
              박스단가 (✏️)
            </th>
            <th className="py-3 px-3 w-36 text-right">발주금액(합계)</th>
            <th className="py-3 px-3 w-28 text-center">상태</th>
            <th className="py-3 px-3 min-w-[140px]">비고(✏️)</th>
            <th className="py-3 px-3 text-center w-16">삭제</th>
          </tr>
        </thead>
        <tbody className={`divide-y divide-slate-100 ${bodyTextCls}`}>
          {rowsToRender.length === 0 ? (
            <tr>
              <td colSpan={16} className="py-16 text-center">
                <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                  <Package className="w-12 h-12 text-slate-300" />
                  <div className="text-[15px] font-black text-slate-700">
                    선택하신 기간({startDate} ~ {endDate})에 등록된 발주 내역이 없습니다.
                  </div>
                  <p className="text-[13px] text-slate-500">
                    [자재발주(요일별)]에서 발주를 확정하시면 해당 내역이 이곳에 실시간으로 표시됩니다.
                  </p>
                  {!orderPopup && (
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => handleSelectPeriod('yesterday')}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100 transition cursor-pointer"
                      >
                        📅 어제 발주내역 확인
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPeriod('7days')}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
                      >
                        📊 최근 7일 전체 보기
                      </button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            rowsToRender.map((item, idx) => {
              const isMod = item.isModified;
              return (
                <tr
                  key={item.id}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('input') || target.closest('button') || target.closest('select')) return;
                    handleToggleItemCheck(item.id);
                  }}
                  className={`transition duration-100 cursor-pointer ${
                    item.checked
                      ? 'bg-blue-50/90 font-medium'
                      : isMod
                      ? 'bg-amber-50/80 border-l-4 border-l-amber-500'
                      : idx % 2 === 1
                      ? 'bg-slate-50/40 hover:bg-slate-100/60'
                      : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  {/* 체크박스 */}
                  <td className={`${cellPadCls} text-center`}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggleItemCheck(item.id)}
                      className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
                    />
                  </td>

                  {/* No */}
                  <td className={`${cellPadCls} px-2 text-center text-slate-400 font-mono text-[12px]`}>
                    {idx + 1}
                  </td>

                  {/* 발주일자 */}
                  <td className={`${cellPadCls} text-center font-mono text-slate-600`}>
                    <div>{item.orderDate}</div>
                    {getWeekdayCharYmd(item.orderDate) && (
                      <div className="text-[10.5px] text-slate-400">
                        ({getWeekdayCharYmd(item.orderDate)})
                      </div>
                    )}
                  </td>

                  {/* 입고예정일 (D+1/D+2) */}
                  <td className={`${cellPadCls} text-center`}>
                    {item.expectedDeliveryDate ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-mono text-[12px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          {item.expectedDeliveryDate.slice(5)}({getWeekdayCharYmd(item.expectedDeliveryDate) || '-'})
                        </span>
                        {(item.orderCycle || item.leadDays != null) && (
                          <span className="text-[10px] font-bold text-slate-500">
                            {item.orderCycle || `D+${item.leadDays}`}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  {/* 발주번호 (클릭 시 해당 발주서 큰 팝업 열기) */}
                  <td className={`${cellPadCls} text-center`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLargePopup({ mode: 'po', orderId: item.orderId });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-800 hover:text-blue-800 font-mono text-[12px] font-bold border border-slate-200 hover:border-blue-300 shadow-2xs transition cursor-pointer"
                      title="클릭하여 이 발주서 품목 전체를 큰 팝업으로 보기/수정"
                    >
                      <span>{item.orderNo}</span>
                      <Maximize2 className="w-2.5 h-2.5 opacity-60" />
                    </button>
                  </td>

                  {/* 거래처명 */}
                  <td className={`${cellPadCls} font-extrabold text-slate-800`}>
                    {item.partnerName}
                  </td>

                  {/* 품명 */}
                  <td className={`${cellPadCls} px-4 font-black ${nameTextCls} text-slate-900 tracking-tight`}>
                    {item.productName}
                  </td>

                  {/* 규격/단위 */}
                  <td className={`${cellPadCls} text-center text-slate-500 text-[12.5px] font-medium`}>
                    {item.spec} / {item.unit}
                  </td>

                  {/* 입수량 */}
                  <td className={`${cellPadCls} px-2.5 text-right font-mono font-bold text-slate-700`}>
                    {item.packUnit.toLocaleString()}
                  </td>

                  {/* 발주박스수 (인라인 수정) */}
                  <td className="py-1.5 px-2 text-right bg-blue-50/40 border-x border-blue-100">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        min={0}
                        value={item.orderQty}
                        onChange={(e) =>
                          handleItemFieldChange(item.id, 'orderQty', e.target.value)
                        }
                        className={`${qtyInputCls} text-right bg-white border border-blue-300 rounded-lg font-black font-mono text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs`}
                      />
                      <span className="text-[12px] font-bold text-blue-700">{item.unit || 'box'}</span>
                    </div>
                  </td>

                  {/* 봉단가 (양방향 연동) */}
                  <td className="py-1.5 px-2 text-right bg-emerald-50/30 border-r border-blue-100">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-[12px] text-slate-400 font-mono">₩</span>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={item.bagPrice}
                        onChange={(e) =>
                          handleItemFieldChange(item.id, 'bagPrice', e.target.value)
                        }
                        className={`${bagInputCls} text-right bg-white border border-emerald-300 rounded-lg font-bold font-mono text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs`}
                      />
                    </div>
                  </td>

                  {/* 박스단가 (인라인 수정 + 마스터 동기화) */}
                  <td className="py-1.5 px-2 text-right bg-blue-50/40 border-r border-blue-100">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-[12px] text-slate-400 font-mono">₩</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={item.unitPrice}
                        onChange={(e) =>
                          handleItemFieldChange(item.id, 'unitPrice', e.target.value)
                        }
                        className={`${priceInputCls} text-right bg-white border border-blue-300 rounded-lg font-black font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs`}
                      />
                    </div>
                    {item.masterBoxPrice != null &&
                      item.masterBoxPrice > 0 &&
                      Math.abs(
                        item.unitPrice -
                          (isBoxUnitLabel(item.unit)
                            ? item.masterBoxPrice
                            : item.masterBagPrice || item.masterBoxPrice)
                      ) > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            handleItemFieldChange(
                              item.id,
                              'unitPrice',
                              isBoxUnitLabel(item.unit)
                                ? item.masterBoxPrice
                                : item.masterBagPrice || item.masterBoxPrice
                            )
                          }
                          className="mt-0.5 text-[10.5px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded cursor-pointer"
                          title="마스터 기준단가로 동기화"
                        >
                          마스터 ₩
                          {(isBoxUnitLabel(item.unit)
                            ? item.masterBoxPrice
                            : item.masterBagPrice || item.masterBoxPrice
                          ).toLocaleString()}{' '}
                          적용
                        </button>
                      )}
                  </td>

                  {/* 발주금액 (수량 x 단가 자동 연산) */}
                  <td className={`${cellPadCls} text-right font-black font-mono ${amtTextCls} text-slate-900`}>
                    ₩{Math.round(item.amount).toLocaleString()}
                  </td>

                  {/* 발주상태 뱃지 */}
                  <td className={`${cellPadCls} text-center`}>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11.5px] font-extrabold border ${
                        item.status === '입고완료'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : item.status === '부분입고'
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : item.status === '발주취소'
                          ? 'bg-rose-50 text-rose-700 border-rose-300'
                          : 'bg-blue-50 text-blue-700 border-blue-300'
                      }`}
                    >
                      {item.status === '발주' ? '미입고(발주)' : item.status}
                    </span>
                    {item.receivedQty > 0 && item.remainQty > 0 && (
                      <div className="text-[10.5px] font-mono font-bold text-amber-700 mt-0.5 whitespace-nowrap">
                        기입고 {item.receivedQty} / 미입고 {item.remainQty}
                      </div>
                    )}
                  </td>

                  {/* 비고 인라인 수정 */}
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={item.remark}
                      onChange={(e) =>
                        handleItemFieldChange(item.id, 'remark', e.target.value)
                      }
                      placeholder="비고 입력..."
                      className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-400 rounded-lg text-[13px] outline-none"
                    />
                  </td>

                  {/* 삭제 버튼 */}
                  <td className={`${cellPadCls} text-center`}>
                    <button
                      type="button"
                      onClick={() => handleDeleteSingleItem(item)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition cursor-pointer hover:bg-rose-50"
                      title="이 품목만 발주서에서 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    );
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#f8fafc] overflow-hidden text-slate-800">
      {/* ===================================================================== */}
      {/* 1. 최상단 헤더 & 빠른 날짜 탐색 바 */}
      {/* ===================================================================== */}
      <header className="px-5 py-3.5 bg-white border-b border-slate-200 shrink-0 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 타이틀 및 네비게이션 가이드 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shadow-sm shrink-0">
              <Package className="w-5.5 h-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-[22px] font-black text-slate-900 tracking-tight leading-none">
                  발주 현황 및 수정
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                  자재발주 실시간 100% 동기화
                </span>
              </div>
              <p className="text-[12.5px] font-medium text-slate-500 mt-1">
                자재발주(요일별)에서 확정한 거래처별 박스 수량과 금액이 실시간 연동되며, 인라인 수정 및 삭제가 가능합니다.
              </p>
            </div>
          </div>

          {/* 우측 빠른 액션: 자재발주 바로가기 & 데이터 새로고침 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGoToOrder}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-[13px] font-extrabold shadow-sm transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>자재발주(요일별) 이동</span>
            </button>
            <button
              type="button"
              onClick={() => loadData(startDate, endDate)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[13px] font-bold transition cursor-pointer disabled:opacity-50"
              title="데이터 새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">새로고침</span>
            </button>
          </div>
        </div>

        {/* ── 날짜 및 필터 컨트롤 바 ── */}
        <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* 빠른 기간 프리셋 버튼 그룹 */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => handleSelectPeriod('today')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodPreset === 'today'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              오늘 (당일)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('yesterday')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodPreset === 'yesterday'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              어제
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('3days')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodPreset === '3days'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              최근 3일
            </button>
            <button
              type="button"
              onClick={() => handleSelectPeriod('7days')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                periodPreset === '7days'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              최근 7일
            </button>
          </div>

          {/* 기간 날짜 입력 및 필터 드롭다운 */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-[13px] shadow-2xs font-mono font-bold">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPeriodPreset('custom');
                }}
                className="bg-transparent text-slate-800 outline-none cursor-pointer"
              />
              <span className="text-slate-400">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPeriodPreset('custom');
                }}
                className="bg-transparent text-slate-800 outline-none cursor-pointer"
              />
            </div>

            {/* 거래처 필터 */}
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-[13px] font-bold text-slate-700 outline-none shadow-2xs cursor-pointer hover:border-slate-400"
            >
              {supplierOptions.map((opt) => (
                <option key={opt} value={opt}>
                  거래처: {opt}
                </option>
              ))}
            </select>

            {/* 입고예정일 필터 */}
            <select
              value={expectedDateFilter}
              onChange={(e) => setExpectedDateFilter(e.target.value)}
              className={`border rounded-xl px-3 py-1.5 text-[13px] font-bold outline-none shadow-2xs cursor-pointer ${
                expectedDateFilter !== '전체'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
              title="입고예정일(리드타임 D+N 기준) 필터"
            >
              <option value="전체">입고예정: 전체</option>
              {expectedDateOptions.map((opt) => (
                <option key={opt.date} value={opt.date}>
                  예정 {opt.date.slice(5)}({getWeekdayCharYmd(opt.date)}) · {opt.count}
                </option>
              ))}
            </select>

            {/* 상태 필터 */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-[13px] font-bold text-slate-700 outline-none shadow-2xs cursor-pointer hover:border-slate-400"
            >
              <option value="전체">상태: 전체</option>
              <option value="발주">상태: 미입고(발주)</option>
              <option value="부분입고">상태: 부분입고</option>
              <option value="입고완료">상태: 입고완료</option>
              <option value="발주취소">상태: 발주취소</option>
            </select>

            {/* 검색창 */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="품명 / 거래처 검색..."
                className="pl-9 pr-3 py-1.5 w-44 sm:w-52 bg-white border border-slate-300 rounded-xl text-[13px] font-medium outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>
          </div>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* 2. 대형 종합 KPI 요약 카드 (시인성 극대화: 50대 대표님 맞춤 큰 글씨) */}
      {/* ===================================================================== */}
      <section className="px-5 py-3.5 bg-slate-100/90 border-b border-slate-200 shrink-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* 카드 1: 확정 발주총액 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12.5px] font-extrabold text-slate-500 block leading-tight">
                💰 조회기간 확정 발주총액
              </span>
              <div className="text-2xl sm:text-[28px] font-black font-mono text-blue-700 tracking-tight mt-1 leading-none">
                ₩{Math.round(summaryKpi.totalAmt).toLocaleString()}
                <span className="text-sm font-bold text-slate-500 ml-1">원</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6" />
            </div>
          </div>

          {/* 카드 2: 총 발주 박스 수량 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12.5px] font-extrabold text-slate-500 block leading-tight">
                📦 총 발주량 (박스 합계)
              </span>
              <div className="text-2xl sm:text-[28px] font-black font-mono text-emerald-700 tracking-tight mt-1 leading-none">
                {summaryKpi.totalBoxes.toLocaleString()}
                <span className="text-sm font-bold text-slate-500 ml-1">box</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6" />
            </div>
          </div>

          {/* 카드 3: 발주 품목 수 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12.5px] font-extrabold text-slate-500 block leading-tight">
                📑 발주 대상 품목 수
              </span>
              <div className="text-2xl sm:text-[28px] font-black font-mono text-indigo-700 tracking-tight mt-1 leading-none">
                {summaryKpi.itemCount}
                <span className="text-sm font-bold text-slate-500 ml-1">개 품목</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0">
              <Layers className="w-6 h-6" />
            </div>
          </div>

          {/* 카드 4: 거래처 수 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12.5px] font-extrabold text-slate-500 block leading-tight">
                🏢 발주 진행 거래처 수
              </span>
              <div className="text-2xl sm:text-[28px] font-black font-mono text-slate-800 tracking-tight mt-1 leading-none">
                {summaryKpi.supplierCount}
                <span className="text-sm font-bold text-slate-500 ml-1">개사</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 border border-slate-300 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. 액션 바 & 뷰 모드 탭 (품목별 모아보기 vs 거래처별 모아보기) */}
      {/* ===================================================================== */}
      <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* 뷰 모드 탭 전환 */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl">
          <button
            type="button"
            onClick={() => setViewTab('items')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-black transition cursor-pointer ${
              viewTab === 'items'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>① 전체 품목별 모아보기 (추천)</span>
            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-white/20">
              {filteredItems.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('suppliers')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-black transition cursor-pointer ${
              viewTab === 'suppliers'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>② 거래처별 발주서 보기</span>
            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-white/20">
              {filteredMasters.length}
            </span>
          </button>
        </div>

        {/* 액션 버튼 그룹: 크게보기, 저장, 선택 삭제, 엑셀, 인쇄 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 발주내용 크게보기 팝업 버튼 */}
          <button
            type="button"
            onClick={() => openLargePopup()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-black shadow-xs transition cursor-pointer"
            title="상단 헤더·카드를 가리지 않고 발주내역 상자를 큰 팝업창으로 넓게 봅니다."
          >
            <Maximize2 className="w-4 h-4" />
            <span>발주내용 크게보기</span>
          </button>

          {/* 변경사항 저장 버튼 (수정 건이 있을 때 강조 활성화) */}
          <button
            type="button"
            onClick={handleSaveAllChanges}
            disabled={modifiedCount === 0 || isSaving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-black shadow-xs transition cursor-pointer ${
              modifiedCount > 0
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>
              {isSaving
                ? '저장 중...'
                : modifiedCount > 0
                ? `수정내용 DB 영구저장 (${modifiedCount}건)`
                : '변경사항 저장'}
            </span>
          </button>

          {/* 선택 삭제 버튼 */}
          <button
            type="button"
            onClick={() => void handleDeleteChecked()}
            disabled={selectedCount === 0}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-bold border transition cursor-pointer ${
              selectedCount > 0
                ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
                : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>선택 삭제 ({selectedCount}건)</span>
          </button>

          {/* 엑셀 다운로드 */}
          <button
            type="button"
            onClick={() => handleExcelExport()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[13px] font-bold shadow-2xs transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">엑셀 다운로드</span>
          </button>

          {/* 발주서 인쇄 */}
          <button
            type="button"
            onClick={() => handlePrintOrder()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[13px] font-bold shadow-2xs transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">발주서 인쇄</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 4. 메인 데이터 테이블 영역 */}
      {/* ===================================================================== */}
      <main className="flex-1 min-h-0 bg-white overflow-hidden p-4">
        {loading ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-500">
            <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-extrabold tracking-tight">발주 데이터를 빠르게 불러오고 있습니다...</span>
          </div>
        ) : viewTab === 'items' ? (
          /* ─────────────────────────────────────────────────────────────────── */
          /* 탭 1: 전체 발주 품목별 모아보기 (한눈에 시원시원하게 정렬되는 추천 뷰) */
          /* ─────────────────────────────────────────────────────────────────── */
          <div className="w-full h-full flex flex-col border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            {/* 상자 헤더 바 (제목 + 크게보기 팝업 버튼) */}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
                <span className="text-slate-900">📋 발주 내역 ({filteredItems.length}개 품목)</span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500 font-medium">
                  수량·단가 셀을 클릭하여 바로 수정하거나, <strong className="text-blue-700">발주번호</strong>를 클릭해 해당 거래처 발주서만 크게 볼 수 있습니다.
                </span>
              </div>
              <button
                type="button"
                onClick={() => openLargePopup({ mode: 'all' })}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-black transition cursor-pointer"
                title="이 발주내역 상자를 화면 가득 큰 팝업으로 띄웁니다."
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>큰 팝업으로 보기</span>
              </button>
            </div>

            {/* 테이블 스크롤 컨테이너 */}
            <div className="flex-1 overflow-auto">
              {renderOrderItemsTable(filteredItems, 'normal')}
            </div>

            {/* 하단 총합계 고정 바 */}
            <div className="bg-slate-100 border-t border-slate-300 px-5 py-3 flex items-center justify-between text-[13.5px] font-extrabold shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-slate-600">선택된 품목:</span>
                <span className="text-blue-700 font-mono font-black">{selectedCount}건</span>
                {modifiedCount > 0 && (
                  <span className="text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded-full text-[12px]">
                    ✏️ 수정됨: {modifiedCount}건 (저장 필요)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-600 mr-2">조회 합계 박스수:</span>
                  <span className="text-emerald-700 font-mono text-[16px] font-black">
                    {summaryKpi.totalBoxes.toLocaleString()} box
                  </span>
                </div>
                <div>
                  <span className="text-slate-600 mr-2">조회 합계 발주총액:</span>
                  <span className="text-blue-800 font-mono text-[17px] font-black">
                    ₩{Math.round(summaryKpi.totalAmt).toLocaleString()}원
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─────────────────────────────────────────────────────────────────── */
          /* 탭 2: 거래처별 발주서 모아보기 (전통적인 전표 마스터-디테일 뷰) */
          /* ─────────────────────────────────────────────────────────────────── */
          <div className="w-full h-full grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* 좌측: 발주서 목록 (5열) */}
            <div className="lg:col-span-5 h-full flex flex-col border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
              <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 font-black text-[13.5px] text-slate-800 flex items-center justify-between">
                <span>거래처별 발주서 목록 ({filteredMasters.length}건)</span>
                <span className="text-xs font-semibold text-slate-500">클릭 시 우측에 상세 품목 표시</span>
              </div>
              <div className="flex-1 overflow-auto divide-y divide-slate-100">
                {filteredMasters.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 font-bold">조회된 발주서가 없습니다.</div>
                ) : (
                  filteredMasters.map((m) => {
                    const isSelected = m.id === selectedMasterId;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMasterId(m.id)}
                        onDoubleClick={() => openLargePopup({ mode: 'po', orderId: m.id })}
                        className={`p-3.5 transition cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected ? 'bg-blue-50/80 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={m.checked}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleMasterCheck(m.id);
                            }}
                            className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-[14.5px] text-slate-900">{m.supplier}</span>
                              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                                {m.orderNo}
                              </span>
                            </div>
                            <div className="text-[12.5px] text-slate-500 mt-1 flex items-center gap-2 font-medium">
                              <span>일자: {m.orderDate}</span>
                              <span>•</span>
                              <span>품목: {m.itemCount}개</span>
                              <span>•</span>
                              <span className="text-blue-700 font-bold">{m.status}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-[15px] font-black font-mono text-slate-900">
                              ₩{Math.round(m.orderAmt).toLocaleString()}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMasterId(m.id);
                              openLargePopup({ mode: 'po', orderId: m.id });
                            }}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer"
                            title="이 발주서 상세내용을 큰 팝업창으로 보기"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 우측: 선택된 발주서 상세 품목 (7열) */}
            <div className="lg:col-span-7 h-full flex flex-col border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
              {(() => {
                const activeMaster = masterList.find((m) => m.id === selectedMasterId);
                if (!activeMaster) {
                  return (
                    <div className="w-full h-full flex flex-col items-center justify-center p-10 text-slate-400 font-bold">
                      왼쪽에서 발주서를 선택해주세요.
                    </div>
                  );
                }
                return (
                  <>
                    <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 font-black text-[13.5px] text-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-700">[{activeMaster.supplier}]</span>
                        <span>{activeMaster.orderNo} 품목 상세 ({activeMaster.details.length}개)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-mono font-black text-slate-900">
                          발주총액: ₩{Math.round(activeMaster.orderAmt).toLocaleString()}원
                        </div>
                        <button
                          type="button"
                          onClick={() => openLargePopup({ mode: 'po', orderId: activeMaster.id })}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-2xs transition cursor-pointer"
                          title="이 발주서 상세 상자를 큰 팝업으로 확대해 보고 수정합니다."
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>큰 팝업으로 보기</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-50 text-slate-600 text-[12.5px] font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">품명</th>
                            <th className="py-2.5 px-3 text-center">규격</th>
                            <th className="py-2.5 px-2 text-right">입수</th>
                            <th className="py-2.5 px-3 text-right">발주수량</th>
                            <th className="py-2.5 px-3 text-right">봉단가</th>
                            <th className="py-2.5 px-3 text-right">박스단가</th>
                            <th className="py-2.5 px-3 text-right">금액</th>
                            <th className="py-2.5 px-3 text-center">상태</th>
                            <th className="py-2.5 px-3 text-center w-14">삭제</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[13px]">
                          {activeMaster.details.map((d) => (
                            <tr key={d.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-black text-slate-800">{d.productName}</td>
                              <td className="py-2.5 px-3 text-center text-slate-500">{d.spec}</td>
                              <td className="py-2.5 px-2 text-right font-mono text-slate-500">
                                {d.packUnit}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-800">
                                {d.orderQty} {d.unit}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                                ₩{d.bagPrice.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                ₩{d.unitPrice.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                                ₩{d.amount.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-center text-xs font-bold text-slate-600">
                                {d.status}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSingleItem(d)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition cursor-pointer hover:bg-rose-50"
                                  title="이 품목만 발주서에서 삭제"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* 5. 하단 상태 알림 스트립 */}
      {/* ===================================================================== */}
      <footer className="px-5 py-2 bg-slate-100 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          <span>{statusMsg || '정상 가동 중'}</span>
        </div>
        <div className="text-[11.5px] font-mono text-slate-400">
          기준 발주일: {startDate} ~ {endDate} | 단위: 박스(Box) / 원(KRW)
        </div>
      </footer>

      {/* ===================================================================== */}
      {/* 6. 발주내용 크게보기 (전체화면 확대·수정·인쇄 팝업창) */}
      {/* ===================================================================== */}
      {orderPopup && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4"
          onClick={() => setOrderPopup(null)}
        >
          <div
            className="w-[96vw] h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 팝업 상단 헤더 바 */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                {orderPopup.mode === 'po' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPopupKeyword('');
                      setOrderPopup({ mode: 'all' });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold transition cursor-pointer"
                    title="조회기간 전체 발주 품목 목록으로 돌아가기"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>전체 발주목록</span>
                  </button>
                )}

                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-500 text-white text-xs font-black shrink-0">
                    {orderPopup.mode === 'po' ? '거래처 발주서 상세' : '전체 발주내용 크게보기'}
                  </span>
                  {orderPopup.mode === 'po' && popupMaster ? (
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <h2 className="text-lg sm:text-xl font-black tracking-tight text-white truncate">
                        [{popupMaster.supplier}] {popupMaster.orderNo}
                      </h2>
                      <span className="text-xs font-mono text-slate-300 bg-white/10 px-2 py-0.5 rounded">
                        발주일 {popupMaster.orderDate} • {popupItems.length}개 품목 • {popupMaster.status}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                        조회 발주내역 전체 ({popupItems.length}개 품목)
                      </h2>
                      <span className="text-xs font-mono text-slate-300 bg-white/10 px-2 py-0.5 rounded">
                        {startDate} ~ {endDate}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 우측: 다른 거래처 빠른 이동 + 글자 크기 + 닫기 */}
              <div className="flex flex-wrap items-center gap-2">
                {filteredMasters.length > 0 && (
                  <select
                    value={orderPopup.mode === 'po' ? String(orderPopup.orderId) : 'ALL'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPopupKeyword('');
                      if (val === 'ALL') {
                        setOrderPopup({ mode: 'all' });
                      } else {
                        const oid = Number(val);
                        setSelectedMasterId(oid);
                        setOrderPopup({ mode: 'po', orderId: oid });
                      }
                    }}
                    className="bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-xl px-3 py-1.5 text-xs font-bold outline-none cursor-pointer max-w-[260px]"
                    title="전체 또는 특정 거래처 발주서로 빠르게 전환합니다."
                  >
                    <option value="ALL">📋 전체 품목 보기 ({filteredItems.length}건)</option>
                    {filteredMasters.map((m) => (
                      <option key={m.id} value={String(m.id)}>
                        🏢 {m.supplier} — {m.orderNo} ({m.itemCount}품목)
                      </option>
                    ))}
                  </select>
                )}

                {/* 글자 크기 조절 */}
                <div className="flex items-center gap-1 bg-slate-700/80 p-1 rounded-xl border border-slate-600 text-xs">
                  <span className="text-slate-300 font-bold px-1.5">글자:</span>
                  {(['normal', 'large', 'xlarge'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setPopupFontSize(sz)}
                      className={`px-2.5 py-1 rounded-lg font-black transition cursor-pointer ${
                        popupFontSize === sz
                          ? 'bg-blue-500 text-white shadow-2xs'
                          : 'text-slate-300 hover:text-white hover:bg-slate-600'
                      }`}
                    >
                      {sz === 'normal' ? '보통' : sz === 'large' ? '크게' : '특대'}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setOrderPopup(null)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-rose-500 text-white text-xs font-black transition cursor-pointer"
                  title="팝업 닫기 (ESC)"
                >
                  <X className="w-4 h-4" />
                  <span>닫기</span>
                </button>
              </div>
            </div>

            {/* 팝업 액션 & 검색 툴바 */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={popupKeyword}
                    onChange={(e) => setPopupKeyword(e.target.value)}
                    placeholder="팝업 내 품명 / 거래처 / 발주번호 검색..."
                    className="pl-9 pr-3 py-1.5 w-64 sm:w-80 bg-white border border-slate-300 rounded-xl text-[13px] font-medium outline-none focus:border-blue-500 shadow-2xs"
                  />
                </div>
                {popupKeyword && (
                  <button
                    type="button"
                    onClick={() => setPopupKeyword('')}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    검색 초기화
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAllChanges}
                  disabled={modifiedCount === 0 || isSaving}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[13px] font-black shadow-xs transition cursor-pointer ${
                    modifiedCount > 0
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {isSaving
                      ? '저장 중...'
                      : modifiedCount > 0
                      ? `수정내용 DB 영구저장 (${modifiedCount}건)`
                      : '변경사항 저장'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleDeleteChecked(popupTotals.checkedIds)}
                  disabled={popupTotals.checkedIds.length === 0}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold border transition cursor-pointer ${
                    popupTotals.checkedIds.length > 0
                      ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
                      : 'bg-white border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>선택 삭제 ({popupTotals.checkedIds.length}건)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleExcelExport(
                      popupItems,
                      popupMaster ? `${popupMaster.supplier}_${popupMaster.orderNo}` : `${startDate}_${endDate}`
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[13px] font-bold transition cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>엑셀</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintOrder(popupMaster)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-black shadow-2xs transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>{popupMaster ? '이 발주서 인쇄' : '발주서 인쇄'}</span>
                </button>
              </div>
            </div>

            {/* 팝업 테이블 본문 */}
            <div className="flex-1 overflow-auto bg-white">
              {renderOrderItemsTable(popupItems, popupFontSize)}
            </div>

            {/* 팝업 하단 큰 합계 바 */}
            <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-300 flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex flex-wrap items-center gap-3 text-sm font-extrabold">
                <span className="text-slate-600">
                  표시 품목: <strong className="text-slate-900 font-mono">{popupItems.length}건</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">
                  선택됨: <strong className="text-blue-700 font-mono">{popupTotals.checkedIds.length}건</strong>
                </span>
                {modifiedCount > 0 && (
                  <span className="text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full text-xs font-black">
                    ✏️ 수정됨: {modifiedCount}건 (상단 저장 버튼을 눌러 DB에 반영하세요)
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <span className="text-slate-600 font-bold text-sm mr-2">총 발주 박스수:</span>
                  <span className="text-emerald-700 font-mono text-xl font-black">
                    {popupTotals.boxes.toLocaleString()} box
                  </span>
                </div>
                <div>
                  <span className="text-slate-600 font-bold text-sm mr-2">총 발주 금액:</span>
                  <span className="text-blue-800 font-mono text-2xl font-black">
                    ₩{Math.round(popupTotals.amt).toLocaleString()}원
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
