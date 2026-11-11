import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import * as XLSX from 'xlsx';
import { parseOrderSheet } from '@/lib/gfs/canonical';
import { normName } from '@/lib/gfs/norm';
import { resolveBagPrice } from '@/lib/gfs/pricing';

const MASTER_KEY = 'gfs_master_workbook';

// GET /api/gfs/master-sheet?meta=1 → 최신 발주서(신메뉴+BOM 마스터) 메타 또는 전체(base64 포함) 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const metaOnly = searchParams.get('meta') === '1';

    const row = await prisma.dashboardSnapshot.findUnique({
      where: { key: MASTER_KEY },
    });

    if (!row || !row.payload || typeof row.payload !== 'object') {
      return NextResponse.json({
        success: true,
        data: {
          exists: false,
          fileName: '★★발주서양식통합★★(11월 최신본)',
          asOf: '2026-11-02',
          uploadedBy: '시스템 기본',
          updatedAt: null,
          itemCount: 442,
        },
      });
    }

    const p = row.payload as Record<string, any>;
    return NextResponse.json({
      success: true,
      data: {
        exists: Boolean(p.base64),
        fileName: String(p.fileName || '발주서_마스터.xlsx'),
        asOf: row.asOf || String(p.asOf || kstToday()),
        uploadedBy: String(p.uploadedBy || '담당자'),
        updatedAt: row.updatedAt?.toISOString() || p.updatedAt || null,
        itemCount: Number(p.itemCount) || 431,
        ...(metaOnly ? {} : { base64: String(p.base64 || '') }),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '발주서 마스터 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/gfs/master-sheet — 신메뉴+BOM이 반영된 새 발주서 엑셀 영구 저장 (1~2주 주기 교체용)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const me = (session?.user as any) || { id: 1, loginId: 'admin', name: '관리자' };
    const body = await req.json();

    const fileName = String(body.fileName || '').trim() || '발주서_마스터.xlsx';
    const base64 = String(body.base64 || '').trim();
    const itemCount = Number(body.itemCount) || 431;

    if (!base64) {
      return NextResponse.json(
        { success: false, error: '발주서 엑셀 데이터(base64)가 비어 있습니다.' },
        { status: 400 }
      );
    }

    const asOf = kstToday();
    const uploadedBy = String(me.name || me.loginId || '담당자');
    const payload = {
      fileName,
      base64,
      asOf,
      uploadedBy,
      itemCount,
      updatedAt: new Date().toISOString(),
    };

    await prisma.dashboardSnapshot.upsert({
      where: { key: MASTER_KEY },
      update: {
        payload,
        asOf,
      },
      create: {
        key: MASTER_KEY,
        payload,
        asOf,
      },
    });

    await prisma.systemLog
      .create({
        data: {
          logDate: kstToday(),
          userId: me.id ? Number(me.id) : null,
          loginId: me.loginId || 'admin',
          userName: uploadedBy,
          action: '데이터변경',
          menuId: 'pur-mat-order-day',
          menuName: '자재발주(요일별)',
          detail: `발주서 마스터(신메뉴·BOM) 영구 교체: ${fileName} (${asOf})`,
        },
      })
      .catch(() => {});

    // 재고(prisma.inventory) 및 GFS 재고유지일(prisma.gfsSnapshot)에 최신 발주서 현재고/일사용량/단가/유지일 자동 동기화
    try {
      const buf = Buffer.from(base64, 'base64');
      const wb = XLSX.read(buf, { type: 'buffer' });
      const parsed = parseOrderSheet(wb);
      if (parsed.items.length > 0) {
        const orderNorms = new Map(parsed.items.map((o) => [o.norm, o]));
        const invs = await prisma.inventory.findMany();
        for (const inv of invs) {
          const k = normName(inv.productName);
          const o = orderNorms.get(k);
          if (o) {
            const finalPrice = resolveBagPrice({
              masterBagPrice: o.bagPrice,
              invUnitPrice: inv.unitPrice,
            });
            const stockDays = o.dailyUsage > 0 ? Math.round((o.currentStock / o.dailyUsage) * 10) / 10 : null;

            await prisma.inventory.update({
              where: { id: inv.id },
              data: {
                currentQty: o.currentStock,
                dailyUsage: o.dailyUsage,
                unitPrice: finalPrice,
                stockAmount: Math.round(o.currentStock * finalPrice),
              },
            });

            // GFS 재고유지일 스냅샷(재고조회 화면 표시용) 즉시 동기화
            if (inv.productCode) {
              await prisma.gfsSnapshot.upsert({
                where: { productCode: inv.productCode },
                update: {
                  productName: inv.productName,
                  warehouse: inv.warehouse || '',
                  stockDays: stockDays,
                  asOf,
                  source: 'gfs',
                },
                create: {
                  productCode: inv.productCode,
                  productName: inv.productName,
                  warehouse: inv.warehouse || '',
                  stockDays: stockDays,
                  asOf,
                  source: 'gfs',
                },
              });
            }
          }
        }
      }
    } catch (syncErr) {
      console.error('master-sheet inventory auto-sync failed:', syncErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        fileName,
        asOf,
        uploadedBy,
        itemCount,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '발주서 마스터 저장 실패' },
      { status: 500 }
    );
  }
}

