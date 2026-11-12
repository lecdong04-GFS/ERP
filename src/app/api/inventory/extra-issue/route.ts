import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';
import { requireSession } from '@/lib/apiAuth';

// GET /api/inventory/extra-issue?issueDate=2026-11-07&gyeId=GFS005&startDate=...&endDate=...
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const issueDate = searchParams.get('issueDate');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const gyeId = searchParams.get('gyeId');
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    const where: any = {};
    if (startDate && endDate) {
      where.issueDate = { gte: startDate, lte: endDate };
    } else if (issueDate) {
      where.issueDate = issueDate;
    }
    if (gyeId && gyeId !== 'ALL') {
      where.gyeId = gyeId;
    }
    if (category && category !== 'ALL') {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { productCode: { contains: search } },
        { productName: { contains: search } },
        { gyeName: { contains: search } },
        { reason: { contains: search } },
      ];
    }

    // 추가불출 기록 조회
    const extraIssues = await prisma.materialExtraIssue.findMany({
      where,
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
    });

    // 품목 코드 목록 수집
    const productCodes = Array.from(new Set(extraIssues.map((e) => e.productCode).filter(Boolean)));
    const inventories = await prisma.inventory.findMany({
      where: { productCode: { in: productCodes } },
      include: { product: { include: { partner: true } } },
    });

    const invMap = new Map<string, typeof inventories[0]>();
    inventories.forEach((inv) => {
      invMap.set(inv.productCode, inv);
    });

    // 데이터 조합 및 단가/금액 계산
    let totalQty = 0;
    let totalAmount = 0;
    const gyeSummary: Record<string, { gyeName: string; count: number; qty: number; amount: number }> = {};
    const reasonSummary: Record<string, number> = {};

    const enriched = extraIssues.map((e, idx) => {
      const inv = invMap.get(e.productCode);
      const unitPrice = inv?.unitPrice || 0;
      const amount = Math.round(e.issueQty * unitPrice);
      const warehouse = inv?.warehouse || '상온';
      const spec = inv?.product?.spec || '';
      const currentStock = inv?.currentQty || 0;
      const supplier = inv?.product?.partner?.name || '기타협력사';

      totalQty += e.issueQty;
      totalAmount += amount;

      // 공정(계)별 통계
      const gyeKey = e.gyeId || e.gyeName || '기타';
      if (!gyeSummary[gyeKey]) {
        gyeSummary[gyeKey] = { gyeName: e.gyeName || gyeKey, count: 0, qty: 0, amount: 0 };
      }
      gyeSummary[gyeKey].count += 1;
      gyeSummary[gyeKey].qty += e.issueQty;
      gyeSummary[gyeKey].amount += amount;

      // 사유별 통계
      const rKey = e.reason || '기타';
      reasonSummary[rKey] = (reasonSummary[rKey] || 0) + 1;

      return {
        id: e.id,
        no: idx + 1,
        issueDate: e.issueDate,
        gyeId: e.gyeId,
        gyeName: e.gyeName,
        productCode: e.productCode,
        productName: e.productName,
        category: e.category || inv?.category || '원재료',
        warehouse,
        spec,
        unit: e.unit || inv?.unit || '봉',
        currentStock,
        unitPrice,
        issueQty: e.issueQty,
        amount,
        reason: e.reason,
        status: e.status || '완료',
        remark: e.remark,
        createdBy: e.createdBy,
        supplier,
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
      totalCount: enriched.length,
      summary: {
        totalCount: enriched.length,
        totalQty,
        totalAmount,
        gyeSummary,
        reasonSummary,
      },
    });
  } catch (error: any) {
    console.error('Error fetching extra issues:', error);
    return NextResponse.json(
      { success: false, error: error.message || '추가불출 조회에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// POST /api/inventory/extra-issue (추가불출 등록 및 현재고 차감 파이프라인)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'inventory', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const {
      action = 'batch',
      rows = [],
      createdBy = auth.user.name || auth.user.loginId,
      issueDate = kstToday(),
    } = body;

    const itemsToProcess = action === 'batch' && Array.isArray(rows) ? rows : [body];

    if (itemsToProcess.length === 0) {
      return NextResponse.json(
        { success: false, error: '등록할 추가불출 품목이 없습니다.' },
        { status: 400 }
      );
    }

    // 트랜잭션으로 추가불출 이력 생성 및 현재고(Inventory) 차감 동기화
    const result = await prisma.$transaction(async (tx) => {
      const createdList = [];
      let stockDeductedCount = 0;

      for (const r of itemsToProcess) {
        const qty = Number(r.issueQty || 0);
        if (qty <= 0) continue;

        const pCode = String(r.productCode || '').trim();
        const pName = String(r.productName || '').trim();
        const warehouse = r.warehouse || '';

        // 1. 추가불출 레코드 생성
        const created = await tx.materialExtraIssue.create({
          data: {
            issueDate: r.issueDate || issueDate || kstToday(),
            gyeId: r.gyeId || '',
            gyeName: r.gyeName || '',
            productCode: pCode,
            productName: pName,
            category: r.category || '원재료',
            issueQty: qty,
            unit: r.unit || '봉',
            reason: r.reason || '공정 로스 보충',
            status: r.status || '완료',
            remark: r.remark || (warehouse ? `[창고: ${warehouse}]` : ''),
            createdBy: r.createdBy || createdBy,
          },
        });
        createdList.push(created);

        // 2. 현재고(Inventory) 테이블 실시간 차감
        if (pCode) {
          const invWhere: any = { productCode: pCode };
          if (warehouse) invWhere.warehouse = warehouse;

          const inv = await tx.inventory.findFirst({
            where: invWhere,
          });

          if (inv) {
            const nextQty = Math.max(0, Math.round((inv.currentQty - qty) * 100) / 100);
            const nextAmount = Math.round(nextQty * inv.unitPrice);
            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                currentQty: nextQty,
                stockAmount: nextAmount,
                lastOutDate: r.issueDate || issueDate,
              },
            });
            stockDeductedCount++;
          }
        }
      }

      return { count: createdList.length, stockDeductedCount };
    }, { maxWait: 20000, timeout: 60000 });

    // ERP 대시보드 스냅샷 캐시 무효화 (재고 자산 지표 갱신)
    await touchDashboardSnapshot();

    return NextResponse.json({
      success: true,
      count: result.count,
      stockDeductedCount: result.stockDeductedCount,
      message: `${result.count}건의 자재 추가불출이 성공적으로 등록되었으며, 현재고(${result.stockDeductedCount}건)가 실시간 차감 반영되었습니다.`,
    });
  } catch (error: any) {
    console.error('Error saving extra issues:', error);
    return NextResponse.json(
      { success: false, error: error.message || '추가불출 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE /api/inventory/extra-issue?id=123 (추가불출 취소 및 현재고 원복)
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'inventory', action: 'delete' });
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: '삭제할 추가불출 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const issueId = Number(id);
    if (!Number.isInteger(issueId) || issueId <= 0) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 추가불출 ID입니다.' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.materialExtraIssue.findUnique({
        where: { id: issueId },
      });

      if (!record) {
        throw new Error('해당 추가불출 기록을 찾을 수 없습니다.');
      }

      // 현재고 원복 (remark에 기록된 창고가 있으면 동일 창고 우선 복원)
      if (record.productCode && record.issueQty > 0) {
        const whMatch = String(record.remark || '').match(/\[창고:\s*([^\]]+)\]/);
        const wh = whMatch ? whMatch[1].trim() : '';
        const inv =
          (wh
            ? await tx.inventory.findFirst({
                where: { productCode: record.productCode, warehouse: wh },
              })
            : null) ||
          (await tx.inventory.findFirst({
            where: { productCode: record.productCode },
          }));

        if (inv) {
          const restoredQty = Math.round((inv.currentQty + record.issueQty) * 100) / 100;
          const restoredAmount = Math.round(restoredQty * inv.unitPrice);
          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              currentQty: restoredQty,
              stockAmount: restoredAmount,
            },
          });
        }
      }

      // 레코드 삭제
      await tx.materialExtraIssue.delete({
        where: { id: issueId },
      });

      return record;
    }, { maxWait: 20000, timeout: 60000 });

    await touchDashboardSnapshot();

    return NextResponse.json({
      success: true,
      message: `추가불출 기록(#${id})이 삭제되었으며, 불출수량(${result.issueQty}${result.unit})이 현재고에 원복되었습니다.`,
    });
  } catch (error: any) {
    console.error('Error deleting extra issue:', error);
    return NextResponse.json(
      { success: false, error: error.message || '추가불출 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
