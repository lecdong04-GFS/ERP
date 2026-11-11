'use client';

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Save,
  Check,
  Building2,
  Package,
  Calendar,
  Sparkles,
  Info,
  DollarSign,
  Truck,
} from 'lucide-react';

export interface ParsedReceivingRow {
  receivingDate: string;
  orderNo: string;
  orderDate: string;
  partnerName: string;
  category: string;
  productName: string;
  spec: string;
  unit: string;
  orderPrice: number;
  orderQty: number;
  orderAmt: number;
  carNo: string;
  recvQty: number;
  expiryDate: string;
  carTemp: string;
  markStatus: string;
  lookStatus: string;
  carClean: string;
  totalJudge: string;
  buyPrice: number;
  recvAmt: number;
  diffQty: number;
  diffAmt: number;
  lotNo: string;
  packUnit?: number;
  bagPrice?: number;
  boxPrice?: number;
}

interface ReceivingUploadModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onSuccess: (message?: string) => void;
}

function normalizeDate(val: any): string {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}\.\d{2}\.\d{2}/.test(s)) return s.slice(0, 10).replace(/\./g, '-');
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.slice(0, 10).replace(/\//g, '-');
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    const month = String(mdy[1]).padStart(2, '0');
    const day = String(mdy[2]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const n = Number(s);
  if (!isNaN(n) && n > 20000 && n < 60000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return s;
}

export const ReceivingUploadModal: React.FC<ReceivingUploadModalProps> = ({
  isOpen,
  file,
  onClose,
  onSuccess,
}) => {
  const [parsing, setParsing] = useState<boolean>(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedReceivingRow[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'diff' | 'raw' | 'sub'>('all');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // 파이프라인 옵션
  const [updateStock, setUpdateStock] = useState<boolean>(true);
  const [updatePrice, setUpdatePrice] = useState<boolean>(true);
  const [syncPo, setSyncPo] = useState<boolean>(true);
  const [createLedger, setCreateLedger] = useState<boolean>(true);

  // 파일 파싱 실행
  useEffect(() => {
    if (!isOpen || !file) {
      setParsedRows([]);
      setParseError(null);
      return;
    }

    let isMounted = true;
    setParsing(true);
    setParseError(null);

    const parseFile = async () => {
      try {
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        let wb: XLSX.WorkBook;

        if (isCsv) {
          const buf = await file.arrayBuffer();
          // 한국어 인코딩 감지 (UTF-8 시도 후 깨짐 방지 위해 EUC-KR 폴백)
          let text = '';
          try {
            const utfDecoder = new TextDecoder('utf-8', { fatal: true });
            text = utfDecoder.decode(buf);
          } catch {
            const eucDecoder = new TextDecoder('euc-kr');
            text = eucDecoder.decode(buf);
          }
          wb = XLSX.read(text, { type: 'string', cellDates: false, raw: true });
        } else {
          const buf = await file.arrayBuffer();
          wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true });
        }

        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        if (!ws) throw new Error('엑셀 시트를 찾을 수 없습니다.');

        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        if (!rows || rows.length === 0) throw new Error('파일에 데이터가 없습니다.');

        // 1. 헤더 행 탐색 (최대 상위 25행 스캔)
        let headerRowIdx = -1;
        const colMap: Record<string, number> = {};

        for (let r = 0; r < Math.min(25, rows.length); r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;
          const rowStr = row.map((c) => String(c || '').trim()).join(',');
          if (
            (rowStr.includes('입고일') || rowStr.includes('품명')) &&
            (rowStr.includes('수량') || rowStr.includes('단가') || rowStr.includes('거래처'))
          ) {
            headerRowIdx = r;
            row.forEach((cell, cIdx) => {
              const val = String(cell || '').replace(/\s+/g, '').trim();
              if (val === '입고일' || val === '입고일자') colMap.receivingDate = cIdx;
              else if (val === '발주번호' && colMap.orderNo === undefined) colMap.orderNo = cIdx;
              else if (val === 'po_no' && colMap.orderNo === undefined) colMap.orderNo = cIdx;
              else if (val === '발주일' || val === '발주일자') colMap.orderDate = cIdx;
              else if (val === '거래처' || val === '매입처' || val === '공급사') colMap.partnerName = cIdx;
              else if (val === '구분' || val === '분류' || val === '자재구분') colMap.category = cIdx;
              else if (val === '품명' || val === '품목명' || val === '제품명') colMap.productName = cIdx;
              else if (val === '규격') colMap.spec = cIdx;
              else if (val === '단위') colMap.unit = cIdx;
              else if (val === '발주단가') colMap.orderPrice = cIdx;
              else if (val === '발주수량') colMap.orderQty = cIdx;
              else if (val === '발주금액') colMap.orderAmt = cIdx;
              else if (val === '차량번호') colMap.carNo = cIdx;
              else if (val === '입고수량' || val === '실입고수량') colMap.recvQty = cIdx;
              else if (val === '유통기한') colMap.expiryDate = cIdx;
              else if (val === '차량온도') colMap.carTemp = cIdx;
              else if (val === '표시상태') colMap.markStatus = cIdx;
              else if (val === '외관상태') colMap.lookStatus = cIdx;
              else if (val === '차량청결') colMap.carClean = cIdx;
              else if (val === '종합판정') colMap.totalJudge = cIdx;
              else if (val === '구매단가' || val === '입고단가') colMap.buyPrice = cIdx;
              else if (val === '입수량' || val === '입수') colMap.packUnit = cIdx;
              else if (val === '봉단가') colMap.bagPrice = cIdx;
              else if (val === '박스단가') colMap.boxPrice = cIdx;
              else if (val === '입고금액') colMap.recvAmt = cIdx;
              else if (val === '차이수량') colMap.diffQty = cIdx;
              else if (val === '금액차이' || val === '차이금액') colMap.diffAmt = cIdx;
              else if (val.includes('LOT') || val.includes('lot')) colMap.lotNo = cIdx;
            });
            break;
          }
        }

        if (headerRowIdx === -1 || colMap.productName === undefined) {
          throw new Error('입고 데이터 헤더(입고일, 품명, 수량 등)를 인식할 수 없습니다.');
        }

        const items: ParsedReceivingRow[] = [];
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!Array.isArray(row) || row.length === 0) continue;

          const rawName = String(row[colMap.productName] || '').replace(/\u00A0/g, ' ').trim();
          if (!rawName || rawName === '합계' || rawName.startsWith('소계') || rawName.includes('총계')) {
            continue;
          }

          const recvQty = Number(String(row[colMap.recvQty] || 0).replace(/,/g, '')) || 0;
          const orderQty = Number(String(row[colMap.orderQty] || 0).replace(/,/g, '')) || 0;
          const orderPrice = Number(String(row[colMap.orderPrice] || 0).replace(/,/g, '')) || 0;
          const unitStr = String(row[colMap.unit] || '').trim() || 'box';
          const packUnit = Math.max(1, Number(String(row[colMap.packUnit] || 1).replace(/,/g, '')) || 1);
          const bagPriceIn = Number(String(row[colMap.bagPrice] || 0).replace(/,/g, '')) || 0;
          const boxPriceIn = Number(String(row[colMap.boxPrice] || 0).replace(/,/g, '')) || 0;
          const isBoxU = /^(box|박스|bx|ctn)$/i.test(unitStr);
          let buyPrice = Number(String(row[colMap.buyPrice] || 0).replace(/,/g, '')) || 0;
          if (buyPrice === 0 && isBoxU && boxPriceIn > 0) buyPrice = boxPriceIn;
          if (buyPrice === 0 && !isBoxU && bagPriceIn > 0) buyPrice = bagPriceIn;
          if (buyPrice === 0 && isBoxU && bagPriceIn > 0) buyPrice = Math.round(bagPriceIn * packUnit);
          if (buyPrice === 0 && orderPrice > 0) buyPrice = orderPrice;

          let recvAmt = Number(String(row[colMap.recvAmt] || 0).replace(/,/g, '')) || 0;
          if (recvAmt === 0 && recvQty > 0 && buyPrice > 0) recvAmt = Math.round(recvQty * buyPrice);

          const orderAmt = Number(String(row[colMap.orderAmt] || 0).replace(/,/g, '')) || Math.round(orderQty * orderPrice);
          const diffQty = recvQty - orderQty;
          const diffAmt = recvAmt - orderAmt;

          items.push({
            receivingDate: normalizeDate(row[colMap.receivingDate]),
            orderNo: String(row[colMap.orderNo] || '').trim(),
            orderDate: normalizeDate(row[colMap.orderDate]),
            partnerName: String(row[colMap.partnerName] || '').trim(),
            category: String(row[colMap.category] || '').trim() || '원재료',
            productName: rawName,
            spec: String(row[colMap.spec] || '').trim(),
            unit: String(row[colMap.unit] || '').trim() || 'box',
            orderPrice,
            orderQty,
            orderAmt,
            carNo: String(row[colMap.carNo] || '').trim(),
            recvQty,
            expiryDate: normalizeDate(row[colMap.expiryDate]),
            carTemp: String(row[colMap.carTemp] || '').trim(),
            markStatus: String(row[colMap.markStatus] || 'O').trim(),
            lookStatus: String(row[colMap.lookStatus] || 'O').trim(),
            carClean: String(row[colMap.carClean] || 'O').trim(),
            totalJudge: String(row[colMap.totalJudge] || 'O').trim() || 'O',
            buyPrice,
            recvAmt,
            diffQty,
            diffAmt,
            lotNo: String(row[colMap.lotNo] || '').trim(),
            packUnit,
            bagPrice: bagPriceIn || (isBoxU && packUnit > 1 ? Math.round((buyPrice / packUnit) * 100) / 100 : buyPrice),
            boxPrice: boxPriceIn || (isBoxU ? buyPrice : Math.round(buyPrice * packUnit)),
          });
        }

        if (items.length === 0) {
          throw new Error('유효한 입고 품목 데이터를 추출하지 못했습니다.');
        }

        if (isMounted) {
          setParsedRows(items);
        }
      } catch (err: any) {
        if (isMounted) {
          setParseError(err.message || '파일 파싱 실패');
        }
      } finally {
        if (isMounted) {
          setParsing(false);
        }
      }
    };

    parseFile();

    return () => {
      isMounted = false;
    };
  }, [isOpen, file]);

  // 통계 계산
  const stats = useMemo(() => {
    const totalCount = parsedRows.length;
    const partners = new Set(parsedRows.map((r) => r.partnerName).filter(Boolean));
    const totalRecvAmt = parsedRows.reduce((s, r) => s + r.recvAmt, 0);
    const totalOrderAmt = parsedRows.reduce((s, r) => s + r.orderAmt, 0);
    const totalDiffAmt = totalRecvAmt - totalOrderAmt;
    const diffCount = parsedRows.filter((r) => r.diffQty !== 0 || r.diffAmt !== 0).length;
    const passCount = parsedRows.filter((r) => r.totalJudge === 'O').length;
    const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 100;
    const receivingDate = parsedRows[0]?.receivingDate || '';

    return {
      totalCount,
      partnerCount: partners.size,
      totalRecvAmt,
      totalOrderAmt,
      totalDiffAmt,
      diffCount,
      passRate,
      receivingDate,
    };
  }, [parsedRows]);

  // 필터링된 행 목록
  const displayedRows = useMemo(() => {
    if (activeTab === 'diff') {
      return parsedRows.filter((r) => r.diffQty !== 0 || r.diffAmt !== 0);
    }
    if (activeTab === 'raw') {
      return parsedRows.filter((r) => r.category === '원재료');
    }
    if (activeTab === 'sub') {
      return parsedRows.filter((r) => r.category === '부자재' || r.category === '포장재');
    }
    return parsedRows;
  }, [parsedRows, activeTab]);

  // DB 일괄 저장 실행
  const handleSubmit = async () => {
    if (parsedRows.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/purchase/receiving/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: parsedRows,
          options: {
            updateStock,
            updatePrice,
            syncPo,
            createLedger,
          },
        }),
      });

      const json = await res.json();
      if (json.success) {
        onSuccess(json.message);
        onClose();
      } else {
        alert('입고 저장 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err: any) {
      alert('저장 통신 오류: ' + (err.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-6xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* ── 1. 모달 헤더 ── */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black tracking-tight">자재 입고 및 단가수정 파일 검증</h2>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-blue-400/20 text-blue-200 border border-blue-400/30">
                  {file?.name}
                </span>
              </div>
              <p className="text-xs text-blue-200/80 mt-0.5">
                ProdCore 발주연동 검증 · HACCP 콜드체인 판정 · 창고 실재고 및 구매단가 실시간 동기화
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── 2. 본문 영역 ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
          {parsing ? (
            <div className="py-20 text-center">
              <div className="inline-block w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-base font-bold text-slate-700">입고 파일을 정밀 분석하고 있습니다...</p>
              <p className="text-xs text-slate-400 mt-1">EUC-KR/UTF-8 인코딩 감지, 동적 컬럼 맵핑 및 차이 검증 중</p>
            </div>
          ) : parseError ? (
            <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-center">
              <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto mb-2" />
              <h3 className="text-lg font-black text-rose-950">파일 파싱 실패</h3>
              <p className="text-sm mt-1 text-rose-700">{parseError}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 px-5 py-2 rounded-xl bg-white border border-rose-300 text-rose-800 font-bold text-sm hover:bg-rose-100 transition-colors cursor-pointer"
              >
                닫기
              </button>
            </div>
          ) : (
            <>
              {/* ── 상단 5대 핵심 KPI 배너 ── */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-xs font-bold text-slate-400 block flex items-center gap-1.5">
                    <Calendar size={14} className="text-blue-500" /> 입고 기준일자
                  </span>
                  <span className="text-xl font-black text-slate-900 mt-1 block font-mono">
                    {stats.receivingDate || '2026-11-09'}
                  </span>
                  <span className="text-xs text-blue-600 font-medium">당일 전표 생성</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-xs font-bold text-slate-400 block flex items-center gap-1.5">
                    <Package size={14} className="text-indigo-500" /> 총 입고 품목
                  </span>
                  <span className="text-xl font-black text-slate-900 mt-1 block font-mono">
                    {stats.totalCount}건
                  </span>
                  <span className="text-xs text-slate-500 font-medium">{stats.partnerCount}개 공급 거래처</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-xs font-bold text-slate-400 block flex items-center gap-1.5">
                    <DollarSign size={14} className="text-emerald-500" /> 총 입고 금액
                  </span>
                  <span className="text-xl font-black text-emerald-700 mt-1 block font-mono">
                    ₩{stats.totalRecvAmt.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    발주액 ₩{stats.totalOrderAmt.toLocaleString()}
                  </span>
                </div>

                <div className={`p-4 rounded-xl border shadow-2xs ${
                  stats.diffCount > 0 ? 'bg-amber-50/70 border-amber-200 text-amber-900' : 'bg-white border-slate-200'
                }`}>
                  <span className="text-xs font-bold text-slate-400 block flex items-center gap-1.5">
                    <AlertTriangle size={14} className={stats.diffCount > 0 ? 'text-amber-500' : 'text-slate-400'} />
                    수량·금액 차이 품목
                  </span>
                  <span className={`text-xl font-black mt-1 block font-mono ${stats.diffCount > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                    {stats.diffCount}건
                  </span>
                  <span className="text-xs font-medium">
                    {stats.totalDiffAmt > 0 ? `+₩${stats.totalDiffAmt.toLocaleString()} 초과` : '정상 합치'}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-xs font-bold text-slate-400 block flex items-center gap-1.5">
                    <Truck size={14} className="text-purple-500" /> HACCP 콜드체인
                  </span>
                  <span className="text-xl font-black text-purple-700 mt-1 block font-mono">
                    {stats.passRate}%
                  </span>
                  <span className="text-xs text-purple-600 font-medium">외관·표시·온도 적합</span>
                </div>
              </div>

              {/* ── 탭 네비게이션 ── */}
              <div className="flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                      activeTab === 'all'
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    전체 품목 ({stats.totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('diff')}
                    className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                      activeTab === 'diff'
                        ? 'border-amber-600 text-amber-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    수량·금액 차이 품목 ({stats.diffCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('raw')}
                    className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                      activeTab === 'raw'
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    원재료
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sub')}
                    className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                      activeTab === 'sub'
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    부자재·포장재
                  </button>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {displayedRows.length}개 표시 중
                </span>
              </div>

              {/* ── 미리보기 데이터 그리드 ── */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs max-h-[380px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-black sticky top-0 z-10 border-b border-slate-200 select-none">
                    <tr>
                      <th className="py-2.5 px-3">발주번호</th>
                      <th className="py-2.5 px-3">거래처</th>
                      <th className="py-2.5 px-2">구분</th>
                      <th className="py-2.5 px-3 min-w-[200px]">품명</th>
                      <th className="py-2.5 px-2">규격</th>
                      <th className="py-2.5 px-2 text-right">발주수량</th>
                      <th className="py-2.5 px-2 text-right font-black text-blue-900 bg-blue-50/70">입고수량</th>
                      <th className="py-2.5 px-2 text-right">구매단가(수정)</th>
                      <th className="py-2.5 px-3 text-right">입고금액</th>
                      <th className="py-2.5 px-2 text-center">차이수량</th>
                      <th className="py-2.5 px-2 text-center">HACCP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {displayedRows.map((r, idx) => {
                      const hasDiff = r.diffQty !== 0 || r.diffAmt !== 0;
                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50 transition-colors ${
                            hasDiff ? 'bg-amber-50/40' : idx % 2 === 1 ? 'bg-slate-50/30' : ''
                          }`}
                        >
                          <td className="py-2 px-3 font-mono text-slate-600">{r.orderNo || '-'}</td>
                          <td className="py-2 px-3 font-bold text-slate-800 truncate max-w-[140px]">{r.partnerName}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              r.category === '부자재' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {r.category}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">{r.productName}</td>
                          <td className="py-2 px-2 text-slate-500 text-[11px]">{r.spec || '-'}</td>
                          <td className="py-2 px-2 text-right font-mono text-slate-500">{r.orderQty.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right font-mono font-black text-blue-900 bg-blue-50/40">
                            {r.recvQty.toLocaleString()}
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-emerald-800">
                            ₩{r.buyPrice.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-slate-950">
                            ₩{r.recvAmt.toLocaleString()}
                          </td>
                          <td className="py-2 px-2 text-center font-mono font-bold">
                            {r.diffQty > 0 ? (
                              <span className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md text-[11px]">
                                +{r.diffQty}
                              </span>
                            ) : r.diffQty < 0 ? (
                              <span className="text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-md text-[11px]">
                                {r.diffQty}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs">
                              {r.totalJudge || 'O'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── 3. 파이프라인 자동 반영 제어 옵션 ── */}
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-600" />
                  <span className="text-sm font-black text-blue-950">
                    입고 처리 즉시 연동 파이프라인 옵션
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer bg-white p-2.5 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={updateStock}
                      onChange={(e) => setUpdateStock(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded-md border-slate-300"
                    />
                    <span>창고 실재고(Inventory) 가산</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer bg-white p-2.5 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={updatePrice}
                      onChange={(e) => setUpdatePrice(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded-md border-slate-300"
                    />
                    <span>구매단가(ProductPrice) 최신화</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer bg-white p-2.5 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={syncPo}
                      onChange={(e) => setSyncPo(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded-md border-slate-300"
                    />
                    <span>발주서(PO) 잔량 차감/완료</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer bg-white p-2.5 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={createLedger}
                      onChange={(e) => setCreateLedger(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded-md border-slate-300"
                    />
                    <span>자재수불부(Ledger) 거래 기록</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── 4. 하단 버튼 바 ── */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Info size={15} className="text-blue-600" />
            <span>확정 시 PostgreSQL 데이터베이스에 원자적(ACID)으로 반영되며 실시간 재고에 동기화됩니다.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors cursor-pointer"
            >
              취소
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || parsing || parsedRows.length === 0}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm flex items-center gap-2 shadow-sm shadow-blue-200 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>DB 저장 중...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>입고 확정 및 DB 저장 ({parsedRows.length}건)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

