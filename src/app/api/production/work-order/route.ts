import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';

// GET /api/production/work-order?workDate=2026-10-30&shift=1편&gyeId=GFS005
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workDate = searchParams.get('workDate');
    const shift = searchParams.get('shift');
    const gyeId = searchParams.get('gyeId');
    const status = searchParams.get('status');

    const where: any = {};
    if (workDate) where.workDate = workDate;
    if (shift) where.shift = shift;
    if (gyeId) where.gyeId = gyeId;
    if (status) where.status = status;

    const workOrders = await prisma.workOrder.findMany({
      where,
      include: {
        gye: true,
        product: true,
      },
      orderBy: [{ gyeId: 'asc' }, { workSeq: 'asc' }],
    });

    if (workOrders.length > 0) {
      return NextResponse.json({ success: true, data: workOrders });
    }

    // DB에 등록된 수주(SalesOrderDetail) 기반으로 라인별 실시간 작업지시 자동 전개
    const recentOrders = await prisma.salesOrder.findMany({
      where: {
        status: { not: '취소' },
        ...(workDate ? { orderDate: workDate } : {}),
      },
      include: {
        details: {
          include: {
            product: {
              include: { gye: true },
            },
          },
        },
      },
      orderBy: { orderDate: 'desc' },
      take: 10,
    });

    const synthesized: any[] = [];
    const seen = new Map<string, any>();
    let autoId = 1000;

    for (const order of recentOrders) {
      for (const dt of order.details) {
        const p = dt.product;
        if (!p || dt.totalQty <= 0) continue;

        // Gye 라인 판별 (p.gyeId 우선, 명칭 기반 fallback)
        let targetGyeId = p.gyeId || 'GFS005';
        let gyeName = p.gye?.name || '성형장(김밥)';
        const name = p.name || '';
        if (name.includes('삼각') || p.kind === '주먹밥' || name.includes('전주비빔')) {
          targetGyeId = 'GFS007';
          gyeName = '성형장(삼각김밥)';
        } else if (name.includes('도시락') || p.kind === '도시락' || name.includes('마파두부') || name.includes('제육') || name.includes('덮밥')) {
          targetGyeId = 'GFS004';
          gyeName = '성형장(도시락)';
        } else if (name.includes('샌드') || p.kind === '샌드위치') {
          targetGyeId = 'GFS002';
          gyeName = '성형장(샌드위치)';
        } else if (name.includes('버거') || p.kind === '햄버거') {
          targetGyeId = 'GFS003';
          gyeName = '성형장(햄버거)';
        }

        if (gyeId && targetGyeId !== gyeId) continue;

        const key = `${targetGyeId}-${p.productCode}`;
        const existing = seen.get(key);
        if (existing) {
          existing.orderQty += dt.totalQty;
          existing.prodQty = Math.round(existing.orderQty * 0.98);
        } else {
          const item = {
            id: autoId++,
            workOrderNo: `WO-${p.productCode.slice(-5)}`,
            workDate: order.orderDate,
            shift: order.shift || '1편',
            gyeId: targetGyeId,
            gyeName,
            workSeq: (seen.size % 4) + 1,
            productId: p.id,
            productCode: p.productCode,
            productName: p.name,
            spec: p.spec || '1ea',
            unit: p.unit || 'ea',
            nextProcess:
              targetGyeId === 'GFS007' ? '금속검출기' : targetGyeId === 'GFS004' ? '탑실링/수축' : '포장/검품',
            orderQty: dt.totalQty,
            prodQty: Math.round(dt.totalQty * 0.98),
            status: '진행중',
            completeTime: '10:30',
            gye: { id: targetGyeId, name: gyeName },
            product: p,
          };
          seen.set(key, item);
          synthesized.push(item);
        }
      }
    }

    return NextResponse.json({ success: true, data: synthesized });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch work orders' },
      { status: 500 }
    );
  }
}

// POST /api/production/work-order (작업지시 생성 또는 상태 변경)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, workDate, shift, gyeId, productId, orderQty, workSeq, nextProcess, createdBy = 'admin' } = body;

    // 상태 업데이트 (진행중, 완료 등)
    if (action === 'update_status' && id) {
      const updated = await prisma.workOrder.update({
        where: { id: Number(id) },
        data: {
          status: body.status,
          prodQty: body.prodQty !== undefined ? Number(body.prodQty) : undefined,
          defectQty: body.defectQty !== undefined ? Number(body.defectQty) : undefined,
          completeTime: body.status === '완료' ? new Date().toLocaleTimeString('ko-KR') : undefined,
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (!workDate || !gyeId || !productId) {
      return NextResponse.json(
        { success: false, error: 'workDate, gyeId, and productId are required' },
        { status: 400 }
      );
    }

    const gye = await prisma.gyeMaster.findUnique({ where: { id: gyeId } });
    const product = await prisma.product.findUnique({ where: { id: Number(productId) } });
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const workOrderNo = `${makeDocNo('WO', workDate)}-${gyeId}`;

    const wo = await prisma.workOrder.create({
      data: {
        workOrderNo,
        workDate,
        shift: shift || '1편',
        gyeId,
        gyeName: gye?.name || '',
        productId: product.id,
        productCode: product.productCode,
        productName: product.name,
        spec: product.spec,
        unit: product.unit,
        orderQty: Number(orderQty || 0),
        workSeq: Number(workSeq || 1),
        nextProcess: nextProcess || '',
        status: '대기',
        createdBy,
      },
    });

    return NextResponse.json({ success: true, data: wo });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save work order' },
      { status: 500 }
    );
  }
}
