import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

const secret = process.env.NEXTAUTH_SECRET;
if (process.env.NODE_ENV === 'production' && !secret) {
  throw new Error('NEXTAUTH_SECRET 환경변수가 설정되지 않았습니다.');
}

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;

    if (pathname.startsWith('/api/')) {
      if (pathname.startsWith('/api/auth')) {
        return NextResponse.next();
      }

      const token = req.nextauth.token as Record<string, any> | null | undefined;
      if (!token) {
        return NextResponse.json(
          { success: false, error: '인증이 필요합니다.' },
          { status: 401 }
        );
      }

      if (pathname.startsWith('/api/admin')) {
        const role = String(token.role || '');
        const loginId = String(token.loginId || '');
        if (!role.includes('관리자') && loginId !== 'admin') {
          return NextResponse.json(
            { success: false, error: '관리자 권한이 필요합니다.' },
            { status: 403 }
          );
        }
      }
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: '/login',
    },
    ...(secret ? { secret } : {}),
    callbacks: {
      authorized: ({ req, token }) => {
        // API 경로는 307 로그인 HTML 리디렉션 대신 위 middleware()에서 JSON 401/403을 반환하도록 통과
        if (req.nextUrl.pathname.startsWith('/api/')) {
          return true;
        }
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 경로에 인증을 적용:
     * - /login (로그인 페이지)
     * - /api/auth (NextAuth 인증 API)
     * - /_next (Next.js 정적 리소스)
     * - /favicon.ico, /icon, /images, /reports 등 정적 파일
     */
    '/((?!login|api/auth|_next/static|_next/image|favicon\\.ico|icon|images|pic|logo|reports|_not-found).*)',
  ],
};

