import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { loadCanonicalFromRepo, parseOrderSheet, OrderSheetItem } from '@/lib/gfs/canonical';

const MASTER_KEY = 'gfs_master_workbook';

// GET /api/gfs/order-sheet — 발주서 정본(발주시트) + 재고조사표 정본 조인
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

    const auditByNorm = new Map(audit.map((a) => [a.norm, a]));
    const rows = orderItems.map((o, idx) => {
      const ref = auditByNorm.get(o.norm);
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
        incoming: o.incoming,
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
