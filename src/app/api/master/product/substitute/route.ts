import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClientIp, requireSession } from '@/lib/apiAuth';
import { kstToday } from '@/lib/kst';
import { touchDashboardSnapshot } from '@/lib/dashboard/touch';

function nowKstTimestamp(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * GET /api/master/product/substitute?productId=123&search=...
 * 대체품 지정 모달용 데이터 조회:
 * - 원본 품목 정보 + 창고별 현재고 합계
 * - 원본 품목이 투입된 BOM 레시피 목록 (BomDetail + BomHeader.parentProduct)
 * - 대체 후보 활성 품목 목록 + 협력사 목록
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const productId = Number(searchParams.get('productId'));
    const search = (searchParams.get('search') || '').trim();

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ success: false, error: '유효한 productId가 필요합니다.' }, { status: 400 });
    }

    const source = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        partner: { select: { id: true, name: true, orderDay: true } },
        prices: { orderBy: { effectiveDate: 'desc' }, take: 1 },
      },
    });

    if (!source) {
      return NextResponse.json({ success: false, error: '원본 품목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const [sourceInvs, bomDetails, candidates, partners] = await Promise.all([
      prisma.inventory.findMany({
        where: { productId },
        select: { id: true, warehouse: true, currentQty: true, unitPrice: true },
      }),
      prisma.bomDetail.findMany({
        where: { childProductId: productId },
        include: {
          bomHeader: {
            select: {
              id: true,
              version: true,
              isUsed: true,
              parentProduct: {
                select: { id: true, productCode: true, name: true, category: true },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.product.findMany({
        where: {
          id: { not: productId },
          isUsed: true,
          status: { notIn: ['삭제', '단종', '불용'] },
          category: { notIn: ['완성품'] },
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { productCode: { contains: search, mode: 'insensitive' } },
                  { partner: { name: { contains: search, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          productCode: true,
          name: true,
          spec: true,
          unit: true,
          category: true,
          warehouse: true,
          boxQty: true,
          targetOrderDays: true,
          partner: { select: { id: true, name: true } },
          prices: { orderBy: { effectiveDate: 'desc' }, take: 1, select: { purchasePrice: true } },
        },
        orderBy: [{ name: 'asc' }],
        take: 150,
      }),
      prisma.partner.findMany({
        where: { isUsed: true },
        select: { id: true, name: true, partnerType: true, orderDay: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const totalCurrentQty = sourceInvs.reduce((s, r) => s + (Number(r.currentQty) || 0), 0);

    const bomUsages = bomDetails.map((d) => ({
      detailId: d.id,
      bomHeaderId: d.bomHeaderId,
      version: d.bomHeader?.version || '1.0',
      isActive: d.bomHeader?.isUsed ?? true,
      parentProductId: d.bomHeader?.parentProduct?.id || 0,
      parentCode: d.bomHeader?.parentProduct?.productCode || '',
      parentName: d.bomHeader?.parentProduct?.name || '',
      unitQty: d.unitQty,
      unit: d.unit,
    }));

    return NextResponse.json({
      success: true,
      data: {
        source: {
          id: source.id,
          productCode: source.productCode,
          name: source.name,
          spec: source.spec,
          unit: source.unit,
          category: source.category,
          kind: source.kind,
          warehouse: source.warehouse,
          boxQty: source.boxQty,
          targetOrderDays: source.targetOrderDays,
          orderCycle: source.orderCycle,
          bomDivisor: source.bomDivisor,
          bomMultiplier: source.bomMultiplier,
          bomRoundDigits: source.bomRoundDigits,
          partnerId: source.partnerId,
          partnerName: source.partner?.name || '',
          bagPrice: Number(source.prices?.[0]?.purchasePrice) || 0,
          totalCurrentQty,
          warehouses: sourceInvs,
        },
        bomUsages,
        candidates: candidates.map((c) => ({
          id: c.id,
          productCode: c.productCode,
          name: c.name,
          spec: c.spec,
          unit: c.unit,
          category: c.category,
          warehouse: c.warehouse,
          boxQty: c.boxQty,
          targetOrderDays: c.targetOrderDays,
          partnerId: c.partner?.id || '',
          partnerName: c.partner?.name || '',
          bagPrice: Number(c.prices?.[0]?.purchasePrice) || 0,
        })),
        partners,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '대체품 조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/master/product/substitute
 * 대체품 변경 실행:
 * 1) mode='existing' (기존 품목 선택) 또는 mode='create' (원본 속성 승계 신규 품목 생성)
 * 2) BomDetail.childProductId 일괄 치환 (같은 BomHeader 내 중복 투입품 충돌 시 수량 합산 후 중복행 제거)
 * 3) transitionMode:
 *    - 'gradual' (잔여 재고 소진 후 전환): BOM만 즉시 B로 변경, A는 '단종예정' + A 재고 보존
 *    - 'immediate' (즉시 통합 전환): BOM 변경 + A 현재고를 B로 창고별 이관 + 수불부 기장 + A '단종'(isUsed=false)
 * 4) SystemLog 감사로그 기록
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession({ verifyDb: true });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const sourceProductId = Number(body.sourceProductId);
    const mode = body.mode === 'create' ? 'create' : 'existing';
    const transitionMode = body.transitionMode === 'immediate' ? 'immediate' : 'gradual';

    if (!Number.isInteger(sourceProductId) || sourceProductId <= 0) {
      return NextResponse.json({ success: false, error: '유효한 원본 품목 ID가 필요합니다.' }, { status: 400 });
    }

    const today = kstToday();

    const result = await prisma.$transaction(
      async (tx) => {
        const source = await tx.product.findUnique({
          where: { id: sourceProductId },
          include: {
            partner: { select: { id: true, name: true } },
            prices: { orderBy: { effectiveDate: 'desc' }, take: 1 },
          },
        });
        if (!source) {
          throw new Error('원본 품목을 찾을 수 없습니다.');
        }

        // 1. 대상(대체) 품목 확보 또는 신규 생성
        let target: {
          id: number;
          productCode: string;
          name: string;
          category: string;
          unit: string;
          warehouse: string;
        } | null = null;

        if (mode === 'existing') {
          const targetProductId = Number(body.targetProductId);
          if (!Number.isInteger(targetProductId) || targetProductId <= 0) {
            throw new Error('대체할 대상 품목을 선택하세요.');
          }
          if (targetProductId === source.id) {
            throw new Error('같은 품목으로는 대체할 수 없습니다.');
          }
          const found = await tx.product.findUnique({
            where: { id: targetProductId },
            select: { id: true, productCode: true, name: true, category: true, unit: true, warehouse: true },
          });
          if (!found) {
            throw new Error('선택한 대체 품목을 찾을 수 없습니다.');
          }
          target = found;
        } else {
          const np = body.newProduct || {};
          const newName = String(np.name || '').trim();
          if (!newName) {
            throw new Error('신규 대체품 품명을 입력하세요.');
          }

          // 거래처 처리 (partnerId 지정 또는 신규 거래처명 입력)
          let partnerId: string | null = np.partnerId ? String(np.partnerId).trim() : source.partnerId;
          const newPartnerName = String(np.partnerName || '').trim();
          if (!partnerId && newPartnerName) {
            const existPartner = await tx.partner.findFirst({ where: { name: newPartnerName } });
            if (existPartner) {
              partnerId = existPartner.id;
            } else {
              const pId = `VG-${Date.now().toString().slice(-6)}`;
              const createdPartner = await tx.partner.create({
                data: { id: pId, name: newPartnerName, partnerType: 'P', remark: '대체품 등록 시 자동생성' },
              });
              partnerId = createdPartner.id;
            }
          }

          // 중복 없는 품번 생성
          const baseCode = `SUB-${today.replace(/-/g, '').slice(2)}-${source.id}`;
          let productCode = baseCode;
          let suffix = 1;
          while (await tx.product.findUnique({ where: { productCode } })) {
            productCode = `${baseCode}-${suffix++}`;
          }

          const boxQty = Math.max(1, Math.round(Number(np.boxQty) || source.boxQty || 1));
          const targetOrderDays =
            np.targetOrderDays !== undefined && Number(np.targetOrderDays) >= 0
              ? Number(np.targetOrderDays)
              : source.targetOrderDays;
          const warehouse = String(np.warehouse || source.warehouse || '상온').trim();
          const spec = np.spec !== undefined ? String(np.spec).trim() : source.spec;

          const created = await tx.product.create({
            data: {
              productCode,
              name: newName,
              spec,
              unit: source.unit || 'ea',
              category: source.category || '원재료',
              kind: source.kind || '',
              packType: source.packType || '',
              shift: source.shift || '1편',
              boxQty,
              palletQty: source.palletQty || 0,
              unitWeight: source.unitWeight || 0,
              gyeId: source.gyeId,
              partnerId,
              warehouse,
              safetyStockQty: source.safetyStockQty || 0,
              minOrderQty: source.minOrderQty || 0,
              orderUnitQty: source.orderUnitQty || 0,
              orderCycle: source.orderCycle || '',
              targetOrderDays,
              bomDivisor: source.bomDivisor || 1000,
              bomMultiplier: source.bomMultiplier || 1,
              bomRoundDigits: source.bomRoundDigits ?? 1,
              status: '정상',
              isUsed: true,
              remark: `[${source.name}(#${source.id}) 대체품으로 신규 생성]`,
            },
          });

          const bagPrice = Number(np.bagPrice ?? source.prices?.[0]?.purchasePrice ?? 0);
          if (bagPrice > 0) {
            await tx.productPrice.create({
              data: {
                productId: created.id,
                purchasePrice: bagPrice,
                deliveryPrice: 0,
                effectiveDate: today,
                remark: '대체품 등록 단가',
              },
            });
          }

          target = {
            id: created.id,
            productCode: created.productCode,
            name: created.name,
            category: created.category,
            unit: created.unit,
            warehouse: created.warehouse,
          };
        }

        // 2. BOM 일괄 치환 (같은 BomHeader에 target이 이미 있으면 unitQty 합산 후 source 행 삭제)
        const sourceBomRows = await tx.bomDetail.findMany({
          where: { childProductId: source.id },
        });
        let bomUpdatedCount = 0;
        for (const row of sourceBomRows) {
          const existingTargetInSameHeader = await tx.bomDetail.findFirst({
            where: {
              bomHeaderId: row.bomHeaderId,
              childProductId: target.id,
              id: { not: row.id },
            },
          });
          if (existingTargetInSameHeader) {
            await tx.bomDetail.update({
              where: { id: existingTargetInSameHeader.id },
              data: {
                unitQty: (Number(existingTargetInSameHeader.unitQty) || 0) + (Number(row.unitQty) || 0),
                remark: `${existingTargetInSameHeader.remark ? `${existingTargetInSameHeader.remark} / ` : ''}대체합산(${source.name})`,
              },
            });
            await tx.bomDetail.delete({ where: { id: row.id } });
          } else {
            await tx.bomDetail.update({
              where: { id: row.id },
              data: { childProductId: target.id },
            });
          }
          bomUpdatedCount += 1;
        }

        // 3. 재고 및 원본 품목 상태 전환
        let transferredQty = 0;
        if (transitionMode === 'immediate') {
          const sourceInvs = await tx.inventory.findMany({
            where: { productId: source.id, currentQty: { gt: 0 } },
          });
          const targetBagPrice =
            Number(
              (
                await tx.productPrice.findFirst({
                  where: { productId: target.id },
                  orderBy: { effectiveDate: 'desc' },
                })
              )?.purchasePrice ?? source.prices?.[0]?.purchasePrice ?? 0
            ) || 0;

          for (const sinv of sourceInvs) {
            const qty = Number(sinv.currentQty) || 0;
            if (qty <= 0) continue;
            transferredQty += qty;

            const wh = sinv.warehouse || target.warehouse || '상온';
            const unitP = Number(sinv.unitPrice) || targetBagPrice || 0;

            await tx.inventory.update({
              where: { id: sinv.id },
              data: { currentQty: 0, stockAmount: 0, lastOutDate: today },
            });

            const existingTargetInv = await tx.inventory.findFirst({
              where: { productId: target.id, warehouse: wh },
            });
            let afterTargetQty = qty;
            if (existingTargetInv) {
              afterTargetQty = (Number(existingTargetInv.currentQty) || 0) + qty;
              const tPrice = Number(existingTargetInv.unitPrice) || unitP;
              await tx.inventory.update({
                where: { id: existingTargetInv.id },
                data: {
                  currentQty: afterTargetQty,
                  stockAmount: Math.round(afterTargetQty * tPrice),
                  lastInDate: today,
                },
              });
            } else {
              await tx.inventory.create({
                data: {
                  productId: target.id,
                  productCode: target.productCode,
                  productName: target.name,
                  category: target.category || '원재료',
                  warehouse: wh,
                  currentQty: qty,
                  unit: target.unit || 'ea',
                  unitPrice: unitP,
                  stockAmount: Math.round(qty * unitP),
                  lastInDate: today,
                },
              });
            }

            await tx.materialLedger.create({
              data: {
                ledgerDate: today,
                productId: source.id,
                productCode: source.productCode,
                productName: source.name,
                category: source.category || '원재료',
                unit: source.unit || 'ea',
                carryOverQty: qty,
                inQty: 0,
                outQty: qty,
                adjustQty: 0,
                currentQty: 0,
                unitPrice: unitP,
                stockAmount: 0,
                txnType: '대체출고',
                refNo: `SUB-${today.replace(/-/g, '')}-${source.id}`,
                remark: `대체품 전환 이관 → ${target.name} (${wh})`,
              },
            });

            await tx.materialLedger.create({
              data: {
                ledgerDate: today,
                productId: target.id,
                productCode: target.productCode,
                productName: target.name,
                category: target.category || '원재료',
                unit: target.unit || 'ea',
                carryOverQty: afterTargetQty - qty,
                inQty: qty,
                outQty: 0,
                adjustQty: 0,
                currentQty: afterTargetQty,
                unitPrice: unitP,
                stockAmount: Math.round(afterTargetQty * unitP),
                txnType: '대체입고',
                refNo: `SUB-${today.replace(/-/g, '')}-${source.id}`,
                remark: `대체품 전환 이관 ← ${source.name} (${wh})`,
              },
            });
          }

          await tx.product.update({
            where: { id: source.id },
            data: {
              isUsed: false,
              status: '단종',
              discontinuedDate: today,
              remark: `${source.remark ? `${source.remark} | ` : ''}[대체완료→#${target.id}:${target.name}]`,
            },
          });
        } else {
          // gradual: 잔여 재고 소진 후 전환 — A 재고 보존, BOM만 즉시 B로 변경, A는 '단종예정'
          const sourceRemain = await tx.inventory.aggregate({
            where: { productId: source.id },
            _sum: { currentQty: true },
          });
          const hasRemain = (Number(sourceRemain._sum.currentQty) || 0) > 0;
          await tx.product.update({
            where: { id: source.id },
            data: {
              isUsed: hasRemain,
              status: hasRemain ? '단종예정' : '단종',
              discontinuedDate: source.discontinuedDate || today,
              remark: `${source.remark ? `${source.remark} | ` : ''}[대체→#${target.id}:${target.name}]`,
            },
          });
        }

        // 4. 감사 로그
        await tx.systemLog
          .create({
            data: {
              logDate: nowKstTimestamp(),
              userId: auth.user.id,
              loginId: auth.user.loginId,
              userName: auth.user.name,
              action: '대체품변경',
              menuId: 'inv-lookup',
              menuName: '통합 재고조회',
              detail: `${source.name}(#${source.id}) → ${target.name}(#${target.id}) | BOM ${bomUpdatedCount}건 치환 | 방식: ${
                transitionMode === 'immediate' ? `즉시통합(재고 ${transferredQty} 이관)` : '잔여소진후전환'
              }`,
              ipAddress: getClientIp(req),
            },
          })
          .catch(() => {});

        return {
          sourceId: source.id,
          sourceName: source.name,
          targetId: target.id,
          targetName: target.name,
          targetCode: target.productCode,
          bomUpdatedCount,
          transitionMode,
          transferredQty,
        };
      },
      { timeout: 30000 }
    );

    await touchDashboardSnapshot();

    return NextResponse.json({
      success: true,
      message: `${result.sourceName} → ${result.targetName} 대체 완료 (BOM ${result.bomUpdatedCount}건 반영)`,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '대체품 변경 실패' }, { status: 400 });
  }
}
