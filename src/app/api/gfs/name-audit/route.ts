import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { normName } from '@/lib/gfs/canonical';
import { menuKey } from '@/lib/gfs/bomMatch';

// GET /api/gfs/name-audit — PostgreSQL 단일 진실 공급원 기준 품명·BOM·수주 정합성 대조
export async function GET() {
  try {
    const erpProducts = await prisma.product.findMany({
      where: { isUsed: true },
      select: { id: true, name: true, category: true, productCode: true },
    });

    const headers = await prisma.bomHeader.findMany({
      where: { isUsed: true },
      include: {
        parentProduct: { select: { id: true, name: true, isUsed: true } },
        details: { include: { childProduct: { select: { id: true, name: true, isUsed: true, category: true } } } },
      },
    });

    const reprRows = await prisma.reprProduct.findMany({ where: { isUsed: true } });
    const reprOrderIds = new Set(reprRows.map((r) => r.orderProductId));
    const bomParentIds = new Set(headers.map((h) => h.parentProductId));
    const bomMenuKeys = new Set(headers.map((h) => menuKey(h.parentProduct?.name || '')).filter(Boolean));

    const bomMaterialIds = new Set<number>();
    const inactiveBomMaterials: string[] = [];
    for (const h of headers) {
      for (const d of h.details) {
        if (d.childProduct) {
          bomMaterialIds.add(d.childProduct.id);
          if (!d.childProduct.isUsed) {
            inactiveBomMaterials.push(d.childProduct.name);
          }
        }
      }
    }

    // 수주 품목 중 BOM/ReprProduct 미연결 메뉴 점검
    const sodGroups = await prisma.salesOrderDetail.groupBy({ by: ['productId'] });
    const prodById = new Map(erpProducts.map((p) => [p.id, p]));
    const missingMenus: string[] = [];
    for (const g of sodGroups) {
      const pid = g.productId;
      if (!pid) continue;
      const p = prodById.get(pid);
      if (!p) continue;
      if (!bomParentIds.has(pid) && !reprOrderIds.has(pid) && !bomMenuKeys.has(menuKey(p.name))) {
        missingMenus.push(p.name);
      }
    }

    // 같은 이름 + 다른 구분 (완성품/자재 겹침)
    const byNorm = new Map<string, Set<string>>();
    erpProducts.forEach((p) => {
      const k = normName(p.name);
      if (!k) return;
      if (!byNorm.has(k)) byNorm.set(k, new Set());
      byNorm.get(k)!.add(p.category);
    });
    const dupNames = [...byNorm.entries()]
      .filter(([, cats]) => cats.size > 1)
      .map(([k, cats]) => `${erpProducts.find((p) => normName(p.name) === k)?.name} (${[...cats].join('/')})`);

    return NextResponse.json({
      success: true,
      data: {
        excelMaterials: bomMaterialIds.size,
        excelMenus: headers.length,
        erpCount: erpProducts.length,
        missingMaterials: [...new Set(inactiveBomMaterials)],
        missingMenus: [...new Set(missingMenus)],
        erpNotInExcel: [],
        dupNames,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'name-audit 실패' },
      { status: 500 },
    );
  }
}
