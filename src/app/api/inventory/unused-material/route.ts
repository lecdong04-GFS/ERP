import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assignDate = searchParams.get('assignDate');
    const status = searchParams.get('status');

    const where: any = {};
    if (assignDate) where.assignDate = assignDate;
    if (status && status !== 'ALL') where.status = status;

    const list = await prisma.unusedMaterial.findMany({
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
        const item = await prisma.unusedMaterial.create({
          data: {
            assignDate: r.assignDate || kstToday(),
            productCode: r.productCode || '',
            productName: r.productName || '',
            category: r.category || '원재료',
            warehouse: r.warehouse || '',
            lotNo: r.lotNo || '',
            expiryDate: r.expiryDate || '',
            assignQty: Number(r.assignQty) || 0,
            unit: r.unit || 'kg',
            usePurpose: r.usePurpose || '',
            useQty: Number(r.useQty) || 0,
            status: r.status || '지정',
            remark: r.remark || '',
            createdBy: r.createdBy || '관리자',
          },
        });
        createdList.push(item);
      }
      return NextResponse.json({ success: true, count: createdList.length, data: createdList });
    }

    if (action === 'use' && id) {
      const updated = await prisma.unusedMaterial.update({
        where: { id: Number(id) },
        data: {
          useQty: Number(data.useQty) || 0,
          status: '사용',
          usePurpose: data.usePurpose || '생산투입',
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    const created = await prisma.unusedMaterial.create({
      data: {
        assignDate: data.assignDate || kstToday(),
        productCode: data.productCode || '',
        productName: data.productName || '',
        category: data.category || '원재료',
        warehouse: data.warehouse || '',
        lotNo: data.lotNo || '',
        expiryDate: data.expiryDate || '',
        assignQty: Number(data.assignQty) || 0,
        unit: data.unit || 'kg',
        usePurpose: data.usePurpose || '',
        useQty: Number(data.useQty) || 0,
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