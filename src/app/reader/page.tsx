"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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

interface PronunciationResult {
  score: number;
  feedback: string;
  details: { missed: string[]; added: string[]; correct: string[] };
}

const SPLIT_RE = /(?<=[.!?。！？])\s+|(?<=[.!?。！？])(?=[A-Z「『])|\n+/;

function splitToSentences(text: string): string[] {
  return text
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function ReaderPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 py-10 text-gray-500">
          読み込み中...
        </div>
      }
    >
      <ReaderInner />
    </Suspense>
  );
}

function ReaderInner() {
  const [inputMode, setInputMode] = useState<"url" | "text" | "saved">("url");
  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [rawText, setRawText] = useState("");
  const [savedTexts, setSavedTexts] = useState<SavedTextMeta[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);

  const [speed, setSpeed] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [autoAdvance, setAutoAdvance] = useState(true);

  // Pronunciation practice
  const [practiceMode, setPracticeMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [pronResult, setPronResult] = useState<PronunciationResult | null>(
    null,
  );
  const [pronLoading, setPronLoading] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const [error, setError] = useState("");

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const autoAdvanceRef = useRef(autoAdvance);
  const sentencesRef = useRef(sentences);
  const currentIdxRef = useRef(currentIdx);
  const isPlayingRef = useRef(isPlaying);
  const practiceModeRef = useRef(practiceMode);
  const scriptContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    autoAdvanceRef.current = autoAdvance;
  }, [autoAdvance]);
  useEffect(() => {
    sentencesRef.current = sentences;
  }, [sentences]);
  useEffect(() => {
    currentIdxRef.current = currentIdx;
  }, [currentIdx]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    practiceModeRef.current = practiceMode;
  }, [practiceMode]);

  const searchParams = useSearchParams();

  // Auto-scroll to current sentence
  useEffect(() => {
    if (sentences.length === 0) return;
    const el = document.getElementById(`sentence-${currentIdx}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIdx, sentences.length]);

  // Load voices
  useEffect(() => {
    function loadVoices() {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        setVoices(v);
        if (!selectedVoice) {
          const en = v.find(
            (x) => x.lang.startsWith("en") && x.default,
          );
          const defaultV = en ?? v.find((x) => x.default) ?? v[0];
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

  const loadSavedText = useCallback(async (id: number) => {
    setError("");
    setUrlLoading(true);
    try {
      const res = await fetch(`/api/texts/${id}`);
      if (!res.ok) throw new Error("テキストの読み込みに失敗しました");
      const data: SavedTextFull = await res.json();
      setTitle(data.title);
      setSourceUrl(data.source_url);
      const all = data.paragraphs.flatMap((p) => splitToSentences(p));
      setSentences(all);
      setCurrentIdx(0);
      setDoneSet(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setUrlLoading(false);
    }
  }, []);

  // Handle ?id=, ?from=library, ?url= on mount
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
          const data = JSON.parse(raw) as {
            title: string;
            paragraphs: string[];
          };
          setTitle(data.title);
          setSourceUrl("");
          const all = data.paragraphs.flatMap((p) => splitToSentences(p));
          setSentences(all);
          setCurrentIdx(0);
          setDoneSet(new Set());
          sessionStorage.removeItem("library_text");
        }
      } catch {
        /* ignore */
      }
    } else if (urlParam) {
      setUrl(urlParam);
      handleUrlSubmit(undefined, urlParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function handleUrlSubmit(e?: React.FormEvent, overrideUrl?: string) {
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
      const all = data.paragraphs.flatMap((p) => splitToSentences(p));
      setSentences(all);
      setCurrentIdx(0);
      setDoneSet(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setUrlLoading(false);
    }
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rawText.trim()) return;
    setTitle("貼り付けテキスト");
    setSourceUrl("");
    const all = splitToSentences(rawText);
    setSentences(all);
    setCurrentIdx(0);
    setDoneSet(new Set());
    setError("");
  }

  async function handleDeleteSaved(id: number) {
    try {
      const res = await fetch(`/api/texts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      setSavedTexts((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    }
  }

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

  // --- TTS ---
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

        if (practiceModeRef.current) {
          setIsPlaying(false);
          return;
        }

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
      setTranscript("");
      setPronResult(null);
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
    setTranscript("");
    setPronResult(null);
    speak(newIdx);
  }, [speak]);

  const next = useCallback(() => {
    window.speechSynthesis.cancel();
    const newIdx = Math.min(
      sentencesRef.current.length - 1,
      currentIdxRef.current + 1,
    );
    setCurrentIdx(newIdx);
    setTranscript("");
    setPronResult(null);
    speak(newIdx);
  }, [speak]);

  const repeat = useCallback(() => {
    window.speechSynthesis.cancel();
    speak(currentIdxRef.current);
  }, [speak]);

  // --- Speech Recognition for pronunciation practice ---
  function startRecording() {
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("このブラウザは音声認識に対応していません");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0][0].transcript;
      setTranscript(result);
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setPronResult(null);
    setIsRecording(true);
    recognition.start();
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }

  async function checkPronunciation() {
    if (!transcript || !sentences[currentIdx]) return;
    setPronLoading(true);
    try {
      const res = await fetch("/api/pronunciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: sentences[currentIdx],
          transcript,
        }),
      });
      if (!res.ok) throw new Error("発音チェックに失敗しました");
      const data: PronunciationResult = await res.json();
      setPronResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setPronLoading(false);
    }
  }

  // Auto-check after recording finishes
  useEffect(() => {
    if (transcript && practiceMode && !isRecording) {
      checkPronunciation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, isRecording]);

  // --- Keyboard shortcuts ---
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

  function handleReset() {
    window.speechSynthesis.cancel();
    recognitionRef.current?.stop();
    setSentences([]);
    setCurrentIdx(0);
    setDoneSet(new Set());
    setTitle("");
    setSourceUrl("");
    setRawText("");
    setUrl("");
    setError("");
    setIsPlaying(false);
    setTranscript("");
    setPronResult(null);
    setPracticeMode(false);
    setIsRecording(false);
  }

  // =========================================================================
  // Render: input modes
  // =========================================================================
  if (sentences.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          テキスト読み上げ
        </h1>

        <div className="flex gap-2 mb-6 flex-wrap">
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
  // Render: playback view
  // =========================================================================
  const speeds = [0.5, 0.75, 1, 1.25, 1.5];
  const progress = Math.round(((doneSet.size) / sentences.length) * 100);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Title */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-xl font-bold text-gray-900 truncate">{title}</h1>
        <span className="text-xs text-gray-400 shrink-0 mt-1">
          {doneSet.size}/{sentences.length}文 ({progress}%)
        </span>
      </div>
      {sourceUrl && (
        <p className="text-xs text-gray-400 mb-4 truncate">{sourceUrl}</p>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6">
        <div
          className="bg-gradient-to-r from-[#667eea] to-[#764ba2] h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setPracticeMode(false)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !practiceMode
              ? "bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          リスニングモード
        </button>
        <button
          onClick={() => setPracticeMode(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            practiceMode
              ? "bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          発音練習モード
        </button>
      </div>

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

        {/* Speed + voice */}
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

        {!practiceMode && (
          <div className="flex items-center justify-center gap-2">
            <input
              type="checkbox"
              id="auto-advance"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              className="accent-[#667eea]"
            />
            <label htmlFor="auto-advance" className="text-sm text-gray-600">
              自動で次の文へ進む
            </label>
          </div>
        )}
      </div>

      {/* Pronunciation practice panel */}
      {practiceMode && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">発音練習</h3>
          <p className="text-xs text-gray-500">
            お手本を聞いてから、マイクボタンを押して同じ文を話してください
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isPlaying}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                isRecording
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90"
              } disabled:opacity-40`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
              {isRecording ? "録音中...タップで停止" : "録音開始"}
            </button>
          </div>

          {/* Transcript */}
          {transcript && (
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">お手本:</p>
                <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3">
                  {sentences[currentIdx]}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">あなたの発話:</p>
                <p className="text-sm text-gray-800 bg-blue-50 rounded-lg p-3">
                  {transcript}
                </p>
              </div>
            </div>
          )}

          {/* Loading */}
          {pronLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              発音を分析中...
            </div>
          )}

          {/* Result */}
          {pronResult && (
            <div className="space-y-3">
              {/* Score */}
              <div className="flex items-center gap-3">
                <div
                  className={`text-2xl font-bold ${
                    pronResult.score >= 80
                      ? "text-green-600"
                      : pronResult.score >= 50
                        ? "text-yellow-600"
                        : "text-red-600"
                  }`}
                >
                  {pronResult.score}点
                </div>
                <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      pronResult.score >= 80
                        ? "bg-green-500"
                        : pronResult.score >= 50
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${pronResult.score}%` }}
                  />
                </div>
              </div>

              {/* Feedback */}
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                {pronResult.feedback}
              </p>

              {/* Word details */}
              {pronResult.details.missed.length > 0 && (
                <div>
                  <p className="text-xs text-red-600 font-medium mb-1">
                    言えなかった単語:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pronResult.details.missed.map((w, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {pronResult.details.correct.length > 0 && (
                <div>
                  <p className="text-xs text-green-600 font-medium mb-1">
                    正しく言えた単語:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pronResult.details.correct.map((w, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Script with highlights */}
      <div
        ref={scriptContainerRef}
        className="rounded-xl border border-gray-200 bg-white shadow-sm mb-6 p-5 max-h-[50vh] overflow-y-auto leading-relaxed"
      >
        {sentences.map((s, i) => (
          <span
            key={i}
            id={`sentence-${i}`}
            onClick={() => {
              window.speechSynthesis.cancel();
              setTranscript("");
              setPronResult(null);
              speak(i);
            }}
            className={`cursor-pointer transition-all duration-200 inline ${
              i === currentIdx
                ? "bg-yellow-200 text-gray-900 font-medium rounded px-0.5"
                : doneSet.has(i)
                  ? "text-gray-400"
                  : "text-gray-700 hover:bg-gray-100 rounded"
            }`}
          >
            {s}
          </span>
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

      <p className="text-xs text-gray-400 mt-4">
        キーボード: Space (再生/一時停止) ・ ← (前) ・ → (次) ・ R (繰り返し)
      </p>
    </div>
  );
}
