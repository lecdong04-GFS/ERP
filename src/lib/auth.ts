import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'GFS-ERP 로그인',
      credentials: {
        loginId: { label: '사번/아이디', type: 'text' },
        password: { label: '비밀번호', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.loginId || !credentials?.password) {
          throw new Error('사번과 비밀번호를 입력하세요.');
        }

        const user = await prisma.user.findUnique({
          where: { loginId: credentials.loginId },
          include: { permissions: true },
        });

        if (!user) {
          throw new Error('존재하지 않는 사번입니다.');
        }

        if (!user.isActive) {
          throw new Error('비활성화된 계정입니다. 관리자에게 문의하세요.');
        }

        // bcrypt 해시 비교 (해시되지 않은 레거시 비밀번호도 지원)
        let isValid = false;
        if (user.password.startsWith('$2')) {
          isValid = await bcrypt.compare(credentials.password, user.password);
        } else {
          // 레거시 평문 비밀번호 (시드 데이터 등)
          isValid = user.password === credentials.password;
          if (isValid) {
            // 최초 로그인 시 bcrypt 해시로 자동 마이그레이션
            const hashed = await bcrypt.hash(credentials.password, 12);
            await prisma.user.update({
              where: { id: user.id },
              data: { password: hashed },
            });
          }
        }

        if (!isValid) {
          throw new Error('비밀번호가 일치하지 않습니다.');
        }

        // 최종 로그인 시각 업데이트
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date().toISOString() },
        });

        // 로그인 감사 기록
        await prisma.systemLog.create({
          data: {
            logDate: new Date().toISOString(),
            userId: user.id,
            loginId: user.loginId,
            userName: user.name,
            action: '로그인',
            menuId: 'login',
            menuName: '로그인',
            detail: `${user.name}(${user.loginId}) 로그인 성공`,
          },
        });

        return {
          id: String(user.id),
          loginId: user.loginId,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          position: user.position,
        };
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60, // 12시간
  },

  jwt: {
    maxAge: 12 * 60 * 60,
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.loginId = (user as any).loginId;
        token.role = (user as any).role;
        token.department = (user as any).department;
        token.position = (user as any).position;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).loginId = token.loginId;
        (session.user as any).role = token.role;
        (session.user as any).department = token.department;
        (session.user as any).position = token.position;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

/** 역할(role) 기반 접근 권한 체크 */
export type UserRole = '관리자' | '일반' | '생산' | '영업' | '구매' | '재고';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  '관리자': ['*'], // 전체 접근
  '영업': ['sales', 'dashboard', 'master'],
  '구매': ['purchase', 'dashboard', 'master'],
  '생산': ['production', 'dashboard', 'master', 'inventory'],
  '재고': ['inventory', 'dashboard', 'master'],
  '일반': ['dashboard', 'master'],
};

export function hasModuleAccess(role: string, moduleId: string): boolean {
  const perms = ROLE_PERMISSIONS[role as UserRole];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return perms.includes(moduleId);
}

