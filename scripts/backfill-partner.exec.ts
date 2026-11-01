import { PrismaClient } from '@prisma/client';
import { loadEnv } from './lib/env';
import { normName, parseAll } from './lib/excel';

loadEnv();
const APPLY = process.argv.includes('--apply');

async function main() {
  const prisma = new PrismaClient();
  try {
    const parsed = parseAll();
    const partners = await prisma.partner.findMany({ select: { id: true, name: true } });
    const products = await prisma.product.findMany({
      select: { id: true, name: true, partnerId: true, category: true },
    });
    const partnerByNorm = new Map(partners.map((p) => [normName(p.name), p]));
    const productByNorm = new Map(products.map((p) => [normName(p.name), p]));

    const partnerNameByProduct = new Map<string, string>();
    for (const row of parsed.inventory) {
      const key = normName(row.name);
      if (!partnerNameByProduct.has(key)) partnerNameByProduct.set(key, row.partnerName);
    }

    let matched = 0;
    let updated = 0;
    let missingPartner = 0;
    const updates: { id: number; partnerId: string; name: string }[] = [];
    for (const [key, partnerName] of partnerNameByProduct) {
      const product = productByNorm.get(key);
      if (!product) continue;
      const partner = partnerByNorm.get(normName(partnerName));
      if (!partner) {
        missingPartner += 1;
        continue;
      }
      matched += 1;
      if (product.partnerId !== partner.id) {
        updated += 1;
        updates.push({ id: product.id, partnerId: partner.id, name: product.name });
      }
    }

    console.log(`[${APPLY ? 'APPLY' : 'DRY-RUN'}] 매칭 ${matched} · 변경 ${updated} · 거래처 미매칭 ${missingPartner}`);
    if (!APPLY) {
      console.log('샘플:', updates.slice(0, 5).map((u) => u.name));
      console.log('DRY-RUN 종료. --apply 로 반영하세요.');
      return;
    }
    for (const u of updates) {
      await prisma.product.update({ where: { id: u.id }, data: { partnerId: u.partnerId } });
    }
    await prisma.systemLog.create({
      data: {
        logDate: new Date().toISOString(),
        userId: 1,
        loginId: 'console',
        userName: 'console',
        action: '거래처백필',
        menuId: 'master-product-reg',
        menuName: '제품등록',
        detail: `console 거래처 연결 백필: ${updated}개 품목`,
      },
    });
    console.log(`완료: ${updated}개 상품 거래처 연결`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
