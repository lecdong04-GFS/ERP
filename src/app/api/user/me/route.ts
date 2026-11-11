import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/apiAuth';
import { buildUserPermissionsMatrix, isAdminUser } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/user/me — 현재 로그인 사용자 프로필 및 실효 권한 매트릭스 조회
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const dbUser = auth.user.loginId
      ? await prisma.user.findUnique({
          where: { loginId: auth.user.loginId },
          select: {
            id: true,
            loginId: true,
            name: true,
            department: true,
            position: true,
            role: true,
            isActive: true,
            permissions: {
              select: {
                id: true,
                menuId: true,
                canRead: true,
                canWrite: true,
                canDelete: true,
                canExport: true,
              },
            },
          },
        })
      : null;

    if (!dbUser || !dbUser.isActive) {
      return NextResponse.json(
        { success: false, error: '비활성화되었거나 존재하지 않는 사용자입니다.' },
        { status: 401 }
      );
    }

    const isAdmin = isAdminUser(dbUser);
    const permissions = buildUserPermissionsMatrix(dbUser, dbUser.permissions);

    return NextResponse.json({
      success: true,
      user: {
        id: dbUser.id,
        loginId: dbUser.loginId,
        name: dbUser.name,
        department: dbUser.department,
        position: dbUser.position,
        role: dbUser.role,
        isAdmin,
      },
      permissions,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '사용자 정보 조회 실패' },
      { status: 500 }
    );
  }
}
