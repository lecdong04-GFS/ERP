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
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = async (file: File) => {
    setFileName(file.name);
    setIsProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = parseGsRetailExcelBuffer(buffer);
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

    onClose();

    // 1. 주문 데이터 DB 저장
    try {
      await fetch('/api/sales/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: new Date().toISOString().slice(0, 10),
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
    } catch (err) {
      console.error('Failed to save uploaded sales order to DB:', err);
    }

    // 2. 파이프라인 엔진 가동 (BOM 전개, 46개 계 배분, FEFO 차감, 원가계산)
    await executePipeline(parsedData.orders);
    openPipelineModal();
  };

  const handleReset = () => {
    setFileName(null);
    setParsedData(null);
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

          {/* Parsed Summary Stats */}
          {parsedData && (
            <div className="bg-white border border-gray-300 rounded-lg p-3.5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-gray-800 text-[13px]">
                    발주 분석 결과 요약
                  </span>
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
            <button
              disabled={!parsedData || parsedData.orders.length === 0 || isProcessing}
              onClick={handleApplyPipeline}
              className={`px-4 py-1.5 rounded font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                parsedData && parsedData.orders.length > 0
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-extrabold active:scale-95'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Zap className="w-4 h-4 fill-black stroke-black" />
              <span>생산-원가 파이프라인 즉시 전개 실행</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
