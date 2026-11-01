import { PrismaClient } from '@prisma/client';
import { loadEnv, kstToday, addDays, ymd } from './lib/env';
import { findExcelFiles, normName, parseSales } from './lib/excel';

loadEnv();

const CLEAN = process.argv.includes('--clean');
const APPLY = process.argv.includes('--apply');
const DEMO_DAYS = 31;
const TAG = '[DEMO]';

function argDate(): string {
  const found = process.argv.find((a) => a.startsWith('--date='));
  return found ? found.slice('--date='.length) : kstToday();
}

const prisma = new PrismaClient();

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jitter(text: string, min: number, max: number): number {
  const r = (hash(text) % 1000) / 1000;
  return min + (max - min) * r;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

async function cleanDemo() {
  const delivery = await prisma.delivery.deleteMany({
    where: { OR: [{ createdBy: 'DEMO' }, { deliveryNo: { startsWith: 'DEMO-' } }] },
  });
  const sales = await prisma.salesOrder.deleteMany({
    where: { OR: [{ createdBy: 'DEMO' }, { orderNo: { startsWith: 'DEMO-' } }] },
  });
  const work = await prisma.workOrder.deleteMany({
    where: { OR: [{ createdBy: 'DEMO' }, { workOrderNo: { startsWith: 'DEMO-' } }] },
  });
  const purchase = await prisma.purchaseOrder.deleteMany({
    where: { OR: [{ createdBy: 'DEMO' }, { orderNo: { startsWith: 'DEMO-' } }] },
  });
  const safety = await prisma.safetyStock.deleteMany({ where: { remark: { startsWith: TAG } } });
  const req = await prisma.materialRequirement.deleteMany({ where: { remark: { startsWith: TAG } } });
  const prices = await prisma.productPrice.deleteMany({ where: { remark: { contains: TAG } } });
  const expiry = await prisma.expiryDiscardMgmt.deleteMany({
    where: { remark: { startsWith: TAG } },
  });
  const inv = await prisma.inventory.updateMany({
    where: { remark: { startsWith: TAG } },
    data: { expiryDate: '', remark: '엑셀적재' },
  });

  await prisma.systemLog.create({
    data: {
      logDate: new Date().toISOString(),
      userId: 1,
      loginId: 'console',
      userName: 'console',
      action: '데모정리',
      menuId: 'dashboard',
      menuName: '대시보드',
      detail: `console 데모 정리: 납품 ${delivery.count}, 수주 ${sales.count}, 작업지시 ${work.count}, 발주 ${purchase.count}, 안전재고 ${safety.count}, 자재소요 ${req.count}, 단가 ${prices.count}, 재고복원 ${inv.count}`,
    },
  });

  console.log('데모 정리 완료');
  console.log(
    JSON.stringify({
      delivery: delivery.count,
      salesOrder: sales.count,
      workOrder: work.count,
      purchaseOrder: purchase.count,
      safetyStock: safety.count,
      materialRequirement: req.count,
      expiryDiscard: expiry.count,
      productPrice: prices.count,
      inventoryRestored: inv.count,
    })
  );
}

async function seedDemo() {
  const today = argDate();
  const files = findExcelFiles();
  const salesSource = parseSales(files.salesFile);

  const products = await prisma.product.findMany({
    select: { id: true, productCode: true, name: true, category: true, unit: true, partnerId: true, warehouse: true },
  });
  const productByNorm = new Map(products.map((p) => [normName(p.name), p]));

  const priceRows = await prisma.productPrice.findMany({
    select: { productId: true, deliveryPrice: true, purchasePrice: true, effectiveDate: true },
  });
  const latest: Record<number, { deliveryPrice: number; purchasePrice: number }> = {};
  for (const row of priceRows.sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))) {
    if (!latest[row.productId]) latest[row.productId] = { deliveryPrice: 0, purchasePrice: 0 };
    const slot = latest[row.productId];
    if (!slot.deliveryPrice && row.deliveryPrice > 0) slot.deliveryPrice = row.deliveryPrice;
    if (!slot.purchasePrice && row.purchasePrice > 0) slot.purchasePrice = row.purchasePrice;
  }

  // 완성품 단가 (없으면 중앙값)
  const deliveryPrices = products
    .filter((p) => p.category === '완성품')
    .map((p) => latest[p.id]?.deliveryPrice || 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const medianPrice =
    deliveryPrices.length > 0
      ? deliveryPrices[Math.floor(deliveryPrices.length / 2)]
      : 2200;

  const gyes = await prisma.gyeMaster.findMany({ where: { isUsed: true }, select: { id: true }, orderBy: { sortOrder: 'asc' } });
  const partners = await prisma.partner.findMany({ select: { id: true }, take: 1 });
  const fallbackPartnerId = partners[0]?.id;

  // 매출 품목 확정 (오늘 수량 = 엑셀 실제)
  const salesItems = salesSource.rows
    .map((row) => {
      const product = productByNorm.get(normName(row.name));
      if (!product) return null;
      const price = latest[product.id]?.deliveryPrice || medianPrice;
      return { product, price, qty1: row.qty1, qty2: row.qty2, total: row.total };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (salesItems.length === 0) {
    throw new Error('매출 품목을 찾지 못했습니다. 엑셀 적재를 먼저 실행하세요.');
  }

  const missingPrice = salesItems.filter((s) => !latest[s.product.id]?.deliveryPrice);
  const materials = products
    .filter((p) => p.category === '원재료' || p.category === '부자재')
    .map((p) => ({ ...p, price: latest[p.id]?.purchasePrice || 0 }))
    .filter((p) => p.price > 0);

  const todayTotal = salesItems.reduce((s, x) => s + x.total, 0);
  const todayAmount = salesItems.reduce((s, x) => s + x.total * x.price, 0);
  const totalPlanQty = salesItems.reduce((s, x) => s + x.total, 0) * DEMO_DAYS;

  console.log(`데모 생성 [${APPLY ? 'APPLY' : 'DRY-RUN'}] 기준일 ${today}`);
  console.log(
    `매출 품목 ${salesItems.length} · 오늘 수량 ${fmt(todayTotal)} · 추정 오늘 금액 ₩${fmt(todayAmount)} · 단가없음 ${missingPrice.length}`
  );
  console.log(`자재(단가보유) ${materials.length} · 계 ${gyes.length} · ${DEMO_DAYS}일 이력(약 ${fmt(totalPlanQty)}개)`);

  if (!APPLY) {
    console.log('DRY-RUN 종료. 실제 생성은 --apply 를 붙여 실행하세요.');
    return;
  }

  // ── 30일 매출 ──────────────────────────────────────
  let todayOrderId: number | null = null;
  let todayDetails: { productId: number; qty: number; price: number }[] = [];
  let woSeq = 0;
  const recentDays: Record<string, { details: { productId: number; qty: number; price: number }[]; orderId: number }> = {};
  const workOrderRows: {
    workOrderNo: string;
    workDate: string;
    shift: string;
    gyeId: string;
    productId: number;
    orderQty: number;
    prodQty: number;
    defectQty: number;
    workSeq: number;
    status: string;
    createdBy: string;
    remark: string;
  }[] = [];

  for (let d = DEMO_DAYS - 1; d >= 0; d--) {
    const date = addDays(today, -d);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일
    const weekdayFactor = weekday === 0 ? 0.86 : weekday === 6 ? 0.9 : weekday === 1 ? 1.04 : 1;
    const wave = 0.94 + 0.08 * Math.sin((DEMO_DAYS - d) * 0.7);

    const details = salesItems.map((item) => {
      const base = item.total;
      const qty =
        d === 0
          ? base
          : Math.max(1, Math.round(base * weekdayFactor * wave * jitter(`${item.product.productCode}|${date}`, 0.88, 1.12)));
      const qty1 = d === 0 ? item.qty1 : Math.round(qty * 0.56);
      const qty2 = d === 0 ? item.qty2 : qty - qty1;
      return { productId: item.product.id, qty: qty1 + qty2, qty1, qty2, price: item.price };
    });

    const totalQty = details.reduce((s, x) => s + x.qty, 0);
    const totalAmount = details.reduce((s, x) => s + x.qty * x.price, 0);

    const order = await prisma.salesOrder.create({
      data: {
        orderNo: `SO-${ymd(date)}-001`,
        orderDate: date,
        centerCode: 'GSR-001',
        shift: '전체',
        orderType: '정규',
        uploadMethod: '데모',
        status: '확정',
        totalAmount,
        totalQty,
        createdBy: 'DEMO',
        remark: '',
        details: {
          create: details.map((x) => ({
            productId: x.productId,
            orderQty1: x.qty1,
            orderQty2: x.qty2,
            totalQty: x.qty,
            unitPrice: x.price,
            amount: x.qty * x.price,
            remark: '',
          })),
        },
      },
    });

    for (const item of details) {
      woSeq += 1;
      const progress = d <= 1 ? jitter(`wo|${item.productId}|${date}`, 0.88, 1) : 1;
      const prodQty = Math.round(item.qty * progress);
      workOrderRows.push({
        workOrderNo: `WO-${ymd(date)}-${String(woSeq).padStart(4, '0')}`,
        workDate: date,
        shift: woSeq % 2 === 0 ? '2편' : '1편',
        gyeId: gyes[(woSeq - 1) % Math.max(1, gyes.length)]?.id || gyes[0]?.id || 'GFS001',
        productId: item.productId,
        orderQty: item.qty,
        prodQty,
        defectQty: 0,
        workSeq: woSeq,
        status: d <= 1 ? (progress >= 0.995 ? '완료' : '진행중') : '완료',
        createdBy: 'DEMO',
        remark: '',
      });
    }

    if (d <= 1) {
      recentDays[date] = {
        orderId: order.id,
        details: details.map((x) => ({ productId: x.productId, qty: x.qty, price: x.price })),
      };
    }
    if (d === 0) {
      todayOrderId = order.id;
      todayDetails = details.map((x) => ({ productId: x.productId, qty: x.qty, price: x.price }));
    }
  }
  console.log(`매출 ${DEMO_DAYS}일 생성 완료 · 기준일(${today}) ${fmt(todayTotal)}개`);

  // ── 납품 (오늘) ─────────────────────────────────────
  const deliveryData = [] as {
    deliveryNo: string;
    deliveryDate: string;
    status: string;
    totalQty: number;
    totalAmount: number;
    shift: string;
    salesOrderId: number;
  }[];
  for (const [date, day] of Object.entries(recentDays)) {
    let seq = 0;
    for (const item of day.details) {
      for (const shift of ['1편', '2편'] as const) {
        seq += 1;
        const qty = shift === '1편' ? Math.round(item.qty * 0.56) : item.qty - Math.round(item.qty * 0.56);
        deliveryData.push({
          deliveryNo: `DV-${ymd(date)}-${String(seq).padStart(3, '0')}`,
          deliveryDate: date,
          status: '완료',
          totalQty: qty,
          totalAmount: qty * item.price,
          shift,
          salesOrderId: day.orderId,
        });
      }
    }
    // 날짜별 대기 1건
    deliveryData[deliveryData.length - 1].status = '대기';
  }
  await prisma.delivery.createMany({
    data: deliveryData.map((d) => ({ ...d, centerCode: 'GSR-001', createdBy: 'DEMO', remark: '' })),
  });
  const done = deliveryData.filter((d) => d.status === '완료').length;
  console.log(`납품 ${deliveryData.length}건 생성 (완료 ${done}) · 달성률 ${((done / deliveryData.length) * 100).toFixed(1)}%`);

  // ── 작업지시 (전체 기간, 오늘은 진행중 포함) ──────────
  await prisma.workOrder.createMany({ data: workOrderRows });
  const todayWos = workOrderRows.filter((w) => w.workDate === today);
  const woTotal = todayWos.reduce((s, w) => s + w.orderQty, 0);
  const woDone = todayWos.reduce((s, w) => s + w.prodQty, 0);
  console.log(
    `작업지시 ${workOrderRows.length}건 생성 · 오늘 진척 ${((woDone / Math.max(1, woTotal)) * 100).toFixed(1)}%`
  );

  // ── 구매발주 (30일) ──────────────────────────────────
  const poMaterials = materials.slice(0, 48);
  let poCount = 0;
  if (poMaterials.length > 0) {
    for (let d = DEMO_DAYS - 1; d >= 0; d--) {
      const date = addDays(today, -d);
      const picks = [] as typeof poMaterials;
      for (let i = 0; i < 8; i++) {
        picks.push(poMaterials[(d * 5 + i * 7) % poMaterials.length]);
      }
      const details = picks.map((m) => {
        const qty = Math.round(jitter(`po|${m.id}|${date}`, 60, 280));
        return {
          productId: m.id,
          productCode: m.productCode,
          productName: m.name,
          category: m.category,
          unit: '봉',
          orderQty: qty,
          unitPrice: m.price,
          amount: qty * m.price,
          receivedQty: d === 0 ? 0 : qty,
          remainQty: d === 0 ? qty : 0,
        };
      });
      const totalAmount = details.reduce((s, x) => s + x.amount, 0);
      await prisma.purchaseOrder.create({
        data: {
          orderNo: `PO-${ymd(date)}-001`,
          orderDate: date,
          partnerId: poMaterials[0].partnerId || fallbackPartnerId || 'V001',
          partnerName: '',
          orderType: '정기',
          deliveryDate: addDays(date, 2),
          status: d === 0 ? '발주' : '입고완료',
          totalAmount,
          createdBy: 'DEMO',
          remark: '',
          details: { create: details },
        },
      });
      poCount += 1;
    }
  }
  console.log(`구매발주 ${poCount}건 생성`);

  // ── 안전재고 미달 8건 ─────────────────────────────────
  const snapshots = await prisma.gfsSnapshot.findMany({
    where: { stockDays: { not: null } },
    orderBy: { stockDays: 'asc' },
    take: 40,
  });
  const inventoryRows = await prisma.inventory.findMany({ select: { productId: true, currentQty: true, unit: true } });
  const invByProduct = new Map<number, number>();
  inventoryRows.forEach((r) => invByProduct.set(r.productId, (invByProduct.get(r.productId) || 0) + Number(r.currentQty)));

  const safetySnapshots = await prisma.gfsSnapshot.findMany({
    where: { stockDays: { gt: 0 } },
    select: { productName: true, stockDays: true },
  });
  const stockDaysByName = new Map(
    safetySnapshots.map((s) => [normName(s.productName), Number(s.stockDays) || 0])
  );
  const safetyCandidates = products
    .filter((p) => (p.category === '원재료' || p.category === '부자재') && (invByProduct.get(p.id) || 0) > 0)
    .map((product) => ({
      product,
      currentQty: invByProduct.get(product.id) || 0,
      stockDays: stockDaysByName.get(normName(product.name)) || 999,
    }))
    .sort((a, b) => a.stockDays - b.stockDays)
    .slice(0, 8);

  if (safetyCandidates.length > 0) {
    await prisma.safetyStock.createMany({
      data: safetyCandidates.map((c, idx) => {
        const currentQty = c.currentQty;
        const safetyQty = Math.round(currentQty * 1.35 + 10 + (idx % 4) * 8);
        const shortageQty = Math.max(1, Math.round(safetyQty - currentQty));
        return {
          productId: c.product.id,
          productCode: c.product.productCode,
          productName: c.product.name,
          category: c.product.category,
          unit: '봉',
          safetyQty,
          currentQty,
          shortageQty,
          avgDailyUsage:
            c.stockDays > 0 && c.stockDays < 900
              ? Math.round((currentQty / c.stockDays) * 10) / 10
              : Math.round(currentQty * 0.15 * 10) / 10,
          leadTime: 2 + (idx % 3),
          remark: `${TAG}안전재고 미달`,
        };
      }),
    });
  }
  console.log(`안전재고 미달 ${safetyCandidates.length}건 생성`);

  // ── 자재소요 부족 12건 ────────────────────────────────
  const parentProduct = products.find((p) => p.category === '완성품');
  const reqMaterials = materials.slice(0, 12);
  if (parentProduct && reqMaterials.length > 0) {
    await prisma.materialRequirement.createMany({
      data: reqMaterials.map((m, i) => {
        const requiredQty = Math.round(jitter(`mr|${m.id}`, 20, 120));
        const currentStock = Math.round(jitter(`ms|${m.id}`, 0, 30));
        return {
          reqDate: today,
          shift: i % 2 === 0 ? '1편' : '2편',
          productCode: parentProduct.productCode,
          productName: parentProduct.name,
          materialCode: m.productCode,
          materialName: m.name,
          category: m.category,
          requiredQty,
          unit: '봉',
          partnerId: m.partnerId || null,
          partnerName: '',
          currentStock,
          shortageQty: Math.max(1, requiredQty - currentStock),
          status: '미확정',
          remark: `${TAG}자재소요`,
        };
      }),
    });
  }
  console.log(`자재소요 부족 ${reqMaterials.length}건 생성`);

  // ── 미출 3건 ────────────────────────────────────────
  const undelivered = salesItems.slice(0, 3);
  for (let i = 0; i < undelivered.length; i++) {
    const item = undelivered[i];
    const qty = Math.max(100, Math.round(item.total * 0.5));
    await prisma.salesOrder.create({
      data: {
        orderNo: `SO-${ymd(addDays(today, -3))}-${String(901 + i)}`,
        orderDate: addDays(today, -3),
        centerCode: 'GSR-001',
        shift: i % 2 === 0 ? '1편' : '2편',
        orderType: '추가',
        uploadMethod: '데모',
        status: '미출',
        totalAmount: qty * item.price,
        totalQty: qty,
        createdBy: 'DEMO',
        remark: '',
        details: {
          create: [
            {
              productId: item.product.id,
              orderQty1: i % 2 === 0 ? qty : 0,
              orderQty2: i % 2 === 0 ? 0 : qty,
              totalQty: qty,
              unitPrice: item.price,
              amount: qty * item.price,
              remark: '',
            },
          ],
        },
      },
    });
  }
  console.log(`미출 ${undelivered.length}건 생성`);

  // ── 유통기한 임박 6건 ─────────────────────────────────
  const expiryRows = await prisma.inventory.findMany({
    where: { currentQty: { gt: 0 }, category: '원재료' },
    orderBy: { stockAmount: 'desc' },
    take: 40,
    select: {
      id: true,
      productCode: true,
      productName: true,
      warehouse: true,
      currentQty: true,
      unit: true,
    },
  });
  const picked: typeof expiryRows = [];
  const prefer = ['냉장1', '냉장2', '냉동'];
  for (const w of prefer) {
    for (const row of expiryRows) {
      if (picked.length >= 6) break;
      if (row.warehouse === w && !picked.includes(row)) picked.push(row);
    }
  }
  for (const row of expiryRows) {
    if (picked.length >= 6) break;
    if (!picked.includes(row)) picked.push(row);
  }
  for (let i = 0; i < picked.length; i++) {
    const days = i - 2; // D-2 ~ D+3
    await prisma.inventory.update({
      where: { id: picked[i].id },
      data: { expiryDate: addDays(today, days), remark: `${TAG}FEFO(D${days >= 0 ? '+' : ''}${days})` },
    });
  }
  if (picked.length > 0) {
    await prisma.expiryDiscardMgmt.createMany({
      data: picked.map((row, i) => ({
        checkDate: today,
        productCode: row.productCode,
        productName: row.productName,
        lotNo: '',
        expiryDate: addDays(today, i - 2),
        daysRemaining: i - 2,
        warehouse: row.warehouse,
        currentQty: Number(row.currentQty) || 0,
        unit: row.unit || '봉',
        action: '유통기한 임박',
        status: '점검',
        remark: `${TAG}FEFO`,
      })),
    });
  }
  console.log(`유통기한 임박 ${picked.length}건 설정 (폐기관리 화면 반영)`);

  await prisma.systemLog.create({
    data: {
      logDate: new Date().toISOString(),
      userId: 1,
      loginId: 'console',
      userName: 'console',
      action: '데모데이터생성',
      menuId: 'dashboard',
      menuName: '대시보드',
      detail: `console 데모 생성: 매출 ${DEMO_DAYS}일 ${salesItems.length}품목, 납품 ${deliveryData.length}, 작업지시 ${woSeq}, 구매발주 ${poCount}, 안전재고 ${safetyCandidates.length}, 자재소요 ${reqMaterials.length}, 미출 ${undelivered.length}`,
    },
  });

  console.log('\n데모 데이터 생성 완료.');
}

async function main() {
  try {
    if (CLEAN) {
      await cleanDemo();
      return;
    }
    await seedDemo();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('데모 생성 실패:', error);
  process.exit(1);
});
