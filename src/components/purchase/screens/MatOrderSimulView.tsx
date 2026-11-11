'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { HelpCircle, Search, RotateCcw, Calendar, Save } from 'lucide-react';

import { useInlineEdit } from '@/components/common/EditableCell';
import { EditableTableWrapper } from '@/components/common/EditableTableWrapper';
import { classifyPattern } from '@/lib/gfs/orderCalc';
import { normName } from '@/lib/gfs/norm';
export interface MatOrderSimulItem {
  id: number;
  supplier: string; // 거래처
  category: string; // 구분 (원재료, 부재료)
  itemName: string; // 품명
  spec: string; // 규격
  unit: string; // 단위
  orderQty: number; // 발주수량
  unitPrice: number; // 발주단가
  orderAmt: number; // 발주금액
  leadTime: string; // 조달기간
  recvDate: string; // 입고일
  recvDay: string; // 입고요일
  currentStock: number; // 현재고
  stockDesc: string; // 재고설명
  discontinueDate: string; // 완성품단종일
  discontinueList: string; // 단종목록 (원천 없음, '-' 표시)
  incomingScheduled: number; // 입고예정량
  remark: string; // 비고
  productCode?: string; // 품번 (발주 확정 시 매칭용)
  partnerId?: string; // 거래처 ID (발주 확정 시 그룹핑용)
  calcQty: number; // 발주계산수량 (순소요량)
  safetyStock: number; // 안전재고
  dailyUse: number; // 일사용량 (발주서 H열)
  packUnit: number; // 입수량 (발주서 E열, 없으면 기준정보)
  orderDays: number; // 발주일수 (발주서 G열)
  stockDays: number | null; // 재고유지일 (발주서 N열)
  pattern: string; // 납품패턴 (공급사 납품요일)
}

/** KST 오늘 YYYY-MM-DD */
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** KST 기준 N일 뒤 YYYY-MM-DD + 요일(월=0) */
function kstAddDays(baseYmd: string, n: number): { date: string; dow: number } {
  const d = new Date(baseYmd + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = (v: number) => String(v).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { date, dow: (d.getDay() + 6) % 7 };
}

const WEEK_KO = ['월', '화', '수', '목', '금', '토', '일'];

export const MatOrderSimulView: React.FC = () => {
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [rows, setRows] = useState<MatOrderSimulItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const todayStr = kstToday();
  const todayLabel = (() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${y}년 ${m}월 ${d}일 ${['일', '월', '화', '수', '목', '금', '토'][dt.getDay()]}요일`;
  })();

  // 실데이터 로드 (DB 그대로 표시 — 빈 결과도 그대로, 샘플 없음)
  // 발주서 정본에서 계산근거(발주일수/일사용량/재고유지일/납품패턴)를 품명 매칭으로 보완
  const loadSimulData = async () => {
    setIsLoading(true);
    try {
      const [reqRes, sheetRes] = await Promise.all([
        fetch('/api/purchase/order-req-confirm', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/gfs/order-sheet', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);
      const sheetByNorm = new Map<string, any>();
      if (sheetRes?.success && Array.isArray(sheetRes.data?.rows)) {
        sheetRes.data.rows.forEach((o: any) => {
          const k = normName(o.name || '');
          if (k && !sheetByNorm.has(k)) sheetByNorm.set(k, o);
        });
      }
      const json = reqRes;
      if (json.success && Array.isArray(json.data)) {
        const loaded: MatOrderSimulItem[] = json.data.map((r: any, idx: number) => {
          const lead = Math.max(0, Math.round(Number(r.leadTime) || 0));
          const recv = kstAddDays(todayStr, lead);
          const ref = sheetByNorm.get(normName(r.itemName || ''));
          return {
            id: r.id ?? idx + 1,
            productCode: r.materialCode || '',
            partnerId: r.partnerId || '',
            supplier: r.supplier || '미지정거래처',
            category: r.category || '원재료',
            itemName: r.itemName || '',
            spec: r.spec || '',
            unit: r.unit || 'ea',
            orderQty: Math.max(0, Math.round(Number(r.orderQty) || 0)),
            unitPrice: Math.max(0, Math.round(Number(r.unitPrice) || 0)),
            orderAmt: Math.max(0, Math.round(Number(r.orderQty) || 0)) * Math.max(0, Math.round(Number(r.unitPrice) || 0)),
            leadTime: lead > 0 ? `${lead}일` : '-',
            recvDate: recv.date,
            recvDay: WEEK_KO[recv.dow],
            currentStock: Number(r.currentStock) || 0,
            stockDesc: r.status || '',
            discontinueDate: '',
            discontinueList: '',
            incomingScheduled: Number(r.incomingScheduled) || 0,
            remark: '',
            calcQty: Number(r.calcQty) || 0,
            safetyStock: Math.max(0, Math.round(Number(r.safetyStock) || 0)),
            packUnit: ref && Number(ref.packUnit) > 0 ? Number(ref.packUnit) : (Number(r.unitQty) || 0),
            dailyUse: ref && Number(ref.dailyUsage) > 0 ? Number(ref.dailyUsage) : 0,
            orderDays: ref && Number(ref.days) > 0 ? Number(ref.days) : 0,
            stockDays: ref && ref.stockDays != null && !isNaN(Number(ref.stockDays)) ? Number(ref.stockDays) : null,
            pattern: ref ? classifyPattern(ref.orderDay || ref.supplier || '') : '기타',
          };
        });
        setRows(loaded);
      } else {
        setRows([]);
      }
    } catch (err) {
      console.error('Failed to load simul order requirements', err);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSimulData();
  }, []);

  const handleSaveOrder = async () => {
    const targets = rows.filter((r) => Number(r.orderQty) > 0);
    if (targets.length === 0) {
      alert('발주수량이 1 이상인 품목이 없습니다.');
      return;
    }
    if (!window.confirm(`시뮬레이션 발주 ${targets.length}건 (${targets.reduce((s, r) => s + Math.round(Number(r.orderQty) || 0), 0).toLocaleString()}박스)을 확정할까요?\n거래처별 정식 발주서가 생성됩니다.`)) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/purchase/order-req-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: todayStr,
          createdBy: 'simul',
          items: targets.map((r) => ({
            materialCode: r.productCode || undefined,
            itemName: r.itemName,
            category: r.category,
            spec: r.spec,
            unit: r.unit,
            orderQty: Math.round(Number(r.orderQty)),
            unitPrice: Math.round(Number(r.unitPrice)),
            partnerId: r.partnerId || undefined,
            partnerName: r.supplier,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`발주 확정 완료\n${json.message || ''}`);
        void loadSimulData();
      } else {
        alert('발주 실패: ' + json.error);
      }
    } catch (err: any) {
      alert('발주 저장 중 오류: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 매입처 목록 (실데이터 기준 동적)
  const suppliers = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const name = String(r.supplier || '').trim();
      if (name) s.add(name);
    });
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (supplierFilter === 'ALL') return rows;
    return rows.filter((r) => r.supplier.includes(supplierFilter));
  }, [rows, supplierFilter]);

  const totalAmt = useMemo(() => {
    return filteredRows.reduce((acc, r) => acc + r.orderAmt, 0);
  }, [filteredRows]);

  const totalQty = useMemo(() => {
    return filteredRows.reduce((acc, r) => acc + r.orderQty, 0);
  }, [filteredRows]);

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

  const handleQtyChange = (id: number, val: string) => {
    const num = Number(val) || 0;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          return {
            ...r,
            orderQty: num,
            orderAmt: num * r.unitPrice,
          };
        }
        return r;
      })
    );
  };

  const handleSearch = () => {
    void loadSimulData();
  };

  const handleReset = () => {
    setSupplierFilter('ALL');
    void loadSimulData();
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f0f2f5] select-none text-[12.5px] font-sans">
      {/* 1. 상단 다크 헤더 바 (101246.png 원본 일치) */}
      <div className="h-[32px] bg-[#333333] border-b border-[#222222] px-3 flex items-center justify-between text-white shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 bg-[#4caf50] rounded-2xs inline-block" />
          <h1 className="text-[13px] font-bold tracking-tight text-white">자재발주 (시뮬)</h1>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleSaveOrder()}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1 bg-[#2e7d32] hover:bg-[#1b5e20] disabled:opacity-50 text-white rounded-xs text-[11px] font-bold transition-colors shadow-2xs cursor-pointer border border-[#1b5e20]"
          >
            <Save size={12} className="stroke-[2.5]" />
            {isSaving ? '저장 중...' : '발주확정'}
          </button>
          <button
            type="button"
            onClick={handleSearch}
            className="flex items-center gap-1 px-3 py-1 bg-[#607d8b] hover:bg-[#546e7a] text-white rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-[#455a64]"
          >
            <Search size={12} className="stroke-[2.5]" />
            조회
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-1 bg-[#607d8b] hover:bg-[#546e7a] text-white rounded-xs text-[11px] font-medium transition-colors shadow-2xs cursor-pointer border border-[#455a64]"
          >
            <RotateCcw size={12} className="stroke-[2.5]" />
            초기화
          </button>
          <button
            type="button"
            onClick={() => alert('도움말: 자재발주 (시뮬) 화면')}
            className="w-5 h-5 flex items-center justify-center rounded-full bg-black hover:bg-gray-800 text-white cursor-pointer ml-1 text-[11px] font-bold"
          >
            <HelpCircle size={13} />
          </button>
        </div>
      </div>

      {/* 2. 조건 검색 바 (101246.png 원본 일치) */}
      <div className="bg-[#f5f6f8] border-b border-[#cccccc] px-3 py-1 flex items-center justify-between shrink-0 h-[30px]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-700 text-[11px]">발주일자</span>
              <div className="flex items-center bg-white border border-gray-300 px-2 py-0.5 rounded-xs shadow-2xs text-[11px]">
                <span className="font-medium text-gray-800 mr-2">{todayLabel}</span>
                <Calendar size={12} className="text-gray-500" />
              </div>
            </div>

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-700 text-[11px]">매입처</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-white border border-gray-300 px-2 py-0.5 text-[11px] font-medium rounded-xs shadow-2xs w-[160px] h-[22px] outline-none focus:border-blue-500"
            >
              <option value="ALL">ALL ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-[11px] text-gray-700 font-semibold bg-white px-2.5 py-0.5 rounded-xs border border-gray-300 shadow-2xs">
          LblCnt_M: <span className="font-bold text-blue-700">{filteredRows.length}</span>
        </div>
      </div>

      {/* 3. 대형 데이터 그리드 (101246.png 정확 일치 18개 컬럼) */}
      <div className="flex-1 p-0.5 min-h-0 overflow-hidden flex flex-col bg-white">
        <div className="flex-1 min-h-0 overflow-auto border border-[#a4abb6]">
          <EditableTableWrapper><table className="w-full min-w-full border-collapse text-[12.5px] font-sans">
            <thead className="sticky top-0 z-20 bg-[#c5cbf0] text-gray-900 font-semibold border-b border-[#9098aa]">
              <tr className="h-[32px] leading-tight text-center whitespace-nowrap font-bold">
                {/* 거래처 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[110px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>거래처</span>
                    
                  </div>
                </th>

                {/* 구분 */}
                <th className="border border-[#9098aa] px-1 py-0.5 w-[48px] min-w-[48px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>구분</span>
                    
                  </div>
                </th>

                {/* 품명 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[150px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>품명</span>
                    
                  </div>
                </th>

                {/* 규격 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[90px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>규격</span>
                    
                  </div>
                </th>

                {/* 단위 */}
                <th className="border border-[#9098aa] px-1 py-0.5 w-[40px] min-w-[40px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>단위</span>
                    
                  </div>
                </th>

                {/* 발주수량 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[65px] text-center">
                  발주수량
                </th>

                {/* 발주단가 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[75px] text-center">
                  발주단가
                </th>

                {/* 발주금액 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[90px] text-center">
                  발주금액
                </th>

                {/* 발주계산수량 (순소요량) */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[80px] text-center">
                  발주계산수량
                </th>

                {/* 안전재고 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[64px] text-center">
                  안전재고
                </th>

                {/* 일사용량 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px] text-center">
                  일사용량
                </th>

                {/* 재고유지일 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[64px] text-center">
                  재고유지일
                </th>

                {/* 입수량 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[56px] text-center">
                  입수량
                </th>

                {/* 발주일수 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[56px] text-center">
                  발주일수
                </th>

                {/* 조달기간 (2줄) */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[48px] text-center">
                  <span>조달기간</span>
                </th>

                {/* 납품패턴 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[70px] text-center">
                  납품패턴
                </th>

                {/* 입고일 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[75px] text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span>입고일</span>
                    
                  </div>
                </th>

                {/* 입고요일 */}
                <th className="border border-[#9098aa] px-1 py-0.5 min-w-[40px] text-center">
                  입고요일
                </th>

                {/* 현재고 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[65px] text-center">
                  현재고
                </th>

                {/* 재고설명 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[70px] text-center">
                  재고설명
                </th>

                {/* 입고예정량 (2줄) */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[70px] text-center">
                  <span>입고예정량</span>
                </th>

                {/* 비고 */}
                <th className="border border-[#9098aa] px-2 py-0.5 min-w-[85px] text-center">
                  비고
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={22} className="py-10 text-center text-gray-500">
                    불러오는 중입니다...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={22} className="py-10 text-center text-gray-500">
                    해당 일자 소요량이 없습니다. (소요량은 파이프라인 실행 시 자동 계산됩니다)
                  </td>
                </tr>
              ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="h-[21px] border-b border-gray-300 hover:bg-[#eef3fb] bg-white text-gray-900"
                >
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left font-medium truncate max-w-[160px]" title={row.supplier}>
                    {row.supplier}
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center text-gray-700">
                    {row.category}
                  </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-left font-medium text-gray-900 truncate max-w-[260px]" title={row.itemName}>
                    {row.itemName}
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-center text-gray-700 truncate max-w-[130px]" title={row.spec}>
                    {row.spec}
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center text-gray-700">
                    {row.unit}
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap p-0 text-right font-mono bg-white">
                    <input
                      type="number"
                      value={row.orderQty}
                      onChange={(e) => handleQtyChange(row.id, e.target.value)}
                      className="w-full h-full text-right font-bold text-gray-900 border-none outline-none focus:ring-1 focus:ring-blue-500 bg-transparent px-1.5"
                    />
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-800">
                    {row.unitPrice.toLocaleString()}
                  </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono font-medium text-gray-900">
                      {row.orderAmt.toLocaleString()}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-indigo-800" title="순소요량 (소요량+안전재고-현재고-입고예정)">
                      {row.calcQty ? row.calcQty.toLocaleString() : '-'}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                      {row.safetyStock ? row.safetyStock.toLocaleString() : '-'}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                      {row.dailyUse ? row.dailyUse.toLocaleString() : '-'}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-700">
                      {row.stockDays != null ? row.stockDays : '-'}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1 py-0.5 text-right font-mono text-gray-700">
                      {row.packUnit > 0 ? row.packUnit.toLocaleString() : '-'}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center font-mono text-gray-700">
                      {row.orderDays > 0 ? row.orderDays : '-'}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center font-mono text-gray-700">
                      {row.leadTime}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center font-bold text-teal-700">
                      {row.pattern}
                    </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center font-mono text-gray-800">
                    {row.recvDate}
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1 py-0.5 text-center font-medium text-blue-800">
                    {row.recvDay}
                  </td>
                  <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-800">
                    {row.currentStock.toLocaleString()}
                  </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1.5 py-0.5 text-center text-gray-700 truncate max-w-[110px]" title={row.stockDesc}>
                      {row.stockDesc}
                    </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-2 py-0.5 text-right font-mono text-gray-700">
                    {row.incomingScheduled.toLocaleString()}
                  </td>
                    <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-gray-300 whitespace-nowrap px-1.5 py-0.5 text-left text-gray-600 truncate max-w-[200px]" title={row.remark}>
                      {row.remark}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* 하단 요약 합계 행 (101246.png 일치: 연노랑 배경) */}
            <tfoot className="sticky bottom-0 z-20 bg-[#ffffcc] border-t-2 border-[#9098aa] font-bold text-gray-900 shadow-inner">
              <tr className="h-[25px]">
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-2 py-1 text-center font-bold">합계</td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-2 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-2 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1 text-right font-mono text-blue-900 font-bold">
                  {totalQty.toLocaleString()}
                </td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-2 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-2 py-1 text-right font-mono text-gray-900 font-bold">
                  {totalAmt.toLocaleString()}
                </td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-2 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-2 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-2 py-1"></td>
                <td className="cursor-pointer hover:bg-blue-50/80 hover:outline hover:outline-1 hover:outline-blue-400 border border-[#9098aa] px-1 py-1"></td>
              </tr>
            </tfoot>
          </table></EditableTableWrapper>
        </div>
      </div>
    </div>
  );
};
