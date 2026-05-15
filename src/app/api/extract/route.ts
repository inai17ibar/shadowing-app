import { NextResponse } from "next/server";
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

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((re) => re.test(hostname));
}

// ---------------------------------------------------------------------------
// GET /api/extract?url=...
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { error: "url parameter is required" },
      { status: 400 },
    );
  }

  // Validate URL scheme
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json(
      { error: "Only http and https URLs are allowed" },
      { status: 400 },
    );
  }

  // SSRF: reject private/internal hosts
  if (isPrivateHost(parsed.hostname)) {
    return NextResponse.json(
      { error: "Access to private/internal addresses is not allowed" },
      { status: 403 },
    );
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ShadowingApp/1.0; +https://example.com)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${res.status} ${res.statusText}` },
        { status: 502 },
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove non-content elements
    $(
      "script, style, nav, footer, header, aside, form, noscript",
    ).remove();

    // Extract title
    const title = $("title").first().text().trim() || $("h1").first().text().trim() || "";

    // Extract paragraphs from content-bearing elements
    const selectors = "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th";
    const paragraphs: string[] = [];

    $(selectors).each((_i, el) => {
      const text = $(el).text().trim();
      if (text.length > 0) {
        paragraphs.push(text);
      }
    });

    // Fallback: if no paragraphs found, use body text split by newlines
    if (paragraphs.length === 0) {
      const bodyText = $("body").text().trim();
      if (bodyText) {
        const lines = bodyText
          .split(/\n+/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        paragraphs.push(...lines);
      }
    }

    return NextResponse.json({ title, paragraphs });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error fetching URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
