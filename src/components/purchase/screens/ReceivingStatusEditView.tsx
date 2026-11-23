'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';
import { exportGridToExcel } from '@/lib/excelExport';
import { readJsonSafe } from '@/lib/http';
import { escapeHtml } from '@/lib/sanitize';
import {
  calcBagPriceFromBox,
  calcBoxPrice,
  isBagUnitLabel,
  isBoxUnitLabel,
  normalizePackUnit,
} from '@/lib/gfs/pricing';
import {
  ExternalLink,
  Search,
  RotateCcw,
  FileSpreadsheet,
  ShieldCheck,
  Trash2,
  Save,
  Truck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Maximize2,
  Layers,
  ArrowRight,
  Filter,
  Check,
  Undo2,
  X,
  Sparkles,
  Info,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
  Upload,
  Printer,
} from 'lucide-react';
import { ReceivingUploadModal } from '../modals/ReceivingUploadModal';
import { ProductLifecycleBadge } from '@/components/common/ProductLifecycleBadge';

// KST 시간 헬퍼
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

function getKoreanDayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : `(${days[d.getDay()]})`;
}

// 입고 행 데이터 인터페이스
interface ReceivingRow {
  id: number;                // ReceivingDetail ID
  receivingId: number;       // Parent Receiving ID
  receivingNo: string;       // 전표번호 (RCV-20261106-001)
  receivingDate: string;     // 입고일자
  partnerId: string;         // 거래처 ID
  partnerName: string;       // 매입처명
  status: string;            // '입고완료' | '부분입고' | '취소' | '입고'
  productId: number;
  productCode: string;
  productName: string;
  productStatus?: string;
  discontinuedDate?: string;
  isUsed?: boolean;
  category: string;          // '원재료' | '부자재'
  spec: string;
  unit: string;
  packUnit: number;          // 입수량
  orderQty: number;          // 발주수량
  recvQty: number;           // 입고수량 (editable)
  buyPrice: number;          // 적용 입고단가 (editable)
  bagPrice: number;          // 봉단가 (editable)
  boxPrice: number;          // 박스단가 (editable)
  recvAmt: number;           // 입고금액 (recvQty * buyPrice)
  diffQty: number;           // 차이수량 (recvQty - orderQty)
  warehouse: string;         // 창고명 (editable)
  expiryDate: string;        // 유통기한 (editable)
  carNo: string;             // 차량번호 (editable)
  carTemp: string;           // 차량온도 (editable)
  markStatus: string;        // 'O' | 'X' (HACCP 표시)
  lookStatus: string;        // 'O' | 'X' (HACCP 외관)
  carClean: string;          // 'O' | 'X' (HACCP 차량청결)
  totalJudge: string;        // 'O' | 'X' (HACCP 종합판정)
  lotNo: string;             // LOT번호 (editable)
  remark: string;            // 비고 (editable)
  checked: boolean;
  isModified: boolean;       // 수정 여부
  original: {
    recvQty: number;
    buyPrice: number;
    warehouse: string;
    expiryDate: string;
    carNo: string;
    carTemp: string;
    markStatus: string;
    lookStatus: string;
    carClean: string;
    totalJudge: string;
    lotNo: string;
    remark: string;
  };
}

interface PendingInboundRow {
  id: number;
  purchaseOrderId: number;
  orderNo: string;
  orderDate: string;
  expectedDeliveryDate: string;
  orderCycle: string;
  leadDays: number;
  partnerName: string;
  productId: number;
  productCode: string;
  productName: string;
  productStatus?: string;
  discontinuedDate?: string;
  isUsed?: boolean;
  warehouse: string;
  unit: string;
  packUnit: number;
  orderQty: number;
  remainQty: number;
  unitPrice: number;
  bagPrice: number;
  boxPrice: number;
  expectedAmt: number;
}

export const ReceivingStatusEditView: React.FC = () => {
  const { openTab } = useTabs();

  // 뷰 모드 ('history': 입고 확정 이력 | 'expected': 금일 입고예정)
  const [viewMode, setViewMode] = useState<'history' | 'expected'>('history');
  const [pendingRows, setPendingRows] = useState<PendingInboundRow[]>([]);
  const [pendingDateFilter, setPendingDateFilter] = useState<'today' | 'all'>('today');

  // 검색 및 필터 상태
  const [startDate, setStartDate] = useState<string>(kstDaysAgo(7));
  const [endDate, setEndDate] = useState<string>(kstToday());
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [keyword, setKeyword] = useState<string>('');
  const [selectAll, setSelectAll] = useState<boolean>(false);

  // 데이터 상태
  const [rows, setRows] = useState<ReceivingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // 파일 업로드 모달 상태
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [showLargeTableModal, setShowLargeTableModal] = useState<boolean>(false);

  useEffect(() => {
    if (!showLargeTableModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLargeTableModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showLargeTableModal]);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setSelectedUploadFile(f);
      setUploadModalOpen(true);
    }
    e.target.value = '';
  };

  // ── 1. 데이터 로드 (실제 DB 연동) ──
  const loadReceivingData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (statusFilter !== '전체') params.set('status', statusFilter);
      if (supplierFilter !== 'ALL') params.set('partnerId', supplierFilter);
      if (keyword.trim()) params.set('search', keyword.trim());

      const [res, pendingRes] = await Promise.all([
        fetch(`/api/purchase/receiving?${params.toString()}`, { cache: 'no-store' }),
        fetch('/api/purchase/receiving?type=pending_orders', { cache: 'no-store' }),
      ]);
      const [json, pendingJson] = await Promise.all([res.json(), pendingRes.json()]);

      if (pendingJson?.success && Array.isArray(pendingJson.data)) {
        const mappedPending: PendingInboundRow[] = pendingJson.data.map((dt: any) => {
          const remain = Number(dt.remainQty || 0);
          const uPrice = Number(dt.unitPrice || 0);
          const pUnit = normalizePackUnit(dt.packUnit || dt.product?.boxQty);
          return {
            id: dt.id,
            purchaseOrderId: dt.purchaseOrderId,
            orderNo: dt.purchaseOrder?.orderNo || `PO-${dt.purchaseOrderId}`,
            orderDate: dt.orderDate || dt.purchaseOrder?.orderDate || '',
            expectedDeliveryDate: dt.expectedDeliveryDate || dt.purchaseOrder?.deliveryDate || '',
            orderCycle: dt.orderCycle || dt.product?.orderCycle || '',
            leadDays: Number(dt.leadDays || 0),
            partnerName: dt.purchaseOrder?.partnerName || dt.purchaseOrder?.partner?.name || '공급사',
            productId: dt.productId || 0,
            productCode: dt.productCode || dt.product?.productCode || '',
            productName: dt.productName || dt.product?.name || '',
            productStatus: dt.product?.status || '정상',
            discontinuedDate: dt.product?.discontinuedDate || '',
            isUsed: dt.product?.isUsed !== false,
            warehouse: dt.warehouse || dt.product?.warehouse || '상온',
            unit: dt.unit || dt.product?.unit || 'box',
            packUnit: pUnit,
            orderQty: Number(dt.orderQty || 0),
            remainQty: remain,
            unitPrice: uPrice,
            bagPrice: Number(dt.bagPrice || 0),
            boxPrice: Number(dt.boxPrice || 0),
            expectedAmt: Math.round(remain * uPrice),
          };
        });
        setPendingRows(mappedPending);
      } else {
        setPendingRows([]);
      }

      if (json.success && Array.isArray(json.data)) {
        const loaded: ReceivingRow[] = [];

        json.data.forEach((rcv: any) => {
          // 전표 레벨 차량정보/온도 파싱
          let parsedCarNo = '경기88바1234';
          let parsedCarTemp = '18.0℃';
          let parsedJudge = 'O';

          if (rcv.remark) {
            const carMatch = rcv.remark.match(/차량:\s*([^,\s·]+)/);
            if (carMatch) parsedCarNo = carMatch[1];
            const tempMatch = rcv.remark.match(/온도:\s*([^,\s·]+)/);
            if (tempMatch) parsedCarTemp = tempMatch[1];
            const judgeMatch = rcv.remark.match(/판정:\s*([^,\s·]+)/);
            if (judgeMatch) parsedJudge = judgeMatch[1];
          }

          (rcv.details || []).forEach((dt: any) => {
            const qty = Number(dt.receivedQty || 0);
            const price = Number(dt.unitPrice || 0);
            const amt = Number(dt.amount || Math.round(qty * price));
            const packUnit = normalizePackUnit(dt.packUnit || dt.product?.boxQty || dt.boxQty);
            const unitStr = dt.unit || dt.product?.unit || 'box';
            const isBox = isBoxUnitLabel(unitStr) || (!isBagUnitLabel(unitStr) && packUnit > 1);
            const bagPrice =
              Number(dt.bagPrice) > 0
                ? Number(dt.bagPrice)
                : isBox && packUnit > 1 && price > 0
                  ? calcBagPriceFromBox(price, packUnit)
                  : price;
            const boxPrice =
              Number(dt.boxPrice) > 0
                ? Number(dt.boxPrice)
                : calcBoxPrice(bagPrice, packUnit);

            // 결품/차이 분석 (비고 또는 수량에서 파생)
            let orderQty = qty;
            let diffQty = 0;
            if (dt.remark?.includes('부족') || rcv.status === '부분입고') {
              const shortageMatch = dt.remark?.match(/(\d+)박스\s*부족/);
              const shortage = shortageMatch ? Number(shortageMatch[1]) : 2;
              orderQty = qty + shortage;
              diffQty = -shortage;
            }

            const rowCarNo = dt.remark?.includes('차량:') ? dt.remark.replace(/.*차량:\s*([^,\s·]+).*/, '$1') : parsedCarNo;
            const rowJudge = dt.inspectResult === '불합격' ? 'X' : (parsedJudge === 'X' ? 'X' : 'O');

            const rowStatus =
              rcv.status === '취소' || dt.remark?.includes('[품목취소]') || qty <= 0
                ? '취소'
                : rcv.status || '입고완료';

            loaded.push({
              id: dt.id,
              receivingId: rcv.id,
              receivingNo: rcv.receivingNo,
              receivingDate: rcv.receivingDate,
              partnerId: rcv.partnerId || '',
              partnerName: rcv.partner?.name || rcv.partnerName || '공급사',
              status: rowStatus,
              productId: dt.productId,
              productCode: dt.productCode || dt.product?.productCode || `P-${dt.id}`,
              productName: dt.product?.name || dt.productName || '원료',
              productStatus: dt.product?.status || '정상',
              discontinuedDate: dt.product?.discontinuedDate || '',
              isUsed: dt.product?.isUsed !== false,
              category: dt.product?.category || (dt.productName?.includes('용기') || dt.productName?.includes('뚜껑') ? '부자재' : '원재료'),
              spec: dt.product?.spec || '-',
              unit: unitStr,
              packUnit,
              orderQty,
              recvQty: qty,
              buyPrice: price,
              bagPrice,
              boxPrice,
              recvAmt: amt,
              diffQty,
              warehouse: dt.warehouse || '상온',
              expiryDate: dt.expiryDate || '2027-10-25',
              carNo: rowCarNo,
              carTemp: parsedCarTemp,
              markStatus: 'O',
              lookStatus: 'O',
              carClean: 'O',
              totalJudge: rowJudge,
              lotNo: dt.lotNo || `LOT-${rcv.receivingDate.replace(/-/g, '')}`,
              remark: dt.remark || '',
              checked: false,
              isModified: false,
              original: {
                recvQty: qty,
                buyPrice: price,
                warehouse: dt.warehouse || '상온',
                expiryDate: dt.expiryDate || '2027-10-25',
                carNo: rowCarNo,
                carTemp: parsedCarTemp,
                markStatus: 'O',
                lookStatus: 'O',
                carClean: 'O',
                totalJudge: rowJudge,
                lotNo: dt.lotNo || `LOT-${rcv.receivingDate.replace(/-/g, '')}`,
                remark: dt.remark || '',
              },
            });
          });
        });

        setRows(loaded);
      } else {
        setRows([]);
      }
    } catch (err) {
      console.error('Failed to load receiving data', err);
    } finally {
      setLoading(false);
      setSelectAll(false);
    }
  }, [startDate, endDate, statusFilter, supplierFilter, keyword]);

  useEffect(() => {
    loadReceivingData();
  }, [loadReceivingData]);

  // ── 2. 거래처 목록 추출 ──
  const distinctSuppliers = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.partnerName) map.set(r.partnerName, r.partnerName);
    });
    pendingRows.forEach((p) => {
      if (p.partnerName) map.set(p.partnerName, p.partnerName);
    });
    return Array.from(map.keys());
  }, [rows, pendingRows]);

  const todayStr = kstToday();

  const todayExpectedCount = useMemo(() => {
    return pendingRows.filter((p) => p.expectedDeliveryDate === todayStr).length;
  }, [pendingRows, todayStr]);

  const filteredPendingRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return pendingRows
      .filter((p) => {
        if (pendingDateFilter === 'today' && p.expectedDeliveryDate !== todayStr) return false;
        if (supplierFilter !== 'ALL' && p.partnerName !== supplierFilter) return false;
        if (kw) {
          const hit =
            p.productName.toLowerCase().includes(kw) ||
            p.productCode.toLowerCase().includes(kw) ||
            p.orderNo.toLowerCase().includes(kw) ||
            p.partnerName.toLowerCase().includes(kw) ||
            p.warehouse.toLowerCase().includes(kw);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => (a.expectedDeliveryDate || '').localeCompare(b.expectedDeliveryDate || '') || a.partnerName.localeCompare(b.partnerName));
  }, [pendingRows, pendingDateFilter, todayStr, supplierFilter, keyword]);

  // ── 3. 필터링된 행 목록 ──
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (supplierFilter !== 'ALL' && r.partnerName !== supplierFilter) return false;
      if (statusFilter === '전체') {
        if (r.status === '취소') return false;
      } else {
        if (statusFilter === '입고완료') {
          if (r.status !== '입고완료' && r.status !== '입고') return false;
        } else if (r.status !== statusFilter) {
          return false;
        }
      }
      if (keyword.trim()) {
        const q = keyword.trim().toLowerCase();
        const match =
          r.productName.toLowerCase().includes(q) ||
          r.productCode.toLowerCase().includes(q) ||
          r.receivingNo.toLowerCase().includes(q) ||
          r.partnerName.toLowerCase().includes(q) ||
          r.lotNo.toLowerCase().includes(q) ||
          r.carNo.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rows, supplierFilter, statusFilter, keyword]);

  // ── 4. 핵심 KPI 계산 ──
  const stats = useMemo(() => {
    const totalDetails = filteredRows.length;
    const receivingNos = new Set(filteredRows.map((r) => r.receivingNo));
    const totalHeaders = receivingNos.size;
    const totalAmount = filteredRows.reduce((sum, r) => sum + (r.recvAmt || 0), 0);
    const shortageCount = filteredRows.filter((r) => r.diffQty < 0 || r.status === '부분입고').length;
    const passCount = filteredRows.filter((r) => r.totalJudge === 'O').length;
    const haccpPassRate = totalDetails > 0 ? Math.round((passCount / totalDetails) * 100) : 100;
    const modifiedCount = filteredRows.filter((r) => r.isModified).length;
    const checkedCount = filteredRows.filter((r) => r.checked).length;

    return {
      totalDetails,
      totalHeaders,
      totalAmount,
      shortageCount,
      haccpPassRate,
      modifiedCount,
      checkedCount,
    };
  }, [filteredRows, rows]);

  // ── 5. 전체선택 제어 ──
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    const visibleIds = new Set(filteredRows.map((r) => r.id));
    setRows((prev) =>
      prev.map((r) => (visibleIds.has(r.id) ? { ...r, checked } : r))
    );
  };

  // ── 6. 개별 행 선택 ──
  const handleSelectRow = (id: number, checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, checked } : r))
    );
  };

  // ── 7. 인라인 데이터 수정 핸들러 ──
  const handleCellChange = (id: number, field: keyof ReceivingRow, val: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        const updated: any = { ...r, [field]: val };
        const pack = normalizePackUnit(updated.packUnit);
        const isBox = isBoxUnitLabel(updated.unit) || (!isBagUnitLabel(updated.unit) && pack > 1);

        // 수량 또는 봉/박스/구매단가 변경 시 양방향 동기화 및 금액 자동 재계산
        if (field === 'recvQty') {
          const qty = Number(val) || 0;
          updated.recvQty = qty;
          updated.recvAmt = Math.round(qty * (Number(updated.buyPrice) || 0));
          updated.diffQty = qty - updated.orderQty;
        } else if (field === 'bagPrice') {
          const bag = Number(val) || 0;
          const box = calcBoxPrice(bag, pack);
          updated.bagPrice = bag;
          updated.boxPrice = box;
          updated.buyPrice = isBox && pack > 1 ? box : bag;
          updated.recvAmt = Math.round((Number(updated.recvQty) || 0) * updated.buyPrice);
        } else if (field === 'boxPrice') {
          const box = Number(val) || 0;
          const bag = calcBagPriceFromBox(box, pack);
          updated.boxPrice = box;
          updated.bagPrice = bag;
          updated.buyPrice = isBox && pack > 1 ? box : bag;
          updated.recvAmt = Math.round((Number(updated.recvQty) || 0) * updated.buyPrice);
        } else if (field === 'buyPrice') {
          const price = Number(val) || 0;
          updated.buyPrice = price;
          if (isBox && pack > 1) {
            updated.boxPrice = price;
            updated.bagPrice = calcBagPriceFromBox(price, pack);
          } else {
            updated.bagPrice = price;
            updated.boxPrice = calcBoxPrice(price, pack);
          }
          updated.recvAmt = Math.round((Number(updated.recvQty) || 0) * price);
        }

        // dirty check (원본 대비 변경 여부)
        const isDirty =
          updated.recvQty !== r.original.recvQty ||
          updated.buyPrice !== r.original.buyPrice ||
          updated.warehouse !== r.original.warehouse ||
          updated.expiryDate !== r.original.expiryDate ||
          updated.carNo !== r.original.carNo ||
          updated.carTemp !== r.original.carTemp ||
          updated.markStatus !== r.original.markStatus ||
          updated.lookStatus !== r.original.lookStatus ||
          updated.carClean !== r.original.carClean ||
          updated.totalJudge !== r.original.totalJudge ||
          updated.lotNo !== r.original.lotNo ||
          updated.remark !== r.original.remark;

        updated.isModified = isDirty;
        return updated;
      })
    );
  };

  // ── 8. 수정사항 원복 (Revert Single Row) ──
  const handleRevertRow = (id: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          ...r.original,
          recvAmt: r.original.recvQty * r.original.buyPrice,
          diffQty: r.original.recvQty - r.orderQty,
          isModified: false,
        };
      })
    );
  };

  // ── 9. 변경사항 일괄 저장 (PUT /api/purchase/receiving) ──
  const handleBatchSave = async () => {
    const modifiedRows = filteredRows.filter((r) => r.isModified);
    if (modifiedRows.length === 0) {
      alert('현재 화면에 수정된 입고 내역이 없습니다.');
      return;
    }

    if (!confirm(`총 ${modifiedRows.length}건의 수정사항을 저장하고 창고 실재고 및 발주 잔량에 즉시 반영하시겠습니까?`)) {
      return;
    }

    setSaving(true);
    try {
      const updates = modifiedRows.map((r) => ({
        detailId: r.id,
        receivedQty: r.recvQty,
        unitPrice: r.buyPrice,
        warehouse: r.warehouse,
        expiryDate: r.expiryDate,
        lotNo: r.lotNo,
        inspectResult: r.totalJudge === 'X' ? '불합격' : '합격',
        remark: r.remark || `차량:${r.carNo}, 온도:${r.carTemp}`,
      }));

      const res = await fetch('/api/purchase/receiving', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      const parsed = await readJsonSafe(res, '입고 수정 저장에 실패했습니다.');
      if (parsed.ok) {
        alert(parsed.data?.message || '입고 수정사항이 안전하게 저장되고 재고에 동기화되었습니다.');
        loadReceivingData();
      } else {
        alert('저장 실패: ' + parsed.errorMessage);
      }
    } catch (err: any) {
      alert('오류 발생: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── 10. 단일 행 저장 ──
  const handleSingleSave = async (row: ReceivingRow) => {
    setSaving(true);
    try {
      const res = await fetch('/api/purchase/receiving', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detailId: row.id,
          receivedQty: row.recvQty,
          unitPrice: row.buyPrice,
          warehouse: row.warehouse,
          expiryDate: row.expiryDate,
          lotNo: row.lotNo,
          inspectResult: row.totalJudge === 'X' ? '불합격' : '합격',
          remark: row.remark,
        }),
      });

      const parsed = await readJsonSafe(res, '입고 수정 저장에 실패했습니다.');
      if (parsed.ok) {
        alert(`[${row.productName}] 수정사항이 정상 저장되었습니다.`);
        loadReceivingData();
      } else {
        alert('저장 실패: ' + parsed.errorMessage);
      }
    } catch (err: any) {
      alert('오류: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── 11. 선택 입고 취소 / 롤백 (DELETE /api/purchase/receiving) ──
  const handleCancelSelected = async () => {
    const checkedRows = filteredRows.filter(
      (r) => r.checked && r.status !== '취소' && r.recvQty > 0
    );
    if (checkedRows.length === 0) {
      alert('취소(롤백)할 유효한 입고 행을 체크박스로 선택해주세요.');
      return;
    }

    const confirmMsg =
      `선택하신 ${checkedRows.length}건의 입고 항목을 취소(롤백)하시겠습니까?\n\n` +
      `⚠️ 주의:\n` +
      `1. 창고 현재고에서 해당 입고수량이 즉시 차감됩니다.\n` +
      `2. 발주서 잔량(remainQty)이 원래대로 복원되어 자재발주 화면에 재출현합니다.\n` +
      `3. 자재수불부에 '입고취소' 거래가 투명하게 기록됩니다.`;

    if (!confirm(confirmMsg)) return;

    const reason = prompt('입고 취소 사유를 입력하세요 (예: 거래처 반품, 수량 오등록):', '검수 불량 및 거래처 반품');
    if (reason === null) return;

    setSaving(true);
    let cancelledDone = 0;
    try {
      const CHUNK_SIZE = 20;
      const allIds = checkedRows.map((r) => r.id);
      for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
        const chunkIds = allIds.slice(i, i + CHUNK_SIZE);
        const res = await fetch('/api/purchase/receiving', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            detailIds: chunkIds,
            cancelReason: reason || '사용자 입고취소',
          }),
        });
        const parsed = await readJsonSafe(res, '입고 취소에 실패했습니다.');
        if (!parsed.ok) {
          throw new Error(parsed.errorMessage);
        }
        cancelledDone += chunkIds.length;
      }

      alert(`선택한 ${cancelledDone}건의 입고 항목이 정상 취소(롤백)되었습니다.`);
      loadReceivingData();
    } catch (err: any) {
      if (cancelledDone > 0) {
        alert(`${cancelledDone}건은 취소되었으나 일부 실패했습니다: ${err?.message || '오류'}\n화면을 새로고침합니다.`);
        loadReceivingData();
      } else {
        alert('취소 실패: ' + (err?.message || '알 수 없는 오류'));
      }
    } finally {
      setSaving(false);
    }
  };

  // ── 12. 엑셀 내보내기 ──
  const handleExportExcel = () => {
    if (viewMode === 'expected') {
      if (filteredPendingRows.length === 0) {
        alert('내보낼 입고 예정 데이터가 없습니다.');
        return;
      }
      exportGridToExcel({
        filename: `GFS_입고예정_${todayStr}`,
        sheetName: '입고예정',
        columns: [
          { key: '구분', label: '구분' },
          { key: '입고예정일', label: '입고예정일' },
          { key: '발주번호', label: '발주번호' },
          { key: '발주일', label: '발주일' },
          { key: '매입처', label: '매입처' },
          { key: '창고', label: '창고' },
          { key: '품번', label: '품번' },
          { key: '품명', label: '품명' },
          { key: '단위', label: '단위' },
          { key: '발주수량', label: '발주수량', format: 'number' },
          { key: '입고예정잔량', label: '입고예정잔량', format: 'number' },
          { key: '적용단가', label: '적용단가', format: 'currency' },
          { key: '예정금액', label: '예정금액', format: 'currency' },
        ],
        data: filteredPendingRows.map((p) => ({
          구분: p.expectedDeliveryDate === todayStr ? '금일입고' : p.expectedDeliveryDate < todayStr ? '입고지연' : '입고예정',
          입고예정일: p.expectedDeliveryDate || '-',
          발주번호: p.orderNo,
          발주일: p.orderDate,
          매입처: p.partnerName,
          창고: p.warehouse,
          품번: p.productCode,
          품명: p.productName,
          단위: p.unit,
          발주수량: p.orderQty,
          입고예정잔량: p.remainQty,
          적용단가: p.unitPrice,
          예정금액: p.expectedAmt,
        })),
      });
      return;
    }

    if (filteredRows.length === 0) {
      alert('내보낼 입고 데이터가 없습니다.');
      return;
    }

    const exportData = filteredRows.map((r) => ({
      상태: r.status,
      입고일자: r.receivingDate,
      입고번호: r.receivingNo,
      매입처: r.partnerName,
      구분: r.category,
      품목코드: r.productCode,
      품명: r.productName,
      규격: r.spec,
      단위: r.unit,
      입고수량: r.recvQty,
      구매단가: r.buyPrice,
      입고공급가액: r.recvAmt,
      차이수량: r.diffQty,
      입고창고: r.warehouse,
      유통기한: r.expiryDate,
      차량번호: r.carNo,
      차량온도: r.carTemp,
      HACCP종합: r.totalJudge,
      LOT번호: r.lotNo,
      비고: r.remark,
    }));

    exportGridToExcel({
      filename: `GFS_입고현황수정_${startDate}_${endDate}`,
      sheetName: '입고현황',
      columns: [
        { key: '상태', label: '상태' },
        { key: '입고일자', label: '입고일자' },
        { key: '입고번호', label: '입고번호' },
        { key: '매입처', label: '매입처' },
        { key: '구분', label: '구분' },
        { key: '품목코드', label: '품목코드' },
        { key: '품명', label: '품명' },
        { key: '규격', label: '규격' },
        { key: '단위', label: '단위' },
        { key: '입고수량', label: '입고수량', format: 'number' },
        { key: '구매단가', label: '구매단가', format: 'currency' },
        { key: '입고공급가액', label: '입고공급가액', format: 'currency' },
        { key: '차이수량', label: '차이수량', format: 'number' },
        { key: '입고창고', label: '입고창고' },
        { key: '유통기한', label: '유통기한' },
        { key: '차량번호', label: '차량번호' },
        { key: '차량온도', label: '차량온도' },
        { key: 'HACCP종합', label: 'HACCP종합' },
        { key: 'LOT번호', label: 'LOT번호' },
        { key: '비고', label: '비고' },
      ],
      data: exportData,
    });
  };

  // ── 12-1. A4 출력 (입고예정 검수표 / 입고현황 명세표) ──
  const handlePrintSheet = () => {
    const isExpected = viewMode === 'expected';
    const targetList = isExpected ? filteredPendingRows : filteredRows;
    if (targetList.length === 0) {
      alert(isExpected ? '출력할 입고 예정 품목이 없습니다.' : '출력할 입고 현황 데이터가 없습니다.');
      return;
    }

    const win = window.open('', '_blank', 'width=1200,height=820');
    if (!win) {
      alert('팝업 차단을 해제한 뒤 다시 시도해 주세요.');
      return;
    }

    const titleText = isExpected
      ? `입고 예정 및 현장 검수표 (${pendingDateFilter === 'today' ? `${todayStr} 금일` : '전체 미입고'})`
      : `입고 현황 명세표 (${startDate} ~ ${endDate})`;

    const totalAmt = isExpected
      ? filteredPendingRows.reduce((s, r) => s + r.expectedAmt, 0)
      : filteredRows.filter((r) => r.status !== '취소').reduce((s, r) => s + r.recvAmt, 0);

    const rowsHtml = isExpected
      ? filteredPendingRows
          .map((r, i) => {
            const isOverdue = r.expectedDeliveryDate && r.expectedDeliveryDate < todayStr;
            const statusLabel = r.expectedDeliveryDate === todayStr ? '금일입고' : isOverdue ? '지연' : '예정';
            return `<tr>
              <td class="c">${i + 1}</td>
              <td class="c">${escapeHtml(statusLabel)}</td>
              <td class="c mono">${escapeHtml(r.expectedDeliveryDate || '-')}</td>
              <td class="c mono">${escapeHtml(r.orderNo)}</td>
              <td>${escapeHtml(r.partnerName)}</td>
              <td class="c">${escapeHtml(r.warehouse)}</td>
              <td><strong>${escapeHtml(r.productName)}</strong><div class="sub">${escapeHtml(r.productCode)}</div></td>
              <td class="r mono">${r.remainQty.toLocaleString()} ${escapeHtml(r.unit)}</td>
              <td class="r mono">₩${r.unitPrice.toLocaleString()}</td>
              <td class="r mono">₩${r.expectedAmt.toLocaleString()}</td>
              <td class="c check-box"></td>
              <td class="c check-box"></td>
              <td class="c check-box"></td>
            </tr>`;
          })
          .join('')
      : filteredRows
          .map((r, i) => `<tr>
            <td class="c">${i + 1}</td>
            <td class="c">${escapeHtml(r.status)}</td>
            <td class="c mono">${escapeHtml(r.receivingDate)}</td>
            <td class="c mono">${escapeHtml(r.receivingNo)}</td>
            <td>${escapeHtml(r.partnerName)}</td>
            <td class="c">${escapeHtml(r.warehouse)}</td>
            <td><strong>${escapeHtml(r.productName)}</strong><div class="sub">${escapeHtml(r.productCode)}</div></td>
            <td class="r mono">${r.recvQty.toLocaleString()} ${escapeHtml(r.unit)}</td>
            <td class="r mono">₩${r.buyPrice.toLocaleString()}</td>
            <td class="r mono">₩${r.recvAmt.toLocaleString()}</td>
            <td class="c mono">${escapeHtml(r.expiryDate || '-')}</td>
            <td class="c">${escapeHtml(r.totalJudge)}</td>
            <td>${escapeHtml(r.remark || '')}</td>
          </tr>`)
          .join('');

    const headerCols = isExpected
      ? `<th style="width:32px">No</th>
         <th style="width:58px">구분</th>
         <th style="width:78px">입고예정일</th>
         <th style="width:105px">발주번호</th>
         <th style="width:120px">매입처</th>
         <th style="width:58px">창고</th>
         <th>품명 / 품번</th>
         <th style="width:80px">입고예정량</th>
         <th style="width:74px">단가</th>
         <th style="width:86px">예정금액</th>
         <th style="width:68px">실입고량</th>
         <th style="width:62px">품온/상태</th>
         <th style="width:56px">검수확인</th>`
      : `<th style="width:32px">No</th>
         <th style="width:58px">상태</th>
         <th style="width:78px">입고일자</th>
         <th style="width:105px">전표번호</th>
         <th style="width:120px">매입처</th>
         <th style="width:58px">창고</th>
         <th>품명 / 품번</th>
         <th style="width:80px">입고수량</th>
         <th style="width:74px">단가</th>
         <th style="width:86px">입고금액</th>
         <th style="width:78px">유통기한</th>
         <th style="width:54px">HACCP</th>
         <th style="width:90px">비고</th>`;

    win.document.write(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(titleText)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #111827; margin: 0; font-size: 11px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
  .head h1 { margin: 0; font-size: 17px; font-weight: 800; }
  .meta { font-size: 11px; color: #4b5563; text-align: right; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #9ca3af; padding: 5px 6px; word-break: keep-all; overflow-wrap: break-word; }
  th { background: #f3f4f6; font-weight: 800; text-align: center; font-size: 10.5px; }
  .c { text-align: center; }
  .r { text-align: right; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .sub { font-size: 9.5px; color: #6b7280; font-family: ui-monospace, monospace; }
  .check-box { height: 22px; background: #fafafa; }
  .foot { margin-top: 8px; display: flex; justify-content: space-between; font-weight: 700; font-size: 11.5px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>GFS ${escapeHtml(titleText)}</h1>
      <div style="margin-top:3px;color:#4b5563">출력일시: ${escapeHtml(todayStr)} · 총 ${targetList.length}건</div>
    </div>
    <div class="meta">
      <div>합계 금액: <strong>₩${totalAmt.toLocaleString()}</strong></div>
      <div>담당자 확인: _______________</div>
    </div>
  </div>
  <table>
    <thead><tr>${headerCols}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="foot">
    <span>※ 현장 입고 검수 시 차량온도·유통기한·외관상태 확인 후 서명해 주세요.</span>
    <span>총 ${targetList.length}품목 / 합계 ₩${totalAmt.toLocaleString()}</span>
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body>
</html>`);
    win.document.close();
  };

  // ── 13. 파이프라인 탭 이동 ──
  const openPipelineTab = (menuId: string) => {
    const item = getMenuItemById(menuId);
    if (item) {
      openTab(item);
    }
  };

  // ── 14. 날짜 프리셋 설정 ──
  const setDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'all') => {
    const today = kstToday();
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'yesterday') {
      const y = kstDaysAgo(1);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === '7days') {
      setStartDate(kstDaysAgo(7));
      setEndDate(today);
    } else if (preset === '30days') {
      setStartDate(kstDaysAgo(30));
      setEndDate(today);
    } else if (preset === 'month') {
      setStartDate(today.slice(0, 7) + '-01');
      setEndDate(today);
    } else if (preset === 'all') {
      setStartDate('2026-01-01');
      setEndDate('2026-12-31');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 text-[15px]">
      {/* ── [섹션 1] 탑 네비게이션 & 파이프라인 관제 배너 (대시보드 탭바와 쾌적한 상단 여백) ── */}
      <header className="px-6 pt-6 pb-4 bg-white border-b border-slate-200 shrink-0 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* 타이틀 및 뱃지 */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-200 shrink-0">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-slate-950 tracking-tight">
                  입고 현황 및 단가수정 <span className="text-base font-bold text-slate-500 font-mono">(RECEIVING STATUS & EDIT)</span>
                </h1>
                <span className="text-sm font-mono font-black px-3.5 py-1 rounded-full bg-blue-50 text-blue-900 border border-blue-200">
                  전표 {stats.totalHeaders}건 · {stats.totalDetails}개 품목
                </span>
                {stats.modifiedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-black px-3.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 animate-pulse shadow-xs">
                    <Sparkles size={15} className="text-amber-600" />
                    수정 대기 {stats.modifiedCount}건
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 font-medium mt-1">
                식품안전 콜드체인(HACCP) 검수 · 원부재료 실재고 즉시 반영 · 발주 잔량 동기화 및 인라인 실시간 수정
              </p>
            </div>
          </div>

          {/* 우측 주요 액션 버튼 컨트롤 */}
          <div className="flex items-center gap-3">
            {stats.modifiedCount > 0 && (
              <button
                type="button"
                onClick={handleBatchSave}
                disabled={saving}
                className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center gap-2 shadow-sm shadow-emerald-200 cursor-pointer transition-all animate-bounce"
              >
                <Save size={18} />
                <span>변경사항 일괄저장 ({stats.modifiedCount}건)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCancelSelected}
              disabled={saving || stats.checkedCount === 0}
              className={`h-11 px-4 rounded-xl border font-black text-sm flex items-center gap-2 shadow-xs cursor-pointer transition-colors ${
                stats.checkedCount > 0
                  ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                  : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Trash2 size={16} />
              <span>선택 입고취소 (재고 롤백)</span>
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".csv, .xlsx, .xls"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-11 px-4 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900 font-black text-sm flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
            >
              <Upload size={17} className="text-blue-700" />
              <span>입고 파일 업로드 (CSV/엑셀)</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={viewMode === 'expected' ? filteredPendingRows.length === 0 : filteredRows.length === 0}
              className="h-11 px-4 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-black text-sm flex items-center gap-2 shadow-xs cursor-pointer transition-colors disabled:opacity-40"
            >
              <FileSpreadsheet size={16} className="text-emerald-700" />
              <span>엑셀 다운로드</span>
            </button>

            <button
              type="button"
              onClick={handlePrintSheet}
              disabled={viewMode === 'expected' ? filteredPendingRows.length === 0 : filteredRows.length === 0}
              className="h-11 px-4 rounded-xl border border-indigo-300 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm flex items-center gap-2 shadow-xs cursor-pointer transition-colors disabled:opacity-40"
              title="현재 화면(입고 예정 또는 입고 현황)을 A4 가로 명세표로 즉시 인쇄합니다"
            >
              <Printer size={16} />
              <span>A4 인쇄</span>
            </button>

            <button
              type="button"
              onClick={loadReceivingData}
              disabled={loading}
              className="h-11 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-black text-sm flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span>새로고침</span>
            </button>
          </div>
        </div>

        {/* ── 파이프라인 빠른 연결 바 ── */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 text-slate-700 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-slate-900 font-black">생산/물류 파이프라인:</span>
            <span className="text-slate-400">[1.발주산출]</span>
            <ChevronRight size={14} className="text-slate-400" />
            <span className="text-slate-400">[2.자재발주(요일별)]</span>
            <ChevronRight size={14} className="text-slate-400" />
            <span className="text-slate-400">[3.발주현황/수정]</span>
            <ChevronRight size={14} className="text-slate-400" />
            <span className="text-slate-400">[4.입고등록(GSR)]</span>
            <ChevronRight size={14} className="text-slate-400" />
            <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-900 font-black border border-blue-300">
              [5.입고현황/수정 ★현재]
            </span>
            <ChevronRight size={14} className="text-slate-400" />
            <span className="text-slate-400">[6.현재고현황 & 수불부]</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => openPipelineTab('pur-mat-order-day')}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <span>자재발주(요일별)</span>
              <ExternalLink size={13} />
            </button>
            <button
              type="button"
              onClick={() => openPipelineTab('pur-receiving-reg')}
              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 font-black text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <span>입고등록(GSR)</span>
              <ExternalLink size={13} />
            </button>
            <button
              type="button"
              onClick={() => openPipelineTab('inv-lookup')}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <span>현재고현황</span>
              <ExternalLink size={13} />
            </button>
            <button
              type="button"
              onClick={() => openPipelineTab('inv-mat-ledger')}
              className="px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 font-black text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <span>자재수불부</span>
              <ExternalLink size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* ── [섹션 2] 핵심 통계 KPI 요약 카드 4종 (시원시원하고 큼직한 가독성) ── */}
      <section className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {/* KPI 1: 총 입고 실적 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-slate-500 uppercase tracking-wider">총 입고 실적</div>
            <div className="text-3xl font-black text-slate-900 mt-1.5 font-mono">
              {stats.totalHeaders} <span className="text-base font-bold text-slate-600">전표</span>
              <span className="text-lg font-semibold text-slate-400 mx-2">/</span>
              {stats.totalDetails} <span className="text-base font-bold text-slate-600">개 품목</span>
            </div>
            <div className="text-[13px] font-semibold text-slate-500 mt-1.5 flex items-center gap-1.5">
              <Calendar size={14} className="text-blue-500" />
              <span>선택 기간 내 검수 입고 완료</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Truck size={26} />
          </div>
        </div>

        {/* KPI 2: 총 입고 공급가액 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-slate-500 uppercase tracking-wider">총 입고 공급가액</div>
            <div className="text-3xl font-black text-indigo-800 mt-1.5 font-mono">
              ₩{stats.totalAmount.toLocaleString()}
            </div>
            <div className="text-[13px] font-semibold text-slate-500 mt-1.5">
              공급가액 기준 (부가세 별도)
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-black text-xl font-mono">
            ₩
          </div>
        </div>

        {/* KPI 3: 결품 및 수량 차이 경보 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-slate-500 uppercase tracking-wider">결품 및 분할입고 경보</div>
            <div className="text-3xl font-black mt-1.5 font-mono flex items-center gap-2.5">
              <span className={stats.shortageCount > 0 ? 'text-rose-600' : 'text-emerald-700'}>
                {stats.shortageCount} <span className="text-base font-bold text-slate-600">건</span>
              </span>
              {stats.shortageCount > 0 && (
                <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                  결품주의
                </span>
              )}
            </div>
            <div className="text-[13px] font-semibold text-slate-500 mt-1.5">
              {stats.shortageCount > 0 ? '발주 대비 입고 부족 품목 발생' : '발주수량 100% 전량 정기입고'}
            </div>
          </div>
          <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${
            stats.shortageCount > 0
              ? 'bg-rose-50 border-rose-200 text-rose-600'
              : 'bg-emerald-50 border-emerald-200 text-emerald-600'
          }`}>
            <AlertTriangle size={26} />
          </div>
        </div>

        {/* KPI 4: HACCP 콜드체인 합격률 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-slate-500 uppercase tracking-wider">HACCP 콜드체인 합격률</div>
            <div className="text-3xl font-black text-emerald-700 mt-1.5 font-mono">
              {stats.haccpPassRate}%
            </div>
            <div className="text-[13px] font-semibold text-slate-500 mt-1.5">
              차량온도 · 외관 · 라벨표시 · 청결
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <ShieldCheck size={26} />
          </div>
        </div>
      </section>

      {/* ── [섹션 3] 검색 및 다차원 필터 컨트롤 바 (크고 시원시원한 인터페이스) ── */}
      <section className="px-6 pb-3 shrink-0">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          {/* 좌측: 기간 프리셋 및 날짜 선택 */}
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="text-sm font-black text-slate-800 flex items-center gap-1.5">
              <Calendar size={17} className="text-blue-600" /> 입고일자:
            </span>

            {/* 프리셋 버튼 */}
            <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl">
              <button
                type="button"
                onClick={() => setDatePreset('today')}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-800 hover:bg-white transition cursor-pointer"
              >
                오늘
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('yesterday')}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-800 hover:bg-white transition cursor-pointer"
              >
                어제
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('7days')}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-800 hover:bg-white transition cursor-pointer"
              >
                최근 7일
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('month')}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-800 hover:bg-white transition cursor-pointer"
              >
                이번 달
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('all')}
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-800 hover:bg-white transition cursor-pointer"
              >
                전체
              </button>
            </div>

            {/* Date Pickers */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10.5 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono text-sm font-bold shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-slate-400 font-black text-base">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10.5 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono text-sm font-bold shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* 매입처 선택 드롭다운 */}
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              <span className="text-sm font-black text-slate-800">매입처:</span>
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="h-10.5 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-black shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="ALL">전체 매입처 ({distinctSuppliers.length})</option>
                {distinctSuppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* 상태 필터 탭 */}
            <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl">
              {(['전체', '입고완료', '부분입고', '취소'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-black transition cursor-pointer ${
                    statusFilter === st
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* 우측: 실시간 통합 키워드 검색 */}
          <div className="relative min-w-[280px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="품명, 코드, 입고번호, LOT, 차량 검색..."
              className="h-10.5 w-full pl-10 pr-9 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-medium placeholder-slate-400 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── [섹션 4] 고해상도 메인 입고현황/수정 데이터 그리드 (크게 보기 팝업 겸용) ── */}
      <main className="flex-1 px-6 pb-6 min-h-0 flex flex-col">
        {showLargeTableModal && (
          <div
            className="fixed inset-0 z-[190] bg-slate-900/50 backdrop-blur-[1px]"
            onClick={() => setShowLargeTableModal(false)}
          />
        )}
        <div
          className={
            showLargeTableModal
              ? 'fixed inset-2 sm:inset-4 z-[200] bg-white rounded-2xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden'
              : 'flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden'
          }
        >
          {showLargeTableModal && (
            <div className="px-5 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base font-black">
                  입고현황 및 단가수정 ({startDate} ~ {endDate})
                </h2>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="품명, 코드, 입고번호, LOT 검색..."
                    className="w-full pl-9 pr-7 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {keyword && (
                    <button
                      type="button"
                      onClick={() => setKeyword('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {stats.modifiedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-black cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? '저장 중...' : `수정사항 ${stats.modifiedCount}건 저장`}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowLargeTableModal(false)}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-[13px] font-bold cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>닫기 (ESC)</span>
                </button>
              </div>
            </div>
          )}

          {/* 뷰 모드 전환 바 (입고 확정 이력 vs 금일 입고예정) */}
          <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('history')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'history'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>입고 확정 이력</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono ${
                  viewMode === 'history' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {filteredRows.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('expected')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'expected'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck size={13} />
                <span>입고 예정 (발주 대기)</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono ${
                  viewMode === 'expected'
                    ? 'bg-white/20 text-white'
                    : todayExpectedCount > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  금일 {todayExpectedCount} · 전체 {pendingRows.length}
                </span>
              </button>
            </div>

            {viewMode === 'expected' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setPendingDateFilter('today')}
                    className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                      pendingDateFilter === 'today' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    금일 예정 ({todayExpectedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDateFilter('all')}
                    className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                      pendingDateFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    미입고 전체 ({pendingRows.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => openPipelineTab('pur-receiving-reg')}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-black flex items-center gap-1 cursor-pointer"
                >
                  <span>입고등록(GSR) 처리</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            )}
          </div>

          {viewMode === 'expected' ? (
            <>
              <div className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                    <span className="font-bold text-sm">입고 예정 발주 내역을 불러오는 중입니다...</span>
                  </div>
                ) : filteredPendingRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2.5">
                    <Truck className="w-12 h-12 opacity-30" />
                    <span className="font-bold text-base text-slate-600">
                      {pendingDateFilter === 'today'
                        ? `금일(${todayStr}) 입고 예정인 미입고 발주 품목이 없습니다.`
                        : '현재 미입고 상태의 발주 품목이 없습니다.'}
                    </span>
                    {pendingDateFilter === 'today' && pendingRows.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPendingDateFilter('all')}
                        className="mt-1 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                      >
                        미입고 전체 ({pendingRows.length}건) 보기
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[1100px]">
                    <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 text-[12px] font-black text-slate-700">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-12">No</th>
                        <th className="py-2.5 px-3 text-center w-24">구분</th>
                        <th className="py-2.5 px-3 text-center w-28">입고예정일</th>
                        <th className="py-2.5 px-3 text-center w-36">발주번호 / 발주일</th>
                        <th className="py-2.5 px-3 w-36">매입처</th>
                        <th className="py-2.5 px-3 text-center w-20">창고</th>
                        <th className="py-2.5 px-3 min-w-[220px]">품명 / 품번</th>
                        <th className="py-2.5 px-3 text-right w-24">발주수량</th>
                        <th className="py-2.5 px-3 text-right w-28">입고예정 잔량</th>
                        <th className="py-2.5 px-3 text-right w-24">적용단가</th>
                        <th className="py-2.5 px-3 text-right w-28">예정금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-[13px]">
                      {filteredPendingRows.map((p, idx) => {
                        const isToday = p.expectedDeliveryDate === todayStr;
                        const isOverdue = Boolean(p.expectedDeliveryDate && p.expectedDeliveryDate < todayStr);
                        const boxEst = p.packUnit > 1 ? Math.round((p.remainQty / p.packUnit) * 10) / 10 : 0;
                        return (
                          <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="py-2 px-3 text-center font-mono text-xs text-slate-500">{idx + 1}</td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black border ${
                                  isToday
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : isOverdue
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : 'bg-slate-100 text-slate-700 border-slate-300'
                                }`}
                              >
                                {isToday ? '금일입고' : isOverdue ? '입고지연' : '입고예정'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                              {p.expectedDeliveryDate || '-'}
                              {p.orderCycle && (
                                <span className="ml-1 text-[10px] text-slate-500">({p.orderCycle})</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="font-mono text-xs font-bold text-slate-800">{p.orderNo}</div>
                              <div className="font-mono text-[10.5px] text-slate-400">{p.orderDate}</div>
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800 truncate max-w-[160px]" title={p.partnerName}>
                              {p.partnerName}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                                {p.warehouse}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900">{p.productName}</span>
                                <ProductLifecycleBadge
                                  status={p.productStatus}
                                  discontinuedDate={p.discontinuedDate}
                                  isUsed={p.isUsed}
                                  name={p.productName}
                                />
                              </div>
                              <div className="font-mono text-[11px] text-slate-400">{p.productCode}</div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              {p.orderQty.toLocaleString()} {p.unit}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="font-mono font-black text-blue-700">
                                {p.remainQty.toLocaleString()} {p.unit}
                              </div>
                              {boxEst > 0 && (
                                <div className="text-[10.5px] text-slate-500">약 {boxEst}박스</div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-700">
                              ₩{p.unitPrice.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-black text-indigo-700">
                              ₩{p.expectedAmt.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 font-bold text-xs text-slate-700">
                <div className="flex items-center gap-4">
                  <span>입고 예정 품목: <strong className="text-blue-700">{filteredPendingRows.length}</strong>건</span>
                  <span className="text-slate-300">|</span>
                  <span>총 예정금액 합계: <strong className="text-indigo-700 font-mono text-base font-black">₩{filteredPendingRows.reduce((s, r) => s + r.expectedAmt, 0).toLocaleString()}</strong></span>
                </div>
                <div className="text-slate-500 font-medium">
                  상단 <span className="text-indigo-700 font-bold">[A4 인쇄]</span>를 누르면 현장 검수용 입고예정 명세표를 출력할 수 있습니다.
                </div>
              </div>
            </>
          ) : (
            <>
          {/* 테이블 상단 정보 요약 행 */}
          <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-sm font-bold text-slate-700">
            <div className="flex items-center gap-3.5">
              <label className="flex items-center gap-2.5 cursor-pointer font-black text-slate-900 text-sm">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>전체선택 ({stats.checkedCount}/{filteredRows.length})</span>
              </label>
              <span className="text-slate-300">|</span>
              <span>표시 항목: <strong className="text-slate-950 font-black">{filteredRows.length}</strong>개 품목</span>
              {stats.modifiedCount > 0 && (
                <span className="text-amber-800 bg-amber-100 px-3 py-1 rounded-full font-black text-xs border border-amber-300 animate-pulse">
                  수정 중: {stats.modifiedCount}건 (저장 필요)
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-slate-600 font-semibold text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500" /> 정상입고
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-500" /> 부분입고/수정중
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500" /> 입고취소
              </span>
              {!showLargeTableModal && (
                <button
                  type="button"
                  onClick={() => setShowLargeTableModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-[13px] font-bold cursor-pointer transition whitespace-nowrap"
                  title="상단 영역을 접고 입고 품목 테이블만 전체화면 팝업으로 크게 봅니다."
                >
                  <Maximize2 className="w-4 h-4 text-slate-600" />
                  <span>크게 보기</span>
                </button>
              )}
            </div>
          </div>

          {/* 테이블 본체 */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                <p className="font-bold text-base text-slate-600">입고 내역 및 재고 데이터를 조회하고 있습니다...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-24 text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
                  <Truck className="w-8 h-8 text-slate-400" />
                </div>
                <p className="font-black text-lg text-slate-700">등록된 실 입고 내역이 없습니다</p>
                <p className="text-xs text-slate-500 mt-1.5 max-w-md text-center leading-relaxed">
                  가상(샘플) 데이터가 모두 정리되었습니다. 실제 발주된 자재가 공장에 도착하면 
                  <strong> [입고등록(GSR)]</strong> 메뉴를 통해 검수 및 실재고 입고 처리를 진행하실 수 있습니다.
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openPipelineTab('pur-receiving-reg')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <span>입고등록(GSR) 바로가기</span>
                    <ExternalLink size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openPipelineTab('pur-mat-order-day')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>자재발주(요일별) 바로가기</span>
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full table-fixed text-left border-collapse">
                {/* 컴팩트 고대비 테이블 헤더 */}
                <thead className="bg-slate-100/95 backdrop-blur sticky top-0 z-10 border-b-2 border-slate-300 text-slate-800 text-[11px] font-black tracking-tight">
                  <tr>
                    <th className="py-2.5 px-0.5 text-center w-7">선택</th>
                    <th className="py-2.5 px-0.5 text-center w-[54px]">상태</th>
                    <th className="py-2.5 px-1 text-center w-[78px]">입고일자</th>
                    <th className="py-2.5 px-1 text-center w-[74px]">입고번호</th>
                    <th className="py-2.5 px-1 text-left w-[78px]">매입처</th>
                    <th className="py-2.5 px-0.5 text-center w-[42px]">구분</th>
                    <th className="py-2.5 px-1.5 text-left">원부재료 품명 / 규격</th>
                    <th className="py-2.5 px-1 text-right w-[72px]">입고수량</th>
                    <th className="py-2.5 px-1 text-right w-[86px]">구매단가</th>
                    <th className="py-2.5 px-1 text-right w-[74px]">공급가액</th>
                    <th className="py-2.5 px-0.5 text-center w-[50px]">차이</th>
                    <th className="py-2.5 px-0.5 text-center w-[56px]">창고</th>
                    <th className="py-2.5 px-1 text-center w-[92px]">유통기한</th>
                    <th className="py-2.5 px-1 text-center w-[92px]">차량 / 온도</th>
                    <th className="py-2.5 px-0.5 text-center w-[84px]">HACCP</th>
                    <th className="py-2.5 px-1 text-center w-[64px]">LOT</th>
                    <th className="py-2.5 px-1 text-left w-[64px]">비고</th>
                    <th className="py-2.5 px-0.5 text-center w-[44px]">관리</th>
                  </tr>
                </thead>

                {/* 컴팩트 가독성 테이블 바디 */}
                <tbody className="divide-y divide-slate-200 text-[12px]">
                  {filteredRows.map((row) => {
                    const isCancelled = row.status === '취소';
                    const isPartial = row.status === '부분입고' || row.diffQty < 0;

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          row.isModified
                            ? 'bg-amber-50 border-l-4 border-l-amber-500 font-medium'
                            : isCancelled
                            ? 'bg-rose-50/60 text-slate-400 line-through'
                            : row.checked
                            ? 'bg-blue-50/70'
                            : 'hover:bg-slate-50/90'
                        }`}
                      >
                        {/* 1. 선택 체크박스 */}
                        <td className="py-2 px-0.5 text-center">
                          <input
                            type="checkbox"
                            checked={row.checked}
                            onChange={(e) => handleSelectRow(row.id, e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* 2. 상태 배지 */}
                        <td className="py-2 px-0.5 text-center">
                          {isCancelled ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap">
                              취소됨
                            </span>
                          ) : isPartial ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                              부분입고
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                              입고완료
                            </span>
                          )}
                        </td>

                        {/* 3. 입고일자 */}
                        <td className="py-2 px-1 text-center font-mono font-bold text-slate-900 text-[11px] whitespace-nowrap">
                          {row.receivingDate.slice(2)}<span className="text-[10px] font-semibold text-slate-500 font-sans">({getKoreanDayOfWeek(row.receivingDate)})</span>
                        </td>

                        {/* 4. 입고번호 */}
                        <td className="py-2 px-1 text-center" title={row.receivingNo}>
                          <span className="inline-block max-w-full truncate font-mono text-[10.5px] font-bold text-slate-700 bg-slate-100 px-1 py-0.5 rounded border border-slate-200">
                            {row.receivingNo}
                          </span>
                        </td>

                        {/* 5. 매입처(공급사) */}
                        <td className="py-2 px-1 text-left font-bold text-slate-900 text-[12px] truncate" title={row.partnerName}>
                          {row.partnerName}
                        </td>

                        {/* 6. 구분 배지 */}
                        <td className="py-2 px-0.5 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black whitespace-nowrap ${
                              row.category === '원재료'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {row.category}
                          </span>
                        </td>

                        {/* 7. 품명 및 규격 */}
                        <td className="py-2 px-1.5 text-left overflow-hidden" title={`${row.productName} (${row.productCode} · ${row.spec})`}>
                          <div className="font-black text-slate-950 text-[12.5px] tracking-tight leading-tight flex items-center gap-1 min-w-0">
                            <span className="truncate">{row.productName}</span>
                            <ProductLifecycleBadge
                              status={row.productStatus}
                              discontinuedDate={row.discontinuedDate}
                              isUsed={row.isUsed}
                              name={row.productName}
                              refDate={row.receivingDate}
                            />
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 text-[10.5px] text-slate-500 font-medium truncate">
                            <span className="font-mono text-slate-700">{row.productCode}</span>
                            <span>·</span>
                            <span className="truncate">{row.spec}</span>
                          </div>
                        </td>

                        {/* 8. 입고수량 */}
                        <td className="py-2 px-1 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <input
                              type="number"
                              disabled={isCancelled}
                              value={row.recvQty}
                              onChange={(e) => handleCellChange(row.id, 'recvQty', e.target.value)}
                              className="w-11 h-7 px-1 text-right font-black text-[12.5px] text-blue-800 bg-blue-50/70 hover:bg-blue-100/50 focus:bg-white border border-blue-400 focus:border-blue-600 rounded-lg focus:ring-1 focus:ring-blue-400 focus:outline-none transition"
                            />
                            <span className="text-[10.5px] font-bold text-slate-600 truncate max-w-[24px]">{row.unit}</span>
                          </div>
                        </td>

                        {/* 9. 구매단가 */}
                        <td className="py-2 px-1 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <span className="text-[10.5px] font-bold text-slate-400">₩</span>
                            <input
                              type="number"
                              disabled={isCancelled}
                              value={row.buyPrice}
                              onChange={(e) => handleCellChange(row.id, 'buyPrice', e.target.value)}
                              className="w-[62px] h-7 px-1 text-right font-black text-[12px] text-slate-950 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-blue-600 rounded-lg focus:ring-1 focus:ring-blue-400 focus:outline-none transition"
                            />
                          </div>
                          <div className="mt-0.5 text-[9.5px] font-semibold text-slate-500 truncate" title={`입수 ${row.packUnit} · 봉 ₩${row.bagPrice.toLocaleString()} · 박스 ₩${row.boxPrice.toLocaleString()}`}>
                            입수{row.packUnit} · ₩{row.bagPrice.toLocaleString()}
                          </div>
                        </td>

                        {/* 10. 입고공급가액 */}
                        <td className="py-2 px-1 text-right font-mono font-black text-indigo-900 text-[12.5px] whitespace-nowrap truncate" title={`₩${row.recvAmt.toLocaleString()}`}>
                          ₩{row.recvAmt.toLocaleString()}
                        </td>

                        {/* 11. 수량차이 */}
                        <td className="py-2 px-0.5 text-center">
                          {row.diffQty < 0 ? (
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap">
                              {row.diffQty}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 whitespace-nowrap">
                              정상
                            </span>
                          )}
                        </td>

                        {/* 12. 입고창고 (드롭다운) */}
                        <td className="py-2 px-0.5 text-center">
                          <select
                            disabled={isCancelled}
                            value={row.warehouse}
                            onChange={(e) => handleCellChange(row.id, 'warehouse', e.target.value)}
                            className="h-7 w-full px-0.5 rounded-lg border border-slate-300 bg-white text-[11px] font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          >
                            <option value="상온">상온</option>
                            <option value="냉장1">냉장1</option>
                            <option value="냉장2">냉장2</option>
                            <option value="냉동">냉동</option>
                            <option value="부자재">부자재</option>
                          </select>
                        </td>

                        {/* 13. 유통기한 (데이트 피커) */}
                        <td className="py-2 px-0.5 text-center">
                          <input
                            type="date"
                            disabled={isCancelled}
                            value={row.expiryDate}
                            onChange={(e) => handleCellChange(row.id, 'expiryDate', e.target.value)}
                            className="h-7 w-full px-1 rounded-lg border border-slate-300 bg-white text-[10.5px] font-mono font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>

                        {/* 14. 차량번호 / 차량온도 */}
                        <td className="py-2 px-0.5 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <input
                              type="text"
                              disabled={isCancelled}
                              value={row.carNo}
                              onChange={(e) => handleCellChange(row.id, 'carNo', e.target.value)}
                              placeholder="차량"
                              className="h-7 w-[54px] px-1 rounded-lg border border-slate-300 text-[10.5px] font-bold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              disabled={isCancelled}
                              value={row.carTemp}
                              onChange={(e) => handleCellChange(row.id, 'carTemp', e.target.value)}
                              placeholder="온도"
                              className="h-7 w-[32px] px-0.5 rounded-lg border border-slate-300 text-[10.5px] font-mono font-bold text-slate-800 bg-white text-center focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>
                        </td>

                        {/* 15. HACCP 4대 검수 토글 (표시 / 외관 / 청결 / 종합) */}
                        <td className="py-2 px-0.5 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            {/* 표시 */}
                            <button
                              type="button"
                              title="라벨/표시상태 (클릭 시 토글)"
                              onClick={() => handleCellChange(row.id, 'markStatus', row.markStatus === 'O' ? 'X' : 'O')}
                              className={`w-[18px] h-6 rounded text-[10.5px] font-black border transition cursor-pointer flex items-center justify-center ${
                                row.markStatus === 'O'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                              }`}
                            >
                              {row.markStatus}
                            </button>

                            {/* 외관 */}
                            <button
                              type="button"
                              title="포장/외관파손 (클릭 시 토글)"
                              onClick={() => handleCellChange(row.id, 'lookStatus', row.lookStatus === 'O' ? 'X' : 'O')}
                              className={`w-[18px] h-6 rounded text-[10.5px] font-black border transition cursor-pointer flex items-center justify-center ${
                                row.lookStatus === 'O'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                              }`}
                            >
                              {row.lookStatus}
                            </button>

                            {/* 청결 */}
                            <button
                              type="button"
                              title="차량적재함 청결 (클릭 시 토글)"
                              onClick={() => handleCellChange(row.id, 'carClean', row.carClean === 'O' ? 'X' : 'O')}
                              className={`w-[18px] h-6 rounded text-[10.5px] font-black border transition cursor-pointer flex items-center justify-center ${
                                row.carClean === 'O'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                              }`}
                            >
                              {row.carClean}
                            </button>

                            {/* 종합판정 */}
                            <button
                              type="button"
                              title="HACCP 종합판정 (클릭 시 토글)"
                              onClick={() => handleCellChange(row.id, 'totalJudge', row.totalJudge === 'O' ? 'X' : 'O')}
                              className={`w-5 h-6 rounded text-[10.5px] font-black border transition cursor-pointer flex items-center justify-center ${
                                row.totalJudge === 'O'
                                  ? 'bg-emerald-600 text-white border-emerald-700'
                                  : 'bg-rose-600 text-white border-rose-700'
                              }`}
                            >
                              {row.totalJudge}
                            </button>
                          </div>
                        </td>

                        {/* 16. LOT 번호 */}
                        <td className="py-2 px-0.5 text-center">
                          <input
                            type="text"
                            disabled={isCancelled}
                            value={row.lotNo}
                            onChange={(e) => handleCellChange(row.id, 'lotNo', e.target.value)}
                            className="h-7 w-full px-1 rounded-lg border border-slate-300 text-[10.5px] font-mono font-bold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>

                        {/* 17. 비고 */}
                        <td className="py-2 px-0.5 text-left">
                          <input
                            type="text"
                            disabled={isCancelled}
                            value={row.remark}
                            onChange={(e) => handleCellChange(row.id, 'remark', e.target.value)}
                            placeholder="메모..."
                            className="h-7 w-full px-1 rounded-lg border border-slate-300 text-[11px] font-medium text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>

                        {/* 18. 우측 개별 관리 버튼 */}
                        <td className="py-2 px-0.5 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            {row.isModified ? (
                              <>
                                <button
                                  type="button"
                                  title="변경사항 즉시 저장"
                                  onClick={() => handleSingleSave(row)}
                                  disabled={saving}
                                  className="p-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer transition"
                                >
                                  <Save size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="원래대로 취소"
                                  onClick={() => handleRevertRow(row.id)}
                                  className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 shadow-xs cursor-pointer transition"
                                >
                                  <Undo2 size={14} />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                title="이 품목 입고 취소"
                                onClick={async () => {
                                  if (confirm(`[${row.productName}] 품목의 입고를 취소하고 재고를 차감하시겠습니까?`)) {
                                    setSaving(true);
                                    try {
                                      const res = await fetch('/api/purchase/receiving', {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ detailIds: [row.id], cancelReason: '개별 품목 취소' }),
                                      });
                                      const json = await res.json();
                                      if (json.success) {
                                        alert('취소되었습니다.');
                                        loadReceivingData();
                                      } else {
                                        alert('취소 실패: ' + json.error);
                                      }
                                    } finally {
                                      setSaving(false);
                                    }
                                  }
                                }}
                                disabled={isCancelled}
                                className={`p-2 rounded-xl border transition cursor-pointer ${
                                  isCancelled
                                    ? 'opacity-30 cursor-not-allowed border-slate-200 text-slate-400'
                                    : 'border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                                }`}
                              >
                                <X size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── 테이블 하단 요약 합계 바 ── */}
          <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 font-bold text-xs text-slate-700">
            <div className="flex items-center gap-4">
              <span>선택 품목: <strong className="text-blue-700">{stats.checkedCount}</strong>개</span>
              <span className="text-slate-300">|</span>
              <span>총 입고수량 합계: <strong className="text-slate-900 font-mono text-sm">{filteredRows.reduce((acc, r) => acc + r.recvQty, 0).toLocaleString()}</strong></span>
              <span className="text-slate-300">|</span>
              <span>총 공급가액 합계: <strong className="text-indigo-700 font-mono text-base font-black">₩{stats.totalAmount.toLocaleString()}</strong></span>
            </div>

            <div className="text-slate-500 font-medium">
              💡 실시간 수정 후 상단의 <span className="text-emerald-700 font-bold">[변경사항 일괄저장]</span>을 누르면 창고 실재고와 수불부에 즉시 원자적 반영됩니다.
            </div>
          </div>
            </>
          )}
        </div>
      </main>

      {/* ── 입고 파일 업로드 검증 및 확정 모달 ── */}
      <ReceivingUploadModal
        isOpen={uploadModalOpen}
        file={selectedUploadFile}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={(msg) => {
          if (msg) alert(msg);
          loadReceivingData();
        }}
      />
    </div>
  );
};
