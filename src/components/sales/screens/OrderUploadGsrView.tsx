'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { SalesActionBar } from '../common/SalesActionBar';
import { SalesDataGrid, GridColumnDef } from '../common/SalesDataGrid';
import { usePipeline } from '@/context/PipelineContext';
import { exportGridToExcel } from '@/lib/excelExport';
import { parseOrderStatusRows, pickOrderSheetName } from '@/lib/gfs/salesIntake';

interface OrderUploadRow {
  id: number;
  gubun: string;      // 구분
  partNo: string;     // 품번
  partName: string;   // 품명
  spec: string;       // 규격
  unit: string;       // 단위
  orderQty: number;   // 주문수량
  delivDate: string;  // 납품일자
  unitPrice: number;  // 납품단가
  orderAmt: number;   // 주문금액
  delivTo: string;    // 납품처
  shipTo: string;     // 배송처
  poNo: string;       // P/O no.
  shift: string;      // 편수
  remark: string;     // 비고
  status: string;     // 상태
}

const INITIAL_ROWS: OrderUploadRow[] = [
  { id: 1, gubun: '정상', partNo: '27000388865', partName: '넷플)더담은K떡볶이김밥', spec: '240g', unit: 'ea', orderQty: 180, delivDate: '2026-10-30', unitPrice: 2545, orderAmt: 458100, delivTo: 'GS리테일(주)', shipTo: 'GSR 김해일배', poNo: 'PO-20261029-01', shift: '1편', remark: '오전납품', status: '확정' },
  { id: 2, gubun: '정상', partNo: '27000388781', partName: '더블치즈소시지김밥1편', spec: '230g', unit: 'ea', orderQty: 220, delivDate: '2026-10-30', unitPrice: 2160, orderAmt: 475200, delivTo: 'GS리테일(주)', shipTo: 'GSR 김해일배', poNo: 'PO-20261029-02', shift: '1편', remark: '오전납품', status: '확정' },
  { id: 3, gubun: '정상', partNo: '27000388782', partName: '불고기치즈김밥2편', spec: '235g', unit: 'ea', orderQty: 150, delivDate: '2026-10-30', unitPrice: 2127, orderAmt: 319050, delivTo: 'GS리테일(주)', shipTo: 'GSR 김해2일배', poNo: 'PO-20261029-03', shift: '2편', remark: '야간납품', status: '확정' },
  { id: 4, gubun: '정상', partNo: '27000388804', partName: '직화)한돈제육쌈김밥', spec: '240g', unit: 'ea', orderQty: 130, delivDate: '2026-10-30', unitPrice: 2186, orderAmt: 284180, delivTo: 'GS리테일(주)', shipTo: 'GSR 양산조리센터', poNo: 'PO-20261029-04', shift: '2편', remark: '야간납품', status: '확정' },
  { id: 5, gubun: '정상', partNo: '27000388820', partName: '더큰)오징어제육깻잎주먹밥', spec: '160g', unit: 'ea', orderQty: 350, delivDate: '2026-10-30', unitPrice: 1064, orderAmt: 372400, delivTo: 'GS리테일(주)', shipTo: 'GSR 부산물류센터', poNo: 'PO-20261029-05', shift: '1편', remark: '오전납품', status: '확정' },
  { id: 6, gubun: '정상', partNo: '27000388710', partName: '착한1900핫도그(양배추)', spec: '130g', unit: 'ea', orderQty: 90, delivDate: '2026-10-30', unitPrice: 1286, orderAmt: 115740, delivTo: 'GS리테일(주)', shipTo: 'GSR 신광주 저온', poNo: 'PO-20261029-06', shift: '1편', remark: '오전납품', status: '확정' },
  { id: 7, gubun: '정상', partNo: '27000388733', partName: '혜자)돌아온제육도시락', spec: '460g', unit: 'ea', orderQty: 240, delivDate: '2026-10-30', unitPrice: 3915, orderAmt: 939600, delivTo: 'GS리테일(주)', shipTo: 'GSR 김해일배', poNo: 'PO-20261029-07', shift: '1편', remark: '오전납품', status: '확정' },
  { id: 8, gubun: '정상', partNo: '27000388859', partName: '혜자)통등심돈까스도시락', spec: '480g', unit: 'ea', orderQty: 160, delivDate: '2026-10-30', unitPrice: 4900, orderAmt: 784000, delivTo: 'GS리테일(주)', shipTo: 'GSR 해인 CVS', poNo: 'PO-20261029-08', shift: '1편', remark: '오전납품', status: '확정' },
];

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

export const OrderUploadGsrView: React.FC = () => {
  const [data, setData] = useState<OrderUploadRow[]>(INITIAL_ROWS);
  const { openExcelOrderModal } = usePipeline();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isIntaking, setIsIntaking] = useState(false);

  const loadOrders = useCallback(() => {
    fetch('/api/sales/order')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const loaded: OrderUploadRow[] = [];
          json.data.forEach((o: any) => {
            (o.details || []).forEach((dt: any, dtIdx: number) => {
              loaded.push({
                id: dt.id || dtIdx + 1,
                gubun: '정규',
                partNo: dt.product?.productCode || '27000388865',
                partName: dt.product?.name || '제품',
                spec: dt.product?.spec || '230g',
                unit: dt.product?.unit || 'ea',
                orderQty: dt.totalQty ?? 0,
                delivDate: o.orderDate,
                unitPrice: dt.unitPrice ?? 0,
                orderAmt: dt.amount ?? 0,
                delivTo: o.centerCode || 'GS리테일',
                shipTo: o.centerCode || '김해물류',
                poNo: o.orderNo,
                shift: o.shift || '1편',
                remark: o.remark || '정상 접수',
                status: o.status || '완료',
              });
            });
          });
          if (loaded.length > 0) {
            setData(loaded);
          }
        }
      })
      .catch((err) => console.error('Failed to load uploaded orders', err));
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // 발주현황(카톡보내기) 엑셀 → 수주 일괄등록
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
        if (r && r.length > 0) {
          parsed = r;
          usedSheet = n;
          break;
        }
      }
      if (!parsed || parsed.length === 0) {
        alert('발주현황 시트를 찾지 못했습니다. (분류/품명/1편/2편 헤더 확인)');
        return;
      }
      const orderDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      let allowDuplicate = false;
      try {
        const dupRes = await fetch(`/api/sales/order?orderDate=${orderDate}`);
        const dupJson = await dupRes.json();
        const dupList = (dupJson.success && Array.isArray(dupJson.data) ? dupJson.data : []).filter(
          (o: any) => (o.uploadMethod || '').includes('발주현황')
        );
        if (dupList.length > 0) {
          const info = dupList.map((o: any) => `${o.orderNo}`).join(', ');
          if (!window.confirm(`이미 등록된 발주현황이 ${dupList.length}건 있어요 (${info}).\n그래도 새로 등록할까요? (중복 집계 주의)`)) {
            return;
          }
          allowDuplicate = true;
        }
      } catch {
        /* 조회 실패 시 그냥 진행 */
      }
      if (!window.confirm(`[${usedSheet}] 수주 ${parsed.length}건을 ${orderDate} 일자로 등록할까요?`)) {
        return;
      }
      const res = await fetch('/api/sales/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate,
          allowDuplicate,
          items: parsed.map((p) => ({ menuName: p.menuName, category: p.category, qty1: p.qty1, qty2: p.qty2, total: p.total })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`수주 등록 완료 (${json.data.orderNo})\n매칭 ${json.data.matched}건 · 신규 ${json.data.createdProducts}건 · 제외 ${json.data.skipped}건`);
        loadOrders();
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
    setData(INITIAL_ROWS);
    setKeyword('');
    setShowAll(false);
    setFilterDate(new Date().toISOString().slice(0, 10));
  };

  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAll, setShowAll] = useState(false);
  const [keyword, setKeyword] = useState('');

  const shiftDay = (delta: number) => {
    const d = new Date(filterDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setFilterDate(d.toISOString().slice(0, 10));
  };

  const filteredData = useMemo(() => {
    return data.filter((r) => {
      if (!showAll && r.delivDate !== filterDate) return false;
      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        if (
          !String(r.partName || '').toLowerCase().includes(kw) &&
          !String(r.partNo || '').toLowerCase().includes(kw) &&
          !String(r.poNo || '').toLowerCase().includes(kw)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [data, filterDate, showAll, keyword]);

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 (화면 캡처 091210.png: 초기화, 엑셀업로드, ?) */}
      <SalesActionBar
        title="주문등록GSR(upload)"
        buttons={[
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: handleReset },
          { key: 'download', label: '엑셀다운로드', icon: 'excel', variant: 'secondary', onClick: () => exportGridToExcel({ filename: '주문등록_GSR_출하내역', sheetName: '수주내역', columns: COLUMNS, data: filteredData }) },
          { key: 'upload', label: '엑셀업로드', icon: 'excel', variant: 'secondary', onClick: openExcelOrderModal },
          { key: 'intake', label: isIntaking ? '등록 중...' : '발주현황 업로드', icon: 'excel', variant: 'primary', onClick: () => fileRef.current?.click() },
        ]}
        helpContent="GS리테일 B2B EDI 시스템에서 내려받은 점포별/센터별 발주 엑셀 파일을 업로드하여 생산 및 출하 시스템으로 일괄 등록합니다. [발주현황 업로드]는 카톡 발주현황 엑셀(완제품 1편/2편)을 수주로 일괄 등록합니다 (LIVE 버팀일 계산의 수주 근거)."
      />
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleIntakeFile(f);
        }}
      />

      {/* 2. 서브 헤더 바 (화면 캡처 091210.png: 최종업로드일시) */}
      <div className="h-[25px] bg-[#f8fafc] border-b border-gray-300 px-3 flex items-center justify-between text-[11px] text-gray-700 font-sans shadow-2xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-600">최종업로드일시:</span>
          <span className="font-mono text-blue-900 font-bold">2026-10-29 14:15</span>
        </div>
        <div className="text-gray-500 text-[10px]">
          GS리테일 B2B 자동수신 채널 연동 중
        </div>
      </div>

      {/* 3. 조회 조건 바 (일자별 수주 조회) */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex flex-wrap items-center gap-3 text-[12px] shrink-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-gray-700">기준일자:</span>
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            className="px-1.5 py-0.5 bg-white border border-gray-400 rounded-l-xs text-[11px] font-bold hover:bg-gray-100"
          >
            &lt;
          </button>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            disabled={showAll}
            className="bg-white border-y border-gray-400 px-1.5 py-0.5 text-[12px] font-mono outline-none disabled:bg-gray-100 disabled:text-gray-400"
          />
          <button
            type="button"
            onClick={() => shiftDay(1)}
            className="px-1.5 py-0.5 bg-white border border-gray-400 rounded-r-xs text-[11px] font-bold hover:bg-gray-100"
          >
            &gt;
          </button>
        </div>
        <label className="flex items-center gap-1 cursor-pointer font-medium text-gray-700">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="accent-blue-600"
          />
          전체 보기
        </label>
        <div className="flex items-center gap-1">
          <span className="font-semibold text-gray-700">검색어:</span>
          <input
            type="text"
            placeholder="품명 / 품번 / 발주번호"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="bg-white border border-gray-400 px-2 py-0.5 text-[12px] rounded-xs w-44 outline-none focus:border-blue-500"
          />
        </div>
        <span className="ml-auto text-[11px] text-gray-600 font-semibold bg-white px-2 py-0.5 rounded border border-gray-300">
          <span className="text-blue-700 font-bold">{filteredData.length}</span>건
        </span>
      </div>

      {/* 4. 그리드 영역 (#c5c9f7 연보라 헤더, #fdfde0 하단 합계줄) */}
      <div className="flex-1 p-1 min-h-0 overflow-hidden flex flex-col">
        <SalesDataGrid columns={COLUMNS} data={filteredData} />
      </div>
    </div>
  );
};
