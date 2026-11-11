'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { PermissionAction, PermissionRecord } from '@/lib/permissions';

interface UserProfileInfo {
  id: number;
  loginId: string;
  name: string;
  department: string;
  position: string;
  role: string;
  isAdmin: boolean;
}

interface PermissionsContextValue {
  loaded: boolean;
  isAdmin: boolean;
  profile: UserProfileInfo | null;
  permissions: PermissionRecord[];
  canAccessMenu: (menuId: string, categoryId?: string, action?: PermissionAction) => boolean;
  canAccessCategory: (categoryId: string, action?: PermissionAction) => boolean;
  reloadPermissions: () => void;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, data: session } = useSession();
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<UserProfileInfo | null>(null);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [reloadTick, setReloadTick] = useState(0);

  const sessionUser = session?.user as Record<string, any> | undefined;
  const sessionIsAdmin =
    Boolean(sessionUser) &&
    (String(sessionUser?.role || '').includes('관리자') || sessionUser?.loginId === 'admin');

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoaded(false);
      setProfile(null);
      setPermissions([]);
      return;
    }

    let cancelled = false;
    fetch('/api/user/me')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.user) {
          setProfile(json.user);
          setPermissions(Array.isArray(json.permissions) ? json.permissions : []);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [status, reloadTick]);

  const isAdmin = profile ? profile.isAdmin : sessionIsAdmin;

  const permMap = useMemo(() => {
    const map = new Map<string, PermissionRecord>();
    for (const p of permissions) {
      map.set(p.menuId, p);
    }
    return map;
  }, [permissions]);

  const canAccessMenu = (menuId: string, categoryId?: string, action: PermissionAction = 'read'): boolean => {
    if (isAdmin) return true;
    if (!loaded) {
      if (categoryId === 'admin') return false;
      if (action === 'write') return categoryId !== 'cost' && categoryId !== 'admin';
      if (action === 'delete') return false;
      return true;
    }
    const found = permMap.get(menuId);
    if (!found) {
      if (categoryId === 'admin') return false;
      if (action === 'write') return categoryId !== 'cost' && categoryId !== 'admin';
      if (action === 'delete') return false;
      return true;
    }
    if (action === 'read') return found.canRead;
    if (action === 'write') return found.canWrite;
    if (action === 'delete') return found.canDelete;
    return found.canExport;
  };

  const canAccessCategory = (categoryId: string, action: PermissionAction = 'read'): boolean => {
    if (isAdmin) return true;
    if (!loaded) {
      if (categoryId === 'admin') return false;
      return action === 'read' || action === 'export';
    }
    const catItems = permissions.filter((p) => p.categoryId === categoryId);
    if (catItems.length === 0) return categoryId !== 'admin';
    return catItems.some((item) => {
      if (action === 'read') return item.canRead;
      if (action === 'write') return item.canWrite;
      if (action === 'delete') return item.canDelete;
      return item.canExport;
    });
  };

  return (
    <PermissionsContext.Provider
      value={{
        loaded,
        isAdmin,
        profile,
        permissions,
        canAccessMenu,
        canAccessCategory,
        reloadPermissions: () => setReloadTick((v) => v + 1),
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
};

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error('usePermissions must be used within PermissionsProvider');
  }
  return ctx;
}
