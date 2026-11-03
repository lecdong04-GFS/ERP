import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4">
      <h2 className="text-2xl font-bold mb-2">404 - 페이지를 찾을 수 없습니다</h2>
      <p className="text-slate-400 mb-4">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-semibold transition"
      >
        ERP 홈으로 이동
      </Link>
    </div>
  );
}
