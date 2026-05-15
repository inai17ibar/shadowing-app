"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface LibraryItem {
  title: string;
  url: string;
  description: string;
  date: string;
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchLibrary() {
      try {
        const res = await fetch("/api/library?source=voa");
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? "コンテンツの取得に失敗しました");
        }

        setItems(data.items ?? []);
        if (data.note) {
          // Show fallback note but not as an error
          setError(data.note);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "エラーが発生しました");
      } finally {
        setLoading(false);
      }
    }

    fetchLibrary();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        コンテンツライブラリ
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        著作権フリーのコンテンツを選んでシャドーイング練習しましょう
      </p>

      {/* Error / note */}
      {error && (
        <div className="mb-6 p-3 rounded-lg bg-amber-50 text-amber-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <svg
            className="animate-spin h-8 w-8 text-[#667eea]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      )}

      {/* Content list */}
      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item, i) => (
            <Link
              key={`${item.url}-${i}`}
              href={`/reader?url=${encodeURIComponent(item.url)}`}
              className="group block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-medium text-gray-900 group-hover:text-[#667eea] transition-colors line-clamp-2">
                    {item.title}
                  </h2>
                  {item.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  {item.date && (
                    <p className="text-xs text-gray-400 mt-2">{item.date}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm text-[#667eea] font-medium group-hover:text-[#764ba2] transition-colors mt-1">
                  練習 &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !error && (
        <p className="text-gray-500 text-center py-16">
          コンテンツが見つかりませんでした
        </p>
      )}

      {/* Back link */}
      <div className="mt-8">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-[#667eea] transition-colors"
        >
          &larr; ホームに戻る
        </Link>
      </div>
    </div>
  );
}
