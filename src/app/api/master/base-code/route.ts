import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

// GET /api/master/base-code?classId=STR
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('classId');

    if (classId) {
      const details = await prisma.baseCodeDetail.findMany({
        where: { classId, isUsed: true },
        orderBy: { sortOrder: 'asc' },
      });
      return NextResponse.json({ success: true, data: details });
    }

    const classes = await prisma.baseCodeClass.findMany({
      where: { isUsed: true },
      include: {
        details: {
          where: { isUsed: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ success: true, data: classes });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch base codes' },
      { status: 500 }
    );
  }
}

// POST /api/master/base-code
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'master', action: 'write' });
    if ('error' in auth) return auth.error;
    const body = await req.json();
    const { classId, code, name, val1, val2, val3, val4, val5, sortOrder, remark } = body;

    if (!classId || !code || !name) {
      return NextResponse.json(
        { success: false, error: 'classId, code, and name are required' },
        { status: 400 }
      );
    }

    const detail = await prisma.baseCodeDetail.upsert({
      where: {
        classId_code: { classId, code },
      },
      update: {
        name,
        val1: val1 ?? '',
        val2: val2 ?? '',
        val3: val3 ?? '',
        val4: val4 ?? '',
        val5: val5 ?? '',
        sortOrder: sortOrder ?? 0,
        remark: remark ?? '',
      },
      create: {
        classId,
        code,
        name,
        val1: val1 ?? '',
        val2: val2 ?? '',
        val3: val3 ?? '',
        val4: val4 ?? '',
        val5: val5 ?? '',
        sortOrder: sortOrder ?? 0,
        remark: remark ?? '',
      },
    });

    return NextResponse.json({ success: true, data: detail });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save base code' },
      { status: 500 }
    );
  }
}

