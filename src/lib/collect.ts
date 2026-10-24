/**
 * 教材の動的収集（定期実行）。
 *
 * ライセンスが明確な配信元だけを SOURCES に登録し、新着記事を教材の「候補」として取り込む。
 * 自社オリジナル以外は必ず pending_review で保存し、人が出典・内容を確認してから公開する
 * （docs/content-collection.md の「動的収集」）。
 */
import * as cheerio from "cheerio";
import {
  evaluateCandidate,
  splitSentences,
  estimateLevel,
  type License,
} from "./content-policy.ts";

export interface FeedSource {
  id: string;
  name: string;
  feedUrl: string;
  license: License;
  attribution?: string;
  /** 記事URLがこのドメイン配下であることを確認する（フィードに外部リンクが混ざるため） */
  allowedHost: string;
  /** さらにパスも絞る。同じドメインでも権利の扱いが違う記事が混ざる配信元向け */
  allowedPathPrefix?: string;
  /** 本文の段落を指すセレクタ。無ければ汎用の抽出（ナビゲーション等が混ざりやすい） */
  contentSelector?: string;
  /** 定期収集の対象か。false はアーカイブからの一括取り込み（バックフィル）専用 */
  active: boolean;
  tags: string[];
}

/**
 * 登録済みの配信元。追加するときは、配信元の利用規約とライセンスを確認し
 * docs/content-collection.md の表にも記録すること。
 */
export const SOURCES: FeedSource[] = [
  {
    id: "nasa-news",
    name: "NASA News Releases",
    // 米国政府の著作物（17 U.S.C. §105）。NASAのメディア利用ガイドラインに従い、
    // ロゴ・人物写真は使わず本文だけを使う
    feedUrl: "https://www.nasa.gov/news-release/feed/",
    license: "public-domain",
    allowedHost: "www.nasa.gov",
    // 同じフィードに APOD（science.nasa.gov）が混ざる。APOD は画像・文の権利が個別なので除外
    allowedPathPrefix: "/news-release/",
    contentSelector: ".entry-content > p",
    active: true,
    tags: ["science", "news"],
  },
  {
    id: "voa-le",
    name: "VOA Learning English",
    // 米国政府の著作物。ただし通信社配信の記事・写真は除く。
    // フィードは 2025年3月を最後に更新されていない（2026-10-12 確認）ため、
    // 定期収集ではなくアーカイブのバックフィルにだけ使う
    feedUrl: process.env.VOA_LE_FEED_URL ?? "https://learningenglish.voanews.com/api/",
    license: "public-domain",
    allowedHost: "learningenglish.voanews.com",
    allowedPathPrefix: "/a/",
    active: false,
    tags: ["news"],
  },
];

export interface FeedItem {
  title: string;
  url: string;
  description: string;
  publishedAt: string | null;
}

/** RSS 2.0 / Atom を読む（純関数） */
export function parseFeed(xml: string): FeedItem[] {
  const $ = cheerio.load(xml, { xml: true });
  const items: FeedItem[] = [];

  $("item").each((_i, el) => {
    const $el = $(el);
    items.push({
      title: $el.find("title").first().text().trim(),
      url: ($el.find("link").first().text() || $el.find("guid").first().text()).trim(),
      description: $el.find("description").first().text().trim(),
      publishedAt: toIso($el.find("pubDate").first().text().trim()),
    });
  });

  $("entry").each((_i, el) => {
    const $el = $(el);
    items.push({
      title: $el.find("title").first().text().trim(),
      url: ($el.find("link").first().attr("href") ?? "").trim(),
      description: $el.find("summary").first().text().trim(),
      publishedAt: toIso($el.find("updated, published").first().text().trim()),
    });
  });

  return items.filter((i) => i.title && i.url);
}

function toIso(s: string): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** URL から安定した教材IDを作る（同じ記事を二重に取り込まないため） */
export function materialIdFor(sourceId: string, url: string): string {
  const slug = new URL(url).pathname
    .replace(/\.html?$/, "")
    .split("/")
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(-60);
  return `${sourceId}-${slug}`;
}

/** 記事本文のうち、教材に向かない行（キャプション・SNS誘導・語彙リスト見出しなど）を落とす */
export function cleanArticleParagraphs(paragraphs: string[]): string[] {
  const NOISE = [
    /^(share|follow us|subscribe|related|see comments|print)\b/i,
    /^(words in this story|quiz|_+)$/i,
    /^\s*(photo|image|file photo)\s*[:-]/i,
    /^(i'm|i am) [A-Z][a-z]+ [A-Z][a-z]+\.?$/, // VOA の署名「I'm Jane Doe.」
    /[\w.+-]+@[\w-]+\.[\w.]+/, // 広報担当の連絡先
    /\b\d{3}[-.]\d{3}[-.]\d{4}\b/,
    /:\s*$/, // 「詳しくはこちら:」のようなリンク誘導
  ];
  const seen = new Set<string>();
  return paragraphs
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => {
      if (p.split(" ").length < 4) return false;
      if (NOISE.some((re) => re.test(p))) return false;
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });
}

export interface CandidateDraft {
  id: string;
  title: string;
  level: "beginner" | "intermediate" | "advanced";
  description: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  license: License;
  attribution: string | null;
  sentences: Array<{ text: string }>;
  status: "pending_review" | "published" | "rejected";
  reviewNotes: string[];
}

/** 取得した記事を、ポリシー判定つきの教材候補にする（純関数） */
export function toCandidate(
  source: FeedSource,
  item: FeedItem,
  paragraphs: string[],
  { maxSentences = 40 } = {},
): CandidateDraft | null {
  const url = new URL(item.url);
  if (url.hostname !== source.allowedHost) return null;
  if (source.allowedPathPrefix && !url.pathname.startsWith(source.allowedPathPrefix)) return null;

  const sentences = splitSentences(cleanArticleParagraphs(paragraphs)).slice(0, maxSentences);
  const verdict = evaluateCandidate({
    title: item.title,
    sentences,
    sourceName: source.name,
    sourceUrl: item.url,
    license: source.license,
    attribution: source.attribution,
  });

  return {
    id: materialIdFor(source.id, item.url),
    title: item.title,
    level: estimateLevel(sentences),
    description: item.description.slice(0, 280),
    tags: source.tags,
    sourceName: source.name,
    sourceUrl: item.url,
    license: source.license,
    attribution: source.attribution ?? null,
    sentences: sentences.map((text) => ({ text })),
    status: !verdict.ok ? "rejected" : verdict.needsReview ? "pending_review" : "published",
    reviewNotes: verdict.ok ? verdict.notes : verdict.reasons,
  };
}
