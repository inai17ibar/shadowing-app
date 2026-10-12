"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ensureSession, errorMessage } from "@/lib/client/api";
import type { TodayResponse } from "@/components/practice/types";
import {
  ErrorBox,
  LEVEL_LABELS,
  LevelBadge,
  Loading,
  Notice,
  card,
  practiceHref,
  primaryButton,
} from "@/components/practice/ui";

const ADVANCED_REASONS: Record<string, string> = {
  none: "新しい教材を用意しました。",
  mastered: "前の教材を習得したので、次の教材に進みました。",
  expired: "前の教材を始めてから日数が経ったので、次の教材に進みました。",
};

// GET /api/v1/me/today — シャドテン式の「今日の課題」
export default function TodayPage() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSession();
        const t = await api<TodayResponse>("GET", "/me/today");
        if (!cancelled) setToday(t);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">今日の課題</h1>
      <p className="text-gray-500 text-sm mb-6">
        同じ教材を、習得するか7日経つまで毎日6ステップで練習します。
      </p>

      {error && <ErrorBox message={error} />}
      {!error && !today && <Loading />}

      {today?.status === "exhausted" && (
        <div className="space-y-4">
          <Notice>{today.message}</Notice>
          <p className="text-sm text-gray-600">連続 {today.streak} 日</p>
          <div className="flex gap-3 text-sm">
            <Link href="/texts" className="text-[var(--brand-from)] hover:underline">
              自分の文章を取り込む →
            </Link>
            <Link href="/catalog" className="text-[var(--brand-from)] hover:underline">
              教材を見る →
            </Link>
          </div>
        </div>
      )}

      {today?.status === "active" && (
        <div className="space-y-6">
          {(today.advancedReason || today.levelChanged) && (
            <Notice>
              {today.advancedReason && (ADVANCED_REASONS[today.advancedReason] ?? "新しい教材を用意しました。")}
              {today.levelChanged && ` レベルが${LEVEL_LABELS[today.level]}になりました。`}
            </Notice>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Stat label="連続" value={`${today.streak}日`} />
            <Stat label="この教材" value={`${today.day}日目`} />
            <Stat label="1日の目標" value={`${today.goalMinutes}分`} />
          </div>

          <section className={card}>
            {today.material ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <LevelBadge level={today.material.level} />
                  <span className="text-xs text-gray-400">{today.material.sentenceCount}文</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{today.material.title}</h2>
              </>
            ) : (
              <p className="text-sm text-gray-500 mb-4">教材の情報を取得できませんでした。</p>
            )}

            <ol className="space-y-2 mb-5">
              {today.steps.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span
                    className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs ${
                      s.done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {s.done ? "✓" : i + 1}
                  </span>
                  <Link
                    href={practiceHref(today.materialId, s.id)}
                    className={`flex-1 text-sm hover:text-[var(--brand-from)] ${
                      s.id === today.nextStep ? "font-semibold text-gray-900" : "text-gray-700"
                    }`}
                  >
                    {s.title}
                    <span className="text-xs text-gray-400 ml-2">{s.minutes}分</span>
                  </Link>
                  {s.bestScore !== null && (
                    <span className="text-sm tabular-nums text-gray-700">{s.bestScore}点</span>
                  )}
                </li>
              ))}
            </ol>

            {today.todayRecordScore !== null && (
              <p className="text-sm text-gray-600 mb-4">今日の本番録音: {today.todayRecordScore}点</p>
            )}

            <Link
              href={practiceHref(today.materialId, today.nextStep ?? undefined)}
              className={primaryButton}
            >
              {today.nextStep ? "練習をはじめる" : "もう一度練習する"}
            </Link>
          </section>

          {today.weakSentences.length > 0 && (
            <section className={card}>
              <h2 className="font-semibold text-gray-900 mb-2">重ねられていない文</h2>
              <ul className="space-y-1 text-sm text-gray-700">
                {today.weakSentences.map((w) => (
                  <li key={w.sentenceIndex}>
                    {w.sentenceIndex + 1}文目 — 平均 {w.averageScore}点（{w.attempts}回）
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-2">練習画面の「採点する範囲」で文ごとに録れます。</p>
            </section>
          )}
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
