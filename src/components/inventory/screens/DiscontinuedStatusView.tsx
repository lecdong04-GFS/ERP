'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  FileSpreadsheet,
  Plus,
  Layers,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Package,
  X,
  Info,
} from 'lucide-react';
import { exportGridToExcel } from '@/lib/excelExport';

interface DiscontinuedItem {
  id: number;
  productCode: string;
  productName: string;
  category: string;
  discontinuedDate: string;
  reason: string;
  remainStock: number;
  disposalPlan: string;
  status: string; // '완료' | '대기'
  remark: string;
  createdBy: string;
}

interface BomMaterialAnalysis {
  childProductId: number;
  productCode: string;
  name: string;
  category: string;
  unit: string;
  unitQty: number;
  isExclusive: boolean;
  otherUsageCount: number;
  totalStock: number;
  warehouse: string;
}

export const DiscontinuedStatusView: React.FC = () => {
  const [items, setItems] = useState<DiscontinuedItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [startDate, setStartDate] = useState<string>('2026-07-01');
  const [endDate, setEndDate] = useState<string>('2026-12-31');
  const [statusFilter, setStatusFilter] = useState<'전체' | '완료' | '대기'>('전체');
  const [keyword, setKeyword] = useState<string>('');
  const [periodMode, setPeriodMode] = useState<'일간' | '주간' | '월간' | '하반기' | '전체'>('하반기');

  // 상세 모달 상태
  const [selectedItem, setSelectedItem] = useState<DiscontinuedItem | null>(null);
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [parentProduct, setParentProduct] = useState<any>(null);
  const [bomMaterials, setBomMaterials] = useState<BomMaterialAnalysis[]>([]);
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);

  // 신규 등록 폼 상태
  const [newForm, setNewForm] = useState({
    productName: '',
    discontinuedDate: '2026-11-20',
    category: '도시락',
    status: '대기',
    reason: '시즌 종료 및 신메뉴 전환',
    disposalPlan: '잔여 자재 소진 후 발주 중단',
    remark: '',
  });

  // 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate && periodMode !== '전체') params.set('startDate', startDate);
      if (endDate && periodMode !== '전체') params.set('endDate', endDate);
      if (statusFilter !== '전체') params.set('status', statusFilter);
      if (keyword.trim()) params.set('search', keyword.trim());

      const res = await fetch(`/api/inventory/discontinued?${params.toString()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setItems(json.data);
      }
    } catch (err) {
      console.error('Failed to load discontinued items', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter, keyword, periodMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 기간 전환
  const handlePeriodChange = (mode: '일간' | '주간' | '월간' | '하반기' | '전체') => {
    setPeriodMode(mode);
    const today = '2026-11-07';
    if (mode === '일간') {
      setStartDate(today);
      setEndDate(today);
    } else if (mode === '주간') {
      setStartDate('2026-11-02');
      setEndDate('2026-11-08');
    } else if (mode === '월간') {
      setStartDate('2026-11-01');
      setEndDate('2026-11-30');
    } else if (mode === '하반기') {
      setStartDate('2026-07-01');
      setEndDate('2026-12-31');
    } else if (mode === '전체') {
      setStartDate('');
      setEndDate('');
    }
  };

  // 날짜 쉬프트 (< >)
  const handleShiftMonth = (months: number) => {
    if (!startDate) return;
    const s = new Date(startDate);
    s.setMonth(s.getMonth() + months);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
    const p = (n: number) => String(n).padStart(2, '0');
    setStartDate(`${s.getFullYear()}-${p(s.getMonth() + 1)}-01`);
    setEndDate(`${e.getFullYear()}-${p(e.getMonth() + 1)}-${p(e.getDate())}`);
  };

  // 상세 BOM 분석 모달 열기
  const handleOpenDetail = async (it: DiscontinuedItem) => {
    setSelectedItem(it);
    setModalLoading(true);
    setParentProduct(null);
    setBomMaterials([]);
    try {
      const res = await fetch(`/api/inventory/discontinued?targetId=${it.id}`);
      const json = await res.json();
      if (json.success && json.data) {
        setParentProduct(json.data.parentProduct);
        setBomMaterials(json.data.materials || []);
      }
    } catch (err) {
      console.error('Failed to load BOM materials', err);
    } finally {
      setModalLoading(false);
    }
  };

  // 상태 토글 (완료 <-> 대기)
  const handleToggleStatus = async (it: DiscontinuedItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = it.status === '완료' ? '대기' : '완료';
    if (!confirm(`[${it.productName}]의 단종 상태를 '${next}'(으)로 변경하시겠습니까?`)) {
      return;
    }
    try {
      const res = await fetch('/api/inventory/discontinued', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_status', id: it.id }),
      });
      const json = await res.json();
      if (json.success) {
        loadData();
      } else {
        alert('상태 변경 실패: ' + json.error);
      }
    } catch (err: any) {
      alert('오류: ' + err.message);
    }
  };

  // 엑셀 내보내기
  const handleExportExcel = () => {
    const exportData = items.map((it, idx) => ({
      No: idx + 1,
      단종일자: it.discontinuedDate,
      상태: it.status,
      품명: it.productName,
      구분: it.category,
      단종사유: it.reason,
      처분계획: it.disposalPlan,
      비고: it.remark,
    }));
    exportGridToExcel({
      filename: `제품단종현황_${startDate || '전체'}_${endDate || ''}`,
      sheetName: '단종제품목록',
      columns: [
        { key: 'No', label: 'No' },
        { key: '단종일자', label: '단종(불용)일' },
        { key: '상태', label: '상태' },
        { key: '품명', label: '품명' },
        { key: '구분', label: '구분' },
        { key: '단종사유', label: '단종사유' },
        { key: '처분계획', label: '처분계획' },
        { key: '비고', label: '비고' },
      ],
      data: exportData,
    });
  };

  // 신규 등록 제출
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.productName.trim()) {
      alert('품명을 입력하세요.');
      return;
    }
    try {
      const res = await fetch('/api/inventory/discontinued', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      const json = await res.json();
      if (json.success) {
        alert('단종 품목이 등록되었습니다.');
        setIsNewModalOpen(false);
        setNewForm({
          productName: '',
          discontinuedDate: '2026-11-20',
          category: '도시락',
          status: '대기',
          reason: '시즌 종료 및 신메뉴 전환',
          disposalPlan: '잔여 자재 소진 후 발주 중단',
          remark: '',
        });
        loadData();
      } else {
        alert('등록 실패: ' + json.error);
      }
    } catch (err: any) {
      alert('오류: ' + err.message);
    }
  };

  // 통계 집계
  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((x) => x.status === '완료').length;
    const pending = items.filter((x) => x.status === '대기').length;
    return { total, completed, pending };
  }, [items]);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 text-[14px]">
      {/* ── 1. 탑 네비게이션 & 제어 바 (크고 시원시원한 헤더) ── */}
      <header className="px-6 py-4 bg-white border-b border-slate-200 shrink-0 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* 타이틀 및 뱃지 */}
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shadow-md shadow-rose-200 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">제품단종현황</h1>
                <span className="text-xs font-mono font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  총 {stats.total}건 관리
                </span>
                {stats.pending > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 animate-pulse shadow-xs">
                    <Clock size={13} />
                    🚨 11월 단종대기 {stats.pending}건 집중 관리
                  </span>
                )}
              </div>
              <p className="text-[13px] text-slate-500 font-semibold mt-0.5">
                편의점 본부(GS25) 단종 승인 완제품 관제 · BOM 연계 불용 자재 사전 차단 파이프라인
              </p>
            </div>
          </div>

          {/* 우측 버튼 컨트롤 (높이 40px로 큼직하게) */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>새로고침</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={items.length === 0}
              className="h-10 px-4 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <FileSpreadsheet size={15} className="text-emerald-700" />
              <span>엑셀 다운로드</span>
            </button>
            <button
              type="button"
              onClick={() => setIsNewModalOpen(true)}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm shadow-blue-200 cursor-pointer transition-colors"
            >
              <Plus size={16} />
              <span>신규 단종 지정</span>
            </button>
          </div>
        </div>

        {/* ── 2. 필터 및 기간 선택 컨트롤 ── */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3.5">
          {/* 기간 필터 */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
              <Calendar size={15} className="text-blue-600" /> 기준일자:
            </span>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl p-1 shadow-inner">
              <button
                type="button"
                onClick={() => handleShiftMonth(-1)}
                className="p-1 hover:bg-white rounded-lg text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
                title="이전 달"
              >
                <ChevronLeft size={16} />
              </button>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-xs font-mono font-black text-slate-900 px-2 py-0.5 outline-none cursor-pointer"
              />
              <span className="text-slate-400 font-bold">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-xs font-mono font-black text-slate-900 px-2 py-0.5 outline-none cursor-pointer"
              />
              <button
                type="button"
                onClick={() => handleShiftMonth(1)}
                className="p-1 hover:bg-white rounded-lg text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
                title="다음 달"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* 주기 라디오 필터 */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-bold">
              {(['일간', '주간', '월간', '하반기', '전체'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handlePeriodChange(m)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    periodMode === m
                      ? 'bg-white text-blue-900 font-black shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* 상태 필터 및 검색창 */}
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold shadow-2xs">
              <button
                type="button"
                onClick={() => setStatusFilter('전체')}
                className={`px-3.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                  statusFilter === '전체' ? 'bg-slate-900 text-white font-black' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                전체 ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('대기')}
                className={`px-3.5 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
                  statusFilter === '대기' ? 'bg-rose-600 text-white font-black shadow-xs' : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <Clock size={13} />
                <span>대기 ({stats.pending})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('완료')}
                className={`px-3.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                  statusFilter === '완료' ? 'bg-emerald-700 text-white font-black shadow-xs' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                완료 ({stats.completed})
              </button>
            </div>

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="품명, 단종사유 검색..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-9 pr-4 py-2 w-64 text-xs font-medium bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── 3. 상단 SCM 핵심 파이프라인 경보 배너 (크고 시원한 텍스트) ── */}
      <section className="px-6 pt-5 shrink-0">
        <div className="bg-gradient-to-r from-amber-50 via-rose-50 to-orange-50 border border-amber-300 rounded-2xl p-4 shadow-xs flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-black text-rose-900 bg-rose-200 px-2.5 py-1 rounded-md">
                🚨 11월 단종 예정 3개 품목 집중 관리 중
              </span>
              <span className="text-[14px] text-slate-800 font-extrabold">
                [혜자)돌아온등심돈까스 (11/10)], [추석)맥적구이한상 (11/17)], [더큰)오징어제육깻잎쌈밥 (11/17)]
              </span>
            </div>
            <p className="text-[13.5px] text-slate-700 font-medium mt-1.5 leading-relaxed">
              위 3개 제품의 <strong>전용 원부자재(아이투알 등심돈까스 용기/뚜껑, 바릴라스파게티면, 돈까스소스H, 맥적구이 양념육 등 11종)</strong>는 단종 시 즉시 폐기 위험이 발생합니다.
              <strong> [자재발주(요일별)]</strong> 화면과 실시간 연계되어 과잉 발주가 자동 차단되며 잔여 재고 소진 우선 모드로 작동합니다. (품목 클릭 시 세부 BOM 자재 분석 조회)
            </p>
          </div>
        </div>
      </section>

      {/* ── 4. 단종 제품 데이터 테이블 (글자 크고 행 간격 시원한 고해상도 그리드) ── */}
      <main className="flex-1 px-6 py-5 overflow-auto min-h-0">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-800 text-[13.5px] font-black uppercase tracking-tight select-none">
                <th className="py-3.5 px-3 w-16 text-center">No</th>
                <th className="py-3.5 px-4 w-36 text-center">단종(불용)일</th>
                <th className="py-3.5 px-4 w-36 text-center">상태</th>
                <th className="py-3.5 px-5 min-w-[280px]">품명 (완제품)</th>
                <th className="py-3.5 px-3 w-32 text-center">구분</th>
                <th className="py-3.5 px-3 w-20 text-center">단위</th>
                <th className="py-3.5 px-4 min-w-[220px]">단종 사유</th>
                <th className="py-3.5 px-4 min-w-[220px]">처분 계획</th>
                <th className="py-3.5 px-4 w-36 text-center">BOM 자재 분석</th>
                <th className="py-3.5 px-3 w-28 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[14px]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-24 text-center text-slate-400">
                    <RefreshCw className="w-10 h-10 animate-spin mx-auto text-slate-300 mb-2" />
                    <span className="text-[15px] font-bold">단종 제품 목록을 불러오고 있습니다...</span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-24 text-center text-slate-400">
                    <Package className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <div className="text-[16px] font-bold text-slate-600">조회 조건에 해당하는 단종 품목이 없습니다.</div>
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  const isPending = it.status === '대기';
                  return (
                    <tr
                      key={it.id}
                      onClick={() => handleOpenDetail(it)}
                      className={`hover:bg-blue-50/50 cursor-pointer transition-colors ${
                        isPending ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* No */}
                      <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400 text-[14px]">
                        {idx + 1}
                      </td>

                      {/* 단종일자 (큼직하고 선명한 폰트) */}
                      <td className="py-3.5 px-4 text-center font-mono font-black text-slate-800 text-[14.5px] whitespace-nowrap">
                        {it.discontinuedDate}
                      </td>

                      {/* 상태 뱃지 */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-black text-[12.5px] text-rose-800 bg-rose-100 border border-rose-300 shadow-xs animate-pulse">
                            <Clock size={13} />
                            대기 (단종예정)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-extrabold text-[12px] text-emerald-800 bg-emerald-100/80 border border-emerald-300">
                            <CheckCircle2 size={13} />
                            완료
                          </span>
                        )}
                      </td>

                      {/* 품명 (시원시원하게 큰 16px 폰트) */}
                      <td className="py-3.5 px-5 font-black text-slate-900 text-[16px] tracking-tight">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="hover:text-blue-600 transition-colors">
                            {it.productName}
                          </span>
                          {isPending && (
                            <span className="text-xs font-black px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 border border-amber-300 shadow-2xs">
                              D-day 집중관리
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 구분 */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-extrabold text-xs border border-slate-200">
                          {it.category || '완성품'}
                        </span>
                      </td>

                      {/* 단위 */}
                      <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-600 text-xs">
                        ea
                      </td>

                      {/* 단종 사유 */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium leading-snug">
                        {it.reason || '-'}
                      </td>

                      {/* 처분 계획 */}
                      <td className="py-3.5 px-4 text-slate-700 font-semibold leading-snug">
                        {it.disposalPlan || '-'}
                      </td>

                      {/* BOM 자재 분석 버튼 */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(it);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-extrabold text-xs flex items-center gap-1.5 mx-auto transition-colors cursor-pointer shadow-2xs"
                        >
                          <Layers size={13} />
                          <span>BOM 자재 분석</span>
                        </button>
                      </td>

                      {/* 상태 전환 버튼 */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => handleToggleStatus(it, e)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer shadow-2xs transition-colors"
                        >
                          {it.status === '완료' ? '대기로' : '완료로'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* ── 5. 상세 BOM 불용 위험 분석 모달 (시원시원한 대화면) ── */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* 모달 헤더 */}
            <div className="px-7 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md">
                  <Layers size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black tracking-tight">{selectedItem.productName}</h2>
                    <span
                      className={`text-xs font-black px-3 py-1 rounded-full ${
                        selectedItem.status === '대기'
                          ? 'bg-rose-500 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {selectedItem.status === '대기' ? '단종대기 (D-Day 관리)' : '단종완료'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium mt-1">
                    단종일자: <span className="font-mono font-bold text-amber-300 text-xs">{selectedItem.discontinuedDate}</span> · 사유: {selectedItem.reason}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="flex-1 overflow-auto p-7 space-y-5">
              {/* 완제품 요약 카드 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <span className="text-xs text-slate-500 font-bold block">매칭 마스터 완제품</span>
                  <span className="text-[15px] font-black text-slate-900 mt-1 block truncate">
                    {parentProduct ? parentProduct.name : '마스터 연동 완료'}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <span className="text-xs text-slate-500 font-bold block">연관 BOM 원부자재</span>
                  <span className="text-[15px] font-black text-blue-700 mt-1 block">
                    총 {bomMaterials.length}종 자재 구성
                  </span>
                </div>
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                  <span className="text-xs text-rose-700 font-bold block">불용 위험 전용자재 (Exclusive)</span>
                  <span className="text-[15px] font-black text-rose-800 mt-1 block">
                    {bomMaterials.filter((m) => m.isExclusive).length}종 (단종 시 폐기 위험)
                  </span>
                </div>
              </div>

              {/* 하위 BOM 원부자재 분석 테이블 */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 px-5 py-3.5 border-b border-slate-200 font-black text-[13.5px] text-slate-800 flex items-center justify-between">
                  <span>투입 원부자재 소요량 및 창고 실재고 현황</span>
                  <span className="text-xs font-bold text-slate-500">
                    전용 자재는 단종 즉시 발주 차단 및 잔여 재고 소진 필수
                  </span>
                </div>
                <table className="w-full text-left border-collapse text-[13.5px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-black">
                      <th className="py-3 px-4">원부자재 품명</th>
                      <th className="py-3 px-3 text-center w-28">자재 성격</th>
                      <th className="py-3 px-3 text-right w-28">단위소요량</th>
                      <th className="py-3 px-4 text-right w-32">창고 실재고</th>
                      <th className="py-3 px-3 text-center w-24">보관창고</th>
                      <th className="py-3 px-4 w-52">SCM 조치 권고사항</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modalLoading ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-400">
                          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-300" />
                          <span className="text-sm font-bold">BOM 및 재고 데이터를 연계 분석 중입니다...</span>
                        </td>
                      </tr>
                    ) : bomMaterials.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-400">
                          <Info className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          <span className="text-sm font-bold">연계된 하위 레시피 데이터가 없거나 이미 정리가 완료된 품목입니다.</span>
                        </td>
                      </tr>
                    ) : (
                      bomMaterials.map((m, idx) => (
                        <tr
                          key={idx}
                          className={m.isExclusive ? 'bg-rose-50/50 hover:bg-rose-50' : 'hover:bg-slate-50'}
                        >
                          <td className="py-3 px-4 font-black text-slate-900 text-[14.5px]">
                            {m.name}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {m.isExclusive ? (
                              <span className="px-2.5 py-1 rounded text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap">
                                🚨 전용 자재
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                                공용 ({m.otherUsageCount}곳)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                            {m.unitQty} {m.unit || 'g'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-blue-700 text-[14.5px]">
                            {m.totalStock.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-bold">
                              {m.warehouse}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {m.isExclusive ? (
                              <span className="text-rose-700 font-black">
                                ⚠️ 추가 발주 즉시 중단 및 잔여 재고 소진
                              </span>
                            ) : (
                              <span className="text-slate-500 font-medium">
                                타 완제품 대체 투입 가능
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="px-7 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-bold">
                ※ 단종 제품의 전용 자재는 [자재발주(요일별)] 화면에서 🚨 경고 뱃지로 실시간 연계됩니다.
              </span>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl cursor-pointer transition-colors shadow-2xs"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. 신규 단종 품목 지정 모달 ── */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Plus size={20} className="text-blue-400" />
                <h3 className="font-black text-base">신규 단종 품목 지정</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-black text-slate-800 mb-1.5 text-xs">완제품명 (품명) *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 혜자)신규단종도시락"
                  value={newForm.productName}
                  onChange={(e) => setNewForm({ ...newForm, productName: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-black text-slate-800 mb-1.5 text-xs">단종 예정일 *</label>
                  <input
                    type="date"
                    required
                    value={newForm.discontinuedDate}
                    onChange={(e) => setNewForm({ ...newForm, discontinuedDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-800 mb-1.5 text-xs">상태</label>
                  <select
                    value={newForm.status}
                    onChange={(e) => setNewForm({ ...newForm, status: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="대기">대기 (단종예정)</option>
                    <option value="완료">완료 (단종완료)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-black text-slate-800 mb-1.5 text-xs">구분 (카테고리)</label>
                  <select
                    value={newForm.category}
                    onChange={(e) => setNewForm({ ...newForm, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="도시락">도시락</option>
                    <option value="김밥">김밥</option>
                    <option value="삼각/무스비">삼각/무스비</option>
                    <option value="면류">면류</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block font-black text-slate-800 mb-1.5 text-xs">처분 계획</label>
                  <input
                    type="text"
                    value={newForm.disposalPlan}
                    onChange={(e) => setNewForm({ ...newForm, disposalPlan: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-slate-800 mb-1.5 text-xs">단종 사유</label>
                <input
                  type="text"
                  value={newForm.reason}
                  onChange={(e) => setNewForm({ ...newForm, reason: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl cursor-pointer shadow-xs"
                >
                  등록하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscontinuedStatusView;
