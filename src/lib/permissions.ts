import { ALL_MENU_ITEMS } from '@/config/menuConfig';

export interface PermissionRecord {
  id: number;
  userId: number;
  loginId: string;
  userName: string;
  menuId: string;
  menuName: string;
  categoryId: string;
  categoryName: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canExport: boolean;
  seq: number;
}

export interface SavedUserPerm {
  id: number;
  menuId: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canExport: boolean;
}

export type PermissionAction = 'read' | 'write' | 'delete' | 'export';

export function isAdminUser(user?: { role?: string | null; loginId?: string | null } | null): boolean {
  if (!user) return false;
  return String(user.role || '').includes('관리자') || user.loginId === 'admin';
}

export function getDefaultPermissionFlags(isAdmin: boolean, categoryId: string) {
  return {
    canRead: isAdmin ? true : categoryId !== 'admin',
    canWrite: isAdmin ? true : !['admin', 'cost'].includes(categoryId),
    canDelete: isAdmin,
    canExport: isAdmin ? true : categoryId !== 'admin',
  };
}

export function buildUserPermissionsMatrix(
  user: { id: number; loginId: string; name: string; role: string },
  savedPerms: SavedUserPerm[]
): PermissionRecord[] {
  const permByMenu = new Map(savedPerms.map((p) => [p.menuId, p]));
  const isAdmin = isAdminUser(user);

  return ALL_MENU_ITEMS.map((item, idx) => {
    const saved = permByMenu.get(item.id);
    if (saved) {
      return {
        id: saved.id,
        userId: user.id,
        loginId: user.loginId,
        userName: user.name,
        menuId: item.id,
        menuName: item.title,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        canRead: saved.canRead,
        canWrite: saved.canWrite,
        canDelete: saved.canDelete,
        canExport: saved.canExport,
        seq: idx + 1,
      };
    }

    const defaults = getDefaultPermissionFlags(isAdmin, item.categoryId);
    return {
      id: -idx - 1,
      userId: user.id,
      loginId: user.loginId,
      userName: user.name,
      menuId: item.id,
      menuName: item.title,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      ...defaults,
      seq: idx + 1,
    };
  });
}

function getActionFlag(
  perm: { canRead: boolean; canWrite: boolean; canDelete: boolean; canExport: boolean },
  action: PermissionAction
): boolean {
  switch (action) {
    case 'read':
      return perm.canRead;
    case 'write':
      return perm.canWrite;
    case 'delete':
      return perm.canDelete;
    case 'export':
      return perm.canExport;
  }
}

export function hasModulePermission(
  matrix: PermissionRecord[],
  isAdmin: boolean,
  opts: { menuId?: string; categoryId?: string; action: PermissionAction }
): boolean {
  if (isAdmin) return true;

  if (opts.menuId) {
    const found = matrix.find((p) => p.menuId === opts.menuId);
    if (found) return getActionFlag(found, opts.action);
  }

  if (opts.categoryId) {
    const catPerms = matrix.filter((p) => p.categoryId === opts.categoryId);
    if (catPerms.length > 0) {
      return catPerms.some((p) => getActionFlag(p, opts.action));
    }
    return getActionFlag(getDefaultPermissionFlags(false, opts.categoryId), opts.action);
  }

  return true;
}
