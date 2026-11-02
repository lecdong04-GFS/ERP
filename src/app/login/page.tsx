'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogIn, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginId.trim()) {
      setError('사번(아이디)을 입력하세요.');
      return;
    }
    if (!password) {
      setError('비밀번호를 입력하세요.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        loginId: loginId.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        setIsLoading(false);
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      setError('로그인 처리 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-gray-950 select-none">
      {/* 배경 장식 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-[420px] mx-4">
        {/* 시스템 타이틀 카드 */}
        <div className="bg-[#1e293b] border border-gray-600 rounded-t-lg px-6 py-4">
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/pic/logo.png"
              alt="(주)GFS 로고"
              className="h-9 w-auto object-contain drop-shadow-md"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-white font-black text-[16px] tracking-tight">
                  (주)GFS
                </h1>
                <span className="text-blue-300 font-mono text-[11px] font-bold bg-blue-950/80 border border-blue-600/60 px-1.5 py-0.2 rounded">
                  v2026.11.2
                </span>
              </div>
              <p className="text-gray-400 text-[11.5px] mt-0.5">
                식품 제조 유통 통합 엔터프라이즈 ERP
              </p>
            </div>
          </div>
        </div>

        {/* 로그인 폼 */}
        <div className="bg-[#f8fafc] border-x border-b border-gray-300 rounded-b-lg shadow-2xl">
          <div className="px-6 pt-5 pb-2">
            <h2 className="text-[13px] font-bold text-gray-800 mb-0.5">시스템 로그인</h2>
            <p className="text-[11px] text-gray-500">사번과 비밀번호를 입력하여 접속하세요.</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6">
            {/* 에러 메시지 */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-3 text-[11px]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 사번 입력 */}
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                사번 (아이디)
              </label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="아이디 입력"
                autoComplete="username"
                autoFocus
                className="w-full h-9 px-3 text-[12px] bg-white border border-gray-400 rounded shadow-inner focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400"
              />
            </div>

            {/* 비밀번호 입력 */}
            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                비밀번호
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full h-9 px-3 pr-9 text-[12px] bg-white border border-gray-400 rounded shadow-inner focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-9 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold text-[12px] rounded shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>인증 중...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>로그인</span>
                </>
              )}
            </button>
            <p className="mt-4 text-center text-[10px] text-gray-400">
              계정 문의는 정보전산팀에 연락하세요.
            </p>
          </form>

          {/* 하단 정보 */}
          <div className="bg-gray-100 border-t border-gray-300 rounded-b-lg px-6 py-2.5 flex items-center justify-between text-[10px] text-gray-500">
            <span>© 2026 (주)GFS 정보전산팀</span>
            <span className="text-gray-400">(주)GFS ERP v2026.5.25.2239</span>
          </div>
        </div>
      </div>
    </div>
  );
}

