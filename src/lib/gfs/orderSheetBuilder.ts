import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { normName } from '@/lib/gfs/canonical';
import { isExcludedFromOrder } from '@/lib/gfs/orderCalc';
import { getLiveBomUsageMap, LiveBomUsageMap } from '@/lib/gfs/liveUsage';
import { analyzeDormantMaterials, DormantAnalysisResult } from '@/lib/gfs/dormantMaterials';
import { pickLatestValidPrice, normalizeDateYmd } from '@/lib/gfs/bomMatch';
import { isTerminalProductStatus } from '@/lib/gfs/productStatus';
import {
  normalizePackUnit,
  pickLatestValidPurchasePrice,
  resolveBagPrice,
  calcBoxPrice,
  isBagUnitLabel,
  toBoxQty,
} from '@/lib/gfs/pricing';

export interface OrderSheetBuildResult {
  rows: any[];
  suppliers: string[];
  checkDate: string;
  auditCount: number;
  rowCount: number;
  liveBomDate: string;
  liveBomCount: number;
  dormantDays: number;
  dormantCount: number;
  unlinkedDormantCount: number;
  dormantLatestOrderDate: string;
  dormantLatestSnapDate: string;
  orderFile: string;
  masterSource: string;
  auditFile: null;
  errors: string[];
}

/**
 * GFS 발주 시트 정본 빌더
 * - order-sheet API 및 대시보드 금일 예상 발주량 계산에서 공용으로 사용
 */
export async function buildOrderSheet(params?: {
  targetDate?: string;
  dormantDays?: number;
}): Promise<OrderSheetBuildResult> {
  const rawDate = params?.targetDate || '';
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  const rawDormant = params?.dormantDays;
  const parsedDormant = rawDormant !== undefined && rawDormant !== null ? Number(rawDormant) : 14;
  const dormantDays = Number.isFinite(parsedDormant)
    ? Math.max(0, Math.min(90, Math.round(parsedDormant)))
    : 14;
  const todayKst = kstToday();
  const checkDate = targetDate || todayKst;
  const errors: string[] = [];

  // 1. 활성 원부자재 품목 마스터 + 재고 일괄 조회
  const products = await prisma.product.findMany({
    where: {
      isUsed: true,
      category: { notIn: ['완성품', '반제품'] },
    },
    include: {
      partner: true,
      prices: {
        orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
        take: 10,
        select: { id: true, effectiveDate: true, purchasePrice: true, deliveryPrice: true },
      },
      inventories: true,
    },
    orderBy: { productCode: 'asc' },
  });

  // 2. 최신 GS25 완제품 수주량 x BOM 레시피 전개 실시간 일사용량 + 최근 N일 수주·재고조사표 휴면 분석 병렬 실행
  const [bomOutcome, dormantOutcome] = await Promise.allSettled([
    getLiveBomUsageMap(targetDate),
    analyzeDormantMaterials(checkDate, dormantDays),
  ]);
  let liveBomUsage: LiveBomUsageMap | null = null;
  if (bomOutcome.status === 'fulfilled') {
    liveBomUsage = bomOutcome.value;
  } else {
    errors.push(
      `실시간 BOM 일사용량 산출 연동 실패(기준 일사용량 폴백): ${bomOutcome.reason?.message || bomOutcome.reason}`
    );
  }
  let dormantAnalysis: DormantAnalysisResult | null = null;
  if (dormantOutcome.status === 'fulfilled') {
    dormantAnalysis = dormantOutcome.value;
  } else {
    errors.push(
      `비수주·휴면 재고 교차 분석 실패(전체 표시): ${dormantOutcome.reason?.message || dormantOutcome.reason}`
    );
  }

  // 3. DB에서 현재 미입고 상태인 '기발주(Pending PO)' 내역 실시간 일괄 조회
  type PendingPoInfo = {
    remainBoxes: number;
    remainDirectBags: number;
    orderBoxes: number;
    orderNos: string[];
    latestOrderDate: string;
  };
  const pendingById = new Map<number, PendingPoInfo>();
  const pendingByCode = new Map<string, PendingPoInfo>();
  const pendingByNorm = new Map<string, PendingPoInfo>();
  const addPending = <K,>(
    m: Map<K, PendingPoInfo>,
    key: K,
    qty: number,
    orderQty: number,
    unit: string,
    orderNo: string,
    orderDate: string
  ) => {
    const cur = m.get(key) || {
      remainBoxes: 0,
      remainDirectBags: 0,
      orderBoxes: 0,
      orderNos: [],
      latestOrderDate: '',
    };
    if (isBagUnitLabel(unit)) {
      cur.remainDirectBags += qty;
    } else {
      cur.remainBoxes += qty;
    }
    cur.orderBoxes += orderQty;
    if (orderNo && !cur.orderNos.includes(orderNo)) cur.orderNos.push(orderNo);
    if (!cur.latestOrderDate || orderDate > cur.latestOrderDate) cur.latestOrderDate = orderDate;
    m.set(key, cur);
  };

  try {
    const activePendingDetails = await prisma.purchaseOrderDetail.findMany({
      where: {
        remainQty: { gt: 0 },
        purchaseOrder: {
          status: { notIn: ['발주취소', '취소', '입고완료'] },
        },
      },
      select: {
        productId: true,
        productCode: true,
        productName: true,
        unit: true,
        orderQty: true,
        remainQty: true,
        purchaseOrder: {
          select: { orderNo: true, orderDate: true, status: true },
        },
      },
    });

    for (const d of activePendingDetails) {
      const orderNo = d.purchaseOrder?.orderNo || '';
      const orderDate = normalizeDateYmd(d.purchaseOrder?.orderDate || '');
      const qty = d.remainQty > 0 ? d.remainQty : d.orderQty;
      const unit = d.unit || 'box';
      if (d.productId) addPending(pendingById, d.productId, qty, d.orderQty, unit, orderNo, orderDate);
      else if (d.productCode) addPending(pendingByCode, d.productCode, qty, d.orderQty, unit, orderNo, orderDate);
      else {
        const norm = normName(d.productName);
        if (norm) addPending(pendingByNorm, norm, qty, d.orderQty, unit, orderNo, orderDate);
      }
    }
  } catch (poErr: any) {
    errors.push(`DB 기발주 미입고 내역 연동 실패: ${poErr?.message || poErr}`);
  }

  const suppliersSet = new Set<string>();
  const rows: any[] = [];

  for (const p of products) {
    const name = p.name || p.productCode;
    if (isTerminalProductStatus(p.status)) continue;
    if (isExcludedFromOrder(name, checkDate)) continue;
    const discDate = p.discontinuedDate ? normalizeDateYmd(p.discontinuedDate) : '';
    if (discDate && checkDate >= discDate) continue;

    const norm = normName(name);
    const code = p.productCode || '';
    const invs = p.inventories || [];

    const liveBomVal = liveBomUsage
      ? liveBomUsage.byProductId.get(p.id) ?? (code ? liveBomUsage.byProductCode.get(code) : undefined)
      : undefined;
    const isBomDriven = liveBomVal !== undefined && Number(liveBomVal) > 0;

    if (invs.length === 0 && !isBomDriven && !(Number(p.targetOrderDays) > 0)) continue;

    const pack = normalizePackUnit(p.boxQty);
    const current = invs.reduce((s, i) => s + (Number(i.currentQty) || 0), 0);
    const surveyDaily = invs.reduce((mx, i) => Math.max(mx, Number(i.dailyUsage) || 0), 0);
    const baseIncoming = invs.reduce((s, i) => s + (Number((i as any).inQty) || 0), 0);
    const primaryInv = invs.find((i) => i.warehouse === p.warehouse) || invs[0];

    const targetDays = Number(p.targetOrderDays) > 0 ? Number(p.targetOrderDays) : 0;
    const baseDailyUsage = isBomDriven ? Number(liveBomVal) : surveyDaily;

    const supplier = p.partner?.name || p.warehouse || primaryInv?.warehouse || '기타';
    if (supplier) suppliersSet.add(supplier);

    const poInfo =
      pendingById.get(p.id) ||
      (code ? pendingByCode.get(code) : undefined) ||
      (norm ? pendingByNorm.get(norm) : undefined);
    const rawBoxes = poInfo?.remainBoxes || 0;
    const directBags = poInfo?.remainDirectBags || 0;
    const pendingBoxes = rawBoxes + (directBags > 0 ? toBoxQty(directBags, pack) : 0);
    const pendingBags = rawBoxes * pack + directBags;
    const totalIncoming = baseIncoming + pendingBags;

    const masterBagPrice =
      pickLatestValidPurchasePrice(p.prices as any) ||
      Number(pickLatestValidPrice(p.prices as any)?.purchasePrice) ||
      0;
    const invValidPrice =
      Number(primaryInv?.unitPrice) > 0
        ? Number(primaryInv?.unitPrice)
        : invs.reduce((best, i) => (best > 0 ? best : Number(i.unitPrice) || 0), 0);
    const unitPrice = resolveBagPrice({
      masterBagPrice,
      invUnitPrice: invValidPrice,
    });
    const boxPrice = calcBoxPrice(unitPrice, pack);

    const isReplacedSpam =
      name.includes('스팸(340g*20캔)') || (name.includes('스팸') && supplier.includes('튀김실'));
    const hasPendingPo = rawBoxes > 0 || directBags > 0;
    const activity = dormantAnalysis ? dormantAnalysis.getInfo(p.id, name) : null;
    const isDormant = Boolean(activity?.isDormant && !isBomDriven && !hasPendingPo);
    const dormantTier: 'active' | 'dormant' | 'unlinked_dormant' = isDormant
      ? activity?.dormantTier || 'dormant'
      : 'active';
    const suppressedSurveyDailyUsage = isDormant && !isBomDriven && surveyDaily > 0 ? surveyDaily : 0;
    const effectiveDailyUsage = isReplacedSpam || isDormant ? 0 : Number(baseDailyUsage) || 0;
    const effectiveBoxesBase = isReplacedSpam ? 0 : Math.floor(current / pack);
    const stockDays = effectiveDailyUsage > 0 ? Math.round((current / effectiveDailyUsage) * 10) / 10 : null;

    rows.push({
      id: p.id,
      productId: p.id,
      supplier,
      name,
      norm,
      boxesBase: effectiveBoxesBase,
      packUnit: pack,
      packUnitAudit: pack,
      days: targetDays,
      targetOrderDays: targetDays,
      dailyUsage: effectiveDailyUsage,
      isBomDriven,
      usageSource: isBomDriven ? 'BOM실시간' : '기준소진량',
      liveBomUsage: liveBomVal ?? null,
      surveyDailyUsage: surveyDaily,
      suppressedSurveyDailyUsage,
      isDormant,
      dormantTier,
      activeBomCount: activity?.activeBomCount ?? 0,
      lastBomOrderDate: activity?.lastBomOrderDate || '',
      lastSnapDecreaseDate: activity?.lastSnapDecreaseDate || '',
      incoming: totalIncoming,
      baseIncoming,
      pendingBoxes,
      pendingOrderNos: poInfo?.orderNos || [],
      latestOrderDate: poInfo?.latestOrderDate || '',
      currentStock: current,
      bagPrice: unitPrice,
      purchasePrice: unitPrice,
      boxPrice,
      stockDays,
      warehouse: p.warehouse || primaryInv?.warehouse || '',
      vendor: p.partner?.name || '',
      partnerId: p.partnerId || '',
      orderDay: p.partner?.orderDay || '월화수목금',
      itemId: code,
      status: p.status || '정상',
      orderCycle: p.orderCycle || (p.partner?.leadTime ? `D+${p.partner.leadTime}` : ''),
      discontinuedDate: discDate,
      isReplaced: isReplacedSpam,
      replacementNote: isReplacedSpam ? '고미트햄(한성) 대체 완료 (스팸 발주 영구 중단)' : undefined,
    });
  }

  rows.sort(
    (a, b) => String(a.warehouse).localeCompare(String(b.warehouse)) || String(a.itemId).localeCompare(String(b.itemId))
  );
  const suppliers = Array.from(suppliersSet).sort();
  const dormantCount = rows.filter((r) => r.isDormant).length;
  const unlinkedDormantCount = rows.filter((r) => r.dormantTier === 'unlinked_dormant').length;

  return {
    rows,
    suppliers,
    checkDate,
    auditCount: rows.length,
    rowCount: rows.length,
    liveBomDate: liveBomUsage?.asOfDate || '',
    liveBomCount: liveBomUsage?.rowCount || 0,
    dormantDays,
    dormantCount,
    unlinkedDormantCount,
    dormantLatestOrderDate: dormantAnalysis?.latestOrderDate || '',
    dormantLatestSnapDate: dormantAnalysis?.latestSnapDate || '',
    orderFile: 'PostgreSQL DB + 완제품 수주 x BOM 실시간 일사용량',
    masterSource: 'db_live_bom',
    auditFile: null,
    errors,
  };
}
