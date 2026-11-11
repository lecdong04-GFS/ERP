'use client';

import React, { useEffect, useState } from 'react';
import type {
  MatReqPrintPayload,
  PrintDocumentType,
  WorkOrderPrintPayload,
} from '@/context/PrintReportContext';

interface OperationalPrintTemplatesProps {
  activeDocType: PrintDocumentType;
  printDate: string;
  matReqPayload: MatReqPrintPayload | null;
  workOrderPayload: WorkOrderPrintPayload | null;
  writerName: string;
}

const DOC_META: Record<string, { title: string; code: string; dept: string; subtitle: string }> = {
  HACCP_INSPECTION: {
    title: 'HACCP 원·부자재 입고검수일지',
    code: 'GFS-HACCP-RCV-01',
    dept: '품질보증팀 / 구매입고',
    subtitle: '식품위생법 및 HACCP 선행요건(PRP) 원부자재 입고 검수 정본 기록지',
  },
  MATERIAL_LEDGER: {
    title: '일일 자재수불부 (입고 · 출고 · 현재고)',
    code: 'GFS-INV-LED-01',
    dept: '자재관리팀 / 물류창고',
    subtitle: '원부자재 입·출고 및 재고 증감 추적 정본 대장',
  },
  MATERIAL_REQUIREMENT: {
    title: '공정별 자재소요량(MRP) 명세서',
    code: 'GFS-PUR-MRP-01',
    dept: '생산관리팀 / 자재구매',
    subtitle: '일일 생산계획 및 정본 BOM 전개 기준 원부자재 소요 산출표',
  },
  COST_SHEET: {
    title: '제품별 원가 및 매출손익계산서',
    code: 'GFS-CST-PL-01',
    dept: '원가경영팀 / 재무회계',
    subtitle: '매출액 · 직접재료비 · 배부간접비 · 제품별 제조원가손익 정본표',
  },
  WORK_ORDER: {
    title: '공정별 표준 제조작업지시서',
    code: 'GFS-PRD-WO-01',
    dept: '생산본부 / 현장라인',
    subtitle: '일일 생산 편성 및 공정·CCP 핵심관리 작업지시서',
  },
};

function fmtNum(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : '0';
}

export const OperationalPrintTemplates: React.FC<OperationalPrintTemplatesProps> = ({
  activeDocType,
  printDate,
  matReqPayload,
  workOrderPayload,
  writerName,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [extraInfo, setExtraInfo] = useState<string>('');

  const meta = DOC_META[activeDocType] || {
    title: '공인 표준 업무 전표',
    code: 'GFS-ERP-DOC',
    dept: '운영본부',
    subtitle: '표준 업무 서식',
  };

  useEffect(() => {
    let cancelled = false;

    const loadDocData = async () => {
      setError('');
      setExtraInfo('');

      if (activeDocType === 'MATERIAL_REQUIREMENT' && matReqPayload?.rows?.length) {
        setRows(matReqPayload.rows);
        setExtraInfo(
          `라인/계: ${matReqPayload.gyeName} · 편성: ${matReqPayload.shift}${
            matReqPayload.totalFinishedOrderQty
              ? ` · 완제품 계획: ${fmtNum(matReqPayload.totalFinishedOrderQty)} ea`
              : ''
          }`
        );
        return;
      }

      if (activeDocType === 'WORK_ORDER' && workOrderPayload?.rows?.length) {
        setRows(workOrderPayload.rows);
        setExtraInfo(`공정라인: ${workOrderPayload.lineName} · 편성: ${workOrderPayload.shift}`);
        return;
      }

      setLoading(true);
      try {
        if (activeDocType === 'HACCP_INSPECTION') {
          const res = await fetch(`/api/purchase/receiving?startDate=${printDate}&endDate=${printDate}`, {
            cache: 'no-store',
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json?.error || '입고검수 내역 조회 실패');
          const list = Array.isArray(json.data) ? json.data : [];
          const flattened: any[] = [];
          for (const rec of list) {
            const details = Array.isArray(rec.details) ? rec.details : [];
            if (details.length === 0) {
              flattened.push({
                receivingDate: rec.receivingDate || printDate,
                receivingNo: rec.receivingNo || '',
                partnerName: rec.partnerName || rec.partner?.name || '',
                productName: rec.remark || '(상세없음)',
                qty: 0,
                unit: '-',
                temp: '적정',
                judge: '적합',
                lotNo: '-',
              });
            } else {
              for (const d of details) {
                flattened.push({
                  receivingDate: rec.receivingDate || printDate,
                  receivingNo: rec.receivingNo || '',
                  partnerName: rec.partnerName || rec.partner?.name || '',
                  productName: d.productName || d.product?.name || '',
                  qty: Number(d.receivedQty ?? d.qty ?? 0),
                  unit: d.unit || d.product?.unit || 'box',
                  temp: d.tempCheck || d.vehicleTemp || '적정',
                  judge: d.haccpJudge || d.judge || '적합',
                  lotNo: d.lotNo || d.expiryDate || '-',
                });
              }
            }
          }
          if (!cancelled) setRows(flattened);
        } else if (activeDocType === 'MATERIAL_LEDGER') {
          const res = await fetch(`/api/inventory/ledger?ledgerDate=${printDate}`, { cache: 'no-store' });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json?.error || '자재수불부 조회 실패');
          if (!cancelled) setRows(Array.isArray(json.data) ? json.data : []);
        } else if (activeDocType === 'MATERIAL_REQUIREMENT') {
          const res = await fetch(`/api/purchase/order-req-confirm?date=${printDate}`, { cache: 'no-store' });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json?.error || '자재소요량 조회 실패');
          if (!cancelled) setRows(Array.isArray(json.data) ? json.data : []);
        } else if (activeDocType === 'COST_SHEET') {
          const pnlMonth = printDate.slice(0, 7);
          const res = await fetch(`/api/cost/product-pl?pnlMonth=${pnlMonth}`, { cache: 'no-store' });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json?.error || '손익계산서 조회 실패');
          if (!cancelled) {
            setRows(Array.isArray(json.data) ? json.data : []);
            setExtraInfo(`산정 기준월: ${pnlMonth}`);
          }
        } else if (activeDocType === 'WORK_ORDER') {
          const res = await fetch(`/api/production/work-order?workDate=${printDate}`, { cache: 'no-store' });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json?.error || '작업지시 조회 실패');
          if (!cancelled) setRows(Array.isArray(json.data) ? json.data : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || '인쇄 데이터를 불러오지 못했습니다.');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDocData();
    return () => {
      cancelled = true;
    };
  }, [activeDocType, printDate, matReqPayload, workOrderPayload]);

  const renderBodyTable = () => {
    if (loading) {
      return (
        <div className="py-12 text-center text-xs text-slate-500 font-semibold">
          전산 DB에서 최신 서식 데이터를 불러오는 중입니다...
        </div>
      );
    }

    if (error) {
      return (
        <div className="py-8 px-4 text-center text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded">
          데이터 조회 오류: {error}
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded">
          기준일({printDate})에 해당하는 등록 데이터가 없습니다.
        </div>
      );
    }

    if (activeDocType === 'HACCP_INSPECTION') {
      return (
        <table className="w-full border-collapse border border-slate-800 text-[10.5px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-800">
              <th className="border-r border-slate-800 px-1.5 py-1.5 w-8">NO</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-24">입고번호</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-28">공급업체</th>
              <th className="border-r border-slate-800 px-2 py-1.5 text-left">원 · 부자재명</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-16 text-right">입고량</th>
              <th className="border-r border-slate-800 px-1.5 py-1.5 w-20">소비기한/LOT</th>
              <th className="border-r border-slate-800 px-1.5 py-1.5 w-16">품온/보관</th>
              <th className="px-1.5 py-1.5 w-14">판정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-300">
                <td className="border-r border-slate-300 px-1.5 py-1 text-center">{i + 1}</td>
                <td className="border-r border-slate-300 px-2 py-1 text-center font-mono text-[10px]">
                  {r.receivingNo}
                </td>
                <td className="border-r border-slate-300 px-2 py-1 truncate max-w-[110px]">{r.partnerName}</td>
                <td className="border-r border-slate-300 px-2 py-1 font-medium">{r.productName}</td>
                <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">
                  {fmtNum(r.qty)} {r.unit}
                </td>
                <td className="border-r border-slate-300 px-1.5 py-1 text-center font-mono text-[10px]">{r.lotNo}</td>
                <td className="border-r border-slate-300 px-1.5 py-1 text-center">{r.temp}</td>
                <td className="px-1.5 py-1 text-center font-bold">{r.judge}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (activeDocType === 'MATERIAL_LEDGER') {
      return (
        <table className="w-full border-collapse border border-slate-800 text-[10.5px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-800">
              <th className="border-r border-slate-800 px-1.5 py-1.5 w-8">NO</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-16">구분</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-24">품목코드</th>
              <th className="border-r border-slate-800 px-2 py-1.5 text-left">자재명</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-14 text-right">기초</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-14 text-right">입고</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-14 text-right">출고</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-16 text-right">현재고</th>
              <th className="px-2 py-1.5 w-20 text-right">재고금액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className="border-b border-slate-300">
                <td className="border-r border-slate-300 px-1.5 py-1 text-center">{i + 1}</td>
                <td className="border-r border-slate-300 px-2 py-1 text-center">{r.txnType || r.category}</td>
                <td className="border-r border-slate-300 px-2 py-1 text-center font-mono text-[10px]">
                  {r.productCode}
                </td>
                <td className="border-r border-slate-300 px-2 py-1 font-medium">{r.productName}</td>
                <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">{fmtNum(r.carryOverQty)}</td>
                <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">{fmtNum(r.inQty)}</td>
                <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">{fmtNum(r.outQty)}</td>
                <td className="border-r border-slate-300 px-2 py-1 text-right font-mono font-bold">
                  {fmtNum(r.currentQty)} {r.unit}
                </td>
                <td className="px-2 py-1 text-right font-mono">{fmtNum(r.stockAmount)}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (activeDocType === 'MATERIAL_REQUIREMENT') {
      return (
        <table className="w-full border-collapse border border-slate-800 text-[10.5px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-800">
              <th className="border-r border-slate-800 px-1.5 py-1.5 w-8">NO</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-16">분류</th>
              <th className="border-r border-slate-800 px-2 py-1.5 text-left">자재명 (규격)</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-16 text-right">소요량</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-16 text-right">현재고</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-16 text-right">부족량</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-16 text-right">발주량</th>
              <th className="px-2 py-1.5 w-24">공급사</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className="border-b border-slate-300">
                <td className="border-r border-slate-300 px-1.5 py-1 text-center">{i + 1}</td>
                <td className="border-r border-slate-300 px-2 py-1 text-center">{r.partCategory || r.category}</td>
                <td className="border-r border-slate-300 px-2 py-1 font-medium">
                  {r.partName || r.materialName}{' '}
                  {r.partSpec ? <span className="text-[9.5px] text-slate-500">({r.partSpec})</span> : null}
                </td>
                <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">
                  {fmtNum(r.reqCalcQty ?? r.requiredQty)} {r.partUnit || r.unit}
                </td>
                <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">
                  {fmtNum(r.currentStock)}
                </td>
                <td className="border-r border-slate-300 px-2 py-1 text-right font-mono text-rose-700">
                  {fmtNum(r.shortageQty)}
                </td>
                <td className="border-r border-slate-300 px-2 py-1 text-right font-mono font-bold">
                  {fmtNum(r.orderQty ?? r.shortageQty)} {r.orderUnit || r.unit}
                </td>
                <td className="px-2 py-1 truncate max-w-[100px]">{r.supplier || r.partnerName || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (activeDocType === 'COST_SHEET') {
      return (
        <table className="w-full border-collapse border border-slate-800 text-[10.5px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-800">
              <th className="border-r border-slate-800 px-1.5 py-1.5 w-8">NO</th>
              <th className="border-r border-slate-800 px-2 py-1.5 text-left">완제품명</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-16 text-right">매출수량</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-24 text-right">매출액</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-24 text-right">재료비</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-24 text-right">배부경비</th>
              <th className="border-r border-slate-800 px-2 py-1.5 w-24 text-right">영업이익</th>
              <th className="px-2 py-1.5 w-16 text-right">이익률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const sales = Number(r.salesAmount || 0);
              const mat = Number(r.materialCost || 0);
              const exp = Number(r.overheadCost || 0) + Number(r.logisticsCost || 0);
              const profit = Number(r.operatingProfit ?? sales - mat - exp);
              const margin = sales > 0 ? ((profit / sales) * 100).toFixed(1) : '0.0';
              return (
                <tr key={r.id || i} className="border-b border-slate-300">
                  <td className="border-r border-slate-300 px-1.5 py-1 text-center">{i + 1}</td>
                  <td className="border-r border-slate-300 px-2 py-1 font-medium">
                    {r.product?.name || r.productName || r.productCode}
                  </td>
                  <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">{fmtNum(r.salesQty)}</td>
                  <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">{fmtNum(sales)}원</td>
                  <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">{fmtNum(mat)}원</td>
                  <td className="border-r border-slate-300 px-2 py-1 text-right font-mono">{fmtNum(exp)}원</td>
                  <td className="border-r border-slate-300 px-2 py-1 text-right font-mono font-bold">
                    {fmtNum(profit)}원
                  </td>
                  <td className="px-2 py-1 text-right font-mono">{margin}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }

    // WORK_ORDER
    return (
      <table className="w-full border-collapse border border-slate-800 text-[10.5px]">
        <thead>
          <tr className="bg-slate-100 border-b border-slate-800">
            <th className="border-r border-slate-800 px-1.5 py-1.5 w-8">순번</th>
            <th className="border-r border-slate-800 px-2 py-1.5 text-left">지시 품목명</th>
            <th className="border-r border-slate-800 px-2 py-1.5 w-24">작업시간</th>
            <th className="border-r border-slate-800 px-2 py-1.5 w-20 text-right">지시수량</th>
            <th className="border-r border-slate-800 px-2 py-1.5 w-16">상태</th>
            <th className="px-2 py-1.5 w-20">담당자</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className="border-b border-slate-300">
              <td className="border-r border-slate-300 px-1.5 py-1 text-center font-bold">{r.workSeq || i + 1}</td>
              <td className="border-r border-slate-300 px-2 py-1 font-medium">{r.productName}</td>
              <td className="border-r border-slate-300 px-2 py-1 text-center font-mono text-[10px]">
                {r.timeRange || r.completeTime || '-'}
              </td>
              <td className="border-r border-slate-300 px-2 py-1 text-right font-mono font-bold">
                {fmtNum(r.orderQty)} {r.unit || 'ea'}
              </td>
              <td className="border-r border-slate-300 px-2 py-1 text-center">{r.status || '대기'}</td>
              <td className="px-2 py-1 text-center">{r.assignee || r.createdBy || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
        <div>
          <span className="inline-block px-2 py-0.5 bg-slate-900 text-white text-[10px] font-bold rounded mb-1">
            {meta.code}
          </span>
          <h2 className="text-lg font-black text-slate-900">{meta.title}</h2>
          <p className="text-[11px] text-slate-600 mt-0.5">{meta.subtitle}</p>
          <p className="text-[11px] text-slate-700 font-semibold mt-1">
            사업장: (주)GFS 거창식품공장 · 담당부서: {meta.dept} · 기준일: {printDate}
            {extraInfo ? ` · ${extraInfo}` : ''}
          </p>
        </div>
        <table className="border-collapse border border-slate-800 text-[10px] shrink-0">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-800">
              <th rowSpan={2} className="border-r border-slate-800 px-2 py-1 w-6">결재</th>
              <th className="border-r border-slate-800 px-3 py-1">작성</th>
              <th className="border-r border-slate-800 px-3 py-1">검토</th>
              <th className="px-3 py-1">승인</th>
            </tr>
          </thead>
          <tbody>
            <tr className="h-9 text-center text-slate-500">
              <td className="border-r border-slate-800 px-2 text-slate-800 font-semibold">{writerName}</td>
              <td className="border-r border-slate-800 px-2">팀장</td>
              <td className="px-2">공장장</td>
            </tr>
          </tbody>
        </table>
      </div>

      {renderBodyTable()}

      <div className="pt-4 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-500">
        <span>(주)GFS 거창식품공장 통합 ERP 전산 정본 서식 · 총 {rows.length}건</span>
        <span>작성자: {writerName}</span>
      </div>
    </div>
  );
};
