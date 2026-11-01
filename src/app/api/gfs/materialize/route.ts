import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildAuditMap, normName } from '@/lib/gfs/canonical';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { kstToday } from '@/lib/kst';

interface InItem {
  name: string;
  boxes?: number;
  packUnit?: number;
  bagPrice?: number;
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
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const me = session.user as any;
    const body = await req.json();
    const { items, dryRun, orderDate } = body as { items: InItem[]; dryRun?: boolean; orderDate?: string };
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'items가 비어 있습니다.' }, { status: 400 });
    }
    const today = (orderDate || kstToday()).replace(/-/g, '');

    // 정본 로드 (서버 커밋 파일)
    const candidates = [
      `${process.cwd()}/일일 재고조사표 새 양식(10월 29일) (2).xlsx`,
      '/Users/bunker/GFS/일일 재고조사표 새 양식(10월 29일) (2).xlsx',
    ];
    let auditMap = new Map();
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          const wb = XLSX.readFile(c);
          auditMap = buildAuditMap(wb);
          break;
        }
      } catch {}
    }

    const matched: any[] = [];
    const created: any[] = [];
    const failed: any[] = [];

    // 기존 품목 일괄 조회 (이름 기준)
    const names = items.map((i) => String(i.name || '').trim()).filter(Boolean);
    const existing = await prisma.product.findMany({
      where: { name: { in: names } },
      include: { partner: true },
    });
    const existingByName = new Map(existing.map((p) => [p.name, p]));
    const existingByNorm = new Map<string, any>();
    existing.forEach((p) => existingByNorm.set(normName(p.name), p));

    let seq = 0;
    for (const it of items) {
      const rawName = String(it.name || '').trim();
      if (!rawName) {
        failed.push({ name: rawName, reason: '품명 없음' });
        continue;
      }
      const boxes = Number(it.boxes) || 0;
      if (boxes <= 0) continue; // 발주량 0은 스킵
      const norm = normName(rawName);
      const ref: any = (auditMap as Map<string, any>).get(norm);

      let product = existingByName.get(rawName) || existingByNorm.get(norm) || null;
      let wasCreated = false;

      if (!product && !dryRun) {
        // GFS 정본 기준 자동 생성
        const vendorName = (ref?.vendor || it.supplierHeader || '').trim();
        let partnerId: string | null = null;
        let partnerName = '';
        if (vendorName) {
          const cleanVendor = vendorName.split('(')[0].trim();
          const found = await prisma.partner.findFirst({ where: { name: cleanVendor } });
          if (found) {
            partnerId = found.id;
            partnerName = found.name;
          } else {
            const count = await prisma.partner.count();
            const newId = `VG${String(count + 1).padStart(4, '0')}`;
            const createdPartner = await prisma.partner.create({
              data: {
                id: newId,
                name: cleanVendor,
                partnerType: 'P',
                remark: 'GFS 자동생성(재고조사표 정본)',
              },
            });
            partnerId = createdPartner.id;
            partnerName = createdPartner.name;
            created.push({ type: 'partner', id: partnerId, name: partnerName });
          }
        }

        const isSub = ref?.warehouse === '부자재';
        const category = isSub ? '부자재' : '원재료';
        const warehouse = ref?.warehouse || (/냉동/.test(rawName) ? '냉동' : /상온/.test(rawName) ? '상온' : /냉장/.test(rawName) ? '냉장1' : '상온');
        seq += 1;
        const codeBase = ref?.itemId && String(ref.itemId).trim() ? String(ref.itemId).trim() : `GFS-${today}-${String(seq).padStart(3, '0')}`;
        // 코드 충돌 시 접미사
        let productCode = codeBase;
        let dup = await prisma.product.findUnique({ where: { productCode } });
        let n = 1;
        while (dup) {
          productCode = `${codeBase}-${n++}`;
          dup = await prisma.product.findUnique({ where: { productCode } });
        }
        const packUnit = Number(it.packUnit) || Number(ref?.packUnit) || 1;
        const bagPrice = Number(it.bagPrice) || Number(ref?.bagPrice) || 0;
        const safetyStock = Math.max(0, Math.round(Number(it.safetyStock) || 0));

        product = await prisma.product.create({
          data: {
            productCode,
            name: rawName,
            spec: '',
            unit: 'box',
            category,
            kind: '',
            boxQty: packUnit,
            warehouse,
            safetyStockQty: safetyStock,
            partnerId,
            remark: 'GFS 자동생성(재고조사표 정본, 확인필요)',
          },
          include: { partner: true },
        });
        if (bagPrice > 0) {
          await prisma.productPrice.create({
            data: {
              productId: product.id,
              purchasePrice: bagPrice,
              deliveryPrice: 0,
              effectiveDate: kstToday(),
              remark: 'GFS 자동생성 단가(봉단가)',
            },
          });
        }
        wasCreated = true;
        created.push({
          type: 'product',
          productCode: product.productCode,
          name: product.name,
          warehouse,
          partner: partnerName,
        });
        existingByName.set(rawName, product);
        existingByNorm.set(norm, product);
      }

      if (!product) {
        if (dryRun) {
          // 미리보기: 생성될 내용만 안내
        matched.push({
          name: rawName,
          boxes,
          status: '신규예정',
          warehouse: ref?.warehouse || '',
          vendor: ref?.vendor || it.supplierHeader || '',
          bagPrice: Number(it.bagPrice) || Number(ref?.bagPrice) || 0,
          packUnit: Number(it.packUnit) || Number(ref?.packUnit) || 0,
          gfsDays: it.stockDays != null && !isNaN(Number(it.stockDays)) ? Number(it.stockDays) : null,
        });
        } else {
          failed.push({ name: rawName, reason: '생성 실패' });
        }
        continue;
      }

      // 기존 품목의 안전재고가 비어 있으면 자동계산값으로 채움 (수기값 유지)
      const wantSafety = Math.max(0, Math.round(Number(it.safetyStock) || 0));
      if (!dryRun && wantSafety > 0 && !(Number((product as any).safetyStockQty) > 0)) {
        try {
          product = await prisma.product.update({
            where: { id: product.id },
            data: { safetyStockQty: wantSafety },
            include: { partner: true },
          });
          existingByName.set(rawName, product);
          existingByNorm.set(norm, product);
        } catch {}
      }

      const packUnit = Number(product.boxQty) || Number(it.packUnit) || Number(ref?.packUnit) || 1;
      const partner = (product as any).partner;
      matched.push({
        productCode: product.productCode,
        productName: product.name,
        orderQty: boxes,
        unit: 'box',
        packUnit,
        bagPrice: Number(it.bagPrice) || Number(ref?.bagPrice) || 0,
        boxPrice:
          (Number(it.bagPrice) || Number(ref?.bagPrice) || 0) * packUnit,
        partnerId: (product as any).partnerId || null,
        partnerName: partner?.name || '',
        warehouse: product.warehouse,
        created: wasCreated,
        gfsDays: it.stockDays != null && !isNaN(Number(it.stockDays)) ? Number(it.stockDays) : null,
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
            action: 'GFS자동생성',
            menuId: 'pur-gfs-smart-order',
            menuName: '스마트발주(GFS)',
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