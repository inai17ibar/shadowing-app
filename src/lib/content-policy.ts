/**
 * 教材として配信してよいかの判定。
 *
 * App Store 審査で問われるのは主に次の2点（docs/content-collection.md）。
 *
 *   - 5.2.1 / 5.2.2: 第三者の著作物を、権利者の許可なく配信していないか
 *   - 5.2.3: 第三者サービス（YouTube等）の音声・動画を保存・取り出しさせていないか
 *
 * そこで、アプリの共有カタログに載る教材はすべて「出典」と「ライセンス」を持ち、
 * この関数を通ったものだけを published にする。利用者が自分で取り込んだ文章（私的利用）は
 * カタログには載せず、本人の端末とアカウントの中だけで使う。
 *
 * ブラウザにもNodeにも依存しない純関数だけを置く。
 */

export type License =
  /** 自社で書いた（または生成して人が確認した）文章 */
  | "original"
  /** 著作権切れ・米国政府著作物など */
  | "public-domain"
  | "cc0"
  | "cc-by"
  | "cc-by-sa"
  | "cc-by-nc"
  | "cc-by-nd"
  | "cc-by-nc-nd"
  /** 権利者と個別に契約済み */
  | "licensed"
  | "unknown";

export interface ContentCandidate {
  title: string;
  sentences: string[];
  sourceName: string;
  sourceUrl: string;
  license: License;
  /** CC BY 系で表示が必要な帰属表示 */
  attribution?: string;
  /** 契約で許諾を得ている場合の契約ID */
  licenseRef?: string;
}

export type PolicyVerdict =
  | { ok: true; needsReview: boolean; notes: string[] }
  | { ok: false; reasons: string[] };

/**
 * 有料アプリ（サブスク）で配信し、TTS音声という派生物を作る前提での判定。
 *
 * - NC（非営利）: 有料アプリでの配信は営利目的にあたるので不可
 * - ND（改変禁止）: 文に分割し、音声化し、訳を付けるのは改変にあたるので不可
 * - SA（継承）: 可能だが、派生物（音声・分割版）も同じライセンスで出す必要がある
 */
export function evaluateCandidate(c: ContentCandidate): PolicyVerdict {
  const reasons: string[] = [];
  const notes: string[] = [];

  switch (c.license) {
    case "original":
    case "public-domain":
    case "cc0":
      break;
    case "cc-by":
      if (!c.attribution?.trim()) reasons.push("CC BY は帰属表示(attribution)が必須です");
      break;
    case "cc-by-sa":
      if (!c.attribution?.trim()) reasons.push("CC BY-SA は帰属表示(attribution)が必須です");
      notes.push("派生物（文分割・音声）も CC BY-SA で提供する必要があります");
      break;
    case "licensed":
      if (!c.licenseRef?.trim()) reasons.push("契約済みコンテンツには licenseRef が必要です");
      break;
    case "cc-by-nc":
    case "cc-by-nc-nd":
      reasons.push("非営利(NC)ライセンスは有料アプリで配信できません");
      break;
    case "cc-by-nd":
      reasons.push("改変禁止(ND)ライセンスは文分割・音声化ができません");
      break;
    case "unknown":
      reasons.push("ライセンスが不明です。出典を確認してください");
      break;
  }

  if (!/^https?:\/\//.test(c.sourceUrl) && c.license !== "original") {
    reasons.push("出典URLがありません");
  }
  if (c.sentences.length === 0) reasons.push("本文が空です");

  // 米国政府著作物（VOA等）でも、通信社の配信記事は通信社の著作物で、パブリックドメインではない
  const credits = detectThirdPartyCredits([c.title, ...c.sentences].join("\n"));
  if (c.license === "public-domain" && credits.length > 0) {
    notes.push(`通信社・第三者のクレジットがあります: ${credits.join(", ")}`);
  }

  if (reasons.length > 0) return { ok: false, reasons };

  // 原則として人が目を通してから公開する。機械的に公開してよいのは自社オリジナルだけ
  const needsReview = c.license !== "original" || credits.length > 0;
  return { ok: true, needsReview, notes };
}

const THIRD_PARTY_CREDIT_PATTERNS: Array<[RegExp, string]> = [
  [/\(AP\)|\bAssociated Press\b/i, "AP"],
  [/\bReuters\b/i, "Reuters"],
  [/\bAFP\b|Agence France-Presse/i, "AFP"],
  [/\bGetty Images\b/i, "Getty Images"],
  [/©|\bcopyright\b|\ball rights reserved\b/i, "著作権表示"],
];

/** 本文中の第三者クレジット（通信社・著作権表示）を検出する */
export function detectThirdPartyCredits(text: string): string[] {
  return THIRD_PARTY_CREDIT_PATTERNS.filter(([re]) => re.test(text)).map(([, name]) => name);
}

// ---------------------------------------------------------------------------
// 文分割
// ---------------------------------------------------------------------------

/**
 * 段落を、シャドーイングしやすい長さの文に分ける。
 * 略語（Mr. / U.S. など）で切らないようにし、長すぎる文はカンマで割る。
 */
export function splitSentences(paragraphs: string[], { maxWords = 28 } = {}): string[] {
  const out: string[] = [];
  for (const p of paragraphs) {
    const text = p.replace(/\s+/g, " ").trim();
    if (!text) continue;
    for (const s of splitParagraph(text)) {
      out.push(...splitLong(s, maxWords));
    }
  }
  return out;
}

const ABBREVIATIONS =
  /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Gen|Gov|Sen|Rep|Inc|Corp|Ltd|Co|vs|etc|e\.g|i\.e|U\.S|U\.K|No|a\.m|p\.m|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.$/i;

function splitParagraph(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const re = /[.!?]["')\]]?\s+(?=[A-Z"'(])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].trimEnd().length;
    const candidate = text.slice(start, end);
    if (ABBREVIATIONS.test(candidate)) continue;
    parts.push(candidate.trim());
    start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) parts.push(rest);
  return parts;
}

function splitLong(sentence: string, maxWords: number): string[] {
  const words = sentence.split(" ");
  if (words.length <= maxWords) return [sentence];
  const chunks = sentence.split(/(?<=[,;:])\s+/);
  if (chunks.length === 1) return [sentence];
  const out: string[] = [];
  let buf = "";
  for (const chunk of chunks) {
    const next = buf ? `${buf} ${chunk}` : chunk;
    if (buf && next.split(" ").length > maxWords) {
      out.push(buf);
      buf = chunk;
    } else {
      buf = next;
    }
  }
  // 末尾の切れ端（"on Sunday, Oct. 11." など）は単独では練習にならないので前に戻す
  if (buf && out.length > 0 && buf.split(" ").length < MIN_CHUNK_WORDS) {
    out[out.length - 1] = `${out[out.length - 1]} ${buf}`;
  } else if (buf) {
    out.push(buf);
  }
  return out;
}

const MIN_CHUNK_WORDS = 6;

// ---------------------------------------------------------------------------
// レベル推定
// ---------------------------------------------------------------------------

/**
 * 文の平均語数と長い語の割合から、ざっくりレベルを推定する。
 * 自動収集した教材の初期値に使い、公開前のレビューで人が直す前提。
 */
export function estimateLevel(sentences: string[]): "beginner" | "intermediate" | "advanced" {
  const words = sentences.flatMap((s) => s.split(/\s+/).filter(Boolean));
  if (words.length === 0) return "beginner";
  const avgWords = words.length / sentences.length;
  const longWordRatio =
    words.filter((w) => w.replace(/[^A-Za-z]/g, "").length >= 8).length / words.length;
  const score = avgWords / 12 + longWordRatio * 5;
  if (score < 1.4) return "beginner";
  if (score < 2.1) return "intermediate";
  return "advanced";
}
