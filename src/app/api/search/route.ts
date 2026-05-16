import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// GET /api/search?q=...
// Proxy to YouTube Data API v3 search endpoint.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube APIキーが設定されていません" },
      { status: 501 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json(
      { error: "q parameter is required" },
      { status: 400 },
    );
  }

  try {
    const ytUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    ytUrl.searchParams.set("part", "snippet");
    ytUrl.searchParams.set("type", "video");
    ytUrl.searchParams.set("maxResults", "10");
    ytUrl.searchParams.set("q", query);
    ytUrl.searchParams.set("key", apiKey);

    const res = await fetch(ytUrl.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `YouTube API error: ${res.status}`, detail: text },
        { status: 502 },
      );
    }

    const data = await res.json();

    interface YouTubeSearchItem {
      id: { videoId: string };
      snippet: {
        title: string;
        thumbnails: {
          medium?: { url: string };
          default?: { url: string };
        };
      };
    }

    const results = (data.items ?? []).map((item: YouTubeSearchItem) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail:
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default?.url ??
        "",
    }));

    return NextResponse.json({ results });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
