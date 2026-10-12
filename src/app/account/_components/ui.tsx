"use client";

import type { ReactNode } from "react";

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {description && <div className="mt-1 text-sm text-gray-500 leading-relaxed">{description}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] text-white hover:opacity-90 disabled:opacity-50",
  secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
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
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-from)] focus-visible:ring-offset-2 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

export const inputClass =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-from)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-from)]/30";

export type NoticeState = { kind: "info" | "success" | "error"; text: string } | null;

const NOTICE_STYLES = {
  info: "bg-blue-50 text-blue-800 border-blue-200",
  success: "bg-green-50 text-green-800 border-green-200",
  error: "bg-red-50 text-red-800 border-red-200",
};

export function Notice({ notice }: { notice: NoticeState }) {
  if (!notice) return null;
  return (
    <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-lg border px-3 py-2 text-sm ${NOTICE_STYLES[notice.kind]}`}>
      {notice.text}
    </p>
  );
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}
