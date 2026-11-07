'use client';

import React from 'react';
import {
  FileSpreadsheet,
  ShoppingCart,
  PackageCheck,
  Factory,
  Truck,
  ArrowRight,
  Printer,
  Sparkles,
  ClipboardCheck,
  AlertCircle,
  HelpCircle,
  BookOpen,
  PhoneCall,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useTabs } from '@/context/TabContext';
import { getMenuItemById } from '@/config/menuConfig';

export const HelpView: React.FC = () => {
  const { openTab } = useTabs();

  const handleNavigate = (menuId: string) => {
    const item = getMenuItemById(menuId);
    if (item) openTab(item);
  };

  const PIPELINE_STEPS = [
    {
      step: '01',
      title: '수주 접수 및 업로드',
      badge: 'GS리테일 연동',
      color: 'from-blue-600 to-indigo-600',
      icon: FileSpreadsheet,
      targetId: 'sales-order-upload',
      btnText: '주문등록GSR 바로가기',
      desc: '매일 GS리테일에서 수신한 발주 엑셀(본발주, 추가발주, 미출)을 원클릭으로 업로드합니다. 헤더가 없는 미출 파일도 지능형 파서가 100% 자동 인식합니다.',
      keyActions: [
        '엑셀 드래그&드롭 또는 클립보드 붙여넣기',
        '김해/양산/신광주 1편·2편 저온물류센터 자동 분배',
        'BOM 미등록 신메뉴 자동 감지 및 알림',
      ],
    },
    {
      step: '02',
      title: '일일 재고 실사표 반영',
      badge: '매일 17시 마감',
      color: 'from-emerald-600 to-teal-600',
      icon: ClipboardCheck,
      targetId: 'inv-lookup',
      btnText: '재고조회 바로가기',
      desc: '공장 현장 실사 재고표를 등록하여 현재고, 창고별 위치, FEFO 유통기한을 최신 상태로 맞춥니다.',
      keyActions: [
        '냉장1, 냉장2, 냉동, 상온, 부자재 창고별 실사',
        '유통기한 임박(D-3) 품목 선출고(FEFO) 자동 우선순위 부여',
        '안전재고 미달 품목 실시간 빨간색 경고',
      ],
    },
    {
      step: '03',
      title: '자재발주(요일별) — 핵심',
      badge: '발주 일원화',
      color: 'from-amber-600 to-orange-600',
      icon: ShoppingCart,
      targetId: 'pur-mat-order-day',
      btnText: '자재발주(요일별) 바로가기',
      desc: '기존의 구형 스마트발주가 통합된 단일 발주 화면입니다. 7일 요일 패턴과 안전재고, 수주 소요량을 종합 분석하여 발주 박스수를 자동 산출합니다.',
      keyActions: [
        '타이트(⚡) / 표준(⚖️) / 보수적 안전(🛡️) 3대 전략 모드 선택',
        '인라인 박스수량/단가 직접 수정 및 0초 즉각 삭제',
        '[원클릭 발주서 일괄생성] 시 ERP 정식 발주서(PO) 전표 자동 발행',
      ],
    },
    {
      step: '04',
      title: '발주 현황 관제 및 발주서 출력',
      badge: '협력사 전송',
      color: 'from-purple-600 to-pink-600',
      icon: Printer,
      targetId: 'pur-order-print',
      btnText: '발주서출력 바로가기',
      desc: '확정된 발주서를 거래처별로 표준 A4 양식으로 인쇄하거나 엑셀로 다운로드하여 자재 협력사에 즉시 전송합니다.',
      keyActions: [
        '발주 현황 및 수정 관제에서 품목별 인라인 수정 및 삭제 가능',
        '공급사별 표준 발주서 서식 100% 자동 렌더링',
        '직인 및 사업자 정보 자동 포함',
      ],
    },
    {
      step: '05',
      title: '자재 입고 및 HACCP 검수',
      badge: '품질안전 검수',
      color: 'from-cyan-600 to-blue-600',
      icon: PackageCheck,
      targetId: 'pur-receiving-status-edit',
      btnText: '입고 현황 및 검수 바로가기',
      desc: '도착한 자재의 차량 온도, 외관/표시 HACCP 검수를 진행하고 실도착 수량을 입력하여 재고에 즉시 입고 반영합니다.',
      keyActions: [
        '차량 번호, 운송 온도, HACCP 합격/불합격 판정',
        '입고 즉시 현재고 자동 가산 및 자재수불부(MaterialLedger) 자동 기록',
        '발주서 미입고 잔량 실시간 차감 (부분입고/완료 판정)',
      ],
    },
    {
      step: '06',
      title: '생산 46계 작업지시 & 실적',
      badge: '현장 라우팅',
      color: 'from-slate-700 to-slate-900',
      icon: Factory,
      targetId: 'prod-work-order-status',
      btnText: '작업지시현황 바로가기',
      desc: '수주 물량을 기준으로 김밥, 도시락, 샌드위치 등 46개 생산 계별 작업지시서를 발행하고 자재 투입 및 완제품 생산 실적을 등록합니다.',
      keyActions: [
        '1편(밤), 2편(낮) 생산 스케줄 동기화',
        '레시피 BOM 기준 원자재 실시간 투입 차감',
        '폐기 및 음식물 쓰레기 감량 관리',
      ],
    },
    {
      step: '07',
      title: '납품 출하 및 거래명세서',
      badge: '최종 납품',
      color: 'from-emerald-700 to-green-800',
      icon: Truck,
      targetId: 'sales-statement-issue',
      btnText: '거래명세서 바로가기',
      desc: '완제품 포장 및 파렛트 적재 후 GS리테일 각 센터로 출하 납품 등록하고 세금계산서/거래명세서를 발행합니다.',
      keyActions: [
        '납품 전표 및 박스 라벨 바코드 태그 인쇄',
        '거래명세서 원클릭 발행',
        '미출 발생 시 미출 등록 및 원인 분석 관리',
      ],
    },
  ];

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-y-auto select-none">
      {/* ── 1. 헤더 배너 ── */}
      <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-6 border-b border-slate-800 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                GFS-ERP v2.0 공식 가이드
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                파이프라인 100% 실시간 연동
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-2 flex items-center gap-2.5">
              <BookOpen className="w-7 h-7 text-amber-300" />
              <span>GFS 전사 업무 파이프라인 종합 가이드</span>
            </h1>
            <p className="text-slate-300 text-[13.5px] mt-1.5 font-medium max-w-2xl leading-relaxed">
              수주 접수부터 자재발주, 창고 입고검수, 46계 생산 라우팅, GS25 센터 납품까지 ERP 전체 전산망이
              완벽한 단일 체계로 실시간 작동합니다.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <button
              type="button"
              onClick={() => handleNavigate('pur-mat-order-day')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-[13.5px] shadow-md transition cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4 text-slate-950" />
              <span>자재발주(요일별) 바로가기</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── 2. 핵심 7단계 연쇄 파이프라인 흐름도 ── */}
      <main className="max-w-6xl mx-auto w-full p-6 space-y-6 flex-1">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span>공장 일일 표준 7단계 파이프라인 흐름</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                아래 1번부터 7번까지 순서대로 진행하시면 데이터 누락 없이 공장 업무가 원활하게 가동됩니다.
              </p>
            </div>
            <span className="text-[12px] font-bold text-slate-400 font-mono">STEP 01 ~ 07</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PIPELINE_STEPS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.step}
                  className="bg-slate-50/80 hover:bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-4.5 flex flex-col justify-between transition-all duration-200 hover:shadow-md group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                          {p.step}
                        </span>
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {p.badge}
                        </span>
                      </div>
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${p.color} text-white flex items-center justify-center shadow-2xs`}>
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>

                    <h3 className="text-[15.5px] font-black text-slate-900 tracking-tight">
                      {p.title}
                    </h3>
                    <p className="text-[12px] text-slate-600 mt-1.5 leading-relaxed font-medium">
                      {p.desc}
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 space-y-1">
                      {p.keyActions.map((act, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-500">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{act}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleNavigate(p.targetId)}
                    className="mt-4 w-full py-2 px-3 rounded-lg bg-white group-hover:bg-blue-600 text-slate-700 group-hover:text-white border border-slate-300 group-hover:border-blue-600 text-[12px] font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>{p.btnText}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 3. 자주 묻는 질문 및 실무 팁 (FAQ) ── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-[15px] font-black text-slate-900 tracking-tight flex items-center gap-2 mb-3">
              <HelpCircle className="w-4.5 h-4.5 text-blue-600" />
              <span>발주 체계 일원화 관련 안내</span>
            </h3>
            <div className="space-y-3 text-[12.5px] text-slate-600 leading-relaxed font-medium">
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3">
                <span className="font-bold text-blue-900 block mb-1">
                  Q. '스마트발주(GFS)'와 '자재발주(요일별)'의 차이는 무엇인가요?
                </span>
                <span>
                  구형 '스마트발주(GFS)'는 단독 HTML 프로토타입이었으며, 현재는 DB 및 실시간 재고, BOM과 100% 연동되는 <strong>[자재발주(요일별)]</strong>로 단일 통합되었습니다. 이제 다른 화면을 보실 필요 없이 <strong>[자재발주(요일별)]</strong>만 사용하시면 됩니다.
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="font-bold text-slate-800 block mb-1">
                  Q. 발주 품목을 잘못 넣었는데 삭제는 어떻게 하나요?
                </span>
                <span>
                  <strong>[발주 현황 및 수정 관제]</strong> 화면에서 해당 품목의 체크박스를 누르고 [선택 삭제]를 누르시거나, 각 행 우측의 휴지통(🗑️) 아이콘을 누르면 0초 만에 즉시 삭제됩니다. 삭제 시 잔여 품목 기준으로 발주 총액이 자동 재계산됩니다.
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-[15px] font-black text-slate-900 tracking-tight flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
              <span>HACCP 품질안전 및 데이터 무결성</span>
            </h3>
            <div className="space-y-3 text-[12.5px] text-slate-600 leading-relaxed font-medium">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
                <span className="font-bold text-emerald-950 block mb-1">
                  Q. HACCP 검수일지는 어디서 출력하나요?
                </span>
                <span>
                  상단 바의 <strong>[표준 양식 센터]</strong> 버튼을 누르시거나, [입고등록(GSR)] 화면 상단의 <strong>[HACCP검수일지인쇄]</strong> 버튼을 누르시면 식약처/HACCP 공인 서식 그대로 즉시 A4 인쇄가 가능합니다.
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="font-bold text-slate-800 block mb-1">
                  Q. 이미 창고에 입고된 품목은 삭제할 수 없나요?
                </span>
                <span>
                  네, 안전 잠금 장치가 적용되어 있습니다. 실물 원자재가 입고 처리된 품목은 재고 및 원가 왜곡을 방지하기 위해 임의 삭제가 차단되며, [입고현황/수정]에서 입고 내역을 먼저 조치한 후 삭제하실 수 있습니다.
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── 4. 하단 고정 푸터 ── */}
      <footer className="bg-slate-100 border-t border-slate-200 px-6 py-3 text-xs text-slate-500 flex items-center justify-between shrink-0">
        <span className="font-bold">GFS-ERP 전사 파이프라인 관제 센터</span>
        <span className="font-mono text-slate-400">데이터 연동 무결성 100% 실시간 보호 중</span>
      </footer>
    </div>
  );
};

