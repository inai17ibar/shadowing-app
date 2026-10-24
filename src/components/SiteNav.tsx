"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";

const PRIMARY = [
  { href: "/today", label: "今日の課題" },
  { href: "/catalog", label: "教材" },
  { href: "/texts", label: "自分の文章" },
  { href: "/progress", label: "記録" },
];

const SECONDARY = [
  { href: "/youtube", label: "YouTube" },
  { href: "/reader", label: "テキスト" },
  { href: "/library", label: "ライブラリ" },
];

/** 音の波形を模したロゴ（紫から青へのグラデーション。色は globals.css の --logo-from / --logo-to） */
export function LogoMark({ className = "" }: { className?: string }) {
  // 同じページに複数置いても、グラデーションの id がぶつからないようにする
  const gradientId = `logo-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="3" y1="3" x2="21.2" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--logo-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-to)" }} />
        </linearGradient>
      </defs>
      {[3, 7, 11, 15, 19].map((x, i) => {
        const h = [6, 12, 18, 12, 8][i];
        return <rect key={x} x={x} y={12 - h / 2} width="2.2" height={h} rx="1.1" fill={`url(#${gradientId})`} />;
      })}
    </svg>
  );
}

/** Apple のサイトのような、すりガラスの細いナビゲーションバー */
export default function SiteNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const link = (l: { href: string; label: string }) => (
    <Link
      key={l.href}
      href={l.href}
      aria-current={isActive(l.href) ? "page" : undefined}
      className={`shrink-0 rounded-full px-3 py-1 text-[13px] transition-colors ${
        isActive(l.href) ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {l.label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-separator bg-[color-mix(in_srgb,var(--color-canvas)_78%,transparent)] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 text-gray-900">
          <LogoMark className="size-5" />
          <span className="text-[17px] font-semibold tracking-tight">Shadowing</span>
        </Link>
        <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]">
          {PRIMARY.map(link)}
          <span className="mx-2 h-4 w-px shrink-0 bg-gray-200" aria-hidden />
          {SECONDARY.map(link)}
        </nav>
        <Link
          href="/account"
          aria-label="アカウント"
          aria-current={isActive("/account") ? "page" : undefined}
          className={`shrink-0 rounded-full p-1 transition-colors ${
            isActive("/account") ? "text-blue-500" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <circle cx="12" cy="12" r="9.25" />
            <circle cx="12" cy="10" r="3.25" />
            <path d="M5.9 18.2c1.4-2 3.6-3.2 6.1-3.2s4.7 1.2 6.1 3.2" strokeLinecap="round" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
