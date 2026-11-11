import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { PermissionsProvider } from '@/context/PermissionsContext';
import { ToastProvider } from '@/context/ToastContext';
import { ConfirmProvider } from '@/context/ConfirmContext';

const mono = localFont({
  src: './fonts/JetBrainsMono-latin.woff2',
  weight: '500 700',
  style: 'normal',
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '(주)GFS v2026.11.2 | 식품 제조 유통 통합 엔터프라이즈 ERP',
  description: '식품 제조 및 유통 통합 웹 ERP 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${mono.variable} antialiased min-h-screen h-screen flex flex-col overflow-hidden bg-slate-100`}>
        <AuthProvider>
          <PermissionsProvider>
            <ToastProvider>
              <ConfirmProvider>
                {children}
              </ConfirmProvider>
            </ToastProvider>
          </PermissionsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

