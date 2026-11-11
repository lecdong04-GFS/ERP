import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MENU_CATEGORIES } from '@/config/menuConfig';
import { requireSession, invalidateAuthCache } from '@/lib/apiAuth';
import { buildUserPermissionsMatrix } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/admin/permission?userId=123 (또는 ?loginId=admin)
export async function GET(req: NextRequest) {
  const auth = await requireSession({ adminOnly: true });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const userIdParam = searchParams.get('userId');
    const loginIdParam = searchParams.get('loginId');

    let user = null;
    if (userIdParam) {
      user = await prisma.user.findUnique({ where: { id: Number(userIdParam) } });
    } else if (loginIdParam) {
      user = await prisma.user.findUnique({ where: { loginId: loginIdParam } });
    } else {
      user = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
    }

    if (!user) {
      return NextResponse.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const savedPerms = await prisma.userPermission.findMany({
      where: { userId: user.id },
    });

    const fullPermissions = buildUserPermissionsMatrix(user, savedPerms);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        loginId: user.loginId,
        name: user.name,
        role: user.role,
        department: user.department,
      },
      data: fullPermissions,
      categories: MENU_CATEGORIES.map((c) => ({
        id: c.id,
        title: c.title,
        count: c.items.length,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/admin/permission (권한 일괄 저장 및 복사)
export async function POST(req: NextRequest) {
  const auth = await requireSession({ adminOnly: true });
  if (auth.error) return auth.error;

  try {
    const body = await req.json();

    // 1) 권한 복사 모드 (copyFromUserId -> copyToUserId)
    if (body.action === 'copy' || (body.copyFromUserId && body.copyToUserId)) {
      const fromId = Number(body.copyFromUserId);
      const toId = Number(body.copyToUserId);

      if (!fromId || !toId) {
        return NextResponse.json({ success: false, error: '출발/도착 사용자 ID가 필요합니다.' }, { status: 400 });
      }

      const sourcePerms = await prisma.userPermission.findMany({ where: { userId: fromId } });
      if (sourcePerms.length === 0) {
        return NextResponse.json({ success: false, error: '복사할 원본 사용자의 권한 데이터가 없습니다.' }, { status: 400 });
      }

      const ops = sourcePerms.map((p) =>
        prisma.userPermission.upsert({
          where: { userId_menuId: { userId: toId, menuId: p.menuId } },
          update: {
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
            canExport: p.canExport,
          },
          create: {
            userId: toId,
            menuId: p.menuId,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
            canExport: p.canExport,
          },
        })
      );

      await prisma.$transaction(ops);
      invalidateAuthCache();
      return NextResponse.json({ success: true, message: `${sourcePerms.length}개 메뉴 권한이 성공적으로 복사되었습니다.` });
    }

    // 2) 권한 일괄 저장 모드
    const permissions = body.permissions as any[];
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json({ success: false, error: '저장할 권한 데이터(permissions)가 필요합니다.' }, { status: 400 });
    }

    const CHUNK_SIZE = 50;
    for (let i = 0; i < permissions.length; i += CHUNK_SIZE) {
      const chunk = permissions.slice(i, i + CHUNK_SIZE);
      const ops = chunk
        .filter((p) => p.userId && p.menuId)
        .map((p) =>
          prisma.userPermission.upsert({
            where: {
              userId_menuId: {
                userId: Number(p.userId),
                menuId: String(p.menuId),
              },
            },
            update: {
              canRead: !!p.canRead,
              canWrite: !!p.canWrite,
              canDelete: !!p.canDelete,
              canExport: !!p.canExport,
            },
            create: {
              userId: Number(p.userId),
              menuId: String(p.menuId),
              canRead: !!p.canRead,
              canWrite: !!p.canWrite,
              canDelete: !!p.canDelete,
              canExport: !!p.canExport,
            },
          })
        );
      if (ops.length > 0) {
        await prisma.$transaction(ops);
      }
    }

    invalidateAuthCache();
    return NextResponse.json({
      success: true,
      message: `${permissions.length}개 메뉴 권한이 데이터베이스에 안전하게 저장되었습니다.`,
      count: permissions.length,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
