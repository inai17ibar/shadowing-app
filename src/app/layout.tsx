import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shadowing Practice",
  description:
    "Practice language shadowing with YouTube videos, text-to-speech, and curated content. Improve your pronunciation and fluency.",
};

const navLinks = [
  { href: "/youtube", label: "YouTube" },
  { href: "/reader", label: "テキスト" },
  { href: "/library", label: "ライブラリ" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${inter.variable} h-full antialiased`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#667eea" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}`,
          }}
        />
        <header className="bg-[var(--brand-gradient)] bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] text-white shadow-md sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link
              href="/"
              className="text-xl font-bold tracking-tight hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-lg px-1"
            >
              Shadowing Practice
            </Link>
            <nav className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-6 text-center text-xs text-gray-400">
            Shadowing Practice — 語学力を鍛えるシャドーイング練習アプリ
          </div>
        </footer>
      </body>
    </html>
  );
}
