import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

// GET /api/gfs/snapshot — 품목별 GFS 버팀일 스냅샷 전체
export async function GET() {
  try {
    const rows = await prisma.gfsSnapshot.findMany({ orderBy: { updatedAt: 'desc' } });
    const map: Record<string, { stockDays: number | null; asOf: string; productName: string; source: string }> = {};
    rows.forEach((r) => {
      map[r.productCode] = { stockDays: r.stockDays, asOf: r.asOf, productName: r.productName, source: (r as any).source || 'gfs' };
    });
    const asOf = rows.length > 0 ? rows[0].asOf : '';
    const sources: Record<string, number> = {};
    rows.forEach((r) => {
      const s = (r as any).source || 'gfs';
      sources[s] = (sources[s] || 0) + 1;
    });
    return NextResponse.json({ success: true, data: { map, count: rows.length, asOf, sources } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'snapshot 조회 실패' },
      { status: 500 }
    );
  }
}

// POST /api/gfs/snapshot — GFS 산출 버팀일 일괄 저장 (productCode 기준 upsert)
// body: { asOf?: string, items: [{ productCode?, productName?, warehouse?, stockDays }] }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const me = (session?.user as any) || { id: 1, loginId: 'admin', name: '관리자' };
    const body = await req.json();
    const asOf: string = body.asOf || kstToday();
    const source: string = body.source === 'erp' ? 'erp' : 'gfs';
    const items = (body.items || []) as {
      productCode?: string;
      productName?: string;
      warehouse?: string;
      stockDays?: number | null;
    }[];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'items가 비어 있습니다.' }, { status: 400 });
    }
    let saved = 0;
    let skipped = 0;
    for (const it of items) {
      let code = (it.productCode || '').trim();
      if (!code && it.productName) {
        const p = await prisma.product.findFirst({ where: { name: String(it.productName).trim() } });
        if (p) code = p.productCode;
      }
      if (!code) {
        skipped += 1;
        continue;
      }
      const days = it.stockDays == null || isNaN(Number(it.stockDays)) ? null : Number(it.stockDays);
      await prisma.gfsSnapshot.upsert({
        where: { productCode: code },
        update: {
          productName: String(it.productName || ''),
          warehouse: String(it.warehouse || ''),
          stockDays: days,
          asOf,
          source,
        },
        create: {
          productCode: code,
          productName: String(it.productName || ''),
          warehouse: String(it.warehouse || ''),
          stockDays: days,
          asOf,
          source,
        },
      });
      saved += 1;
    }

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: 'GFS재고유지일저장',
          menuId: 'pur-gfs-smart-order',
          menuName: '스마트발주(GFS)',
          detail: `${me.name || me.loginId} GFS 재고유지일 ${saved}건 저장 (${asOf})${skipped ? `, 미매칭 ${skipped}건 제외` : ''}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: { saved, skipped, asOf } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'snapshot 저장 실패' },
      { status: 500 }
    );
  }
}