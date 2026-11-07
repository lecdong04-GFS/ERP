'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Save,
  RotateCcw,
  FileSpreadsheet,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  Calendar,
  Layers,
  ArrowUpDown,
  TrendingDown,
  TrendingUp,
  HelpCircle,
  FileText,
  X,
  Clock,
  Sparkles,
  ChevronRight,
  Filter,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { InventoryActionBar } from '@/components/inventory/common/InventoryActionBar';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { exportGridToExcel } from '@/lib/excelExport';

// 실사 품목 인터페이스
interface StocktakeItem {
  id: number;
  recordId: number | null;
  no: number;
  warehouse: string;
  category: string;
  supplier: string;
  supplierId?: string;
  itemCode: string;
  itemName: string;
  spec?: string;
  unit: string;
  leadTime: string;
  expiryDate: string;
  lotNo: string;
  boxUnitQty: number;
  unitPrice: number;
  bookQty: number; // 장부수량
  boxQty: number; // 실사 박스
  pieceQty: number; // 실사 낱개
  currentStock: number; // 실사수량 = boxQty * boxUnitQty + pieceQty
  actualQty: number;
  diffQty: number; // 차이수량 = 실사 - 장부
  bookAmount: number;
  actualAmount: number;
  diffAmount: number;
  amount: number;
  adjustReason: string;
  status: string; // '대기' | '미확정' | '확정'
  remark: string;
}

const AUDIT_SHEETS = ['냉장1', '냉장2', '냉동', '상온', '부자재'];

function kstToday(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export const RawMatStocktakeView: React.FC = () => {
  // ── 검색 및 필터 상태 ──
  const [stockDate, setStockDate] = useState<string>(() => kstToday());
  const [activeTab, setActiveTab] = useState<string>('전체');
  const [diffFilter, setDiffFilter] = useState<'ALL' | 'DIFF' | 'MATCH' | 'SHORTAGE' | 'SURPLUS'>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // ── 데이터 상태 ──
  const [rows, setRows] = useState<StocktakeItem[]>([]);
  const [initialRows, setInitialRows] = useState<StocktakeItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // ── 엑셀 업로드 모달 상태 ──
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadPreview, setUploadPreview] = useState<{
    totalParsed: number;
    matchedCount: number;
    diffCount: number;
    items: Array<{
      itemCode: string;
      itemName: string;
      warehouse: string;
      prevActual: number;
      newActual: number;
      diff: number;
    }>;
    parsedRows: Partial<StocktakeItem>[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── 1. 데이터 로드 ──
  const loadStocktakeData = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/inventory/stocktake?stocktakeDate=${stockDate}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRows(json.data);
        setInitialRows(JSON.parse(JSON.stringify(json.data)));
      } else {
        setStatusMessage({ type: 'error', text: json.error || '데이터 조회에 실패했습니다.' });
      }
    } catch (err: any) {
      console.error('Failed to load stocktake:', err);
      setStatusMessage({ type: 'error', text: err.message || '네트워크 오류가 발생했습니다.' });
    } finally {
      setIsLoading(false);
    }
  }, [stockDate]);

  useEffect(() => {
    loadStocktakeData();
  }, [loadStocktakeData]);

  // ── 2. 수량 변경 핸들러 (박스/낱개) ──
  const handleBoxChange = (id: number, val: string) => {
    const box = Math.max(0, Number(val) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const actualQty = Math.round((box * r.boxUnitQty + r.pieceQty) * 100) / 100;
          const diffQty = Math.round((actualQty - r.bookQty) * 100) / 100;
          const actualAmount = Math.round(actualQty * r.unitPrice);
          const diffAmount = Math.round(diffQty * r.unitPrice);
          return {
            ...r,
            boxQty: box,
            currentStock: actualQty,
            actualQty,
            diffQty,
            actualAmount,
            amount: actualAmount,
            diffAmount,
            status: r.status === '확정' ? '미확정' : r.status,
            adjustReason:
              diffQty !== 0
                ? diffQty < 0
                  ? '자연감모/손실'
                  : '재고잉여'
                : '정기실사일치',
          };
        }
        return r;
      })
    );
  };

  const handlePieceChange = (id: number, val: string) => {
    const piece = Math.max(0, Number(val) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const actualQty = Math.round((r.boxQty * r.boxUnitQty + piece) * 100) / 100;
          const diffQty = Math.round((actualQty - r.bookQty) * 100) / 100;
          const actualAmount = Math.round(actualQty * r.unitPrice);
          const diffAmount = Math.round(diffQty * r.unitPrice);
          return {
            ...r,
            pieceQty: piece,
            currentStock: actualQty,
            actualQty,
            diffQty,
            actualAmount,
            amount: actualAmount,
            diffAmount,
            status: r.status === '확정' ? '미확정' : r.status,
            adjustReason:
              diffQty !== 0
                ? diffQty < 0
                  ? '자연감모/손실'
                  : '재고잉여'
                : '정기실사일치',
          };
        }
        return r;
      })
    );
  };

  // ── 3. 기타 필드 변경 (유통기한, 비고/조정사유) ──
  const handleFieldChange = (id: number, field: 'expiryDate' | 'adjustReason' | 'remark', value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  // ── 4. 장부재고 일괄 채우기 ──
  const handleFillBookStockAll = () => {
    if (!window.confirm('현재 화면의 모든 품목 실사수량을 장부재고와 동일하게 일괄 채우시겠습니까?')) {
      return;
    }
    setRows((prev) =>
      prev.map((r) => {
        const boxUnit = r.boxUnitQty || 1;
        const box = boxUnit > 0 ? Math.floor(r.bookQty / boxUnit) : 0;
        const piece = boxUnit > 0 ? Math.round((r.bookQty % boxUnit) * 10) / 10 : 0;
        return {
          ...r,
          boxQty: box,
          pieceQty: piece,
          currentStock: r.bookQty,
          actualQty: r.bookQty,
          diffQty: 0,
          actualAmount: r.bookAmount,
          amount: r.bookAmount,
          diffAmount: 0,
          adjustReason: '정기실사일치',
        };
      })
    );
    setStatusMessage({ type: 'info', text: '모든 품목의 실사수량이 장부재고로 채워졌습니다. 검토 후 [실사확정]을 진행하세요.' });
  };

  // ── 5. 저장 / 확정 파이프라인 ──
  const handleSaveStocktake = async (mode: 'confirm' | 'draft') => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/inventory/stocktake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stocktakeDate: stockDate,
          mode,
          rows,
          createdBy: '현장관리자',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `✅ ${data.message}`,
        });
        // 저장 후 상태 동기화
        setRows((prev) =>
          prev.map((r) => ({
            ...r,
            status: mode === 'confirm' ? '확정' : '미확정',
          }))
        );
        setInitialRows(JSON.parse(JSON.stringify(rows)));
      } else {
        setStatusMessage({ type: 'error', text: `저장 실패: ${data.error || '오류가 발생했습니다.'}` });
      }
    } catch (err: any) {
      console.error('Error saving stocktake:', err);
      setStatusMessage({ type: 'error', text: `서버 통신 실패: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // ── 6. 초기화 ──
  const handleReset = async () => {
    if (!window.confirm(`${stockDate} 기준 입력된 실사 데이터를 초기 상태로 되돌리시겠습니까?`)) {
      return;
    }
    setRows(JSON.parse(JSON.stringify(initialRows)));
    setStatusMessage({ type: 'info', text: '조회 당시 초기 데이터로 복구되었습니다.' });
  };

  // ── 7. 엑셀 템플릿(양식) 다운로드 ──
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // 5개 창고별 시트 생성
    AUDIT_SHEETS.forEach((sheetName) => {
      const sheetItems = rows.filter((r) => r.warehouse === sheetName);
      const templateData = sheetItems.map((r, idx) => ({
        'No': idx + 1,
        '창고구분': r.warehouse,
        '구분': r.category,
        '거래처': r.supplier,
        '품번(ID)': r.itemCode,
        '제품명': r.itemName,
        '유통기한': r.expiryDate,
        '입수량': r.boxUnitQty,
        '단가': r.unitPrice,
        '장부재고': r.bookQty,
        '실사_박스(BOX)': r.boxQty,
        '실사_낱개(봉)': r.pieceQty,
        '조정사유/비고': r.adjustReason,
      }));

      const ws = XLSX.utils.json_to_sheet(
        templateData.length > 0
          ? templateData
          : [
              {
                'No': 1,
                '창고구분': sheetName,
                '구분': '원재료',
                '거래처': '협력사',
                '품번(ID)': 'CODE123',
                '제품명': '샘플품목',
                '유통기한': '2026-11-30',
                '입수량': 10,
                '단가': 1000,
                '장부재고': 100,
                '실사_박스(BOX)': 10,
                '실사_낱개(봉)': 0,
                '조정사유/비고': '정기실사일치',
              },
            ]
      );

      // 컬럼 폭 세팅
      ws['!cols'] = [
        { wch: 6 },
        { wch: 10 },
        { wch: 8 },
        { wch: 18 },
        { wch: 14 },
        { wch: 30 },
        { wch: 12 },
        { wch: 8 },
        { wch: 10 },
        { wch: 10 },
        { wch: 14 },
        { wch: 14 },
        { wch: 20 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `원부재료_일일재고조사표_표준양식_${stockDate}.xlsx`);
  };

  // ── 8. 현재 그리드 엑셀 내보내기 ──
  const handleExportGridExcel = () => {
    const exportColumns = [
      { key: 'no', label: 'No' },
      { key: 'warehouse', label: '창고구분' },
      { key: 'category', label: '구분' },
      { key: 'supplier', label: '거래처' },
      { key: 'itemCode', label: '품번(ID)' },
      { key: 'itemName', label: '제품명' },
      { key: 'expiryDate', label: '유통기한' },
      { key: 'boxUnitQty', label: '입수량', format: 'number' },
      { key: 'unitPrice', label: '단가(원)', format: 'currency' },
      { key: 'bookQty', label: '장부재고(봉)', format: 'number' },
      { key: 'boxQty', label: '실사박스(BOX)', format: 'number' },
      { key: 'pieceQty', label: '실사낱개(봉)', format: 'number' },
      { key: 'currentStock', label: '실사재고(봉)', format: 'number' },
      { key: 'diffQty', label: '차이수량', format: 'number' },
      { key: 'diffAmount', label: '차이금액(원)', format: 'currency' },
      { key: 'bookAmount', label: '장부금액(원)', format: 'currency' },
      { key: 'actualAmount', label: '실사금액(원)', format: 'currency' },
      { key: 'status', label: '실사상태' },
      { key: 'adjustReason', label: '조정사유' },
      { key: 'remark', label: '비고' },
    ];

    exportGridToExcel({
      filename: `원부재료_재고실사_${stockDate}_${activeTab}`,
      sheetName: activeTab === '전체' ? '전체실사' : activeTab,
      columns: exportColumns,
      data: filteredRows,
    });
  };

  // ── 9. 엑셀 파일 파서 (드래그앤드롭 / 파일선택) ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await parseUploadedExcel(file);
    e.target.value = '';
  };

  const parseUploadedExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });

      // DB 품목 맵 생성 (품번 우선, 이름 폴백)
      const codeMap = new Map<string, StocktakeItem>();
      const nameMap = new Map<string, StocktakeItem>();
      rows.forEach((r) => {
        if (r.itemCode) codeMap.set(r.itemCode.trim(), r);
        if (r.itemName) nameMap.set(r.itemName.trim().toLowerCase(), r);
      });

      const parsedItems: Partial<StocktakeItem>[] = [];
      const previewItems: Array<{
        itemCode: string;
        itemName: string;
        warehouse: string;
        prevActual: number;
        newActual: number;
        diff: number;
      }> = [];

      let totalParsed = 0;
      let matchedCount = 0;
      let diffCount = 0;

      // 워크북 내 모든 시트 순회
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;

        const sheetData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        if (sheetData.length < 2) continue;

        // 헤더 행 탐색 (품번, 제품명, 박스, 낱개 키워드 탐색)
        let headerRowIdx = -1;
        let colCode = -1;
        let colName = -1;
        let colBox = -1;
        let colPiece = -1;
        let colStock = -1;
        let colExpiry = -1;
        let colReason = -1;

        for (let i = 0; i < Math.min(6, sheetData.length); i++) {
          const row = sheetData[i];
          if (!row) continue;
          row.forEach((cell: any, cIdx: number) => {
            const str = String(cell || '').trim();
            if (str.includes('품번') || str.includes('ID') || str.includes('품목코드')) colCode = cIdx;
            if (str.includes('제품명') || str.includes('품명') || str.includes('품목명')) colName = cIdx;
            if (str.includes('박스') || str.includes('BOX')) colBox = cIdx;
            if (str.includes('낱개') || str.includes('봉')) colPiece = cIdx;
            if (str.includes('실사') || str.includes('현재고')) colStock = cIdx;
            if (str.includes('유통기한')) colExpiry = cIdx;
            if (str.includes('사유') || str.includes('비고')) colReason = cIdx;
          });
          if (colName !== -1 || colCode !== -1) {
            headerRowIdx = i;
            break;
          }
        }

        // 헤더 미발견 시 기본 표준 위치 매핑 (GFS-ERP 표준)
        if (headerRowIdx === -1) {
          headerRowIdx = 3;
          colCode = 2;
          colName = 3;
          colBox = 7;
          colPiece = 8;
          colStock = 9;
          colExpiry = 6;
          colReason = 14;
        }

        // 데이터 행 순회
        for (let rIdx = headerRowIdx + 1; rIdx < sheetData.length; rIdx++) {
          const r = sheetData[rIdx];
          if (!r) continue;

          const itemCode = colCode !== -1 && r[colCode] != null ? String(r[colCode]).trim() : '';
          const itemName = colName !== -1 && r[colName] != null ? String(r[colName]).trim() : '';
          if (!itemCode && !itemName) continue;

          totalParsed++;
          const target = codeMap.get(itemCode) || nameMap.get(itemName.toLowerCase());

          if (target) {
            matchedCount++;
            const boxUnit = target.boxUnitQty || 1;
            const boxQty = colBox !== -1 && r[colBox] != null ? Number(r[colBox]) || 0 : 0;
            const pieceQty = colPiece !== -1 && r[colPiece] != null ? Number(r[colPiece]) || 0 : 0;
            let currentStock = colStock !== -1 && r[colStock] != null ? Number(r[colStock]) : undefined;
            if (currentStock === undefined || isNaN(currentStock)) {
              currentStock = boxQty * boxUnit + pieceQty;
            }

            const expiry = colExpiry !== -1 && r[colExpiry] != null ? String(r[colExpiry]).trim() : target.expiryDate;
            const remark = colReason !== -1 && r[colReason] != null ? String(r[colReason]).trim() : target.remark;

            parsedItems.push({
              id: target.id,
              itemCode: target.itemCode,
              boxQty,
              pieceQty,
              currentStock,
              actualQty: currentStock,
              expiryDate: expiry,
              remark,
            });

            if (currentStock !== target.actualQty) {
              diffCount++;
              previewItems.push({
                itemCode: target.itemCode,
                itemName: target.itemName,
                warehouse: target.warehouse,
                prevActual: target.actualQty,
                newActual: currentStock,
                diff: currentStock - target.actualQty,
              });
            }
          }
        }
      }

      setUploadPreview({
        totalParsed,
        matchedCount,
        diffCount,
        items: previewItems,
        parsedRows: parsedItems,
      });
      setShowUploadModal(true);
    } catch (err: any) {
      alert(`엑셀 파싱 실패: ${err.message}`);
    }
  };

  // ── 10. 업로드 데이터 그리드에 적용 ──
  const applyUploadedData = () => {
    if (!uploadPreview) return;
    const updateMap = new Map<number, Partial<StocktakeItem>>();
    uploadPreview.parsedRows.forEach((p) => {
      if (p.id) updateMap.set(p.id, p);
    });

    setRows((prev) =>
      prev.map((r) => {
        const patch = updateMap.get(r.id);
        if (!patch) return r;

        const boxUnit = r.boxUnitQty || 1;
        const boxQty = patch.boxQty !== undefined ? patch.boxQty : r.boxQty;
        const pieceQty = patch.pieceQty !== undefined ? patch.pieceQty : r.pieceQty;
        const currentStock =
          patch.currentStock !== undefined
            ? patch.currentStock
            : boxQty * boxUnit + pieceQty;
        const diffQty = Math.round((currentStock - r.bookQty) * 100) / 100;
        const actualAmount = Math.round(currentStock * r.unitPrice);
        const diffAmount = Math.round(diffQty * r.unitPrice);

        return {
          ...r,
          boxQty,
          pieceQty,
          currentStock,
          actualQty: currentStock,
          diffQty,
          actualAmount,
          amount: actualAmount,
          diffAmount,
          expiryDate: patch.expiryDate || r.expiryDate,
          remark: patch.remark || r.remark,
          status: '미확정',
          adjustReason:
            diffQty !== 0
              ? diffQty < 0
                ? '현장실사감모'
                : '현장실사초과'
              : '현장실사일치',
        };
      })
    );

    setShowUploadModal(false);
    setStatusMessage({
      type: 'success',
      text: `엑셀 실사 데이터 ${uploadPreview.matchedCount}건이 그리드에 성공적으로 반영되었습니다. 검토 후 [실사확정(저장)]을 진행하세요.`,
    });
  };

  // ── 11. 필터링 및 통계 계산 ──
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // 1. 창고 탭 필터
      if (activeTab !== '전체' && r.warehouse !== activeTab) {
        return false;
      }
      // 2. 오차/차이 필터
      if (diffFilter === 'DIFF' && r.diffQty === 0) return false;
      if (diffFilter === 'MATCH' && r.diffQty !== 0) return false;
      if (diffFilter === 'SHORTAGE' && r.diffQty >= 0) return false;
      if (diffFilter === 'SURPLUS' && r.diffQty <= 0) return false;

      // 3. 검색어 필터
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const matchName = r.itemName.toLowerCase().includes(kw);
        const matchCode = r.itemCode.toLowerCase().includes(kw);
        const matchSupplier = r.supplier.toLowerCase().includes(kw);
        if (!matchName && !matchCode && !matchSupplier) return false;
      }

      return true;
    });
  }, [rows, activeTab, diffFilter, searchKeyword]);

  // 창고별 카운트 및 오차 현황 요약
  const warehouseCounts = useMemo(() => {
    const counts: Record<string, { total: number; diffCount: number; diffAmount: number }> = {
      '전체': { total: rows.length, diffCount: 0, diffAmount: 0 },
      '냉장1': { total: 0, diffCount: 0, diffAmount: 0 },
      '냉장2': { total: 0, diffCount: 0, diffAmount: 0 },
      '냉동': { total: 0, diffCount: 0, diffAmount: 0 },
      '상온': { total: 0, diffCount: 0, diffAmount: 0 },
      '부자재': { total: 0, diffCount: 0, diffAmount: 0 },
    };

    rows.forEach((r) => {
      const wh = r.warehouse;
      if (counts[wh]) {
        counts[wh].total += 1;
        if (r.diffQty !== 0) {
          counts[wh].diffCount += 1;
          counts[wh].diffAmount += r.diffAmount;
        }
      }
      if (r.diffQty !== 0) {
        counts['전체'].diffCount += 1;
        counts['전체'].diffAmount += r.diffAmount;
      }
    });

    return counts;
  }, [rows]);

  // 전체 KPI 서머리
  const kpiSummary = useMemo(() => {
    let bookAmount = 0;
    let actualAmount = 0;
    let diffAmount = 0;
    let bookQty = 0;
    let actualQty = 0;
    let shortageCount = 0;
    let surplusCount = 0;
    let matchCount = 0;
    let confirmedCount = 0;

    rows.forEach((r) => {
      bookAmount += r.bookAmount;
      actualAmount += r.actualAmount;
      diffAmount += r.diffAmount;
      bookQty += r.bookQty;
      actualQty += r.actualQty;
      if (r.diffQty < 0) shortageCount++;
      else if (r.diffQty > 0) surplusCount++;
      else matchCount++;
      if (r.status === '확정') confirmedCount++;
    });

    const completionRate = rows.length > 0 ? Math.round((confirmedCount / rows.length) * 100) : 0;

    return {
      totalCount: rows.length,
      bookAmount,
      actualAmount,
      diffAmount,
      bookQty,
      actualQty,
      shortageCount,
      surplusCount,
      matchCount,
      confirmedCount,
      completionRate,
    };
  }, [rows]);

  // 현재 필터링된 뷰의 소계
  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.bookQty += r.bookQty;
        acc.actualQty += r.actualQty;
        acc.diffQty += r.diffQty;
        acc.bookAmount += r.bookAmount;
        acc.actualAmount += r.actualAmount;
        acc.diffAmount += r.diffAmount;
        return acc;
      },
      { bookQty: 0, actualQty: 0, diffQty: 0, bookAmount: 0, actualAmount: 0, diffAmount: 0 }
    );
  }, [filteredRows]);

  // 액션바 버튼 구성
  const actionButtons = [
    {
      key: 'search',
      label: '조회',
      icon: 'search' as const,
      onClick: loadStocktakeData,
      disabled: isLoading || isSaving,
    },
    {
      key: 'confirm',
      label: '실사확정(저장)',
      icon: 'save' as const,
      onClick: () => handleSaveStocktake('confirm'),
      disabled: isSaving || rows.length === 0,
    },
    {
      key: 'draft',
      label: '임시저장',
      icon: 'save' as const,
      onClick: () => handleSaveStocktake('draft'),
      disabled: isSaving || rows.length === 0,
    },
    {
      key: 'upload',
      label: '엑셀 업로드',
      icon: 'excel' as const,
      onClick: () => fileInputRef.current?.click(),
      disabled: isLoading || isSaving,
    },
    {
      key: 'template',
      label: '양식 다운로드',
      icon: 'excel' as const,
      onClick: handleDownloadTemplate,
      disabled: isLoading || isSaving,
    },
    {
      key: 'export',
      label: '엑셀 다운로드',
      icon: 'excel' as const,
      onClick: handleExportGridExcel,
      disabled: rows.length === 0,
    },
    {
      key: 'reset',
      label: '초기화',
      icon: 'reset' as const,
      onClick: handleReset,
      disabled: isSaving,
    },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#f1f5f9] select-none text-[12px] font-sans overflow-hidden">
      {/* 숨김 엑셀 파일 인풋 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* 1. 표준 액션바 */}
      <InventoryActionBar
        title="원부재료 재고실사"
        buttons={actionButtons}
        helpContent="원부재료 실사 파이프라인: 5대 창고(냉장1, 냉장2, 냉동, 상온, 부자재) 606개 원부재료에 대한 실사수량을 입력하고, 장부재고 대비 차이(감모/잉여)를 실시간 검증 및 확정합니다. [엑셀 업로드]로 현장 시트를 일괄 반영할 수 있으며, [실사확정] 시 현재고(Inventory)에 즉각 동기화됩니다."
      />

      {/* 알림 메시지 배너 */}
      {statusMessage && (
        <div
          className={`px-4 py-1.5 text-[12px] font-bold flex items-center justify-between border-b transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-300'
              : 'bg-blue-50 text-blue-800 border-blue-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {statusMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600" />}
            {statusMessage.type === 'info' && <Sparkles className="w-4 h-4 text-blue-600" />}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-gray-400 hover:text-gray-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. 상단 KPI 조종석 콕핏 배너 (4 카드) */}
      <div className="grid grid-cols-4 gap-2 px-3 pt-2 pb-1.5 bg-[#f8fafc] border-b border-gray-300 shrink-0">
        {/* 카드 1: 실사 대상 품목 및 진행률 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-blue-600" />
              총 실사 대상 품목
            </span>
            <span className="text-[10.5px] px-1.5 py-0.2 rounded font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {kpiSummary.completionRate}% 확정
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-[18px] font-black font-mono text-slate-900 tracking-tight">
              {kpiSummary.totalCount.toLocaleString()}
              <span className="text-[11px] font-medium text-slate-500 ml-1">품목</span>
            </div>
            <div className="text-[11px] font-medium text-slate-600">
              확정 <strong className="text-emerald-700">{kpiSummary.confirmedCount}</strong> / 대기{' '}
              <strong className="text-amber-700">{kpiSummary.totalCount - kpiSummary.confirmedCount}</strong>
            </div>
          </div>
          {/* 미니 프로그레스 바 */}
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
            <div
              className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full transition-all duration-300"
              style={{ width: `${kpiSummary.completionRate}%` }}
            />
          </div>
        </div>

        {/* 카드 2: 장부재고총액 vs 실사재고총액 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              장부 vs 실사 재고총액
            </span>
            <span className="text-[10px] text-slate-400 font-mono">단가 반영 실시간</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div>
              <span className="text-[10px] text-slate-500 block">장부 재고총액</span>
              <span className="text-[14px] font-black font-mono text-slate-700">
                ₩ {kpiSummary.bookAmount.toLocaleString()}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className="text-right">
              <span className="text-[10px] text-blue-600 font-bold block">실사 재고총액</span>
              <span className="text-[15px] font-black font-mono text-blue-700">
                ₩ {kpiSummary.actualAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 카드 3: 재고 차이금액 (감모손실 vs 초과잉여) */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              {kpiSummary.diffAmount < 0 ? (
                <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
              ) : kpiSummary.diffAmount > 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              )}
              재고 차이금액 (오차/감모)
            </span>
            <span
              className={`text-[10.5px] px-1.5 py-0.2 rounded font-mono font-bold ${
                kpiSummary.diffAmount < 0
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : kpiSummary.diffAmount > 0
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {kpiSummary.diffAmount === 0
                ? '정상 일치'
                : kpiSummary.diffAmount < 0
                ? '감모 손실 발생'
                : '재고 잉여 발생'}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div
              className={`text-[18px] font-black font-mono tracking-tight ${
                kpiSummary.diffAmount < 0
                  ? 'text-rose-700'
                  : kpiSummary.diffAmount > 0
                  ? 'text-blue-700'
                  : 'text-emerald-700'
              }`}
            >
              {kpiSummary.diffAmount > 0 ? '+' : ''}₩ {kpiSummary.diffAmount.toLocaleString()}
            </div>
            <div className="text-[11px] font-medium text-slate-500">
              감모 <span className="text-rose-600 font-bold">{kpiSummary.shortageCount}건</span> / 잉여{' '}
              <span className="text-blue-600 font-bold">{kpiSummary.surplusCount}건</span>
            </div>
          </div>
        </div>

        {/* 카드 4: 창고별 오차 분포 배지 */}
        <div className="bg-white border border-slate-300 rounded-sm p-2 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-slate-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-600" />
              창고별 실사 현황
            </span>
            <span className="text-[10px] text-slate-400">5대 보관창고</span>
          </div>
          <div className="flex items-center gap-1 mt-1.5 overflow-x-auto">
            {AUDIT_SHEETS.map((wh) => {
              const info = warehouseCounts[wh] || { total: 0, diffCount: 0 };
              const hasDiff = info.diffCount > 0;
              return (
                <div
                  key={wh}
                  onClick={() => setActiveTab(wh)}
                  className={`flex-1 text-center py-1 px-1 rounded cursor-pointer border transition-all ${
                    activeTab === wh
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : hasDiff
                      ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-[10px] font-bold">{wh}</div>
                  <div className="text-[11px] font-mono font-black">
                    {info.total}
                    {hasDiff && (
                      <span className={`text-[9.5px] ml-0.5 ${activeTab === wh ? 'text-amber-200' : 'text-rose-600'}`}>
                        ({info.diffCount})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. 탭 바 & 검색 / 필터 툴바 */}
      <div className="bg-[#e2e8f0] border-b border-slate-300 px-3 flex items-center justify-between shrink-0 h-[38px]">
        {/* 창고 탭 */}
        <div className="flex items-center gap-1 h-full pt-1.5">
          {[
            { id: '전체', label: '전체', count: warehouseCounts['전체']?.total || 0, diff: warehouseCounts['전체']?.diffCount || 0 },
            { id: '냉장1', label: '냉장1', count: warehouseCounts['냉장1']?.total || 0, diff: warehouseCounts['냉장1']?.diffCount || 0 },
            { id: '냉장2', label: '냉장2', count: warehouseCounts['냉장2']?.total || 0, diff: warehouseCounts['냉장2']?.diffCount || 0 },
            { id: '냉동', label: '냉동', count: warehouseCounts['냉동']?.total || 0, diff: warehouseCounts['냉동']?.diffCount || 0 },
            { id: '상온', label: '상온', count: warehouseCounts['상온']?.total || 0, diff: warehouseCounts['상온']?.diffCount || 0 },
            { id: '부자재', label: '부자재', count: warehouseCounts['부자재']?.total || 0, diff: warehouseCounts['부자재']?.diffCount || 0 },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 h-[33px] px-3.5 rounded-t text-[12px] font-bold transition-all cursor-pointer border-t border-x ${
                  isActive
                    ? 'bg-white text-blue-700 border-blue-500 border-t-2 shadow-xs'
                    : 'bg-slate-200/90 text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-300/80'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? 'bg-blue-100 text-blue-800'
                      : tab.diff > 0
                      ? 'bg-amber-200 text-amber-900'
                      : 'bg-slate-300 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 툴바 컨트롤들 (일자, 오차필터, 검색, 일괄 채우기) */}
        <div className="flex items-center gap-2">
          {/* 실사 기준일자 */}
          <div className="flex items-center bg-white border border-gray-300 rounded px-2 h-7 gap-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-600">실사일:</span>
            <input
              type="date"
              value={stockDate}
              onChange={(e) => setStockDate(e.target.value)}
              className="font-mono text-[11.5px] font-bold text-slate-800 outline-none bg-transparent cursor-pointer"
            />
            <button
              type="button"
              onClick={() => setStockDate(kstToday())}
              className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-1 py-0.5 rounded cursor-pointer border border-slate-300"
            >
              오늘
            </button>
          </div>

          {/* 차이/상태 필터 */}
          <div className="flex items-center bg-white border border-gray-300 rounded px-2 h-7 gap-1 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={diffFilter}
              onChange={(e: any) => setDiffFilter(e.target.value)}
              className="text-[11px] font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
            >
              <option value="ALL">전체 품목 보기</option>
              <option value="DIFF">차이발생만 (오차)</option>
              <option value="MATCH">정상일치만 (오차0)</option>
              <option value="SHORTAGE">감모손실만 (실사 &lt; 장부)</option>
              <option value="SURPLUS">재고초과만 (실사 &gt; 장부)</option>
            </select>
          </div>

          {/* 장부값 일괄 복사 버튼 */}
          <button
            type="button"
            onClick={handleFillBookStockAll}
            className="flex items-center gap-1 h-7 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-[11px] border border-slate-300 cursor-pointer shadow-2xs"
            title="미입력된 실사수량을 장부재고와 동일하게 채웁니다."
          >
            장부값 일괄반영
          </button>

          {/* 실시간 검색 */}
          <div className="relative">
            <input
              type="text"
              placeholder="품명 / 품번 / 거래처 검색..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="h-7 w-[200px] pl-2.5 pr-7 bg-white border border-gray-300 rounded text-[11.5px] outline-none focus:border-blue-500 shadow-inner"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-2" />
          </div>
        </div>
      </div>

      {/* 4. 대형 데이터 그리드 */}
      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 min-h-0 overflow-auto border border-gray-300 shadow-2xs">
          <EditableTableWrapper>
            <table className="w-full min-w-full border-collapse text-[12px] font-sans">
              <thead className="sticky top-0 z-20 bg-[#eef2f7] text-gray-900 font-bold border-b border-[#cbd5e1] shadow-xs">
                <tr className="h-[32px] text-center leading-tight whitespace-nowrap">
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[42px] bg-[#e2e8f0] text-[11px]">No</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[72px]">창고</th>
                  <th className="border border-[#cbd5e1] px-1.5 py-1 w-[60px]">구분</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 min-w-[130px] text-left">거래처</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[85px] font-mono">품번(ID)</th>
                  <th className="border border-[#cbd5e1] px-3 py-1 min-w-[260px] text-left">제품명</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[90px]">유통기한</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[60px] text-center">입수량</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[75px] text-right">단가(원)</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[85px] text-right bg-slate-200/70">장부재고</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[75px] bg-[#dbeafe] text-blue-900">박스(BOX)</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[75px] bg-[#dbeafe] text-blue-900">낱개(봉)</th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[90px] text-right bg-[#bfdbfe] text-blue-950">
                    실사재고
                  </th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[75px] text-right">차이수량</th>
                  <th className="border border-[#cbd5e1] px-2.5 py-1 w-[95px] text-right">차이금액</th>
                  <th className="border border-[#cbd5e1] px-2.5 py-1 w-[105px] text-right bg-emerald-50 text-emerald-900">
                    실사금액
                  </th>
                  <th className="border border-[#cbd5e1] px-2 py-1 w-[70px] text-center">상태</th>
                  <th className="border border-[#cbd5e1] px-2.5 py-1 min-w-[140px] text-left">조정사유/비고</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={18} className="py-24 text-center text-gray-500 font-medium">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>606개 원부재료 실사 데이터를 로딩 중입니다...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="py-24 text-center text-gray-400 font-medium italic">
                      일치하는 재고실사 품목이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r, idx) => {
                    const hasDiff = r.diffQty !== 0;
                    const isShortage = r.diffQty < 0;
                    const isSurplus = r.diffQty > 0;

                    return (
                      <tr
                        key={r.id}
                        className={`h-[28px] border-b border-gray-200 transition-colors ${
                          hasDiff
                            ? isShortage
                              ? 'bg-rose-50/40 hover:bg-rose-100/60'
                              : 'bg-blue-50/40 hover:bg-blue-100/60'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        {/* No */}
                        <td className="border border-gray-200 text-center text-gray-500 font-mono text-[11px] bg-slate-50">
                          {idx + 1}
                        </td>

                        {/* 창고 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center font-bold text-slate-700">
                          <span className="px-1.5 py-0.2 rounded text-[10.5px] bg-slate-100 border border-slate-300">
                            {r.warehouse}
                          </span>
                        </td>

                        {/* 구분 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              r.category === '부자재'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {r.category}
                          </span>
                        </td>

                        {/* 거래처 */}
                        <td
                          className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-left font-medium text-gray-800 truncate max-w-[140px]"
                          title={r.supplier}
                        >
                          {r.supplier}
                        </td>

                        {/* 품번 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-center font-mono font-semibold text-gray-700">
                          {r.itemCode}
                        </td>

                        {/* 제품명 */}
                        <td
                          className="border border-gray-200 whitespace-nowrap px-2.5 py-0.5 text-left font-bold text-gray-900 truncate max-w-[280px]"
                          title={r.itemName}
                        >
                          {r.itemName}
                        </td>

                        {/* 유통기한 (인라인 편집) */}
                        <td className="border border-gray-200 p-0 text-center font-mono text-gray-700">
                          <input
                            type="text"
                            value={r.expiryDate}
                            onChange={(e) => handleFieldChange(r.id, 'expiryDate', e.target.value)}
                            className="w-full h-full text-center font-mono text-[11px] px-1 border-none outline-none focus:bg-blue-50 focus:text-blue-900 bg-transparent"
                            placeholder="YYYY-MM-DD"
                          />
                        </td>

                        {/* 입수량 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center font-mono text-gray-600">
                          {r.boxUnitQty}
                        </td>

                        {/* 단가 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                          {r.unitPrice.toLocaleString()}
                        </td>

                        {/* 장부재고 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-bold text-slate-700 bg-slate-100/60">
                          {r.bookQty.toLocaleString()}
                        </td>

                        {/* 실사 박스 수량 입력 셀 */}
                        <td className="border border-gray-200 p-0 text-right font-mono bg-blue-50/50">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={r.boxQty === 0 ? '' : r.boxQty}
                            placeholder="0"
                            onChange={(e) => handleBoxChange(r.id, e.target.value)}
                            className="w-full h-full text-right font-bold text-blue-900 px-2 py-1 border-none outline-none focus:bg-blue-100/80 focus:ring-1 focus:ring-blue-500 bg-transparent text-[12px]"
                          />
                        </td>

                        {/* 실사 낱개 수량 입력 셀 */}
                        <td className="border border-gray-200 p-0 text-right font-mono bg-blue-50/50">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.pieceQty === 0 ? '' : r.pieceQty}
                            placeholder="0"
                            onChange={(e) => handlePieceChange(r.id, e.target.value)}
                            className="w-full h-full text-right font-bold text-blue-900 px-2 py-1 border-none outline-none focus:bg-blue-100/80 focus:ring-1 focus:ring-blue-500 bg-transparent text-[12px]"
                          />
                        </td>

                        {/* 실사재고 (자동 계산 합계) */}
                        <td className="border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-black text-blue-800 bg-blue-100/40">
                          {r.currentStock.toLocaleString()}
                        </td>

                        {/* 차이수량 */}
                        <td
                          className={`border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-black ${
                            hasDiff
                              ? isShortage
                                ? 'text-rose-600 bg-rose-50/80'
                                : 'text-blue-600 bg-blue-50/80'
                              : 'text-gray-400'
                          }`}
                        >
                          {r.diffQty === 0 ? '-' : (r.diffQty > 0 ? `+${r.diffQty}` : `${r.diffQty}`)}
                        </td>

                        {/* 차이금액 */}
                        <td
                          className={`border border-gray-200 whitespace-nowrap px-2 py-0.5 text-right font-mono font-bold ${
                            hasDiff
                              ? isShortage
                                ? 'text-rose-700'
                                : 'text-blue-700'
                              : 'text-gray-400'
                          }`}
                        >
                          {r.diffAmount === 0 ? '-' : `₩ ${r.diffAmount.toLocaleString()}`}
                        </td>

                        {/* 실사금액 */}
                        <td className="border border-gray-200 whitespace-nowrap px-2.5 py-0.5 text-right font-mono font-bold text-emerald-800 bg-emerald-50/40">
                          ₩ {r.actualAmount.toLocaleString()}
                        </td>

                        {/* 상태 */}
                        <td className="border border-gray-200 whitespace-nowrap px-1.5 py-0.5 text-center">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              r.status === '확정'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : r.status === '미확정'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 text-slate-600 border border-slate-300'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>

                        {/* 조정사유/비고 */}
                        <td className="border border-gray-200 p-0 text-left">
                          <input
                            type="text"
                            value={r.adjustReason}
                            onChange={(e) => handleFieldChange(r.id, 'adjustReason', e.target.value)}
                            placeholder={hasDiff ? '차이사유 입력' : '정기실사일치'}
                            className="w-full h-full px-2 py-1 border-none outline-none text-[11px] text-gray-700 bg-transparent focus:bg-amber-50"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </EditableTableWrapper>
        </div>

        {/* 5. 하단 정밀 서머리 바 */}
        <div className="h-[36px] bg-[#f8fafc] border-t border-gray-300 px-4 flex items-center justify-between text-[12px] font-bold shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-gray-600">
              조회: <strong className="text-blue-700">{filteredRows.length}</strong>건 / 전체{' '}
              <strong>{rows.length}</strong>건
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600">
              기준일자: <strong className="font-mono text-gray-800">{stockDate}</strong>
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600">
              차이품목: <strong className="text-rose-600">{filteredRows.filter((r) => r.diffQty !== 0).length}</strong>건
            </span>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">장부총량:</span>
              <span className="font-mono text-slate-700 font-bold">{filteredTotals.bookQty.toLocaleString()}</span>
              <span className="text-gray-400 text-[11px]">봉</span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
              <span className="text-gray-500">실사총량:</span>
              <span className="font-mono text-blue-700 font-black text-[13px]">
                {filteredTotals.actualQty.toLocaleString()}
              </span>
              <span className="text-gray-400 text-[11px]">봉</span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
              <span className="text-gray-500">차이총액:</span>
              <span
                className={`font-mono font-black text-[13px] ${
                  filteredTotals.diffAmount < 0
                    ? 'text-rose-600'
                    : filteredTotals.diffAmount > 0
                    ? 'text-blue-600'
                    : 'text-emerald-600'
                }`}
              >
                {filteredTotals.diffAmount > 0 ? '+' : ''}₩ {filteredTotals.diffAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-gray-300">
              <span className="text-gray-600">실사총액:</span>
              <span className="font-mono text-emerald-700 font-black text-[14px]">
                ₩ {filteredTotals.actualAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. 엑셀 업로드 미리보기 및 적용 모달 */}
      {showUploadModal && uploadPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* 모달 헤더 */}
            <div className="bg-[#1e293b] text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h2 className="text-[14px] font-bold">현장 실사 엑셀 업로드 데이터 검증</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-4 flex-1 overflow-y-auto">
              {/* 통계 요약 배너 */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-center">
                  <div className="text-[11px] text-slate-500 font-bold">인식된 총 실사행</div>
                  <div className="text-[18px] font-mono font-black text-slate-800">
                    {uploadPreview.totalParsed.toLocaleString()}건
                  </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 text-center">
                  <div className="text-[11px] text-emerald-700 font-bold">DB 품목 매핑 성공</div>
                  <div className="text-[18px] font-mono font-black text-emerald-800">
                    {uploadPreview.matchedCount.toLocaleString()}건
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-center">
                  <div className="text-[11px] text-amber-700 font-bold">재고 변경/차이 발생</div>
                  <div className="text-[18px] font-mono font-black text-amber-800">
                    {uploadPreview.diffCount.toLocaleString()}건
                  </div>
                </div>
              </div>

              {/* 변경 항목 미리보기 테이블 */}
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 text-[11.5px] font-bold text-slate-700 border-b border-slate-300 flex items-center justify-between">
                  <span>실사 변경 품목 미리보기 (상위 20건 표시)</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    총 {uploadPreview.items.length}개 품목의 수량이 변동됩니다.
                  </span>
                </div>
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-[11.5px] text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-200/90 text-slate-800 font-bold">
                      <tr>
                        <th className="p-2">창고</th>
                        <th className="p-2">품번</th>
                        <th className="p-2">제품명</th>
                        <th className="p-2 text-right">기존 실사</th>
                        <th className="p-2 text-right">엑셀 실사</th>
                        <th className="p-2 text-right">변동폭</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {uploadPreview.items.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">
                            기존 실사 수량과 변동된 품목이 없습니다. (동일 수량)
                          </td>
                        </tr>
                      ) : (
                        uploadPreview.items.slice(0, 30).map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-bold text-slate-700">{item.warehouse}</td>
                            <td className="p-2 font-mono text-slate-600">{item.itemCode}</td>
                            <td className="p-2 font-bold text-slate-900 truncate max-w-[200px]">
                              {item.itemName}
                            </td>
                            <td className="p-2 text-right font-mono text-slate-500">
                              {item.prevActual.toLocaleString()}
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-blue-700">
                              {item.newActual.toLocaleString()}
                            </td>
                            <td
                              className={`p-2 text-right font-mono font-bold ${
                                item.diff > 0 ? 'text-blue-600' : 'text-rose-600'
                              }`}
                            >
                              {item.diff > 0 ? `+${item.diff}` : item.diff}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="bg-slate-100 px-4 py-3 border-t border-slate-300 flex items-center justify-between">
              <span className="text-[11.5px] text-slate-500">
                * [적용하기]를 누르면 메인 그리드에 즉시 반영되며, 최종 확인 후 [실사확정(저장)]을 누르셔야 DB에 최종 반영됩니다.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3.5 py-1.5 rounded text-[12px] font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 cursor-pointer shadow-xs"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={applyUploadedData}
                  className="px-4 py-1.5 rounded text-[12px] font-bold bg-blue-600 hover:bg-blue-500 text-white border border-blue-700 cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  실사 데이터 그리드에 적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
