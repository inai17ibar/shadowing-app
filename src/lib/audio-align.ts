/**
 * 収録音声（人の朗読）と本文の文を対応づける（文ごとの startMs / endMs を求める）。
 *
 * 本格的な強制アライメント（音素モデル）は使わず、「文の切れ目には長めの間がある」ことを使う。
 * VOA Learning English のようなゆっくりした朗読では、文末の間は 0.7〜1 秒、読点の間は 0.15〜0.5 秒で、
 * はっきり分かれる（2026-10 に実音声で確認）。
 *
 *   1. 包絡から「間」（無音の区間）を見つける
 *   2. 文の長さ（文字数）から期待される所要時間と、間の長さの両方を見て、
 *      どの間を文の切れ目にするかを動的計画法で選ぶ
 *   3. 選んだ間の長さから、合わせ方の確かさ（confidence）を出す。低ければレビューで聞いて確かめる
 *
 * 末尾の署名（"I'm John Russell."）のように本文に無い発話が後ろに付いているときは、
 * trailingSignature で最後の短い発話を除いてから合わせる（文が少ないと、署名まで最後の文に含めてしまうため）。
 *
 * このファイルはブラウザにもNodeにも依存しない純関数だけを置く。
 */
import type { Envelope } from './overlap.ts'

export interface Pause {
  startMs: number
  endMs: number
}

export interface SentenceTiming {
  startMs: number
  endMs: number
}

export interface AlignmentResult {
  timings: SentenceTiming[]
  /** 0..1。文の切れ目に選んだ間が、どれだけ「文末らしい長い間」だったか */
  confidence: number
}

/** 正規化後のエネルギーがこれ未満を無音とみなす（朗読の録音は雑音が少ないので低めにする） */
const SILENCE = 0.06
/** これより短い無音は、子音の閉鎖などで間ではない */
const MIN_PAUSE_MS = 150
/** 文末らしい間の長さ。これ以上なら確かさを満点とする */
const SENTENCE_PAUSE_MS = 600
/** 署名とみなす、最後の間より後ろの発話の長さの上限 */
const SIGNATURE_MAX_MS = 3000
/** 文の前後に残す余白（言い始め・言い終わりが切れないように） */
const LEAD_MS = 80
const TAIL_MS = 150

/** 無音の区間を見つける */
export function findPauses(env: Envelope, { silence = SILENCE, minPauseMs = MIN_PAUSE_MS } = {}): Pause[] {
  const pauses: Pause[] = []
  const minFrames = Math.ceil(minPauseMs / env.hopMs)
  let run = 0
  for (let i = 0; i <= env.frames.length; i++) {
    if (i < env.frames.length && env.frames[i] < silence) {
      run++
      continue
    }
    if (run >= minFrames) pauses.push({ startMs: (i - run) * env.hopMs, endMs: i * env.hopMs })
    run = 0
  }
  return pauses
}

/** 読み上げ時間の目安としての文の長さ（英字と数字の数。空白・記号は数えない） */
function weight(text: string): number {
  return Math.max(1, (text.match(/[A-Za-z0-9]/g) ?? []).length)
}

function pauseScore(p: Pause): number {
  return Math.min(1, (p.endMs - p.startMs) / SENTENCE_PAUSE_MS)
}

/**
 * 文ごとの開始・終了を求める。文が1つも無い・声が無いときは null。
 */
export function alignSentences(
  env: Envelope,
  sentences: string[],
  { trailingSignature = false } = {},
): AlignmentResult | null {
  const n = sentences.length
  if (n === 0) return null
  const totalMs = env.frames.length * env.hopMs
  const pauses = findPauses(env)

  // 先頭・末尾の無音を除いた、声のある範囲
  const lead = pauses[0]?.startMs === 0 ? pauses.shift()! : null
  const tail = pauses.length > 0 && pauses[pauses.length - 1].endMs >= totalMs ? pauses.pop()! : null
  const speechStart = lead ? lead.endMs : 0
  let speechEnd = tail ? tail.startMs : totalMs
  if (trailingSignature) {
    // 最後の長い間より後ろの短い発話は署名なので、本文の範囲から外す
    const last = pauses.findLastIndex((p) => pauseScore(p) >= 0.8)
    if (last !== -1 && speechEnd - pauses[last].endMs <= SIGNATURE_MAX_MS) {
      speechEnd = pauses[last].startMs
      pauses.splice(last)
    }
  }
  if (speechEnd <= speechStart) return null

  // 切れ目の候補: 文中の間 ＋ 声の終わり（間の長さ 1 として扱う）
  const cuts: Pause[] = [...pauses, { startMs: speechEnd, endMs: speechEnd + SENTENCE_PAUSE_MS }]
  const weights = sentences.map(weight)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  const run = (msPerWeight: number) => {
    // best[i][c]: 文 i までを、i 番目の文の終わりを cuts[c] にして並べたときの最小コスト
    const best: number[][] = Array.from({ length: n }, () => new Array<number>(cuts.length).fill(Infinity))
    const from: number[][] = Array.from({ length: n }, () => new Array<number>(cuts.length).fill(-1))
    const startOf = (i: number, c: number) => (i === 0 ? speechStart : cuts[c].endMs)
    const cost = (i: number, startMs: number, cut: Pause) => {
      const expected = weights[i] * msPerWeight
      const actual = cut.startMs - startMs
      if (actual <= 0) return Infinity
      const ratio = Math.log(actual / expected)
      // 所要時間のずれ（2倍・半分で 1）と、切れ目の間の短さを足す
      return (ratio / Math.LN2) ** 2 + 1.5 * (1 - pauseScore(cut))
    }

    for (let c = 0; c < cuts.length; c++) best[0][c] = cost(0, speechStart, cuts[c])
    for (let i = 1; i < n; i++) {
      for (let c = i; c < cuts.length; c++) {
        for (let p = i - 1; p < c; p++) {
          if (best[i - 1][p] === Infinity) continue
          const v = best[i - 1][p] + cost(i, startOf(i, p), cuts[c])
          if (v < best[i][c]) {
            best[i][c] = v
            from[i][c] = p
          }
        }
      }
    }

    // 最後の文の終わりはどこでもよい（本文に無い署名などが後ろに付いていることがある）
    let end = -1
    for (let c = 0; c < cuts.length; c++) {
      if (best[n - 1][c] < Infinity && (end === -1 || best[n - 1][c] < best[n - 1][end])) end = c
    }
    if (end === -1) return null
    const chosen = new Array<number>(n)
    for (let i = n - 1, c = end; i >= 0; i--) {
      chosen[i] = c
      c = from[i][c]
    }
    return chosen
  }

  // 1回目は全体の長さから話速を見積もり、2回目は選ばれた範囲で見積もり直す
  let chosen = run((speechEnd - speechStart) / totalWeight)
  if (!chosen) return null
  const spokenEnd = cuts[chosen[n - 1]].startMs
  chosen = run((spokenEnd - speechStart) / totalWeight) ?? chosen

  const timings = chosen.map((c, i) => {
    const start = i === 0 ? speechStart : cuts[chosen![i - 1]].endMs
    return {
      startMs: Math.max(0, Math.round(start - LEAD_MS)),
      endMs: Math.min(totalMs, Math.round(cuts[c].startMs + TAIL_MS)),
    }
  })
  // 文の間の切れ目（最後の文の終わりを除く）が、文末らしい長さの間だったか
  const inner = chosen.slice(0, -1).map((c) => pauseScore(cuts[c]))
  const confidence = inner.length === 0 ? 1 : inner.reduce((a, b) => a + b, 0) / inner.length
  return { timings, confidence: Math.round(confidence * 100) / 100 }
}

export interface AudioPart {
  /** 文の番号の範囲 [from, to) */
  from: number
  to: number
  /** 元の音声の中での範囲 */
  startMs: number
  endMs: number
}

/**
 * 長い記事を、シャドーイングしやすい長さ（既定 約1分）のパートに分ける。
 * 文の途中では切らない。最後のパートが短すぎるときは前のパートにまとめる。
 */
export function splitIntoParts(
  timings: SentenceTiming[],
  { targetMs = 60_000, maxSentences = 12 } = {},
): AudioPart[] {
  const parts: AudioPart[] = []
  let from = 0
  for (let i = 0; i < timings.length; i++) {
    const length = timings[i].endMs - timings[from].startMs
    const count = i - from + 1
    if (i === timings.length - 1 || length >= targetMs || count >= maxSentences) {
      parts.push({ from, to: i + 1, startMs: timings[from].startMs, endMs: timings[i].endMs })
      from = i + 1
    }
  }
  const last = parts[parts.length - 1]
  if (parts.length >= 2 && last.endMs - last.startMs < targetMs / 3) {
    parts.pop()
    const prev = parts[parts.length - 1]
    prev.to = last.to
    prev.endMs = last.endMs
  }
  return parts
}
