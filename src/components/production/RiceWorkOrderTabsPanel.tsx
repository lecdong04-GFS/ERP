'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  Upload,
  RefreshCw,
  Sunrise,
  ClipboardCheck,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Printer,
} from 'lucide-react';
import { buildMasterWorkOrderPrintHtml } from '@/lib/production/printMasterWorkOrder';
import {
  applyWorkersOverride,
  type RiceWorkOrderResult,
  type WorkOrderWindowMode,
  type RiceColorBadge,
  type FormingScheduleRow,
  type PrepScheduleRow,
} from '@/lib/production/riceScheduleEngine';
import {
  loadProductionConfig,
  type ProductionConfigData,
} from '@/components/production/modals/ProductionConfigModal';
import { GFS_SALES_ORDER_CHANGED_EVENT } from '@/lib/gfs/orderSyncEvent';

interface ApiPayload {
  workDate: string;
  baselineDate: string;
  hasConfirmedOrders: boolean;
  source?: string;
  pre10: RiceWorkOrderResult;
  post10: RiceWorkOrderResult;
}

interface Props {
  workDate: string;
}

type SubTabId = 'tab1' | 'tab2' | 'tab3' | 'tab4' | 'tab5';

function RiceBadge({ badge, label }: { badge: RiceColorBadge; label?: string }) {
  const cls =
    badge === '흰밥'
      ? 'bg-slate-100 text-slate-800 border-slate-300'
      : badge === '흑미밥'
      ? 'bg-zinc-800 text-white border-zinc-900'
      : badge === '복합'
      ? 'bg-amber-50 text-amber-900 border-amber-300'
      : badge === '빨간밥'
      ? 'bg-rose-50 text-rose-800 border-rose-200'
      : 'bg-sky-50 text-sky-800 border-sky-200';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold border whitespace-nowrap ${cls}`}
    >
      {label || badge}
    </span>
  );
}

function DiffBadge({ diff }: { diff?: number }) {
  if (diff === undefined || diff === 0) return null;
  return (
    <span
      className={`ml-1.5 text-[11.5px] font-mono font-bold px-1.5 py-0.5 rounded ${
        diff > 0 ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
    </span>
  );
}

export function RiceWorkOrderTabsPanel({ workDate }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [mode, setMode] = useState<WorkOrderWindowMode>('post10');
  const [activeTab, setActiveTab] = useState<SubTabId>('tab1');
  const [roomOrLineFilter, setRoomOrLineFilter] = useState<string>('전체');
  const [tab1ShiftFilter, setTab1ShiftFilter] = useState<'전체' | '2편' | '1편'>('전체');
  const [tab1ColorFilter, setTab1ColorFilter] = useState<string>('전체');
  const [tab1LineFilter, setTab1LineFilter] = useState<string>('전체');
  const [expandedMasterKey, setExpandedMasterKey] = useState<string | null>(null);
  const [excelSourceName, setExcelSourceName] = useState<string | null>(null);
  const [prodConfig, setProdConfig] = useState<ProductionConfigData>(() => loadProductionConfig());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSchedule = async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/production/rice-work-order?date=${encodeURIComponent(targetDate)}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error || '작업지시서 생성 실패');
        return;
      }
      setPayload(json.data);
      setExcelSourceName(null);
      // 본수주 미도착 시 자동으로 10시 이전(선행) 모드 기본 선택
      if (!json.data.hasConfirmedOrders) {
        setMode('pre10');
      } else {
        setMode('post10');
      }
    } catch (err: any) {
      setError(err?.message || '통신 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSchedule(workDate);
  }, [workDate]);

  useEffect(() => {
    const onOrderChanged = () => {
      void fetchSchedule(workDate);
    };
    window.addEventListener(GFS_SALES_ORDER_CHANGED_EVENT, onOrderChanged);
    return () => window.removeEventListener(GFS_SALES_ORDER_CHANGED_EVENT, onOrderChanged);
  }, [workDate]);

  useEffect(() => {
    setRoomOrLineFilter('전체');
  }, [activeTab]);

  useEffect(() => {
    const onConfigUpdated = () => {
      setProdConfig(loadProductionConfig());
    };
    window.addEventListener('gfs_production_config_updated', onConfigUpdated);
    return () => window.removeEventListener('gfs_production_config_updated', onConfigUpdated);
  }, []);

  const rawCurrentResult: RiceWorkOrderResult | null = payload
    ? mode === 'pre10'
      ? payload.pre10
      : payload.post10
    : null;

  const currentResult: RiceWorkOrderResult | null = useMemo(() => {
    if (!rawCurrentResult) return null;
    return applyWorkersOverride(
      rawCurrentResult,
      prodConfig.lineWorkers,
      prodConfig.roomWorkers
    );
  }, [rawCurrentResult, prodConfig]);

  const handleOrdviewUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });

      const ordviewRows = rows
        .map((r) => {
          const keys = Object.keys(r);
          const supplierKey = keys.find((k) => /공급자|편|센터/.test(k));
          const nameKey = keys.find((k) => /상품명|품명|품목명|제품명/.test(k));
          const qtyKey = keys.find((k) => /낱개|수량|EA|발주량/i.test(k));
          return {
            supplier: supplierKey ? String(r[supplierKey] || '') : '',
            productName: nameKey ? String(r[nameKey] || '') : '',
            eaQty: qtyKey ? Number(String(r[qtyKey]).replace(/,/g, '')) || 0 : 0,
          };
        })
        .filter((r) => r.productName && r.eaQty > 0);

      if (ordviewRows.length === 0) {
        setError('ordview 엑셀에서 유효한 상품명/수량 행을 찾지 못했습니다.');
        return;
      }

      const res = await fetch('/api/production/rice-work-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: workDate, ordviewRows }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'ordview 처리 실패');
        return;
      }
      setPayload(json.data);
      setExcelSourceName(file.name);
      setMode('post10');
    } catch (err: any) {
      setError(err?.message || '엑셀 파싱 오류');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload5SheetExcel = () => {
    if (!currentResult) return;
    const wb = XLSX.utils.book_new();
    const modeLabel = mode === 'pre10' ? '10시 이전 (선행)' : '10시 이후 (본수주 확정)';

    const calcColWidth = (val: unknown): number => {
      const str = String(val ?? '');
      let w = 0;
      for (let i = 0; i < str.length; i++) {
        w += str.charCodeAt(i) > 127 ? 2 : 1;
      }
      return w;
    };

    const buildSheet = (
      title: string,
      subtitle: string,
      headers: string[],
      rows: Array<Array<string | number>>,
      minWidths: number[] = []
    ) => {
      const aoa: Array<Array<string | number>> = [
        [title],
        [subtitle],
        [],
        headers,
        ...rows,
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      if (headers.length > 1) {
        ws['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
        ];
      }
      ws['!cols'] = headers.map((h, colIdx) => {
        let maxW = calcColWidth(h);
        for (const r of rows) {
          const cw = calcColWidth(r[colIdx]);
          if (cw > maxW) maxW = cw;
        }
        const minW = minWidths[colIdx] || 8;
        return { wch: Math.min(44, Math.max(minW, maxW + 3)) };
      });
      ws['!rows'] = [{ hpt: 24 }, { hpt: 18 }, { hpt: 8 }, { hpt: 22 }];
      return ws;
    };

    // ── 0. 현장 한눈에 보기: 품목별 작업지시서 (품목별 블록 + 하위 투입원물 정리) ──
    const prepByProduct = new Map<string, PrepScheduleRow[]>();
    for (const p of [...currentResult.tab2PrepRice, ...currentResult.tab3PrepCook]) {
      const key = `${p.shiftType}::${p.baseProductName}`;
      const arr = prepByProduct.get(key) || [];
      arr.push(p);
      prepByProduct.set(key, arr);
    }

    const itemGroupedRows: Array<Array<string | number>> = [];
    const sortedItems = [...currentResult.tab1Master].sort(
      (a, b) =>
        (a.shiftType === b.shiftType ? 0 : a.shiftType === '2편' ? -1 : 1) ||
        a.primaryLine.localeCompare(b.primaryLine, 'ko') ||
        a.baseProductName.localeCompare(b.baseProductName, 'ko')
    );

    sortedItems.forEach((item, idx) => {
      const prepRows = prepByProduct.get(`${item.shiftType}::${item.baseProductName}`) || [];
      const prepTimeByMat = new Map<string, { room: string; timeRange: string }>();
      for (const pr of prepRows) {
        if (!prepTimeByMat.has(pr.materialName)) {
          prepTimeByMat.set(pr.materialName, { room: pr.room, timeRange: pr.timeRange });
        }
      }

      itemGroupedRows.push([
        idx + 1,
        '▶ 품목',
        item.shiftType,
        item.primaryLine,
        item.riceColorBadge,
        item.baseProductName,
        item.eaQty,
        item.scheduledTimeRange || '-',
        item.durationMin ? `${item.durationMin}분` : '-',
        item.totalMaterialKg ?? 0,
        mode === 'post10' && item.diffEa != null ? item.diffEa : '',
        '',
      ]);

      if (item.bomMaterials.length > 0) {
        for (const mat of item.bomMaterials) {
          const g =
            mat.unit === 'kg' || mat.unit === 'KG'
              ? mat.unitQty * 1000
              : mat.unit === 'g' || mat.unit === 'G'
              ? mat.unitQty
              : 0;
          const yf = 100 / Math.max(1, Number(mat.yieldRate) || 100);
          const reqKg = g > 0 ? Math.round(((item.eaQty * g * yf) / 1000) * 100) / 100 : '';
          const prepMeta = prepTimeByMat.get(mat.materialName);
          itemGroupedRows.push([
            '',
            '  └ 원물',
            '',
            prepMeta?.room || mat.nextProcess || mat.warehouse || '-',
            '',
            `  · ${mat.materialName}`,
            `${mat.unitQty}${mat.unit}`,
            prepMeta?.timeRange || '-',
            `수율 ${mat.yieldRate}%`,
            reqKg,
            '',
            mat.warehouse || '',
          ]);
        }
      }
      // 품목 간 구분 빈 줄
      itemGroupedRows.push(['', '', '', '', '', '', '', '', '', '', '', '']);
    });

    const sharedBatchRows = currentResult.tab3PrepCook.filter((r) => r.isBatched);
    if (sharedBatchRows.length > 0) {
      itemGroupedRows.push([
        '',
        '★ 공통배치',
        '',
        '샐러드실',
        '',
        '공통 토핑 일괄 합산',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
      for (const sb of sharedBatchRows) {
        itemGroupedRows.push([
          '',
          '  └ 합산',
          sb.shiftType,
          sb.room,
          '',
          sb.materialName,
          '',
          sb.timeRange,
          '',
          sb.requiredKg,
          '',
          sb.note,
        ]);
      }
    }

    const ws0 = buildSheet(
      `[GFS] 품목별 작업지시서 (${workDate} · ${modeLabel})`,
      `총 ${currentResult.summary.totalEa.toLocaleString()} EA (2편 ${currentResult.summary.shift2Ea.toLocaleString()} / 1편 ${currentResult.summary.shift1Ea.toLocaleString()}) | BOM 총 원물 ${currentResult.summary.totalKg.toLocaleString()} kg`,
      [
        '순번',
        '구분',
        '편',
        '라인 / 작업실',
        '밥색상',
        '품명 / 투입원물',
        '수량(EA) / 단위소요',
        '가동 / 작업시간대',
        '소요 / 수율',
        '필요중량(kg)',
        '선행대비증감',
        '창고 / 비고',
      ],
      itemGroupedRows,
      [6, 10, 6, 16, 10, 32, 16, 16, 12, 14, 13, 18]
    );
    XLSX.utils.book_append_sheet(wb, ws0, '0_품목별_작업지시서');

    // ── 1. 발주집계 · 색상순위 ──
    const s1Headers = [
      '순번',
      '편구분',
      '밥색상',
      '주라인',
      '품목명',
      '발주수량(EA)',
      '가동시간대',
      '소요(분)',
      '원물합계(kg)',
      '비중(%)',
      ...(mode === 'post10' ? ['선행대비증감'] : []),
    ];
    const s1Rows = currentResult.tab1Master.map((r, i) => [
      i + 1,
      r.shiftType,
      r.riceColorBadge,
      r.primaryLine,
      r.baseProductName,
      r.eaQty,
      r.scheduledTimeRange || '-',
      r.durationMin ?? 0,
      r.totalMaterialKg ?? 0,
      r.sharePct ?? 0,
      ...(mode === 'post10' ? [r.diffEa ?? 0] : []),
    ]);
    XLSX.utils.book_append_sheet(
      wb,
      buildSheet(
        `발주집계 · 밥색상 순위 (${workDate} · ${modeLabel})`,
        `총 ${currentResult.summary.totalEa.toLocaleString()} EA | ${currentResult.tab1Master.length}개 품목`,
        s1Headers,
        s1Rows,
        [6, 8, 10, 16, 28, 14, 15, 10, 14, 10, 13]
      ),
      '1_발주집계_색상순위'
    );

    // ── 2~3. 전처리 시트 (품목별 묶음 정렬) ──
    const buildPrepSheet = (title: string, list: PrepScheduleRow[]) => {
      const grouped = [...list].sort(
        (a, b) =>
          (a.shiftType === b.shiftType ? 0 : a.shiftType === '2편' ? -1 : 1) ||
          a.baseProductName.localeCompare(b.baseProductName, 'ko') ||
          a.room.localeCompare(b.room, 'ko') ||
          a.startMin - b.startMin
      );
      const rows: Array<Array<string | number>> = [];
      let prevItemKey = '';
      grouped.forEach((r, i) => {
        const curKey = `${r.shiftType}::${r.baseProductName}`;
        if (prevItemKey && prevItemKey !== curKey) {
          rows.push(['', '', '', '', '', '', '', '', '', '', '', '']);
        }
        prevItemKey = curKey;
        rows.push([
          i + 1,
          r.shiftType,
          r.baseProductName,
          r.room,
          r.workers || '-',
          r.timeRange,
          r.targetLine,
          r.riceColorBadge,
          r.materialName,
          r.eaQty || '',
          r.requiredKg || '',
          r.note,
        ]);
      });
      return buildSheet(
        `${title} (${workDate} · ${modeLabel})`,
        `품목별 정리 | 총 ${list.length}건`,
        [
          '순번',
          '편구분',
          '품목명',
          '작업실',
          '투입인원',
          '작업시간대',
          '대상라인',
          '밥색상',
          '투입원물',
          '생산수량(EA)',
          '필요중량(kg)',
          '비고',
        ],
        rows,
        [6, 8, 28, 15, 10, 15, 15, 10, 24, 13, 14, 20]
      );
    };

    XLSX.utils.book_append_sheet(
      wb,
      buildPrepSheet('전처리 · 계량 · 취반 · 로터리', currentResult.tab2PrepRice),
      '2_전처리_계량취반로터리'
    );
    XLSX.utils.book_append_sheet(
      wb,
      buildPrepSheet('전처리 · 조리 · 샐러드 · 커팅', currentResult.tab3PrepCook),
      '3_전처리_조리샐러드커팅'
    );

    // ── 4~5. 성형 시트 (라인별 구분 빈 줄 포함) ──
    const buildFormingSheet = (title: string, list: FormingScheduleRow[]) => {
      const rows: Array<Array<string | number>> = [];
      let prevLine = '';
      for (const r of list) {
        if (prevLine && prevLine !== r.lineName) {
          rows.push(['', '', '', '', '', '', '', '', '', '', '', '']);
        }
        prevLine = r.lineName;
        rows.push([
          r.lineName,
          r.workers || '-',
          r.seq,
          r.shiftType,
          r.timeRange,
          r.durationMin,
          r.rowType,
          r.riceColorBadge,
          r.baseProductName,
          r.eaQty || '',
          r.uph,
          r.note,
        ]);
      }
      return buildSheet(
        `${title} (${workDate} · ${modeLabel})`,
        `라인별 생산 순서 | 총 ${list.filter((x) => x.rowType === '생산').length}건`,
        [
          '라인',
          '투입인원',
          '순번',
          '편구분',
          '시간대',
          '소요(분)',
          '구분',
          '밥색상',
          '품목명',
          '발주수량(EA)',
          '표준UPH',
          '비고',
        ],
        rows,
        [15, 10, 6, 8, 15, 10, 10, 10, 28, 13, 10, 20]
      );
    };

    XLSX.utils.book_append_sheet(
      wb,
      buildFormingSheet('성형 · 도시락 · 김밥', currentResult.tab4FormingBentoGimbap),
      '4_성형_도시락김밥'
    );
    XLSX.utils.book_append_sheet(
      wb,
      buildFormingSheet('성형 · 더큰 · 삼각1·2 · 커플', currentResult.tab5FormingSamgak),
      '5_성형_더큰삼각커플'
    );

    const suffix = mode === 'pre10' ? '10시이전_선행' : '10시이후_본수주확정';
    XLSX.writeFile(wb, `GFS_작업지시서_${workDate}_${suffix}.xlsx`);
  };

  const filteredTab1Rows = useMemo(() => {
    if (!currentResult) return [];
    return currentResult.tab1Master.filter((r) => {
      if (tab1ShiftFilter !== '전체' && r.shiftType !== tab1ShiftFilter) return false;
      if (tab1ColorFilter !== '전체' && r.riceColorBadge !== tab1ColorFilter) return false;
      if (tab1LineFilter !== '전체' && r.primaryLine !== tab1LineFilter) return false;
      return true;
    });
  }, [currentResult, tab1ShiftFilter, tab1ColorFilter, tab1LineFilter]);

  const tab1LineOptions = useMemo(() => {
    if (!currentResult) return [];
    return ['전체', ...Array.from(new Set(currentResult.tab1Master.map((r) => r.primaryLine)))];
  }, [currentResult]);

  const subFilterOptions = useMemo(() => {
    if (!currentResult) return [];
    if (activeTab === 'tab2') return ['전체', ...Array.from(new Set(currentResult.tab2PrepRice.map((r) => r.room)))];
    if (activeTab === 'tab3') return ['전체', ...Array.from(new Set(currentResult.tab3PrepCook.map((r) => r.room)))];
    if (activeTab === 'tab4') return ['전체', ...Array.from(new Set(currentResult.tab4FormingBentoGimbap.map((r) => r.lineName)))];
    if (activeTab === 'tab5') return ['전체', ...Array.from(new Set(currentResult.tab5FormingSamgak.map((r) => r.lineName)))];
    return [];
  }, [currentResult, activeTab]);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* ── 상단 컨트롤 바 (10시 이전 vs 10시 이후 2종 + 업로드 + 엑셀 다운로드) ── */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setMode('pre10')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-black transition cursor-pointer ${
                mode === 'pre10'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sunrise className="w-4 h-4" />
              10시 이전 (선행)
            </button>
            <button
              type="button"
              onClick={() => setMode('post10')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-black transition cursor-pointer ${
                mode === 'post10'
                  ? 'bg-blue-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              10시 이후 (본수주 확정)
            </button>
          </div>

          {payload && (
            <span className="text-[13px] font-semibold text-slate-600">
              {mode === 'pre10'
                ? `선행 기준일: ${payload.baselineDate || '당일'} (06:00~10:30 선행가동)`
                : excelSourceName
                ? `업로드 파일: ${excelSourceName}`
                : payload.hasConfirmedOrders
                ? `${workDate} ERP 본수주 확정분`
                : `${workDate} 본수주 대기 중 (10시 전후 ordview 업로드 또는 수주 연동)`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleOrdviewUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-bold cursor-pointer transition"
          >
            <Upload className="w-4 h-4" />
            ordview 엑셀 불러오기
          </button>
          <button
            type="button"
            onClick={() => void fetchSchedule(workDate)}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-bold cursor-pointer transition"
            title="최신 수주·BOM 기준으로 다시 계산"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!currentResult) return;
              const win = window.open('', '_blank');
              if (!win) {
                alert('팝업이 차단되어 인쇄 창을 열 수 없습니다.');
                return;
              }
              const html = buildMasterWorkOrderPrintHtml(currentResult, { scope: 'ALL' });
              win.document.open();
              win.document.write(html);
              win.document.close();
            }}
            disabled={!currentResult || currentResult.tab1Master.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white text-[13px] font-black cursor-pointer transition"
            title="성형 라인별·전처리 작업장별 1페이지씩 분리된 종합본 인쇄"
          >
            <Printer className="w-4 h-4" />
            라인·작업장별 종합인쇄
          </button>
          <button
            type="button"
            onClick={handleDownload5SheetExcel}
            disabled={!currentResult || currentResult.tab1Master.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-[13px] font-black cursor-pointer transition"
          >
            <Download className="w-4 h-4" />
            5시트 엑셀(.xlsx)
          </button>
        </div>
      </div>

      {/* ── 5개 실별/공정별 탭 ── */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'tab1' as const, label: '① 발주집계 · 색상순위', count: currentResult?.tab1Master.length || 0 },
            { id: 'tab2' as const, label: '② 계량 · 취반 · 로터리', count: currentResult?.tab2PrepRice.length || 0 },
            { id: 'tab3' as const, label: '③ 조리 · 샐러드 · 커팅', count: currentResult?.tab3PrepCook.length || 0 },
            { id: 'tab4' as const, label: '④ 도시락 · 김밥 성형/포장', count: currentResult?.tab4FormingBentoGimbap.length || 0 },
            { id: 'tab5' as const, label: '⑤ 더큰 · 삼각1·2 · 커플', count: currentResult?.tab5FormingSamgak.length || 0 },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-1.5 rounded-lg text-[13.5px] font-bold transition cursor-pointer border ${
                activeTab === t.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {t.label}{' '}
              <span className={`ml-1 font-mono text-[12px] ${activeTab === t.id ? 'text-slate-300' : 'text-slate-400'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {currentResult && (
          <div className="text-[13px] font-bold text-slate-600 flex items-center gap-3">
            <span>
              총 <strong className="font-mono text-slate-900">{currentResult.summary.totalEa.toLocaleString()}</strong> EA
            </span>
            <span>
              2편 <strong className="font-mono text-slate-900">{currentResult.summary.shift2Ea.toLocaleString()}</strong>
            </span>
            <span>
              1편 <strong className="font-mono text-slate-900">{currentResult.summary.shift1Ea.toLocaleString()}</strong>
            </span>
            <span>
              전처리 <strong className="font-mono text-slate-900">{currentResult.summary.totalKg.toLocaleString()}</strong> kg
            </span>
          </div>
        )}
      </div>

      {/* ── 실/라인 세부 필터 (Tab 2~5) ── */}
      {subFilterOptions.length > 1 && (
        <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto">
          {subFilterOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setRoomOrLineFilter(opt)}
              className={`px-3 py-1 rounded-full text-[12.5px] font-bold border cursor-pointer transition whitespace-nowrap ${
                roomOrLineFilter === opt
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* ── 테이블 본문 ── */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="m-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {!currentResult || currentResult.tab1Master.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm font-bold">
            {loading
              ? '작업지시서를 생성하고 있습니다...'
              : '해당 일자의 수주 데이터가 없습니다. 상단 [ordview 엑셀 불러오기]로 바로 생성할 수 있습니다.'}
          </div>
        ) : activeTab === 'tab1' ? (
          <div className="flex flex-col">
            {/* ── 상단 오늘의 생산 브리핑 (밥 색상 비율 + 라인별 예상 마감시각) ── */}
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 space-y-2.5">
              {/* 1) 밥 색상별 물량 구성 바 */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[12.5px] font-black text-slate-700 whitespace-nowrap">
                  🍚 밥 색상 구성
                </span>
                <div className="flex-1 min-w-[200px] h-3 rounded-full bg-slate-200 overflow-hidden flex">
                  {currentResult.summary.colorBreakdown
                    .filter((c) => c.pct > 0)
                    .map((c) => {
                      const barCls =
                        c.badge === '흰밥'
                          ? 'bg-slate-400'
                          : c.badge === '흑미밥'
                          ? 'bg-zinc-800'
                          : c.badge === '복합'
                          ? 'bg-amber-400'
                          : 'bg-rose-500';
                      return (
                        <div
                          key={c.badge}
                          style={{ width: `${c.pct}%` }}
                          className={`${barCls} h-full transition-all`}
                          title={`${c.badge}: ${c.ea.toLocaleString()} EA (${c.pct}%)`}
                        />
                      );
                    })}
                </div>
                <div className="flex items-center gap-2.5 flex-wrap text-[12.5px] font-bold text-slate-700">
                  {currentResult.summary.colorBreakdown
                    .filter((c) => c.ea > 0)
                    .map((c) => (
                      <span key={c.badge} className="inline-flex items-center gap-1">
                        <RiceBadge badge={c.badge} />
                        <span className="font-mono text-slate-900">{c.pct}%</span>
                        <span className="font-mono text-slate-400 text-[11.5px]">
                          ({c.ea.toLocaleString()})
                        </span>
                      </span>
                    ))}
                </div>
              </div>

              {/* 2) 라인별 예상 마감시각 & 병목 라인 */}
              {currentResult.summary.lineSummaries.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-black text-slate-700 whitespace-nowrap">
                    ⏱️ 라인 마감예상
                  </span>
                  {currentResult.summary.lineSummaries.map((ls) => (
                    <div
                      key={ls.lineName}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12.5px] font-bold ${
                        ls.isBottleneck
                          ? 'bg-amber-50 border-amber-300 text-amber-950'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <span>{ls.lineName}</span>
                      <span className="font-mono font-black text-slate-900">~{ls.endTime}</span>
                      <span className="text-[11px] font-mono text-slate-500">
                        ({ls.totalEa.toLocaleString()}EA)
                      </span>
                      {ls.isBottleneck && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 text-[10.5px] font-black">
                          최장
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 3) 1클릭 편 · 밥색상 · 라인 필터 */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/70 text-[12.5px]">
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                  {(['전체', '2편', '1편'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTab1ShiftFilter(s)}
                      className={`px-2.5 py-0.5 rounded-md font-bold cursor-pointer transition ${
                        tab1ShiftFilter === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                  {(['전체', '흰밥', '흑미밥', '복합', '빨간밥'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTab1ColorFilter(c)}
                      className={`px-2.5 py-0.5 rounded-md font-bold cursor-pointer transition ${
                        tab1ColorFilter === c ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <select
                  value={tab1LineFilter}
                  onChange={(e) => setTab1LineFilter(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[12.5px] font-bold text-slate-700 cursor-pointer"
                >
                  {tab1LineOptions.map((ln) => (
                    <option key={ln} value={ln}>
                      {ln === '전체' ? '전체 라인' : ln}
                    </option>
                  ))}
                </select>

                <span className="ml-auto text-[12px] text-slate-500 font-semibold">
                  💡 품목 행을 클릭하면 전처리 → 성형 릴레이 시간표와 BOM 원물(kg)을 확인할 수 있습니다.
                </span>
              </div>
            </div>

            <table className="w-full text-[14px] text-left border-collapse">
              <thead className="sticky top-0 bg-slate-100 text-slate-800 text-[13.5px] font-black border-b border-slate-200 z-10">
                <tr>
                  <th className="py-2.5 px-3 text-center w-12">No</th>
                  <th className="py-2.5 px-2 w-16 text-center">편</th>
                  <th className="py-2.5 px-2 w-36">밥 색상</th>
                  <th className="py-2.5 px-2 w-32">배정 라인</th>
                  <th className="py-2.5 px-3">기본상품명</th>
                  <th className="py-2.5 px-2 w-36 text-center">예상 시간</th>
                  <th className="py-2.5 px-3 text-right w-36">발주수량 (EA)</th>
                  <th className="py-2.5 px-3 text-right w-28">원물 중량</th>
                  <th className="py-2.5 px-3 text-right w-28">물량 비중</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTab1Rows.map((r, i) => {
                  const rowKey = `${r.shiftType}::${r.baseProductName}`;
                  const isExpanded = expandedMasterKey === rowKey;
                  const relatedPrep = isExpanded
                    ? [...currentResult.tab2PrepRice, ...currentResult.tab3PrepCook].filter(
                        (p) =>
                          p.rowType === '작업' &&
                          (p.shiftType === r.shiftType || p.shiftType === '공통') &&
                          p.baseProductName.includes(r.baseProductName)
                      )
                    : [];

                  return (
                    <React.Fragment key={`${rowKey}-${i}`}>
                      <tr
                        onClick={() => setExpandedMasterKey(isExpanded ? null : rowKey)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center font-mono text-slate-400">{i + 1}</td>
                        <td className="py-2.5 px-2 text-center font-bold text-slate-700">{r.shiftType}</td>
                        <td className="py-2.5 px-2">
                          <RiceBadge badge={r.riceColorBadge} label={r.riceColorLabel} />
                        </td>
                        <td className="py-2.5 px-2 font-bold text-slate-700">{r.primaryLine}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-600 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <span>{r.baseProductName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-[13px] text-slate-700 whitespace-nowrap">
                          {r.scheduledTimeRange ? (
                            <span>
                              {r.scheduledTimeRange}{' '}
                              <span className="text-slate-400 text-[12px]">({r.durationMin}m)</span>
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                          {r.eaQty.toLocaleString()}
                          {mode === 'post10' && <DiffBadge diff={r.diffEa} />}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                          {r.totalMaterialKg && r.totalMaterialKg > 0
                            ? `${r.totalMaterialKg.toLocaleString()} kg`
                            : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-12 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full bg-slate-700 rounded-full"
                                style={{ width: `${Math.min(100, (r.sharePct || 0) * 3)}%` }}
                              />
                            </div>
                            <span className="font-mono text-[12.5px] font-bold text-slate-600 w-11 text-right">
                              {(r.sharePct ?? 0).toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={9} className="px-6 py-3 border-b border-slate-200">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-[13px] font-black text-slate-800">
                                <span>
                                  🔄 [{r.shiftType}] {r.baseProductName} — 전처리 → 성형 릴레이 타임라인
                                </span>
                                <span className="font-mono text-blue-700">
                                  성형장({r.primaryLine}): {r.scheduledTimeRange || '시간 미정'}
                                </span>
                              </div>
                              {relatedPrep.length === 0 ? (
                                <div className="text-[12.5px] text-slate-500 py-1">
                                  등록된 중량(g/kg) 기반 BOM 전처리 항목이 없습니다.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {relatedPrep.map((p) => (
                                    <div
                                      key={p.id}
                                      className="px-3 py-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2 text-[12.5px]"
                                    >
                                      <div className="min-w-0">
                                        <div className="font-black text-slate-800">
                                          {p.room}{' '}
                                          <span className="font-mono text-slate-500 font-bold">
                                            {p.timeRange}
                                          </span>
                                        </div>
                                        <div className="text-slate-600 truncate">{p.materialName}</div>
                                      </div>
                                      <span className="font-mono font-black text-slate-900 whitespace-nowrap">
                                        {p.requiredKg.toFixed(2)} kg
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'tab2' || activeTab === 'tab3' ? (
          <table className="w-full text-[14px] text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100 text-slate-800 text-[13.5px] font-black border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-32">작업실</th>
                <th className="py-2.5 px-2 w-16 text-center">인원</th>
                <th className="py-2.5 px-2 w-16 text-center">편</th>
                <th className="py-2.5 px-2 w-32">시간대</th>
                <th className="py-2.5 px-2 w-24">밥색상</th>
                <th className="py-2.5 px-2 w-32">대상라인</th>
                <th className="py-2.5 px-3">기본상품명</th>
                <th className="py-2.5 px-3">투입 원물</th>
                <th className="py-2.5 px-3 text-right w-28">필요중량(kg)</th>
                <th className="py-2.5 px-3">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(activeTab === 'tab2' ? currentResult.tab2PrepRice : currentResult.tab3PrepCook)
                .filter((r) => roomOrLineFilter === '전체' || r.room === roomOrLineFilter)
                .map((r) => (
                  <tr
                    key={r.id}
                    className={
                      r.rowType === '세척/전환'
                        ? 'bg-sky-50/50'
                        : r.isBatched
                        ? 'bg-amber-50/40'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2 px-3 font-black text-slate-800">{r.room}</td>
                    <td className="py-2 px-2 text-center font-bold text-indigo-700">{r.workers || '-'}</td>
                    <td className="py-2 px-2 text-center font-bold text-slate-600">{r.shiftType}</td>
                    <td className="py-2 px-2 font-mono font-bold text-slate-800">{r.timeRange}</td>
                    <td className="py-2 px-2">
                      <RiceBadge badge={r.riceColorBadge} />
                    </td>
                    <td className="py-2 px-2 text-slate-700 font-semibold">{r.targetLine}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{r.baseProductName}</td>
                    <td className="py-2 px-3 text-slate-700">{r.materialName}</td>
                    <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                      {r.requiredKg > 0 ? `${r.requiredKg.toFixed(2)} kg` : '-'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">{r.note}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[14px] text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100 text-slate-800 text-[13.5px] font-black border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-32">라인</th>
                <th className="py-2.5 px-2 w-14 text-center">순</th>
                <th className="py-2.5 px-2 w-16 text-center">편</th>
                <th className="py-2.5 px-2 w-32">시간대</th>
                <th className="py-2.5 px-2 w-20 text-right">분</th>
                <th className="py-2.5 px-2 w-28">밥색상</th>
                <th className="py-2.5 px-3">품목 / 공정 내용</th>
                <th className="py-2.5 px-3 text-right w-36">발주수량(EA)</th>
                <th className="py-2.5 px-2 text-center w-16">인원</th>
                <th className="py-2.5 px-2 text-right w-24">UPH</th>
                <th className="py-2.5 px-3">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(activeTab === 'tab4' ? currentResult.tab4FormingBentoGimbap : currentResult.tab5FormingSamgak)
                .filter((r) => roomOrLineFilter === '전체' || r.lineName === roomOrLineFilter)
                .map((r) => (
                  <tr
                    key={r.id}
                    className={
                      r.rowType !== '생산' ? 'bg-sky-50/50 text-sky-900' : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2 px-3 font-black text-slate-800">{r.lineName}</td>
                    <td className="py-2 px-2 text-center font-mono text-slate-400">{r.seq}</td>
                    <td className="py-2 px-2 text-center font-bold text-slate-700">{r.shiftType}</td>
                    <td className="py-2 px-2 font-mono font-bold text-slate-800">{r.timeRange}</td>
                    <td className="py-2 px-2 text-right font-mono text-slate-600">{r.durationMin}분</td>
                    <td className="py-2 px-2">
                      <RiceBadge badge={r.riceColorBadge} />
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-900">{r.baseProductName}</td>
                    <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                      {r.eaQty > 0 ? r.eaQty.toLocaleString() : '-'}
                      {mode === 'post10' && <DiffBadge diff={r.diffEa} />}
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-indigo-700">{r.workers || '-'}</td>
                    <td className="py-2 px-2 text-right font-mono text-slate-500">
                      {r.uph.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-slate-500">{r.note}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

