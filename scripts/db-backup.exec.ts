import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadEnv, kstToday } from './lib/env';

loadEnv();

async function main() {
  const prisma = new PrismaClient();
  try {
    const tables = {
      partner: await prisma.partner.findMany(),
      product: await prisma.product.findMany(),
      productPrice: await prisma.productPrice.findMany(),
      inventory: await prisma.inventory.findMany(),
      gfsSnapshot: await prisma.gfsSnapshot.findMany(),
      salesOrder: await prisma.salesOrder.findMany({ include: { details: true } }),
      delivery: await prisma.delivery.findMany({ include: { details: true } }),
      workOrder: await prisma.workOrder.findMany(),
      purchaseOrder: await prisma.purchaseOrder.findMany({ include: { details: true } }),
      safetyStock: await prisma.safetyStock.findMany(),
      materialRequirement: await prisma.materialRequirement.findMany(),
    };

    const dir = path.join(process.cwd(), 'prisma', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date(Date.now() + 9 * 3600 * 1000)
      .toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 14);
    const file = path.join(dir, `db-backup-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), kstToday: kstToday(), tables }, null, 1));

    const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, (v as unknown[]).length]));
    console.log('백업 완료:', file);
    console.log('건수:', JSON.stringify(counts));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('백업 실패:', error);
  process.exit(1);
});
