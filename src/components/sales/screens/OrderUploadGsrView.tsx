'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesDataGrid, GridColumnDef } from '../common/SalesDataGrid';
import { usePipeline } from '@/context/PipelineContext';
import { exportGridToExcel } from '@/lib/excelExport';
import { parseOrderStatusRows, pickOrderSheetName } from '@/lib/gfs/salesIntake';
import { CheckCircle2, Loader2, Search, Trash2 } from 'lucide-react';

interface OrderUploadRow {
  id: number;
  gubun: string;
  partNo: string;
  partName: string;
  spec: string;
  unit: string;
  orderQty: number;
  delivDate: string;
  unitPrice: number;
  orderAmt: number;
  delivTo: string;
  shipTo: string;
  poNo: string;
  shift: string;
  remark: string;
  status: string;
  orderCreatedAt: string;
}

const COLUMNS: GridColumnDef[] = [
  { key: 'gubun', label: '구분', width: '60px', align: 'center' },
  { key: 'partNo', label: '품번', width: '105px', align: 'center' },
  { key: 'partName', minWidth: '260px', label: '품명', align: 'left' },
  { key: 'spec', label: '규격', width: '70px', align: 'center' },
  { key: 'unit', label: '단위', width: '45px', align: 'center' },
  { key: 'orderQty', label: '주문수량', width: '80px', align: 'right', format: 'number' },
  { key: 'delivDate', label: '납품일자', width: '90px', align: 'center', format: 'date' },
  { key: 'unitPrice', label: '납품단가', width: '85px', align: 'right', format: 'currency' },
  { key: 'orderAmt', label: '주문금액', width: '100px', align: 'right', format: 'currency' },
  { key: 'delivTo', label: '납품처', width: '110px', align: 'left' },
  { key: 'shipTo', label: '배송처', width: '120px', align: 'left' },
  { key: 'poNo', label: 'P/O no.', width: '130px', align: 'center' },
  { key: 'shift', label: '편수', width: '55px', align: 'center' },
  { key: 'remark', label: '비고', width: '110px', align: 'left' },
  { key: 'status', label: '상태', width: '60px', align: 'center' },
];

interface IntakePayloadItem {
  menuName: string;
  category?: string;
  qty1?: number;
  qty2?: number;
  total?: number;
}

interface IntakeResult {
  ok: boolean;
  orderNo?: string;
  itemCount?: number;
  matched?: number;
  createdProducts?: number;
  skipped?: number;
  error?: string;
  duplicate?: boolean;
  duplicateInfo?: string;
}

type DateMode = 'day' | 'week' | 'month' | '30days';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function computeRange(mode: DateMode, filterDate: string): { startDate: string; endDate: string } {
  if (mode === 'day') return { startDate: filterDate, endDate: filterDate };
  const d = new Date(filterDate + 'T00:00:00');
  if (mode === 'week') {
    const dow = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
    const sun = new Date(d); sun.setDate(d.getDate() - dow + 7);
    return {
      startDate: mon.toISOString().slice(0, 10),
      endDate: sun.toISOString().slice(0, 10),
    };
  }
  if (mode === 'month') {
    const y = Number(filterDate.slice(0, 4));
    const m = Number(filterDate.slice(5, 7));
    const last = new Date(y, m, 0).getDate();
    return {
      startDate: `${filterDate.slice(0, 7)}-01`,
      endDate: `${filterDate.slice(0, 7)}-${pad(last)}`,
    };
  }
  const start = new Date(Date.now() + 9 * 3600 * 1000 - 29 * 86400000);
  return { startDate: start.toISOString().slice(0, 10), endDate: filterDate };
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

export const OrderUploadGsrView: React.FC = () => {
  const [data, setData] = useState<OrderUploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { openExcelOrderModal } = usePipeline();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isIntaking, setIsIntaking] = useState(false);

  const [dateMode, setDateMode] = useState<DateMode>('day');
  const [filterDate, setFilterDate] = useState(kstToday);
  const [keyword, setKeyword] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // 수주 등록용 일자 (기본 오늘, 백필 시 과거일자 지정)
  const [intakeDate, setIntakeDate] = useState(kstToday);

  // 일괄 업로드 (멀티파일 + 파일별 날짜)
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRows, setBatchRows] = useState<{ key: number; file: File; date: string }[]>([]);
  const [batchStart, setBatchStart] = useState(kstToday);
  const [batchReplace, setBatchReplace] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchReport, setBatchReport] = useState<Record<number, string>>({});
  const batchKey = useRef(0);
  const batchFileRef = useRef<HTMLInputElement>(null);

  const dateRange = useMemo(() => computeRange(dateMode, filterDate), [dateMode, filterDate]);

  const loadOrders = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      const res = await fetch(`/api/sales/order?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const loaded: OrderUploadRow[] = [];
        json.data.forEach((o: any) => {
          (o.details || []).forEach((dt: any) => {
            loaded.push({
              id: dt.id || 0,
              gubun: '정규',
              partNo: dt.product?.productCode || '',
              partName: dt.product?.name || '',
              spec: dt.product?.spec || '',
              unit: dt.product?.unit || 'ea',
              orderQty: dt.totalQty ?? 0,
              delivDate: o.orderDate,
              unitPrice: dt.unitPrice ?? 0,
              orderAmt: dt.amount ?? 0,
              delivTo: o.centerCode || '',
              shipTo: o.centerCode || '',
              poNo: o.orderNo,
              shift: o.shift || '',
              remark: o.remark || '',
              status: o.status || '',
              orderCreatedAt: o.createdAt || '',
            });
          });
        });
        setData(loaded);
      } else {
        setError(json.error || '수주 데이터를 불러오지 못했습니다.');
        setData([]);
      }
    } catch (err) {
      console.error('Failed to load orders:', err);
      setError('수주 데이터를 불러오지 못했습니다.');
      setData([]);
    } finally { setLoading(false); }
  }, [dateRange]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  // 발주현황 엑셀 파싱 (시트 자동탐색)
  const parseIntakeFile = async (file: File): Promise<IntakePayloadItem[] | null> => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const names = pickOrderSheetName(wb.SheetNames);
    for (const n of names) {
      const ws = wb.Sheets[n];
      if (!ws) continue;
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const r = parseOrderStatusRows(rows);
      if (r && r.length > 0) return r;
    }
    return null;
  };

  const postIntake = async (
    orderDate: string,
    items: IntakePayloadItem[],
    replaceByDate: boolean
  ): Promise<IntakeResult> => {
    const res = await fetch('/api/sales/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderDate, items, replaceByDate }),
    });
    const json = await res.json();
    if (json.success) {
      return {
        ok: true,
        orderNo: json.data.orderNo,
        itemCount: json.data.itemCount,
        matched: json.data.matched,
        createdProducts: json.data.createdProducts,
        skipped: json.data.skipped,
      };
    }
    if (json.code === 'DUPLICATE_ORDER') {
      return { ok: false, duplicate: true, duplicateInfo: json.error, error: json.error };
    }
    return { ok: false, error: json.error || '알 수 없는 오류' };
  };

  const handleIntakeFile = async (file: File) => {
    setIsIntaking(true);
    try {
      const parsed = await parseIntakeFile(file);
      if (!parsed) {
        alert('발주현황 시트를 찾지 못했습니다. (분류/품명/1편/2편 헤더 확인)');
        return;
      }
      const items = parsed.map((p) => ({ menuName: p.menuName, category: p.category, qty1: p.qty1, qty2: p.qty2, total: p.total }));
      let result = await postIntake(intakeDate, items, false);

      // 중복 감지 → 교체 등록 확인
      if (result.duplicate) {
        if (!window.confirm(`${result.duplicateInfo}\n\n기존 수주를 삭제하고 새로 등록할까요?\n(기존 데이터는 완전 삭제됩니다)`)) return;
        result = await postIntake(intakeDate, items, true);
      }

      if (result.ok) {
        alert(`수주 등록 완료 (${intakeDate} / ${result.orderNo})\n매칭 ${result.matched}건 · 신규 ${result.createdProducts}건 · 제외 ${result.skipped}건`);
        void loadOrders();
      } else {
        alert('수주 등록 실패: ' + (result.error || '알 수 없는 오류'));
      }
    } catch (e: any) {
      alert('파일 처리 중 오류: ' + e.message);
    } finally {
      setIsIntaking(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ── 일괄 업로드 ──
  const handleBatchFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const rows = Array.from(files).map((file) => ({ key: batchKey.current++, file, date: '' }));
    setBatchRows((prev) => [...prev, ...rows]);
    setBatchReport({});
    if (batchFileRef.current) batchFileRef.current.value = '';
  };

  const autofillBatchDates = () => {
    if (!batchStart) return;
    const d = new Date(batchStart + 'T00:00:00');
    setBatchRows((prev) =>
      prev.map((r, i) => {
        const dd = new Date(d);
        dd.setDate(d.getDate() + i);
        return { ...r, date: dd.toISOString().slice(0, 10) };
      })
    );
  };

  const runBatch = async () => {
    const targets = batchRows.filter((r) => r.date);
    if (targets.length === 0) {
      alert('날짜가 지정된 파일이 없습니다. 각 파일의 수주일자를 입력하세요.');
      return;
    }
    if (targets.length !== batchRows.length) {
      if (!window.confirm(`날짜 미지정 ${batchRows.length - targets.length}개 파일은 건너뜁니다. 계속할까요?`)) return;
    }
    setBatchRunning(true);
    const report: Record<number, string> = {};
    for (const row of targets) {
      try {
        const parsed = await parseIntakeFile(row.file);
        if (!parsed) {
          report[row.key] = '실패: 발주현황 시트를 찾지 못함';
          setBatchReport({ ...report });
          continue;
        }
        const items = parsed.map((p) => ({ menuName: p.menuName, category: p.category, qty1: p.qty1, qty2: p.qty2, total: p.total }));
        let result = await postIntake(row.date, items, batchReplace);
        if (result.duplicate && !batchReplace) {
          report[row.key] = '중복: 이미 등록됨 (교체 미지정)';
        } else if (result.ok) {
          report[row.key] = `완료: ${result.itemCount}건 (매칭 ${result.matched}·신규 ${result.createdProducts}·제외 ${result.skipped})`;
        } else {
          report[row.key] = `실패: ${result.error}`;
        }
      } catch (e: any) {
        report[row.key] = `실패: ${e.message}`;
      }
      setBatchReport({ ...report });
    }
    setBatchRunning(false);
    void loadOrders();
  };

  const handleDeleteByDate = async () => {
    if (filteredData.length === 0) return;
    const totalAmt = filteredData.reduce((s, r) => s + (r.orderAmt || 0), 0);
    const totalQty = filteredData.reduce((s, r) => s + (r.orderQty || 0), 0);
    if (!window.confirm(`${filterDate} 수주 ${filteredData.length}건 (품목 ${totalQty.toLocaleString()}개, 합계 ₩${totalAmt.toLocaleString()})을\n완전 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      const res = await fetch(`/api/sales/order?date=${filterDate}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setToast(`${filterDate} 수주 ${json.deleted}건이 삭제되었습니다.`);
        window.setTimeout(() => setToast(null), 2500);
        void loadOrders();
      } else {
        alert(json.error || '삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to delete orders by date:', err);
      alert('삭제에 실패했습니다.');
    }
  };

  const shiftDay = (delta: number) => {
    setDateMode('day');
    const d = new Date(filterDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setFilterDate(d.toISOString().slice(0, 10));
  };

  const filteredData = useMemo(() => {
    if (!keyword.trim()) return data;
    const kw = keyword.trim().toLowerCase();
    return data.filter((r) =>
      String(r.partName || '').toLowerCase().includes(kw) ||
      String(r.partNo || '').toLowerCase().includes(kw) ||
      String(r.poNo || '').toLowerCase().includes(kw)
    );
  }, [data, keyword]);

  const totalQty = useMemo(() => filteredData.reduce((s, r) => s + (r.orderQty || 0), 0), [filteredData]);
  const totalAmt = useMemo(() => filteredData.reduce((s, r) => s + (r.orderAmt || 0), 0), [filteredData]);
  const lastUpload = useMemo(() => {
    if (data.length === 0) return '';
    return data.reduce((latest, r) => (r.orderCreatedAt > latest ? r.orderCreatedAt : latest), '');
  }, [data]);

  const MODE_LABELS: Record<DateMode, string> = {
    day: '일별', week: '이번 주', month: '이번 달', '30days': '최근 30일',
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {toast && (
        <div className="fixed top-14 right-6 z-[300] flex items-center gap-2 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2 text-[11.5px] font-semibold text-[#047857] shadow-lg">
          <CheckCircle2 className="w-4 h-4" />{toast}
        </div>
      )}

      <SalesActionBar
        title="주문등록GSR(upload)"
        buttons={[
          { key: 'download', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: () => exportGridToExcel({ filename: '주문등록_GSR_출하내역', sheetName: '수주내역', columns: COLUMNS, data: filteredData }) },
          { key: 'upload', label: '엑셀업로드', icon: 'excel', variant: 'secondary', onClick: openExcelOrderModal },
          { key: 'intake', label: isIntaking ? '등록 중...' : '발주현황 업로드', icon: 'excel', variant: 'primary', onClick: () => fileRef.current?.click() },
          { key: 'batch', label: '일괄 업로드', icon: 'excel', variant: 'secondary', onClick: () => setBatchOpen(true) },
          { key: 'deleteDate', label: '일자 삭제', icon: 'delete', variant: 'secondary', onClick: () => void handleDeleteByDate() },
        ]}
        helpContent="GS리테일 B2B EDI 시스템에서 내려받은 점포별/센터별 발주 엑셀 파일을 업로드하여 생산 및 출하 시스템으로 일괄 등록합니다. [발주현황 업로드]는 카톡 발주현황 엑셀(완제품 1편/2편)을 수주로 일괄 등록합니다."
      />
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIntakeFile(f); }} />

      {/* 서브 헤더 */}
      <div className="h-[25px] bg-[#f8fafc] border-b border-gray-300 px-3 flex items-center justify-between text-[11px] text-gray-700 font-sans shadow-2xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-600">최종업로드일시:</span>
          {lastUpload ? (
            <span className="font-mono text-blue-900 font-bold">
              {new Date(lastUpload).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
        <div className="text-gray-500 text-[10px]">GS리테일 B2B 자동수신 채널 연동 중</div>
      </div>

      {/* 조회 조건 바 */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex flex-wrap items-center gap-2 text-[12px] shrink-0">
        {/* 기간 칩 */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[#e2e8f0] border border-gray-300">
          {(Object.keys(MODE_LABELS) as DateMode[]).map((m) => (
            <button key={m} type="button" onClick={() => { setDateMode(m); }}
              className={`px-2 py-[3px] text-[11px] font-bold rounded-[5px] transition-all cursor-pointer ${
                dateMode === m ? 'bg-white text-[var(--ink-900)] shadow-sm' : 'text-[var(--ink-600)] hover:text-[var(--ink-900)]'
              }`}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* 날짜 피커 (일별 모드만) */}
        {dateMode === 'day' && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shiftDay(-1)}
              className="px-1.5 py-0.5 bg-white border border-gray-400 rounded-l-xs text-[11px] font-bold hover:bg-gray-100">&lt;</button>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
              className="bg-white border-y border-gray-400 px-1.5 py-0.5 text-[12px] font-mono outline-none" />
            <button type="button" onClick={() => shiftDay(1)}
              className="px-1.5 py-0.5 bg-white border border-gray-400 rounded-r-xs text-[11px] font-bold hover:bg-gray-100">&gt;</button>
          </div>
        )}

        {/* 날짜 범위 표시 (day 외 모드) */}
        {dateMode !== 'day' && (
          <span className="num text-[11.5px] font-semibold text-[var(--ink-700)] bg-white px-2 py-0.5 rounded border border-gray-300">
            {dateRange.startDate} ~ {dateRange.endDate}
          </span>
        )}

        {/* 검색 */}
        <div className="flex items-center gap-1">
          <Search className="w-3.5 h-3.5 text-[var(--ink-400)]" />
          <input type="text" placeholder="품명 / 품번 / 발주번호" value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] rounded-xs w-44 outline-none focus:border-blue-500" />
        </div>

        {/* 수주일자 (등록용) */}
        <div className="flex items-center gap-1 ml-1 pl-2 border-l border-gray-300">
          <span className="text-[11px] font-bold text-gray-600">수주일자(등록용)</span>
          <input type="date" value={intakeDate} onChange={(e) => setIntakeDate(e.target.value)}
            className="bg-white border border-gray-400 px-1.5 py-0.5 text-[12px] font-mono outline-none focus:border-blue-500" />
        </div>

        <span className="ml-auto text-[11px] text-gray-600 font-semibold bg-white px-2 py-0.5 rounded border border-gray-300">
          <span className="text-blue-700 font-bold">{filteredData.length}</span>건
        </span>
      </div>

      {/* 에러 */}
      {error && (
        <div className="mx-1 mt-1 flex items-center gap-2 rounded-md border border-[#fecdd3] bg-[#fff1f2] px-3 py-2 text-[11.5px] text-[#9f1239]">
          <Loader2 className="w-4 h-4" />{error}
        </div>
      )}

      {/* 그리드 */}
      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="flex items-center gap-2 text-[var(--ink-400)] text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin" />불러오는 중...
            </div>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center">
              <div className="text-[var(--ink-400)] text-[12px]">
                {dateMode === 'day'
                  ? `${filterDate}에 등록된 수주가 없습니다.`
                  : `${dateRange.startDate} ~ ${dateRange.endDate} 기간에 수주가 없습니다.`}
              </div>
              <div className="mt-1 text-[10.5px] text-[var(--ink-400)]">
                상단 [발주현황 업로드] 또는 [엑셀업로드]로 수주를 등록하세요.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-hidden">
              <SalesDataGrid columns={COLUMNS} data={filteredData} />
            </div>
            {/* 요약 푸터 */}
            <div className="h-[26px] bg-[#fdfde0] border-t border-gray-400 px-3 flex items-center gap-6 text-[12px] font-bold shrink-0">
              <span className="text-gray-700">합계</span>
              <span className="text-gray-400">전체 잠계</span>
              <span className="num text-blue-900">{totalQty.toLocaleString()}</span>
              <span className="num text-blue-900 ml-auto">₩{totalAmt.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      {/* 일괄 업로드 모달 */}
      {batchOpen && (
        <div className="fixed inset-0 z-[400] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-[680px] max-w-full max-h-[85vh] flex flex-col text-[12px]">
            <div className="px-4 py-2.5 border-b border-gray-300 flex items-center justify-between bg-[#f8fafc]">
              <span className="font-bold text-[13px]">수주 일괄 업로드 (파일별 일자 지정)</span>
              <button type="button" onClick={() => { if (!batchRunning) setBatchOpen(false); }}
                className="px-2 py-0.5 border border-gray-400 rounded bg-white hover:bg-gray-100 font-bold">닫기</button>
            </div>
            <div className="px-4 py-2 border-b border-gray-200 flex flex-wrap items-center gap-2 bg-white">
              <button type="button" onClick={() => batchFileRef.current?.click()} disabled={batchRunning}
                className="px-2.5 py-1 border border-gray-400 rounded bg-white hover:bg-gray-100 font-bold disabled:opacity-50">
                파일 선택(여러 개)
              </button>
              <input ref={batchFileRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
                onChange={(e) => handleBatchFiles(e.target.files)} />
              <span className="text-gray-500">시작일</span>
              <input type="date" value={batchStart} onChange={(e) => setBatchStart(e.target.value)} disabled={batchRunning}
                className="bg-white border border-gray-400 px-1.5 py-0.5 font-mono outline-none disabled:opacity-50" />
              <button type="button" onClick={autofillBatchDates} disabled={batchRunning || batchRows.length === 0}
                className="px-2.5 py-1 border border-gray-400 rounded bg-white hover:bg-gray-100 font-bold disabled:opacity-50">
                날짜 자동채움(1일씩)
              </button>
              <label className="flex items-center gap-1 ml-auto text-gray-700">
                <input type="checkbox" checked={batchReplace} onChange={(e) => setBatchReplace(e.target.checked)} disabled={batchRunning} />
                중복 시 교체 등록
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 min-h-[120px]">
              {batchRows.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  파일을 선택하세요. 각 파일의 수주일자를 지정한 뒤 일괄 등록합니다.<br />
                  (파일명에 날짜가 없어도 됩니다)
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-1 pr-2 font-semibold">파일명</th>
                      <th className="py-1 pr-2 font-semibold w-[130px]">수주일자</th>
                      <th className="py-1 font-semibold">결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((r) => (
                      <tr key={r.key} className="border-b border-gray-100">
                        <td className="py-1 pr-2 truncate max-w-[280px]" title={r.file.name}>{r.file.name}</td>
                        <td className="py-1 pr-2">
                          <input type="date" value={r.date} disabled={batchRunning}
                            onChange={(e) => setBatchRows((prev) => prev.map((x) => x.key === r.key ? { ...x, date: e.target.value } : x))}
                            className="bg-white border border-gray-400 px-1 py-0.5 font-mono text-[11px] outline-none disabled:opacity-50" />
                        </td>
                        <td className="py-1 text-[11px] text-gray-700">{batchReport[r.key] || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-4 py-2 border-t border-gray-300 flex items-center justify-between bg-[#f8fafc]">
              <span className="text-gray-600">
                총 {batchRows.length}개
                {Object.keys(batchReport).length > 0 &&
                  ` · 완료 ${Object.values(batchReport).filter((v) => v.startsWith('완료')).length} / 실패·중복 ${Object.values(batchReport).filter((v) => !v.startsWith('완료')).length}`}
              </span>
              <div className="flex items-center gap-2">
                {batchRows.length > 0 && !batchRunning && (
                  <button type="button" onClick={() => { setBatchRows([]); setBatchReport({}); }}
                    className="px-2.5 py-1 border border-gray-400 rounded bg-white hover:bg-gray-100 font-bold">목록 비우기</button>
                )}
                <button type="button" onClick={() => void runBatch()} disabled={batchRunning || batchRows.length === 0}
                  className="px-3 py-1 rounded bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50">
                  {batchRunning ? '등록 중...' : '일괄 등록'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
