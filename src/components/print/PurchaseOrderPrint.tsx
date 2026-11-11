'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { PurchaseOrderPrintPayload } from '@/context/PrintReportContext';

interface PurchaseOrderPrintProps {
  payload?: PurchaseOrderPrintPayload | null;
  payloads?: PurchaseOrderPrintPayload[] | null;
  writerName?: string;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kstDaysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
}

function formatQty(value: number): string {
  const n = Number(value) || 0;
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function mapApiOrderToPayload(o: any): PurchaseOrderPrintPayload {
  const details = Array.isArray(o?.details) ? o.details : [];
  const items = details.map((d: any, idx: number) => {
    const qty = Number(d.orderQty) || 0;
    const price = Number(d.unitPrice) || 0;
    const amt = Number(d.amount) > 0 ? Number(d.amount) : Math.round(qty * price);
    return {
      no: idx + 1,
      name: d.product?.name || d.productName || '자재품목',
      spec: d.product?.spec || '-',
      unit: d.unit || 'box',
      qty,
      price,
      amt,
      recvDate: o.deliveryDate || o.orderDate,
      remark: d.remark || '',
    };
  });
  const computedTotal = items.reduce((s: number, it: { amt: number }) => s + it.amt, 0);
  return {
    orderNo: o.orderNo || '-',
    orderDate: o.orderDate || kstToday(),
    deliveryDate: o.deliveryDate || o.orderDate || '',
    supplierName: o.partnerName || o.partner?.name || '공급처',
    tel: o.partner?.tel || '',
    remark: o.remark || '',
    totalAmount: Number(o.totalAmount) > 0 ? Number(o.totalAmount) : computedTotal,
    items,
  };
}

export const PurchaseOrderPrint: React.FC<PurchaseOrderPrintProps> = ({
  payload,
  payloads,
  writerName,
}) => {
  const explicitList = useMemo<PurchaseOrderPrintPayload[]>(() => {
    if (payloads && payloads.length > 0) return payloads;
    if (payload) return [payload];
    return [];
  }, [payload, payloads]);

  const hasExplicitPayload = explicitList.length > 0;

  // Standalone fallback state when opened directly from TopHeader Print Center
  const [recentOrders, setRecentOrders] = useState<PurchaseOrderPrintPayload[]>([]);
  const [selectedOrderNo, setSelectedOrderNo] = useState<string>('FIRST');
  const [loading, setLoading] = useState<boolean>(false);

  const loadRecentOrders = useCallback(async () => {
    setLoading(true);
    try {
      const start = kstDaysAgo(14);
      const end = kstToday();
      const res = await fetch(`/api/purchase/order?startDate=${start}&endDate=${end}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped = json.data
          .filter((o: any) => o.status !== '발주취소')
          .map(mapApiOrderToPayload);
        setRecentOrders(mapped);
        if (mapped.length > 0) {
          setSelectedOrderNo(mapped[0].orderNo);
        }
      } else {
        setRecentOrders([]);
      }
    } catch {
      setRecentOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasExplicitPayload) {
      loadRecentOrders();
    }
  }, [hasExplicitPayload, loadRecentOrders]);

  const ordersToRender = useMemo<PurchaseOrderPrintPayload[]>(() => {
    if (hasExplicitPayload) return explicitList;
    if (recentOrders.length === 0) return [];
    if (selectedOrderNo === 'ALL') return recentOrders.slice(0, 15);
    const matched = recentOrders.find((o) => o.orderNo === selectedOrderNo);
    return matched ? [matched] : [recentOrders[0]];
  }, [hasExplicitPayload, explicitList, recentOrders, selectedOrderNo]);

  if (!hasExplicitPayload && loading) {
    return (
      <div className="py-20 text-center text-slate-500 text-sm font-medium">
        최근 14일간 등록된 실제 발주 내역을 불러오는 중입니다...
      </div>
    );
  }

  if (ordersToRender.length === 0) {
    return (
      <div className="py-16 px-6 text-center border border-dashed border-slate-300 rounded-lg bg-slate-50">
        <p className="text-sm font-bold text-slate-700 mb-1.5">
          인쇄할 원부자재 발주서 내역이 없습니다.
        </p>
        <p className="text-xs text-slate-500">
          [자재발주(요일별)]에서 발주를 확정하거나, [발주 현황 및 수정] / [발주서출력] 화면에서
          인쇄할 발주서를 선택해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full text-slate-900 font-sans">
      {/* Standalone Print Center selector bar (hidden when printing or when opened from PO screens) */}
      {!hasExplicitPayload && recentOrders.length > 0 && (
        <div className="mb-4 p-2.5 bg-slate-100 border border-slate-300 rounded flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-700">최근 발주서 선택:</span>
            <select
              value={selectedOrderNo}
              onChange={(e) => setSelectedOrderNo(e.target.value)}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium text-slate-800"
            >
              {recentOrders.map((o) => (
                <option key={o.orderNo} value={o.orderNo}>
                  [{o.orderDate}] {o.orderNo} — {o.supplierName} ({o.items.length}품목 ·{' '}
                  {Math.round(o.totalAmount).toLocaleString()}원)
                </option>
              ))}
              {recentOrders.length > 1 && (
                <option value="ALL">
                  전체 일괄 선택 (최근 {Math.min(recentOrders.length, 15)}건)
                </option>
              )}
            </select>
          </div>
          <button
            type="button"
            onClick={loadRecentOrders}
            className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded text-[11px] font-bold text-slate-700 cursor-pointer"
          >
            새로고침
          </button>
        </div>
      )}

      {ordersToRender.map((po, pageIdx) => {
        const items = po.items || [];
        const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
        const itemsAmtSum = items.reduce((s, it) => {
          const lineAmt =
            Number(it.amt) > 0
              ? Number(it.amt)
              : Math.round((Number(it.qty) || 0) * (Number(it.price) || 0));
          return s + lineAmt;
        }, 0);
        const totalAmt = itemsAmtSum > 0 ? itemsAmtSum : Number(po.totalAmount) || 0;
        const blankRowCount = items.length < 6 ? 6 - items.length : 0;
        const isLast = pageIdx === ordersToRender.length - 1;

        return (
          <section
            key={`${po.orderNo}-${pageIdx}`}
            style={{ pageBreakAfter: isLast ? 'auto' : 'always' }}
            className={`w-full bg-white ${
              !isLast
                ? 'mb-10 pb-8 border-b-2 border-dashed border-slate-300 print:mb-0 print:pb-0 print:border-0 print:break-after-page'
                : ''
            }`}
          >
            {/* Header + Approval Boxes */}
            <div className="flex justify-between items-start gap-4 pb-3 border-b-2 border-slate-900 mb-3">
              <div className="min-w-0">
                <div className="inline-block px-2 py-0.5 bg-slate-900 text-white text-[10px] font-bold tracking-wider mb-1">
                  PURCHASE ORDER · 공식 원부자재 발주서
                </div>
                <h1 className="text-[26px] font-black tracking-[0.4em] text-slate-900 leading-tight">
                  발 주 서
                </h1>
                <div className="text-[11px] text-slate-700 font-semibold mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                  <span>
                    발주번호: <strong className="text-slate-950">{po.orderNo}</strong>
                  </span>
                  <span>|</span>
                  <span>
                    발주일자: <strong className="text-slate-950">{po.orderDate}</strong>
                  </span>
                  {po.deliveryDate && (
                    <>
                      <span>|</span>
                      <span>
                        입고예정일:{' '}
                        <strong className="text-blue-900 print:text-slate-950">
                          {po.deliveryDate}
                        </strong>
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 3-stage Approval Box */}
              <table className="border-collapse border border-slate-800 text-[10.5px] shrink-0">
                <tbody>
                  <tr>
                    <th
                      rowSpan={2}
                      className="w-6 border border-slate-800 bg-slate-100 font-bold px-1 py-2 text-center leading-tight"
                    >
                      결<br />재
                    </th>
                    <th className="w-16 border border-slate-800 bg-slate-100 py-1 font-bold text-center">
                      작성
                    </th>
                    <th className="w-16 border border-slate-800 bg-slate-100 py-1 font-bold text-center">
                      검토
                    </th>
                    <th className="w-16 border border-slate-800 bg-slate-100 py-1 font-bold text-center">
                      승인
                    </th>
                  </tr>
                  <tr className="h-12">
                    <td className="border border-slate-800 text-center align-bottom pb-1 text-[10px] text-slate-600">
                      {writerName || '담당'}
                    </td>
                    <td className="border border-slate-800 text-center text-slate-300" />
                    <td className="border border-slate-800 text-center text-slate-300" />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Supplier & Buyer Information */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Left: Supplier (Recipient) */}
              <table className="w-full border-collapse border border-slate-800 text-[11px]">
                <tbody>
                  <tr>
                    <th
                      colSpan={2}
                      className="bg-slate-100 border-b border-slate-800 py-1 px-2 text-center font-extrabold text-slate-900"
                    >
                      공 급 업 체 (수신)
                    </th>
                  </tr>
                  <tr>
                    <th className="w-20 bg-slate-50 border border-slate-400 py-1 px-2 font-bold">
                      상 호
                    </th>
                    <td className="border border-slate-400 py-1 px-2 font-extrabold text-[12px] text-slate-950">
                      {po.supplierName} <span className="font-normal text-[10.5px]">귀하</span>
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-slate-50 border border-slate-400 py-1 px-2 font-bold">
                      담당자
                    </th>
                    <td className="border border-slate-400 py-1 px-2 text-slate-800">
                      {po.manager || '-'}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-slate-50 border border-slate-400 py-1 px-2 font-bold">
                      연락처
                    </th>
                    <td className="border border-slate-400 py-1 px-2 text-slate-800 tabular-nums">
                      {po.tel || '-'}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-slate-50 border border-slate-400 py-1 px-2 font-bold">
                      비 고
                    </th>
                    <td className="border border-slate-400 py-1 px-2 text-slate-700">
                      {po.remark || '정시 납품 협조 바랍니다.'}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Right: Orderer ((주)지에프에스) */}
              <table className="w-full border-collapse border border-slate-800 text-[11px]">
                <tbody>
                  <tr>
                    <th
                      colSpan={2}
                      className="bg-slate-100 border-b border-slate-800 py-1 px-2 text-center font-extrabold text-slate-900"
                    >
                      발 주 업 체 (발신)
                    </th>
                  </tr>
                  <tr>
                    <th className="w-20 bg-slate-50 border border-slate-400 py-1 px-2 font-bold">
                      회사명
                    </th>
                    <td className="border border-slate-400 py-1 px-2 font-extrabold text-[12px] text-slate-950">
                      (주)지에프에스 (GFS)
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-slate-50 border border-slate-400 py-1 px-2 font-bold">
                      발주일자
                    </th>
                    <td className="border border-slate-400 py-1 px-2 text-slate-800 tabular-nums">
                      {po.orderDate}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-slate-50 border border-slate-400 py-1 px-2 font-bold">
                      입고예정
                    </th>
                    <td className="border border-slate-400 py-1 px-2 font-bold text-slate-900 tabular-nums">
                      {po.deliveryDate || po.orderDate}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-slate-50 border border-slate-400 py-1 px-2 font-bold">
                      담당부서
                    </th>
                    <td className="border border-slate-400 py-1 px-2 text-slate-700">
                      구매관리팀 ({writerName || '담당자'})
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Grand Total Strip */}
            <div className="border-2 border-slate-900 bg-slate-50 px-3.5 py-2 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[12.5px] text-slate-900">
                  합 계 금 액 (발주총액)
                </span>
                <span className="text-[11px] text-slate-600 font-semibold tabular-nums">
                  (총 {items.length}개 품목 · 총수량 {formatQty(totalQty)} · 부가세 별도)
                </span>
              </div>
              <div className="text-[16px] font-black text-slate-950 tabular-nums">
                ₩ {Math.round(totalAmt).toLocaleString()} 원
              </div>
            </div>

            {/* Line Items Table */}
            <table className="w-full border-collapse border border-slate-800 text-[11px] mb-3">
              <thead>
                <tr className="bg-slate-100 border-b-2 border-slate-800 text-slate-900">
                  <th className="w-[34px] py-1.5 px-1 border border-slate-400 font-bold">No</th>
                  <th className="py-1.5 px-2 border border-slate-400 font-bold">품 목 명</th>
                  <th className="w-[92px] py-1.5 px-1.5 border border-slate-400 font-bold">규 격</th>
                  <th className="w-[46px] py-1.5 px-1 border border-slate-400 font-bold">단위</th>
                  <th className="w-[68px] py-1.5 px-1.5 border border-slate-400 font-bold">
                    발주수량
                  </th>
                  <th className="w-[78px] py-1.5 px-1.5 border border-slate-400 font-bold">단 가</th>
                  <th className="w-[92px] py-1.5 px-1.5 border border-slate-400 font-bold">금 액</th>
                  <th className="w-[108px] py-1.5 px-1.5 border border-slate-400 font-bold">
                    비고 / 참고
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, rIdx) => {
                  const qty = Number(item.qty) || 0;
                  const price = Number(item.price) || 0;
                  const lineAmt =
                    Number(item.amt) > 0 ? Number(item.amt) : Math.round(qty * price);
                  const remarkParts = [
                    item.recvDate && item.recvDate !== po.deliveryDate
                      ? `입고:${item.recvDate}`
                      : '',
                    item.remark || '',
                  ].filter(Boolean);

                  return (
                    <tr
                      key={`${po.orderNo}-item-${item.no ?? rIdx}`}
                      className="border-b border-slate-300 break-inside-avoid"
                    >
                      <td className="py-1.5 px-1 border border-slate-400 text-center text-slate-600 tabular-nums">
                        {item.no || rIdx + 1}
                      </td>
                      <td className="py-1.5 px-2 border border-slate-400 text-left font-bold text-slate-900">
                        {item.name}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-400 text-center text-slate-700 text-[10.5px]">
                        {item.spec || '-'}
                      </td>
                      <td className="py-1.5 px-1 border border-slate-400 text-center text-slate-700">
                        {item.unit || 'box'}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-400 text-right font-extrabold text-slate-950 tabular-nums">
                        {formatQty(qty)}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-400 text-right text-slate-700 tabular-nums">
                        {price > 0 ? Math.round(price).toLocaleString() : '-'}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-400 text-right font-extrabold text-slate-950 tabular-nums">
                        {lineAmt > 0 ? Math.round(lineAmt).toLocaleString() : '-'}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-400 text-left text-slate-600 text-[10px]">
                        {remarkParts.join(' · ') || ''}
                      </td>
                    </tr>
                  );
                })}

                {Array.from({ length: blankRowCount }).map((_, bIdx) => (
                  <tr key={`blank-${bIdx}`} className="h-7 border-b border-slate-300">
                    <td className="border border-slate-400 text-center text-slate-300" />
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400" />
                    <td className="border border-slate-400" />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-800 font-extrabold text-slate-900">
                  <td
                    colSpan={4}
                    className="py-1.5 px-2 border border-slate-400 text-center tracking-wider"
                  >
                    합 계 ({items.length} 품목)
                  </td>
                  <td className="py-1.5 px-1.5 border border-slate-400 text-right tabular-nums">
                    {formatQty(totalQty)}
                  </td>
                  <td className="py-1.5 px-1.5 border border-slate-400 text-center text-slate-400">
                    -
                  </td>
                  <td className="py-1.5 px-1.5 border border-slate-400 text-right text-[12px] text-slate-950 tabular-nums">
                    {Math.round(totalAmt).toLocaleString()}
                  </td>
                  <td className="py-1.5 px-1.5 border border-slate-400 text-center text-[10px] font-semibold text-slate-600">
                    부가세 별도
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Delivery Notes & Document Footer */}
            <div className="border border-slate-400 bg-slate-50/70 px-3 py-2 text-[10.5px] text-slate-700 space-y-0.5 mb-2">
              <div className="font-bold text-slate-900">[납품 및 검수 유의사항]</div>
              <div>
                1. 납품 시 본 발주번호(<span className="font-bold">{po.orderNo}</span>)를
                거래명세표에 반드시 표기하여 주시기 바랍니다.
              </div>
              <div>
                2. 원부자재 유통기한·보관온도(냉장/냉동) 및 외포장 상태를 확인하여 정시 납품해
                주십시오.
              </div>
              <div>
                3. 품목·수량·단가 변경 또는 납기 지연 사유 발생 시 사전 협의해 주시기 바랍니다.
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
              <span>(주)지에프에스 · 원부자재 구매관리 공식 발주서</span>
              <span>
                {ordersToRender.length > 1
                  ? `${pageIdx + 1} / ${ordersToRender.length} 페이지`
                  : `발주번호: ${po.orderNo}`}
              </span>
            </div>
          </section>
        );
      })}
    </div>
  );
};
