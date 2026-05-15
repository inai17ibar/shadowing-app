"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import YouTube, { type YouTubeEvent, type YouTubePlayer } from "react-youtube";

export default function VideoPlayerPage() {
  const params = useParams();
  const videoId = params.videoId as string;

  const playerRef = useRef<YouTubePlayer | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  // A-B loop state
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);

  // refs for loop values used in interval
  const loopStartRef = useRef<number | null>(null);
  const loopEndRef = useRef<number | null>(null);
  useEffect(() => {
    loopStartRef.current = loopStart;
  }, [loopStart]);
  useEffect(() => {
    loopEndRef.current = loopEnd;
  }, [loopEnd]);

  // --- start progress tracking ---
  const startTracking = useCallback(() => {
    if (progressInterval.current) return;
    progressInterval.current = setInterval(async () => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const t = await player.getCurrentTime();
        const d = await player.getDuration();
        setCurrentTime(t);
        setDuration(d);

        // A-B loop enforcement
        if (
          loopStartRef.current !== null &&
          loopEndRef.current !== null &&
          t >= loopEndRef.current
        ) {
          player.seekTo(loopStartRef.current, true);
        }
      } catch {
        // player might be destroyed
      }
    }, 250);
  }, []);

  const stopTracking = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => stopTracking();
  }, [stopTracking]);

  // --- player event handlers ---
  function onReady(e: YouTubeEvent) {
    playerRef.current = e.target;
    e.target.getDuration().then((d: number) => setDuration(d));
  }

  function onStateChange(e: YouTubeEvent) {
    // YT.PlayerState: 1 = playing, 2 = paused
    const state = e.data;
    if (state === 1) {
      setIsPlaying(true);
      startTracking();
    } else {
      setIsPlaying(false);
      if (state === 2 || state === 0) {
        stopTracking();
      }
    }
  }

  // --- controls ---
  const togglePlay = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    const state = await player.getPlayerState();
    if (state === 1) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }, []);

  const seekRelative = useCallback(async (delta: number) => {
    const player = playerRef.current;
    if (!player) return;
    const t = await player.getCurrentTime();
    const d = await player.getDuration();
    const newTime = Math.max(0, Math.min(d, t + delta));
    player.seekTo(newTime, true);
    setCurrentTime(newTime);
  }, []);

  const changeSpeed = useCallback(
    (newSpeed: number) => {
      setSpeed(newSpeed);
      playerRef.current?.setPlaybackRate(newSpeed);
    },
    [],
  );

  // --- progress bar click ---
  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const newTime = pct * duration;
    playerRef.current?.seekTo(newTime, true);
    setCurrentTime(newTime);
  }

  // --- A-B loop ---
  function setA() {
    setLoopStart(currentTime);
  }
  function setB() {
    setLoopEnd(currentTime);
  }
  function clearLoop() {
    setLoopStart(null);
    setLoopEnd(null);
  }

  // --- keyboard shortcuts ---
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekRelative(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekRelative(5);
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay, seekRelative]);

  // --- format time ---
  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5];
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Back button */}
      <Link
        href="/youtube"
        className="inline-flex items-center text-sm text-gray-500 hover:text-[#667eea] transition-colors mb-6"
      >
        &larr; 検索に戻る
      </Link>

      {/* YouTube Player (hidden controls) */}
      <div className="rounded-xl overflow-hidden shadow-lg mb-6 bg-black aspect-video">
        <YouTube
          videoId={videoId}
          opts={{
            width: "100%",
            height: "100%",
            playerVars: {
              controls: 0,
              modestbranding: 1,
              rel: 0,
              disablekb: 1,
            },
          }}
          onReady={onReady}
          onStateChange={onStateChange}
          className="w-full h-full"
          iframeClassName="w-full h-full"
        />
      </div>

      {/* Custom controls card */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        {/* Progress bar */}
        <div>
          <div
            className="h-2 bg-gray-200 rounded-full cursor-pointer relative"
            onClick={handleProgressClick}
          >
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#667eea] to-[#764ba2] rounded-full transition-all duration-150"
              style={{ width: `${progressPct}%` }}
            />
            {/* A-B loop markers */}
            {loopStart !== null && duration > 0 && (
              <div
                className="absolute top-0 w-1 h-full bg-green-500 rounded"
                style={{ left: `${(loopStart / duration) * 100}%` }}
                title={`A: ${formatTime(loopStart)}`}
              />
            )}
            {loopEnd !== null && duration > 0 && (
              <div
                className="absolute top-0 w-1 h-full bg-red-500 rounded"
                style={{ left: `${(loopEnd / duration) * 100}%` }}
                title={`B: ${formatTime(loopEnd)}`}
              />
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback buttons */}
        <div className="flex items-center justify-center gap-3">
          {/* -5s */}
          <button
            onClick={() => seekRelative(-5)}
            title="5秒戻る"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
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

          {/* +5s */}
          <button
            onClick={() => seekRelative(5)}
            title="5秒進む"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
            </svg>
          </button>
        </div>

        {/* Speed control */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs text-gray-500 mr-1">速度:</span>
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => changeSpeed(s)}
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

        {/* A-B Loop */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 mr-1">A-Bループ:</span>
          <button
            onClick={setA}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
              loopStart !== null
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            A: {loopStart !== null ? formatTime(loopStart) : "設定"}
          </button>
          <button
            onClick={setB}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
              loopEnd !== null
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            B: {loopEnd !== null ? formatTime(loopEnd) : "設定"}
          </button>
          {(loopStart !== null || loopEnd !== null) && (
            <button
              onClick={clearLoop}
              className="px-3 py-1 text-xs rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              クリア
            </button>
          )}
        </div>
      </div>

      {/* Keyboard hints */}
      <p className="text-xs text-gray-400 mt-4 text-center">
        キーボード: Space (再生/一時停止) ・ ← (5秒戻る) ・ → (5秒進む)
      </p>
    </div>
  );
}
