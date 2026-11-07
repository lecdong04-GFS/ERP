import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    service: 'GFS-ERP NextAuth API Gateway',
    timestamp: new Date().toISOString(),
  });
}

