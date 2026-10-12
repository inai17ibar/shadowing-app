/**
 * Web版の /api/v1 画面で共通に使う小さな部品。
 */
import type { Level } from "./types";

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: "初級",
  intermediate: "中級",
  advanced: "上級",
};

export const LEVEL_COLORS: Record<Level, string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-blue-100 text-blue-700",
  advanced: "bg-purple-100 text-purple-700",
};

export const STEP_LABELS: Record<string, string> = {
  listen: "聞き取り",
  script: "スクリプト確認",
  mumbling: "マンブリング",
  overlapping: "オーバーラッピング",
  shadowing: "シャドーイング",
  record: "本番録音",
};

export function LevelBadge({ level }: { level: Level }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_COLORS[level]}`}>
      {LEVEL_LABELS[level]}
    </span>
  );
}

export function Loading({ label = "読み込み中…" }: { label?: string }) {
  return <p className="text-sm text-gray-400 py-10 text-center">{label}</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
      {message}
    </p>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-purple-50 border border-purple-100 p-3 text-sm text-gray-700">{children}</p>;
}

export const primaryButton =
  "inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] text-white text-sm font-semibold shadow-sm hover:opacity-95 disabled:opacity-50 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-from)] focus-visible:ring-offset-2";

export const secondaryButton =
  "inline-flex items-center justify-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-from)]";

export const card = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";

/** 「今日 10/12(月) 19:30」のような表示 */
export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function practiceHref(materialId: string, step?: string) {
  const q = new URLSearchParams({ material: materialId });
  if (step) q.set("step", step);
  return `/practice?${q.toString()}`;
}
