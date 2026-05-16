"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LIBRARY_CONTENT, type LibraryEntry } from "@/lib/library-content";

const LEVEL_LABELS: Record<LibraryEntry["level"], string> = {
  beginner: "初級",
  intermediate: "中級",
  advanced: "上級",
};

const LEVEL_COLORS: Record<LibraryEntry["level"], string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-blue-100 text-blue-700",
  advanced: "bg-purple-100 text-purple-700",
};

export default function LibraryPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<LibraryEntry["level"] | "all">("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filtered =
    filter === "all"
      ? LIBRARY_CONTENT
      : LIBRARY_CONTENT.filter((e) => e.level === filter);

  async function handleStart(entry: LibraryEntry) {
    setLoadingId(entry.id);
    try {
      const res = await fetch("/api/texts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: entry.title,
          source_url: `library:${entry.id}`,
          paragraphs: entry.paragraphs,
        }),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      router.push(`/reader?id=${saved.id}`);
    } catch {
      sessionStorage.setItem(
        "library_text",
        JSON.stringify({
          title: entry.title,
          paragraphs: entry.paragraphs,
        }),
      );
      router.push("/reader?from=library");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        コンテンツライブラリ
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        著作権フリーのコンテンツを選んでシャドーイング練習しましょう
      </p>

      {/* Level filter */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {(["all", "beginner", "intermediate", "advanced"] as const).map(
          (level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === level
                  ? "bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {level === "all" ? "すべて" : LEVEL_LABELS[level]}
            </button>
          ),
        )}
      </div>

      {/* Content list */}
      <div className="space-y-3">
        {filtered.map((entry) => (
          <button
            key={entry.id}
            onClick={() => handleStart(entry)}
            disabled={loadingId === entry.id}
            className="group w-full text-left block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_COLORS[entry.level]}`}
                  >
                    {LEVEL_LABELS[entry.level]}
                  </span>
                  <span className="text-xs text-gray-400">{entry.source}</span>
                </div>
                <h2 className="font-medium text-gray-900 group-hover:text-[#667eea] transition-colors">
                  {entry.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1">{entry.description}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {entry.paragraphs.length}文
                </p>
              </div>
              <span className="shrink-0 text-sm text-[#667eea] font-medium group-hover:text-[#764ba2] transition-colors mt-1">
                {loadingId === entry.id ? "読み込み中..." : "練習 →"}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Back link */}
      <div className="mt-8">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-[#667eea] transition-colors"
        >
          ← ホームに戻る
        </Link>
      </div>
    </div>
  );
}
