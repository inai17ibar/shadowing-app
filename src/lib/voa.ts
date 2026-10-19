/**
 * VOA Learning English のアーカイブ（2025年3月まで）から、収録音声つきの教材を作る。
 *
 * VOA の記事と音声は米国政府の著作物でパブリックドメイン。ただし通信社（AP / Reuters など）の
 * 配信記事・写真は除くので、記事末尾のクレジットも含めて detectThirdPartyCredits にかけ、
 * 該当すればレビュー時の注意事項に残す（docs/content-collection.md の 1-b）。
 *
 * 取り込みは scripts/import-voa.ts から手元で行う（音声の切り出しに ffmpeg を使うため）。
 * ここにはHTMLの読み取りと教材の組み立てだけを、純関数として置く。
 */
import * as cheerio from "cheerio";
import { detectThirdPartyCredits, estimateLevel, evaluateCandidate, splitSentences } from "./content-policy.ts";
import type { AudioPart, SentenceTiming } from "./audio-align.ts";

export const VOA_HOST = "learningenglish.voanews.com";
export const VOA_SOURCE_NAME = "VOA Learning English";
export const VOA_ATTRIBUTION = "Voice of America (VOA Learning English) — public domain";

/** 取り込みに向いている番組・カテゴリ（/z/{id}）。動画中心の番組（Let's Learn English など）は除く */
export const VOA_SECTIONS: Record<string, { name: string; tags: string[] }> = {
  "3521": { name: "As It Is", tags: ["news"] },
  "1579": { name: "Science & Technology", tags: ["science", "news"] },
  "955": { name: "Health & Lifestyle", tags: ["health", "lifestyle"] },
  "986": { name: "Arts & Culture", tags: ["culture"] },
  "1581": { name: "American Stories", tags: ["story"] },
  "987": { name: "Words & Their Stories", tags: ["vocabulary"] },
};

/** 一覧ページから記事のURLを取り出す（重複を除き、出てきた順） */
export function parseListing(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $("a[href^='/a/']").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    if (/^\/a\/[^?#]*\d+\.html$/.test(href)) urls.add(`https://${VOA_HOST}${href}`);
  });
  return [...urls];
}

export interface VoaArticle {
  url: string;
  /** URL 末尾の記事番号 */
  articleId: string;
  title: string;
  description: string;
  publishedAt: string | null;
  /** 朗読されている本文（署名「I'm ...」より前） */
  paragraphs: string[];
  /** 署名より後ろ（執筆者・出典・語彙リスト）。クレジットの確認にだけ使う */
  trailer: string[];
  /** 朗読の最後に署名（"I'm ..."）が読まれているか。音声と合わせるときに除く */
  hasSignature: boolean;
  audioUrl: string | null;
}

/** 朗読の最後に読まれる署名（"I'm John Russell."） */
const SIGNATURE = /^I[’']m [A-Z][\w.’'-]*(?: [A-Z][\w.’'-]*){0,3}\.?$/;

export function parseArticle(html: string, url: string): VoaArticle {
  const $ = cheerio.load(html);
  const all = $("div.wsw > p")
    .map((_i, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  const sig = all.findIndex((p) => SIGNATURE.test(p));
  const paragraphs = sig === -1 ? all : all.slice(0, sig);
  const trailer = sig === -1 ? [] : all.slice(sig + 1);

  const audioUrl =
    $(".c-mmp__player audio[src$='.mp3']").first().attr("src") ??
    $("audio[src$='.mp3']").first().attr("src") ??
    null;
  const published = $("time[datetime]").first().attr("datetime") ?? "";
  const t = Date.parse(published);

  return {
    url,
    articleId: url.match(/(\d+)\.html$/)?.[1] ?? "",
    title: ($("meta[property='og:title']").attr("content") ?? $("h1").first().text()).trim(),
    description: ($("meta[property='og:description']").attr("content") ?? "").trim(),
    publishedAt: Number.isNaN(t) ? null : new Date(t).toISOString(),
    paragraphs,
    trailer,
    hasSignature: sig !== -1,
    audioUrl: audioUrl && audioUrl.startsWith("https://") ? audioUrl : null,
  };
}

/** 朗読される文に分ける。音声と合わせるので、ここで分けた文の数がそのまま切れ目の数になる */
export function articleSentences(article: VoaArticle): string[] {
  return splitSentences(article.paragraphs);
}

export interface VoaMaterialRow {
  id: string;
  title: string;
  level: "beginner" | "intermediate" | "advanced";
  description: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  license: "public-domain";
  attribution: string;
  /** R2 に置く音声のキー（media/ 以下） */
  audioKey: string;
  audioUrl: string;
  sentences: Array<{ text: string; startMs: number; endMs: number }>;
  status: "pending_review" | "rejected";
  reviewNotes: string[];
  /** 元の音声から切り出す範囲 */
  clip: { startMs: number; endMs: number };
}

/**
 * 記事を、パートごとの教材にする。文の時刻は切り出した音声の頭からの時間に直す。
 * 公開は必ず人のレビューを通す（pending_review）。
 */
export function buildVoaMaterials(
  article: VoaArticle,
  sentences: string[],
  timings: SentenceTiming[],
  parts: AudioPart[],
  { confidence, tags = [] as string[] }: { confidence: number; tags?: string[] },
): VoaMaterialRow[] {
  // パートごとに推定するとレベルがばらつくので、記事全体で1つにする
  const level = estimateLevel(sentences);
  const credits = detectThirdPartyCredits([article.title, ...article.paragraphs, ...article.trailer].join("\n"));
  return parts.map((part, i) => {
    const partSentences = sentences.slice(part.from, part.to);
    const verdict = evaluateCandidate({
      title: article.title,
      sentences: partSentences,
      sourceName: VOA_SOURCE_NAME,
      sourceUrl: article.url,
      license: "public-domain",
      attribution: VOA_ATTRIBUTION,
    });
    const notes = verdict.ok ? [...verdict.notes] : [...verdict.reasons];
    if (credits.length > 0 && !notes.some((n) => n.includes("クレジット"))) {
      notes.push(`記事末尾に通信社・第三者のクレジットがあります: ${credits.join(", ")}`);
    }
    if (confidence < 0.6) notes.push(`文と音声の時刻合わせの確かさが低めです（${confidence}）。再生して確かめてください`);

    const suffix = parts.length > 1 ? `-p${i + 1}` : "";
    const id = `voa-le-${article.articleId}${suffix}`;
    const audioKey = `voa/${article.articleId}${suffix}.mp3`;
    return {
      id,
      title: parts.length > 1 ? `${article.title} (${i + 1}/${parts.length})` : article.title,
      level,
      description: article.description.slice(0, 280),
      tags,
      sourceName: VOA_SOURCE_NAME,
      sourceUrl: article.url,
      license: "public-domain",
      attribution: VOA_ATTRIBUTION,
      audioKey,
      audioUrl: `/media/${audioKey}`,
      sentences: partSentences.map((text, j) => ({
        text,
        startMs: Math.max(0, timings[part.from + j].startMs - part.startMs),
        endMs: Math.max(0, timings[part.from + j].endMs - part.startMs),
      })),
      status: verdict.ok ? "pending_review" : "rejected",
      reviewNotes: notes,
      clip: { startMs: part.startMs, endMs: part.endMs },
    };
  });
}

/** SQL の文字列リテラル */
function sql(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

/** wrangler d1 execute --file に渡す INSERT 文（同じ id は取り込み済みとして無視する） */
export function materialInsertSql(row: VoaMaterialRow): string {
  return (
    "INSERT INTO materials (id, title, level, description, tags, source_name, source_url, license, " +
    "attribution, audio_url, sentences, status, review_notes) VALUES (" +
    [
      sql(row.id),
      sql(row.title),
      sql(row.level),
      sql(row.description),
      sql(JSON.stringify(row.tags)),
      sql(row.sourceName),
      sql(row.sourceUrl),
      sql(row.license),
      sql(row.attribution),
      sql(row.audioUrl),
      sql(JSON.stringify(row.sentences)),
      sql(row.status),
      sql(JSON.stringify(row.reviewNotes)),
    ].join(", ") +
    ") ON CONFLICT (id) DO NOTHING;"
  );
}
