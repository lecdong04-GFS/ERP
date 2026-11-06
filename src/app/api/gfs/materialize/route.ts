import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildAuditMap, getAuditFilePath, normName, readWorkbookFromFile } from '@/lib/gfs/canonical';
import { kstToday } from '@/lib/kst';

interface InItem {
  name: string;
  boxes?: number;
  packUnit?: number;
  bagPrice?: number;
  boxPrice?: number;
  totalAmount?: number;
  supplierHeader?: string;
  safetyStock?: number;
  stockDays?: number | null; // GFS 버팀일 (calc.stockDays 그대로)
}

// POST /api/gfs/materialize
// GFS 품명을 ERP 정본(재고조사표)과 대조 → 없으면 자동 생성 → 발주 가능한 형태로 반환
// body: { items: InItem[], dryRun?: boolean, orderDate?: string }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const me = (session?.user as any) || { id: 1, loginId: 'admin', name: '관리자' };
    const body = await req.json();
    const { items, dryRun, orderDate } = body as { items: InItem[]; dryRun?: boolean; orderDate?: string };
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'items가 비어 있습니다.' }, { status: 400 });
    }
    const today = (orderDate || kstToday()).replace(/-/g, '');

    // 정본 로드 (서버 커밋 파일 — 날짜 바뀌어도 자동 추적)
    let auditMap = new Map();
    try {
      const auditPath = getAuditFilePath();
      if (auditPath) {
        const wb = readWorkbookFromFile(auditPath);
        auditMap = buildAuditMap(wb);
      }
    } catch {}

    const matched: any[] = [];
    const created: any[] = [];
    const failed: any[] = [];

    // 기존 품목 일괄 조회 (이름 기준) — 요청당 1회
    const names = items.map((i) => String(i.name || '').trim()).filter(Boolean);
    const existing = await prisma.product.findMany({
      where: { name: { in: names } },
      include: { partner: true },
    });
    const existingByName = new Map(existing.map((p) => [p.name, p]));
    const existingByNorm = new Map<string, any>();
    existing.forEach((p) => existingByNorm.set(normName(p.name), p));

    // ── Phase A: 항목별 사전 계산 (DB 접근 없음) ──
    interface Prepared {
      idx: number;
      rawName: string;
      norm: string;
      boxes: number;
      ref: any;
      packUnit: number;
      bagPrice: number;
      boxPrice: number;
      totalAmount: number;
      safetyStock: number;
      stockDays: number | null;
      vendorName: string;
      cleanVendor: string;
      category: string;
      warehouse: string;
      existing: any | null;
    }
    const prepared: Prepared[] = [];
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const rawName = String(it.name || '').trim();
      if (!rawName) {
        failed.push({ name: rawName, reason: '품명 없음' });
        continue;
      }
      const boxes = Number(it.boxes) || 0;
      if (boxes <= 0) continue; // 발주수량 0은 스킵
      const norm = normName(rawName);
      const ref: any = (auditMap as Map<string, any>).get(norm);
      const vendorName = (ref?.vendor || it.supplierHeader || '').trim();
      const packUnit = Number(it.packUnit) || Number(ref?.packUnit) || 1;
      const bagPrice = Number(it.bagPrice) || Number(ref?.bagPrice) || 0;
      const boxPrice = Number(it.boxPrice) || bagPrice * packUnit;
      const totalAmount = Number(it.totalAmount) || boxes * boxPrice;

      prepared.push({
        idx,
        rawName,
        norm,
        boxes,
        ref,
        packUnit,
        bagPrice,
        boxPrice,
        totalAmount,
        safetyStock: Math.max(0, Math.round(Number(it.safetyStock) || 0)),
        stockDays: it.stockDays != null && !isNaN(Number(it.stockDays)) ? Number(it.stockDays) : null,
        vendorName,
        cleanVendor: vendorName.split('(')[0].trim(),
        category: ref?.warehouse === '부자재' ? '부자재' : '원재료',
        warehouse:
          ref?.warehouse ||
          (/냉동/.test(rawName) ? '냉동' : /상온/.test(rawName) ? '상온' : /냉장/.test(rawName) ? '냉장1' : '상온'),
        existing: existingByName.get(rawName) || existingByNorm.get(norm) || null,
      });
    }

    const createdByNorm = new Map<string, any>();
    if (!dryRun) {
      // 동일 품명(norm) 중복은 1건만 생성, 나머지는 같은 품목에 매칭
      const seenNorm = new Set<string>();
      const toCreate = prepared.filter((p) => {
        if (p.existing) return false;
        if (seenNorm.has(p.norm)) return false;
        seenNorm.add(p.norm);
        return true;
      });

      if (toCreate.length > 0) {
        // ── Phase B-1: 거래처 일괄 확보 (조회 1회 + 생성 1회) ──
        const vendorNames = [...new Set(toCreate.map((p) => p.cleanVendor).filter(Boolean))];
        const foundPartners = vendorNames.length
          ? await prisma.partner.findMany({ where: { name: { in: vendorNames } } })
          : [];
        const partnerByName = new Map(foundPartners.map((p) => [p.name, p]));
        const missingVendors = vendorNames.filter((v) => !partnerByName.has(v));
        if (missingVendors.length > 0) {
          const stamp = Date.now().toString().slice(-6);
          const newIds = missingVendors.map((_, i) => `VG-${stamp}-${String(i).padStart(2, '0')}`);
          const takenIds = new Set(
            (await prisma.partner.findMany({ where: { id: { in: newIds } }, select: { id: true } })).map((p) => p.id)
          );
          const finalIds = newIds.map((id, i) => (takenIds.has(id) ? `${id}-X${i}` : id));
          await prisma.partner.createMany({
            data: missingVendors.map((v, i) => ({ id: finalIds[i], name: v, partnerType: 'P', remark: 'GFS 자동생성(재고조사표 정본)' })),
          });
          (await prisma.partner.findMany({ where: { id: { in: finalIds } } })).forEach((p) => {
            partnerByName.set(p.name, p);
            created.push({ type: 'partner', id: p.id, name: p.name });
          });
        }

        // ── Phase B-2: 품번 일괄 확정 (조회 1~2회, 충돌은 메모리에서 해소) ──
        let seq = 0;
        const codeByNorm = new Map<string, string>();
        for (const p of toCreate) {
          seq += 1;
          const base =
            p.ref?.itemId && String(p.ref.itemId).trim()
              ? String(p.ref.itemId).trim()
              : `GFS-${today}-${String(seq).padStart(3, '0')}`;
          codeByNorm.set(p.norm, base);
        }
        const taken = new Set<string>();
        const collideCheck = [...new Set(codeByNorm.values())];
        if (collideCheck.length > 0) {
          const existingCodes = new Set(
            (await prisma.product.findMany({ where: { productCode: { in: collideCheck } }, select: { productCode: true } })).map(
              (p) => p.productCode
            )
          );
          for (const [normKey, base] of codeByNorm) {
            let code = base;
            if (taken.has(code) || existingCodes.has(code)) {
              let n = 1;
              code = `${base}-${n}`;
              while ((taken.has(code) || existingCodes.has(code)) && n < 50) {
                n += 1;
                code = `${base}-${n}`;
              }
            }
            taken.add(code);
            codeByNorm.set(normKey, code);
          }
        }

        // ── Phase B-3: 품목 일괄 생성 (1회) → ID 회수 (1회) ──
        const createData = toCreate.map((p) => ({
          productCode: codeByNorm.get(p.norm)!,
          name: p.rawName,
          spec: '',
          unit: 'box',
          category: p.category,
          kind: '',
          boxQty: p.packUnit,
          warehouse: p.warehouse,
          safetyStockQty: p.safetyStock,
          partnerId: p.cleanVendor ? (partnerByName.get(p.cleanVendor)?.id as string) ?? null : null,
          remark: 'GFS 자동생성(재고조사표 정본, 확인필요)',
        }));
        await prisma.product.createMany({ data: createData });
        const createdProducts = await prisma.product.findMany({
          where: { productCode: { in: createData.map((d) => d.productCode) } },
          include: { partner: true },
        });
        const createdByCode = new Map(createdProducts.map((p) => [p.productCode, p]));
        for (const p of toCreate) {
          const prod = createdByCode.get(codeByNorm.get(p.norm)!);
          if (prod) {
            createdByNorm.set(p.norm, prod);
            created.push({
              type: 'product',
              productCode: prod.productCode,
              name: prod.name,
              warehouse: p.warehouse,
              partner: p.cleanVendor ? partnerByName.get(p.cleanVendor)?.name || '' : '',
            });
          }
        }

        // ── Phase B-4: 단가 일괄 생성 (1회, 있는 것만) ──
        const priceRows = toCreate
          .filter((p) => p.bagPrice > 0 && createdByNorm.has(p.norm))
          .map((p) => ({
            productId: (createdByNorm.get(p.norm) as any).id as number,
            purchasePrice: p.bagPrice,
            deliveryPrice: 0,
            effectiveDate: kstToday(),
            remark: 'GFS 자동생성 단가(봉단가)',
          }));
        if (priceRows.length > 0) {
          await prisma.productPrice.createMany({ data: priceRows });
        }

        // 같은 norm 중복 항목도 생성된 품목에 매칭
        for (const p of prepared) {
          if (!p.existing && createdByNorm.has(p.norm)) {
            (p as any).existing = createdByNorm.get(p.norm);
          }
        }
      }

      // ── Phase B-5: 기존 품목 안전재고 일괄 보충 (값별 updateMany, 수기값 유지) ──
      const safetyGroups = new Map<number, number[]>();
      for (const p of prepared) {
        const prod = p.existing as any;
        if (!prod?.id || createdByNorm.has(p.norm)) continue; // 신규 생성분은 이미 반영됨
        if (p.safetyStock > 0 && !(Number(prod.safetyStockQty) > 0)) {
          if (!safetyGroups.has(p.safetyStock)) safetyGroups.set(p.safetyStock, []);
          safetyGroups.get(p.safetyStock)!.push(prod.id);
        }
      }
      for (const [val, ids] of safetyGroups) {
        await prisma.product.updateMany({ where: { id: { in: ids }, safetyStockQty: { lte: 0 } }, data: { safetyStockQty: val } });
      }
    }
    // ── Phase C: 응답용 matched 조립 (원본 순서 유지) ──
    for (const p of prepared) {
      const product = (p as any).existing as any;
      if (!product) {
        if (dryRun) {
          matched.push({
            name: p.rawName,
            boxes: p.boxes,
            status: '신규예정',
            warehouse: p.ref?.warehouse || '',
            vendor: p.ref?.vendor || p.vendorName,
            bagPrice: p.bagPrice,
            packUnit: p.packUnit,
            gfsDays: p.stockDays,
          });
        } else {
          failed.push({ name: p.rawName, reason: '생성 실패' });
        }
        continue;
      }
      const wasCreated = createdByNorm.has(p.norm);
      // GFS 원본 입수를 최우선 (ERP 기본값 boxQty=1에 의한 단가 왜곡 방지)
      const packUnit = (p.packUnit && p.packUnit > 0)
        ? p.packUnit
        : (Number(product.boxQty) > 0 ? Number(product.boxQty) : Number(p.ref?.packUnit) || 1);
      const boxPrice = p.boxPrice > 0 ? p.boxPrice : p.bagPrice * packUnit;
      const totalAmount = p.totalAmount > 0 ? p.totalAmount : p.boxes * boxPrice;
      const partner = (product as any).partner;
      matched.push({
        productCode: product.productCode,
        productName: product.name,
        orderQty: p.boxes,
        unit: 'box',
        packUnit,
        bagPrice: p.bagPrice,
        boxPrice,
        totalAmount,
        partnerId: (product as any).partnerId ?? null,
        partnerName: partner?.name || '',
        warehouse: product.warehouse,
        created: wasCreated,
        gfsDays: p.stockDays,
      });
    }

    if (!dryRun) {
      await prisma.systemLog
        .create({
          data: {
            logDate: new Date().toISOString(),
            userId: Number(me.id) || undefined,
            loginId: String(me.loginId || ''),
            userName: String(me.name || ''),
            action: '자재마스터동기화',
            menuId: 'pur-mat-order-day',
            menuName: '자재발주(요일별)',
            detail: `${me.name || me.loginId} materialize: 매칭 ${matched.length}건, 신규 ${created.filter((c) => c.type === 'product').length}건`,
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: { matched, created, failed },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'materialize 실패' },
      { status: 500 }
    );
  }
}