import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { loadCanonicalFromRepo, parseOrderSheet, OrderSheetItem, normName } from '@/lib/gfs/canonical';

const MASTER_KEY = 'gfs_master_workbook';

// GET /api/gfs/order-sheet — 발주서 정본(발주시트) + 재고조사표 정본 + DB 기발주 미입고(Pending PO) 실시간 연동
export async function GET() {
  try {
    const { audit, orderItems: repoOrderItems, suppliers: repoSuppliers, auditFile, orderFile: repoOrderFile, errors } = loadCanonicalFromRepo();

    let orderItems: OrderSheetItem[] = repoOrderItems;
    let suppliers: string[] = repoSuppliers;
    let orderFile = repoOrderFile;
    let masterSource: 'db' | 'repo' = 'repo';

    // 1. 스마트발주(GFS) 최신 발주서 마스터(gfs_master_workbook) 우선 조회
    try {
      const row = await prisma.dashboardSnapshot.findUnique({
        where: { key: MASTER_KEY },
      });
      if (row?.payload && typeof row.payload === 'object') {
        const p = row.payload as Record<string, any>;
        if (p.base64) {
          const buf = Buffer.from(p.base64, 'base64');
          const wb = XLSX.read(buf, { type: 'buffer' });
          const parsed = parseOrderSheet(wb);
          if (parsed.items.length > 0) {
            orderItems = parsed.items;
            suppliers = parsed.suppliers;
            orderFile = String(p.fileName || '발주서_마스터(DB)');
            masterSource = 'db';
          }
        }
      }
    } catch (dbErr: any) {
      errors.push(`DB 마스터 발주서 조회/파싱 실패: ${dbErr?.message || dbErr}`);
    }

    // 2. DB에서 현재 미입고 상태인 '기발주(Pending PO)' 내역 실시간 일괄 조회
    // 발주 후 창고 입고(물리적 도착) 전까지 중복 발주를 100% 원천 방지하기 위해 계산식의 incoming(입고예정)에 합산
    type PendingPoInfo = {
      remainBoxes: number;
      orderBoxes: number;
      orderNos: string[];
      latestOrderDate: string;
    };
    const pendingByCode = new Map<string, PendingPoInfo>();
    const pendingByNorm = new Map<string, PendingPoInfo>();

    try {
      const activePendingDetails = await prisma.purchaseOrderDetail.findMany({
        where: {
          remainQty: { gt: 0 },
          purchaseOrder: {
            status: { notIn: ['발주취소', '취소'] },
          },
        },
        select: {
          productCode: true,
          productName: true,
          orderQty: true,
          remainQty: true,
          purchaseOrder: {
            select: {
              orderNo: true,
              orderDate: true,
              status: true,
            },
          },
        },
      });

      for (const d of activePendingDetails) {
        const orderNo = d.purchaseOrder?.orderNo || '';
        const orderDate = d.purchaseOrder?.orderDate || '';
        const boxes = d.remainQty > 0 ? d.remainQty : d.orderQty;

        // 품목코드로 매핑
        if (d.productCode) {
          const cur = pendingByCode.get(d.productCode) || {
            remainBoxes: 0,
            orderBoxes: 0,
            orderNos: [],
            latestOrderDate: '',
          };
          cur.remainBoxes += boxes;
          cur.orderBoxes += d.orderQty;
          if (orderNo && !cur.orderNos.includes(orderNo)) cur.orderNos.push(orderNo);
          if (!cur.latestOrderDate || orderDate > cur.latestOrderDate) cur.latestOrderDate = orderDate;
          pendingByCode.set(d.productCode, cur);
        }

        // 정규화 품명으로 매핑 (정본 시트와의 연결 강화)
        const norm = normName(d.productName);
        if (norm) {
          const cur = pendingByNorm.get(norm) || {
            remainBoxes: 0,
            orderBoxes: 0,
            orderNos: [],
            latestOrderDate: '',
          };
          cur.remainBoxes += boxes;
          cur.orderBoxes += d.orderQty;
          if (orderNo && !cur.orderNos.includes(orderNo)) cur.orderNos.push(orderNo);
          if (!cur.latestOrderDate || orderDate > cur.latestOrderDate) cur.latestOrderDate = orderDate;
          pendingByNorm.set(norm, cur);
        }
      }
    } catch (poErr: any) {
      errors.push(`DB 기발주 미입고 내역 연동 실패: ${poErr?.message || poErr}`);
    }

    const auditByNorm = new Map(audit.map((a) => [a.norm, a]));
    const rows = orderItems.map((o, idx) => {
      const ref = auditByNorm.get(o.norm);
      const pack = o.packUnit || ref?.packUnit || 0;

      // 품목코드 또는 정규화 품명으로 기발주 미입고량 매칭
      const poInfo = (ref?.itemId && pendingByCode.get(ref.itemId)) || pendingByNorm.get(o.norm);
      const pendingBoxes = poInfo?.remainBoxes || 0;
      // 발주시트 계산식 단위는 낱개(Bags)이므로 박스x포장입수로 낱개 환산 가산
      const pendingBags = pack > 0 ? pendingBoxes * pack : pendingBoxes;

      const baseIncoming = o.incoming || 0;
      const totalIncoming = baseIncoming + pendingBags;

      return {
        id: idx + 1,
        supplier: o.supplierHeader,
        name: o.name,
        norm: o.norm,
        boxesBase: o.boxes,
        packUnit: o.packUnit || 0,
        packUnitAudit: ref?.packUnit || 0,
        days: o.days,
        dailyUsage: o.dailyUsage,
        incoming: totalIncoming, // 실시간 기발주 미입고량 합산
        baseIncoming,
        pendingBoxes, // 기발주 미입고 박스 수량
        pendingOrderNos: poInfo?.orderNos || [],
        latestOrderDate: poInfo?.latestOrderDate || '',
        currentStock: o.currentStock,
        bagPrice: o.bagPrice || ref?.bagPrice || 0,
        stockDays: o.stockDays,
        warehouse: ref?.warehouse || '',
        vendor: ref?.vendor || '',
        itemId: ref?.itemId || '',
      };
    });
    const withTarget = rows.filter((r) => r.name).length;
    return NextResponse.json({
      success: true,
      data: {
        rows,
        suppliers,
        auditCount: audit.length,
        rowCount: withTarget,
        auditFile,
        orderFile,
        masterSource,
        errors,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'order-sheet 로드 실패' },
      { status: 500 }
    );
  }
}
