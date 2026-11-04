'use client';

import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  ClipboardPaste,
  CheckCircle2,
  AlertTriangle,
  Zap,
  X,
  FileCheck,
  RefreshCw,
  Building2,
  Clock,
} from 'lucide-react';
import {
  generateSampleGsRetailExcel,
  parseGsRetailExcelBuffer,
  parseGsRetailText,
  ParsedExcelResult,
} from '@/services/excel/gsRetailExcelService';
import { parseBonbaljuRows } from '@/lib/gfs/bonbaljuIntake';
import { parseMichulRows, MichulParseResult } from '@/lib/gfs/michulIntake';
import * as XLSX from 'xlsx';
import { usePipeline } from '@/context/PipelineContext';

interface ExcelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExcelOrderModal: React.FC<ExcelOrderModalProps> = ({ isOpen, onClose }) => {
  const { executePipeline, openPipelineModal } = usePipeline();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedExcelResult | null>(null);
  const [parsedMichul, setParsedMichul] = useState<MichulParseResult | null>(null);
  const [parsedSource, setParsedSource] = useState<'GS표준' | '본발주' | '미출'>('GS표준');
  const [parsedOrderDate, setParsedOrderDate] = useState<string | null>(null);
  const [parsedKind, setParsedKind] = useState<'정규' | '추가' | '슈퍼'>('정규');
  const [parsedDocKeys, setParsedDocKeys] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = async (file: File) => {
    setFileName(file.name);
    setIsProcessing(true);
    setParsedMichul(null);
    try {
      const buffer = await file.arrayBuffer();

      // 1. 미출(미납) 엑셀 및 본발주 시트 우선 탐지
      const wb = XLSX.read(buffer, { type: 'array' });
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        if (!ws) continue;
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // (1) 미출고/미납정보 엑셀 감지
        const michul = parseMichulRows(rows);
        if (michul && michul.items.length > 0) {
          setParsedSource('미출');
          setParsedMichul(michul);
          setParsedData(null);
          return;
        }

        // (2) 본발주(B2B EDI ordview) 감지: 정규, 추가(1편), 슈퍼
        const bon = parseBonbaljuRows(rows);
        if (bon && bon.items.length > 0) {
          setParsedSource('본발주');
          setParsedOrderDate(bon.orderDate);
          setParsedKind(bon.kind);
          setParsedDocKeys(bon.docKeys);
          setParsedData({
            orders: bon.items.map((it, idx) => ({
              orderId: `BONBALJU-${bon.orderDate.replace(/-/g, '')}-${String(idx + 1).padStart(3, '0')}`,
              storeCode: 'GSR-001',
              storeName: 'GS리테일 본발주 통합',
              orderItemCode: it.productCode,
              orderItemName: it.menuName,
              orderQty1: it.qty1,
              orderQty2: it.qty2,
              totalOrderQty: it.total,
              deliveryPrice: it.unitPrice,
              amount: it.amount,
            })),
            totalLines: bon.items.length,
            totalQty: bon.totalQty,
            shift1Qty: bon.items.reduce((s, it) => s + it.qty1, 0),
            shift2Qty: bon.items.reduce((s, it) => s + it.qty2, 0),
            validItemCount: bon.items.length,
            unrecognizedBarcodes: [],
            rawRowCount: bon.rowCount,
          });
          return;
        }
      }

      // 2. 점포별 GS 표준 발주서 분석
      const result = parseGsRetailExcelBuffer(buffer);
      const hasQty = result.totalQty > 0 && result.orders.length > 0;
      setParsedSource('GS표준');
      setParsedOrderDate(null);
      setParsedKind('정규');
      setParsedDocKeys([]);
      setParsedData(result);
    } catch (err) {
      alert('엑셀 파일을 읽는 중 오류가 발생했습니다. 양식을 확인해 주세요.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) {
      alert('붙여넣을 엑셀 데이터가 없습니다.');
      return;
    }
    setIsProcessing(true);
    try {
      const result = parseGsRetailText(pasteText);
      setParsedData(result);
      setFileName('클립보드_붙여넣기_데이터.tsv');
    } catch (err) {
      alert('텍스트 데이터를 분석하는 중 오류가 발생했습니다.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyPipeline = async () => {
    if (!parsedData || parsedData.orders.length === 0) {
      alert('파이프라인을 실행할 수 있는 유효한 발주 데이터가 없습니다.');
      return;
    }

    setIsProcessing(true);
    try {
      let savedOk = false;
      let orderDateLabel = parsedOrderDate || new Date().toISOString().slice(0, 10);

      if (parsedSource === '본발주' && parsedOrderDate) {
        const postBon = async (replace: boolean) => {
          const res = await fetch('/api/sales/intake', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderDate: parsedOrderDate,
              centerCode: 'GSR-001',
              orderType: parsedKind,
              docKeys: parsedDocKeys,
              uploadMethod: '엑셀(본발주)',
              source: '본발주',
              replaceByDate: replace,
              items: parsedData.orders.map((o: any) => ({
                menuName: o.orderItemName,
                productCode: o.orderItemCode,
                qty1: o.orderQty1,
                qty2: o.orderQty2,
                total: o.totalOrderQty,
                unitPrice: o.deliveryPrice,
                amount: o.amount,
              })),
            }),
          });
          return res.json();
        };

        let json = await postBon(false);
        if (json?.success && json.data?.alreadyRegistered) {
          onClose();
          alert(`${parsedOrderDate} [${parsedKind}] 이미 등록된 파일입니다. (변경 없음)`);
          return;
        }
        if (!json?.success && json?.code === 'DUPLICATE_ORDER') {
          if (!window.confirm(`${json.error}\n\n기존 수주를 삭제하고 새로 등록할까요?\n(기존 데이터는 완전 삭제됩니다)`)) {
            setIsProcessing(false);
            return;
          }
          json = await postBon(true);
        }
        if (!json?.success) {
          alert('수주 등록 실패: ' + (json?.error || '알 수 없는 오류'));
          setIsProcessing(false);
          return;
        }
        savedOk = true;
      } else {
        const res = await fetch('/api/sales/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderDate: orderDateLabel,
            centerCode: 'GSR-001',
            shift: '1편',
            orderType: '정규',
            uploadMethod: '엑셀업로드',
            items: parsedData.orders.map((o) => ({
              productCode: o.orderItemCode,
              orderQty1: o.orderQty1,
              orderQty2: o.orderQty2,
              unitPrice: o.deliveryPrice,
            })),
          }),
        });
        const json = await res.json().catch(() => null);
        savedOk = !!(json?.success);
      }

      // 파이프라인 엔진 백그라운드 연동
      try {
        await executePipeline(parsedData.orders);
      } catch (pipeErr) {
        console.error('Pipeline visual engine error:', pipeErr);
      }

      const totalQty = parsedData.orders.reduce((sum, o) => sum + (o.totalOrderQty || 0), 0);
      const totalAmt = parsedData.orders.reduce(
        (sum, o) => sum + ((o.totalOrderQty || 0) * (o.deliveryPrice || 0)),
        0
      );

      alert(
        `✓ ${orderDateLabel} 수주 데이터 반영 및 생산·원가 파이프라인 전개 완료!\n\n` +
          `• 수주 품목: ${parsedData.orders.length}개 품목\n` +
          `• 총 수주량: ${totalQty.toLocaleString()}개\n` +
          `• 총 발주액: ${totalAmt.toLocaleString()}원\n\n` +
          `[주문현황/취소], [작업지시서], [자재발주], [대시보드]에 실시간 반영되었습니다.`
      );

      onClose();
      window.location.reload();
    } catch (err: any) {
      console.error('Failed to process pipeline order:', err);
      alert('파이프라인 실행 중 오류가 발생했습니다: ' + (err?.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyMichul = async () => {
    if (!parsedMichul || parsedMichul.items.length === 0) {
      alert('반영할 미출 내역 데이터가 없습니다.');
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch('/api/sales/undelivered/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeDate: parsedMichul.tradeDate,
          items: parsedMichul.items,
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        alert('미출 내역 반영 실패: ' + (json?.error || '알 수 없는 오류'));
        return;
      }
      alert(
        `✓ ${parsedMichul.tradeDate} 미출 내역서 반영 완료!\n\n` +
          `• 대상 센터: ${parsedMichul.storeCount}개 조리/물류센터\n` +
          `• 미출 품목: ${parsedMichul.productCount}개 품목 (총 ${parsedMichul.totalUndelivQty}개 결품)\n` +
          `• 미출 차감액: ₩${parsedMichul.totalUndelivAmt.toLocaleString()}원\n\n` +
          `[미출현황] 및 [가매출/미출/확정금액현황] 메뉴에 실시간 반영되었습니다.`
      );
      onClose();
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      alert('미출 데이터를 서버에 저장하는 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFileName(null);
    setParsedData(null);
    setParsedMichul(null);
    setParsedOrderDate(null);
    setParsedSource('GS표준');
    setParsedKind('정규');
    setParsedDocKeys([]);
    setPasteText('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 select-none">
      <div className="bg-[#f8fafc] w-full max-w-4xl rounded-lg shadow-2xl border border-gray-400 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Top Header */}
        <div className="bg-[#1e293b] text-white px-4 py-3 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-600 rounded text-white shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[14px] text-white">
                  GS리테일(GSR) 점포 발주 엑셀 업로드 & 파이프라인 연동
                </h3>
                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold rounded border border-emerald-500/30">
                  실시간 연쇄 연산
                </span>
              </div>
              <p className="text-[11px] text-gray-300 mt-0.5">
                GS25 본사 발주 파일(.xlsx, .csv)을 등록하면 1편/2편 자동 분리 및 BOM 역산 파이프라인이 즉시 가동됩니다.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Sample Download */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('file')}
              className={`px-3 py-1.5 rounded font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'file'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>엑셀 파일 업로드</span>
            </button>
            <button
              onClick={() => setMode('paste')}
              className={`px-3 py-1.5 rounded font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'paste'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>클립보드 붙여넣기 (Ctrl+V)</span>
            </button>
          </div>

          <button
            onClick={generateSampleGsRetailExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-bold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>표준 GS25 발주 서식 다운로드 (.XLSX)</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs">
          {/* File Upload Mode */}
          {mode === 'file' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                    : fileName
                    ? 'border-emerald-400 bg-emerald-50/40'
                    : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <div
                    className={`p-3 rounded-full ${
                      fileName ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {fileName ? (
                      <FileCheck className="w-8 h-8" />
                    ) : (
                      <Upload className="w-8 h-8" />
                    )}
                  </div>
                  {fileName ? (
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{fileName}</p>
                      <p className="text-emerald-700 text-[11px] font-medium mt-0.5">
                        파일이 성공적으로 분석되었습니다. 다른 파일을 올리려면 클릭하세요.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold text-gray-700 text-sm">
                        GS리테일 발주 엑셀 파일을 이곳에 끌어다 놓으세요
                      </p>
                      <p className="text-gray-500 text-[11px] mt-1">
                        지원 형식: <span className="font-mono font-semibold">.xlsx, .xls, .csv</span> | 클릭하여 파일 선택
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Paste Mode */}
          {mode === 'paste' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-gray-700 text-xs">
                  엑셀에서 복사한 테이블 데이터를 붙여넣으세요:
                </label>
                <span className="text-gray-500 text-[11px]">
                  (첫 줄은 헤더: 납품일, 편수, 점포명, 바코드, 상품명, 수량, 단가)
                </span>
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="2026-10-30&#9;1편&#9;GS25 역삼점&#9;28607290144&#9;더 큰)스팸2배계란볶음밥&#9;150&#9;3600&#10;2026-10-30&#9;2편&#9;GS25 종로점&#9;28607290004&#9;삼각)전주비빔&#9;300&#9;950"
                className="w-full h-32 p-2.5 font-mono text-[11px] border border-gray-300 rounded bg-white focus:outline-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex justify-end">
                <button
                  onClick={handlePasteSubmit}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs transition-colors cursor-pointer"
                >
                  붙여넣은 데이터 파싱 및 검증
                </button>
              </div>
            </div>
          )}

          {/* Parsed Michul (미출고) Summary Stats & Action */}
          {parsedMichul && (
            <div className="bg-white border-2 border-rose-300 rounded-xl p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-rose-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-xs font-black shadow-xs">
                    🚨 GS리테일 미출고(미납정보) 내역서 감지
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                    <span>기준 납품일자:</span>
                    <span className="text-rose-700 font-mono font-black">{parsedMichul.tradeDate}</span>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 text-[11.5px] text-slate-500 hover:text-slate-800 cursor-pointer font-bold"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>다시 올리기</span>
                </button>
              </div>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] text-slate-500 font-bold">총 발주(주문)</div>
                  <div className="text-[17px] font-black font-mono text-slate-800 mt-1">
                    {parsedMichul.totalOrderQty.toLocaleString()}
                    <span className="text-xs font-normal text-slate-500 ml-1">개</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    ₩{Math.round(parsedMichul.totalOrderAmt).toLocaleString()}원
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <div className="text-[11px] text-emerald-800 font-bold">정상 납품 완료</div>
                  <div className="text-[17px] font-black font-mono text-emerald-700 mt-1">
                    {parsedMichul.totalDelivQty.toLocaleString()}
                    <span className="text-xs font-normal text-emerald-600 ml-1">개</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono mt-0.5">
                    ₩{Math.round(parsedMichul.totalDelivAmt).toLocaleString()}원
                  </div>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl">
                  <div className="text-[11px] text-rose-800 font-bold flex items-center justify-center gap-1">
                    <span>🚨 결품 (미출 차감)</span>
                  </div>
                  <div className="text-[17px] font-black font-mono text-rose-600 mt-1">
                    {parsedMichul.totalUndelivQty.toLocaleString()}
                    <span className="text-xs font-normal text-rose-600 ml-1">개 결품</span>
                  </div>
                  <div className="text-[11.5px] text-rose-700 font-mono font-black mt-0.5">
                    -₩{parsedMichul.totalUndelivAmt.toLocaleString()}원
                  </div>
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                  <div className="text-[11px] text-blue-800 font-bold">대상 물류센터</div>
                  <div className="text-[17px] font-black font-mono text-blue-700 mt-1">
                    {parsedMichul.storeCount}
                    <span className="text-xs font-normal text-blue-600 ml-1">개 센터</span>
                  </div>
                  <div className="text-[11px] text-blue-600 font-mono mt-0.5">
                    {parsedMichul.productCount}개 상품 분할
                  </div>
                </div>
              </div>

              {/* Table Preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
                <table className="w-full text-[11.5px] border-collapse">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">센터명</th>
                      <th className="py-2 px-2 text-left">바코드</th>
                      <th className="py-2 px-3 text-left">상품명</th>
                      <th className="py-2 px-2 text-right">발주</th>
                      <th className="py-2 px-2 text-right">납품</th>
                      <th className="py-2 px-2 text-right text-rose-600">미출수량</th>
                      <th className="py-2 px-3 text-right text-rose-600">미출금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedMichul.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-rose-50/40 transition">
                        <td className="py-1.5 px-3 font-semibold text-slate-800">{it.storeName}</td>
                        <td className="py-1.5 px-2 font-mono text-slate-500">{it.productCode}</td>
                        <td className="py-1.5 px-3 font-bold text-slate-900 truncate max-w-[200px]">{it.productName}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{it.orderQty.toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-emerald-700 font-bold">{it.delivQty.toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-rose-600 font-black">{it.undelivQty}</td>
                        <td className="py-1.5 px-3 text-right font-mono text-rose-600 font-black">₩{it.undelivAmt.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Notice */}
              <div className="pt-2 flex items-center justify-between">
                <p className="text-[11.5px] text-slate-500 font-medium">
                  * 우측 하단의 <b className="text-rose-700 font-bold">[미출 내역 ERP 즉시 반영]</b> 버튼을 누르면 <b className="text-slate-800">[미출현황]</b>과 <b className="text-slate-800">[가매출/미출/확정금액현황]</b>에 실시간 차감 반영됩니다.
                </p>
              </div>
            </div>
          )}

          {/* Parsed Summary Stats */}
          {parsedData && (
            <div className="bg-white border border-gray-300 rounded-lg p-3.5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-gray-800 text-[13px]">
                    발주 분석 결과 요약
                  </span>
                  {parsedSource === '본발주' && parsedOrderDate && (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-300 px-2.5 py-1 rounded-md text-[11px] text-blue-900 font-semibold">
                      <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">
                        {parsedKind}
                      </span>
                      <span>수주일자:</span>
                      <input
                        type="date"
                        value={parsedOrderDate}
                        onChange={(e) => setParsedOrderDate(e.target.value)}
                        className="bg-white border border-blue-400 rounded px-2 py-0.5 text-[11.5px] font-mono font-bold text-blue-900 focus:outline-blue-600 shadow-2xs"
                        title="수주일자를 변경할 수 있습니다"
                      />
                      <span className="text-[10px] text-blue-600 font-normal">
                        (D+2 슈퍼 발주 등 일자 조정 가능)
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>초기화</span>
                </button>
              </div>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <div className="text-[10px] text-gray-500 font-semibold">총 수주 수량</div>
                  <div className="text-base font-extrabold text-blue-700 mt-0.5">
                    {parsedData.totalQty.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-gray-600">EA</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    총 {parsedData.rawRowCount}개 행 집계
                  </div>
                </div>

                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded">
                  <div className="text-[10px] text-emerald-700 font-semibold flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" /> 1편 주문량
                  </div>
                  <div className="text-base font-extrabold text-emerald-800 mt-0.5">
                    {parsedData.shift1Qty.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-gray-600">EA</span>
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">
                    {parsedData.totalQty > 0
                      ? `${((parsedData.shift1Qty / parsedData.totalQty) * 100).toFixed(1)}%`
                      : '0%'}
                  </div>
                </div>

                <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded">
                  <div className="text-[10px] text-indigo-700 font-semibold flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" /> 2편 주문량
                  </div>
                  <div className="text-base font-extrabold text-indigo-800 mt-0.5">
                    {parsedData.shift2Qty.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-gray-600">EA</span>
                  </div>
                  <div className="text-[10px] text-indigo-600 mt-0.5">
                    {parsedData.totalQty > 0
                      ? `${((parsedData.shift2Qty / parsedData.totalQty) * 100).toFixed(1)}%`
                      : '0%'}
                  </div>
                </div>

                <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded">
                  <div className="text-[10px] text-amber-800 font-semibold">대표 품목 수</div>
                  <div className="text-base font-extrabold text-amber-900 mt-0.5">
                    {parsedData.orders.length}{' '}
                    <span className="text-xs font-normal text-gray-600">종류</span>
                  </div>
                  <div className="text-[10px] text-amber-700 mt-0.5">BOM 역산 대상</div>
                </div>
              </div>

              {/* Warnings if unrecognized barcodes */}
              {parsedData.unrecognizedBarcodes.length > 0 && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded flex items-start gap-2 text-rose-700 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">미등록 바코드 감지: </span>
                    <span>
                      {parsedData.unrecognizedBarcodes.join(', ')} (기준정보 매핑 미등록으로 임의 레시피가 적용됩니다.)
                    </span>
                  </div>
                </div>
              )}

              {/* Data Table Preview */}
              <div className="border border-gray-200 rounded overflow-hidden">
                <div className="bg-[#eef2f7] text-[#1e293b] font-bold px-3 py-1.5 flex items-center justify-between text-xs border-b border-gray-300">
                  <span>집계 발주 내역 미리보기 (대표 품목별)</span>
                  <span className="text-[11px] font-normal text-gray-700">
                    단위: EA, 원
                  </span>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#f1f5f9] text-gray-700 font-semibold border-b border-gray-300 sticky top-0">
                      <tr>
                        <th className="py-1 px-2 border-r border-gray-200 text-center w-10">No</th>
                        <th className="py-1 px-2 border-r border-gray-200 w-28">주문 바코드</th>
                        <th className="py-1 px-2 border-r border-gray-200">상품명 (대표품번 매핑)</th>
                        <th className="py-1 px-2 border-r border-gray-200 text-right w-20">1편 수량</th>
                        <th className="py-1 px-2 border-r border-gray-200 text-right w-20">2편 수량</th>
                        <th className="py-1 px-2 border-r border-gray-200 text-right w-24">총 합계</th>
                        <th className="py-1 px-2 border-r border-gray-200 text-right w-24">납품단가</th>
                        <th className="py-1 px-2 text-center w-16">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-mono">
                      {parsedData.orders.map((item, idx) => (
                        <tr key={item.orderId || idx} className="hover:bg-blue-50/50">
                          <td className="py-1 px-2 text-center text-gray-500 border-r border-gray-200">
                            {idx + 1}
                          </td>
                          <td className="py-1 px-2 font-bold text-gray-800 border-r border-gray-200">
                            {item.orderItemCode}
                          </td>
                          <td className="py-1 px-2 font-sans text-gray-900 font-medium border-r border-gray-200">
                            {item.orderItemName}
                          </td>
                          <td className="py-1 px-2 text-right text-emerald-700 font-bold border-r border-gray-200">
                            {item.orderQty1.toLocaleString()}
                          </td>
                          <td className="py-1 px-2 text-right text-indigo-700 font-bold border-r border-gray-200">
                            {item.orderQty2.toLocaleString()}
                          </td>
                          <td className="py-1 px-2 text-right text-blue-900 font-extrabold border-r border-gray-200 bg-blue-50/30">
                            {item.totalOrderQty.toLocaleString()}
                          </td>
                          <td className="py-1 px-2 text-right text-gray-700 border-r border-gray-200">
                            {item.deliveryPrice.toLocaleString()}원
                          </td>
                          <td className="py-1 px-2 text-center font-sans">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
                              정상
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="bg-[#f1f5f9] border-t border-gray-300 px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="text-gray-500 text-[11px] flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>(주)GFS 편의점 신선식품 자동 수주 엔진</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded cursor-pointer transition-colors"
            >
              닫기
            </button>
            {parsedMichul ? (
              <button
                disabled={isProcessing}
                onClick={handleApplyMichul}
                className={`px-4 py-1.5 rounded font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                  isProcessing
                    ? 'bg-rose-400 text-white cursor-wait'
                    : 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-extrabold active:scale-95'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>미출 내역 반영 처리 중...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span>미출 내역 ERP 즉시 반영 (확정매출 차감)</span>
                  </>
                )}
              </button>
            ) : (
              <button
                disabled={!parsedData || parsedData.orders.length === 0 || isProcessing}
                onClick={handleApplyPipeline}
                className={`px-4 py-1.5 rounded font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                  parsedData && parsedData.orders.length > 0 && !isProcessing
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-extrabold active:scale-95'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>생산·원가 전개 처리 중...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-black stroke-black" />
                    <span>생산-원가 파이프라인 즉시 전개 실행</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
