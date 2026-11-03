'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

interface UnmatchedMenu {
  menuName: string;
  qty: number;
}

interface AutoBootPayload {
  today: string;
  master: {
    hasCustom: boolean;
    fileName: string;
    asOf: string;
    uploadedBy: string;
    itemCount: number;
    base64?: string;
  };
  dormantMeta?: {
    recent14MenuMap: Record<string, number>;
    menuTrendMap?: Record<string, { status: 'EXTINCT' | 'DECLINING' | 'SURGING' | 'STABLE'; changePct: number; qty7: number; qtyPrev: number }>;
    estUsageMap: Record<string, { estDailyUsage: number; sampleCount: number; observedDays: number }>;
  };
  orders: {
    usedDate: string;
    isToday: boolean;
    hasTodayOrder: boolean;
    availableDates: string[];
    menuCount: number;
    totalQty: number;
    items: Array<{ menuName: string; qty: number }>;
  };
  stock: {
    usedDate: string;
    availableDates: string[];
    itemCount: number;
    items: Array<{
      name: string;
      box: number;
      piece: number;
      currentStock: number;
      packQty: number;
      unitPrice: number;
      dailyUsage: number;
      estDailyUsage: number;
      sheet: string;
    }>;
  };
}

export const GfsSmartOrderView: React.FC = () => {
  const { data: session } = useSession();
  const me: any = session?.user;
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const masterInputRef = useRef<HTMLInputElement>(null);

  const [bootPayload, setBootPayload] = useState<AutoBootPayload | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [bootCompleted, setBootCompleted] = useState(false);
  const [statusMsg, setStatusMsg] = useState('데이터 자동 연동 준비 중...');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 선택된 수주일자 / 재고실사일자 / 발주저장 기준일자
  const [selectedOrderDate, setSelectedOrderDate] = useState('');
  const [selectedStockDate, setSelectedStockDate] = useState('');

  // GFS 실시간 산출 통계 및 신메뉴 BOM 미매칭 알림
  const [unmatchedMenus, setUnmatchedMenus] = useState<UnmatchedMenu[]>([]);
  const [showUnmatchedModal, setShowUnmatchedModal] = useState(false);
  const [auditMatchedCount, setAuditMatchedCount] = useState(0);
  const [orderableCount, setOrderableCount] = useState(0);
  const [activeMaterialCount, setActiveMaterialCount] = useState(0);
  const [dormantCount, setDormantCount] = useState(0);
  const [totalMaterialCount, setTotalMaterialCount] = useState(442);
  const [filterMode, setFilterMode] = useState<'order_only' | 'active_only' | 'all'>('order_only');
  const [totalAmount, setTotalAmount] = useState(0);

  // 작업 상태
  const [isUploadingMaster, setIsUploadingMaster] = useState(false);
  const [isOneClickSaving, setIsOneClickSaving] = useState(false);

  // 현재 시각 기준 마감 임박 채널 안내
  const [deadlineGuide, setDeadlineGuide] = useState<{
    label: string;
    channelId: string;
    urgent: boolean;
  }>({
    label: '11시 마감(CJ저온·GS1차)',
    channelId: 'gs_procure',
    urgent: true,
  });

  useEffect(() => {
    const updateDeadlineByClock = () => {
      const hour = new Date().getHours();
      if (hour < 11) {
        setDeadlineGuide({
          label: '🔥 11시 마감 임박 (CJ저온·GS1차)',
          channelId: 'gs_procure',
          urgent: true,
        });
      } else if (hour < 13) {
        setDeadlineGuide({
          label: '⏰ 13시 마감 집중 (발주고·진주·삼립)',
          channelId: 'baljugo',
          urgent: true,
        });
      } else {
        setDeadlineGuide({
          label: '💬 오후/직접발주 (카톡·이메일)',
          channelId: 'direct_msg',
          urgent: false,
        });
      }
    };
    updateDeadlineByClock();
    const timer = setInterval(updateDeadlineByClock, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // 1) 서버에서 3종 통합 데이터(발주서 마스터 + 10시 주문서 + 17시 재고조사표) 로드
  const fetchAutoBootData = useCallback(async (ordDate?: string, stkDate?: string) => {
    setIsBooting(true);
    setStatusMsg('발주서(BOM) · 10시 주문서 · 17시 재고표 자동 결합 중...');
    try {
      const qs = new URLSearchParams({ includeMaster: '1' });
      if (ordDate) qs.set('orderDate', ordDate);
      if (stkDate) qs.set('stockDate', stkDate);

      const res = await fetch(`/api/gfs/auto-boot?${qs.toString()}`);
      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || '자동 부팅 데이터 로드 실패');
      }
      const data: AutoBootPayload = json.data;
      setBootPayload(data);
      setSelectedOrderDate(data.orders.usedDate);
      setSelectedStockDate(data.stock.usedDate);
      return data;
    } catch (e: any) {
      setStatusMsg(`데이터 로드 오류: ${e.message}`);
      setIsBooting(false);
      return null;
    }
  }, []);

  useEffect(() => {
    fetchAutoBootData();
  }, [fetchAutoBootData]);

  // 2) iframe으로부터 메시지 수신 (GFS_READY, GFS_AUTO_BOOT_DONE, GFS_MASTER_APPLIED 등)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data || {};
      if (!d || typeof d.type !== 'string') return;

      if (d.type === 'GFS_READY') {
        setIframeReady(true);
      } else if (d.type === 'GFS_AUTO_BOOT_DONE') {
        setIsBooting(false);
        setBootCompleted(true);
        if (d.success) {
          setUnmatchedMenus(Array.isArray(d.unmatchedMenus) ? d.unmatchedMenus : []);
          setAuditMatchedCount(Number(d.auditMatchedCount) || 0);
          setOrderableCount(Number(d.orderableCount) || 0);
          setActiveMaterialCount(Number(d.activeCount) || 0);
          setDormantCount(Number(d.dormantCount) || 0);
          setTotalMaterialCount(Number(d.totalCount) || 442);
          if (d.filterDisplayMode) setFilterMode(d.filterDisplayMode);
          setTotalAmount(Number(d.totalAmount) || 0);
          setStatusMsg(
            `산출 완료 · 실발주 ${d.orderableCount || 0}건 (${d.totalBoxes || 0}박스) · 휴면 ${d.dormantCount || 0}건 제외`
          );
        } else {
          setStatusMsg(`산출 오류: ${d.error || '알 수 없는 오류'}`);
        }
      } else if (d.type === 'GFS_FILTER_MODE_CHANGED') {
        if (d.mode) setFilterMode(d.mode);
        if (d.orderableCount != null) setOrderableCount(Number(d.orderableCount) || 0);
        if (d.activeCount != null) setActiveMaterialCount(Number(d.activeCount) || 0);
        if (d.dormantCount != null) setDormantCount(Number(d.dormantCount) || 0);
        if (d.totalCount != null) setTotalMaterialCount(Number(d.totalCount) || 442);
      } else if (d.type === 'GFS_ORDERS_APPLIED' && d.success) {
        if (Array.isArray(d.unmatchedMenus)) {
          setUnmatchedMenus(d.unmatchedMenus);
        }
      } else if (d.type === 'GFS_AUDIT_APPLIED' && d.success) {
        setAuditMatchedCount(Number(d.matched) || 0);
      } else if (d.type === 'GFS_MASTER_APPLIED') {
        setIsUploadingMaster(false);
        if (d.success) {
          setUnmatchedMenus(Array.isArray(d.unmatchedMenus) ? d.unmatchedMenus : []);
          setStatusMsg(`신메뉴 발주서(${d.fileName}) 교체 및 재산출 완료`);
        }
      } else if (d.type === 'GFS_MASTER_PERSISTED') {
        setBootPayload((prev) =>
          prev
            ? {
                ...prev,
                master: {
                  ...prev.master,
                  hasCustom: true,
                  fileName: d.fileName || prev.master.fileName,
                  asOf: d.asOf || prev.master.asOf,
                  itemCount: d.itemCount || prev.master.itemCount,
                },
              }
            : prev
        );
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 3) iframeReady && bootPayload 둘 다 준비되면 즉시 Zero-Upload 자동 부팅 전송
  useEffect(() => {
    if (!iframeReady || !bootPayload || bootCompleted) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'GFS_AUTO_BOOT', payload: bootPayload }, window.location.origin);
  }, [iframeReady, bootPayload, bootCompleted]);

  // 4) 수주일자(주문서) 변경 시 즉시 재산출
  const handleChangeOrderDate = async (newDate: string) => {
    setSelectedOrderDate(newDate);
    setBootCompleted(false);
    await fetchAutoBootData(newDate, selectedStockDate);
  };

  // 5) 재고실사일자(재고표) 변경 시 즉시 재산출
  const handleChangeStockDate = async (newDate: string) => {
    setSelectedStockDate(newDate);
    setBootCompleted(false);
    await fetchAutoBootData(selectedOrderDate, newDate);
  };

  // 6) 1~2주 주기 [신메뉴+BOM 발주서] 업로드 & DB 영구 저장
  const handleMasterFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploadingMaster(true);
    setStatusMsg(`'${file.name}' 신메뉴 발주서 업로드 및 영구 저장 중...`);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const base64 = btoa(binary);

      // 1. 서버 DB에 영구 저장
      const saveRes = await fetch('/api/gfs/master-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          base64,
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveJson.success) {
        throw new Error(saveJson.error || '발주서 영구 저장 실패');
      }

      // 2. 상태 업데이트 및 GFS iframe에 즉시 반영 + 현재 수주·재고 재결합
      setBootPayload((prev) =>
        prev
          ? {
              ...prev,
              master: {
                hasCustom: true,
                fileName: file.name,
                asOf: saveJson.data.asOf,
                uploadedBy: saveJson.data.uploadedBy,
                itemCount: saveJson.data.itemCount || 431,
                base64,
              },
            }
          : prev
      );

      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.postMessage(
          {
            type: 'GFS_UPLOAD_MASTER',
            fileName: file.name,
            base64,
            orders: bootPayload?.orders.items || [],
            orderDate: selectedOrderDate,
            stock: bootPayload?.stock.items || [],
            stockDate: selectedStockDate,
          },
          window.location.origin
        );
      }
    } catch (err: any) {
      alert('발주서 교체 실패: ' + err.message);
      setStatusMsg('발주서 교체 실패');
      setIsUploadingMaster(false);
    }
  };

  // 7) 원클릭 [ERP 발주 확정 저장] (읽기 → 품목매칭 → 스냅샷 → 발주서 생성까지 1번에 처리)
  const handleOneClickConfirmOrder = async () => {
    const win = iframeRef.current?.contentWindow as any;
    if (!win) {
      alert('스마트발주 화면이 아직 준비되지 않았습니다.');
      return;
    }

    let raw: any[] = [];
    try {
      raw = win.eval('Array.isArray(state?.rawItems) ? state.rawItems : []');
    } catch {
      alert('GFS 산출 데이터를 읽지 못했습니다.');
      return;
    }

    const orderables = (raw || [])
      .filter((m: any) => !m?.is64Excluded && !m?.isBlacklisted)
      .map((m: any) => ({
        name: String(m?.name || '').trim(),
        boxes: Number(m?.calc?.finalBoxes ?? m?.finalBoxes ?? 0),
        packUnit: Number(m?.packUnit ?? 0),
        bagPrice: Number(m?.unitPrice ?? 0),
        supplierHeader: String(m?.supplier?.name || m?.supplier || ''),
        stockDays:
          m?.calc?.stockDays != null && !isNaN(Number(m.calc.stockDays))
            ? Number(m.calc.stockDays)
            : null,
      }))
      .filter((x) => x.name && x.boxes > 0);

    if (orderables.length === 0) {
      alert('현재 발주 수량(박스 > 0)이 있는 품목이 없습니다.');
      return;
    }

    const estAmt = orderables.reduce(
      (sum, x) => sum + x.boxes * (x.packUnit > 0 ? x.packUnit : 1) * x.bagPrice,
      0
    );
    const targetOrderDate = selectedOrderDate || new Date().toISOString().slice(0, 10);

    const ok = window.confirm(
      `[스마트발주 원클릭 ERP 확정]\n` +
        `• 발주 기준일: ${targetOrderDate}\n` +
        `• 발주 대상: 총 ${orderables.length}개 품목\n` +
        `• 예상 발주금액: 약 ₩${Math.round(estAmt).toLocaleString()}\n\n` +
        `현재 산출된 수량으로 ERP 발주서를 즉시 생성·저장하시겠습니까?`
    );
    if (!ok) return;

    setIsOneClickSaving(true);
    setStatusMsg(`1/2단계: ${orderables.length}개 품목 ERP 코드 자동 매칭 중...`);
    try {
      // Step A: /api/gfs/materialize 호출
      const matRes = await fetch('/api/gfs/materialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: orderables, orderDate: targetOrderDate }),
      });
      const matJson = await matRes.json();
      if (!matJson.success) {
        throw new Error(matJson.error || '품목 매칭 실패');
      }

      const { matched = [] } = matJson.data || {};
      const forOrder = matched
        .filter((m: any) => m.productCode)
        .map((m: any) => ({
          productCode: m.productCode,
          orderQty: m.orderQty,
          unitPrice: m.boxPrice || 0,
          partnerId: m.partnerId || undefined,
        }));

      if (forOrder.length === 0) {
        throw new Error('매칭된 발주 품목이 없습니다.');
      }

      // GFS 재고유지일 스냅샷 백그라운드 저장
      const snapItems = matched
        .filter((m: any) => m.productCode)
        .map((m: any) => ({
          productCode: m.productCode,
          productName: m.productName,
          warehouse: m.warehouse || '',
          stockDays: m.gfsDays != null ? m.gfsDays : null,
        }));
      if (snapItems.length > 0) {
        fetch('/api/gfs/snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'gfs', items: snapItems }),
        }).catch(() => {});
      }

      // Step B: /api/gfs/order-result 호출하여 실제 발주서(PurchaseOrder) 일괄 생성
      setStatusMsg(`2/2단계: ERP 발주서 ${forOrder.length}건 DB 확정 저장 중...`);
      const saveRes = await fetch('/api/gfs/order-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: targetOrderDate,
          memo: `스마트발주 자동산출 (${selectedOrderDate} 수주 / ${selectedStockDate} 재고 연동)`,
          items: forOrder,
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveJson.success) {
        throw new Error(saveJson.error || '발주서 DB 저장 실패');
      }

      const createdOrders = (saveJson.data || []).map((o: any) => o.orderNo);
      setStatusMsg(`발주 확정 완료: 총 ${createdOrders.length}건 전표 생성됨`);
      alert(
        `✅ ERP 발주 확정 완료 (${me?.name || me?.loginId || '담당자'})\n` +
          `• 총 ${forOrder.length}개 품목 / ${createdOrders.length}개 거래처 발주서 생성\n` +
          `• 전표번호: ${createdOrders.slice(0, 5).join(', ')}${createdOrders.length > 5 ? ` 외 ${createdOrders.length - 5}건` : ''}`
      );
    } catch (e: any) {
      alert('발주 확정 실패: ' + e.message);
      setStatusMsg(`발주 실패: ${e.message}`);
    } finally {
      setIsOneClickSaving(false);
    }
  };

  // 마감 임박 채널 클릭 시 GFS 탭 즉시 포커스
  const handleFocusDeadlineChannel = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: 'GFS_SWITCH_CHANNEL', channelId: deadlineGuide.channelId },
      window.location.origin
    );
  };

  // 3단 지능형 필터 모드 (실발주만 | 생산연동 | 전체) 변경
  const handleSetFilterMode = (mode: 'order_only' | 'active_only' | 'all') => {
    setFilterMode(mode);
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'GFS_SET_FILTER_MODE', mode }, window.location.origin);
  };

  // 수동 파일 업로드 화면 토글
  const handleToggleManualUpload = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'GFS_TOGGLE_UPLOAD_SECTION' }, window.location.origin);
  };

  // 전체화면 상태 감지 (HTML5 Fullscreen + ESC 키 감지)
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // 이동 가능한 독립 전체화면 팝업창 열기 (듀얼 모니터 이동 및 ERP 멀티태스킹 지원)
  const handleOpenPopupWindow = () => {
    const width = typeof window !== 'undefined' ? (window.screen.availWidth || 1920) : 1600;
    const height = typeof window !== 'undefined' ? (window.screen.availHeight || 1080) : 900;
    const left = typeof window !== 'undefined' ? ((window.screen as any).availLeft || 0) : 0;
    const top = typeof window !== 'undefined' ? ((window.screen as any).availTop || 0) : 0;
    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=yes',
      'status=no',
      'toolbar=no',
      'menubar=no',
      'location=no',
    ].join(',');
    const pop = window.open('/gfs/index.html?v=20261103_frozen_v5', 'GFS_SmartOrder_Window', features);
    if (pop) {
      pop.focus();
    }
  };

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else if (containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        setIsFullscreen((prev) => !prev);
      }
    } catch {
      // OS/브라우저 전체화면 권한 차단 시 CSS 기반 창 전체화면으로 매끄럽게 토글
      setIsFullscreen((prev) => !prev);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-[#0f172a] text-[12px] overflow-hidden select-none relative transition-all duration-200 ${
        isFullscreen ? 'fixed inset-0 z-[9999] w-screen h-screen' : 'h-full w-full'
      }`}
    >
      {/* 숨겨진 발주서 마스터(신메뉴·BOM) 교체 파일 입력 */}
      <input
        ref={masterInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleMasterFileChange}
      />

      {/* =================================================================== */}
      {/* 상단 1줄 Zero-Upload 통합 관제 바 (3대 데이터 신호등 + 신메뉴 감지 + 원클릭 확정) */}
      {/* =================================================================== */}
      <div className="h-10 shrink-0 bg-[#0f172a] border-b border-slate-800 text-white px-3 flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
        {/* 좌측 타이틀 */}
        <div className="flex items-center gap-1.5 shrink-0 pr-1 border-r border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-extrabold text-[12px] tracking-tight text-white">스마트발주</span>
        </div>

        {/* 신호등 1: 📦 발주서 마스터 (1~2주 주기 신메뉴·BOM 교체) */}
        <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-md px-2 py-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-[11px] text-slate-300 font-medium">📦 발주서(BOM):</span>
          <span
            className="text-[11px] font-bold text-white max-w-[140px] truncate"
            title={`현재 적용된 발주서 마스터: ${bootPayload?.master.fileName || 'GFS.xlsx'} (${bootPayload?.master.asOf || ''})`}
          >
            {bootPayload?.master.asOf || '기본본'}
          </span>
          <button
            type="button"
            onClick={() => masterInputRef.current?.click()}
            disabled={isUploadingMaster}
            className="ml-0.5 px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold text-white transition cursor-pointer"
            title="1~2주 주기 신메뉴 및 BOM이 추가된 최신 발주서 양식을 업로드하면 영구 기억됩니다"
          >
            {isUploadingMaster ? '교체중...' : '📤 신메뉴 발주서 교체'}
          </button>
        </div>

        {/* 🚨 신메뉴 BOM 미등록 감지 경고 배지 (미매칭 완제품이 있을 때만 표시) */}
        {unmatchedMenus.length > 0 && (
          <button
            type="button"
            onClick={() => setShowUnmatchedModal((v) => !v)}
            className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-amber-200 px-2 py-1 rounded-md text-[11px] font-bold shrink-0 animate-pulse cursor-pointer"
            title="오늘 10시 주문서에 있으나 현재 발주서 BOM에 없는 신메뉴가 감지되었습니다. 클릭하여 확인하세요."
          >
            <span>⚠️ 신메뉴 BOM 미매칭 {unmatchedMenus.length}종</span>
          </button>
        )}

        {/* 신호등 2: 🍱 오전 10시 완제품 주문서 자동 연동 */}
        <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-md px-2 py-1 shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              bootPayload?.orders.isToday ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span className="text-[11px] text-slate-300 font-medium">
            {bootPayload?.orders.isToday ? '🍱 10시 주문서:' : '🍱 주문서(최근):'}
          </span>
          <select
            value={selectedOrderDate}
            onChange={(e) => handleChangeOrderDate(e.target.value)}
            className="bg-slate-900 text-white font-mono font-bold text-[11px] px-1 py-0.5 rounded border border-slate-700 focus:outline-none cursor-pointer"
            title="연동할 완제품 수주(주문서) 일자 선택"
          >
            {(bootPayload?.orders.availableDates || [selectedOrderDate])
              .filter(Boolean)
              .map((d) => (
                <option key={d} value={d}>
                  {d.slice(5)}
                </option>
              ))}
          </select>
          <span className="text-[11px] font-bold text-emerald-300 font-mono">
            {bootPayload?.orders.menuCount || 0}종 ·{' '}
            {(bootPayload?.orders.totalQty || 0).toLocaleString()}개
          </span>
        </div>

        {/* 신호등 3: 📋 전일 오후 5시 최신 재고조사표 자동 연동 */}
        <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-md px-2 py-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-[11px] text-slate-300 font-medium">📋 17시 재고표:</span>
          <select
            value={selectedStockDate}
            onChange={(e) => handleChangeStockDate(e.target.value)}
            className="bg-slate-900 text-white font-mono font-bold text-[11px] px-1 py-0.5 rounded border border-slate-700 focus:outline-none cursor-pointer"
            title="연동할 재고조사표(실사 재고) 기준일자 선택"
          >
            {(bootPayload?.stock.availableDates || [selectedStockDate])
              .filter(Boolean)
              .map((d) => (
                <option key={d} value={d}>
                  {d.slice(5)}
                </option>
              ))}
          </select>
          <span className="text-[11px] font-bold text-cyan-300 font-mono">
            {auditMatchedCount || bootPayload?.stock.itemCount || 0}품목
          </span>
        </div>

        {/* 3단 지능형 필터 세그먼트 (실발주만 | 생산연동 | 전체) */}
        <div className="flex items-center bg-slate-900/90 p-0.5 rounded-md border border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => handleSetFilterMode('order_only')}
            className={`px-2 py-0.5 text-[11px] font-extrabold rounded flex items-center gap-1 transition cursor-pointer ${
              filterMode === 'order_only'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="오늘 실제 발주해야 하는 품목만 표시 (휴면자재 및 0박스 자동 숨김)"
          >
            <span>🔥 실발주만</span>
            {orderableCount > 0 && (
              <span className="font-mono text-[10px] px-1 rounded bg-black/40 text-amber-200">
                {orderableCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSetFilterMode('active_only')}
            className={`px-2 py-0.5 text-[11px] font-bold rounded flex items-center gap-1 transition cursor-pointer ${
              filterMode === 'active_only'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="오늘 완제품 생산 레시피에 들어가는 모든 자재 표시 (0박스 포함)"
          >
            <span>📦 생산연동</span>
            {activeMaterialCount > 0 && (
              <span className="font-mono text-[10px] px-1 rounded bg-black/40 text-indigo-200">
                {activeMaterialCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSetFilterMode('all')}
            className={`px-2 py-0.5 text-[11px] font-bold rounded flex items-center gap-1 transition cursor-pointer ${
              filterMode === 'all'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="휴면 자재 포함 442개 전체 품목 표시"
          >
            <span>📋 전체</span>
            <span className="font-mono text-[10px] px-1 rounded bg-black/40 text-slate-300">
              {totalMaterialCount}
            </span>
          </button>
        </div>

        {dormantCount > 0 && filterMode === 'order_only' && (
          <span className="text-[10px] font-medium text-slate-400 shrink-0 hidden 2xl:inline bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800">
            💤 휴면 {dormantCount}개 자동제외
          </span>
        )}

        {/* 현재 시각 기준 마감 임박 채널 원클릭 포커스 */}
        <button
          type="button"
          onClick={handleFocusDeadlineChannel}
          className={`hidden xl:flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border transition shrink-0 cursor-pointer ${
            deadlineGuide.urgent
              ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/50 text-rose-200'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
          }`}
          title="클릭 시 해당 마감 시간대 발주 채널 탭으로 즉시 이동합니다"
        >
          <span>{deadlineGuide.label}</span>
        </button>

        {/* 우측 원클릭 발주 확정 및 보조 도구 */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleOneClickConfirmOrder}
            disabled={isOneClickSaving || isBooting}
            className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md text-[11px] font-extrabold shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            title="현재 화면에 산출된 발주 수량을 읽어들여 품목 매칭과 ERP 발주서 생성을 원클릭으로 완료합니다"
          >
            <span>
              {isOneClickSaving
                ? '⏳ 발주서 생성 중...'
                : `✅ ERP 발주 확정 저장${orderableCount > 0 ? ` (${orderableCount}건)` : ''}`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setBootCompleted(false);
              fetchAutoBootData(selectedOrderDate, selectedStockDate);
            }}
            disabled={isBooting}
            className="h-7 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-[11px] font-bold text-slate-200 transition cursor-pointer"
            title="ERP 최신 주문서·재고표 데이터로 다시 산출"
          >
            🔄 재산출
          </button>

          <button
            type="button"
            onClick={handleToggleManualUpload}
            className="h-7 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-[11px] font-bold text-slate-300 transition cursor-pointer"
            title="엑셀 파일을 수동으로 직접 업로드할 때만 여는 화면 토글"
          >
            📂 수동파일창
          </button>

          <button
            type="button"
            onClick={handleOpenPopupWindow}
            className="h-7 px-3 bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 rounded-md text-[11px] font-bold text-white transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="클릭 시 전체화면 크기의 독립 팝업창이 열립니다. 창을 드래그하여 다른 모니터로 이동시키고, 원래 ERP 창에서는 재고조회 등 다른 업무를 동시에 자유롭게 진행할 수 있습니다."
          >
            🗗 전체화면 (새 창 팝업)
          </button>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            className={`h-7 px-2 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
              isFullscreen
                ? 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300'
            }`}
            title={isFullscreen ? '원래 화면 크기로 복귀 (ESC)' : '새 창을 띄우지 않고 현재 탭 안에서만 화면을 꽉 채웁니다.'}
          >
            {isFullscreen ? '🗗 축소 (ESC)' : '🗖 탭 내 꽉채우기'}
          </button>
        </div>
      </div>

      {/* 신메뉴 BOM 미등록 상세 안내 팝오버 (신메뉴 감지 시 클릭으로 열림) */}
      {showUnmatchedModal && unmatchedMenus.length > 0 && (
        <div className="bg-amber-950/95 border-b border-amber-500/50 text-amber-100 px-4 py-2.5 flex items-center justify-between gap-4 text-[12px] z-30">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-extrabold text-amber-300">
              🚨 현재 발주서(BOM)에 등록되지 않은 신메뉴 수주 ({unmatchedMenus.length}종):
            </span>
            {unmatchedMenus.map((m) => (
              <span
                key={m.menuName}
                className="px-2 py-0.5 rounded bg-amber-900/80 border border-amber-600/60 font-mono text-[11px] font-bold text-white"
              >
                {m.menuName} ({m.qty.toLocaleString()}개)
              </span>
            ))}
            <span className="text-[11px] text-amber-200/90 ml-1">
              → 신메뉴 BOM이 반영된 새 발주서 양식을 <strong>[📤 신메뉴 발주서 교체]</strong>로 업로드하시면 즉시 반영·기억됩니다.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowUnmatchedModal(false);
                masterInputRef.current?.click();
              }}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] cursor-pointer"
            >
              📤 지금 새 발주서 올리기
            </button>
            <button
              type="button"
              onClick={() => setShowUnmatchedModal(false)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 메인 GFS 스마트발주 관제 화면 (자동 부팅 중에는 깔끔한 로딩 배너 표시) */}
      {/* =================================================================== */}
      <div className="flex-1 min-h-0 bg-[#070B14] relative">
        {isBooting && (
          <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white">
            <div className="w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <div className="text-sm font-extrabold tracking-tight">{statusMsg}</div>
            <div className="text-[11px] text-slate-400 font-mono">
              파일 업로드 없이 ERP에 등록된 최신 발주서(BOM) · 10시 주문서 · 17시 재고표를 자동으로 결합합니다
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src="/gfs/index.html?v=20261103_frozen_v5"
          title="GFS 스마트발주"
          className="w-full h-full border-0 block"
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen={true}
        />
      </div>
    </div>
  );
};
