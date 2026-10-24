"use client";

/**
 * 「音の重なり」採点の検証ページ。
 *
 * お手本をTTSで読み上げながらマイクを録音し、両者のエネルギー包絡を比べて
 * 追随の遅れ・リズム・話速・カバー率を出す（ADR-001）。
 * 既存の練習画面には手を入れず、まずここで実際の声に当てて確かめるための場所。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { onVoicesChanged, pickEnglishVoice } from "@/lib/client/recording";
import {
  computeEnvelope,
  envelopeFromBoundaries,
  scoreOverlap,
  speechBoundary,
  type Envelope,
  type OverlapResult,
  type WordBoundary,
} from "@/lib/overlap";

const SAMPLES = [
  "The thing that surprised me most was how little it mattered in the end.",
  "We started over from scratch and rebuilt the whole thing in a week.",
  "I had no idea what I was doing, but I kept showing up every single day.",
];

/** 録音の末尾に足す余白。シャドーイングは遅れて追うので、言い終わりが切れないようにする */
const TAIL_MS = 1800;

type Phase = "idle" | "running" | "scoring" | "done" | "error";

export default function OverlapPage() {
  const [text, setText] = useState(SAMPLES[0]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<OverlapResult | null>(null);
  const [refEnv, setRefEnv] = useState<Envelope | null>(null);
  const [userEnv, setUserEnv] = useState<Envelope | null>(null);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const pick = () => setVoice(pickEnglishVoice());
    pick();
    return onVoicesChanged(pick);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      window.speechSynthesis.cancel();
    };
  }, []);

  const run = useCallback(async () => {
    setResult(null);
    setRefEnv(null);
    setUserEnv(null);
    setMessage("");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase("error");
      setMessage("マイクを使えませんでした。ブラウザのマイク許可を確認してください。");
      return;
    }
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    });

    setPhase("running");
    recorder.start();
    const recordStart = performance.now();

    // TTSの読み上げ開始は録音開始より必ず後になるので、そのズレを測って後で揃える
    const boundaries: WordBoundary[] = [];
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-US";
    utterance.rate = 1;

    let speakStart = 0;
    utterance.onstart = () => {
      speakStart = performance.now() - recordStart;
    };
    utterance.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      boundaries.push(speechBoundary(e));
    };

    const spoken = new Promise<number>((resolve) => {
      utterance.onend = () => resolve(performance.now() - recordStart - speakStart);
      utterance.onerror = () => resolve(0);
    });

    window.speechSynthesis.speak(utterance);
    const spokenMs = await spoken;

    await new Promise((r) => setTimeout(r, TAIL_MS));
    recorder.stop();
    const blob = await finished;
    stream.getTracks().forEach((t) => t.stop());

    setPhase("scoring");

    if (boundaries.length === 0 || spokenMs === 0) {
      setPhase("error");
      setMessage(
        "読み上げの語区切りイベントが取れませんでした。このブラウザではこの採点方式が使えません。",
      );
      return;
    }

    try {
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      const samples = decoded.getChannelData(0);
      const recorded = computeEnvelope(samples, decoded.sampleRate);
      await ctx.close();

      // 読み上げ開始をt=0に揃える
      const offsetFrames = Math.round(speakStart / recorded.hopMs);
      const aligned: Envelope = {
        frames: recorded.frames.slice(Math.max(0, offsetFrames)),
        hopMs: recorded.hopMs,
      };

      const reference = envelopeFromBoundaries(boundaries, text, spokenMs);
      setRefEnv(reference);
      setUserEnv(aligned);
      setResult(scoreOverlap(reference, aligned));
      setPhase("done");
    } catch {
      setPhase("error");
      setMessage("録音を解析できませんでした。もう一度お試しください。");
    }
  }, [text, voice]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-[32px] leading-tight font-bold tracking-tight text-gray-900 mb-1">重なり採点（検証中）</h1>
      <p className="text-sm text-gray-500 mb-8">
        読み上げに声を重ねてください。認識した単語ではなく、
        <strong>追いつけているか・リズムが合っているか</strong>を測ります。
      </p>

      <label className="block text-sm font-medium mb-2">お手本の文</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        disabled={phase === "running" || phase === "scoring"}
        className="w-full rounded-lg border-0 bg-gray-100 p-3 text-sm mb-3 disabled:bg-gray-50"
      />
      <div className="flex flex-wrap gap-2 mb-6">
        {SAMPLES.map((s, i) => (
          <button
            key={i}
            onClick={() => setText(s)}
            disabled={phase === "running" || phase === "scoring"}
            className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
          >
            例文 {i + 1}
          </button>
        ))}
      </div>

      <button
        onClick={run}
        disabled={phase === "running" || phase === "scoring" || text.trim().length === 0}
        className="px-6 py-3 rounded-full bg-blue-500 text-white font-semibold disabled:opacity-50"
      >
        {phase === "running"
          ? "読み上げ中… 声を重ねてください"
          : phase === "scoring"
            ? "採点中…"
            : "はじめる"}
      </button>

      {voice && (
        <p className="text-xs text-gray-400 mt-2">お手本の声: {voice.name}</p>
      )}

      {message && (
        <p className="mt-6 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {message}
        </p>
      )}

      {result && refEnv && userEnv && (
        <section className="mt-10">
          <div className="flex items-end gap-4 mb-4">
            <div className="text-5xl font-bold tabular-nums">{result.score}</div>
            <div className="text-sm text-gray-500 pb-2">/ 100</div>
          </div>
          <p className="mb-6 text-sm">{result.feedback}</p>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Metric label="追随の遅れ" value={`${result.lagMs} ms`} />
            <Metric label="リズム一致" value={`${Math.round(result.rhythm * 100)}%`} />
            <Metric label="話速比" value={result.rateRatio.toFixed(2)} />
            <Metric label="カバー率" value={`${Math.round(result.coverage * 100)}%`} />
          </dl>

          <p className="text-xs text-gray-500 mb-2">上: お手本 / 下: あなた</p>
          <EnvelopeChart reference={refEnv} user={userEnv} lagMs={result.lagMs} />
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** 2本の包絡を上下に並べる。遅れを揃えた位置にも薄く重ねて、ズレを目で見えるようにする */
function EnvelopeChart({
  reference,
  user,
  lagMs,
}: {
  reference: Envelope;
  user: Envelope;
  lagMs: number;
}) {
  const width = Math.max(reference.frames.length, user.frames.length);
  const lagFrames = Math.round(lagMs / reference.hopMs);
  const path = (frames: number[], baseline: number, height: number) =>
    frames
      .map((v, i) => `${i === 0 ? "M" : "L"} ${i} ${baseline - v * height}`)
      .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} 100`}
      preserveAspectRatio="none"
      className="w-full h-32 rounded-lg border border-gray-200 bg-gray-50"
    >
      <path d={path(reference.frames, 45, 35)} fill="none" stroke="#7c6cf3" strokeWidth={1} />
      <path d={path(user.frames, 95, 35)} fill="none" stroke="#111827" strokeWidth={1} />
      {/* 遅れを補正して重ねたあなたの波形 */}
      <g transform={`translate(${-lagFrames} 0)`} opacity={0.35}>
        <path d={path(user.frames, 45, 35)} fill="none" stroke="#111827" strokeWidth={1} />
      </g>
    </svg>
  );
}
