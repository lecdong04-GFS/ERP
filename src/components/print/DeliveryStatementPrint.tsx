'use client';

import React from 'react';
import { DeliveryStatementPayload } from '@/context/PrintReportContext';

interface DeliveryStatementPrintProps {
  payload?: DeliveryStatementPayload | null;
}

export const DeliveryStatementPrint: React.FC<DeliveryStatementPrintProps> = ({ payload }) => {
  const deliveryNo = payload?.deliveryNo || 'DELIV-20261106-0001';
  const deliveryDate = payload?.deliveryDate || new Date().toISOString().slice(0, 10);
  const centerCode = payload?.centerCode || 'GS리테일 물류센터';
  const shift = payload?.shift || '1편';
  const items = payload?.items || [];

  const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const totalSupplyAmt = items.reduce((sum, it) => sum + Math.round((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
  const totalVat = Math.round(totalSupplyAmt * 0.1);
  const grandTotal = totalSupplyAmt + totalVat;

  return (
    <div className="w-full text-slate-900 font-sans text-xs">
      {/* Title */}
      <div className="text-center pb-3 mb-3 border-b-2 border-slate-900 flex items-center justify-between">
        <div className="text-left">
          <div className="text-[11px] text-slate-500 font-mono">납품번호: {deliveryNo}</div>
          <div className="text-[11px] text-slate-500 font-mono">출하일자: {deliveryDate} ({shift})</div>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-widest text-slate-900 border-b-2 border-slate-800 pb-1 px-4 inline-block">
            거 래 명 세 표
          </h1>
          <div className="text-[10px] text-slate-500 mt-0.5">( 공급받는자 보관용 )</div>
        </div>
        <div className="text-right text-[11px] font-bold text-blue-900 font-mono">
          GS리테일 신선식품 납품
        </div>
      </div>

      {/* Supplier & Recipient info tables */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* 공급자 */}
        <div className="border border-slate-700 rounded-xs overflow-hidden">
          <div className="bg-slate-100 px-2 py-1 font-bold text-center border-b border-slate-700 text-[11px]">
            공 급 자
          </div>
          <table className="w-full text-[11px] border-collapse">
            <tbody>
              <tr className="border-b border-slate-300">
                <td className="w-20 bg-slate-50 py-1 px-1.5 font-bold text-center border-r border-slate-300">등록번호</td>
                <td colSpan={3} className="py-1 px-2 font-mono font-bold text-slate-900">123-86-12345</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="w-20 bg-slate-50 py-1 px-1.5 font-bold text-center border-r border-slate-300">상호(법인명)</td>
                <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-300">(주)지에프에스</td>
                <td className="w-14 bg-slate-50 py-1 px-1 font-bold text-center border-r border-slate-300">성명</td>
                <td className="py-1 px-2 font-bold text-slate-900">김진수 (인)</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="w-20 bg-slate-50 py-1 px-1.5 font-bold text-center border-r border-slate-300">사업장주소</td>
                <td colSpan={3} className="py-1 px-2 text-[10.5px]">충청북도 음성군 대소면 대풍산단로 45</td>
              </tr>
              <tr>
                <td className="w-20 bg-slate-50 py-1 px-1.5 font-bold text-center border-r border-slate-300">업태/종목</td>
                <td colSpan={3} className="py-1 px-2 text-[10.5px]">제조업 / 신선편의식품, 도시락, 김밥</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 공급받는자 */}
        <div className="border border-slate-700 rounded-xs overflow-hidden">
          <div className="bg-slate-100 px-2 py-1 font-bold text-center border-b border-slate-700 text-[11px]">
            공 급 받 는 자
          </div>
          <table className="w-full text-[11px] border-collapse">
            <tbody>
              <tr className="border-b border-slate-300">
                <td className="w-20 bg-slate-50 py-1 px-1.5 font-bold text-center border-r border-slate-300">납품센터</td>
                <td colSpan={3} className="py-1 px-2 font-bold text-blue-900 text-[12px]">{centerCode}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="w-20 bg-slate-50 py-1 px-1.5 font-bold text-center border-r border-slate-300">고객사명</td>
                <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-300">(주)GS리테일</td>
                <td className="w-14 bg-slate-50 py-1 px-1 font-bold text-center border-r border-slate-300">배송차수</td>
                <td className="py-1 px-2 font-bold text-slate-900">{shift}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="w-20 bg-slate-50 py-1 px-1.5 font-bold text-center border-r border-slate-300">납품일자</td>
                <td colSpan={3} className="py-1 px-2 font-mono">{deliveryDate}</td>
              </tr>
              <tr>
                <td className="w-20 bg-slate-50 py-1 px-1.5 font-bold text-center border-r border-slate-300">비고/참조</td>
                <td colSpan={3} className="py-1 px-2 text-[10.5px] text-slate-600">콜드체인 적정온도 유지 납품 (5℃ 이하)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Amount highlight box */}
      <div className="bg-slate-50 border-2 border-slate-800 p-2.5 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">합계금액 (VAT 포함):</span>
          <span className="font-black text-sm text-blue-950 font-mono">
            ₩ {grandTotal.toLocaleString()} 원정
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-600">
          <span>공급가액: <strong>{totalSupplyAmt.toLocaleString()}</strong></span>
          <span>세액: <strong>{totalVat.toLocaleString()}</strong></span>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-[11px] border-collapse border border-slate-700 mb-3">
        <thead className="bg-slate-100 text-slate-900 text-center font-bold">
          <tr className="border-b border-slate-700">
            <th className="py-1 px-1 border-r border-slate-400 w-10">No</th>
            <th className="py-1 px-2 border-r border-slate-400 w-24">품번</th>
            <th className="py-1 px-3 border-r border-slate-400 text-left">품명</th>
            <th className="py-1 px-2 border-r border-slate-400 w-16">규격</th>
            <th className="py-1 px-1 border-r border-slate-400 w-12">단위</th>
            <th className="py-1 px-2 border-r border-slate-400 text-right w-16">수량</th>
            <th className="py-1 px-2 border-r border-slate-400 text-right w-20">단가</th>
            <th className="py-1 px-2 border-r border-slate-400 text-right w-24">공급가액</th>
            <th className="py-1 px-2 text-right w-20">세액</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-300 font-mono">
          {items.length === 0 ? (
            <tr><td colSpan={9} className="py-10 text-center text-slate-400 font-sans">납품 품목이 없습니다.</td></tr>
          ) : (
            items.map((it, idx) => {
              const q = Number(it.qty) || 0;
              const p = Number(it.price) || 0;
              const supply = Math.round(q * p);
              const vat = Math.round(supply * 0.1);
              return (
                <tr key={`${it.code}-${idx}`} className="hover:bg-slate-50">
                  <td className="py-1 px-1 text-center border-r border-slate-300 text-slate-600">{idx + 1}</td>
                  <td className="py-1 px-2 text-center border-r border-slate-300 font-mono">{it.code}</td>
                  <td className="py-1 px-3 font-sans font-bold text-left border-r border-slate-300 truncate">{it.name}</td>
                  <td className="py-1 px-2 text-center border-r border-slate-300 text-slate-600">{it.spec || '-'}</td>
                  <td className="py-1 px-1 text-center font-sans border-r border-slate-300">{it.unit || 'ea'}</td>
                  <td className="py-1 px-2 text-right font-bold text-blue-900 border-r border-slate-300">{q.toLocaleString()}</td>
                  <td className="py-1 px-2 text-right border-r border-slate-300">{p.toLocaleString()}</td>
                  <td className="py-1 px-2 text-right font-bold border-r border-slate-300">{supply.toLocaleString()}</td>
                  <td className="py-1 px-2 text-right text-slate-600">{vat.toLocaleString()}</td>
                </tr>
              );
            })
          )}
        </tbody>
        <tfoot className="bg-slate-100 font-mono font-bold text-slate-900 border-t-2 border-slate-700">
          <tr>
            <td colSpan={5} className="py-1.5 px-3 font-sans text-center border-r border-slate-400 font-black">
              합 계 (총 {items.length}개 품목)
            </td>
            <td className="py-1.5 px-2 text-right text-blue-950 font-black border-r border-slate-400">{totalQty.toLocaleString()}</td>
            <td className="py-1.5 px-2 border-r border-slate-400"></td>
            <td className="py-1.5 px-2 text-right font-black border-r border-slate-400">{totalSupplyAmt.toLocaleString()}</td>
            <td className="py-1.5 px-2 text-right font-black">{totalVat.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>

      {/* Footer Signature */}
      <div className="border border-slate-700 p-3 flex items-center justify-between text-xs bg-slate-50/50">
        <div className="space-y-1">
          <div>위와 같이 정히 납품 및 영수합니다.</div>
          <div className="text-[10.5px] text-slate-500">
            • 본 거래명세표는 GS리테일 물류센터 검수 및 인수 확인용 정식 전표입니다.
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <span className="text-slate-500 text-[10.5px] block">출하 검수자</span>
            <span className="font-bold underline decoration-dotted underline-offset-4">물류출사실 (인)</span>
          </div>
          <div className="text-center">
            <span className="text-slate-500 text-[10.5px] block">인수 확인자</span>
            <span className="font-bold border border-slate-400 px-4 py-1 inline-block rounded-xs bg-white">
              ( 서 명 )
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

