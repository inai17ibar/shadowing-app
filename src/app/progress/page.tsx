"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ensureSession, errorMessage } from "@/lib/client/api";
import { flushPending, pendingCount } from "@/lib/client/attempt-queue";
import type { Attempt, Level } from "@/components/practice/types";
import { ErrorBox, LEVEL_LABELS, Loading, STEP_LABELS, card, practiceHref } from "@/components/practice/ui";

interface ProgressResponse {
  level: Level;
  streak: number;
  totals: { attempts: number; practiceMinutes: number; materials: number };
  history: { date: string; attempts: number; bestRecordScore: number | null }[];
}

interface AttemptPage {
  items: Attempt[];
  nextCursor: string | null;
  hasMore: boolean;
}

const RECENT = 20;
/** 差分同期 API を最後まで読む上限（1ページ500件） */
const MAX_PAGES = 20;

/**
 * GET /me/attempts は受け取った順の差分同期 API なので、最後のページまで読んで新しい分を表示する。
 * iOS など別の端末で記録した分もここに出る。
 */
async function loadRecentAttempts(): Promise<Attempt[]> {
  let cursor: string | null = null;
  let recent: Attempt[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const q: string = cursor ? `?limit=500&cursor=${encodeURIComponent(cursor)}` : "?limit=500";
    const page: AttemptPage = await api<AttemptPage>("GET", `/me/attempts${q}`);
    recent = [...recent, ...page.items].slice(-RECENT);
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }
  return recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// GET /api/v1/me/progress と GET /api/v1/me/attempts — 練習の記録
export default function ProgressPage() {
  const [days, setDays] = useState(14);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSession();
        await flushPending().catch(() => undefined);
        const [p, a] = await Promise.all([
          api<ProgressResponse>("GET", `/me/progress?days=${days}`),
          loadRecentAttempts(),
        ]);
        if (cancelled) return;
        setProgress(p);
        setAttempts(a);
        setPending(pendingCount());
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const maxAttempts = Math.max(1, ...(progress?.history.map((h) => h.attempts) ?? [1]));

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">記録</h1>
      {error && <ErrorBox message={error} />}
      {!error && !progress && <Loading />}
      {pending > 0 && (
        <p className="text-xs text-amber-700 mb-4">送信待ちの練習記録が {pending} 件あります。</p>
      )}

      {progress && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="連続" value={`${progress.streak}日`} />
            <Stat label="レベル" value={LEVEL_LABELS[progress.level]} />
            <Stat label="練習回数" value={`${progress.totals.attempts}回`} />
            <Stat label="練習時間" value={`${progress.totals.practiceMinutes}分`} />
          </div>

          <section className={card}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">日別の練習</h2>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                aria-label="期間"
              >
                <option value={7}>7日</option>
                <option value={14}>14日</option>
                <option value={30}>30日</option>
                <option value={90}>90日</option>
              </select>
            </div>
            <div className="flex items-end gap-0.5 h-32" role="img" aria-label="日別の練習回数のグラフ">
              {progress.history.map((h) => (
                <div
                  key={h.date}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                  title={`${h.date}: ${h.attempts}回${h.bestRecordScore !== null ? ` / 本番 ${h.bestRecordScore}点` : ""}`}
                >
                  <div
                    className={`w-full rounded-t ${h.attempts > 0 ? "bg-[var(--brand-from)]" : "bg-gray-100"}`}
                    style={{ height: `${Math.max(4, (h.attempts / maxAttempts) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>{progress.history[0]?.date.slice(5)}</span>
              <span>{progress.history[progress.history.length - 1]?.date.slice(5)}</span>
            </div>
            {progress.history.some((h) => h.bestRecordScore !== null) && (
              <ul className="mt-4 text-sm text-gray-700 space-y-1">
                {progress.history
                  .filter((h) => h.bestRecordScore !== null)
                  .slice(-5)
                  .reverse()
                  .map((h) => (
                    <li key={h.date}>
                      {h.date} 本番録音 <span className="tabular-nums font-medium">{h.bestRecordScore}点</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section className={card}>
            <h2 className="font-semibold text-gray-900 mb-3">最近の練習</h2>
            {attempts && attempts.length === 0 && <p className="text-sm text-gray-500">まだ記録がありません。</p>}
            <ul className="divide-y divide-gray-100">
              {attempts?.map((a) => (
                <li key={a.id} className="py-2 flex items-center gap-3 text-sm">
                  <span className="text-xs text-gray-400 w-24 shrink-0 tabular-nums">
                    {new Date(a.createdAt).toLocaleString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-gray-700 w-32 shrink-0">
                    {STEP_LABELS[a.step] ?? a.step}
                    {a.sentenceIndex !== null && <span className="text-xs text-gray-400"> {a.sentenceIndex + 1}文目</span>}
                  </span>
                  <Link
                    href={practiceHref(a.materialId)}
                    className="flex-1 min-w-0 truncate text-xs text-gray-500 hover:text-[var(--brand-from)]"
                  >
                    {a.materialId.startsWith("text:") ? "自分の文章" : a.materialId}
                  </Link>
                  <span className="tabular-nums font-medium w-12 text-right">
                    {a.score !== null ? `${a.score}点` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
