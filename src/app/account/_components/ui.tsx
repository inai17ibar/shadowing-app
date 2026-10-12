"use client";

import type { ReactNode } from "react";

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-6 shadow-card">
      <h2 className="text-[19px] font-semibold text-gray-900">{title}</h2>
      {description && <div className="mt-1 text-sm text-gray-500 leading-relaxed">{description}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40",
  secondary: "bg-gray-100 text-blue-500 hover:bg-gray-200 disabled:opacity-40",
  danger: "bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full px-4 py-2 text-[15px] font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** iOS の入力欄（グレーの塗り・枠線なし。入力中だけ青いリング） */
export const inputClass =
  "rounded-xl border-0 bg-gray-100 px-3.5 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/60";

export type NoticeState = { kind: "info" | "success" | "error"; text: string } | null;

const NOTICE_STYLES = {
  info: "bg-blue-50 text-blue-800",
  success: "bg-green-50 text-green-800",
  error: "bg-red-50 text-red-800",
};

export function Notice({ notice }: { notice: NoticeState }) {
  if (!notice) return null;
  return (
    <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${NOTICE_STYLES[notice.kind]}`}>
      {notice.text}
    </p>
  );
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}
