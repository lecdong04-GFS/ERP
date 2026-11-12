import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(req.url);
    const discardDate = searchParams.get('discardDate') || kstToday();
    const gyeId = searchParams.get('gyeId');
    const search = searchParams.get('search')?.trim();

    // 1. 해당 일자 폐기 레코드 조회
    const where: any = { discardDate };
    if (gyeId && gyeId !== 'ALL') {
      where.gyeId = gyeId;
    }
    if (search) {
      where.OR = [
        { productCode: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { lotNo: { contains: search, mode: 'insensitive' } },
        { remark: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [discards, allGyes, products] = await Promise.all([
      prisma.discardRecord.findMany({
        where,
        orderBy: { id: 'desc' },
      }),
      prisma.gyeMaster.findMany({
        where: { isUsed: true },
        orderBy: { sortOrder: 'asc' },
      }),
      // 마스터 품목 (가격 및 재고 매핑용 캐시)
      prisma.product.findMany({
        select: {
          id: true,
          productCode: true,
          name: true,
          category: true,
          spec: true,
          unit: true,
          prices: {
            take: 1,
            select: { purchasePrice: true, deliveryPrice: true },
          },
          inventories: {
            take: 1,
            select: { currentQty: true, unitPrice: true, warehouse: true },
          },
        },
      }),
    ]);

    // 가격 맵 구성 (productCode -> unitPrice, currentStock, category)
    const priceMap = new Map<string, { unitPrice: number; currentStock: number; category: string }>();
    const masterItems: any[] = [];

    products.forEach((p) => {
      const inv = p.inventories?.[0];
      const prc = p.prices?.[0];
      const unitPrice =
        (inv?.unitPrice && inv.unitPrice > 0)
          ? inv.unitPrice
          : (prc?.purchasePrice && prc.purchasePrice > 0)
          ? prc.purchasePrice
          : (prc?.deliveryPrice && prc.deliveryPrice > 0)
          ? prc.deliveryPrice
          : 0;

      const currentStock = inv?.currentQty || 0;
      priceMap.set(p.productCode, { unitPrice, currentStock, category: p.category || '반제품' });
      priceMap.set(p.name, { unitPrice, currentStock, category: p.category || '반제품' });

      masterItems.push({
        id: p.id,
        productCode: p.productCode,
        name: p.name,
        category: p.category || '반제품',
        spec: p.spec || '',
        unit: p.unit || 'ea',
        unitPrice,
        currentStock,
        warehouse: inv?.warehouse || '',
      });
    });

    // 2. 일자별 전체 폐기 데이터 (계별 집계 및 KPI 계산용)
    const dayAllDiscards = (gyeId && gyeId !== 'ALL') || search
      ? await prisma.discardRecord.findMany({ where: { discardDate } })
      : discards;

    // 계별 폐기 통계 맵
    const gyeStatMap = new Map<string, { count: number; totalQty: number; lossAmount: number }>();
    const reasonStatMap = new Map<string, number>();

    let totalLossAmount = 0;
    let totalQty = 0;

    dayAllDiscards.forEach((d) => {
      totalQty += Number(d.discardQty) || 0;
      const pInfo = priceMap.get(d.productCode) || priceMap.get(d.productName);
      const uPrice = pInfo?.unitPrice || 0;
      const loss = (Number(d.discardQty) || 0) * uPrice;
      totalLossAmount += loss;

      // 계별 집계
      const gyeKey = d.gyeId || 'GFS000';
      const curGye = gyeStatMap.get(gyeKey) || { count: 0, totalQty: 0, lossAmount: 0 };
      curGye.count += 1;
      curGye.totalQty += Number(d.discardQty) || 0;
      curGye.lossAmount += loss;
      gyeStatMap.set(gyeKey, curGye);

      // 사유별 집계
      const r = (d.reason || '기타').trim() || '기타';
      reasonStatMap.set(r, (reasonStatMap.get(r) || 0) + (Number(d.discardQty) || 0));
    });

    // 계 마스터 목록에 실시간 폐기 데이터 바인딩
    const gyeList = allGyes.map((g) => {
      const stat = gyeStatMap.get(g.id) || { count: 0, totalQty: 0, lossAmount: 0 };
      return {
        id: g.id,
        name: g.name,
        sortOrder: g.sortOrder,
        count: stat.count,
        totalQty: Number(stat.totalQty.toFixed(2)),
        lossAmount: Math.round(stat.lossAmount),
      };
    });

    // 최다 불량 공정 산출
    let topGye = { name: '해당 없음', qty: 0 };
    gyeList.forEach((g) => {
      if (g.totalQty > topGye.qty) {
        topGye = { name: g.name, qty: g.totalQty };
      }
    });

    // 최다 불량 사유 산출
    let topReason = { reason: '해당 없음', qty: 0 };
    reasonStatMap.forEach((qty, reason) => {
      if (qty > topReason.qty) {
        topReason = { reason, qty };
      }
    });

    // 결과 행에 추정 단가 및 손실금액 부가
    const enrichedDiscards = discards.map((d) => {
      const pInfo = priceMap.get(d.productCode) || priceMap.get(d.productName);
      const unitPrice = pInfo?.unitPrice || 0;
      const lossAmount = Math.round((Number(d.discardQty) || 0) * unitPrice);
      return {
        ...d,
        unitPrice,
        lossAmount,
        category: pInfo?.category || '반제품',
        currentStock: pInfo?.currentStock || 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedDiscards,
      gyeList,
      masterItems,
      kpi: {
        totalRecords: dayAllDiscards.length,
        totalQty: Number(totalQty.toFixed(2)),
        totalLossAmount: Math.round(totalLossAmount),
        topGye,
        topReason,
      },
    });
  } catch (error: any) {
    console.error('Failed to load discard records:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession({ categoryId: 'production', action: 'write' });
    if (auth.error) return auth.error;
    const me = auth.user;

    const body = await req.json();
    const { action, id, rows, ...data } = body;

    // 1. 단일 레코드 삭제
    if (action === 'delete') {
      const delAuth = await requireSession({ categoryId: 'production', action: 'delete' });
      if (delAuth.error) return delAuth.error;
      const targetId = Number(id || data.id);
      if (!targetId) {
        return NextResponse.json({ success: false, error: '삭제할 ID가 필요합니다.' }, { status: 400 });
      }

      await prisma.discardRecord.delete({ where: { id: targetId } });

      await prisma.systemLog.create({
        data: {
          logDate: new Date().toISOString(),
          userId: me.id,
          loginId: me.loginId,
          userName: me.name,
          action: '폐기삭제',
          menuId: 'prod-discard-reg',
          menuName: '공정 불량/폐기 등록',
          detail: `폐기 레코드 ID ${targetId} 삭제`,
        },
      });

      return NextResponse.json({ success: true, message: '정상적으로 삭제되었습니다.' });
    }

    // 2. 다건 일괄 저장 (Batch Save)
    if (action === 'batch' && Array.isArray(rows)) {
      if (rows.length === 0) {
        return NextResponse.json({ success: true, count: 0, message: '저장할 항목이 없습니다.' });
      }

      const results = await prisma.$transaction(async (tx) => {
        const savedList: any[] = [];

        for (const row of rows) {
          const qty = Number(row.discardQty) || 0;
          if (qty <= 0 && !row.id) continue;

          let record;
          if (row.id && Number(row.id) > 0) {
            record = await tx.discardRecord.update({
              where: { id: Number(row.id) },
              data: {
                discardDate: row.discardDate || kstToday(),
                gyeId: row.gyeId || '',
                gyeName: row.gyeName || '',
                productCode: row.productCode || '',
                productName: row.productName || '',
                spec: row.spec || '',
                unit: row.unit || 'ea',
                discardQty: qty,
                reason: row.reason || '공정 불량',
                lotNo: row.lotNo || '',
                expiryDate: row.expiryDate || '',
                remark: row.remark || '',
                createdBy: row.createdBy || me.name || me.loginId,
              },
            });
          } else {
            record = await tx.discardRecord.create({
              data: {
                discardDate: row.discardDate || kstToday(),
                gyeId: row.gyeId || '',
                gyeName: row.gyeName || '',
                productCode: row.productCode || '',
                productName: row.productName || '',
                spec: row.spec || '',
                unit: row.unit || 'ea',
                discardQty: qty,
                reason: row.reason || '공정 불량',
                lotNo: row.lotNo || '',
                expiryDate: row.expiryDate || '',
                remark: row.remark || '',
                createdBy: row.createdBy || me.name || me.loginId,
              },
            });
          }

          // 재고 연동 차감 체크 시
          if (row.deductInventory && qty > 0) {
            const inv = await tx.inventory.findFirst({
              where: {
                OR: [
                  { productCode: row.productCode },
                  { productName: row.productName },
                ],
              },
            });

            if (inv) {
              const nextQty = Math.max(0, inv.currentQty - qty);
              await tx.inventory.update({
                where: { id: inv.id },
                data: {
                  currentQty: nextQty,
                  stockAmount: Math.round(nextQty * (Number(inv.unitPrice) || 0)),
                },
              });
            }
          }

          savedList.push(record);
        }

        // 감사 로그 등록
        await tx.systemLog.create({
          data: {
            logDate: new Date().toISOString(),
            userId: me.id,
            loginId: me.loginId,
            userName: me.name,
            action: '공정폐기등록',
            menuId: 'prod-discard-reg',
            menuName: '공정 불량/폐기 등록',
            detail: `공정 불량/폐기 ${savedList.length}건 일괄 등록/수정 완료`,
          },
        });

        return savedList;
      }, { maxWait: 20000, timeout: 60000 });

      return NextResponse.json({
        success: true,
        count: results.length,
        data: results,
        message: `${results.length}건의 폐기 내역이 안전하게 저장되었습니다.`,
      });
    }

    // 3. 단건 저장 (Single Save)
    const qty = Number(data.discardQty) || 0;
    const created = await prisma.$transaction(async (tx) => {
      const rec = await tx.discardRecord.create({
        data: {
          discardDate: data.discardDate || kstToday(),
          gyeId: data.gyeId || '',
          gyeName: data.gyeName || '',
          productCode: data.productCode || '',
          productName: data.productName || '',
          spec: data.spec || '',
          unit: data.unit || 'ea',
          discardQty: qty,
          reason: data.reason || '공정 불량',
          lotNo: data.lotNo || '',
          expiryDate: data.expiryDate || '',
          remark: data.remark || '',
          createdBy: data.createdBy || me.name || me.loginId,
        },
      });

      if (data.deductInventory && qty > 0) {
        const inv = await tx.inventory.findFirst({
          where: {
            OR: [
              { productCode: data.productCode },
              { productName: data.productName },
            ],
          },
        });

        if (inv) {
          const nextQty = Math.max(0, inv.currentQty - qty);
          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              currentQty: nextQty,
              stockAmount: Math.round(nextQty * (Number(inv.unitPrice) || 0)),
            },
          });
        }
      }

      return rec;
    }, { maxWait: 20000, timeout: 60000 });

    return NextResponse.json({ success: true, data: created, message: '폐기 등록이 완료되었습니다.' });
  } catch (error: any) {
    console.error('Failed to save discard record:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
