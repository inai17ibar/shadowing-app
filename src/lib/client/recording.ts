/**
 * ブラウザでの読み上げ（TTS）と、読み上げに声を重ねた録音（ブラウザ専用）。
 *
 * お手本の包絡は TTS の onboundary（語ごとの経過時間）から、自分の包絡はマイクの録音から作る。
 * 音声そのものはサーバーに送らず、10ms 刻み・0..1 の包絡だけを POST /attempts に送る（ADR-001）。
 * 仕組みは検証ページ src/app/overlap/page.tsx と同じ。
 */
import {
  computeEnvelope,
  envelopeFromBoundaries,
  speechBoundary,
  type Envelope,
  type WordBoundary,
} from "@/lib/overlap";

/** 録音の末尾に足す余白。シャドーイングは遅れて追うので、言い終わりが切れないようにする */
const TAIL_MS = 1800;
/** API が受け付ける包絡の長さ（5分 = 30000 フレーム） */
const MAX_FRAMES = 30_000;

/**
 * macOS の効果音的な声（歌う・ささやく・ロボット声など）。lang は en-US だが、お手本には向かない
 */
const NOVELTY_VOICES = new Set([
  "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Good News", "Jester",
  "Organ", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox", "Deranged", "Hysterical", "Pipe Organ",
]);

/**
 * お手本に使える英語の声の一覧。日本語など他の言語の声は含めない
 * （日本語の声で英文を読むと、カタカナ読みのお手本になってしまう）。
 * 端末内の声・米英語を先に並べる。
 */
export function englishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const rank = (v: SpeechSynthesisVoice) => (v.localService ? 0 : 2) + (v.lang.replace("_", "-") === "en-US" ? 0 : 1);
  return window.speechSynthesis
    .getVoices()
    .filter((v) => /^en([-_]|$)/i.test(v.lang) && !NOVELTY_VOICES.has(v.name.replace(/\s*\(.*\)$/, "")))
    .sort((a, b) => rank(a) - rank(b));
}

/** 端末にある英語の声を選ぶ（無ければ null で、lang="en-US" の指定だけでブラウザに選ばせる） */
export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  const en = englishVoices();
  return en.find((v) => v.localService && v.name === "Samantha") ?? en[0] ?? null;
}

/** 声の一覧は非同期に読み込まれるので、変わったら呼び直す */
export function onVoicesChanged(cb: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

function utterance(text: string, voice: SpeechSynthesisVoice | null, rate: number) {
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-US";
  u.rate = rate;
  return u;
}

/** 読み上げる。終わるか止められたら resolve する */
export function speak(text: string, opts: { voice: SpeechSynthesisVoice | null; rate: number }): Promise<void> {
  return new Promise((resolve) => {
    const u = utterance(text, opts.voice, opts.rate);
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export class RecordingError extends Error {}

export interface OverlapRecording {
  reference: Envelope;
  user: Envelope;
  durationMs: number;
  /** 読み上げの語ごとの開始時刻。音の変化（連結など）の判定に使う。API には送らない */
  boundaries: WordBoundary[];
}

/** API に送る前に、長さを上限で切り、小数を丸めて送る量を減らす */
function compact(env: Envelope): Envelope {
  return {
    hopMs: env.hopMs,
    frames: env.frames.slice(0, MAX_FRAMES).map((v) => Math.min(1, Math.max(0, Math.round(v * 1000) / 1000))),
  };
}

/**
 * お手本を読み上げながらマイクで録音し、両方の包絡を返す。
 * 録音開始と読み上げ開始のズレを onstart で測り、読み上げ開始を t=0 に揃える。
 */
export async function recordOverlap(
  text: string,
  opts: { voice: SpeechSynthesisVoice | null; rate: number; onPhase?: (phase: "recording" | "analyzing") => void },
): Promise<OverlapRecording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new RecordingError("マイクを使えませんでした。ブラウザのマイク許可を確認してください。");
  }

  try {
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    });

    opts.onPhase?.("recording");
    recorder.start();
    const recordStart = performance.now();

    const boundaries: WordBoundary[] = [];
    const u = utterance(text, opts.voice, opts.rate);
    let speakStart = 0;
    u.onstart = () => {
      speakStart = performance.now() - recordStart;
    };
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      boundaries.push(speechBoundary(e));
    };
    const spoken = new Promise<number>((resolve) => {
      u.onend = () => resolve(performance.now() - recordStart - speakStart);
      u.onerror = () => resolve(0);
    });

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    const spokenMs = await spoken;

    await new Promise((r) => setTimeout(r, TAIL_MS));
    recorder.stop();
    const blob = await finished;
    const durationMs = Math.round(performance.now() - recordStart);
    opts.onPhase?.("analyzing");

    if (boundaries.length === 0 || spokenMs === 0) {
      throw new RecordingError(
        "読み上げの語区切りイベントが取れませんでした。このブラウザでは採点できません（Chrome / Safari をお試しください）。",
      );
    }

    let recorded: Envelope;
    try {
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      recorded = computeEnvelope(decoded.getChannelData(0), decoded.sampleRate);
      await ctx.close();
    } catch {
      throw new RecordingError("録音を解析できませんでした。もう一度お試しください。");
    }

    const offsetFrames = Math.max(0, Math.round(speakStart / recorded.hopMs));
    const user: Envelope = { frames: recorded.frames.slice(offsetFrames), hopMs: recorded.hopMs };
    const reference = envelopeFromBoundaries(boundaries, text, spokenMs);
    if (user.frames.length === 0 || reference.frames.length === 0) {
      throw new RecordingError("録音が短すぎました。もう一度お試しください。");
    }
    return { reference: compact(reference), user: compact(user), durationMs, boundaries };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
