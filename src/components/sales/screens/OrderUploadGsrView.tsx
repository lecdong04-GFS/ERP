'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesDataGrid, GridColumnDef } from '../common/SalesDataGrid';
import { usePipeline } from '@/context/PipelineContext';
import { exportGridToExcel } from '@/lib/excelExport';
import { parseOrderStatusRows, pickOrderSheetName } from '@/lib/gfs/salesIntake';
import { Loader2, Search } from 'lucide-react';

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

  const handleIntakeFile = async (file: File) => {
    setIsIntaking(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const names = pickOrderSheetName(wb.SheetNames);
      let parsed: ReturnType<typeof parseOrderStatusRows> = null;
      let usedSheet = '';
      for (const n of names) {
        const ws = wb.Sheets[n];
        if (!ws) continue;
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        const r = parseOrderStatusRows(rows);
        if (r && r.length > 0) { parsed = r; usedSheet = n; break; }
      }
      if (!parsed || parsed.length === 0) {
        alert('발주현황 시트를 찾지 못했습니다. (분류/품명/1편/2편 헤더 확인)');
        return;
      }
      const orderDate = kstToday();
      let allowDuplicate = false;
      try {
        const dupRes = await fetch(`/api/sales/order?orderDate=${orderDate}`);
        const dupJson = await dupRes.json();
        const dupList = (dupJson.success && Array.isArray(dupJson.data) ? dupJson.data : []).filter(
          (o: any) => (o.uploadMethod || '').includes('발주현황')
        );
        if (dupList.length > 0) {
          const info = dupList.map((o: any) => `${o.orderNo}`).join(', ');
          if (!window.confirm(`이미 등록된 발주현황이 ${dupList.length}건 있어요 (${info}).\n그래도 새로 등록할까요? (중복 집계 주의)`)) return;
          allowDuplicate = true;
        }
      } catch { /* 조회 실패 시 진행 */ }
      if (!window.confirm(`[${usedSheet}] 수주 ${parsed.length}건을 ${orderDate} 일자로 등록할까요?`)) return;
      const res = await fetch('/api/sales/intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate, allowDuplicate,
          items: parsed.map((p) => ({ menuName: p.menuName, category: p.category, qty1: p.qty1, qty2: p.qty2, total: p.total })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`수주 등록 완료 (${json.data.orderNo})\n매칭 ${json.data.matched}건 · 신규 ${json.data.createdProducts}건 · 제외 ${json.data.skipped}건`);
        void loadOrders();
      } else if (json.code === 'DUPLICATE_ORDER') {
        alert('이미 등록된 수주가 있습니다.\n' + (json.error || ''));
      } else {
        alert('수주 등록 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (e: any) {
      alert('파일 처리 중 오류: ' + e.message);
    } finally {
      setIsIntaking(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleReset = () => {
    setDateMode('day');
    setFilterDate(kstToday());
    setKeyword('');
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
      <SalesActionBar
        title="주문등록GSR(upload)"
        buttons={[
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
          { key: 'download', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: () => exportGridToExcel({ filename: '주문등록_GSR_출하내역', sheetName: '수주내역', columns: COLUMNS, data: filteredData }) },
          { key: 'upload', label: '엑셀업로드', icon: 'excel', variant: 'secondary', onClick: openExcelOrderModal },
          { key: 'intake', label: isIntaking ? '등록 중...' : '발주현황 업로드', icon: 'excel', variant: 'primary', onClick: () => fileRef.current?.click() },
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
    </div>
  );
};
