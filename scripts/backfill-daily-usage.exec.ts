import { PrismaClient } from '@prisma/client';
import { loadEnv } from './lib/env';
import { normName, parseAll } from './lib/excel';

loadEnv();
const APPLY = process.argv.includes('--apply');

async function main() {
  const prisma = new PrismaClient();
  try {
    const parsed = parseAll();
    const inventory = await prisma.inventory.findMany({
      select: { id: true, productName: true, warehouse: true, dailyUsage: true },
    });

    // 엑셀 데이터: productName+warehouse → usageBox
    const usageMap = new Map<string, number>();
    for (const row of parsed.inventory) {
      const key = `${normName(row.name)}|${row.warehouse}`;
      if (!usageMap.has(key)) usageMap.set(key, row.usageBox);
    }

    let matched = 0, updated = 0;
    const updates: { id: number; dailyUsage: number; name: string }[] = [];
    for (const inv of inventory) {
      const key = `${normName(inv.productName)}|${inv.warehouse}`;
      const usage = usageMap.get(key);
      if (usage === undefined) continue;
      matched += 1;
      if (inv.dailyUsage !== usage) {
        updated += 1;
        updates.push({ id: inv.id, dailyUsage: usage, name: inv.productName });
      }
    }

    console.log(`[${APPLY ? 'APPLY' : 'DRY-RUN'}] 매칭 ${matched} · 변경 ${updated}`);
    if (!APPLY) {
      console.log('샘플:', updates.slice(0, 5).map((u) => `${u.name.slice(0, 16)}=${u.dailyUsage}`));
      console.log('DRY-RUN 종료. --apply 로 반영하세요.');
      return;
    }
    for (const u of updates) {
      await prisma.inventory.update({ where: { id: u.id }, data: { dailyUsage: u.dailyUsage } });
    }
    console.log(`완료: ${updated}건 일사용량 업데이트`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
