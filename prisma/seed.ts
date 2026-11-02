/**
  * (주)GFS — Initial Database Seeder
 * 
 * 기존 하드코딩된 기초코드, 거래처, 계마스터, 제품, BOM 등
 * 기준정보 데이터를 SQLite 데이터베이스에 초기 적재합니다.
 */
import { PrismaClient } from '@prisma/client';
import { MASTER_CODE_CLASSES, SAMPLE_DETAIL_CODES } from '../src/components/master/data/masterCodeData';
import { GYE_MASTER_LIST } from '../src/components/production/data/productionMasterData';
import { SALES_PRODUCT_MASTER, GS_CENTERS_MASTER } from '../src/components/sales/data/salesMasterData';
import { INITIAL_FIXED_OVERHEADS } from '../src/components/cost/data/costData';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. 기초코드 클래스 및 상세코드 등록
  console.log('1. Seeding Base Codes...');
  for (const cls of MASTER_CODE_CLASSES) {
    await prisma.baseCodeClass.upsert({
      where: { id: cls.id },
      update: { name: cls.name, sortOrder: cls.order, remark: cls.remark, isUsed: cls.used },
      create: {
        id: cls.id,
        name: cls.name,
        sortOrder: cls.order,
        remark: cls.remark,
        isUsed: cls.used,
      },
    });

    const details = SAMPLE_DETAIL_CODES[cls.id] || [];
    for (const d of details) {
      await prisma.baseCodeDetail.upsert({
        where: {
          classId_code: {
            classId: d.classId,
            code: d.code,
          },
        },
        update: {
          name: d.name,
          sortOrder: d.order,
          val1: d.val1,
          val2: d.val2,
          val3: d.val3,
          val4: d.val4,
          val5: d.val5,
          remark: d.remark,
          isUsed: d.used,
        },
        create: {
          classId: d.classId,
          code: d.code,
          name: d.name,
          sortOrder: d.order,
          val1: d.val1,
          val2: d.val2,
          val3: d.val3,
          val4: d.val4,
          val5: d.val5,
          remark: d.remark,
          isUsed: d.used,
        },
      });
    }
  }

  // 2. 46개 계 마스터 등록
  console.log('2. Seeding Gye Masters (46 departments)...');
  for (const gye of GYE_MASTER_LIST) {
    await prisma.gyeMaster.upsert({
      where: { id: gye.id },
      update: { name: gye.name, sortOrder: gye.no },
      create: {
        id: gye.id,
        name: gye.name,
        sortOrder: gye.no,
      },
    });
  }

  // 3. GS 센터 등록
  console.log('3. Seeding GS Centers...');
  for (const center of GS_CENTERS_MASTER) {
    const existing = await prisma.gsCenter.findFirst({
      where: { centerCode: center.centerCode, shift: center.shift },
    });
    if (!existing) {
      await prisma.gsCenter.create({
        data: {
          centerCode: center.centerCode,
          centerName: center.centerName,
          shift: center.shift,
          status: center.status,
          abbrevName: center.abbrevName,
        },
      });
    }
  }

  // 4. 주요 거래처 등록 (매입처 5개 기본 샘플)
  console.log('4. Seeding Partners...');
  const samplePartners = [
    { id: 'V001', name: 'CJ제일제당(주)', partnerType: 'P', bizNo: '104-86-09535', ceoName: '손경식', contactPerson: '김철수', tel: '02-6740-1114', orderDay: '매일', leadTime: 1 },
    { id: 'V002', name: '대상(주)', partnerType: 'P', bizNo: '109-81-14857', ceoName: '임정배', contactPerson: '이영희', tel: '02-2220-9500', orderDay: '월,수,금', leadTime: 2 },
    { id: 'V003', name: '오뚜기(주)', partnerType: 'P', bizNo: '138-81-03294', ceoName: '함영준', contactPerson: '박민수', tel: '031-421-2135', orderDay: '매일', leadTime: 1 },
    { id: 'V004', name: '동원에프앤비(주)', partnerType: 'P', bizNo: '214-86-42777', ceoName: '김성용', contactPerson: '정하나', tel: '02-589-3000', orderDay: '화,목,토', leadTime: 2 },
    { id: 'V005', name: '풀무원식품(주)', partnerType: 'P', bizNo: '301-81-30386', ceoName: '이우봉', contactPerson: '최동욱', tel: '02-2040-4500', orderDay: '매일', leadTime: 1 },
    { id: 'S001', name: 'GS리테일', partnerType: 'S', bizNo: '116-81-25445', ceoName: '허연수', contactPerson: '영업본부', tel: '02-2007-0114', orderDay: '매일', leadTime: 0 },
  ];
  for (const p of samplePartners) {
    await prisma.partner.upsert({
      where: { id: p.id },
      update: { name: p.name, partnerType: p.partnerType, bizNo: p.bizNo, ceoName: p.ceoName, contactPerson: p.contactPerson, tel: p.tel, orderDay: p.orderDay, leadTime: p.leadTime },
      create: p,
    });
  }

  // 5. 제품 마스터 및 가격 등록
  console.log('5. Seeding Sales Products...');
  for (const prod of SALES_PRODUCT_MASTER) {
    const product = await prisma.product.upsert({
      where: { productCode: prod.productCode },
      update: {
        name: prod.productName,
        spec: prod.spec,
        unit: prod.unit,
        category: prod.category,
        kind: prod.kind,
        shift: prod.shift,
        boxQty: prod.boxUnitQty,
      },
      create: {
        productCode: prod.productCode,
        name: prod.productName,
        spec: prod.spec,
        unit: prod.unit,
        category: prod.category,
        kind: prod.kind,
        shift: prod.shift,
        boxQty: prod.boxUnitQty,
      },
    });

    // 가격 이력 등록
    await prisma.productPrice.create({
      data: {
        productId: product.id,
        deliveryPrice: prod.unitPrice,
        logisticsRate: 3.28,
        effectiveDate: '2026-10-01',
      },
    });
  }

  // 6. 원재료/부자재 기본 샘플 등록
  console.log('6. Seeding Raw Materials...');
  const rawMaterials = [
    { code: 'RM001', name: '신동진 쌀(특)', spec: '20kg', unit: 'kg', category: '원재료', partnerId: 'V001', price: 2350, safetyStock: 500, minOrder: 100, orderUnit: 20 },
    { code: 'RM002', name: '스팸 클래식', spec: '1.81kg', unit: '캔', category: '원재료', partnerId: 'V001', price: 18500, safetyStock: 120, minOrder: 12, orderUnit: 6 },
    { code: 'RM003', name: '국산 김밥용 김', spec: '100매', unit: '속', category: '원재료', partnerId: 'V004', price: 8900, safetyStock: 200, minOrder: 50, orderUnit: 10 },
    { code: 'RM004', name: '동원 참치살', spec: '1.88kg', unit: '캔', category: '원재료', partnerId: 'V004', price: 16200, safetyStock: 150, minOrder: 24, orderUnit: 6 },
    { code: 'RM005', name: '오뚜기 마요네즈', spec: '3.2kg', unit: '통', category: '원재료', partnerId: 'V003', price: 12400, safetyStock: 80, minOrder: 10, orderUnit: 4 },
    { code: 'RM006', name: '종가집 맛김치', spec: '10kg', unit: 'box', category: '원재료', partnerId: 'V002', price: 34500, safetyStock: 60, minOrder: 10, orderUnit: 2 },
    { code: 'RM007', name: '체다 슬라이스 치즈', spec: '1kg(100매)', unit: '팩', category: '원재료', partnerId: 'V005', price: 9800, safetyStock: 100, minOrder: 20, orderUnit: 10 },
    { code: 'RM008', name: '한돈 제육 전지', spec: '1kg', unit: 'kg', category: '원재료', partnerId: 'V001', price: 8200, safetyStock: 300, minOrder: 50, orderUnit: 10 },
    { code: 'PM001', name: '삼각김밥 필름지', spec: '롤/1000매', unit: '롤', category: '부자재', partnerId: 'V003', price: 21000, safetyStock: 50, minOrder: 10, orderUnit: 5 },
    { code: 'PM002', name: '도시락 2단 투명용기', spec: '100ea', unit: 'box', category: '부자재', partnerId: 'V002', price: 14500, safetyStock: 80, minOrder: 20, orderUnit: 10 },
  ];

  for (const m of rawMaterials) {
    const mat = await prisma.product.upsert({
      where: { productCode: m.code },
      update: {
        name: m.name,
        spec: m.spec,
        unit: m.unit,
        category: m.category,
        partnerId: m.partnerId,
        safetyStockQty: m.safetyStock,
        minOrderQty: m.minOrder,
        orderUnitQty: m.orderUnit,
      },
      create: {
        productCode: m.code,
        name: m.name,
        spec: m.spec,
        unit: m.unit,
        category: m.category,
        partnerId: m.partnerId,
        safetyStockQty: m.safetyStock,
        minOrderQty: m.minOrder,
        orderUnitQty: m.orderUnit,
      },
    });

    // 구매단가 등록
    await prisma.productPrice.create({
      data: {
        productId: mat.id,
        purchasePrice: m.price,
        effectiveDate: '2026-10-01',
      },
    });

    // 기본 재고 적재 (LOT)
    await prisma.inventory.create({
      data: {
        productId: mat.id,
        productCode: m.code,
        productName: m.name,
        category: m.category,
        lotNo: `LOT-20261028-${m.code}`,
        expiryDate: '2026-11-28',
        warehouse: m.category === '부자재' ? '부재료보관고' : '상온보관고',
        currentQty: m.safetyStock * 1.5,
        unit: m.unit,
        unitPrice: m.price,
        stockAmount: m.safetyStock * 1.5 * m.price,
        lastInDate: '2026-10-28',
      },
    });
  }

  // 7. 고정 간접비 등록
  console.log('7. Seeding Fixed Overheads...');
  for (const oh of INITIAL_FIXED_OVERHEADS) {
    await prisma.overheadFixed.upsert({
      where: {
        costMonth_costItem: {
          costMonth: '2026-10',
          costItem: oh.costItem,
        },
      },
      update: {
        totalCost: oh.totalCost,
        remark: oh.remark,
      },
      create: {
        costMonth: '2026-10',
        costItem: oh.costItem,
        totalCost: oh.totalCost,
        remark: oh.remark,
      },
    });
  }

  // 8. 기본 사용자(관리자/직원) 등록
  console.log('8. Seeding Default Users...');
  const adminUser = await prisma.user.upsert({
    where: { loginId: 'admin' },
    update: {},
    create: {
      loginId: 'admin',
      password: 'password123!', // 실운영 시 bcrypt 해시 적용
      name: '시스템관리자',
      department: '전산운영팀',
      position: '팀장',
      role: '관리자',
      email: 'admin@gfs.co.kr',
    },
  });

  const prodUser = await prisma.user.upsert({
    where: { loginId: 'gfs_prod' },
    update: {},
    create: {
      loginId: 'gfs_prod',
      password: 'password123!',
      name: '김생산',
      department: '생산관리팀',
      position: '과장',
      role: '생산',
      email: 'prod@gfs.co.kr',
    },
  });

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

