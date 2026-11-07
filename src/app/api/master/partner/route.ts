import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/master/partner?type=P&search=CJ&includeProducts=true
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const isUsed = searchParams.get('isUsed');

    const where: any = {};
    if (type && type !== 'ALL') where.partnerType = type;
    if (isUsed === 'true') where.isUsed = true;
    if (isUsed === 'false') where.isUsed = false;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { id: { contains: search } },
        { contactPerson: { contains: search } },
        { bizNo: { contains: search } },
        { ceoName: { contains: search } },
      ];
    }

    const partners = await prisma.partner.findMany({
      where,
      include: {
        _count: {
          select: {
            products: true,
            purchaseOrders: true,
            receivings: true,
          },
        },
        products: {
          select: {
            id: true,
            productCode: true,
            name: true,
            spec: true,
            unit: true,
            category: true,
            kind: true,
            prices: {
              orderBy: { effectiveDate: 'desc' },
              take: 1,
            },
          },
          take: 50,
          orderBy: { productCode: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });

    return NextResponse.json({ success: true, data: partners });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch partners' },
      { status: 500 }
    );
  }
}

// POST /api/master/partner (단건 또는 일괄 저장/수정)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 일괄 저장 지원 (Array)
    if (Array.isArray(body)) {
      const results = [];
      for (const item of body) {
        if (!item.id || !item.name) continue;
        const upserted = await prisma.partner.upsert({
          where: { id: String(item.id).trim() },
          update: {
            name: String(item.name).trim(),
            partnerType: item.partnerType ?? 'P',
            bizNo: item.bizNo ?? '',
            ceoName: item.ceoName ?? '',
            bizType: item.bizType ?? '',
            bizCategory: item.bizCategory ?? '',
            zipCode: item.zipCode ?? '',
            address: item.address ?? '',
            addressDetail: item.addressDetail ?? '',
            tel: item.tel ?? '',
            fax: item.fax ?? '',
            email: item.email ?? '',
            contactPerson: item.contactPerson ?? '',
            contactTel: item.contactTel ?? '',
            bankName: item.bankName ?? '',
            bankAccount: item.bankAccount ?? '',
            bankHolder: item.bankHolder ?? '',
            taxType: item.taxType ?? 'T1',
            leadTime: item.leadTime !== undefined ? Number(item.leadTime) : 1,
            orderMethod: item.orderMethod ?? '',
            orderDay: item.orderDay ?? '',
            closingDate: item.closingDate ? String(item.closingDate) : '',
            paymentTerms: item.paymentTerms ?? '',
            remark: item.remark ?? '',
            isUsed: item.isUsed !== false,
          },
          create: {
            id: String(item.id).trim(),
            name: String(item.name).trim(),
            partnerType: item.partnerType ?? 'P',
            bizNo: item.bizNo ?? '',
            ceoName: item.ceoName ?? '',
            bizType: item.bizType ?? '',
            bizCategory: item.bizCategory ?? '',
            zipCode: item.zipCode ?? '',
            address: item.address ?? '',
            addressDetail: item.addressDetail ?? '',
            tel: item.tel ?? '',
            fax: item.fax ?? '',
            email: item.email ?? '',
            contactPerson: item.contactPerson ?? '',
            contactTel: item.contactTel ?? '',
            bankName: item.bankName ?? '',
            bankAccount: item.bankAccount ?? '',
            bankHolder: item.bankHolder ?? '',
            taxType: item.taxType ?? 'T1',
            leadTime: item.leadTime !== undefined ? Number(item.leadTime) : 1,
            orderMethod: item.orderMethod ?? '',
            orderDay: item.orderDay ?? '',
            closingDate: item.closingDate ? String(item.closingDate) : '',
            paymentTerms: item.paymentTerms ?? '',
            remark: item.remark ?? '',
            isUsed: item.isUsed !== false,
          },
        });
        results.push(upserted);
      }
      return NextResponse.json({
        success: true,
        message: `${results.length}건의 거래처가 성공적으로 저장되었습니다.`,
        data: results,
      });
    }

    // 단건 저장
    const {
      id,
      name,
      partnerType = 'P',
      bizNo = '',
      ceoName = '',
      bizType = '',
      bizCategory = '',
      zipCode = '',
      address = '',
      addressDetail = '',
      tel = '',
      fax = '',
      email = '',
      contactPerson = '',
      contactTel = '',
      bankName = '',
      bankAccount = '',
      bankHolder = '',
      taxType = 'T1',
      leadTime = 1,
      orderMethod = '',
      orderDay = '',
      closingDate = '',
      paymentTerms = '',
      remark = '',
      isUsed = true,
    } = body;

    if (!id || !name) {
      return NextResponse.json(
        { success: false, error: '거래처코드(id)와 거래처명(name)은 필수입니다.' },
        { status: 400 }
      );
    }

    const partner = await prisma.partner.upsert({
      where: { id: String(id).trim() },
      update: {
        name: String(name).trim(),
        partnerType,
        bizNo,
        ceoName,
        bizType,
        bizCategory,
        zipCode,
        address,
        addressDetail,
        tel,
        fax,
        email,
        contactPerson,
        contactTel,
        bankName,
        bankAccount,
        bankHolder,
        taxType,
        leadTime: Number(leadTime) || 1,
        orderMethod,
        orderDay,
        closingDate: String(closingDate),
        paymentTerms,
        remark,
        isUsed: isUsed !== false,
      },
      create: {
        id: String(id).trim(),
        name: String(name).trim(),
        partnerType,
        bizNo,
        ceoName,
        bizType,
        bizCategory,
        zipCode,
        address,
        addressDetail,
        tel,
        fax,
        email,
        contactPerson,
        contactTel,
        bankName,
        bankAccount,
        bankHolder,
        taxType,
        leadTime: Number(leadTime) || 1,
        orderMethod,
        orderDay,
        closingDate: String(closingDate),
        paymentTerms,
        remark,
        isUsed: isUsed !== false,
      },
    });

    return NextResponse.json({ success: true, data: partner });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save partner' },
      { status: 500 }
    );
  }
}

// DELETE /api/master/partner?id=V001 (삭제 또는 비활성화)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: '거래처코드(id)가 필요합니다.' },
        { status: 400 }
      );
    }

    // 연관 데이터 확인
    const countCheck = await prisma.partner.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true, purchaseOrders: true, receivings: true } },
      },
    });

    if (!countCheck) {
      return NextResponse.json({ success: false, error: '거래처를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { products, purchaseOrders, receivings } = countCheck._count;
    if (products > 0 || purchaseOrders > 0 || receivings > 0) {
      // 연관 데이터가 있는 경우 소프트 삭제 (isUsed = false) 처리
      const updated = await prisma.partner.update({
        where: { id },
        data: { isUsed: false },
      });
      return NextResponse.json({
        success: true,
        message: `연결된 데이터(품목 ${products}종, 발주 ${purchaseOrders}건)가 존재하여 미사용(비활성화)으로 전환되었습니다.`,
        data: updated,
      });
    }

    // 연관 데이터가 없으면 물리 삭제
    await prisma.partner.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: '거래처가 성공적으로 영구 삭제되었습니다.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete partner' },
      { status: 500 }
    );
  }
}
