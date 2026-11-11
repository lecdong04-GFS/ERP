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
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { exportGridToExcel } from '@/lib/excelExport';
import { erpConfirm } from '@/context/ConfirmContext';
import { usePrintReport } from '@/context/PrintReportContext';
import {
  normalizePackUnit,
  calcBoxPrice,
  calcBagPriceFromBox,
  isBoxUnitLabel,
} from '@/lib/gfs/pricing';

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

// 모듈 레벨 메모리 캐시 (탭 재진입 시 0ms 즉시 표시)
let memoryOrdersData: any[] = [];
let memoryLoaded = false;
let memorySavedDates = { start: '', end: '' };

export const OrderStatusEditView: React.FC = () => {
  const { openTab } = useTabs();
  const { openPrintModal, setPoPayload } = usePrintReport();

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

          const itemRow: FlatOrderItemRow = {
            id: d.id,
            orderId: po.id,
            orderNo: po.orderNo,
            orderDate: po.orderDate,
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
          expectedDate: po.deliveryDate || po.orderDate,
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

  const filteredItems = useMemo(() => {
    return flatItems.filter((item) => {
      if (supplierFilter !== '전체' && item.partnerName !== supplierFilter) return false;
      if (statusFilter !== '전체' && item.status !== statusFilter) return false;
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
  }, [flatItems, supplierFilter, statusFilter, searchKeyword]);

  const filteredMasters = useMemo(() => {
    return masterList.filter((m) => {
      if (supplierFilter !== '전체' && m.supplier !== supplierFilter) return false;
      if (statusFilter !== '전체' && m.status !== statusFilter) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const matchSupplier = m.supplier.toLowerCase().includes(kw);
        const matchNo = m.orderNo.toLowerCase().includes(kw);
        const matchItem = m.details.some((d) => d.productName.toLowerCase().includes(kw));
        if (!matchSupplier && !matchNo && !matchItem) return false;
      }
      return true;
    });
  }, [masterList, supplierFilter, statusFilter, searchKeyword]);

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

  // 3) 전체 품목 인라인 수정 핸들러 (수량 or 봉단가/박스단가 변경 시 금액 및 상호 단가 자동 재계산)
  const handleItemFieldChange = (detailId: number, field: 'orderQty' | 'unitPrice' | 'bagPrice' | 'remark', value: any) => {
    setFlatItems((prev) =>
      prev.map((item) => {
        if (item.id !== detailId) return item;
        const updated = { ...item, isModified: true };
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
      })
    );
  };

  // 4) 체크박스 선택/해제 핸들러
  const handleToggleSelectAll = (checked: boolean) => {
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
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || `발주서(ID: ${orderId}) 저장 실패`);
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

  // 6) 선택 삭제 핸들러 (품목 뷰 or 발주서 뷰)
  const handleDeleteChecked = async () => {
    if (viewTab === 'items') {
      const checkedDetails = flatItems.filter((x) => x.checked);
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
        const json = await res.json().catch(() => null);
        if (json?.success) {
          alert(`✅ ${json.message || '선택한 품목이 성공적으로 삭제되었습니다.'}`);
        } else {
          alert('삭제 실패: ' + (json?.error || '오류 발생'));
          loadData(startDate, endDate, true);
        }
      } catch (err: any) {
        alert('삭제 통신 오류: ' + (err?.message || err));
        loadData(startDate, endDate, true);
      }
    } else {
      // 발주서(마스터) 단위 삭제
      const checkedMasters = masterList.filter((m) => m.checked);
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
        const json = await res.json().catch(() => null);
        if (json?.success) {
          alert(`✅ ${json.message || '선택한 발주서가 성공적으로 삭제되었습니다.'}`);
        } else {
          alert('발주서 삭제 실패: ' + (json?.error || '오류'));
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
  const handleExcelExport = () => {
    if (viewTab === 'items') {
      if (filteredItems.length === 0) {
        alert('다운로드할 발주 내역이 없습니다.');
        return;
      }
      exportGridToExcel({
        filename: `발주현황_품목별_${startDate}_${endDate}`,
        sheetName: '발주품목목록',
        columns: [
          { key: 'orderDate', label: '발주일자', format: 'date' },
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
        data: filteredItems,
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

  // 9) 표준 발주서 인쇄
  const handlePrintOrder = () => {
    if (masterList.length === 0) {
      alert('인쇄할 발주서 내역이 없습니다.');
      return;
    }
    const target = masterList.find((m) => m.checked) || masterList[0];
    if (target) {
      setPoPayload({
        orderNo: target.orderNo,
        orderDate: target.orderDate,
        supplierName: target.supplier,
        items: target.details.map((d, i) => ({
          no: i + 1,
          name: d.productName,
          spec: d.spec,
          unit: d.unit,
          qty: d.orderQty,
          price: d.unitPrice,
          amt: d.amount,
          remark: d.remark,
        })),
        totalAmount: target.orderAmt,
        remark: target.remark,
      });
      openPrintModal('PURCHASE_ORDER');
    }
  };

  // 10) 자체발주(요일별) 화면 즉시 이동
  const handleGoToOrder = () => {
    const item = getMenuItemById('pur-mat-order-day');
    if (item) openTab(item);
  };

  const isAllChecked =
    viewTab === 'items'
      ? filteredItems.length > 0 && filteredItems.every((x) => x.checked)
      : filteredMasters.length > 0 && filteredMasters.every((x) => x.checked);

  const selectedCount =
    viewTab === 'items'
      ? filteredItems.filter((x) => x.checked).length
      : filteredMasters.filter((x) => x.checked).length;

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

        {/* 액션 버튼 그룹: 저장, 선택 삭제, 취소, 엑셀, 인쇄 */}
        <div className="flex items-center gap-2">
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
            onClick={handleDeleteChecked}
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
            onClick={handleExcelExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[13px] font-bold shadow-2xs transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">엑셀 다운로드</span>
          </button>

          {/* 발주서 인쇄 */}
          <button
            type="button"
            onClick={handlePrintOrder}
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
            {/* 테이블 스크롤 컨테이너 */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse min-w-[1100px]">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 text-[13px] font-black border-b border-slate-200 uppercase tracking-tight select-none">
                  <tr>
                    <th className="py-3 px-3 text-center w-12">
                      <input
                        type="checkbox"
                        checked={isAllChecked}
                        onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
                        title="전체 선택"
                      />
                    </th>
                    <th className="py-3 px-2 text-center w-14">No</th>
                    <th className="py-3 px-3 w-28 text-center">발주일자</th>
                    <th className="py-3 px-3 w-36 text-center">발주번호</th>
                    <th className="py-3 px-3 w-40">거래처명</th>
                    <th className="py-3 px-4 min-w-[200px]">품명</th>
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
                <tbody className="divide-y divide-slate-100 text-[13.5px]">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="py-16 text-center">
                        <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                          <Package className="w-12 h-12 text-slate-300" />
                          <div className="text-[15px] font-black text-slate-700">
                            선택하신 기간({startDate} ~ {endDate})에 등록된 발주 내역이 없습니다.
                          </div>
                          <p className="text-[13px] text-slate-500">
                            [자재발주(요일별)]에서 발주를 확정하시면 해당 내역이 이곳에 실시간으로 표시됩니다.
                          </p>
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
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
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
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={() => handleToggleItemCheck(item.id)}
                              className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
                            />
                          </td>

                          {/* No */}
                          <td className="py-2.5 px-2 text-center text-slate-400 font-mono text-[12px]">
                            {idx + 1}
                          </td>

                          {/* 발주일자 */}
                          <td className="py-2.5 px-3 text-center font-mono text-[13px] text-slate-600">
                            {item.orderDate}
                          </td>

                          {/* 발주번호 */}
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono text-[12px] font-bold border border-slate-200 shadow-2xs"
                              title={item.orderNo}
                            >
                              {item.orderNo}
                            </span>
                          </td>

                          {/* 거래처명 */}
                          <td className="py-2.5 px-3 font-extrabold text-slate-800">
                            {item.partnerName}
                          </td>

                          {/* 품명 (시원하게 큰 글씨) */}
                          <td className="py-2.5 px-4 font-black text-[14.5px] text-slate-900 tracking-tight">
                            {item.productName}
                          </td>

                          {/* 규격/단위 */}
                          <td className="py-2.5 px-3 text-center text-slate-500 text-[12.5px] font-medium">
                            {item.spec} / {item.unit}
                          </td>

                          {/* 입수량 */}
                          <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-700 text-[12.5px]">
                            {item.packUnit.toLocaleString()}
                          </td>

                          {/* 발주박스수 (인라인 수정 가능 인풋) */}
                          <td className="py-1.5 px-2 text-right bg-blue-50/40 border-x border-blue-100">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min={0}
                                value={item.orderQty}
                                onChange={(e) =>
                                  handleItemFieldChange(item.id, 'orderQty', e.target.value)
                                }
                                className="w-20 text-right px-2 py-1 bg-white border border-blue-300 rounded-lg text-[14px] font-black font-mono text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                              />
                              <span className="text-[12px] font-bold text-blue-700">{item.unit || 'box'}</span>
                            </div>
                          </td>

                          {/* 봉단가 (양방향 자동 연동) */}
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
                                className="w-20 text-right px-2 py-1 bg-white border border-emerald-300 rounded-lg text-[13px] font-bold font-mono text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                              />
                            </div>
                          </td>

                          {/* 박스단가 (인라인 수정 가능 인풋 + 마스터 동기화) */}
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
                                className="w-24 text-right px-2 py-1 bg-white border border-blue-300 rounded-lg text-[13.5px] font-black font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                              />
                            </div>
                            {item.masterBoxPrice != null &&
                              item.masterBoxPrice > 0 &&
                              Math.abs(item.unitPrice - (isBoxUnitLabel(item.unit) ? item.masterBoxPrice : (item.masterBagPrice || item.masterBoxPrice))) > 1 && (
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
                                  마스터 ₩{(isBoxUnitLabel(item.unit) ? item.masterBoxPrice : (item.masterBagPrice || item.masterBoxPrice)).toLocaleString()} 적용
                                </button>
                              )}
                          </td>

                          {/* 발주금액 (수량 x 단가 자동 연산) */}
                          <td className="py-2.5 px-3 text-right font-black font-mono text-[14.5px] text-slate-900">
                            ₩{Math.round(item.amount).toLocaleString()}
                          </td>

                          {/* 발주상태 뱃지 */}
                          <td className="py-2.5 px-3 text-center">
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
                              className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-400 rounded-lg text-[12.5px] outline-none"
                            />
                          </td>

                          {/* 삭제 버튼 */}
                          <td className="py-2.5 px-3 text-center">
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
                        className={`p-3.5 transition cursor-pointer flex items-center justify-between ${
                          isSelected ? 'bg-blue-50/80 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={m.checked}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleMasterCheck(m.id);
                            }}
                            className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
                          />
                          <div>
                            <div className="flex items-center gap-2">
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
                        <div className="text-right">
                          <div className="text-[15px] font-black font-mono text-slate-900">
                            ₩{Math.round(m.orderAmt).toLocaleString()}
                          </div>
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
                    <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 font-black text-[13.5px] text-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-700">[{activeMaster.supplier}]</span>
                        <span>{activeMaster.orderNo} 품목 상세 ({activeMaster.details.length}개)</span>
                      </div>
                      <div className="text-sm font-mono font-black text-slate-900">
                        발주총액: ₩{Math.round(activeMaster.orderAmt).toLocaleString()}원
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
    </div>
  );
};
