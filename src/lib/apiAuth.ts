import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  buildUserPermissionsMatrix,
  hasModulePermission,
  isAdminUser,
  PermissionAction,
  PermissionRecord,
} from '@/lib/permissions';

export interface AuthenticatedUser {
  id: number | null;
  loginId: string;
  name: string;
  role: string;
  department: string;
  isAdmin: boolean;
}

interface CachedAuthRecord {
  expiresAt: number;
  userId: number;
  loginId: string;
  name: string;
  role: string;
  department: string;
  isActive: boolean;
  isAdmin: boolean;
  permissions: PermissionRecord[];
}

const AUTH_CACHE_TTL_MS = 30_000;
const globalForAuthCache = globalThis as unknown as {
  gfsAuthCache?: Map<string, CachedAuthRecord>;
};

function getAuthCache(): Map<string, CachedAuthRecord> {
  if (!globalForAuthCache.gfsAuthCache) {
    globalForAuthCache.gfsAuthCache = new Map();
  }
  return globalForAuthCache.gfsAuthCache;
}

export function invalidateAuthCache(loginIdOrAll?: string): void {
  const cache = getAuthCache();
  if (!loginIdOrAll) {
    cache.clear();
    return;
  }
  cache.delete(loginIdOrAll);
}

async function loadCachedUserRecord(loginId: string): Promise<CachedAuthRecord | null> {
  const cache = getAuthCache();
  const now = Date.now();
  const cached = cache.get(loginId);
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const dbUser = await prisma.user.findUnique({
    where: { loginId },
    select: {
      id: true,
      loginId: true,
      name: true,
      role: true,
      department: true,
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
  });

  if (!dbUser) {
    cache.delete(loginId);
    return null;
  }

  const record: CachedAuthRecord = {
    expiresAt: now + AUTH_CACHE_TTL_MS,
    userId: dbUser.id,
    loginId: dbUser.loginId,
    name: dbUser.name,
    role: dbUser.role,
    department: dbUser.department,
    isActive: dbUser.isActive,
    isAdmin: isAdminUser(dbUser),
    permissions: buildUserPermissionsMatrix(dbUser, dbUser.permissions),
  };
  cache.set(loginId, record);
  return record;
}

export interface RequireSessionOptions {
  adminOnly?: boolean;
  categoryId?: string;
  menuId?: string;
  action?: PermissionAction;
  verifyDb?: boolean;
}

export type RequireSessionResult =
  | { user: AuthenticatedUser; error?: never }
  | { user?: never; error: NextResponse };

/**
 * API 라우트 공통 세션 및 권한 검증 헬퍼
 */
export async function requireSession(opts: RequireSessionOptions = {}): Promise<RequireSessionResult> {
  const session = await getServerSession(authOptions);
  const rawUser = session?.user as Record<string, any> | undefined;

  if (!rawUser) {
    return {
      error: NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 }),
    };
  }

  const loginId = String(rawUser.loginId || '').trim();
  const parsedId = Number(rawUser.id);
  const user: AuthenticatedUser = {
    id: Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null,
    loginId,
    name: String(rawUser.name || loginId || '사용자'),
    role: String(rawUser.role || '일반'),
    department: String(rawUser.department || ''),
    isAdmin: isAdminUser({ role: rawUser.role, loginId }),
  };

  if (opts.adminOnly && !user.isAdmin) {
    return {
      error: NextResponse.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 }),
    };
  }

  // 모든 인증된 API 요청에 대해 캐시된 DB 계정 활성 상태(isActive)를 검증 (30초 TTL)
  const needsDbCheck = true;
  if (needsDbCheck && loginId) {
    const dbRecord = await loadCachedUserRecord(loginId);
    if (!dbRecord || !dbRecord.isActive) {
      return {
        error: NextResponse.json(
          { success: false, error: '비활성화되었거나 존재하지 않는 계정입니다.' },
          { status: 401 }
        ),
      };
    }

    user.id = dbRecord.userId;
    user.name = dbRecord.name;
    user.role = dbRecord.role;
    user.department = dbRecord.department;
    user.isAdmin = dbRecord.isAdmin;

    if (opts.adminOnly && !user.isAdmin) {
      return {
        error: NextResponse.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 }),
      };
    }

    if (opts.categoryId || opts.menuId) {
      const allowed = hasModulePermission(dbRecord.permissions, user.isAdmin, {
        categoryId: opts.categoryId,
        menuId: opts.menuId,
        action: opts.action ?? 'write',
      });
      if (!allowed) {
        return {
          error: NextResponse.json(
            { success: false, error: '해당 기능에 대한 실행 권한이 없습니다.' },
            { status: 403 }
          ),
        };
      }
    }
  }

  return { user };
}

/** 요청 헤더에서 클라이언트 IP 추출 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    return fwd.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip')?.trim() || '';
}
