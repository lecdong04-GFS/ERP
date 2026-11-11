import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    const where: any = {};
    if (productId) where.productId = Number(productId);

    const list = await prisma.packagingSpec.findMany({
      where,
      include: { product: true },
      orderBy: { id: 'desc' },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'master', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const created = await prisma.packagingSpec.create({
      data: {
        productId: Number(body.productId) || 1,
        packageType: body.packageType || '',
        width: Number(body.width) || 0,
        height: Number(body.height) || 0,
        depth: Number(body.depth) || 0,
        weight: Number(body.weight) || 0,
        barcode: body.barcode || '',
        remark: body.remark || '',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
