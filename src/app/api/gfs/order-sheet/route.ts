import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadCanonicalFromRepo } from '@/lib/gfs/canonical';

// GET /api/gfs/order-sheet — 발주서 정본(발주시트) + 재고조사표 정본 조인
export async function GET() {
  try {
    const { audit, orderItems, suppliers, auditFile, orderFile, errors } = loadCanonicalFromRepo();
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
