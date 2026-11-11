import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { invalidateAuthCache, requireSession } from '@/lib/apiAuth';
import { clearLoginRateLimit } from '@/lib/rateLimit';

function normalizeUserRole(raw: unknown): string {
  const r = String(raw || '').trim();
  if (r.includes('시스템') || r.includes('관리자')) return '관리자';
  if (r.includes('영업')) return '영업';
  if (r.includes('구매')) return '구매';
  if (r.includes('재고')) return '재고';
  if (r.includes('생산')) return '생산';
  return '일반';
}

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64url');
}

// GET /api/admin/user
export async function GET() {
  const auth = await requireSession({ adminOnly: true });
  if (auth.error) return auth.error;

  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        loginId: true,
        name: true,
        department: true,
        position: true,
        tel: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        remark: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST /api/admin/user (사용자 단건/일괄 등록 및 수정, 비밀번호 초기화, 잠금해제)
export async function POST(req: NextRequest) {
  const auth = await requireSession({ adminOnly: true });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();

    // 1) 일괄 저장 (테이블 그리드에서 수정 후 상단 [저장] 클릭 시)
    if (Array.isArray(body.users)) {
      const results = [];
      for (const u of body.users) {
        if (!u.loginId && !u.userId) continue;
        const loginId = String(u.loginId || u.userId).trim();
        const updateData: any = {};
        if (u.name !== undefined || u.userName !== undefined) updateData.name = String(u.name || u.userName);
        if (u.department !== undefined) updateData.department = String(u.department);
        if (u.position !== undefined) updateData.position = String(u.position);
        if (u.tel !== undefined || u.phone !== undefined) updateData.tel = String(u.tel || u.phone);
        if (u.email !== undefined) updateData.email = String(u.email);
        if (u.role !== undefined || u.levelName !== undefined) {
          updateData.role = normalizeUserRole(u.role || u.levelName);
        }
        if (u.isActive !== undefined || u.status !== undefined) {
          updateData.isActive = u.isActive !== undefined ? !!u.isActive : u.status !== '잠김';
        }
        if (u.remark !== undefined) updateData.remark = String(u.remark);

        const updated = await prisma.user.updateMany({
          where: { loginId },
          data: updateData,
        });
        invalidateAuthCache(loginId);
        results.push({ loginId, count: updated.count });
      }
      return NextResponse.json({ success: true, count: results.length, data: results });
    }

    // 2) 계정 잠금 해제 / 활성화 액션
    if (body.action === 'unlock') {
      const loginId = String(body.loginId || '').trim();
      if (!loginId) {
        return NextResponse.json({ success: false, error: 'loginId가 필요합니다.' }, { status: 400 });
      }
      await prisma.user.updateMany({
        where: { loginId },
        data: { isActive: true },
      });
      await clearLoginRateLimit(`id:${loginId}`);
      invalidateAuthCache(loginId);
      return NextResponse.json({
        success: true,
        message: `[${loginId}] 계정의 잠금 상태 및 로그인 제한이 해제되었습니다.`,
      });
    }

    // 3) 비밀번호 초기화 전용 액션
    if (body.action === 'reset_password') {
      const loginId = String(body.loginId || '').trim();
      const { newPassword } = body;
      if (!loginId) {
        return NextResponse.json({ success: false, error: 'loginId가 필요합니다.' }, { status: 400 });
      }
      const trimmedNew = newPassword ? String(newPassword).trim() : '';
      if (trimmedNew && trimmedNew.length < 8) {
        return NextResponse.json(
          { success: false, error: '비밀번호는 최소 8자 이상이어야 합니다.' },
          { status: 400 }
        );
      }
      const rawPw = trimmedNew || generateTempPassword();
      const hashedPassword = await bcrypt.hash(rawPw, 12);
      await prisma.user.updateMany({
        where: { loginId },
        data: { password: hashedPassword, isActive: true },
      });
      await clearLoginRateLimit(`id:${loginId}`);
      invalidateAuthCache(loginId);
      return NextResponse.json({
        success: true,
        tempPassword: rawPw,
        message: `[${loginId}] 사용자의 임시 비밀번호가 발급되었습니다: ${rawPw}`,
      });
    }

    // 4) 단건 등록 및 수정 (모달 팝업 등)
    const loginId = String(body.loginId || body.userId || '').trim();
    const name = String(body.name || body.userName || '').trim();
    const { password, department, position, tel, email, role, isActive, remark } = body;

    if (!loginId || !name) {
      return NextResponse.json(
        { success: false, error: '아이디(loginId)와 이름(name)은 필수 입력 항목입니다.' },
        { status: 400 }
      );
    }

    const trimmedPassword = password ? String(password).trim() : '';
    if (trimmedPassword && trimmedPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: '비밀번호는 최소 8자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    const normalizedRole = normalizeUserRole(role);
    const updateData: any = {
      name,
      department: department || '',
      position: position || '',
      tel: tel || '',
      email: email || '',
      role: normalizedRole,
      isActive: isActive !== false,
      remark: remark || '',
    };

    if (trimmedPassword) {
      updateData.password = await bcrypt.hash(trimmedPassword, 12);
    }

    const existingUser = await prisma.user.findUnique({ where: { loginId }, select: { id: true } });
    const issuedTempPassword = !existingUser && !trimmedPassword ? generateTempPassword() : undefined;
    const hashedPassword = await bcrypt.hash(trimmedPassword || issuedTempPassword || generateTempPassword(), 12);

    const user = await prisma.user.upsert({
      where: { loginId },
      update: updateData,
      create: {
        loginId,
        password: hashedPassword,
        name,
        department: department || '',
        position: position || '',
        tel: tel || '',
        email: email || '',
        role: normalizedRole,
        isActive: isActive !== false,
        remark: remark || '',
      },
      select: {
        id: true,
        loginId: true,
        name: true,
        department: true,
        position: true,
        tel: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        remark: true,
      },
    });

    invalidateAuthCache(loginId);
    return NextResponse.json({
      success: true,
      data: user,
      ...(issuedTempPassword ? { tempPassword: issuedTempPassword } : {}),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '사용자 저장에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/user (사용자 삭제)
export async function DELETE(req: NextRequest) {
  const auth = await requireSession({ adminOnly: true });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const loginId = searchParams.get('loginId');

    if (!id && !loginId) {
      return NextResponse.json({ success: false, error: '삭제할 id 또는 loginId가 필요합니다.' }, { status: 400 });
    }

    if (loginId === 'admin' || Number(id) === 1) {
      return NextResponse.json({ success: false, error: '시스템 최고관리자(admin) 계정은 삭제할 수 없습니다.' }, { status: 403 });
    }

    if (id) {
      await prisma.user.delete({ where: { id: Number(id) } });
    } else if (loginId) {
      await prisma.user.delete({ where: { loginId } });
    }

    invalidateAuthCache(loginId || undefined);
    return NextResponse.json({ success: true, message: '사용자가 삭제되었습니다.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '사용자 삭제에 실패했습니다.' }, { status: 500 });
  }
}

