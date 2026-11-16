import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';
import { buildOrderSheet } from '@/lib/gfs/orderSheetBuilder';
import { calcRow, normalizeDateYmd } from '@/lib/gfs/orderCalc';
import {
  getCutoffStatus,
  getKstWeekdayChar,
  isOrderDayMatch,
  parseCutoffMinutes,
  resolveOrderPlatformAndCutoff,
  type OrderPlatformCode,
  type OrderWaveCode,
} from '@/lib/gfs/orderChannel';

export const dynamic = 'force-dynamic';

export interface OrderScheduleSlot {
  slotKey: string;
  partnerId: string;
  partnerName: string;
  slotLabel: string;
  platform: OrderPlatformCode;
  platformDetail: string;
  cutoffTime: string;
  wave: OrderWaveCode;
  orderDay: string;
  isOrderDayToday: boolean;
  orderNote: string;
  orderPortalUrl: string;
  email: string;
  tel: string;
  contactPerson: string;
  contactTel: string;
  orderableCount: number;
  orderableBoxes: number;
  confirmedOrders: Array<{
    id: number;
    orderNo: string;
    deliveryDate: string;
    totalAmount: number;
    dispatchStatus: string;
    dispatchChannel: string;
    dispatchedAt: string | null;
    dispatchedBy: string;
    itemCount: number;
  }>;
  slotStatus: 'DISPATCHED' | 'CONFIRMED_PENDING' | 'NEEDS_ORDER' | 'NO_NEED';
  cutoffStatus: ReturnType<typeof getCutoffStatus>;
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const rawDate = searchParams.get('date');
    const targetDate = (rawDate ? normalizeDateYmd(rawDate) : '') || kstToday();
    const weekdayChar = getKstWeekdayChar(targetDate);
    const now = new Date();

    const [partners, todayPos, sheetData] = await Promise.all([
      prisma.partner.findMany({
        where: { partnerType: 'P', isUsed: true },
        select: {
          id: true,
          name: true,
          orderMethod: true,
          orderChannel: true,
          orderCutoffTime: true,
          orderPortalUrl: true,
          orderDay: true,
          orderNote: true,
          email: true,
          tel: true,
          contactPerson: true,
          contactTel: true,
          leadTime: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          orderDate: targetDate,
          status: { not: '취소' },
        },
        select: {
          id: true,
          orderNo: true,
          partnerId: true,
          partnerName: true,
          deliveryDate: true,
          totalAmount: true,
          dispatchStatus: true,
          dispatchChannel: true,
          dispatchedAt: true,
          dispatchedBy: true,
          details: {
            select: {
              id: true,
              productName: true,
            },
          },
        },
      }),
      buildOrderSheet({ targetDate, dormantDays: 14 }),
    ]);

    const partnerByName = new Map<string, (typeof partners)[number]>();
    partners.forEach((p) => {
      if (p.name) partnerByName.set(p.name.trim(), p);
    });

    // 1) Aggregate orderable items from orderSheet by slotKey
    const needMap = new Map<string, { count: number; boxes: number; partnerName: string; tempHint: string }>();
    for (const r of sheetData.rows || []) {
      if (r.isDormant) continue;
      const supplier = String(r.supplier || '').trim();
      if (!supplier) continue;
      const calc = calcRow(r);
      const suggested = Number(calc?.suggest || 0);
      if (suggested <= 0) continue;

      const prof = partnerByName.get(supplier);
      const tempHint = String(r.warehouse || r.name || '');
      const resolved = resolveOrderPlatformAndCutoff({
        partnerName: supplier,
        orderChannel: prof?.orderChannel,
        orderMethod: prof?.orderMethod,
        orderCutoffTime: prof?.orderCutoffTime,
        tempHint,
      });
      const prev = needMap.get(resolved.slotKey) || {
        count: 0,
        boxes: 0,
        partnerName: supplier,
        tempHint,
      };
      prev.count += 1;
      prev.boxes += suggested;
      needMap.set(resolved.slotKey, prev);
    }

    // 2) Aggregate today's POs by slotKey
    const poMap = new Map<string, OrderScheduleSlot['confirmedOrders']>();
    for (const po of todayPos) {
      const supplier = String(po.partnerName || '').trim();
      const prof = partnerByName.get(supplier);
      const tempHint = po.details.map((d) => d.productName).join(' ');
      const resolved = resolveOrderPlatformAndCutoff({
        partnerName: supplier,
        orderChannel: prof?.orderChannel,
        orderMethod: prof?.orderMethod,
        orderCutoffTime: prof?.orderCutoffTime,
        tempHint,
      });
      const list = poMap.get(resolved.slotKey) || [];
      list.push({
        id: po.id,
        orderNo: po.orderNo,
        deliveryDate: po.deliveryDate,
        totalAmount: po.totalAmount,
        dispatchStatus: po.dispatchStatus || '미발송',
        dispatchChannel: po.dispatchChannel || '',
        dispatchedAt: po.dispatchedAt ? po.dispatchedAt.toISOString() : null,
        dispatchedBy: po.dispatchedBy || '',
        itemCount: po.details.length,
      });
      poMap.set(resolved.slotKey, list);
    }

    // 3) Build unified slots for all scheduled partners (expanding CJ/대상 temperature splits)
    const slotMap = new Map<string, OrderScheduleSlot>();
    const addSlot = (
      p: (typeof partners)[number],
      tempHint: string
    ) => {
      const resolved = resolveOrderPlatformAndCutoff({
        partnerName: p.name,
        orderChannel: p.orderChannel,
        orderMethod: p.orderMethod,
        orderCutoffTime: p.orderCutoffTime,
        tempHint,
      });
      if (slotMap.has(resolved.slotKey)) return;

      const need = needMap.get(resolved.slotKey) || { count: 0, boxes: 0 };
      const pos = poMap.get(resolved.slotKey) || [];
      const isOrderDayToday = isOrderDayMatch(p.orderDay, targetDate);
      const cutoffStatus = getCutoffStatus(resolved.cutoffTime, now);

      let slotStatus: OrderScheduleSlot['slotStatus'] = 'NO_NEED';
      if (pos.length > 0) {
        const allDone = pos.every((x) => x.dispatchStatus === '발송완료');
        slotStatus = allDone ? 'DISPATCHED' : 'CONFIRMED_PENDING';
      } else if (need.count > 0 && isOrderDayToday) {
        slotStatus = 'NEEDS_ORDER';
      }

      slotMap.set(resolved.slotKey, {
        slotKey: resolved.slotKey,
        partnerId: p.id,
        partnerName: p.name,
        slotLabel: resolved.slotLabel,
        platform: resolved.platform,
        platformDetail: resolved.platformDetail,
        cutoffTime: resolved.cutoffTime,
        wave: resolved.wave,
        orderDay: p.orderDay || '',
        isOrderDayToday,
        orderNote: p.orderNote || '',
        orderPortalUrl: p.orderPortalUrl || '',
        email: p.email || '',
        tel: p.tel || '',
        contactPerson: p.contactPerson || '',
        contactTel: p.contactTel || '',
        orderableCount: need.count,
        orderableBoxes: need.boxes,
        confirmedOrders: pos,
        slotStatus,
        cutoffStatus,
      });
    };

    for (const p of partners) {
      if (!p.orderMethod && !p.orderChannel && !p.orderCutoffTime) continue;
      if (p.name.includes('씨제이') || p.name.toUpperCase().includes('CJ제일제당') || p.name.includes('대상')) {
        addSlot(p, '냉동/냉장');
        addSlot(p, '상온');
      } else {
        addSlot(p, '');
      }
    }

    const slots = Array.from(slotMap.values()).sort((a, b) => {
      const rankStatus = (s: OrderScheduleSlot['slotStatus']) =>
        s === 'CONFIRMED_PENDING' ? 0 : s === 'NEEDS_ORDER' ? 1 : s === 'DISPATCHED' ? 2 : 3;
      const rs = rankStatus(a.slotStatus) - rankStatus(b.slotStatus);
      if (rs !== 0) return rs;
      const am = parseCutoffMinutes(a.cutoffTime);
      const bm = parseCutoffMinutes(b.cutoffTime);
      if (am !== null && bm !== null && am !== bm) return am - bm;
      if (am !== null && bm === null) return -1;
      if (am === null && bm !== null) return 1;
      return a.slotLabel.localeCompare(b.slotLabel, 'ko');
    });

    const actionable = slots.filter(
      (s) => s.slotStatus === 'CONFIRMED_PENDING' || s.slotStatus === 'NEEDS_ORDER'
    );
    const urgentSlots = actionable.filter(
      (s) => s.cutoffStatus.status === 'overdue' || s.cutoffStatus.status === 'urgent' || s.cutoffStatus.status === 'soon'
    );
    const nextSlot = urgentSlots[0] || actionable[0] || null;

    return NextResponse.json({
      success: true,
      data: {
        targetDate,
        weekdayChar,
        nowKst: new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(11, 16),
        summary: {
          totalScheduled: slots.filter((s) => s.isOrderDayToday).length,
          needsOrderCount: slots.filter((s) => s.slotStatus === 'NEEDS_ORDER').length,
          confirmedPendingCount: slots.filter((s) => s.slotStatus === 'CONFIRMED_PENDING').length,
          dispatchedCount: slots.filter((s) => s.slotStatus === 'DISPATCHED').length,
          nextUrgentCutoff: nextSlot?.cutoffTime || '',
          nextUrgentStatus: nextSlot?.cutoffStatus.status || 'ok',
          nextUrgentLabel: nextSlot?.cutoffStatus.label || '',
          urgentCount: urgentSlots.length,
          urgentNames: urgentSlots.slice(0, 4).map((s) => s.slotLabel),
        },
        slots,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '발주 관제 스케줄 조회 실패' },
      { status: 500 }
    );
  }
}
