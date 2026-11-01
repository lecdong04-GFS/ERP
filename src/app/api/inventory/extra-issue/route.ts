import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const issueDate = searchParams.get('issueDate');
    const gyeId = searchParams.get('gyeId');

    const where: any = {};
    if (issueDate) where.issueDate = issueDate;
    if (gyeId && gyeId !== 'ALL') where.gyeId = gyeId;

    const list = await prisma.materialExtraIssue.findMany({
      where,
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
    const { action, id, rows, ...data } = body;

    if (action === 'batch' && Array.isArray(rows)) {
      const createdList = [];
      for (const r of rows) {
        const item = await prisma.materialExtraIssue.create({
          data: {
            issueDate: r.issueDate || kstToday(),
            gyeId: r.gyeId || '',
            gyeName: r.gyeName || '',
            productCode: r.productCode || '',
            productName: r.productName || '',
            category: r.category || '원재료',
            issueQty: Number(r.issueQty) || 0,
            unit: r.unit || 'kg',
            reason: r.reason || '',
            status: r.status || '요청',
            remark: r.remark || '',
            createdBy: r.createdBy || '관리자',
          },
        });
        createdList.push(item);
      }
      return NextResponse.json({ success: true, count: createdList.length, data: createdList });
    }

    const created = await prisma.materialExtraIssue.create({
      data: {
        issueDate: data.issueDate || kstToday(),
        gyeId: data.gyeId || '',
        gyeName: data.gyeName || '',
        productCode: data.productCode || '',
        productName: data.productName || '',
        category: data.category || '원재료',
        issueQty: Number(data.issueQty) || 0,
        unit: data.unit || 'kg',
        reason: data.reason || '',
        status: data.status || '요청',
        remark: data.remark || '',
        createdBy: data.createdBy || '관리자',
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}