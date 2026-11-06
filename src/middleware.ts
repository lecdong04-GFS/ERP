import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

const secret = process.env.NEXTAUTH_SECRET;
if (process.env.NODE_ENV === 'production' && !secret) {
  throw new Error('NEXTAUTH_SECRET 환경변수가 설정되지 않았습니다.');
}

export default withAuth(
  function middleware(req) {
    const role = (req.nextauth.token as any)?.role;
    if (req.nextUrl.pathname.startsWith('/api/admin') && role !== '관리자') {
      return NextResponse.json(
        { success: false, error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }
    return NextResponse.next();
  },
  {
    pages: {
      signIn: '/login',
    },
    ...(secret ? { secret } : {}),
    callbacks: {
      authorized: ({ token }) => !!token,
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
     * - /favicon.ico, /icon, /images 등 정적 파일
     */
    '/((?!login|api/auth|_next/static|_next/image|favicon\\.ico|icon|images|pic|logo|_not-found).*)',
  ],
};

