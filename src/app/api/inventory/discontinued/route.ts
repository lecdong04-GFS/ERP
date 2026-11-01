import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  try {
    const list = await prisma.discontinuedProduct.findMany({
      orderBy: { id: 'desc' },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    const created = await prisma.discontinuedProduct.create({
      data: {
        productCode: data.productCode || '',
        productName: data.productName || '',
        category: data.category || '완성품',
        discontinuedDate: data.discontinuedDate || kstToday(),
        reason: data.reason || '',
        remainStock: Number(data.remainStock) || 0,
        disposalPlan: data.disposalPlan || '',
        status: data.status || '지정',
        remark: data.remark || '',
        createdBy: data.createdBy || '관리자',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}