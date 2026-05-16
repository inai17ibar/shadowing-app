"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SavedTextMeta {
  id: number;
  title: string;
  source_url: string;
  created_at: string;
}

interface SavedTextFull {
  title: string;
  source_url: string;
  paragraphs: string[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Sentence splitting
// ---------------------------------------------------------------------------
const SPLIT_RE =
  /(?<=[.!?。！？])\s+|(?<=[.!?。！？])(?=[A-Z「『])|\n+/;

function splitToSentences(text: string): string[] {
  return text
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-10 text-gray-500">読み込み中...</div>}>
      <ReaderInner />
    </Suspense>
  );
}

function ReaderInner() {
  // --- input mode ---
  const [inputMode, setInputMode] = useState<"url" | "text" | "saved">("url");

  // --- url mode ---
  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  // --- text mode ---
  const [rawText, setRawText] = useState("");

  // --- saved mode ---
  const [savedTexts, setSavedTexts] = useState<SavedTextMeta[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // --- loaded content ---
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);

  // --- TTS settings ---
  const [speed, setSpeed] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [autoAdvance, setAutoAdvance] = useState(true);

  // --- error ---
  const [error, setError] = useState("");

  // --- refs ---
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const autoAdvanceRef = useRef(autoAdvance);
  const sentencesRef = useRef(sentences);
  const currentIdxRef = useRef(currentIdx);
  const isPlayingRef = useRef(isPlaying);

  // keep refs in sync
  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);
  useEffect(() => { sentencesRef.current = sentences; }, [sentences]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const searchParams = useSearchParams();

  // --- load voices ---
  useEffect(() => {
    function loadVoices() {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        setVoices(v);
        if (!selectedVoice) {
          const defaultV = v.find((x) => x.default) ?? v[0];
          setSelectedVoice(defaultV.name);
        }
      }
    }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- load saved text by id (URL param or saved-mode click) ---
  const loadSavedText = useCallback(async (id: number) => {
    setError("");
    setUrlLoading(true);
    try {
      const res = await fetch(`/api/texts/${id}`);
      if (!res.ok) throw new Error("テキストの読み込みに失敗しました");
      const data: SavedTextFull = await res.json();
      setTitle(data.title);
      setSourceUrl(data.source_url);
      const allSentences = data.paragraphs.flatMap((p) => splitToSentences(p));
      setSentences(allSentences);
      setCurrentIdx(0);
      setDoneSet(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setUrlLoading(false);
    }
  }, []);

  // --- handle ?id= or ?url= param on mount ---
  useEffect(() => {
    const idParam = searchParams.get("id");
    const urlParam = searchParams.get("url");
    const fromParam = searchParams.get("from");
    if (idParam) {
      loadSavedText(Number(idParam));
    } else if (fromParam === "library") {
      try {
        const raw = sessionStorage.getItem("library_text");
        if (raw) {
          const data = JSON.parse(raw) as { title: string; paragraphs: string[] };
          setTitle(data.title);
          setSourceUrl("");
          const allSentences = data.paragraphs.flatMap((p) => splitToSentences(p));
          setSentences(allSentences);
          setCurrentIdx(0);
          setDoneSet(new Set());
          sessionStorage.removeItem("library_text");
        }
      } catch { /* ignore */ }
    } else if (urlParam) {
      setUrl(urlParam);
      handleUrlSubmit(undefined, urlParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- fetch saved texts list ---
  const fetchSavedTexts = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/texts");
      if (!res.ok) throw new Error("保存テキスト一覧の取得に失敗しました");
      const data: SavedTextMeta[] = await res.json();
      setSavedTexts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (inputMode === "saved") fetchSavedTexts();
  }, [inputMode, fetchSavedTexts]);

  // --- URL submit ---
  async function handleUrlSubmit(
    e?: React.FormEvent,
    overrideUrl?: string,
  ) {
    e?.preventDefault();
    const targetUrl = overrideUrl ?? url;
    if (!targetUrl.trim()) return;
    setError("");
    setUrlLoading(true);
    try {
      const res = await fetch(
        `/api/extract?url=${encodeURIComponent(targetUrl)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `テキスト抽出に失敗しました (${res.status})`,
        );
      }
      const data: { title: string; paragraphs: string[] } = await res.json();
      setTitle(data.title);
      setSourceUrl(targetUrl);
      const allSentences = data.paragraphs.flatMap((p) => splitToSentences(p));
      setSentences(allSentences);
      setCurrentIdx(0);
      setDoneSet(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setUrlLoading(false);
    }
  }

  // --- Text paste submit ---
  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rawText.trim()) return;
    setTitle("貼り付けテキスト");
    setSourceUrl("");
    const allSentences = splitToSentences(rawText);
    setSentences(allSentences);
    setCurrentIdx(0);
    setDoneSet(new Set());
    setError("");
  }

  // --- delete saved text ---
  async function handleDeleteSaved(id: number) {
    try {
      const res = await fetch(`/api/texts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      setSavedTexts((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    }
  }

  // --- save current text ---
  async function handleSave() {
    if (sentences.length === 0) return;
    try {
      const res = await fetch("/api/texts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          source_url: sourceUrl,
          paragraphs: sentences,
        }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      alert("保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    }
  }

  // --- TTS playback ---
  const speak = useCallback(
    (idx: number) => {
      window.speechSynthesis.cancel();
      if (idx < 0 || idx >= sentencesRef.current.length) return;

      const utter = new SpeechSynthesisUtterance(sentencesRef.current[idx]);
      utter.rate = speed;
      const voice = voices.find((v) => v.name === selectedVoice);
      if (voice) utter.voice = voice;

      utter.onend = () => {
        setDoneSet((prev) => new Set(prev).add(idx));
        if (
          autoAdvanceRef.current &&
          idx < sentencesRef.current.length - 1
        ) {
          setTimeout(() => {
            const nextIdx = idx + 1;
            setCurrentIdx(nextIdx);
            speak(nextIdx);
          }, 1500);
        } else {
          setIsPlaying(false);
        }
      };

      utteranceRef.current = utter;
      setCurrentIdx(idx);
      setIsPlaying(true);
      window.speechSynthesis.speak(utter);
    },
    [speed, voices, selectedVoice],
  );

  const playPause = useCallback(() => {
    if (isPlayingRef.current) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      speak(currentIdxRef.current);
    }
  }, [speak]);

  const prev = useCallback(() => {
    window.speechSynthesis.cancel();
    const newIdx = Math.max(0, currentIdxRef.current - 1);
    setCurrentIdx(newIdx);
    speak(newIdx);
  }, [speak]);

  const next = useCallback(() => {
    window.speechSynthesis.cancel();
    const newIdx = Math.min(
      sentencesRef.current.length - 1,
      currentIdxRef.current + 1,
    );
    setCurrentIdx(newIdx);
    speak(newIdx);
  }, [speak]);

  const repeat = useCallback(() => {
    window.speechSynthesis.cancel();
    speak(currentIdxRef.current);
  }, [speak]);

  // --- keyboard shortcuts ---
  useEffect(() => {
    if (sentences.length === 0) return;
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          playPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prev();
          break;
        case "ArrowRight":
          e.preventDefault();
          next();
          break;
        case "r":
        case "R":
          e.preventDefault();
          repeat();
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sentences.length, playPause, prev, next, repeat]);

  // --- reset ---
  function handleReset() {
    window.speechSynthesis.cancel();
    setSentences([]);
    setCurrentIdx(0);
    setDoneSet(new Set());
    setTitle("");
    setSourceUrl("");
    setRawText("");
    setUrl("");
    setError("");
    setIsPlaying(false);
  }

  // =========================================================================
  // Render: input modes (before text is loaded)
  // =========================================================================
  if (sentences.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          テキスト読み上げ
        </h1>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-6">
          {(
            [
              ["url", "URL入力"],
              ["text", "テキスト貼り付け"],
              ["saved", "保存済み"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => {
                setInputMode(mode);
                setError("");
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                inputMode === mode
                  ? "bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* URL mode */}
        {inputMode === "url" && (
          <form onSubmit={(e) => handleUrlSubmit(e)} className="space-y-4">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#667eea] focus:border-transparent"
            />
            <button
              type="submit"
              disabled={urlLoading}
              className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {urlLoading ? "読み込み中..." : "テキストを抽出"}
            </button>
          </form>
        )}

        {/* Text mode */}
        {inputMode === "text" && (
          <form onSubmit={handleTextSubmit} className="space-y-4">
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={8}
              placeholder="テキストをここに貼り付けてください..."
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#667eea] focus:border-transparent resize-y"
            />
            <button
              type="submit"
              className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              読み込む
            </button>
          </form>
        )}

        {/* Saved mode */}
        {inputMode === "saved" && (
          <div>
            {savedLoading ? (
              <p className="text-gray-500">読み込み中...</p>
            ) : savedTexts.length === 0 ? (
              <p className="text-gray-500">保存済みテキストはありません</p>
            ) : (
              <ul className="space-y-3">
                {savedTexts.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <button
                      onClick={() => loadSavedText(t.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <p className="font-medium text-gray-900 truncate">
                        {t.title || "無題"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(t.created_at).toLocaleDateString("ja-JP")}
                      </p>
                    </button>
                    <button
                      onClick={() => handleDeleteSaved(t.id)}
                      className="ml-4 text-red-400 hover:text-red-600 transition-colors text-sm shrink-0"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // Render: playback view (text loaded)
  // =========================================================================
  const speeds = [0.5, 0.75, 1, 1.25, 1.5];

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Title */}
      <h1 className="text-xl font-bold text-gray-900 mb-1 truncate">
        {title}
      </h1>
      {sourceUrl && (
        <p className="text-xs text-gray-400 mb-6 truncate">{sourceUrl}</p>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Controls card */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm mb-6 space-y-4">
        {/* Playback buttons */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={prev}
            title="前の文"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>

          <button
            onClick={playPause}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white shadow-md hover:opacity-90 transition-opacity"
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={next}
            title="次の文"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          <button
            onClick={repeat}
            title="繰り返し (R)"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </button>
        </div>

        {/* Speed control */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs text-gray-500 mr-1">速度:</span>
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                speed === s
                  ? "bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Voice selector */}
        <div className="flex items-center justify-center gap-2">
          <label htmlFor="voice-select" className="text-xs text-gray-500">
            音声:
          </label>
          <select
            id="voice-select"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea] max-w-xs"
          >
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>

        {/* Auto-advance checkbox */}
        <div className="flex items-center justify-center gap-2">
          <input
            type="checkbox"
            id="auto-advance"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
            className="accent-[#667eea]"
          />
          <label htmlFor="auto-advance" className="text-sm text-gray-600">
            自動で次の文へ進む (1.5秒の間隔)
          </label>
        </div>
      </div>

      {/* Sentence list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-6 divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
        {sentences.map((s, i) => (
          <button
            key={i}
            onClick={() => {
              window.speechSynthesis.cancel();
              speak(i);
            }}
            className={`w-full text-left px-4 py-3 text-sm transition-colors ${
              i === currentIdx
                ? "bg-purple-50 border-l-4 border-[#667eea] font-medium text-gray-900"
                : doneSet.has(i)
                ? "text-gray-400"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="mr-2 text-xs text-gray-400">{i + 1}.</span>
            {s}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSave}
          className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white px-5 py-2.5 rounded-xl font-medium hover:opacity-90 transition-opacity text-sm"
        >
          保存する
        </button>
        <button
          onClick={handleReset}
          className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
        >
          別のテキストを読む
        </button>
        <Link
          href="/"
          className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
        >
          ホームに戻る
        </Link>
      </div>

      {/* Keyboard shortcut hint */}
      <p className="text-xs text-gray-400 mt-4">
        キーボード: Space (再生/一時停止) ・ ← (前) ・ → (次) ・ R (繰り返し)
      </p>
    </div>
  );
}
