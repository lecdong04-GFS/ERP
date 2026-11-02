'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { HelpCircle, RotateCcw, Calendar, Save } from 'lucide-react';

import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { DAY_CHARS, calcRow, splitWeek, classifyPattern, type SheetRowInput } from '@/lib/gfs/orderCalc';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 로컬 자정 기준 Date → YYYY-MM-DD (UTC 변환 오차 방지) */
function toLocalISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface SheetRow extends SheetRowInput {}

export const MatOrderDayView: React.FC = () => {
  const [orderDate, setOrderDate] = useState(kstToday);
  const [dayIdx, setDayIdx] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return (t.getDay() + 6) % 7; // 월=0
  });
  const [supplierFilter, setSupplierFilter] = useState('전체');
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // 요일별 수동 수정값: dayIdx -> rowId -> 수량
  const [overrides, setOverrides] = useState<Record<number, Record<number, number>>>({});

  useEffect(() => {
    fetch('/api/gfs/order-sheet')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data?.rows)) {
          const loaded: SheetRow[] = json.data.rows.map((r: any) => {
            const pack = r.packUnit || r.packUnitAudit || 0;
            const total = (r.incoming || 0) + (r.currentStock || 0);
            const req = (r.dailyUsage || 0) * (r.days || 0);
            const suggest = pack > 0 ? Math.ceil(Math.max(0, req - total) / pack) : 0;
            return {
              id: r.id,
              supplier: r.supplier || '',
              name: r.name,
              boxesBase: r.boxesBase || 0,
              packUnit: r.packUnit || 0,
              packUnitAudit: r.packUnitAudit || 0,
              days: r.days || 0,
              dailyUsage: r.dailyUsage || 0,
              incoming: r.incoming || 0,
              currentStock: r.currentStock || 0,
              bagPrice: r.bagPrice || 0,
              warehouse: r.warehouse || '',
              vendor: r.vendor || '',
              finalBoxes: suggest,
              manual: false,
            };
          });
          setRows(loaded);
          setSuppliers(json.data.suppliers || []);
        }
      })
      .catch((err) => console.error('Failed to load order sheet', err))
      .finally(() => setIsLoading(false));
  }, []);

  // 요일 탭별 집계 (해당 요일 분할량 기준)
  const dayStats = useMemo(() => {
    return DAY_CHARS.map((_, d) => {
      let items = 0;
      let boxes = 0;
      let amt = 0;
      rows.forEach((r) => {
        if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return;
        if (keyword.trim() && !r.name.toLowerCase().includes(keyword.trim().toLowerCase())) return;
        const c = calcRow(r);
        if (c.finalBoxes <= 0) return;
        const q = splitWeek(r, c.finalBoxes)[d];
        if (q > 0) {
          items += 1;
          boxes += q;
          amt += q * c.pack * r.bagPrice;
        }
      });
      return { items, boxes, amt };
    });
  }, [rows, supplierFilter, keyword]);

  const dayRows = useMemo(() => {
    return rows
      .map((r) => {
        if (supplierFilter !== '전체' && r.supplier !== supplierFilter) return null;
        if (keyword.trim() && !r.name.toLowerCase().includes(keyword.trim().toLowerCase())) return null;
        const c = calcRow(r);
        if (c.finalBoxes <= 0) return null;
        const week = splitWeek(r, c.finalBoxes);
        const override = overrides[dayIdx]?.[r.id];
        const dayQty = override !== undefined ? override : week[dayIdx];
        if (dayQty <= 0) return null;
        return { r, c, week, dayQty };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [rows, supplierFilter, keyword, dayIdx, overrides]);

  const dayTotals = useMemo(() => {
    let boxes = 0;
    let amt = 0;
    dayRows.forEach(({ dayQty, c, r }) => {
      boxes += dayQty;
      amt += dayQty * c.pack * r.bagPrice;
    });
    return { boxes, amt };
  }, [dayRows]);

  // 해당 요일 날짜 (발주일 + offset)
  const dayDate = useMemo(() => {
    const base = new Date(orderDate + 'T00:00:00');
    base.setDate(base.getDate() + dayIdx);
    return toLocalISODate(base);
  }, [orderDate, dayIdx]);

  const handleDayQtyChange = (id: number, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setOverrides((prev) => ({ ...prev, [dayIdx]: { ...(prev[dayIdx] || {}), [id]: num } }));
  };

  const handleResetDay = () => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[dayIdx];
      return next;
    });
  };

  const handleSaveDay = async () => {
    if (dayRows.length === 0) {
      alert('해당 요일에 발주할 품목이 없습니다.');
      return;
    }
    setIsSaving(true);
    try {
      const matRes = await fetch('/api/gfs/materialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: dayDate,
          items: dayRows.map(({ r, c, dayQty }) => ({
            name: r.name,
            boxes: dayQty,
            packUnit: c.pack || r.packUnit,
            bagPrice: r.bagPrice,
            supplierHeader: r.supplier,
          })),
        }),
      });
      const matJson = await matRes.json();
      if (!matJson.success) {
        alert('품목 매칭 실패: ' + (matJson.error || '알 수 없는 오류'));
        return;
      }
      const orderItems = (matJson.data?.matched || [])
        .filter((m: any) => m.productCode)
        .map((m: any) => ({
          productCode: m.productCode,
          orderQty: m.orderQty,
          unitPrice: m.boxPrice || 0,
          partnerId: m.partnerId || undefined,
        }));
      if (orderItems.length === 0) {
        alert('ERP 품목과 매칭된 항목이 없습니다.');
        return;
      }
      const res = await fetch('/api/gfs/order-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: dayDate,
          memo: `자재발주(요일별 ${DAY_CHARS[dayIdx]}요일)`,
          items: orderItems,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const orders = (json.data || []).map((o: any) => o.orderNo).join(', ');
        alert(`${DAY_CHARS[dayIdx]}요일 발주 확정 완료\n${json.message}\n${orders}`);
      } else {
        alert('발주 실패: ' + json.error);
      }
    } catch (err: any) {
      alert('발주 저장 중 오류: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f0f2f5] select-none text-[12.5px] font-sans">
      {/* 1. 상단 다크 헤더 바 */}
      <div className="h-[32px] bg-[#333333] border-b border-[#222222] px-3 flex items-center justify-between text-white shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 bg-[#4caf50] rounded-2xs inline-block" />
          <h1 className="text-[13px] font-bold tracking-tight text-white">자재발주 (요일별)</h1>
          <span className="text-[10px] text-gray-300 font-mono">납품요일 기준 분할</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSaveDay}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1 bg-[#2e7d32] hover:bg-[#1b5e20] disabled:opacity-50 text-white rounded-xs text-[11px] font-bold transition-colors shadow-2xs cursor-pointer border border-[#1b5e20]"
          >
            <Save size={12} className="stroke-[2.5]" />
            {isSaving ? '저장 중...' : `${DAY_CHARS[dayIdx]}요일 발주확정`}
          </button>
          <button
            type="button"
            onClick={handleResetDay}
            className="flex items-center gap-1 px-3 py-1 bg-[#607d8b] hover:bg-[#546e7a] text-white rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-[#455a64]"
          >
            <RotateCcw size={12} className="stroke-[2.5]" />
            산출초기화
          </button>
          <button
            type="button"
            onClick={() => alert('요일별: 거래처 납품요일(월수금/화목토/매일)에 따라 확정량을 자동 분할합니다. 요일 탭을 눌러 해당일 발주분을 확정하세요.')}
            className="w-5 h-5 flex items-center justify-center rounded-full bg-black hover:bg-gray-800 text-white cursor-pointer ml-1 text-[11px] font-bold"
          >
            <HelpCircle size={13} />
          </button>
        </div>
      </div>

      {/* 2. 요일 탭 바 */}
      <div className="bg-[#e2e8f0] border-b border-gray-300 px-3 flex items-center gap-1 shrink-0 h-[38px] overflow-x-auto">
        {DAY_CHARS.map((d, i) => {
          const isActive = dayIdx === i;
          const st = dayStats[i];
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDayIdx(i)}
              className={`flex items-center gap-1.5 h-[30px] px-3 rounded-t text-[12px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-white text-blue-700 border-t-2 border-t-blue-600 border-x border-gray-300 shadow-xs'
                  : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-slate-200/80'
              }`}
            >
              <span>{d}요일</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-300 text-gray-700'}`}>
                {st.items}건 {st.boxes > 0 ? `${st.boxes}박스` : ''}
              </span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 pl-2">
          <span className="font-bold text-gray-700 text-[11px]">발주일자</span>
          <div className="flex items-center bg-white border border-gray-300 px-2 py-0.5 rounded-xs shadow-2xs text-[11px]">
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="font-medium text-gray-800 outline-none"
            />
            <Calendar size={12} className="text-gray-500 ml-1" />
          </div>
          <span className="text-[11px] text-gray-600">→ {DAY_CHARS[dayIdx]}({dayDate})</span>
        </div>
      </div>

      {/* 3. 필터 바 */}
      <div className="bg-[#f5f6f8] border-b border-[#cccccc] px-3 py-1 flex items-center justify-between shrink-0 h-[30px]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-700 text-[11px]">거래처</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[11px] font-medium rounded-xs shadow-2xs w-[220px] h-[22px] outline-none focus:border-blue-500"
            >
              <option value="전체">전체 ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="품명 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="bg-white border border-gray-300 px-2 py-0.5 text-[11px] rounded-xs w-[180px] h-[22px] outline-none focus:border-blue-500"
          />
        </div>
        <div className="text-[11px] text-gray-700 font-semibold bg-white px-2.5 py-0.5 rounded-xs border border-gray-300 shadow-2xs">
          {DAY_CHARS[dayIdx]}요일: <span className="font-bold text-emerald-700">{dayRows.length}건 {dayTotals.boxes.toLocaleString()}박스</span>
          {' '}<span className="font-bold text-gray-900">{Math.round(dayTotals.amt).toLocaleString()}원</span>
        </div>
      </div>

      {/* 4. 요일 발주 그리드 */}
      <div className="flex-1 p-0.5 min-h-0 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 min-h-0 overflow-auto border border-[#a4abb6]">
          {isLoading ? (
            <div className="py-20 text-center text-gray-500">발주서 정본을 불러오는 중입니다...</div>
          ) : (
          <EditableTableWrapper><table className="w-full min-w-full border-collapse text-[12.5px] font-sans">
            <thead className="sticky top-0 z-20 bg-[#c5cbf0] text-gray-900 font-semibold border-b border-[#9098aa]">
              <tr className="h-[32px] leading-tight text-center whitespace-nowrap font-bold">
                <th className="border border-[#9098aa] px-1.5 py-0.5 w-[40px]">No</th>
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[180px] text-left">거래처명</th>
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[280px] text-left">품목</th>
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[80px]">납품요일</th>
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px] text-center">창고</th>
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[85px] bg-[#b5bbf5]">{DAY_CHARS[dayIdx]} 발주량</th>
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[60px]">입수량</th>
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[80px] text-right">봉단가</th>
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[100px] text-right">금액</th>
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px]">전체확정</th>
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[120px] text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.length === 0 ? (
                <tr><td colSpan={11} className="py-20 text-center text-gray-400 italic">해당 요일 발주 품목이 없습니다.</td></tr>
              ) : dayRows.map(({ r, c, dayQty }, idx) => (
                <tr key={r.id} className="h-[21px] border-b border-gray-300 hover:bg-[#eef3fb] bg-white text-gray-900">
                  <td className="border border-gray-300 text-center text-gray-500 font-mono text-[11px] bg-gray-50">{idx + 1}</td>
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left text-gray-800" title={r.supplier}>{r.supplier}</td>
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left font-medium" title={r.name}>{r.name}</td>
                  <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center text-[11px] font-bold text-blue-700">{classifyPattern(r.supplier)}</td>
                  <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center text-gray-700">{r.warehouse || '-'}</td>
                  <td className="border border-gray-300 p-0 text-right font-mono bg-amber-50/40">
                    <input
                      type="number"
                      value={dayQty}
                      onChange={(e) => handleDayQtyChange(r.id, e.target.value)}
                      className="w-full h-full text-right font-bold text-gray-900 border-none outline-none focus:ring-1 focus:ring-blue-500 bg-transparent px-1.5"
                    />
                  </td>
                  <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-600">{c.pack || '-'}</td>
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-800">{r.bagPrice ? r.bagPrice.toLocaleString() : '-'}</td>
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                    {dayQty * c.pack * r.bagPrice ? Math.round(dayQty * c.pack * r.bagPrice).toLocaleString() : '-'}
                  </td>
                  <td className="border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-500">{c.finalBoxes.toLocaleString()}</td>
                  <td className="border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left text-gray-500 text-[11px]">
                    {r.vendor ? `${r.vendor}` : ''}{r.dailyUsage ? ` · 일${r.dailyUsage}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-[#ffffcc] border-t-2 border-[#9098aa] font-bold text-gray-900 shadow-inner">
              <tr className="h-[25px]">
                <td colSpan={5} className="border border-[#9098aa] px-2 py-1 text-center">합계 ({DAY_CHARS[dayIdx]}요일)</td>
                <td className="border border-[#9098aa] px-1 py-1 text-right font-mono text-blue-900">{dayTotals.boxes.toLocaleString()}</td>
                <td className="border border-[#9098aa] px-1 py-1"></td>
                <td className="border border-[#9098aa] px-2 py-1"></td>
                <td className="border border-[#9098aa] px-2 py-1 text-right font-mono">{dayTotals.amt ? Math.round(dayTotals.amt).toLocaleString() : ''}</td>
                <td className="border border-[#9098aa] px-1 py-1"></td>
                <td className="border border-[#9098aa] px-2 py-1"></td>
              </tr>
            </tfoot>
          </table></EditableTableWrapper>
          )}
        </div>
      </div>
    </div>
  );
};
