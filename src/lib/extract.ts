/**
 * Webページから本文の段落を取り出す。
 * /api/extract（Web版）と /api/v1/me/texts（iOS版の取り込み）、教材の自動収集で共有する。
 */
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// SSRF protection: reject private / internal IP ranges
// ---------------------------------------------------------------------------
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
  /^::1$/,
  /^::$/,
  /^localhost$/i,
];

export function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((re) => re.test(hostname));
}

export type ExtractErrorKind = "invalid_url" | "forbidden" | "upstream";

export class ExtractError extends Error {
  readonly kind: ExtractErrorKind;
  constructor(kind: ExtractErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** 取り込んでよい URL かを検証して返す */
export function validateUrl(targetUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new ExtractError("invalid_url", "Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ExtractError("invalid_url", "Only http and https URLs are allowed");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new ExtractError("forbidden", "Access to private/internal addresses is not allowed");
  }
  return parsed;
}

export async function fetchText(url: string, timeoutMs = 15_000): Promise<{ text: string; contentType: string }> {
  validateUrl(url);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ShadowingApp/1.0; +https://example.com)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new ExtractError("upstream", `Failed to fetch URL: ${res.status} ${res.statusText}`);
  }
  return { text: await res.text(), contentType: res.headers.get("content-type") ?? "" };
}

/**
 * HTML から題名と段落を取り出す（純関数）。
 * contentSelector を渡すと、その要素だけを本文とみなす（配信元ごとに本文の器が分かっている場合）。
 */
export function extractFromHtml(
  html: string,
  { contentSelector }: { contentSelector?: string } = {},
): { title: string; paragraphs: string[] } {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $("script, style, nav, footer, header, aside, form, noscript").remove();

  const title = $("title").first().text().trim() || $("h1").first().text().trim() || "";

  // Extract paragraphs from content-bearing elements
  const selectors = contentSelector ?? "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th";
  const paragraphs: string[] = [];
  $(selectors).each((_i, el) => {
    const text = $(el).text().trim();
    if (text.length > 0) paragraphs.push(text);
  });

  // Fallback: if no paragraphs found, use body text split by newlines
  if (paragraphs.length === 0 && !contentSelector) {
    const bodyText = $("body").text().trim();
    if (bodyText) {
      paragraphs.push(
        ...bodyText
          .split(/\n+/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0),
      );
    }
  }

  return { title, paragraphs };
}

export async function extractArticle(
  url: string,
  opts: { contentSelector?: string } = {},
): Promise<{ title: string; paragraphs: string[] }> {
  const { text } = await fetchText(url);
  return extractFromHtml(text, opts);
}
