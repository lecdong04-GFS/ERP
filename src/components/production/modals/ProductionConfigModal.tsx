'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  RotateCcw,
  Clock,
  Gauge,
  Sparkles,
  Layers,
  FileText,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Check,
} from 'lucide-react';

export interface ProductionConfigData {
  // 제1부. 성형장 라인별 속도 및 교체시간 (확인 1)
  lineSpeeds: {
    kimbap: { speed: number; changeover: number };
    samgak1: { speed: number; changeover: number };
    samgak2: { speed: number; changeover: number };
    samgakBig: { speed: number; changeover: number };
    dosirak: { speed: number; changeover: number };
    burger: { speed: number; changeover: number };
    sandwich: { speed: number; changeover: number };
    couple: { speed: number; changeover: number };
    hmr: { speed: number; changeover: number };
  };

  // 제1부. 아침 09:25 선가동 생산 순서 및 기본 수량 (확인 2)
  preRunItems: Array<{
    id: string;
    lineName: string;
    seq: number;
    itemName: string;
    preQty: number;
    workers: string;
  }>;

  // 제1부. 성형장 작업 전환 · 휴게 · 포장 마감 (확인 3)
  operationRules: {
    shiftChangeoverMin: number; // 2편->1편 중간 세척시간 (분)
    mealBreakType: 'STOP_ALL' | 'ROTATION'; // 정지 후 식사 vs 인원 교대
    packagingOffsetMin: number; // 성형 완료 후 출고 대기까지 분
  };

  // 제2부. 취반실 · 전처리실 파트별 역산 시간 및 1배치 용량 (확인 4)
  prepOffsets: {
    cooking: { leadTimeMin: number; mixOffsetMin: number; batchRiceKg: number; batchDurationMin: number };
    steamPot: { prepOffsetMin: number; maxBatchKg: number; cookDurationMin: number };
    fryer: { prepOffsetMin: number; batchKg: number; cookDurationMin: number };
    oven: { prepOffsetMin: number; batchTray: number; cookDurationMin: number };
    salad: { prepOffsetMin: number; batchKg: number; durationMin: number };
    cutting: { prepOffsetMin: number; hourlyCapacityKg: number };
    weighing: { prepOffsetMin: number; thawTiming: 'PREV_DAY' | 'SAME_DAY' };
  };

  // 제2부. 현장 특이사항 (확인 5)
  specialNotes: string;
}

export const DEFAULT_PRODUCTION_CONFIG: ProductionConfigData = {
  lineSpeeds: {
    kimbap: { speed: 1800, changeover: 10 },
    samgak1: { speed: 2600, changeover: 10 },
    samgak2: { speed: 2600, changeover: 10 },
    samgakBig: { speed: 2400, changeover: 10 },
    dosirak: { speed: 1500, changeover: 15 },
    burger: { speed: 1500, changeover: 12 },
    sandwich: { speed: 1200, changeover: 15 },
    couple: { speed: 1500, changeover: 10 },
    hmr: { speed: 1300, changeover: 10 },
  },
  preRunItems: [
    { id: 'pre-1', lineName: '삼각김밥 1호기', seq: 1, itemName: '참치마요 삼각김밥', preQty: 2000, workers: '3명' },
    { id: 'pre-2', lineName: '김밥 성형기', seq: 1, itemName: '야채/일반 줄김밥', preQty: 1000, workers: '4명' },
    { id: 'pre-3', lineName: '도시락 1라인', seq: 1, itemName: 'NEW고진많도시락', preQty: 1000, workers: '14명' },
    { id: 'pre-4', lineName: '더큰 삼각김밥 라인', seq: 1, itemName: '더큰 참치마요 삼각김밥', preQty: 1500, workers: '3명' },
    { id: 'pre-5', lineName: '햄버거 라인', seq: 1, itemName: '비프치즈버거', preQty: 800, workers: '4명' },
    { id: 'pre-6', lineName: '샌드위치 라인', seq: 1, itemName: '3단참치샌드위치', preQty: 600, workers: '5명' },
  ],
  operationRules: {
    shiftChangeoverMin: 35,
    mealBreakType: 'STOP_ALL',
    packagingOffsetMin: 20,
  },
  prepOffsets: {
    cooking: { leadTimeMin: 90, mixOffsetMin: 20, batchRiceKg: 20, batchDurationMin: 45 },
    steamPot: { prepOffsetMin: 15, maxBatchKg: 50, cookDurationMin: 30 },
    fryer: { prepOffsetMin: 15, batchKg: 20, cookDurationMin: 15 },
    oven: { prepOffsetMin: 15, batchTray: 10, cookDurationMin: 20 },
    salad: { prepOffsetMin: 20, batchKg: 30, durationMin: 15 },
    cutting: { prepOffsetMin: 30, hourlyCapacityKg: 100 },
    weighing: { prepOffsetMin: 30, thawTiming: 'PREV_DAY' },
  },
  specialNotes: '1. 밥 종류별 시퀀싱: 백미(1순위) -> 흑미(2순위) -> 빨간 볶음밥(3순위) 순서 준수 (슈트 착색 방지)\n2. 알레르기 교차오염 방지: 알코올 70% 세척 후 10분 건조\n3. 금속검출기 30분 주기 Fe 1.5mm, SUS 2.5mm 통과 테스트 필수',
};

const STORAGE_KEY = 'GFS_PRODUCTION_CONFIG';

export function loadProductionConfig(): ProductionConfigData {
  if (typeof window === 'undefined') return DEFAULT_PRODUCTION_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRODUCTION_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PRODUCTION_CONFIG,
      ...parsed,
      lineSpeeds: { ...DEFAULT_PRODUCTION_CONFIG.lineSpeeds, ...(parsed.lineSpeeds || {}) },
      operationRules: { ...DEFAULT_PRODUCTION_CONFIG.operationRules, ...(parsed.operationRules || {}) },
      prepOffsets: { ...DEFAULT_PRODUCTION_CONFIG.prepOffsets, ...(parsed.prepOffsets || {}) },
    };
  } catch (err) {
    console.error('Failed to parse production config from localStorage:', err);
    return DEFAULT_PRODUCTION_CONFIG;
  }
}

export function saveProductionConfig(config: ProductionConfigData) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('gfs_production_config_updated', { detail: config }));
  } catch (err) {
    console.error('Failed to save production config:', err);
  }
}

interface ProductionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply?: (config: ProductionConfigData) => void;
}

export const ProductionConfigModal: React.FC<ProductionConfigModalProps> = ({ isOpen, onClose, onApply }) => {
  const [activeTab, setActiveTab] = useState<'PART1' | 'PART2'>('PART1');
  const [config, setConfig] = useState<ProductionConfigData>(DEFAULT_PRODUCTION_CONFIG);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(loadProductionConfig());
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveProductionConfig(config);
    if (onApply) onApply(config);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 1200);
  };

  const handleResetToDefault = () => {
    if (confirm('과장님 확인서의 기본 파란색 기준값으로 초기화하시겠습니까?')) {
      setConfig(DEFAULT_PRODUCTION_CONFIG);
    }
  };

  // 프리런 항목 수정
  const updatePreRun = (index: number, field: string, value: any) => {
    setConfig((prev) => {
      const next = [...prev.preRunItems];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, preRunItems: next };
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-[96vw] max-w-5xl h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 헤더 */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Gauge size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  현장 기준정보 확인 및 타임테이블 설정
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold">
                  성형장 · 취반/전처리실 과장님 확인서 100% 매칭
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                과장님께서 종이에 적어주신 기준값을 여기에 입력하시면, 당일 수주와 실시간 연동되어 작업지시서가 자동 역산 계산됩니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold transition cursor-pointer"
              title="파란색 기본 기준값으로 되돌리기"
            >
              <RotateCcw size={13} />
              <span>기본값 복원</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-md transition cursor-pointer"
            >
              <Save size={14} />
              <span>설정 저장 & 타임테이블 반영</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-rose-500 text-white transition cursor-pointer"
              title="닫기 (ESC)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 탭 네비게이션 (요청서 제1부 vs 제2부) */}
        <div className="px-6 pt-3 bg-slate-100 border-b border-slate-300 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('PART1')}
            className={`px-5 py-2.5 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
              activeTab === 'PART1'
                ? 'bg-white text-blue-900 border-blue-600 shadow-xs'
                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <span className="text-base">🍱</span>
            <span>제1부. 성형장 · 포장실 운영 기준 (확인 1~3)</span>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
              UPH / 09:25 선가동 / 교대
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PART2')}
            className={`px-5 py-2.5 rounded-t-xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer border-t-2 ${
              activeTab === 'PART2'
                ? 'bg-white text-indigo-900 border-indigo-600 shadow-xs'
                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-200 border-transparent'
            }`}
          >
            <span className="text-base">🍳</span>
            <span>제2부. 취반실 · 전처리(조리)실 운영 기준 (확인 4~5)</span>
            <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
              역산 준비시간 / 1솥 배치
            </span>
          </button>
        </div>

        {/* 탭 본문 영역 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-slate-50 space-y-6">
          {saveSuccess && (
            <div className="p-4 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-sm font-black flex items-center gap-2 shadow-xs animate-bounce">
              <CheckCircle2 size={18} />
              <span>✨ 현장 운영 기준정보가 성공적으로 저장되었습니다! 타임테이블과 작업지시서가 즉시 재계산됩니다.</span>
            </div>
          )}

          {/* ═══════════ 제1부. 성형장 운영 기준 ═══════════ */}
          {activeTab === 'PART1' && (
            <div className="space-y-6">
              {/* 확인 1. 라인별 시간당 생산 속도(UPH) 및 품목 교체 세척 시간 */}
              <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-black">확인 1</span>
                    <h3 className="text-base font-black text-slate-900">
                      성형 라인별 시간당 생산 속도(UPH) 및 품목 교체 세척 시간
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    과장님이 기재하신 실제 속도와 교체 시간(분)을 입력해 주세요.
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-black">
                        <th className="py-2.5 px-3">성형 라인명</th>
                        <th className="py-2.5 px-3">기존 자료 기준 (파란색)</th>
                        <th className="py-2.5 px-3 bg-blue-50/70 text-blue-900 font-black">
                          현재 현장 기준 (시간당 UPH)
                        </th>
                        <th className="py-2.5 px-3 bg-amber-50/70 text-amber-900 font-black">
                          품목 교체·세척 시간 (분)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      <tr>
                        <td className="py-2.5 px-3 font-black text-slate-900">김밥 성형기 · 포장 라인</td>
                        <td className="py-2.5 px-3 text-slate-500">시간당 1,800줄 / 교체 5~10분</td>
                        <td className="py-2.5 px-3 bg-blue-50/30">
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="number"
                              value={config.lineSpeeds.kimbap.speed}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    kimbap: { ...prev.lineSpeeds.kimbap, speed: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-xs text-slate-600">줄/h</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 bg-amber-50/30">
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="number"
                              value={config.lineSpeeds.kimbap.changeover}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    kimbap: { ...prev.lineSpeeds.kimbap, changeover: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black focus:ring-2 focus:ring-amber-500"
                            />
                            <span className="text-xs text-slate-600">분</span>
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-black text-slate-900">삼각김밥 1호기 · 2호기</td>
                        <td className="py-2.5 px-3 text-slate-500">각 호기당 시간당 2,600개 / 교체 10분</td>
                        <td className="py-2.5 px-3 bg-blue-50/30">
                          <div className="flex items-center gap-2 font-mono">
                            <span>1호기</span>
                            <input
                              type="number"
                              value={config.lineSpeeds.samgak1.speed}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    samgak1: { ...prev.lineSpeeds.samgak1, speed: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span>2호기</span>
                            <input
                              type="number"
                              value={config.lineSpeeds.samgak2.speed}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    samgak2: { ...prev.lineSpeeds.samgak2, speed: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">개/h</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 bg-amber-50/30">
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="number"
                              value={config.lineSpeeds.samgak1.changeover}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    samgak1: { ...prev.lineSpeeds.samgak1, changeover: Number(e.target.value) || 0 },
                                    samgak2: { ...prev.lineSpeeds.samgak2, changeover: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">분</span>
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-black text-slate-900">더큰 삼각김밥 라인</td>
                        <td className="py-2.5 px-3 text-slate-500">시간당 2,400개 / 교체 10분</td>
                        <td className="py-2.5 px-3 bg-blue-50/30">
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="number"
                              value={config.lineSpeeds.samgakBig.speed}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    samgakBig: { ...prev.lineSpeeds.samgakBig, speed: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">개/h</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 bg-amber-50/30">
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="number"
                              value={config.lineSpeeds.samgakBig.changeover}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    samgakBig: { ...prev.lineSpeeds.samgakBig, changeover: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">분</span>
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-black text-slate-900">도시락 1라인 (정량충진)</td>
                        <td className="py-2.5 px-3 text-slate-500">시간당 1,500개 / 교체 15분</td>
                        <td className="py-2.5 px-3 bg-blue-50/30">
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="number"
                              value={config.lineSpeeds.dosirak.speed}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    dosirak: { ...prev.lineSpeeds.dosirak, speed: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">개/h</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 bg-amber-50/30">
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="number"
                              value={config.lineSpeeds.dosirak.changeover}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    dosirak: { ...prev.lineSpeeds.dosirak, changeover: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">분</span>
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-black text-slate-900">햄버거 · 샌드위치 라인</td>
                        <td className="py-2.5 px-3 text-slate-500">시간당 1,500개 / 교체 10~15분</td>
                        <td className="py-2.5 px-3 bg-blue-50/30">
                          <div className="flex items-center gap-2 font-mono">
                            <span>버거</span>
                            <input
                              type="number"
                              value={config.lineSpeeds.burger.speed}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    burger: { ...prev.lineSpeeds.burger, speed: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span>샌드</span>
                            <input
                              type="number"
                              value={config.lineSpeeds.sandwich.speed}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    sandwich: { ...prev.lineSpeeds.sandwich, speed: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">개/h</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 bg-amber-50/30">
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="number"
                              value={config.lineSpeeds.burger.changeover}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    burger: { ...prev.lineSpeeds.burger, changeover: Number(e.target.value) || 0 },
                                    sandwich: { ...prev.lineSpeeds.sandwich, changeover: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">분</span>
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-3 font-black text-slate-900">커플포장기 · HMR 라인</td>
                        <td className="py-2.5 px-3 text-slate-500">커플 1,500개 / HMR 1,200~1,500개</td>
                        <td className="py-2.5 px-3 bg-blue-50/30">
                          <div className="flex items-center gap-2 font-mono">
                            <span>커플</span>
                            <input
                              type="number"
                              value={config.lineSpeeds.couple.speed}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    couple: { ...prev.lineSpeeds.couple, speed: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span>HMR</span>
                            <input
                              type="number"
                              value={config.lineSpeeds.hmr.speed}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    hmr: { ...prev.lineSpeeds.hmr, speed: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">개/h</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 bg-amber-50/30">
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="number"
                              value={config.lineSpeeds.couple.changeover}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lineSpeeds: {
                                    ...prev.lineSpeeds,
                                    couple: { ...prev.lineSpeeds.couple, changeover: Number(e.target.value) || 0 },
                                    hmr: { ...prev.lineSpeeds.hmr, changeover: Number(e.target.value) || 0 },
                                  },
                                }))
                              }
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                            />
                            <span className="text-xs text-slate-600">분</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 확인 2. 아침 09:25 선가동 생산 순서 및 기본 수량 (10:20 확정 수주 전) */}
              <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-black">확인 2</span>
                    <h3 className="text-base font-black text-slate-900">
                      아침 09:25 선가동 생산 순서 및 기본 수량 (10:20 확정 수주 전)
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    매일 아침 10:20 수주 확정 전, 09:25부터 각 라인에서 미리 생산해 두는 품목과 기본 수량입니다.
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-black">
                        <th className="py-2.5 px-3 w-16 text-center">순서</th>
                        <th className="py-2.5 px-3 w-48">생산 라인명</th>
                        <th className="py-2.5 px-3 min-w-[220px]">09:25부터 먼저 돌리는 품목명</th>
                        <th className="py-2.5 px-3 w-40 text-right bg-emerald-50/70 text-emerald-900 font-black">
                          10:20 전 선가동 수량
                        </th>
                        <th className="py-2.5 px-3 w-28 text-center">투입 인원</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {config.preRunItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-center font-mono font-black text-slate-700">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={item.lineName}
                              onChange={(e) => updatePreRun(idx, 'lineName', e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={item.itemName}
                              onChange={(e) => updatePreRun(idx, 'itemName', e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg font-black text-slate-900"
                            />
                          </td>
                          <td className="py-2.5 px-3 bg-emerald-50/30">
                            <div className="flex items-center justify-end gap-1.5 font-mono">
                              <input
                                type="number"
                                value={item.preQty}
                                onChange={(e) => updatePreRun(idx, 'preQty', Number(e.target.value) || 0)}
                                className="w-28 px-2 py-1 bg-white border border-slate-300 rounded-lg text-right font-black text-emerald-950 focus:ring-2 focus:ring-emerald-500"
                              />
                              <span className="text-xs text-slate-600">개/줄</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="text"
                              value={item.workers}
                              onChange={(e) => updatePreRun(idx, 'workers', e.target.value)}
                              className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-center font-bold"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 확인 3. 성형장 작업 전환 · 휴게시간 · 포장 마감 기준 */}
              <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-xs">
                <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200">
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-black">확인 3</span>
                  <h3 className="text-base font-black text-slate-900">
                    성형장 작업 전환 · 휴게시간 · 포장 마감 기준
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm">
                  {/* 항목 1 */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-black text-slate-900">① 2편 ➔ 1편 교대 세척·점검 시간</div>
                    <p className="text-xs text-slate-500">주간(2편) 종료 후 야간(1편) 시작 전 라인 살균 소독 시간</p>
                    <div className="flex items-center gap-2 pt-1 font-mono">
                      <span className="text-xs text-slate-600">실제 소요:</span>
                      <input
                        type="number"
                        value={config.operationRules.shiftChangeoverMin}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            operationRules: {
                              ...prev.operationRules,
                              shiftChangeoverMin: Number(e.target.value) || 0,
                            },
                          }))
                        }
                        className="w-20 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                      />
                      <span className="text-xs font-bold text-slate-700">분 소요</span>
                    </div>
                  </div>

                  {/* 항목 2 */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-black text-slate-900">② 점심·저녁 식사시간 (12:30~13:20)</div>
                    <p className="text-xs text-slate-500">식사 시간 동안 라인 가동 방식</p>
                    <div className="space-y-1.5 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                        <input
                          type="radio"
                          name="mealBreakType"
                          checked={config.operationRules.mealBreakType === 'STOP_ALL'}
                          onChange={() =>
                            setConfig((prev) => ({
                              ...prev,
                              operationRules: { ...prev.operationRules, mealBreakType: 'STOP_ALL' },
                            }))
                          }
                          className="w-4 h-4 text-blue-600 cursor-pointer"
                        />
                        <span>전체 라인 정지 후 식사</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                        <input
                          type="radio"
                          name="mealBreakType"
                          checked={config.operationRules.mealBreakType === 'ROTATION'}
                          onChange={() =>
                            setConfig((prev) => ({
                              ...prev,
                              operationRules: { ...prev.operationRules, mealBreakType: 'ROTATION' },
                            }))
                          }
                          className="w-4 h-4 text-blue-600 cursor-pointer"
                        />
                        <span>인원 교대하며 계속 가동</span>
                      </label>
                    </div>
                  </div>

                  {/* 항목 3 */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-black text-slate-900">③ 성형 완료 후 포장 마감 소요</div>
                    <p className="text-xs text-slate-500">내포장·라벨링·금속검출·박스 적재 완료까지 추가 시간</p>
                    <div className="flex items-center gap-2 pt-1 font-mono">
                      <span className="text-xs text-slate-600">성형 완료 후:</span>
                      <input
                        type="number"
                        value={config.operationRules.packagingOffsetMin}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            operationRules: {
                              ...prev.operationRules,
                              packagingOffsetMin: Number(e.target.value) || 0,
                            },
                          }))
                        }
                        className="w-20 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-right font-black"
                      />
                      <span className="text-xs font-bold text-slate-700">분 이내 출고 대기</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ 제2부. 취반실 · 전처리실 운영 기준 ═══════════ */}
          {activeTab === 'PART2' && (
            <div className="space-y-6">
              {/* 확인 4. 파트별 선행 준비 시간 및 1배치 처리 용량 */}
              <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-black">확인 4</span>
                    <h3 className="text-base font-black text-slate-900">
                      파트별 선행 준비 시간(성형 시작 몇 분 전 완료) 및 1배치 처리 용량
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    성형실이 09:25 가동될 때 취반실과 전처리실이 역산하여 준비해야 할 시각과 설비 용량입니다.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                  {/* 1. 취반실 */}
                  <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-indigo-950 text-sm flex items-center gap-1.5">
                        <span>🍚</span> 취반실 (로터리 · 연속식 취반기)
                      </span>
                      <span className="text-[11px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded">
                        쌀 세척·불림·취반·초밥배합
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">배합 완료 시점</div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-slate-700 font-sans">성형</span>
                          <input
                            type="number"
                            value={config.prepOffsets.cooking.mixOffsetMin}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  cooking: { ...prev.prepOffsets.cooking, mixOffsetMin: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-14 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black text-indigo-900"
                          />
                          <span className="text-slate-700 font-sans">분 전 배합 완료</span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">불림·취반 시작</div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-slate-700 font-sans">성형</span>
                          <input
                            type="number"
                            value={config.prepOffsets.cooking.leadTimeMin}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  cooking: { ...prev.prepOffsets.cooking, leadTimeMin: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-14 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black text-indigo-900"
                          />
                          <span className="text-slate-700 font-sans">분 전 불림 시작</span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">1솥 생쌀 기준 용량</div>
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            value={config.prepOffsets.cooking.batchRiceKg}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  cooking: { ...prev.prepOffsets.cooking, batchRiceKg: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-16 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black"
                          />
                          <span className="text-slate-700 font-sans">kg / 솥</span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">1회 취반 총 소요시간</div>
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            value={config.prepOffsets.cooking.batchDurationMin}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  cooking: { ...prev.prepOffsets.cooking, batchDurationMin: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-16 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black"
                          />
                          <span className="text-slate-700 font-sans">분 소요</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. 스팀솥 */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                        <span>🍲</span> 스팀솥 (1·2번 / 자동 2대)
                      </span>
                      <span className="text-[11px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
                        불고기, 제육, 볶음류, 소스
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">조리/냉각 완료</div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-slate-700 font-sans">성형</span>
                          <input
                            type="number"
                            value={config.prepOffsets.steamPot.prepOffsetMin}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  steamPot: { ...prev.prepOffsets.steamPot, prepOffsetMin: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-14 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black"
                          />
                          <span className="text-slate-700 font-sans">분 전</span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">1솥 최대 용량</div>
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            value={config.prepOffsets.steamPot.maxBatchKg}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  steamPot: { ...prev.prepOffsets.steamPot, maxBatchKg: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-16 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black"
                          />
                          <span className="text-slate-700 font-sans">kg / 솥</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. 오토후라이어 */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                        <span>🍗</span> 오토후라이어 (1·2호기)
                      </span>
                      <span className="text-[11px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
                        돈까스, 치킨가라아게, 튀김류
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">튀김/냉각 완료</div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-slate-700 font-sans">성형</span>
                          <input
                            type="number"
                            value={config.prepOffsets.fryer.prepOffsetMin}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  fryer: { ...prev.prepOffsets.fryer, prepOffsetMin: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-14 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black"
                          />
                          <span className="text-slate-700 font-sans">분 전</span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">1회 투입 용량</div>
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            value={config.prepOffsets.fryer.batchKg}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  fryer: { ...prev.prepOffsets.fryer, batchKg: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-16 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black"
                          />
                          <span className="text-slate-700 font-sans">kg</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. 샐러드실 */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                        <span>🥗</span> 샐러드실 (믹서 1·2호기)
                      </span>
                      <span className="text-[11px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
                        참치마요, 샐러드, 속재료 배합
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">배합/소분 완료</div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-slate-700 font-sans">성형</span>
                          <input
                            type="number"
                            value={config.prepOffsets.salad.prepOffsetMin}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  salad: { ...prev.prepOffsets.salad, prepOffsetMin: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-14 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black"
                          />
                          <span className="text-slate-700 font-sans">분 전</span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-slate-500 text-[11px]">1회 배합 용량</div>
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            value={config.prepOffsets.salad.batchKg}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                prepOffsets: {
                                  ...prev.prepOffsets,
                                  salad: { ...prev.prepOffsets.salad, batchKg: Number(e.target.value) || 0 },
                                },
                              }))
                            }
                            className="w-16 px-1.5 py-0.5 border border-slate-300 rounded text-right font-black"
                          />
                          <span className="text-slate-700 font-sans">kg</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 확인 5. 과장님 특이사항 의견 기재란 */}
              <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-xs">
                <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-200">
                  <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-black">확인 5</span>
                  <h3 className="text-base font-black text-slate-900">
                    취반 · 전처리 공정 운영 시 꼭 반영해야 할 현장 특이사항
                  </h3>
                </div>
                <textarea
                  value={config.specialNotes}
                  onChange={(e) => setConfig((prev) => ({ ...prev, specialNotes: e.target.value }))}
                  rows={4}
                  placeholder="과장님께서 기재하신 특이사항(예: 밥 종류별 추가 배합 시간, 솥 세척 시간, 동시 조리 불가 알레르기 품목 순서 등)을 적어주세요."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* 팝업 하단 푸터 바 */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-300 flex items-center justify-between text-xs text-slate-600 font-medium shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded">안내</span>
            <span>저장된 기준값은 영구 보존되며, 작업지시서 발행 시 모든 라인/설비의 시간과 배치 수량이 자동 연쇄 계산됩니다.</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black shadow-md transition cursor-pointer"
            >
              <Check size={15} />
              <span>설정 저장 & 타임테이블 반영</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionConfigModal;
