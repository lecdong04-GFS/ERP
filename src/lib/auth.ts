import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordLoginFailure,
} from '@/lib/rateLimit';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'GFS-ERP 로그인',
      credentials: {
        loginId: { label: '사번/아이디', type: 'text' },
        password: { label: '비밀번호', type: 'password' },
      },
      async authorize(credentials, req) {
        const loginId = credentials?.loginId?.trim() || '';
        const password = credentials?.password || '';
        if (!loginId || !password) {
          throw new Error('사번과 비밀번호를 입력하세요.');
        }

        const rawFwd = (req?.headers as Record<string, string | undefined> | undefined)?.['x-forwarded-for'];
        const rawReal = (req?.headers as Record<string, string | undefined> | undefined)?.['x-real-ip'];
        const clientIp = String(rawFwd || rawReal || '').split(',')[0].trim();
        const limitKeys = [`id:${loginId}`, ...(clientIp ? [`ip:${clientIp}`] : [])];

        for (const key of limitKeys) {
          const rl = await checkLoginRateLimit(key);
          if (!rl.allowed) {
            throw new Error(`로그인 시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도하세요.`);
          }
        }

        const user = await prisma.user.findUnique({
          where: { loginId },
          select: {
            id: true,
            loginId: true,
            password: true,
            name: true,
            email: true,
            role: true,
            department: true,
            position: true,
            isActive: true,
          },
        });

        if (!user) {
          await Promise.all(limitKeys.map((key) => recordLoginFailure(key)));
          throw new Error('존재하지 않는 사번입니다.');
        }

        if (!user.isActive) {
          await Promise.all(limitKeys.map((key) => recordLoginFailure(key)));
          throw new Error('비활성화된 계정입니다. 관리자에게 문의하세요.');
        }

        // bcrypt 해시 비밀번호만 허용 (평문 폴백 제거)
        const isValid =
          user.password.startsWith('$2') && (await bcrypt.compare(password, user.password));

        if (!isValid) {
          await Promise.all(limitKeys.map((key) => recordLoginFailure(key)));
          throw new Error('비밀번호가 일치하지 않습니다.');
        }

        await Promise.all(limitKeys.map((key) => clearLoginRateLimit(key)));

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
            ipAddress: clientIp,
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

/** 사용자 역할 타입 (실제 접근 권한은 DB UserPermission + permissions.ts 기준) */
export type UserRole = '관리자' | '일반' | '생산' | '영업' | '구매' | '재고';

