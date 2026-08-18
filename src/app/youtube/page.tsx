"use client";

import { useState } from "react";
import Link from "next/link";

interface SearchResult {
  id: string;
  title: string;
  thumbnail: string;
}

function decodeHtml(html: string): string {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}

export default function YouTubePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setError("");
    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `検索に失敗しました (${res.status})`);
      }

      setResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">YouTube動画</h1>
      <p className="text-gray-500 text-sm mb-6">
        動画を検索してシャドーイング練習しましょう
      </p>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="英語のスピーチ、TEDトーク、ニュース..."
          aria-label="YouTube動画検索"
          className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--brand-from)] focus:border-transparent transition-shadow"
        />
        <button
          type="submit"
          disabled={loading}
          aria-label="検索"
          className="bg-gradient-to-r from-[var(--brand-from)] to-[var(--brand-to)] text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-from)] focus-visible:ring-offset-2"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          )}
        </button>
      </form>

      {error && (
        <div className="mb-6 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="skeleton shrink-0 w-32 sm:w-40 h-20 sm:h-24 rounded-lg" />
              <div className="flex-1 space-y-3 py-1">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-4">
          {results.map((video, i) => (
            <Link
              key={video.id}
              href={`/youtube/${video.id}`}
              className={`group flex gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-from)] animate-fade-in-up stagger-${Math.min(i + 1, 3)}`}
            >
              <div className="shrink-0 w-32 sm:w-40 h-20 sm:h-24 rounded-lg overflow-hidden bg-gray-100">
                {video.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75Z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <h2 className="font-medium text-gray-900 line-clamp-2 group-hover:text-[var(--brand-from)] transition-colors">
                  {decodeHtml(video.title)}
                </h2>
                <span className="text-sm text-[var(--brand-from)] font-medium mt-2 group-hover:text-[var(--brand-to)] transition-colors">
                  練習する →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <div className="text-center py-16">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <p className="text-gray-500">検索結果が見つかりませんでした</p>
        </div>
      )}
    </div>
  );
}
