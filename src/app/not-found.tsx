import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <p className="mb-4 text-4xl text-indigo-400/40">∞</p>
      <p className="mb-6 text-sm text-gray-400">页面不存在</p>
      <Link
        href="/"
        className="text-xs text-indigo-500 transition-colors hover:text-indigo-600"
      >
        ← 返回首页
      </Link>
    </main>
  );
}
