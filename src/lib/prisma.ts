/**
 * (주)GFS — Prisma Client Singleton
 * 
 * Next.js 개발 모드에서 핫 리로드 시 Prisma Client가 
 * 중복 생성되는 것을 방지하는 싱글톤 패턴
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;

