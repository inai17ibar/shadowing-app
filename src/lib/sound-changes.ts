/**
 * 英語の「音の変化」の3つのルール（連結・同化・脱落）を、文から見つけて、
 * 学習者がつなげて言えていたかを録音の包絡で確かめる。
 *
 *   - 連結（linking）: 子音で終わる語＋母音で始まる語は、1語のようにつなげる（check it → チェキッ）
 *   - 同化（assimilation）: t / d / s / z ＋ you は、混ざって別の音になる（meet you → ミーチュー）
 *   - 脱落（elision）: 語末の破裂音（p b t d k g）の後に子音が続くと、ほとんど聞こえなくなる（good morning → グッ モーニン）
 *
 * 綴りから判定する簡易版なので、例外（発音しない文字など）は取りこぼす。
 * 誤って指摘するよりは見逃すほうに倒している。
 *
 * 判定（checkSoundChanges）で見るのは「つなげるべき所で音が途切れていないか」だけ。
 * 包絡（声の強弱）しか持たないので、音色が変わったか（同化）や、語末の音を飲み込めたか（脱落）は判定できない。
 * 脱落は表示して意識させるだけにする。
 *
 * このファイルはブラウザにもNodeにも依存しない純関数だけを置く。
 */
import type { Envelope, WordBoundary } from './overlap.ts'

export type SoundChangeKind = 'linking' | 'assimilation' | 'elision'

export const SOUND_CHANGE_LABELS: Record<SoundChangeKind, string> = {
  linking: '連結',
  assimilation: '同化',
  elision: '脱落',
}

export interface WordToken {
  text: string
  /** 文中の開始位置 */
  start: number
  end: number
}

export interface SoundChange {
  kind: SoundChangeKind
  /** 前の語の番号（tokenize の並び）。後ろの語は wordIndex + 1 */
  wordIndex: number
  /** 例: "check‿it" */
  label: string
  /** どう読むかのひとこと */
  hint: string
}

/** 語（英字とアポストロフィ）を位置つきで取り出す */
export function tokenize(text: string): WordToken[] {
  const tokens: WordToken[] = []
  for (const m of text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  }
  return tokens
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])
const STOPS = new Set(['p', 'b', 't', 'd', 'k', 'g'])
/** 綴りは母音で始まるが、最初の音が子音（/j/ や /w/）の語 */
const CONSONANT_SOUND_START = /^(?:uni|use|usu|uti|ure|euro|eu|one|once|ewe)/
/** 綴りは h で始まるが、h を発音しない語 */
const SILENT_H = /^(?:hour|honest|honou?r|heir)/
/** 文中では h が落ちて前の語につながる代名詞（tell him → テリム） */
const WEAK_H = new Set(['him', 'her', 'his'])
const YOU_WORDS = new Set(['you', 'your', "you're", 'yours', 'yourself', "you've", "you'll", "you'd"])
/** 語末の s を /z/ で読む機能語 */
const Z_FINAL = new Set(['as', 'is', 'has', 'was', 'does', 'his', 'says', 'goes'])

function normalize(word: string): string {
  return word.toLowerCase().replace(/’/g, "'")
}

/** 語の最後の音の文字（語末の発音しない e を飛ばす。make → k） */
function finalSound(word: string): string {
  const w = normalize(word)
  const last = w[w.length - 1]
  if (last === 'e' && w.length >= 4 && !VOWELS.has(w[w.length - 2])) return w[w.length - 2]
  return last
}

function startsWithVowelSound(word: string): boolean {
  const w = normalize(word)
  if (SILENT_H.test(w)) return true
  return VOWELS.has(w[0]) && !CONSONANT_SOUND_START.test(w)
}

/** 2語の間に句読点（間を置くのが自然な所）があるか */
function pauseBetween(text: string, a: WordToken, b: WordToken): boolean {
  return /[^\s'"“”‘’]/.test(text.slice(a.end, b.start))
}

function assimilationHint(prev: string, final: string): string {
  if (final === 't') return 't と y が混ざって「チュ」に（meet you → ミーチュー）'
  if (final === 'd') return 'd と y が混ざって「ジュ」に（did you → ディジュ）'
  if (final === 's' && Z_FINAL.has(normalize(prev))) return 's と y が混ざって「ジュ」に（as you → アジュ）'
  if (final === 's') return 's と y が混ざって「シュ」に（miss you → ミシュー）'
  return 'z と y が混ざって「ジュ」に'
}

/** 文の中の音の変化を、前から順に見つける */
export function findSoundChanges(text: string): SoundChange[] {
  const tokens = tokenize(text)
  const changes: SoundChange[] = []

  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]
    const b = tokens[i + 1]
    if (pauseBetween(text, a, b)) continue

    const label = `${a.text}‿${b.text}`
    const final = finalSound(a.text)
    const next = normalize(b.text)
    const endsWithConsonant = !VOWELS.has(final) && final !== 'y' && final !== 'w'

    if (YOU_WORDS.has(next) && ['t', 'd', 's', 'z'].includes(final)) {
      changes.push({ kind: 'assimilation', wordIndex: i, label, hint: assimilationHint(a.text, final) })
    } else if (endsWithConsonant && WEAK_H.has(next)) {
      changes.push({
        kind: 'linking',
        wordIndex: i,
        label,
        hint: `${b.text} の h は弱く落ちて、前の語とつながる（tell him → テリム）`,
      })
    } else if (startsWithVowelSound(b.text)) {
      changes.push({
        kind: 'linking',
        wordIndex: i,
        label,
        hint: endsWithConsonant
          ? `${a.text} の最後の音を ${b.text} の頭に乗せて、1語のように`
          : `間を空けずに、軽く「ワ」「ヤ」の音でつなぐ（go on → ゴウォン）`,
      })
    } else if (STOPS.has(final) && !VOWELS.has(next[0])) {
      changes.push({
        kind: 'elision',
        wordIndex: i,
        label,
        hint: `${a.text} の最後の ${final} は口の形だけ作って、ほとんど音にしない`,
      })
    }
  }
  return changes
}

// ---------------------------------------------------------------------------
// 録音での判定
// ---------------------------------------------------------------------------

export interface SoundChangeCheck extends SoundChange {
  /** linked: つながっていた / broken: 間が空いていた / unknown: 判定できない（その辺りで声が出ていない等） */
  result: 'linked' | 'broken' | 'unknown'
  /** 途切れていた長さ（ミリ秒） */
  gapMs: number
}

/** 正規化後のエネルギーがこれ未満のフレームを無音とみなす（overlap.ts と同じ値） */
const SILENCE_THRESHOLD = 0.15
/** これより長く無音なら「途切れた」とする。語末の閉鎖（check の k など）は 100ms 未満なので区別できる */
const BROKEN_GAP_MS = 160
/** 境目を探す幅（前後） */
const SEARCH_MS = 220
/** 局所的な遅れを測る窓（前後）と、全体の遅れからのずれの許容 */
const LOCAL_WINDOW_MS = 1500
const LOCAL_SHIFT_MS = 300

function correlation(ref: number[], user: number[], from: number, to: number, lag: number): number | null {
  let n = 0
  let sumA = 0
  let sumB = 0
  for (let i = from; i < to; i++) {
    const j = i + lag
    if (i < 0 || i >= ref.length || j < 0 || j >= user.length) continue
    n++
    sumA += ref[i]
    sumB += user[j]
  }
  if (n < 20) return null
  const meanA = sumA / n
  const meanB = sumB / n
  let num = 0
  let devA = 0
  let devB = 0
  for (let i = from; i < to; i++) {
    const j = i + lag
    if (i < 0 || i >= ref.length || j < 0 || j >= user.length) continue
    const x = ref[i] - meanA
    const y = user[j] - meanB
    num += x * y
    devA += x * x
    devB += y * y
  }
  if (devA === 0 || devB === 0) return null
  return num / Math.sqrt(devA * devB)
}

/** 文の途中で遅れが変わっても追えるよう、その位置の前後だけで遅れを測り直す */
function localLag(reference: Envelope, user: Envelope, center: number, globalLag: number): number {
  const hop = reference.hopMs
  const win = Math.round(LOCAL_WINDOW_MS / hop)
  const shift = Math.round(LOCAL_SHIFT_MS / hop)
  let best = globalLag
  let bestCorr = -Infinity
  for (let lag = globalLag - shift; lag <= globalLag + shift; lag++) {
    const c = correlation(reference.frames, user.frames, center - win, center + win, lag)
    if (c !== null && c > bestCorr) {
      bestCorr = c
      best = lag
    }
  }
  return best
}

/** 語の開始時刻（読み上げの onboundary）を、tokenize の並びに対応づける */
function wordStartTimes(text: string, boundaries: WordBoundary[]): Array<number | null> {
  const tokens = tokenize(text)
  return tokens.map((t) => {
    let best: WordBoundary | null = null
    for (const b of boundaries) {
      if (Math.abs(b.charIndex - t.start) <= 1 && (!best || Math.abs(b.charIndex - t.start) < Math.abs(best.charIndex - t.start))) {
        best = b
      }
    }
    return best ? best.elapsedMs : null
  })
}

/**
 * 連結・同化の所（つなげて言うべき所）で、学習者の声が途切れていなかったかを見る。
 * 脱落は包絡では判定できないので、ここでは扱わない（result: 'unknown' で返す）。
 *
 * @param lagMs 全体での追随の遅れ（alignmentMetrics の lagMs）
 */
export function checkSoundChanges(
  text: string,
  boundaries: WordBoundary[],
  reference: Envelope,
  user: Envelope,
  lagMs: number,
): SoundChangeCheck[] {
  const hop = user.hopMs
  const starts = wordStartTimes(text, boundaries)
  const globalLag = Math.round(lagMs / hop)
  const search = Math.round(SEARCH_MS / hop)

  return findSoundChanges(text).map((change) => {
    const at = starts[change.wordIndex + 1]
    if (change.kind === 'elision' || at === null) return { ...change, result: 'unknown', gapMs: 0 }

    const refFrame = Math.round(at / hop)
    const center = refFrame + localLag(reference, user, refFrame, globalLag)
    const from = Math.max(0, center - search)
    const to = Math.min(user.frames.length, center + search)

    // その辺りで声を出していなければ、つながり以前の問題なので判定しない
    const before = user.frames.slice(Math.max(0, from - search), from).some((v) => v >= SILENCE_THRESHOLD)
    const after = user.frames.slice(to, to + search).some((v) => v >= SILENCE_THRESHOLD)
    if (to <= from || !before || !after) return { ...change, result: 'unknown', gapMs: 0 }

    let longest = 0
    let run = 0
    for (let i = from; i < to; i++) {
      run = user.frames[i] < SILENCE_THRESHOLD ? run + 1 : 0
      if (run > longest) longest = run
    }
    const gapMs = longest * hop
    return { ...change, result: gapMs >= BROKEN_GAP_MS ? 'broken' : 'linked', gapMs }
  })
}

/** 判定結果を、学習者へのひとことにまとめる */
export function soundChangeFeedback(checks: SoundChangeCheck[]): string | null {
  const judged = checks.filter((c) => c.result !== 'unknown')
  if (judged.length === 0) return null
  const broken = judged.filter((c) => c.result === 'broken')
  if (broken.length === 0) return `つなげて言う所（${judged.length}か所）は、どれも途切れずに言えていました。`
  const names = broken.slice(0, 3).map((c) => c.label).join('、')
  return `${names} で音が途切れています。前の語の最後の音を、次の語の頭に乗せてつなげましょう。`
}
