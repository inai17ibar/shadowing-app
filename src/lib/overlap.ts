/**
 * シャドーイングの「重なり」を測る。
 *
 * 音声認識のテキストではなく、音そのものを見る。シャドーイングで問われるのは
 * 「意味が言えたか」ではなく「お手本の音に重ねられたか」なので、
 *
 *   - どれだけ遅れて追いているか（追随の遅れ）
 *   - 山と谷が一致しているか（リズム）
 *   - お手本と同じ速さで話しているか（話速比）
 *   - 途中で脱落していないか（カバー率）
 *
 * を、エネルギー包絡の比較だけで求める。ネットワークもモデルも使わないので、
 * 何回やっても費用はゼロで、結果は即座に返る（ADR: 採点の主指標）。
 *
 * このファイルはブラウザにもNodeにも依存しない純関数だけを置く。
 */

export interface Envelope {
  /** 0..1 に正規化されたフレームごとのエネルギー */
  frames: number[]
  /** フレームの間隔（ミリ秒） */
  hopMs: number
}

export interface OverlapMetrics {
  /** お手本に対する追随の遅れ（ミリ秒）。正なら学習者が後ろ */
  lagMs: number
  /** 遅れを揃えたあとの波形の一致度 0..1 */
  rhythm: number
  /** 話速比。1.0でお手本と同じ、0.5なら倍の速さで喋っている */
  rateRatio: number
  /** お手本が話している区間のうち、学習者も声を出していた割合 0..1 */
  coverage: number
}

export interface OverlapResult extends OverlapMetrics {
  score: number
  feedback: string
}

const DEFAULT_FRAME_MS = 25
const DEFAULT_HOP_MS = 10
/** 正規化後のエネルギーがこれを超えるフレームを「声が出ている」とみなす */
const VOICED_THRESHOLD = 0.15

/**
 * 波形からエネルギー包絡を作る。
 * フレームごとのRMSを取り、最大値で割って 0..1 に正規化する
 * （録音レベルの違いで点数が変わらないようにするため）。
 */
export function computeEnvelope(
  samples: ArrayLike<number>,
  sampleRate: number,
  { frameMs = DEFAULT_FRAME_MS, hopMs = DEFAULT_HOP_MS } = {},
): Envelope {
  const frameLen = Math.max(1, Math.round((sampleRate * frameMs) / 1000))
  const hopLen = Math.max(1, Math.round((sampleRate * hopMs) / 1000))
  const frames: number[] = []

  for (let start = 0; start + frameLen <= samples.length; start += hopLen) {
    let sum = 0
    for (let i = start; i < start + frameLen; i++) sum += samples[i] * samples[i]
    frames.push(Math.sqrt(sum / frameLen))
  }

  const max = frames.reduce((a, v) => (v > a ? v : a), 0)
  return {
    frames: max > 0 ? frames.map((v) => v / max) : frames,
    hopMs,
  }
}

function voicedFlags(env: Envelope): boolean[] {
  return env.frames.map((v) => v >= VOICED_THRESHOLD)
}

/** 声が出ている最初と最後のフレーム。無音なら null */
function voicedSpan(env: Envelope): { start: number; end: number } | null {
  const voiced = voicedFlags(env)
  const start = voiced.indexOf(true)
  if (start === -1) return null
  let end = voiced.length - 1
  while (end > start && !voiced[end]) end--
  return { start, end }
}

/** 重なり部分でのピアソン相関。長さが足りなければ null */
function correlationAtLag(ref: number[], user: number[], lag: number): number | null {
  const from = Math.max(0, -lag)
  const to = Math.min(ref.length, user.length - lag)
  const n = to - from
  if (n < 8) return null

  let sumA = 0
  let sumB = 0
  for (let i = from; i < to; i++) {
    sumA += ref[i]
    sumB += user[i + lag]
  }
  const meanA = sumA / n
  const meanB = sumB / n

  let num = 0
  let devA = 0
  let devB = 0
  for (let i = from; i < to; i++) {
    const a = ref[i] - meanA
    const b = user[i + lag] - meanB
    num += a * b
    devA += a * a
    devB += b * b
  }
  if (devA === 0 || devB === 0) return null
  return num / Math.sqrt(devA * devB)
}

/**
 * お手本と学習者の包絡を比べ、遅れ・リズム・話速・カバー率を求める。
 * 探索する遅れの範囲は既定で -0.5秒〜+2.5秒（シャドーイングは通常0.3〜1秒遅れる）。
 */
export function alignmentMetrics(
  reference: Envelope,
  user: Envelope,
  { minLagMs = -500, maxLagMs = 2500 } = {},
): OverlapMetrics {
  if (reference.hopMs !== user.hopMs) {
    throw new Error('reference と user の hopMs が一致していません')
  }
  const hop = reference.hopMs
  const minLag = Math.round(minLagMs / hop)
  const maxLag = Math.round(maxLagMs / hop)

  let bestLag = 0
  let bestCorr = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    const c = correlationAtLag(reference.frames, user.frames, lag)
    if (c !== null && c > bestCorr) {
      bestCorr = c
      bestLag = lag
    }
  }

  const refSpan = voicedSpan(reference)
  const userSpan = voicedSpan(user)

  // 相関は -1..1 で返るので 0..1 に畳む（逆相関は「一致していない」と同じ扱い）
  const rhythm = bestCorr === -Infinity ? 0 : Math.max(0, bestCorr)

  let rateRatio = 0
  if (refSpan && userSpan) {
    const refLen = refSpan.end - refSpan.start + 1
    const userLen = userSpan.end - userSpan.start + 1
    rateRatio = refLen > 0 ? userLen / refLen : 0
  }

  // 遅れを揃えたうえで、お手本が話している間に学習者も声を出していたか
  let coverage = 0
  if (refSpan) {
    const refVoiced = voicedFlags(reference)
    const userVoiced = voicedFlags(user)
    let total = 0
    let covered = 0
    for (let i = 0; i < refVoiced.length; i++) {
      if (!refVoiced[i]) continue
      total++
      const j = i + bestLag
      if (j >= 0 && j < userVoiced.length && userVoiced[j]) covered++
    }
    coverage = total > 0 ? covered / total : 0
  }

  return { lagMs: bestLag * hop, rhythm, rateRatio, coverage }
}

/** 話速比を 0..1 の減点係数に変換する。倍速・半分の速さで 0 になる */
function rateScore(rateRatio: number): number {
  if (rateRatio <= 0) return 0
  const octaves = Math.abs(Math.log2(rateRatio))
  return Math.max(0, 1 - octaves)
}

/**
 * 2つの包絡を比べ、0..100 の点数と日本語のひとことにする。
 * リズムを主、カバー率を従、話速を補正として扱う。
 */
export function scoreOverlap(reference: Envelope, user: Envelope): OverlapResult {
  return scoreMetrics(alignmentMetrics(reference, user))
}

/**
 * 指標だけから点数を出す。iOS側で包絡の比較まで済ませ、指標だけを送ってくる場合に使う
 * （点数の式はサーバーとWebで1か所に保つ）。
 */
export function scoreMetrics(metrics: OverlapMetrics): OverlapResult {
  if (metrics.coverage === 0 && metrics.rhythm === 0) {
    return {
      ...metrics,
      score: 0,
      feedback: '声が入っていません。マイクを確認してもう一度どうぞ。',
    }
  }

  const raw =
    metrics.rhythm * 0.5 + metrics.coverage * 0.3 + rateScore(metrics.rateRatio) * 0.2
  // 追随が1.2秒を超えると「重ねている」とは言いにくいので、そこから緩やかに引く
  const lagPenalty = Math.min(0.15, Math.max(0, (metrics.lagMs - 1200) / 8000))
  const score = Math.max(0, Math.min(100, Math.round((raw - lagPenalty) * 100)))

  return { ...metrics, score, feedback: buildFeedback(metrics, score) }
}

function buildFeedback(m: OverlapMetrics, score: number): string {
  // 話速が大きく外れると、その副作用としてカバー率も落ちる。原因のほうを先に伝えないと
  // 「抜けています」だけが出て、学習者に打ち手が残らない。
  if (m.coverage < 0.35) {
    return '途中で音が抜けています。全部言い切れなくてよいので、止まらずに追い続けてみましょう。'
  }
  if (m.rateRatio > 1.35) {
    return 'お手本よりゆっくりです。間を詰めて、次の語にすぐ乗ってみましょう。'
  }
  if (m.rateRatio < 0.75) {
    return '急ぎすぎています。お手本と同じ長さで言い切るつもりで。'
  }
  if (m.coverage < 0.6) {
    return '所々で音が途切れています。分からない語も、音だけ真似て繋いでみましょう。'
  }
  if (m.lagMs > 1200) {
    return `${(m.lagMs / 1000).toFixed(1)}秒ほど遅れています。文の途中で追いつこうとせず、出だしを早めましょう。`
  }
  if (score >= 85) {
    return `よく重なっています（遅れ ${m.lagMs}ms）。この感覚を覚えておきましょう。`
  }
  return `リズムがずれています（遅れ ${m.lagMs}ms）。意味より先に、音の高さと間を真似てみましょう。`
}

// ---------------------------------------------------------------------------
// お手本側の包絡を、音声データ無しで作る
// ---------------------------------------------------------------------------

export interface WordBoundary {
  /** 読み上げテキスト中の位置 */
  charIndex: number
  /** 発話開始からの経過ミリ秒（SpeechSynthesis の秒単位を変換済み） */
  elapsedMs: number
}

/** Web Speech API の秒単位を、採点用のミリ秒に変換する。 */
export function speechBoundary(event: { charIndex: number; elapsedTime: number }): WordBoundary {
  return { charIndex: event.charIndex, elapsedMs: event.elapsedTime * 1000 }
}

/**
 * ブラウザのTTSは音声データを取り出せないため、お手本の波形は手に入らない。
 * 代わりに `SpeechSynthesisUtterance.onboundary` が返す語の開始時刻から包絡を組み立てる
 * （実機で15語ぶんのイベントが取れることを確認済み）。
 *
 * 語と語の間隔が、その語の長さから期待される時間より明らかに広いところを「間」とみなす。
 * 基準となる1文字あたりの時間は与えられたデータ自体から求めるので、
 * 読み上げ速度や音声エンジンが変わっても追従する。
 *
 * YouTubeモードでは、これと同じ形の包絡を字幕のタイムスタンプから作れる。
 */
export function envelopeFromBoundaries(
  boundaries: WordBoundary[],
  text: string,
  totalMs: number,
  { hopMs = DEFAULT_HOP_MS, pauseFactor = 1.6 } = {},
): Envelope {
  const frameCount = Math.max(0, Math.round(totalMs / hopMs))
  const frames = new Array<number>(frameCount).fill(0)
  if (boundaries.length === 0 || frameCount === 0) return { frames, hopMs }

  const sorted = [...boundaries].sort((a, b) => a.elapsedMs - b.elapsedMs)

  const spans = sorted.map((b, i) => {
    const next = sorted[i + 1]
    const end = next ? next.elapsedMs : totalMs
    const sliceEnd = next ? next.charIndex : text.length
    const chars = Math.max(1, text.slice(b.charIndex, sliceEnd).trim().length)
    return { startMs: b.elapsedMs, gapMs: Math.max(0, end - b.elapsedMs), chars }
  })

  // 1文字あたりの標準的な所要時間を、このデータ自身の中央値から決める
  const perChar = median(spans.filter((s) => s.gapMs > 0).map((s) => s.gapMs / s.chars))

  for (const span of spans) {
    const expected = perChar > 0 ? span.chars * perChar : span.gapMs
    // 期待より大きく間が空いていれば、その超過分は「間」として無音にする
    const voicedMs =
      perChar > 0 && span.gapMs > expected * pauseFactor ? expected : span.gapMs

    const from = Math.round(span.startMs / hopMs)
    const to = Math.min(frameCount, Math.round((span.startMs + voicedMs) / hopMs))
    for (let i = Math.max(0, from); i < to; i++) frames[i] = 1
  }

  return { frames, hopMs }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
