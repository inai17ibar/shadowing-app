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
  advanced: "bg-amber-100 text-amber-700",
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
  return (
    <p className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
      <span className="size-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" aria-hidden />
      {label}
    </p>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-gray-800">{children}</p>;
}

/** Apple の塗りつぶしボタン（青・角丸いっぱい） */
export const primaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-blue-500 px-5 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-blue-600 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none";

/** Apple のグレーのボタン（青い文字） */
export const secondaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-gray-100 px-4 py-2 text-[15px] font-medium text-blue-500 transition-colors hover:bg-gray-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none";

export const card = "rounded-2xl bg-surface p-5 shadow-card";

/** 大見出し（iOS の Large Title） */
export const pageTitle = "text-[32px] leading-tight font-bold tracking-tight text-gray-900";

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
