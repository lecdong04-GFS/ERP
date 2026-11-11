import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';
import { requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const targetId = searchParams.get('targetId');

    // 특정 단종 품목의 BOM 원부자재 불용 위험도 정밀 분석 요청
    if (targetId) {
      const disc = await prisma.discontinuedProduct.findUnique({
        where: { id: Number(targetId) },
      });
      if (!disc) {
        return NextResponse.json({ success: false, error: '품목을 찾을 수 없습니다.' }, { status: 404 });
      }

      const cleanName = disc.productName.replace(/\(.*?\)/g, '').replace(/[\s&]/g, '');
      const products = await prisma.product.findMany();
      const parent = products.find((p) => {
        const pClean = p.name.replace(/\(.*?\)/g, '').replace(/[\s&]/g, '');
        return (
          p.name.includes(disc.productName) ||
          disc.productName.includes(p.name) ||
          pClean.includes(cleanName) ||
          cleanName.includes(pClean)
        );
      });

      const bomMaterials: any[] = [];
      if (parent) {
        const boms = await prisma.bomHeader.findMany({
          where: { parentProductId: parent.id, isUsed: true },
          include: {
            details: {
              include: {
                childProduct: {
                  include: { inventories: true },
                },
              },
            },
          },
        });

        for (const b of boms) {
          for (const d of b.details) {
            const ch = d.childProduct;
            if (!ch) continue;
            const otherUsageCount = await prisma.bomDetail.count({
              where: {
                childProductId: d.childProductId,
                bomHeader: { isUsed: true, parentProductId: { not: parent.id } },
              },
            });
            const totalStock = ch.inventories.reduce((sum, inv) => sum + (inv.currentQty || 0), 0);
            bomMaterials.push({
              childProductId: ch.id,
              productCode: ch.productCode,
              name: ch.name,
              category: ch.category,
              unit: ch.unit,
              unitQty: d.unitQty,
              isExclusive: otherUsageCount === 0,
              otherUsageCount,
              totalStock,
              warehouse: ch.warehouse || '상온',
              status: ch.status || '정상',
              discontinuedDate: ch.discontinuedDate || '',
              isUsed: ch.isUsed !== false,
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          item: disc,
          parentProduct: parent ? { id: parent.id, code: parent.productCode, name: parent.name } : null,
          materials: bomMaterials,
        },
      });
    }

    const where: any = {};
    if (startDate || endDate) {
      where.discontinuedDate = {};
      if (startDate) where.discontinuedDate.gte = startDate;
      if (endDate) where.discontinuedDate.lte = endDate;
    }
    if (status && status !== '전체') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { productName: { contains: search } },
        { productCode: { contains: search } },
        { reason: { contains: search } },
        { remark: { contains: search } },
      ];
    }

    const list = await prisma.discontinuedProduct.findMany({
      where,
      orderBy: [{ discontinuedDate: 'asc' }, { id: 'asc' }],
    });

    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'inventory', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const { action, id, ...data } = body;

    // 상태 토글 (대기 <-> 완료)
    if (action === 'toggle_status' && id) {
      const existing = await prisma.discontinuedProduct.findUnique({ where: { id: Number(id) } });
      if (!existing) {
        return NextResponse.json({ success: false, error: '대상을 찾을 수 없습니다.' }, { status: 404 });
      }
      const nextStatus = existing.status === '완료' ? '대기' : '완료';
      const updated = await prisma.discontinuedProduct.update({
        where: { id: Number(id) },
        data: { status: nextStatus },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // 신규 등록
    const created = await prisma.discontinuedProduct.create({
      data: {
        productCode: data.productCode || `DISC-${(data.discontinuedDate || kstToday()).replace(/-/g, '')}`,
        productName: data.productName || '',
        category: data.category || '완성품',
        discontinuedDate: data.discontinuedDate || kstToday(),
        reason: data.reason || '단종 지정',
        remainStock: Number(data.remainStock) || 0,
        disposalPlan: data.disposalPlan || '잔여재고 소진',
        status: data.status || '대기',
        remark: data.remark || '',
        createdBy: data.createdBy || auth.user.name || auth.user.loginId,
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
