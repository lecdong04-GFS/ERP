'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowLeftRight, Search, PlusCircle, PackageCheck, AlertTriangle, Layers } from 'lucide-react';
import { erpToast } from '@/context/ToastContext';

interface BomUsageItem {
  detailId: number;
  bomHeaderId: number;
  version: string;
  isActive: boolean;
  parentProductId: number;
  parentCode: string;
  parentName: string;
  unitQty: number;
  unit: string;
}

interface CandidateItem {
  id: number;
  productCode: string;
  name: string;
  spec: string;
  unit: string;
  category: string;
  warehouse: string;
  boxQty: number;
  targetOrderDays: number;
  partnerId: string;
  partnerName: string;
  bagPrice: number;
}

interface PartnerItem {
  id: string;
  name: string;
  partnerType: string;
  orderDay?: string;
}

interface SourceInfo {
  id: number;
  productCode: string;
  name: string;
  spec: string;
  unit: string;
  category: string;
  warehouse: string;
  boxQty: number;
  targetOrderDays: number;
  partnerId: string | null;
  partnerName: string;
  bagPrice: number;
  totalCurrentQty: number;
}

interface ProductSubstituteModalProps {
  isOpen: boolean;
  sourceProductId: number | null;
  onClose: () => void;
  onSuccess: (result: {
    sourceId: number;
    sourceName: string;
    targetId: number;
    targetName: string;
    bomUpdatedCount: number;
    transitionMode: string;
  }) => void;
}

export const ProductSubstituteModal: React.FC<ProductSubstituteModalProps> = ({
  isOpen,
  sourceProductId,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<SourceInfo | null>(null);
  const [bomUsages, setBomUsages] = useState<BomUsageItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [showBomList, setShowBomList] = useState(false);

  const [mode, setMode] = useState<'existing' | 'create'>('existing');
  const [search, setSearch] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [transitionMode, setTransitionMode] = useState<'gradual' | 'immediate'>('gradual');

  // 신규 대체품 입력 폼
  const [newName, setNewName] = useState('');
  const [newPartnerId, setNewPartnerId] = useState('');
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newBoxQty, setNewBoxQty] = useState('1');
  const [newBagPrice, setNewBagPrice] = useState('0');
  const [newOrderDays, setNewOrderDays] = useState('0');
  const [newWarehouse, setNewWarehouse] = useState('상온');

  useEffect(() => {
    if (!isOpen || !sourceProductId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedTargetId(null);
    setSearch('');
    setShowBomList(false);
    setMode('existing');
    setTransitionMode('gradual');

    fetch(`/api/master/product/substitute?productId=${sourceProductId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          setError(json.error || '대체품 정보를 불러오지 못했습니다.');
          return;
        }
        const d = json.data;
        setSource(d.source);
        setBomUsages(d.bomUsages || []);
        setCandidates(d.candidates || []);
        setPartners(d.partners || []);

        // 신규 생성 폼 기본값에 원본 속성 승계
        setNewName('');
        setNewPartnerId(d.source?.partnerId || '');
        setNewPartnerName('');
        setNewBoxQty(String(d.source?.boxQty || 1));
        setNewBagPrice(String(d.source?.bagPrice || 0));
        setNewOrderDays(String(d.source?.targetOrderDays || 0));
        setNewWarehouse(d.source?.warehouse || '상온');
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || '네트워크 오류가 발생했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, sourceProductId]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.productCode.toLowerCase().includes(q) ||
        c.partnerName.toLowerCase().includes(q)
    );
  }, [candidates, search]);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedTargetId) || null,
    [candidates, selectedTargetId]
  );

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!source) return;
    if (mode === 'existing' && !selectedTargetId) {
      erpToast.error('대체할 기존 품목을 선택하세요.');
      return;
    }
    if (mode === 'create' && !newName.trim()) {
      erpToast.error('신규 대체품 품명을 입력하세요.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/master/product/substitute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProductId: source.id,
          mode,
          targetProductId: mode === 'existing' ? selectedTargetId : undefined,
          newProduct:
            mode === 'create'
              ? {
                  name: newName.trim(),
                  partnerId: newPartnerId || undefined,
                  partnerName: !newPartnerId ? newPartnerName.trim() : undefined,
                  boxQty: Number(newBoxQty) || 1,
                  bagPrice: Number(newBagPrice) || 0,
                  targetOrderDays: Number(newOrderDays) || 0,
                  warehouse: newWarehouse,
                }
              : undefined,
          transitionMode,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        erpToast.error(json.error || '대체품 변경에 실패했습니다.');
        return;
      }
      erpToast.success(json.message || '대체품 변경이 완료되었습니다.');
      onSuccess(json.data);
      onClose();
    } catch (err: any) {
      erpToast.error(err?.message || '대체품 변경 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* 헤더 */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-[15px] font-black tracking-tight">대체품 지정 / 변경</h3>
              <p className="text-[11px] text-slate-300">
                BOM 레시피를 일괄 치환하고 기존 품목 재고·단종 상태를 안전하게 전환합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/70">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500 font-semibold">
              원본 품목 및 연결 BOM 정보를 불러오는 중...
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {error}
            </div>
          ) : source ? (
            <>
              {/* 원본 품목 요약 카드 */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500">원본 품목 (변경 전)</span>
                    <div className="text-[15px] font-black text-slate-900 mt-0.5">{source.name}</div>
                    <div className="text-[11.5px] text-slate-600 mt-0.5 flex flex-wrap gap-x-3">
                      <span>코드: {source.productCode}</span>
                      <span>거래처: {source.partnerName || '미지정'}</span>
                      <span>창고: {source.warehouse || '-'}</span>
                      <span>입수: {source.boxQty}{source.unit}</span>
                      <span className="font-bold text-blue-700">
                        현재고: {source.totalCurrentQty.toLocaleString()} {source.unit}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBomList((p) => !p)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11.5px] font-black transition cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>연결 BOM {bomUsages.length}건 {showBomList ? '접기' : '미리보기'}</span>
                  </button>
                </div>

                {showBomList && (
                  <div className="mt-2 pt-2 border-t border-slate-100 max-h-36 overflow-y-auto space-y-1">
                    {bomUsages.length === 0 ? (
                      <div className="text-[11.5px] text-slate-400">이 품목이 투입된 BOM 레시피가 없습니다.</div>
                    ) : (
                      bomUsages.map((b) => (
                        <div
                          key={b.detailId}
                          className="flex items-center justify-between text-[11.5px] px-2 py-1 rounded bg-slate-50 text-slate-700"
                        >
                          <span className="font-semibold truncate">
                            {b.parentName} <span className="text-slate-400 font-mono">({b.parentCode})</span>
                          </span>
                          <span className="font-mono text-slate-600 shrink-0 ml-2">
                            투입 {b.unitQty} {b.unit} · v{b.version}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 1단계: 대체 품목 선택 방식 */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black text-slate-900">1. 대체할 품목 (변경 후)</span>
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setMode('existing')}
                      className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        mode === 'existing' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5" />
                      기존 등록 품목 선택
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('create')}
                      className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        mode === 'create' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      신규 대체품 바로 생성
                    </button>
                  </div>
                </div>

                {mode === 'existing' ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="대체할 품명, 품번, 거래처명으로 검색..."
                        className="w-full pl-9 pr-3 py-2 text-[12.5px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {filteredCandidates.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          일치하는 기존 품목이 없습니다. 상단 &apos;신규 대체품 바로 생성&apos;을 이용해 주세요.
                        </div>
                      ) : (
                        filteredCandidates.map((c) => {
                          const selected = c.id === selectedTargetId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedTargetId(c.id)}
                              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition cursor-pointer ${
                                selected ? 'bg-blue-50 text-blue-950' : 'hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-[12.5px] font-bold truncate">{c.name}</div>
                                <div className="text-[11px] text-slate-500">
                                  {c.productCode} · {c.partnerName || '거래처미지정'} · {c.warehouse || '-'} · 입수 {c.boxQty}
                                  {c.unit}
                                </div>
                              </div>
                              <span
                                className={`text-[11px] font-black px-2 py-0.5 rounded shrink-0 ${
                                  selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {selected ? '선택됨' : '선택'}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                    {selectedCandidate && (
                      <div className="text-[11.5px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 font-semibold">
                        선택된 대체품: <strong>{selectedCandidate.name}</strong> ({selectedCandidate.partnerName || '거래처미지정'})
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12px]">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        신규 대체품 품명 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={`예: ${source.name} (B사)`}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">거래처 선택</label>
                      <select
                        value={newPartnerId}
                        onChange={(e) => setNewPartnerId(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="">직접 입력 / 미지정</option>
                        {partners.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!newPartnerId && (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">신규 거래처명 (선택)</label>
                        <input
                          type="text"
                          value={newPartnerName}
                          onChange={(e) => setNewPartnerName(e.target.value)}
                          placeholder="새 거래처명 입력 시 자동등록"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">박스 입수량</label>
                      <input
                        type="number"
                        min={1}
                        value={newBoxQty}
                        onChange={(e) => setNewBoxQty(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">봉 단가 (원)</label>
                      <input
                        type="number"
                        min={0}
                        value={newBagPrice}
                        onChange={(e) => setNewBagPrice(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">목표 발주일수 (일)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={newOrderDays}
                        onChange={(e) => setNewOrderDays(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">보관 창고</label>
                      <select
                        value={newWarehouse}
                        onChange={(e) => setNewWarehouse(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="냉장1">냉장1</option>
                        <option value="냉장2">냉장2</option>
                        <option value="냉동">냉동</option>
                        <option value="상온">상온</option>
                        <option value="부자재">부자재</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* 2단계: 기존 재고·상태 전환 방식 */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-2.5">
                <div className="text-[13px] font-black text-slate-900">2. 기존 품목 재고 · 상태 처리 방식</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTransitionMode('gradual')}
                    className={`text-left p-3 rounded-xl border-2 transition cursor-pointer ${
                      transitionMode === 'gradual'
                        ? 'border-blue-600 bg-blue-50/70'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-black text-slate-900 flex items-center gap-1">
                        <PackageCheck className="w-4 h-4 text-blue-600" />
                        잔여 재고 소진 후 전환
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-black">추천</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      BOM은 즉시 새 품목으로 바꾸고, 기존 품목의 창고 재고({source.totalCurrentQty.toLocaleString()}
                      {source.unit})는 그대로 두어 소진 후 자연 단종합니다.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransitionMode('immediate')}
                    className={`text-left p-3 rounded-xl border-2 transition cursor-pointer ${
                      transitionMode === 'immediate'
                        ? 'border-amber-600 bg-amber-50/70'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-black text-slate-900 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        즉시 통합 전환
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      BOM 변경과 동시에 기존 품목 현재고를 새 품목으로 이관(수불부 기장)하고, 기존 품목은 즉시
                      사용중지(단종) 처리합니다.
                    </p>
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-slate-500">
            과거 발주·입고·수불 이력은 원본 품목 그대로 보존됩니다.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-[12px] font-bold transition cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || submitting || !source}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-[12px] font-black transition cursor-pointer shadow-xs"
            >
              {submitting ? '처리 중...' : `대체품 변경 실행 (BOM ${bomUsages.length}건 반영)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

