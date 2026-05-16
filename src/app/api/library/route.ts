import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Hardcoded fallback when the VOA feed is unavailable
// ---------------------------------------------------------------------------
const VOA_FALLBACK = {
  note: "VOA feed is currently unavailable. Showing sample data.",
  items: [
    {
      title: "Learning English with VOA - Sample Lesson 1",
      url: "https://learningenglish.voanews.com/",
      description:
        "This is a sample entry shown when the VOA feed cannot be reached.",
      date: "",
    },
    {
      title: "Learning English with VOA - Sample Lesson 2",
      url: "https://learningenglish.voanews.com/",
      description:
        "This is a sample entry shown when the VOA feed cannot be reached.",
      date: "",
    },
  ],
};

// ---------------------------------------------------------------------------
// GET /api/library?source=voa
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");

  if (source !== "voa") {
    return NextResponse.json(
      { error: "Unsupported source. Currently only 'voa' is supported." },
      { status: 400 },
    );
  }

  try {
    const feedUrl = "https://learningenglish.voanews.com/api/";
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ShadowingApp/1.0; +https://example.com)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(VOA_FALLBACK);
    }

    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();

    // Try JSON first
    if (contentType.includes("json")) {
      try {
        const json = JSON.parse(text);
        const rawItems: Array<{
          title?: string;
          url?: string;
          description?: string;
          pubDate?: string;
          date?: string;
        }> = Array.isArray(json) ? json : json.items ?? json.data ?? [];

        const items = rawItems.slice(0, 20).map((entry) => ({
          title: entry.title ?? "",
          url: entry.url ?? "",
          description: entry.description ?? "",
          date: entry.pubDate ?? entry.date ?? "",
        }));

        return NextResponse.json({ items });
      } catch {
        // Fall through to XML/HTML parsing
      }
    }

    // Try RSS / XML
    if (
      contentType.includes("xml") ||
      contentType.includes("rss") ||
      text.trimStart().startsWith("<?xml") ||
      text.trimStart().startsWith("<rss")
    ) {
      const $ = cheerio.load(text, { xml: true });
      const items: { title: string; url: string; description: string; date: string }[] = [];

      $("item").each((_i, el) => {
        items.push({
          title: $(el).find("title").first().text().trim(),
          url:
            $(el).find("link").first().text().trim() ||
            $(el).find("guid").first().text().trim(),
          description: $(el).find("description").first().text().trim(),
          date: $(el).find("pubDate").first().text().trim(),
        });
      });

      if (items.length > 0) {
        return NextResponse.json({ items: items.slice(0, 20) });
      }
    }

    // Try parsing as HTML for article links
    {
      const $ = cheerio.load(text);
      const items: { title: string; url: string; description: string; date: string }[] = [];

      $("a[href*='/a/']").each((_i, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr("href") ?? "";
        if (title && href) {
          const fullUrl = href.startsWith("http")
            ? href
            : `https://learningenglish.voanews.com${href}`;
          items.push({ title, url: fullUrl, description: "", date: "" });
        }
      });

      if (items.length > 0) {
        // Deduplicate by URL
        const seen = new Set<string>();
        const unique = items.filter((item) => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        });
        return NextResponse.json({ items: unique.slice(0, 20) });
      }
    }

    // Nothing usable parsed
    return NextResponse.json(VOA_FALLBACK);
  } catch {
    return NextResponse.json(VOA_FALLBACK);
  }
}
