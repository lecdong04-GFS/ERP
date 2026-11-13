'use client';

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { kstToday } from '@/lib/kst';
import {
  AdminUserItem,
  PagePermItem,
  ChangeRequestItem,
  SystemUsageSummaryItem,
  SystemUsageDetailItem,
  INITIAL_ADMIN_USERS,
  INITIAL_CHANGE_REQUESTS,
  INITIAL_SYSTEM_USAGE_SUMMARY,
  INITIAL_SYSTEM_USAGE_LOGS,
  generateDefaultPermissions,
} from '../data/adminData';

interface AdminContextType {
  // Users
  users: AdminUserItem[];
  setUsers: React.Dispatch<React.SetStateAction<AdminUserItem[]>>;
  updateUser: (user: AdminUserItem) => void;
  addUser: (user: AdminUserItem) => void;
  resetUserLogin: (userId: string) => void;
  resetUserPassword: (userId: string) => void;

  // Permissions
  selectedPermUserId: string;
  setSelectedPermUserId: (userId: string) => void;
  userPermMap: Record<string, PagePermItem[]>;
  updateUserPerm: (
    userId: string,
    pageCode: string,
    field: 'canRead' | 'canWrite',
    value: boolean
  ) => void;
  toggleAllRead: (userId: string, check: boolean) => void;
  toggleAllWrite: (userId: string, check: boolean) => void;
  copyUserPerm: (fromUserId: string, toUserId: string) => boolean;

  // Change Requests
  changeRequests: ChangeRequestItem[];
  setChangeRequests: React.Dispatch<React.SetStateAction<ChangeRequestItem[]>>;
  addChangeRequest: (req: ChangeRequestItem) => void;
  deleteChangeRequest: (id: number) => void;

  // System Usage
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  usageSummary: SystemUsageSummaryItem[];
  usageLogs: SystemUsageDetailItem[];
  selectedSummaryPageCode: string | null;
  setSelectedSummaryPageCode: (code: string | null) => void;
}

const AdminContext = createContext<AdminContextType | null>(null);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: session, status: sessionStatus } = useSession();
  const isAdminSession = useMemo(() => {
    const user = session?.user as Record<string, any> | undefined;
    if (!user) return false;
    return String(user.role || '').includes('관리자') || user.loginId === 'admin';
  }, [session]);

  // 1. Users
  const [users, setUsers] = useState<AdminUserItem[]>(INITIAL_ADMIN_USERS);

  // DB 사용자 로드 (관리자 세션일 때만 호출 — 비관리자 403 오류 방지)
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !isAdminSession) return;
    fetch('/api/admin/user')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const dbUsers: AdminUserItem[] = res.data.map((u: any, idx: number) => ({
            id: u.id || idx + 1,
            company: '(주)GFS',
            userId: u.loginId,
            userName: u.name,
            permLevel: u.role === '관리자' ? '00' : '03',
            levelName: u.role === '관리자' ? '시스템관리자' : u.role || '일반사용자',
            department: u.department || '(주)GFS',
            phone: u.tel || '010-0000-0000',
            email: u.email || `${u.loginId}@gfsfood.co.kr`,
            status: u.isActive ? '정상' : '잠김',
            lastLogin: u.lastLoginAt || '2026-10-30 08:30:00',
            empNo: String(1000 + idx),
            used: u.isActive !== false,
            remark: u.remark || '',
          }));
          // Merge with initial, replacing matching userIds
          setUsers((prev) => {
            const merged = [...dbUsers];
            prev.forEach((pu) => {
              if (!merged.some((mu) => mu.userId === pu.userId)) {
                merged.push(pu);
              }
            });
            return merged;
          });
        }
      })
      .catch((err) => console.error('Failed to load admin users from DB:', err));
  }, [sessionStatus, isAdminSession]);

  const updateUser = useCallback((updated: AdminUserItem) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gfs-user-updated', { detail: updated }));
    }
    fetch('/api/admin/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loginId: updated.userId,
        name: updated.userName,
        department: updated.department,
        tel: updated.phone,
        email: updated.email,
        role: updated.levelName || '일반',
        isActive: updated.status === '정상',
      }),
    }).catch((err) => console.error('Failed to sync user update to DB:', err));
  }, []);

  const addUser = useCallback((newUser: AdminUserItem) => {
    setUsers((prev) => [newUser, ...prev]);
    fetch('/api/admin/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loginId: newUser.userId,
        name: newUser.userName,
        department: newUser.department,
        tel: newUser.phone,
        email: newUser.email,
        role: newUser.levelName || '일반',
        isActive: true,
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.tempPassword) {
          alert(`[${newUser.userId}] 계정 생성 완료 — 초기 비밀번호: ${json.tempPassword}`);
        }
      })
      .catch((err) => console.error('Failed to sync new user to DB:', err));
  }, []);

  const resetUserLogin = useCallback((userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.userId === userId ? { ...u, status: '정상' } : u))
    );
    fetch('/api/admin/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlock', loginId: userId }),
    })
      .then((res) => res.json())
      .then((json) => {
        alert(json.message || json.error || `[${userId}] 계정 잠금 해제가 완료되었습니다.`);
      })
      .catch((err) => alert(`잠금 해제 요청 실패: ${err.message}`));
  }, []);

  const resetUserPassword = useCallback((userId: string) => {
    fetch('/api/admin/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password', loginId: userId }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          alert(`비밀번호 초기화 실패: ${json.error || '오류'}`);
          return;
        }
        alert(json.message || `[${userId}] 사용자의 임시 비밀번호가 발급되었습니다.`);
      })
      .catch((err) => alert(`비밀번호 초기화 실패: ${err.message}`));
  }, []);

  // 2. Permissions
  const [selectedPermUserId, setSelectedPermUserId] = useState<string>('heebee');
  const [userPermMap, setUserPermMap] = useState<Record<string, PagePermItem[]>>(() => {
    const map: Record<string, PagePermItem[]> = {};
    INITIAL_ADMIN_USERS.forEach((u) => {
      map[u.userId] = generateDefaultPermissions(u.permLevel);
    });
    return map;
  });

  const updateUserPerm = useCallback(
    (userId: string, pageCode: string, field: 'canRead' | 'canWrite', value: boolean) => {
      setUserPermMap((prev) => {
        const curList = prev[userId] || generateDefaultPermissions('03');
        const updatedList = curList.map((item) =>
          item.pageCode === pageCode ? { ...item, [field]: value } : item
        );
        return {
          ...prev,
          [userId]: updatedList,
        };
      });
    },
    []
  );

  const toggleAllRead = useCallback((userId: string, check: boolean) => {
    setUserPermMap((prev) => {
      const curList = prev[userId] || generateDefaultPermissions('03');
      const updatedList = curList.map((item) => ({ ...item, canRead: check }));
      return {
        ...prev,
        [userId]: updatedList,
      };
    });
  }, []);

  const toggleAllWrite = useCallback((userId: string, check: boolean) => {
    setUserPermMap((prev) => {
      const curList = prev[userId] || generateDefaultPermissions('03');
      const updatedList = curList.map((item) => ({ ...item, canWrite: check }));
      return {
        ...prev,
        [userId]: updatedList,
      };
    });
  }, []);

  const copyUserPerm = useCallback((fromUserId: string, toUserId: string): boolean => {
    let sourcePerms: PagePermItem[] | undefined;
    setUserPermMap((prev) => {
      sourcePerms = prev[fromUserId];
      if (!sourcePerms) return prev;
      return {
        ...prev,
        [toUserId]: sourcePerms.map((p) => ({ ...p })),
      };
    });
    return !!sourcePerms;
  }, []);

  // 3. Change Requests
  const [changeRequests, setChangeRequests] = useState<ChangeRequestItem[]>(INITIAL_CHANGE_REQUESTS);

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !isAdminSession) return;
    fetch('/api/admin/change-request')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const mapped: ChangeRequestItem[] = json.data.map((item: any, idx: number) => ({
            id: item.id || idx + 1,
            reqId: item.reqId || idx + 1001,
            reqDate: item.requestDate || item.reqDate || '2026-10-30',
            title: item.title || '변경요청',
            priority: Number(item.priority) || 3,
            result: item.status || item.result || '접수대기',
            execDate: item.resolvedDate || item.execDate || '',
            remark: item.remark || '',
            hasPhoto: item.hasPhoto || false,
            client: item.client || item.department || '(주)GFS',
            requester: item.requester || '관리자',
          }));
          setChangeRequests(mapped);
        }
      })
      .catch((err) => console.error('Fetch change requests failed:', err));
  }, [sessionStatus, isAdminSession]);

  const addChangeRequest = useCallback((req: ChangeRequestItem) => {
    setChangeRequests((prev) => [req, ...prev]);
    fetch('/api/admin/change-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reqDate: req.reqDate,
        requester: req.requester,
        client: req.client,
        title: req.title,
        priority: req.priority,
        result: req.result,
        remark: req.remark,
      }),
    }).catch((err) => console.error('Failed to sync change request to DB:', err));
  }, []);

  const deleteChangeRequest = useCallback((id: number) => {
    setChangeRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // 4. System Usage
  const [selectedDate, setSelectedDate] = useState<string>(() => kstToday());
  const [usageSummary, setUsageSummary] = useState<SystemUsageSummaryItem[]>(INITIAL_SYSTEM_USAGE_SUMMARY);
  const [usageLogs, setUsageLogs] = useState<SystemUsageDetailItem[]>(INITIAL_SYSTEM_USAGE_LOGS);
  const [selectedSummaryPageCode, setSelectedSummaryPageCode] = useState<string | null>('Uc_BOM');

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !isAdminSession) return;
    fetch('/api/admin/system-log')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data && json.data.length > 0) {
          const mapped: SystemUsageDetailItem[] = json.data.map((item: any, idx: number) => ({
            id: item.id || idx + 1,
            pageCode: item.pageCode || item.menuCode || 'Uc_BOM',
            actionName: item.actionName || item.actionType || '조회',
            userName: item.userName || '관리자',
            timestamp: item.timestamp || item.logDate || '2026-10-30 09:00:00',
            ipAddress: item.ipAddress || item.ip || '192.168.0.1',
            clientVersion: item.clientVersion || 'v1.0',
          }));
          setUsageLogs(mapped);
        }
      })
      .catch((err) => console.error('Fetch system logs failed:', err));
  }, [selectedDate, sessionStatus, isAdminSession]);

  return (
    <AdminContext.Provider
      value={{
        users,
        setUsers,
        updateUser,
        addUser,
        resetUserLogin,
        resetUserPassword,
        selectedPermUserId,
        setSelectedPermUserId,
        userPermMap,
        updateUserPerm,
        toggleAllRead,
        toggleAllWrite,
        copyUserPerm,
        changeRequests,
        setChangeRequests,
        addChangeRequest,
        deleteChangeRequest,
        selectedDate,
        setSelectedDate,
        usageSummary,
        usageLogs,
        selectedSummaryPageCode,
        setSelectedSummaryPageCode,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};

