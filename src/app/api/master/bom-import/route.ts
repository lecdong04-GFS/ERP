import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { findRepoFiles, loadBomBundle, buildPreview, executeImport } from '@/lib/gfs/bomImport';
import { kstToday } from '@/lib/kst';

// POST /api/master/bom-import — 발주서 정본 내장 BOM 일괄적재
// body: { dryRun?: boolean }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // 기본 미리보기
    const today = kstToday();

    const { orderFile, auditFile } = findRepoFiles();
    if (!orderFile) {
      // PostgreSQL 단일 진실 공급원 모드: 현재 DB 정본 BOM 현황 반환
      const [headerCount, detailCount, matCount] = await Promise.all([
        prisma.bomHeader.count({ where: { isUsed: true } }),
        prisma.bomDetail.count({ where: { bomHeader: { isUsed: true } } }),
        prisma.product.count({ where: { isUsed: true, category: { notIn: ['완성품', '반제품'] } } }),
      ]);
      if (dryRun) {
        return NextResponse.json({
          success: true,
          data: {
            dryRun: true,
            materialCount: matCount,
            menuCount: headerCount,
            linkCount: detailCount,
            existingMaterials: matCount,
            newMaterials: 0,
            existingMenus: headerCount,
            newMenus: 0,
            skippedMemo: [],
            sampleNewMaterials: [],
            sampleNewMenus: [],
            sampleLinks: [],
          },
        });
      }
      return NextResponse.json({
        success: true,
        data: {
          menuCount: headerCount,
          createdProducts: 0,
          createdPartners: 0,
          createdHeaders: 0,
          createdDetails: 0,
          skippedMemo: [],
          errors: [],
        },
      });
    }
    const bundle = await loadBomBundle(orderFile, auditFile, today);

    const allNames = [
      ...new Set([...bundle.mats.map((m) => m.name), ...[...bundle.menuMap.values()].map((e) => e.menu)]),
    ];
    const existing = await prisma.product.findMany({ where: { name: { in: allNames } } });
    const existingByName = new Map(existing.map((p) => [p.name, p]));
    const preview = buildPreview(bundle.mats, bundle.menuMap, bundle.skippedMemo, existingByName);

    if (dryRun) {
      return NextResponse.json({ success: true, data: { dryRun: true, ...preview } });
    }

    const result = await executeImport(prisma as any, bundle, existingByName, today);

    await prisma.systemLog
      .create({
        data: {
          logDate: new Date().toISOString(),
          userId: Number(me.id) || undefined,
          loginId: String(me.loginId || ''),
          userName: String(me.name || ''),
          action: 'BOM일괄적재',
          menuId: 'master-bom-normal',
          menuName: 'BOM(일반)',
          detail: `${me.name || me.loginId} BOM 일괄적재: 메뉴 ${result.menuCount}종, 품목생성 ${result.createdProducts}건, 상세 ${result.createdDetails}건${result.skippedMemo.length ? `, 메모제외 ${result.skippedMemo.length}건` : ''}${result.errors.length ? `, 실패 ${result.errors.length}건` : ''}`,
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'BOM 일괄적재 실패' },
      { status: 500 }
    );
  }
}