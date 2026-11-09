import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';

function normalizeDate(val: any): string {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}\.\d{2}\.\d{2}/.test(s)) return s.slice(0, 10).replace(/\./g, '-');
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.slice(0, 10).replace(/\//g, '-');
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    const month = String(mdy[1]).padStart(2, '0');
    const day = String(mdy[2]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const n = Number(s);
  if (!isNaN(n) && n > 20000 && n < 60000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return s;
}

function normalizeMaterialName(name: string): string {
  if (!name) return '';
  return name
    .replace(/^\[(냉동|냉장|상온|소모품|부자재|포장재)\]\s*/, '')
    .replace(/^[●★■◆▲▼*]/, '')
    .replace(/_?(리테일|네트웍스|금행|동원|진보|CJ|대선|DS유통|이우|직배)/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/box|pk/gi, '')
    .replace(/[0-9]+(kg|g|ea|봉|통|캔|박스|롤|매|줄|L|ml|%)/gi, '')
    .replace(/[\*\-\_\/\,\.\s]/g, '')
    .toLowerCase()
    .trim();
}

export interface UploadReceivingItem {
  receivingDate: string;
  orderNo?: string;
  orderDate?: string;
  partnerName: string;
  category: string;
  productName: string;
  spec?: string;
  unit?: string;
  orderPrice?: number;
  orderQty?: number;
  orderAmt?: number;
  carNo?: string;
  recvQty: number;
  expiryDate?: string;
  carTemp?: string;
  markStatus?: string;
  lookStatus?: string;
  carClean?: string;
  totalJudge?: string;
  buyPrice: number;
  recvAmt: number;
  diffQty?: number;
  diffAmt?: number;
  lotNo?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      rows = [],
      options = {
        updateStock: true,
        updatePrice: true,
        syncPo: false,
        createLedger: true,
      },
    } = body as {
      rows: UploadReceivingItem[];
      options?: {
        updateStock?: boolean;
        updatePrice?: boolean;
        syncPo?: boolean;
        createLedger?: boolean;
      };
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '업로드할 입고 품목 데이터가 없습니다.' },
        { status: 400 }
      );
    }

    // 1. 거래처 + 입고일자별 그룹핑
    const grouped = new Map<string, { partnerName: string; receivingDate: string; items: UploadReceivingItem[] }>();

    for (const row of rows) {
      const pName = (row.partnerName || '공급사미지정').trim();
      const rDate = normalizeDate(row.receivingDate) || new Date().toISOString().slice(0, 10);
      row.receivingDate = rDate;
      if (row.orderDate) row.orderDate = normalizeDate(row.orderDate);
      const key = `${rDate}|${pName}`;

      if (!grouped.has(key)) {
        grouped.set(key, { partnerName: pName, receivingDate: rDate, items: [] });
      }
      grouped.get(key)!.items.push(row);
    }

    let totalImportedDetails = 0;
    let totalImportedReceivings = 0;
    let totalImportedAmount = 0;

    // 2. 고속 일괄 트랜잭션 (사전 메모리 캐싱으로 수천 회의 DB 라운드트립 제거)
    await prisma.$transaction(
      async (tx) => {
        // [캐싱 1] 모든 파트너 사전 조회
        const allPartners = await tx.partner.findMany();
        const partnerMap = new Map<string, any>();
        for (const p of allPartners) {
          partnerMap.set(p.name.trim(), p);
        }

        // 새 파트너 등록 필요 시 생성
        for (const [_, group] of grouped.entries()) {
          const pName = group.partnerName;
          if (!partnerMap.has(pName)) {
            const found = allPartners.find(
              (p) => p.name.includes(pName) || pName.includes(p.name)
            );
            if (found) {
              partnerMap.set(pName, found);
            } else {
              const newId = `V${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
              const created = await tx.partner.create({
                data: {
                  id: newId,
                  name: pName,
                  partnerType: 'P',
                },
              });
              partnerMap.set(pName, created);
            }
          }
        }

        // [캐싱 2] 품목 사전 조회
        const allProducts = await tx.product.findMany();
        const productMap = new Map<string, any>();
        const normalizedProductMap = new Map<string, any>();
        for (const p of allProducts) {
          productMap.set(p.name.trim(), p);
          productMap.set(p.name.replace(/\s+/g, ''), p);
          const norm = normalizeMaterialName(p.name);
          if (norm && !normalizedProductMap.has(norm)) {
            normalizedProductMap.set(norm, p);
          }
        }

        // [캐싱 3] 발주서(PO) 사전 조회
        const orderNos = Array.from(
          new Set(rows.map((r) => (r.orderNo || '').trim()).filter(Boolean))
        );
        const existingPos = await tx.purchaseOrder.findMany({
          where: { orderNo: { in: orderNos } },
          include: { details: true },
        });
        const poMap = new Map<string, any>();
        for (const po of existingPos) {
          poMap.set(po.orderNo, po);
        }

        // [캐싱 4] 재고(Inventory) 사전 조회
        const allInventories = await tx.inventory.findMany();
        const invMap = new Map<string, any>(); // key: `${productId}_${warehouse}`
        for (const inv of allInventories) {
          invMap.set(`${inv.productId}_${inv.warehouse}`, inv);
        }

        // 그룹별 Receiving 헤더 및 상세 생성
        let seq = 1;
        for (const [_, group] of grouped.entries()) {
          const partner = partnerMap.get(group.partnerName);
          const partnerId = partner?.id || 'V_DEFAULT';
          const groupDate = group.receivingDate;
          const receivingNo = makeDocNo('RC', groupDate) + `-${String(seq++).padStart(3, '0')}`;

          const groupTotalAmt = group.items.reduce((s, it) => s + (it.recvAmt || 0), 0);
          totalImportedAmount += groupTotalAmt;

          const detailCreates: any[] = [];

          for (const item of group.items) {
            const rawName = (item.productName || '').trim();
            const cleanName = rawName.replace(/\u00A0/g, ' ');
            const matchKey = cleanName.replace(/\s+/g, '');

            // 창고 자동 분류
            let warehouse = '상온';
            const cat = item.category || '';
            if (cat === '부자재' || cat === '포장재' || /용기|뚜껑|바구니|롤|비닐|박스|에코젠|PP/i.test(cleanName)) {
              warehouse = '부자재';
            } else if (/냉동/i.test(cleanName)) {
              warehouse = '냉동';
            } else if (/냉장/i.test(cleanName) || /치즈|김치|햄|소시지/i.test(cleanName)) {
              warehouse = '냉장1';
            } else {
              warehouse = '상온';
            }

            // 품목(Product) 확인 (정확 일치 -> 정규화 매칭 -> 포함 매칭 -> 없을 때만 신규 생성)
            let product = productMap.get(cleanName) || productMap.get(matchKey);
            if (!product) {
              const normKey = normalizeMaterialName(cleanName);
              if (normKey && normalizedProductMap.has(normKey)) {
                product = normalizedProductMap.get(normKey);
              } else if (normKey && normKey.length >= 3) {
                const found = allProducts.find((p) => {
                  const pNorm = normalizeMaterialName(p.name);
                  return pNorm && (pNorm.includes(normKey) || normKey.includes(pNorm));
                });
                if (found) {
                  product = found;
                }
              }
            }

            if (!product) {
              const pCode = `MAT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
              product = await tx.product.create({
                data: {
                  productCode: pCode,
                  name: cleanName,
                  spec: item.spec || '-',
                  unit: item.unit || 'box',
                  category: warehouse === '부자재' ? '부자재' : '원재료',
                  warehouse,
                  partnerId,
                  boxQty: 1,
                  isUsed: true,
                },
              });
              allProducts.push(product);
              const newNorm = normalizeMaterialName(cleanName);
              if (newNorm) normalizedProductMap.set(newNorm, product);
            }

            // 검색 캐시에 등록하여 이후 동일 항목 즉시 매칭
            productMap.set(cleanName, product);
            productMap.set(matchKey, product);

            // 구매단가 최신화 (ProductPrice)
            if (options.updatePrice && item.buyPrice > 0) {
              await tx.productPrice.create({
                data: {
                  productId: product.id,
                  purchasePrice: item.buyPrice,
                  effectiveDate: groupDate,
                  remark: `입고파일 단가수정 반영 (${groupDate})`,
                },
              });
            }

            // 발주서 연동 (PurchaseOrder / PurchaseOrderDetail)
            if (options.syncPo && item.orderNo) {
              const orderNo = item.orderNo.trim();
              let po = poMap.get(orderNo);
              if (!po) {
                po = await tx.purchaseOrder.create({
                  data: {
                    orderNo,
                    orderDate: item.orderDate || groupDate,
                    partnerId,
                    partnerName: group.partnerName,
                    deliveryDate: groupDate,
                    status: item.diffQty && item.diffQty < 0 ? '부분입고' : '입고완료',
                    totalAmount: item.orderAmt || item.recvAmt || 0,
                  },
                  include: { details: true },
                });
                poMap.set(orderNo, po);
              }

              // PurchaseOrderDetail 확인 또는 생성
              const poDetail = po.details?.find((d: any) => d.productId === product.id);
              const orderQty = item.orderQty || item.recvQty || 0;
              const orderPrice = item.orderPrice || item.buyPrice || 0;

              if (!poDetail) {
                const createdPod = await tx.purchaseOrderDetail.create({
                  data: {
                    purchaseOrderId: po.id,
                    productId: product.id,
                    productCode: product.productCode,
                    productName: cleanName,
                    category: product.category,
                    unit: item.unit || 'box',
                    orderQty,
                    unitPrice: orderPrice,
                    amount: item.orderAmt || (orderQty * orderPrice),
                    receivedQty: item.recvQty,
                    remainQty: Math.max(0, orderQty - item.recvQty),
                  },
                });
                if (!po.details) po.details = [];
                po.details.push(createdPod);
              } else {
                const newRecv = (poDetail.receivedQty || 0) + item.recvQty;
                const newRemain = Math.max(0, (poDetail.orderQty || 0) - newRecv);
                await tx.purchaseOrderDetail.update({
                  where: { id: poDetail.id },
                  data: {
                    receivedQty: newRecv,
                    remainQty: newRemain,
                  },
                });
                poDetail.receivedQty = newRecv;
                poDetail.remainQty = newRemain;
              }
            }

            const lotNo =
              item.lotNo ||
              `LOT-${groupDate.replace(/-/g, '')}-${product.productCode.slice(-4)}`;
            const expiryDate = item.expiryDate || '2027-10-25';
            const inspectResult = item.totalJudge === 'X' ? '불합격' : '합격';

            // 실재고 (Inventory) 가산 및 단가 갱신
            if (options.updateStock && item.recvQty > 0) {
              const invKey = `${product.id}_${warehouse}`;
              const existingInv = invMap.get(invKey);

              if (existingInv) {
                await tx.inventory.update({
                  where: { id: existingInv.id },
                  data: {
                    currentQty: { increment: item.recvQty },
                    stockAmount: { increment: item.recvAmt },
                    unitPrice: item.buyPrice > 0 ? item.buyPrice : existingInv.unitPrice,
                    lastInDate: groupDate,
                    expiryDate,
                  },
                });
                existingInv.currentQty += item.recvQty;
                existingInv.stockAmount += item.recvAmt;
              } else {
                const createdInv = await tx.inventory.create({
                  data: {
                    productId: product.id,
                    productCode: product.productCode,
                    productName: cleanName,
                    category: product.category,
                    lotNo,
                    expiryDate,
                    warehouse,
                    currentQty: item.recvQty,
                    unit: item.unit || 'box',
                    unitPrice: item.buyPrice,
                    stockAmount: item.recvAmt,
                    lastInDate: groupDate,
                  },
                });
                invMap.set(invKey, createdInv);
              }
            }

            // 자재수불부 (MaterialLedger)
            if (options.createLedger && item.recvQty > 0) {
              await tx.materialLedger.create({
                data: {
                  ledgerDate: groupDate,
                  productId: product.id,
                  productCode: product.productCode,
                  productName: cleanName,
                  category: product.category,
                  unit: item.unit || 'box',
                  carryOverQty: 0,
                  inQty: item.recvQty,
                  outQty: 0,
                  adjustQty: 0,
                  currentQty: item.recvQty,
                  unitPrice: item.buyPrice,
                  stockAmount: item.recvAmt,
                  txnType: '정규입고',
                  refNo: receivingNo,
                  remark: `[파일업로드] ${group.partnerName} (${cleanName}, 차량:${item.carNo || '-'}, 온도:${item.carTemp || '-'})`,
                },
              });
            }

            detailCreates.push({
              productId: product.id,
              productCode: product.productCode,
              productName: cleanName,
              lotNo,
              expiryDate,
              receivedQty: item.recvQty,
              unit: item.unit || 'box',
              unitPrice: item.buyPrice,
              amount: item.recvAmt,
              boxQty: item.recvQty,
              warehouse,
              inspectResult,
              remark: `차량:${item.carNo || '-'}, 온도:${item.carTemp || '-'}, 판정:${inspectResult}, 규격:${item.spec || '-'}`,
            });

            totalImportedDetails++;
          }

          // Receiving 마스터 전표 레코드 생성
          await tx.receiving.create({
            data: {
              receivingNo,
              receivingDate: groupDate,
              partnerId,
              partnerName: group.partnerName,
              status: '입고완료',
              totalAmount: groupTotalAmt,
              remark: `[입고현황 파일 업로드] 총 ${detailCreates.length}개 품목 정상 검수 완료`,
              details: {
                create: detailCreates,
              },
            },
          });

          totalImportedReceivings++;
        }
      },
      { timeout: 120000, maxWait: 20000 }
    );

    return NextResponse.json({
      success: true,
      message: `입고 파일의 총 ${totalImportedDetails}개 품목(전표 ${totalImportedReceivings}건, 총액 ₩${totalImportedAmount.toLocaleString()})이 성공적으로 등록되었습니다.`,
      data: {
        totalDetails: totalImportedDetails,
        totalHeaders: totalImportedReceivings,
        totalAmount: totalImportedAmount,
      },
    });
  } catch (error: any) {
    console.error('Receiving upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '입고 파일 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
