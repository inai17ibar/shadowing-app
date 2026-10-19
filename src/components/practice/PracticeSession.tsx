"use client";

/**
 * シャドテン式の6ステップで1つの教材を練習する画面（Web版）。
 *
 * 教材はカタログの教材（GET /materials/{id}）か、自分の文章（"text:<id>" → GET /me/texts/{id}）。
 * 採点するステップは、読み上げに声を重ねて録音し、包絡だけを POST /attempts に送る。
 * 通信できないときは端末に溜め、次に開いたときにまとめて送る（attempt-queue）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ensureSession, errorMessage } from "@/lib/client/api";
import { flushPending, pendingCount, recordAttempt, type AttemptResult } from "@/lib/client/attempt-queue";
import {
  RecordingError,
  onVoicesChanged,
  pickEnglishVoice,
  playAudio,
  recordOverlap,
  recordOverlapWithAudio,
  speak,
  stopSpeaking,
} from "@/lib/client/recording";
import { alignmentMetrics } from "@/lib/overlap";
import { checkSoundChanges, findSoundChanges, soundChangeFeedback, type SoundChangeCheck } from "@/lib/sound-changes";
import { SoundChangeLegend, SoundChangeList, SoundChangeText } from "./SoundChangeText";
import type { Material, PracticeStep, Sentence, StepId, StepsResponse, TodayResponse, UserText } from "./types";
import { ErrorBox, LevelBadge, Loading, Notice, card, primaryButton, secondaryButton } from "./ui";

interface LoadedMaterial {
  id: string;
  title: string;
  level: Material["level"] | null;
  sentences: Sentence[];
  sourceName: string;
  attribution: string | null;
  /** 収録音声（人の朗読）。あればお手本は読み上げではなくこれを流す */
  audioUrl: string | null;
  backHref: string;
}

interface ResultEntry {
  key: string;
  step: StepId;
  sentenceIndex: number | null;
  /** サーバーが採点した結果。オフラインで送信待ちなら null */
  result: AttemptResult | null;
  /** 連結・同化の所でつなげて言えていたか（端末で判定） */
  soundChecks: SoundChangeCheck[];
}

const RATES = [0.6, 0.8, 1, 1.2];
/** スクリプトを最初から見せるステップ（シャドテンの手順どおり、他は見ないで練習する） */
const SCRIPT_VISIBLE: StepId[] = ["script", "overlapping"];

function hostnameOf(url: string): string | null {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

async function loadMaterial(materialId: string): Promise<LoadedMaterial> {
  if (materialId.startsWith("text:")) {
    const t = await api<UserText>("GET", `/me/texts/${encodeURIComponent(materialId.slice(5))}`);
    return {
      id: materialId,
      title: t.title,
      level: null,
      sentences: t.sentences.map((text) => ({ text })),
      sourceName: hostnameOf(t.sourceUrl) ?? "自分の文章",
      attribution: null,
      audioUrl: null,
      backHref: "/texts",
    };
  }
  const m = await api<Material>("GET", `/materials/${encodeURIComponent(materialId)}`);
  return {
    id: m.id,
    title: m.title,
    level: m.level,
    sentences: m.sentences,
    sourceName: m.sourceName,
    attribution: m.attribution,
    audioUrl: m.audioUrl,
    backHref: `/catalog/${encodeURIComponent(m.id)}`,
  };
}

export default function PracticeSession({ materialId, initialStep }: { materialId: string; initialStep?: string }) {
  const [material, setMaterial] = useState<LoadedMaterial | null>(null);
  const [steps, setSteps] = useState<PracticeStep[]>([]);
  const [done, setDone] = useState<Set<StepId>>(new Set());
  const [stepId, setStepId] = useState<StepId | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSession();
        const [m, s] = await Promise.all([loadMaterial(materialId), api<StepsResponse>("GET", "/steps")]);
        if (cancelled) return;
        setMaterial(m);
        setSteps(s.steps);

        // 今日の課題の教材なら、今日やったステップを完了として表示する
        let todayDone = new Set<StepId>();
        let next: StepId | null = null;
        const today = await api<TodayResponse>("GET", "/me/today").catch(() => null);
        if (today?.status === "active" && today.materialId === materialId) {
          todayDone = new Set(today.steps.filter((x) => x.done).map((x) => x.id));
          next = today.nextStep;
        }
        if (cancelled) return;
        setDone(todayDone);
        const requested = s.steps.find((x) => x.id === initialStep)?.id;
        setStepId(requested ?? next ?? s.steps[0]?.id ?? null);

        await flushPending().catch(() => undefined);
        if (!cancelled) setPending(pendingCount());
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [materialId, initialStep]);

  const markDone = useCallback((id: StepId) => {
    setDone((prev) => new Set(prev).add(id));
    setPending(pendingCount());
  }, []);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
        <ErrorBox message={error} />
        <Link href="/catalog" className="text-sm text-gray-500 hover:text-blue-500">
          ← 教材を選ぶ
        </Link>
      </div>
    );
  }
  if (!material || !stepId) return <Loading />;

  const step = steps.find((s) => s.id === stepId)!;
  const stepIndex = steps.findIndex((s) => s.id === stepId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href={material.backHref} className="text-sm text-gray-500 hover:text-blue-500">
        ← 戻る
      </Link>
      <div className="flex items-center gap-2 mt-4 mb-1">
        {material.level && <LevelBadge level={material.level} />}
        <span className="text-xs text-gray-400">{material.sourceName}</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{material.title}</h1>
      {material.attribution && <p className="text-xs text-gray-500 mb-2">{material.attribution}</p>}
      {pending > 0 && (
        <p className="text-xs text-amber-700 mb-2">送信待ちの練習記録が {pending} 件あります（通信できたときに送ります）</p>
      )}

      <ol className="flex gap-1 overflow-x-auto my-6 pb-1" aria-label="練習ステップ">
        {steps.map((s, i) => {
          const active = s.id === stepId;
          return (
            <li key={s.id} className="shrink-0">
              <button
                onClick={() => {
                  stopSpeaking();
                  setStepId(s.id);
                }}
                aria-current={active ? "step" : undefined}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-blue-500 text-white"
                    : done.has(s.id)
                      ? "bg-green-50 text-green-700 hover:bg-green-100"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {done.has(s.id) ? "✓ " : `${i + 1}. `}
                {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      <StepPanel
        key={`${material.id}:${step.id}`}
        material={material}
        step={step}
        done={done.has(step.id)}
        onDone={markDone}
        onNext={
          stepIndex < steps.length - 1
            ? () => {
                stopSpeaking();
                setStepId(steps[stepIndex + 1].id);
              }
            : null
        }
      />
    </div>
  );
}

function StepPanel({
  material,
  step,
  done,
  onDone,
  onNext,
}: {
  material: LoadedMaterial;
  step: PracticeStep;
  done: boolean;
  onDone: (id: StepId) => void;
  onNext: (() => void) | null;
}) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(step.scored ? 1 : 0.8);
  const [playing, setPlaying] = useState<number | "all" | null>(null);
  const [showScript, setShowScript] = useState(SCRIPT_VISIBLE.includes(step.id));
  const [target, setTarget] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "recording" | "analyzing" | "sending">("idle");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<ResultEntry[]>([]);
  const startedAt = useRef(0);
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    startedAt.current = Date.now();
    const pick = () => setVoice(pickEnglishVoice());
    pick();
    return onVoicesChanged(pick);
  }, []);

  const fullText = material.sentences.map((s) => s.text).join(" ");

  /** 収録音声で流せる範囲。全文なら null、文ごとの時刻が無い文なら undefined（読み上げで代用） */
  function audioRange(which: number | "all") {
    if (!material.audioUrl) return undefined;
    if (which === "all") return null;
    const s = material.sentences[which];
    return s.startMs !== undefined && s.endMs !== undefined ? { startMs: s.startMs, endMs: s.endMs } : undefined;
  }

  async function play(which: number | "all") {
    if (playing !== null) {
      stopSpeaking();
      setPlaying(null);
      return;
    }
    setPlaying(which);
    const range = audioRange(which);
    try {
      if (material.audioUrl && range !== undefined) await playAudio(material.audioUrl, range, rate);
      else await speak(which === "all" ? fullText : material.sentences[which].text, { voice, rate });
    } catch (err) {
      setMessage(err instanceof RecordingError ? err.message : errorMessage(err));
    }
    setPlaying(null);
  }

  async function markStepDone() {
    setPhase("sending");
    setMessage("");
    try {
      const durationMs = Math.min(3_600_000, Date.now() - startedAt.current);
      const r = await recordAttempt({ materialId: material.id, step: step.id, durationMs });
      if (!r) setMessage("オフラインのため、通信できたときに送信します。");
      onDone(step.id);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setPhase("idle");
    }
  }

  async function recordAndScore() {
    stopSpeaking();
    setPlaying(null);
    setMessage("");
    const text = target === null ? fullText : material.sentences[target].text;
    try {
      const range = audioRange(target === null ? "all" : target);
      const rec =
        material.audioUrl && range !== undefined
          ? await recordOverlapWithAudio(material.audioUrl, range, { rate, onPhase: setPhase })
          : await recordOverlap(text, { voice, rate, onPhase: setPhase });
      const { lagMs } = alignmentMetrics(rec.reference, rec.user);
      const soundChecks = checkSoundChanges(text, rec.boundaries, rec.reference, rec.user, lagMs);
      setPhase("sending");
      const r = await recordAttempt({
        materialId: material.id,
        step: step.id,
        ...(target !== null ? { sentenceIndex: target } : {}),
        durationMs: Math.min(3_600_000, rec.durationMs),
        envelopes: { reference: rec.reference, user: rec.user },
      });
      setResults((prev) => [
        { key: crypto.randomUUID(), step: step.id, sentenceIndex: target, result: r, soundChecks },
        ...prev,
      ]);
      onDone(step.id);
    } catch (err) {
      setMessage(err instanceof RecordingError ? err.message : errorMessage(err));
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <h2 className="text-lg font-semibold text-gray-900">{step.title}</h2>
        <span className="text-xs text-gray-400 shrink-0">目安 {step.minutes}分</span>
      </div>
      <p className="text-sm text-gray-600 mb-5">{step.instruction}</p>

      {!ttsSupported && <ErrorBox message="このブラウザは読み上げ（音声合成）に対応していません。" />}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button onClick={() => play("all")} disabled={busy || !ttsSupported} className={secondaryButton}>
          {playing === "all" ? "■ 停止" : "▶ 全文を再生"}
        </button>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          速さ
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            disabled={busy}
            className="rounded-xl border-0 bg-gray-100 px-2 py-1 text-[15px] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setShowScript((v) => !v)} className="text-sm text-blue-500 hover:underline ml-auto">
          {showScript ? "スクリプトを隠す" : "スクリプトを表示"}
        </button>
      </div>

      {showScript && (
        <div className="mb-3">
          <SoundChangeLegend />
        </div>
      )}
      {showScript && (
        <ol className="space-y-2 mb-6">
          {material.sentences.map((s, i) => (
            <li key={i} className="flex gap-2 items-start">
              <button
                onClick={() => play(i)}
                disabled={busy || !ttsSupported || (playing !== null && playing !== i)}
                aria-label={`${i + 1}文目を再生`}
                className="shrink-0 w-7 h-7 rounded-full bg-gray-100 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-40"
              >
                {playing === i ? "■" : "▶"}
              </button>
              <div>
                <p className="text-gray-900 leading-relaxed">
                  <SoundChangeText text={s.text} />
                </p>
                {s.translation && step.id === "script" && <p className="text-sm text-gray-500">{s.translation}</p>}
                {step.id === "script" && (
                  <div className="mt-1.5">
                    <SoundChangeList changes={findSoundChanges(s.text)} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {step.scored ? (
        <div className="border-t border-gray-100 pt-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <label className="text-sm text-gray-600 flex items-center gap-1">
              採点する範囲
              <select
                value={target === null ? "all" : String(target)}
                onChange={(e) => setTarget(e.target.value === "all" ? null : Number(e.target.value))}
                disabled={busy || step.id === "record"}
                className="rounded-xl border-0 bg-gray-100 px-2 py-1 text-[15px] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/60 max-w-xs"
              >
                <option value="all">全文（通し）</option>
                {material.sentences.map((s, i) => (
                  <option key={i} value={i}>
                    {i + 1}文目: {s.text.slice(0, 40)}
                    {s.text.length > 40 ? "…" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {step.id === "record" && <p className="text-xs text-gray-500 mb-3">本番録音は全文を通しで録ります。</p>}
          <button onClick={recordAndScore} disabled={busy || !ttsSupported} className={primaryButton}>
            {phase === "recording"
              ? "お手本を再生中… 声を重ねてください"
              : phase === "analyzing"
                ? "解析中…"
                : phase === "sending"
                  ? "採点中…"
                  : "● 録音して採点"}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            音声はサーバーに送りません。端末で声の強弱（包絡）だけを取り出して送ります。
            {material.audioUrl ? " お手本: 収録音声（人の声）" : voice ? ` お手本の声: ${voice.name}` : ""}
          </p>
        </div>
      ) : (
        <div className="border-t border-gray-100 pt-5 flex items-center gap-3">
          <button onClick={markStepDone} disabled={busy} className={primaryButton}>
            {phase === "sending" ? "記録中…" : done ? "もう一度やった" : "やった"}
          </button>
          {done && <span className="text-sm text-green-700">✓ 今日やりました</span>}
        </div>
      )}

      {message && (
        <div className="mt-4">
          <Notice>{message}</Notice>
        </div>
      )}

      {results.length > 0 && (
        <ul className="mt-6 space-y-3">
          {results.map((r) => (
            <li key={r.key}>
              <ScoreCard entry={r} sentences={material.sentences} />
            </li>
          ))}
        </ul>
      )}

      {onNext && (done || results.length > 0) && (
        <div className="mt-6 text-right">
          <button onClick={onNext} className="text-sm font-medium text-blue-500 hover:underline">
            次のステップへ →
          </button>
        </div>
      )}
    </section>
  );
}

function ScoreCard({ entry, sentences }: { entry: ResultEntry; sentences: Sentence[] }) {
  const label = entry.sentenceIndex === null ? "全文" : `${entry.sentenceIndex + 1}文目`;
  if (!entry.result) {
    return <Notice>{label}: オフラインのため後で送信します（採点は送信時に行われます）。</Notice>;
  }
  const a = entry.result.attempt;
  const soundFeedback = soundChangeFeedback(entry.soundChecks);
  const broken = entry.soundChecks.filter((c) => c.result === "broken");
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-end gap-3 mb-2">
        <span className="text-4xl font-bold tabular-nums">{a.score ?? "-"}</span>
        <span className="text-sm text-gray-500 pb-1">/ 100 · {label}</span>
      </div>
      {entry.sentenceIndex !== null && (
        <p className="text-sm text-gray-500 mb-2">
          <SoundChangeText text={sentences[entry.sentenceIndex]?.text ?? ""} checks={entry.soundChecks} />
        </p>
      )}
      {entry.result.feedback && <p className="text-sm mb-3">{entry.result.feedback}</p>}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Metric label="追随の遅れ" value={a.lagMs === null ? "-" : `${a.lagMs} ms`} />
        <Metric label="リズム一致" value={a.rhythm === null ? "-" : `${Math.round(a.rhythm * 100)}%`} />
        <Metric label="話速比" value={a.rateRatio === null ? "-" : a.rateRatio.toFixed(2)} />
        <Metric label="カバー率" value={a.coverage === null ? "-" : `${Math.round(a.coverage * 100)}%`} />
      </dl>
      {soundFeedback && (
        <div className="mt-4 border-t border-separator pt-3">
          <p className="mb-2 text-sm font-medium text-gray-900">音のつながり</p>
          <p className="mb-2 text-sm text-gray-700">{soundFeedback}</p>
          <SoundChangeList changes={broken} force />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 p-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
