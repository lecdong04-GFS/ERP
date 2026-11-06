import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { makeDocNo } from '@/lib/kst';
import { normName } from '@/lib/gfs/norm';

function normalizeWarehouse(rawWh?: string | null): string {
  if (!rawWh) return '상온';
  const w = String(rawWh).trim();
  if (w === '냉장1' || w === '냉장창고1') return '냉장1';
  if (w === '냉장2' || w === '냉장창고2') return '냉장2';
  if (w === '냉동' || w === '냉동창고') return '냉동';
  if (w === '상온' || w === '상온창고') return '상온';
  if (w === '부자재' || w === '부자재창고') return '부자재';
  return w.replace(/창고$/, '');
}

// 가공 반제품 / 전처리 규격품 정본 보관창고 사전 (사용자 지정 & 공장 실무 기준)
const CUSTOM_ITEM_WAREHOUSE_MAP: Record<string, string> = {
  '계란옷소시지전튀김_1/2컷': '냉동',
  '계란옷소시지전튀김(52개)': '냉동',
  '미니등심돈까스70_1/2컷': '냉동',
  '고미트햄슬라이스_24등분': '상온',
  '에그스크램블(해동)': '냉동',
  '풍림)얇은고명지단H(해동)': '냉동',
  '선진)김밥용남도떡갈비_1/2컷': '냉동',
  '한울)유채나물무침(해동)': '냉동',
  '한울)곤드레나물(해동)': '냉동',
  '선진)통통한칼집소시지_1/2대각': '냉장1',
  '야채계란말이_1/2대각컷': '냉장1',
  '숯불갈비맛스모크햄(찹핑)': '냉장1',
  '아워홈)부산어묵볼(봉당130개)': '냉장1',
  '한울)볶음김치(자연탈수)': '냉장2',
  '종가)백볶음김치(탈수)': '냉장2',
  '반찬단지)진미채견과볶음': '냉장2',
  '세천팜)8mm단무지': '냉장1',
  '신슈단무지(꼬들단무지)': '상온',
  '신슈알밥용단무지': '냉장2',
  '깐쪽파슬라이스(2mm)(소독/탈수)': '냉장2',
  '깐쪽파슬라이스(2mm)흰부위제거': '냉장2',
  '양파슬라이스(3mm)(커팅)': '냉장2',
  '양배추슬라이스3mm(세척)': '냉장2',
  '[선]깍두기찹핑(7mm)': '냉장2',
  '[선]콩나물찹핑(1cm)': '냉장2',
  '[선]도라지찹핑(7mm)': '냉장2',
  '[선]당근찹핑(7mm)': '냉장2',
  '[선]시금치찹핑(7mm)': '냉장2',
};

function normalizeForBom(name: string): string {
  let s = (name || '').trim();
  s = s.replace(/^\(주문\)\s*/, '');
  s = s.replace(/\s*[12]편$/, '');
  s = s.replace(/[12]$/, '');
  s = s.replace(/\s+/g, '');
  return s;
}

// 11대 생산현장 표준 라인 정의 (생산현장.xlsx 기준)
const LINE_CONFIGS: Record<
  string,
  {
    label: string;
    kind: 'PREP' | 'FORMING';
    keywords: string[];
    gyeIds: string[];
    defaultTimeStart: string;
  }
> = {
  커팅실: {
    label: '커팅실',
    kind: 'PREP',
    keywords: ['커팅', '컷', '슬라이스', '다이스', '채', '소스'],
    gyeIds: ['GFS011', 'GFS012', 'GFS028', 'GFS031', 'GFS024'],
    defaultTimeStart: '06:00',
  },
  취반: {
    label: '취반(밥짓기)',
    kind: 'PREP',
    keywords: ['취반', '미반', '밥', '쌀', '식초', '초밥', '정제수', '대두유'],
    gyeIds: ['GFS026', 'GFS151', 'GFS152'],
    defaultTimeStart: '06:00',
  },
  조리: {
    label: '조리(가열/볶음)',
    kind: 'PREP',
    keywords: ['조리', '볶음', '삶기', '데침', '가열', '양념'],
    gyeIds: ['GFS551', 'GFS552', 'GFS553', 'GFS036'],
    defaultTimeStart: '06:30',
  },
  튀김: {
    label: '튀김(오븐/까스)',
    kind: 'PREP',
    keywords: ['튀김', '까스', '오븐', '제트', '치킨'],
    gyeIds: ['GFS501', 'GFS502', 'GFS503'],
    defaultTimeStart: '06:30',
  },
  계량: {
    label: '계량실',
    kind: 'PREP',
    keywords: ['계량', '양념', '분말', '시즈닝'],
    gyeIds: ['GFS023', 'GFS025', 'GFS046'],
    defaultTimeStart: '06:00',
  },
  채소: {
    label: '채소작업실',
    kind: 'PREP',
    keywords: ['채소', '야채', '세척', '선별', '상추', '깻잎', '당근', '오이'],
    gyeIds: ['GFS020', 'GFS027', 'GFS029', 'GFS030', 'GFS032'],
    defaultTimeStart: '06:00',
  },
  샐러드: {
    label: '샐러드실',
    kind: 'PREP',
    keywords: ['샐러드', '믹싱', '토핑', '콘버터', '마요'],
    gyeIds: ['GFS100', 'GFS101', 'GFS102', 'GFS103'],
    defaultTimeStart: '06:30',
  },
  삼각1: {
    label: '삼각1호기',
    kind: 'FORMING',
    keywords: ['삼각', '전주비빔'],
    gyeIds: ['GFS007'],
    defaultTimeStart: '07:00',
  },
  삼각2: {
    label: '삼각2호기',
    kind: 'FORMING',
    keywords: ['삼각', '스팸', '참치마요', '리챔'],
    gyeIds: ['GFS007', 'GFS008'],
    defaultTimeStart: '07:00',
  },
  삼각3: {
    label: '삼각3호기',
    kind: 'FORMING',
    keywords: ['더큰', '삼각'],
    gyeIds: ['GFS007', 'GFS008'],
    defaultTimeStart: '07:00',
  },
  김밥: {
    label: '김밥라인',
    kind: 'FORMING',
    keywords: ['김밥', '무스비', '꼬마김밥'],
    gyeIds: ['GFS005', 'GFS006'],
    defaultTimeStart: '07:00',
  },
  도시락: {
    label: '도시락라인',
    kind: 'FORMING',
    keywords: ['도시락', '한상', '제육', '혜자', '다넣어', '비빔밥'],
    gyeIds: ['GFS004'],
    defaultTimeStart: '07:30',
  },
  조리빵: {
    label: '조리빵(샌드/버거)',
    kind: 'FORMING',
    keywords: ['샌드', '버거', '핫도그', '빵'],
    gyeIds: ['GFS002', 'GFS003', 'GFS014'],
    defaultTimeStart: '07:00',
  },
};

function determineWarehouse(prod: any, gyeName?: string | null, invWarehouse?: string | null): string {
  if (invWarehouse) {
    return normalizeWarehouse(invWarehouse);
  }
  const name = prod?.name || '';
  if (CUSTOM_ITEM_WAREHOUSE_MAP[name]) {
    return CUSTOM_ITEM_WAREHOUSE_MAP[name];
  }
  if (prod?.inventories && prod.inventories.length > 0 && prod.inventories[0].warehouse) {
    return normalizeWarehouse(prod.inventories[0].warehouse);
  }
  const gName = gyeName || '';
  const n = name.toLowerCase();
  const g = gName.toLowerCase();

  // 1. 냉동 품목 (해동 자재, 냉동육/가공품, 전/튀김류, 떡갈비, 지단, 스크램블 등)
  if (
    n.includes('해동') ||
    n.includes('냉동') ||
    n.includes('계란옷') ||
    n.includes('소시지전') ||
    n.includes('떡갈비') ||
    n.includes('함박') ||
    n.includes('패티') ||
    n.includes('너비아니') ||
    n.includes('물만두') ||
    n.includes('오징어제육') ||
    n.includes('지단') ||
    n.includes('스크램블') ||
    (n.includes('돈까스') && !n.includes('소스')) ||
    (n.includes('치킨까스') && !n.includes('소스')) ||
    (n.includes('까스') && !n.includes('소스'))
  ) {
    return '냉동';
  }

  // 2. 냉장2 (소스류, 드레싱, 채소/야채류, 김치, 단무지, 피클, 나물류)
  if (
    n.includes('소스') ||
    n.includes('드레싱') ||
    n.includes('야채') ||
    n.includes('채소') ||
    n.includes('양파') ||
    n.includes('파') ||
    n.includes('당근') ||
    n.includes('오이') ||
    n.includes('배추') ||
    n.includes('김치') ||
    n.includes('단무지') ||
    n.includes('피클') ||
    n.includes('우엉') ||
    n.includes('나물') ||
    g.includes('채소')
  ) {
    return '냉장2';
  }

  // 3. 냉장1 (신선육, 양념육, 햄, 소시지, 어묵, 맛살, 계란 등 신선 육가공)
  if (
    n.includes('제육') ||
    n.includes('불고기') ||
    n.includes('고기') ||
    n.includes('돈육') ||
    n.includes('우육') ||
    n.includes('계란') ||
    n.includes('소시지') ||
    n.includes('햄') ||
    n.includes('어묵') ||
    n.includes('맛살') ||
    g.includes('육류')
  ) {
    return '냉장1';
  }

  // 4. 부자재 (용기, 필름, 박스, 라벨 등)
  if (
    n.includes('용기') ||
    n.includes('필름') ||
    n.includes('box') ||
    n.includes('박스') ||
    n.includes('봉투') ||
    n.includes('라벨') ||
    n.includes('스티커')
  ) {
    return '부자재';
  }

  // 5. 상온 (스팸, 고미트, 캔/통조림, 버섯채, 분말, 건자재 등)
  return '상온';
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workDateParam = searchParams.get('workDate');
    const shift = searchParams.get('shift') || '1편';
    const line = searchParams.get('line') || '커팅실';
    const gyeId = searchParams.get('gyeId');
    const status = searchParams.get('status');

    // 1) 대상 일자 파악
    let targetDate = workDateParam;
    if (!targetDate) {
      const latestSo = await prisma.salesOrder.findFirst({
        where: { status: { not: '취소' } },
        orderBy: { orderDate: 'desc' },
        select: { orderDate: true },
      });
      targetDate = latestSo?.orderDate || '2026-11-05';
    }

    // 2) 실시간 재고(Inventory) 및 당일 재고조사표 스냅샷(InventorySnapshot) 통합 인덱싱 (단일 진실 공급원 확립)
    // 업로드된 재고조사표(실사 확정)를 최우선 정본으로 동기화하여 재고조회와 100% 일치 보장
    const [targetSnapshots, latestSnapshots, allInventories] = await Promise.all([
      prisma.inventorySnapshot.findMany({
        where: { snapshotDate: targetDate },
      }),
      prisma.inventorySnapshot.findMany({
        take: 850,
        orderBy: { snapshotDate: 'desc' },
      }),
      prisma.inventory.findMany({
        include: { product: true },
      }),
    ]);

    const activeSnapshots = targetSnapshots.length > 0 ? targetSnapshots : latestSnapshots;

    const stockMapByNorm = new Map<string, { warehouse: string; currentQty: number; productCode?: string }>();
    const stockMapByCode = new Map<string, { warehouse: string; currentQty: number; productCode?: string }>();

    // 1단계: 실시간 재고(Inventory) 기본 등록
    for (const inv of allInventories) {
      const info = { warehouse: normalizeWarehouse(inv.warehouse), currentQty: inv.currentQty, productCode: inv.productCode };
      if (inv.productCode) stockMapByCode.set(inv.productCode, info);
      if (inv.productName) stockMapByNorm.set(normName(inv.productName), info);
      if (inv.product?.name) stockMapByNorm.set(normName(inv.product.name), info);
    }

    // 2단계 (최우선): 일일 재고조사표 스냅샷 덮어쓰기 (재고조회와 창고명/수량 100% 무결성 직결)
    for (const snap of activeSnapshots) {
      const info = { warehouse: normalizeWarehouse(snap.warehouse), currentQty: snap.currentQty, productCode: snap.productCode };
      if (snap.productCode) stockMapByCode.set(snap.productCode, info);
      if (snap.productName) stockMapByNorm.set(normName(snap.productName), info);
    }

    // 3) DB에 이미 저장된 WorkOrder가 있는지 확인
    const savedOrders = await prisma.workOrder.findMany({
      where: {
        workDate: targetDate,
        ...(shift && shift !== '전체' ? { shift } : {}),
        ...(line && line !== 'ALL' ? { gyeName: { contains: line } } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        gye: true,
        product: {
          include: { inventories: true },
        },
      },
      orderBy: { workSeq: 'asc' },
    });

    if (savedOrders.length > 0) {
      const formatted = savedOrders.map((w, idx) => {
        const inv = stockMapByNorm.get(normName(w.productName)) || (w.productCode ? stockMapByCode.get(w.productCode) : undefined);
        const wh = inv ? normalizeWarehouse(inv.warehouse) : determineWarehouse(w.product, w.gyeName);
        const liveStock = inv ? inv.currentQty : (w.product?.inventories?.[0]?.currentQty || 0);

        return {
          id: w.id,
          workOrderNo: w.workOrderNo,
          workDate: w.workDate,
          shift: w.shift,
          gyeId: w.gyeId,
          gyeName: w.gyeName,
          lineName: w.gyeName || line,
          workSeq: w.workSeq || idx + 1,
          productId: w.productId,
          productCode: w.productCode,
          partName: w.productName,
          productName: w.productName,
          warehouseName: wh,
          partSpec: w.spec || '1ea',
          spec: w.spec || '1ea',
          unit: w.unit || 'g',
          orderQty: w.orderQty,
          prodQty: w.prodQty,
          lossRate: 5,
          yieldRate: 95,
          stockQty: liveStock,
          timeRange: w.completeTime || '06:00 ~ 07:30',
          status: w.status || '대기',
          assignee: w.createdBy || '담당자',
        };
      });

      return NextResponse.json({
        success: true,
        workDate: targetDate,
        line,
        shift,
        data: formatted,
      });
    }

    // 4) DB에 미저장 상태라면: 수주(SalesOrder) + BOM 실시간 전개
    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        orderDate: targetDate,
        status: { not: '취소' },
      },
      include: {
        details: {
          include: {
            product: true,
          },
        },
      },
    });

    // 주문 수량 집계 (1편 / 2편 분리 철저 반영)
    const orderQtyMap = new Map<number, { product: any; qty: number }>();
    for (const so of salesOrders) {
      for (const dt of so.details) {
        if (!dt.product) continue;
        const effectiveQty = shift === '2편' ? (dt.orderQty2 || 0) : shift === '1편' ? (dt.orderQty1 || 0) : (dt.totalQty || 0);
        if (effectiveQty <= 0) continue;

        const cur = orderQtyMap.get(dt.productId);
        if (cur) {
          cur.qty += effectiveQty;
        } else {
          orderQtyMap.set(dt.productId, { product: dt.product, qty: effectiveQty });
        }
      }
    }

    // BOM 전체 로드
    const bomHeaders = await prisma.bomHeader.findMany({
      include: {
        parentProduct: true,
        details: {
          include: {
            childProduct: {
              include: { inventories: true },
            },
            gye: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const bomByParentId = new Map<number, (typeof bomHeaders)[0]>();
    const bomByName = new Map<string, (typeof bomHeaders)[0]>();
    const bomByNorm = new Map<string, (typeof bomHeaders)[0]>();

    for (const bh of bomHeaders) {
      bomByParentId.set(bh.parentProductId, bh);
      if (bh.parentProduct?.name) {
        bomByName.set(bh.parentProduct.name, bh);
        bomByNorm.set(normalizeForBom(bh.parentProduct.name), bh);
      }
    }

    const findBom = (prod: any) => {
      if (!prod) return null;
      if (bomByParentId.has(prod.id)) return bomByParentId.get(prod.id);
      if (prod.name && bomByName.has(prod.name)) return bomByName.get(prod.name);
      const norm = normalizeForBom(prod.name || '');
      if (bomByNorm.has(norm)) return bomByNorm.get(norm);
      return null;
    };

    const targetLineConfig = LINE_CONFIGS[line] || LINE_CONFIGS['커팅실'];
    const isPrep = targetLineConfig.kind === 'PREP';

    const itemsMap = new Map<string, any>();
    let initialTime = targetLineConfig.defaultTimeStart;

    if (isPrep) {
      // [전처리 파트]: 수주된 완제품들의 BOM 하위 자재/반제품 전개
      for (const [, item] of orderQtyMap) {
        const bom = findBom(item.product);
        if (!bom || !bom.details) continue;

        for (const d of bom.details) {
          const ch = d.childProduct;
          if (!ch) continue;

          const gName = d.gye?.name || d.remark || '';
          const gId = d.gyeId || '';
          const chName = ch.name || '';

          // 해당 라인 대상 여부 판별
          let matchesLine = false;
          if (line === 'ALL') {
            matchesLine = true;
          } else {
            const matchesGye = targetLineConfig.gyeIds.includes(gId);
            const matchesKw = targetLineConfig.keywords.some(
              (kw) => gName.includes(kw) || chName.includes(kw)
            );
            matchesLine = matchesGye || matchesKw;
          }

          if (!matchesLine) continue;

          // 투입 지시량 계산 (로스율 / 수율 반영)
          const yieldRate = d.yieldRate > 0 ? d.yieldRate : 100;
          const lossRate = Math.max(0, 100 - yieldRate);
          const reqQty = (item.qty * d.unitQty * (100 / yieldRate));

          const inv = stockMapByNorm.get(normName(chName)) || (ch.productCode ? stockMapByCode.get(ch.productCode) : undefined);
          const wh = inv ? normalizeWarehouse(inv.warehouse) : determineWarehouse(ch, gName);
          const currentStock = inv ? inv.currentQty : (ch.inventories?.[0]?.currentQty || 0);

          // 소스류 단위 교정 (매 -> g)
          let itemUnit = d.unit || ch.unit || 'g';
          if ((chName.includes('소스') || gName.includes('소스')) && itemUnit === '매') {
            itemUnit = 'g';
          }

          const key = ch.name;
          const existing = itemsMap.get(key);
          if (existing) {
            existing.orderQty += reqQty;
            existing.prodQty += reqQty;
          } else {
            itemsMap.set(key, {
              key,
              productId: ch.id,
              productCode: ch.productCode,
              partName: ch.name,
              productName: ch.name,
              lineName: line,
              gyeId: gId || 'GFS011',
              gyeName: gName || line,
              spec: ch.spec || '1식',
              unit: itemUnit,
              orderQty: reqQty,
              prodQty: reqQty,
              lossRate: lossRate > 0 ? lossRate : 5,
              yieldRate,
              warehouseName: wh,
              stockQty: currentStock,
              parentNames: [item.product.name],
            });
          }
        }
      }
    } else {
      // [성형 라인 파트]: 완제품 지시 전개
      for (const [, item] of orderQtyMap) {
        const p = item.product;
        const pName = p.name || '';
        const matchesKw = targetLineConfig.keywords.some((kw) => pName.includes(kw));

        if (line !== 'ALL' && !matchesKw) continue;

        const key = p.name;
        const existing = itemsMap.get(key);
        if (existing) {
          existing.orderQty += item.qty;
          existing.prodQty = Math.round(existing.orderQty * 0.98);
        } else {
          itemsMap.set(key, {
            key,
            productId: p.id,
            productCode: p.productCode,
            partName: p.name,
            productName: p.name,
            lineName: line,
            gyeId: targetLineConfig.gyeIds[0] || 'GFS004',
            gyeName: targetLineConfig.label,
            spec: p.spec || '1ea',
            unit: 'ea',
            orderQty: Math.round(item.qty),
            prodQty: Math.round(item.qty * 0.98),
            lossRate: 2,
            yieldRate: 98,
            warehouseName: '냉장1',
            stockQty: 0,
            parentNames: [p.name],
          });
        }
      }
    }

    // 배열 변환 및 타임테이블/순서 배정
    let runningTime = initialTime;
    const resultList = Array.from(itemsMap.values()).map((row, idx) => {
      const nextTime = addMinutesToTime(runningTime, 45);
      const timeRange = `${runningTime} ~ ${nextTime}`;
      runningTime = nextTime;

      // 지시량 반올림 처리 (공장 작업지시서는 깔끔한 정수 또는 소수점 1자리)
      const finalQty = row.unit === 'g'
        ? Math.round(row.orderQty)
        : row.unit === 'Kg'
        ? Number(row.orderQty.toFixed(1))
        : Math.round(row.orderQty);

      return {
        id: 2000 + idx,
        workOrderNo: `WO-${targetDate.replace(/-/g, '')}-${String(idx + 1).padStart(3, '0')}`,
        workDate: targetDate,
        shift,
        workSeq: idx + 1,
        productId: row.productId,
        productCode: row.productCode,
        partName: row.partName,
        productName: row.productName,
        lineName: row.lineName,
        gyeId: row.gyeId,
        gyeName: row.gyeName,
        spec: row.spec,
        unit: row.unit,
        orderQty: finalQty,
        prodQty: finalQty,
        lossRate: row.lossRate,
        yieldRate: row.yieldRate,
        warehouseName: row.warehouseName,
        stockQty: row.stockQty,
        timeRange,
        status: '대기',
        assignee: '김반장',
      };
    });

    return NextResponse.json({
      success: true,
      workDate: targetDate,
      line,
      shift,
      data: resultList,
    });
  } catch (error: any) {
    console.error('Work order API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch work orders' },
      { status: 500 }
    );
  }
}

// POST /api/production/work-order (일괄 저장, 순서 변경, 개별 상태 업데이트)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, rows, workDate, shift, line } = body;

    // 1) 일괄 순서 및 작업지시 동기화 저장 (사용자가 순서/시간 변경 후 [순서 저장] 클릭 시)
    if (action === 'batch_save' && Array.isArray(rows)) {
      for (const r of rows) {
        if (!r.workOrderNo) continue;
        const existing = await prisma.workOrder.findUnique({
          where: { workOrderNo: r.workOrderNo },
        });

        if (existing) {
          await prisma.workOrder.update({
            where: { id: existing.id },
            data: {
              workSeq: Number(r.workSeq) || existing.workSeq,
              status: r.status || existing.status,
              orderQty: Number(r.orderQty) || existing.orderQty,
              completeTime: r.timeRange || existing.completeTime,
              createdBy: r.assignee || existing.createdBy,
            },
          });
        } else {
          let pId = r.productId;
          let gId = r.gyeId;
          if (!pId && r.productName) {
            const prod = await prisma.product.findFirst({
              where: { name: { contains: r.productName.slice(0, 4) } },
              select: { id: true, productCode: true, spec: true, unit: true },
            });
            if (prod) {
              pId = prod.id;
              if (!r.productCode) r.productCode = prod.productCode;
              if (!r.spec) r.spec = prod.spec;
              if (!r.unit) r.unit = prod.unit;
            } else {
              const anyP = await prisma.product.findFirst({ select: { id: true } });
              if (anyP) pId = anyP.id;
            }
          }
          if (!gId) {
            const anyGye = await prisma.gyeMaster.findFirst({
              where: { name: { contains: line || '성형' } },
              select: { id: true },
            });
            gId = anyGye?.id || (await prisma.gyeMaster.findFirst({ select: { id: true } }))?.id || 'GFS004';
          }

          if (pId && gId) {
            await prisma.workOrder.create({
              data: {
                workOrderNo: r.workOrderNo,
                workDate: workDate || r.workDate || '2026-11-06',
                shift: shift || r.shift || '1편',
                gyeId: gId,
                gyeName: r.gyeName || line || '성형',
                productId: pId,
                productCode: r.productCode || '',
                productName: r.productName || r.partName || '',
                spec: r.spec || '',
                unit: r.unit || 'ea',
                orderQty: Number(r.orderQty) || 0,
                prodQty: Number(r.prodQty) || Number(r.orderQty) || 0,
                workSeq: Number(r.workSeq) || 1,
                status: r.status || '대기',
                completeTime: r.timeRange || r.completeTime || '09:30 ~ 10:30',
                createdBy: r.assignee || '김반장',
              },
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: '작업 순서 및 지시가 성공적으로 전산에 영구 저장되었습니다.',
      });
    }

    // 2) 개별 상태 변경
    if (action === 'update_status' && body.id) {
      const updated = await prisma.workOrder.update({
        where: { id: Number(body.id) },
        data: {
          status: body.status,
          prodQty: body.prodQty !== undefined ? Number(body.prodQty) : undefined,
          completeTime: body.timeRange || body.completeTime,
          createdBy: body.assignee,
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('Work order save error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save work orders' },
      { status: 500 }
    );
  }
}
