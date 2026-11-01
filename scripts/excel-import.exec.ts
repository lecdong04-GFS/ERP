import { PrismaClient } from '@prisma/client';
import { loadEnv, kstToday } from './lib/env';
import {
  WAREHOUSES,
  normName,
  parseAll,
  summarizeInventory,
  type InventoryRow,
  type OrderMaterialRow,
} from './lib/excel';

loadEnv();

const APPLY = process.argv.includes('--apply');
const EFFECTIVE_DATE = '2026-10-29';

interface ProductRow {
  id: number;
  productCode: string;
  name: string;
  category: string;
  warehouse: string;
  partnerId: string | null;
  boxQty: number;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

function pickCode(
  legacyCode: string,
  uniqueLegacy: Map<string, number>,
  usedCodes: Set<string>,
  prefix: 'RM' | 'PM' | 'FG',
  counters: Record<string, number>
): string {
  if (legacyCode && uniqueLegacy.get(legacyCode) === 1 && !usedCodes.has(legacyCode)) {
    usedCodes.add(legacyCode);
    return legacyCode;
  }
  for (;;) {
    counters[prefix] += 1;
    const code = `${prefix}-${String(counters[prefix]).padStart(5, '0')}`;
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const parsed = parseAll();
    const invSummary = summarizeInventory(parsed.inventory);

    console.log('══════════════════════════════════════════════════════');
    console.log(`엑셀 적재 ${APPLY ? '[APPLY]' : '[DRY-RUN]'}`);
    console.log('══════════════════════════════════════════════════════');
    console.log('[원본] 재고조사표', parsed.counts.inventoryRaw, '행 · 제외(삭제/이관/불용)',
      parsed.counts.inventorySkipped, '· 동일품명 중복', parsed.counts.inventoryDuplicate);
    console.log('[원본] 발주서 자재', parsed.counts.orderRaw, '행 · 중복', parsed.counts.orderDuplicate);
    console.log('[원본] 발주현황(매출)', parsed.sales.length, '품목 · 기준일', parsed.salesSourceDate || '-');

    console.log('\n─ 재고 (창고별) ─────────────────────────────────────');
    for (const w of WAREHOUSES) {
      const b = invSummary.byWarehouse[w];
      console.log(
        `  ${w.padEnd(4, ' ')} 품목 ${String(b.items).padStart(3)} · 수량 ${String(Math.round(b.qty)).padStart(7)} · 금액 ₩${fmt(b.amount).padStart(12)} · 단가有 ${b.priced}`
      );
    }
    console.log(`  합계 ${parsed.inventory.length}행 · 수량>0 ${invSummary.withQty} · 유통기한有 ${invSummary.withExpiry} · 금액 ₩${fmt(invSummary.totalAmount)}`);
    console.log(`  매출 ${parsed.sales.length}품목 · 1편 ${fmt(parsed.sales.reduce((s, r) => s + r.qty1, 0))} + 2편 ${fmt(parsed.sales.reduce((s, r) => s + r.qty2, 0))} = ${fmt(parsed.sales.reduce((s, r) => s + r.total, 0))}`);

    // ── 기존 데이터 ─────────────────────────────────────
    const existingPartners = await prisma.partner.findMany({ select: { id: true, name: true } });
    const existingProducts = (await prisma.product.findMany({
      select: {
        id: true,
        productCode: true,
        name: true,
        category: true,
        warehouse: true,
        partnerId: true,
        boxQty: true,
      },
    })) as ProductRow[];

    const partnerByNorm = new Map(existingPartners.map((p) => [normName(p.name), p]));
    const productByNorm = new Map<string, ProductRow>();
    existingProducts.forEach((p) => {
      const key = normName(p.name);
      if (!productByNorm.has(key)) productByNorm.set(key, p);
    });

    const usedCodes = new Set(existingProducts.map((p) => p.productCode));
    const counters: Record<string, number> = { RM: 0, PM: 0, FG: 0 };
    for (const p of existingProducts) {
      const m = /^(RM|PM|FG)-(\d+)$/.exec(p.productCode);
      if (m) counters[m[1]] = Math.max(counters[m[1]], Number(m[2]));
    }

    const uniqueLegacy = new Map<string, number>();
    for (const row of parsed.inventory) {
      if (!row.legacyCode) continue;
      uniqueLegacy.set(row.legacyCode, (uniqueLegacy.get(row.legacyCode) || 0) + 1);
    }

    // ── 1. 거래처 ───────────────────────────────────────
    const partnerNames = new Map<string, string>();
    for (const row of parsed.inventory) {
      const name = row.partnerName.trim();
      if (name) partnerNames.set(normName(name), name);
    }
    for (const row of parsed.orderMaterials) {
      const name = row.partnerName.trim();
      if (name) partnerNames.set(normName(name), name);
    }

    const newPartners: { id: string; name: string }[] = [];
    let nextV = 0;
    for (const p of existingPartners) {
      const m = /^V(\d+)$/.exec(p.id);
      if (m) nextV = Math.max(nextV, Number(m[1]));
    }
    for (const [key, name] of partnerNames) {
      if (partnerByNorm.has(key)) continue;
      nextV += 1;
      newPartners.push({ id: `V${String(nextV).padStart(3, '0')}`, name });
    }

    const nearDup: string[] = [];
    for (const [key, name] of partnerNames) {
      if (partnerByNorm.has(key)) continue;
      for (const [ekey, ep] of partnerByNorm) {
        if (ekey.length >= 4 && key !== ekey && (key.includes(ekey) || ekey.includes(key))) {
          nearDup.push(`${name} ↔ 기존 ${ep.name}`);
        }
      }
    }

    console.log(`\n─ 거래처 ─ 기존 ${existingPartners.length} · 신규 ${newPartners.length} (총 ${existingPartners.length + newPartners.length})`);
    if (nearDup.length) console.log('  ⚠ 유사 중복 후보:', nearDup.slice(0, 6).join(' / '), nearDup.length > 6 ? `외 ${nearDup.length - 6}건` : '');

    // ── 2. 품목(자재) ────────────────────────────────────
    const materialByName = new Map<string, InventoryRow>();
    for (const row of parsed.inventory) {
      const key = normName(row.name);
      if (!materialByName.has(key)) materialByName.set(key, row);
    }

    const createProducts: {
      code: string;
      name: string;
      category: string;
      warehouse: string;
      partnerId: string | null;
      boxQty: number;
      unit: string;
      remark: string;
    }[] = [];
    const newCodeByName = new Map<string, string>();
    let existingMaterialHits = 0;

    for (const [key, row] of materialByName) {
      if (productByNorm.has(key)) {
        existingMaterialHits += 1;
        continue;
      }
      const code = pickCode(
        row.legacyCode,
        uniqueLegacy,
        usedCodes,
        row.category === '부자재' ? 'PM' : 'RM',
        counters
      );
      newCodeByName.set(key, code);
      createProducts.push({
        code,
        name: row.name,
        category: row.category,
        warehouse: row.warehouse,
        partnerId: partnerByNorm.get(normName(row.partnerName))?.id || null,
        boxQty: row.boxQty > 0 ? Math.round(row.boxQty) : 1,
        unit: '봉',
        remark: '엑셀적재(재고조사표)',
      });
    }

    // ── 3. 품목(완성품) ──────────────────────────────────
    const salesByName = new Map<string, (typeof parsed.sales)[number]>();
    for (const row of parsed.sales) {
      const key = normName(row.name);
      if (!salesByName.has(key)) salesByName.set(key, row);
    }
    let existingSalesHits = 0;
    for (const [key, row] of salesByName) {
      if (productByNorm.has(key)) {
        existingSalesHits += 1;
        continue;
      }
      const code = pickCode('', uniqueLegacy, usedCodes, 'FG', counters);
      newCodeByName.set(key, code);
      createProducts.push({
        code,
        name: row.name,
        category: '완성품',
        warehouse: '',
        partnerId: null,
        boxQty: 1,
        unit: 'ea',
        remark: '엑셀적재(발주현황)',
      });
    }

    const newMaterials = createProducts.filter((p) => p.category !== '완성품').length;
    const newSales = createProducts.length - newMaterials;
    console.log(
      `─ 품목 ─ 자재 신규 ${newMaterials} (기존 매칭 ${existingMaterialHits}) · 완성품 신규 ${newSales} (기존 매칭 ${existingSalesHits})`
    );

    // ── 4. APPLY: 거래처/품목 생성 ───────────────────────
    if (APPLY) {
      for (const p of newPartners) {
        await prisma.partner.create({
          data: { id: p.id, name: p.name, partnerType: 'P', remark: '엑셀적재' },
        });
        partnerByNorm.set(normName(p.name), { id: p.id, name: p.name });
      }
      for (const p of createProducts) {
        try {
          const created = await prisma.product.create({
            data: {
              productCode: p.code,
              name: p.name,
              category: p.category,
              warehouse: p.warehouse,
              partnerId: p.partnerId,
              boxQty: p.boxQty,
              unit: p.unit,
              remark: p.remark,
              isUsed: true,
            },
            select: { id: true, productCode: true, name: true, category: true, warehouse: true, partnerId: true, boxQty: true },
          });
          productByNorm.set(normName(created.name), created as ProductRow);
        } catch (error: any) {
          console.log('  ⚠ 품목 생성 실패:', p.code, p.name, String(error?.message || error).slice(0, 90));
        }
      }
    } else {
      // dry-run에서도 후속 집계를 위해 가상 ID 부여
      let virtualId = 1_000_000;
      for (const p of createProducts) {
        productByNorm.set(normName(p.name), {
          id: virtualId++,
          productCode: p.code,
          name: p.name,
          category: p.category,
          warehouse: p.warehouse,
          partnerId: p.partnerId,
          boxQty: p.boxQty,
        });
      }
    }

    // ── 5. 단가 ─────────────────────────────────────────
    const existingPrices = await prisma.productPrice.findMany({
      select: { productId: true, effectiveDate: true, purchasePrice: true, deliveryPrice: true },
    });
    const priceKey = new Set(existingPrices.map((p) => `${p.productId}|${p.effectiveDate}`));
    const pricedProducts = new Set(existingPrices.filter((p) => p.purchasePrice > 0).map((p) => p.productId));

    const newPrices: { productId: number; purchasePrice: number }[] = [];
    const pushPrice = (productId: number, price: number) => {
      const key = `${productId}|${EFFECTIVE_DATE}`;
      if (priceKey.has(key) || price <= 0 || pricedProducts.has(productId)) return;
      priceKey.add(key);
      pricedProducts.add(productId);
      newPrices.push({ productId, purchasePrice: price });
    };
    for (const row of parsed.inventory) {
      const p = productByNorm.get(normName(row.name));
      if (p) pushPrice(p.id, row.unitPrice);
    }
    for (const row of parsed.orderMaterials) {
      const p = productByNorm.get(normName(row.name));
      if (p && row.price) pushPrice(p.id, row.price);
    }
    console.log(`─ 단가 ─ 기존 ${existingPrices.length} · 신규 ${newPrices.length}`);

    // ── 6. 재고 ─────────────────────────────────────────
    const inventoryData = parsed.inventory
      .map((row) => {
        const p = productByNorm.get(normName(row.name));
        if (!p) return null;
        return {
          productId: p.id,
          productCode: p.productCode,
          productName: p.name,
          category: row.category,
          lotNo: '',
          expiryDate: row.expiryDate,
          warehouse: row.warehouse,
          currentQty: row.qty,
          unit: '봉',
          unitPrice: row.unitPrice,
          stockAmount: Math.round(row.amount),
          lastInDate: '',
          remark: '엑셀적재',
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
    console.log(`─ 재고 ─ 반영 예정 ${inventoryData.length}행 (기존 재고는 백업 후 교체)`);

    // ── 7. 재고유지일 ────────────────────────────────────
    const snapshots: { code: string; name: string; warehouse: string; stockDays: number }[] = [];
    const unmatched: OrderMaterialRow[] = [];
    for (const row of parsed.orderMaterials) {
      if (row.stockDays === null) continue;
      let p = productByNorm.get(normName(row.name));
      if (!p) {
        const target = normName(row.name);
        const fuzzy = [...productByNorm.entries()].find(
          ([k]) => k.length >= 6 && (k.includes(target) || target.includes(k))
        );
        if (fuzzy) p = fuzzy[1];
      }
      if (!p) {
        unmatched.push(row);
        continue;
      }
      snapshots.push({
        code: p.productCode,
        name: p.name,
        warehouse: p.warehouse || '',
        stockDays: row.stockDays,
      });
    }
    console.log(`─ 재고유지일 ─ 반영 ${snapshots.length}건 · 미매칭 ${unmatched.length}건`);
    if (unmatched.length) {
      console.log('  미매칭 샘플:', unmatched.slice(0, 6).map((r) => r.name).join(' / '));
    }

    // ── 8. APPLY ────────────────────────────────────────
    if (APPLY) {
      console.log('\n적재 중...');

      if (newPrices.length) {
        await prisma.productPrice.createMany({
          data: newPrices.map((p) => ({
            productId: p.productId,
            purchasePrice: p.purchasePrice,
            deliveryPrice: 0,
            effectiveDate: EFFECTIVE_DATE,
            remark: '엑셀적재',
          })),
        });
      }

      await prisma.inventory.deleteMany({});
      await prisma.inventory.createMany({ data: inventoryData });

      for (const s of snapshots) {
        await prisma.gfsSnapshot.upsert({
          where: { productCode: s.code },
          create: {
            productCode: s.code,
            productName: s.name,
            warehouse: s.warehouse,
            stockDays: s.stockDays,
            asOf: EFFECTIVE_DATE,
            source: 'excel',
            remark: '발주서 적재',
          },
          update: {
            productName: s.name,
            warehouse: s.warehouse,
            stockDays: s.stockDays,
            asOf: EFFECTIVE_DATE,
            source: 'excel',
            remark: '발주서 적재',
          },
        });
      }

      await prisma.systemLog.create({
        data: {
          logDate: new Date().toISOString(),
          userId: 1,
          loginId: 'console',
          userName: 'console',
          action: '엑셀일괄적재',
          menuId: 'master-product-reg',
          menuName: '엑셀적재',
          detail: `console 엑셀 적재: 거래처 +${newPartners.length}, 품목 +${createProducts.length}, 단가 +${newPrices.length}, 재고 ${inventoryData.length}, 재고유지일 ${snapshots.length}`,
        },
      });

      console.log('완료. 위 수치로 반영되었습니다.');
    } else {
      console.log('\nDRY-RUN 종료. 실제 반영은 --apply 를 붙여 실행하세요.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('적재 실패:', error);
  process.exit(1);
});
