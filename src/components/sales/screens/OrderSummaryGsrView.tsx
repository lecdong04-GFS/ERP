'use client';

import React, { useState, useEffect } from 'react';
import { SalesActionBar } from '../common/SalesActionBar';
import { RotateCw } from 'lucide-react';
import { GS_CENTERS_MASTER, SALES_PRODUCT_MASTER } from '../data/salesMasterData';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
interface ProductSummaryRow {
  id: number;
  itemKind: string;       // 품목: 김밥, 도시락, 주먹밥, 햄버거, 무스비, 샌드위치
  itemCount: number;      // 품목수
  totalQty: number;       // 합계 수량
  totalAmt: number;       // 합계 금액
  shift1UploadQty: number;// 1편 업로드 수량
  shift1UploadAmt: number;// 1편 업로드 금액
  shift1ExtraQty: number; // 1편 추가 수량
  shift1ExtraAmt: number; // 1편 추가 금액
  shift1SubTotalQty: number; // 1편 소계 수량
  shift1SubTotalAmt: number; // 1편 소계 금액
  shift2UploadQty: number;// 2편 업로드 수량
  shift2UploadAmt: number;// 2편 업로드 금액
  shift2ExtraQty: number; // 2편 추가 수량
  shift2ExtraAmt: number; // 2편 추가 금액
  shift2SubTotalQty: number; // 2편 소계 수량
  shift2SubTotalAmt: number; // 2편 소계 금액
}

interface CenterSummaryRow {
  id: number;
  centerName: string;     // 센터명
  itemCount: number;      // 품목수
  totalQty: number;       // 합계 수량
  totalAmt: number;       // 합계 금액
  shift1UploadQty: number;// 1편 업로드 수량
  shift1UploadAmt: number;// 1편 업로드 금액
  shift1ExtraQty: number; // 1편 추가 수량
  shift1ExtraAmt: number; // 1편 추가 금액
  shift1SubTotalQty: number;
  shift1SubTotalAmt: number;
  shift2UploadQty: number;// 2편 업로드 수량
  shift2UploadAmt: number;// 2편 업로드 금액
  shift2ExtraQty: number; // 2편 추가 수량
  shift2ExtraAmt: number; // 2편 추가 금액
  shift2SubTotalQty: number;
  shift2SubTotalAmt: number;
}

const INITIAL_PRODUCT_SUMMARY: ProductSummaryRow[] = [
  { id: 1, itemKind: '김밥', itemCount: 12, totalQty: 18450, totalAmt: 37822500, shift1UploadQty: 9500, shift1UploadAmt: 19475000, shift1ExtraQty: 450, shift1ExtraAmt: 922500, shift1SubTotalQty: 9950, shift1SubTotalAmt: 20397500, shift2UploadQty: 8200, shift2UploadAmt: 16810000, shift2ExtraQty: 300, shift2ExtraAmt: 615000, shift2SubTotalQty: 8500, shift2SubTotalAmt: 17425000 },
  { id: 2, itemKind: '도시락', itemCount: 10, totalQty: 14200, totalAmt: 61060000, shift1UploadQty: 8200, shift1UploadAmt: 35260000, shift1ExtraQty: 300, shift1ExtraAmt: 1290000, shift1SubTotalQty: 8500, shift1SubTotalAmt: 36550000, shift2UploadQty: 5500, shift2UploadAmt: 23650000, shift2ExtraQty: 200, shift2ExtraAmt: 860000, shift2SubTotalQty: 5700, shift2SubTotalAmt: 24510000 },
  { id: 3, itemKind: '주먹밥', itemCount: 8, totalQty: 12800, totalAmt: 14080000, shift1UploadQty: 6800, shift1UploadAmt: 7480000, shift1ExtraQty: 250, shift1ExtraAmt: 275000, shift1SubTotalQty: 7050, shift1SubTotalAmt: 7755000, shift2UploadQty: 5600, shift2UploadAmt: 6160000, shift2ExtraQty: 150, shift2ExtraAmt: 165000, shift2SubTotalQty: 5750, shift2SubTotalAmt: 6325000 },
  { id: 4, itemKind: '햄버거', itemCount: 6, totalQty: 4800, totalAmt: 6172800, shift1UploadQty: 2800, shift1UploadAmt: 3600800, shift1ExtraQty: 100, shift1ExtraAmt: 128600, shift1SubTotalQty: 2900, shift1SubTotalAmt: 3729400, shift2UploadQty: 1850, shift2UploadAmt: 2379100, shift2ExtraQty: 50, shift2ExtraAmt: 64300, shift2SubTotalQty: 1900, shift2SubTotalAmt: 2443400 },
  { id: 5, itemKind: '무스비', itemCount: 4, totalQty: 3200, totalAmt: 4640000, shift1UploadQty: 1800, shift1UploadAmt: 2610000, shift1ExtraQty: 80, shift1ExtraAmt: 116000, shift1SubTotalQty: 1880, shift1SubTotalAmt: 2726000, shift2UploadQty: 1300, shift2UploadAmt: 1885000, shift2ExtraQty: 20, shift2ExtraAmt: 29000, shift2SubTotalQty: 1320, shift2SubTotalAmt: 1914000 },
  { id: 6, itemKind: '샌드위치', itemCount: 6, totalQty: 1149, totalAmt: 1480716, shift1UploadQty: 700, shift1UploadAmt: 900200, shift1ExtraQty: 30, shift1ExtraAmt: 38580, shift1SubTotalQty: 730, shift1SubTotalAmt: 938780, shift2UploadQty: 410, shift2UploadAmt: 527260, shift2ExtraQty: 9, shift2ExtraAmt: 14676, shift2SubTotalQty: 419, shift2SubTotalAmt: 541936 },
];

const INITIAL_CENTER_SUMMARY: CenterSummaryRow[] = [
  { id: 1, centerName: 'GSR 김해일배', itemCount: 32, totalQty: 16250, totalAmt: 37375000, shift1UploadQty: 8800, shift1UploadAmt: 20240000, shift1ExtraQty: 420, shift1ExtraAmt: 966000, shift1SubTotalQty: 9220, shift1SubTotalAmt: 21206000, shift2UploadQty: 6800, shift2UploadAmt: 15640000, shift2ExtraQty: 230, shift2ExtraAmt: 529000, shift2SubTotalQty: 7030, shift2SubTotalAmt: 16169000 },
  { id: 2, centerName: 'GSR 김해2일배', itemCount: 28, totalQty: 11400, totalAmt: 26220000, shift1UploadQty: 6200, shift1UploadAmt: 14260000, shift1ExtraQty: 280, shift1ExtraAmt: 644000, shift1SubTotalQty: 6480, shift1SubTotalAmt: 14904000, shift2UploadQty: 4800, shift2UploadAmt: 11040000, shift2ExtraQty: 120, shift2ExtraAmt: 276000, shift2SubTotalQty: 4920, shift2SubTotalAmt: 11316000 },
  { id: 3, centerName: 'GSR 양산조리센터', itemCount: 24, totalQty: 9800, totalAmt: 22540000, shift1UploadQty: 5400, shift1UploadAmt: 12420000, shift1ExtraQty: 200, shift1ExtraAmt: 460000, shift1SubTotalQty: 5600, shift1SubTotalAmt: 12880000, shift2UploadQty: 4100, shift2UploadAmt: 9430000, shift2ExtraQty: 100, shift2ExtraAmt: 230000, shift2SubTotalQty: 4200, shift2SubTotalAmt: 9660000 },
  { id: 4, centerName: 'GSR 부산물류센터', itemCount: 26, totalQty: 8400, totalAmt: 19320000, shift1UploadQty: 4600, shift1UploadAmt: 10580000, shift1ExtraQty: 180, shift1ExtraAmt: 414000, shift1SubTotalQty: 4780, shift1SubTotalAmt: 10994000, shift2UploadQty: 3500, shift2UploadAmt: 8050000, shift2ExtraQty: 120, shift2ExtraAmt: 276000, shift2SubTotalQty: 3620, shift2SubTotalAmt: 8326000 },
  { id: 5, centerName: 'GSR 신광주 저온', itemCount: 20, totalQty: 5200, totalAmt: 11960000, shift1UploadQty: 2900, shift1UploadAmt: 6670000, shift1ExtraQty: 80, shift1ExtraAmt: 184000, shift1SubTotalQty: 2980, shift1SubTotalAmt: 6854000, shift2UploadQty: 2180, shift2UploadAmt: 5014000, shift2ExtraQty: 40, shift2ExtraAmt: 92000, shift2SubTotalQty: 2220, shift2SubTotalAmt: 5106000 },
  { id: 6, centerName: 'GSR 해인 CVS', itemCount: 18, totalQty: 3549, totalAmt: 7841016, shift1UploadQty: 1900, shift1UploadAmt: 4370000, shift1ExtraQty: 50, shift1ExtraAmt: 115000, shift1SubTotalQty: 1950, shift1SubTotalAmt: 4485000, shift2UploadQty: 1480, shift2UploadAmt: 3404000, shift2ExtraQty: 19, shift2ExtraAmt: 43700, shift2SubTotalQty: 1499, shift2SubTotalAmt: 3447700 },
];

export const OrderSummaryGsrView: React.FC = () => {
  const [orderDate, setOrderDate] = useState('2026년 10월 30일 금요일');
  const [productSummary, setProductSummary] = useState<ProductSummaryRow[]>(INITIAL_PRODUCT_SUMMARY);
  const [centerSummary, setCenterSummary] = useState<CenterSummaryRow[]>(INITIAL_CENTER_SUMMARY);
  const [selectedCenter, setSelectedCenter] = useState<string>('GSR 김해일배');

  useEffect(() => {
    fetch('/api/sales/order')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const centerMap: Record<string, { qty: number; amt: number; count: number }> = {};
          json.data.forEach((o: any) => {
            const c = o.centerCode || 'GSR 김해일배';
            if (!centerMap[c]) centerMap[c] = { qty: 0, amt: 0, count: 0 };
            centerMap[c].qty += o.totalQty || 0;
            centerMap[c].amt += o.totalAmount || 0;
            centerMap[c].count += o.details?.length || 1;
          });

          const loadedCenterSummary: CenterSummaryRow[] = Object.keys(centerMap).map((c, idx) => ({
            id: idx + 1,
            centerName: c,
            itemCount: centerMap[c].count,
            totalQty: centerMap[c].qty,
            totalAmt: centerMap[c].amt,
            shift1UploadQty: Math.round(centerMap[c].qty * 0.55),
            shift1UploadAmt: Math.round(centerMap[c].amt * 0.55),
            shift1ExtraQty: 0,
            shift1ExtraAmt: 0,
            shift1SubTotalQty: Math.round(centerMap[c].qty * 0.55),
            shift1SubTotalAmt: Math.round(centerMap[c].amt * 0.55),
            shift2UploadQty: Math.round(centerMap[c].qty * 0.45),
            shift2UploadAmt: Math.round(centerMap[c].amt * 0.45),
            shift2ExtraQty: 0,
            shift2ExtraAmt: 0,
            shift2SubTotalQty: Math.round(centerMap[c].qty * 0.45),
            shift2SubTotalAmt: Math.round(centerMap[c].amt * 0.45),
          }));

          if (loadedCenterSummary.length > 0) {
            setCenterSummary(loadedCenterSummary);
          }
        }
      })
      .catch((err) => console.error('Failed to load order summaries', err));
  }, []);

  // ── 인라인 편집 ──
  const { editingCell, editValue, setEditValue, startEditing, cancelEditing, isEditing } = useInlineEdit();
  const saveEdit = (rowId: string | number, colKey: string, rows: any[], setRows: (r: any[]) => void) => {
    setRows(rows.map(r => {
      const id = r.id ?? r.no ?? r.idx ?? r.index;
      if (id === rowId) {
        const numVal = Number(editValue);
        return { ...r, [colKey]: isNaN(numVal) || editValue.trim() === '' ? editValue : numVal };
      }
      return r;
    }));
    cancelEditing();
  };

  // Filter items for bottom-right panel
  const itemsForCenter = SALES_PRODUCT_MASTER.slice(0, 15).map((p, idx) => ({
    partNo: p.productCode,
    partName: p.productName,
    qty: 250 - idx * 12,
  }));

  // Totals for top grid
  const prodTotals = productSummary.reduce(
    (acc, row) => ({
      itemCount: acc.itemCount + row.itemCount,
      totalQty: acc.totalQty + row.totalQty,
      totalAmt: acc.totalAmt + row.totalAmt,
      s1UpQ: acc.s1UpQ + row.shift1UploadQty,
      s1UpA: acc.s1UpA + row.shift1UploadAmt,
      s1ExQ: acc.s1ExQ + row.shift1ExtraQty,
      s1ExA: acc.s1ExA + row.shift1ExtraAmt,
      s1SubQ: acc.s1SubQ + row.shift1SubTotalQty,
      s1SubA: acc.s1SubA + row.shift1SubTotalAmt,
      s2UpQ: acc.s2UpQ + row.shift2UploadQty,
      s2UpA: acc.s2UpA + row.shift2UploadAmt,
      s2ExQ: acc.s2ExQ + row.shift2ExtraQty,
      s2ExA: acc.s2ExA + row.shift2ExtraAmt,
      s2SubQ: acc.s2SubQ + row.shift2SubTotalQty,
      s2SubA: acc.s2SubA + row.shift2SubTotalAmt,
    }),
    { itemCount: 0, totalQty: 0, totalAmt: 0, s1UpQ: 0, s1UpA: 0, s1ExQ: 0, s1ExA: 0, s1SubQ: 0, s1SubA: 0, s2UpQ: 0, s2UpA: 0, s2ExQ: 0, s2ExA: 0, s2SubQ: 0, s2SubA: 0 }
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#e2e8f0] select-none text-[12px]">
      {/* 1. 상단 액션 바 (화면 캡처 091455.png: 조회, 초기화, ?) */}
      <SalesActionBar
        title="주문집계현황"
        buttons={[
          { key: 'search', label: '조회', icon: 'search', variant: 'primary', onClick: () => alert('주문집계현황 조회 완료') },
          { key: 'reset', label: '초기화', icon: 'reset', variant: 'secondary', onClick: () => alert('초기화 완료') },
        ]}
        helpContent="GS리테일 정기 및 추가 발주 데이터를 품목별, 납품 센터별, 1편/2편별로 다단 교차 집계하여 생산 및 출하 총수량을 확인합니다."
      />

      {/* 2. 조건 검색 바 (화면 캡처 091455.png: 주문일자) */}
      <div className="bg-[#efefef] border-b border-[#c0c0c0] px-3 py-1 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-700">주문일자:</span>
          <select
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="bg-white border border-gray-400 px-2 py-0.5 text-[11px] font-medium rounded-xs shadow-2xs h-6"
          >
            <option value="2026년 10월 30일 금요일">2026년 10월 30일 금요일</option>
            <option value="2026년 10월 29일 목요일">2026년 10월 29일 목요일</option>
          </select>
        </div>

        <button
          onClick={() => alert('새로고침')}
          className="p-1 hover:bg-gray-200 rounded text-gray-600 cursor-pointer"
          title="새로고침"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3. 본문 3단 분할 레이아웃 (상단 요약 50% / 하단 세부내용 50%) */}
      <div className="flex-1 flex flex-col min-h-0 p-1 gap-1 overflow-hidden">
        {/* 상단: 품목별 요약 그리드 */}
        <div className="h-[48%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
          <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
            <span>요약 (품목별 1편/2편 집계)</span>
            <span className="text-[11.5px] text-gray-500">단위: EA, 원</span>
          </div>

          <div className="flex-1 overflow-auto">
            <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
              <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                {/* 1st Tier Header */}
                <tr className="border-b border-[#dbe3ee]">
                  <th rowSpan={2} className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-20">품목</th>
                  <th rowSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">품목수</th>
                  <th colSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#e8edf4]">합계</th>
                  <th colSpan={6} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#b5baf0]">1편</th>
                  <th colSpan={6} className="whitespace-nowrap py-1 px-1 bg-[#e8edf4]">2편</th>
                </tr>
                {/* 2nd Tier Header */}
                <tr className="border-b border-[#dbe3ee] text-[11.5px]">
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">수량</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">금액</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">업로드수량</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-18">업로드금액</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-14">추가수량</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">추가금액</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16 bg-[#b2b7ec]">소계수량</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-18 bg-[#b2b7ec]">소계금액</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">업로드수량</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-18">업로드금액</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-14">추가수량</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16">추가금액</th>
                  <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-16 bg-[#b2b7ec]">소계수량</th>
                  <th className="whitespace-nowrap py-0.5 px-1 bg-[#b2b7ec] w-18">소계금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {productSummary.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/50">
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans font-bold text-center border-r border-gray-200">{row.itemKind}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{row.itemCount}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{row.totalQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-gray-900 border-r border-gray-200">{row.totalAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{row.shift1UploadQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{row.shift1UploadAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200 text-amber-700">{row.shift1ExtraQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200 text-amber-700">{row.shift1ExtraAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-emerald-800 bg-emerald-50/30 border-r border-gray-200">{row.shift1SubTotalQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-emerald-800 bg-emerald-50/30 border-r border-gray-200">{row.shift1SubTotalAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{row.shift2UploadQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200">{row.shift2UploadAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200 text-amber-700">{row.shift2ExtraQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-200 text-amber-700">{row.shift2ExtraAmt.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-indigo-800 bg-indigo-50/30 border-r border-gray-200">{row.shift2SubTotalQty.toLocaleString()}</td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-indigo-800 bg-indigo-50/30">{row.shift2SubTotalAmt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {/* 연노란색 하단 합계줄 #fdfde0 */}
              <tfoot className="bg-[#fdfde0] font-mono font-bold text-gray-900 border-t-2 border-[#dbe3ee] sticky bottom-0">
                <tr>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-center border-r border-gray-300">합계</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-300">{prodTotals.itemCount}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-blue-900 border-r border-gray-300">{prodTotals.totalQty.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{prodTotals.totalAmt.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{prodTotals.s1UpQ.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{prodTotals.s1UpA.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-amber-700 border-r border-gray-300">{prodTotals.s1ExQ.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-amber-700 border-r border-gray-300">{prodTotals.s1ExA.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{prodTotals.s1SubQ.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-900 border-r border-gray-300">{prodTotals.s1SubA.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{prodTotals.s2UpQ.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right border-r border-gray-300">{prodTotals.s2UpA.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-amber-700 border-r border-gray-300">{prodTotals.s2ExQ.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-amber-700 border-r border-gray-300">{prodTotals.s2ExA.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-indigo-900 border-r border-gray-300">{prodTotals.s2SubQ.toLocaleString()}</td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-indigo-900">{prodTotals.s2SubA.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></EditableTableWrapper>
          </div>
        </div>

        {/* 하단 2분할 (좌측: 세부내용 센터별 68% / 우측: 선택 품목 32%) */}
        <div className="h-[52%] flex gap-1 min-h-0 overflow-hidden">
          {/* 좌하단: 세부내용 (센터명별 집계) */}
          <div className="w-[70%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
            <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300">
              세부내용 (납품 물류센터별)
            </div>

            <div className="flex-1 overflow-auto">
              <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr className="border-b border-[#dbe3ee]">
                    <th rowSpan={2} className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee] w-28">센터명</th>
                    <th rowSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-14">품목수</th>
                    <th colSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#e8edf4]">합계</th>
                    <th colSpan={2} className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] bg-[#b5baf0]">1편 소계</th>
                    <th colSpan={2} className="whitespace-nowrap py-1 px-1 bg-[#e8edf4]">2편 소계</th>
                  </tr>
                  <tr className="border-b border-[#dbe3ee] text-[11.5px]">
                    <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">수량</th>
                    <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-24">금액</th>
                    <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">수량</th>
                    <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-24">금액</th>
                    <th className="whitespace-nowrap py-0.5 px-1 border-r border-[#dbe3ee] w-20">수량</th>
                    <th className="whitespace-nowrap py-0.5 px-1 w-24">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {centerSummary.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCenter(c.centerName)}
                      className={`cursor-pointer transition-colors ${
                        selectedCenter === c.centerName ? 'bg-blue-100/70 font-semibold' : 'hover:bg-blue-50/40'
                      }`}
                    >
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left border-r border-gray-200">{c.centerName}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center border-r border-gray-200">{c.itemCount}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right font-bold text-blue-900 border-r border-gray-200">{c.totalQty.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-gray-900 border-r border-gray-200">{c.totalAmt.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{c.shift1SubTotalQty.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-emerald-800 border-r border-gray-200">{c.shift1SubTotalAmt.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-indigo-800 border-r border-gray-200">{c.shift2SubTotalQty.toLocaleString()}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-right text-indigo-800">{c.shift2SubTotalAmt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table></EditableTableWrapper>
            </div>
          </div>

          {/* 우하단: 선택 센터의 품목 목록 (30%) */}
          <div className="w-[30%] flex flex-col bg-white border border-gray-400 shadow-2xs overflow-hidden">
            <div className="bg-[#e2e8f0] px-2 py-0.5 font-bold text-gray-800 text-[11px] border-b border-gray-300 flex items-center justify-between">
              <span>품목 [{selectedCenter}]</span>
              <span className="text-[11.5px] text-blue-700 font-mono">총 {itemsForCenter.length}건</span>
            </div>

            <div className="flex-1 overflow-auto">
              <EditableTableWrapper><table className="w-full min-w-full text-[12.5px] border-collapse font-sans">
                <thead className="bg-[#eef2f7] text-gray-900 sticky top-0 border-b border-[#dbe3ee] z-10 text-center font-bold whitespace-nowrap">
                  <tr>
                    <th className="whitespace-nowrap py-1 px-1 border-r border-[#dbe3ee] w-24">품번</th>
                    <th className="whitespace-nowrap py-1 px-2 border-r border-[#dbe3ee]">품명</th>
                    <th className="whitespace-nowrap py-1 px-2 text-right w-16">수량</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {itemsForCenter.map((it, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/50">
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-1 text-center text-gray-700 border-r border-gray-200">{it.partNo}</td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 font-sans text-left font-medium text-gray-900 truncate border-r border-gray-200 ">
                        {it.partName}
                      </td>
                      <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 whitespace-nowrap py-1 px-2 text-right font-bold text-blue-900">{it.qty.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table></EditableTableWrapper>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
