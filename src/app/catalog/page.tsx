"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/client/api";
import type { Level, MaterialSummary } from "@/components/practice/types";
import { ErrorBox, LEVEL_LABELS, LevelBadge, Loading, VoiceBadge, secondaryButton } from "@/components/practice/ui";

interface Page {
  items: MaterialSummary[];
  nextCursor: string | null;
}

// GET /api/v1/materials — 公開済みの教材（出典とライセンスが確認できたもの）。ログイン不要
export default function CatalogPage() {
  const [level, setLevel] = useState<Level | "all">("all");
  const [tag, setTag] = useState("");
  const [items, setItems] = useState<MaterialSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      setError("");
      try {
        const q = new URLSearchParams();
        if (level !== "all") q.set("level", level);
        if (tag) q.set("tag", tag);
        if (after) q.set("cursor", after);
        const page = await api<Page>("GET", `/materials?${q.toString()}`);
        setItems((prev) => (after ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [level, tag],
  );

  useEffect(() => {
    // フィルタが変わったら最初のページから読み直す
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(null);
  }, [load]);

  const tags = [...new Set(items.flatMap((m) => m.tags))].sort();

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-[32px] leading-tight font-bold tracking-tight text-gray-900 mb-2">教材</h1>
      <p className="text-gray-500 text-sm mb-6">出典とライセンスを確認できた教材です。好きなものを選んで練習できます。</p>

      <div className="flex gap-2 mb-3 flex-wrap">
        {(["all", "beginner", "intermediate", "advanced"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              level === l
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {l === "all" ? "すべて" : LEVEL_LABELS[l]}
          </button>
        ))}
      </div>
      {(tags.length > 0 || tag) && (
        <div className="flex gap-2 mb-8 flex-wrap items-center">
          <span className="text-xs text-gray-400">タグ</span>
          {tag && (
            <button onClick={() => setTag("")} className="text-xs px-3 py-1 rounded-full bg-gray-800 text-white">
              #{tag} ×
            </button>
          )}
          {tags
            .filter((t) => t !== tag)
            .map((t) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                #{t}
              </button>
            ))}
        </div>
      )}

      {error && <ErrorBox message={error} />}

      <div className="space-y-3">
        {items.map((m) => (
          <Link
            key={m.id}
            href={`/catalog/${encodeURIComponent(m.id)}`}
            className="group block rounded-2xl bg-surface shadow-card p-5 transition-all duration-200 hover:shadow-float hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-2 mb-1">
              <LevelBadge level={m.level} />
              {m.audioUrl && <VoiceBadge />}
              <span className="text-xs text-gray-400">{m.sourceName}</span>
            </div>
            <h2 className="font-medium text-gray-900 group-hover:text-blue-500 transition-colors">{m.title}</h2>
            {m.description && <p className="text-sm text-gray-500 mt-1">{m.description}</p>}
            <p className="text-xs text-gray-400 mt-2">{m.sentenceCount}文</p>
          </Link>
        ))}
      </div>

      {loading && <Loading />}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-gray-500 py-10 text-center">該当する教材がありません。</p>
      )}
      {!loading && cursor && (
        <div className="mt-6 text-center">
          <button onClick={() => load(cursor)} className={secondaryButton}>
            もっと見る
          </button>
        </div>
      )}
    </div>
  );
}
