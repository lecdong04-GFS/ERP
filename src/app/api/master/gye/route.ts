import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';

export async function GET() {
  try {
    const auth = await requireSession();
    if ('error' in auth) return auth.error;
    const list = await prisma.gyeMaster.findMany({
      orderBy: { sortOrder: 'asc' },
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
    const created = await prisma.gyeMaster.create({
      data: {
        id: body.id,
        name: body.name,
        sortOrder: Number(body.sortOrder) || 0,
        isUsed: body.isUsed !== false,
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
