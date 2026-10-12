import type { Metadata, Viewport } from "next";
import "./globals.css";
import SessionNotice from "@/components/SessionNotice";
import SiteNav from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "Shadowing",
  description:
    "Practice language shadowing with YouTube videos, text-to-speech, and curated content. Improve your pronunciation and fluency.",
};

// ナビゲーションバーの色に合わせる（ライト / ダーク）
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}`,
          }}
        />
        <SiteNav />
        <SessionNotice />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-separator">
          <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-gray-500">
            Shadowing — 聞いて、すぐ真似して、話せる耳と口をつくる
          </div>
        </footer>
      </body>
    </html>
  );
}
