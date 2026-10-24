import { NextResponse } from "next/server";
import { extractArticle, ExtractError } from "@/lib/extract";

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

  try {
    return NextResponse.json(await extractArticle(targetUrl));
  } catch (err) {
    if (err instanceof ExtractError) {
      const status = { invalid_url: 400, forbidden: 403, upstream: 502 }[err.kind];
      return NextResponse.json({ error: err.message }, { status });
    }
    const message =
      err instanceof Error ? err.message : "Unknown error fetching URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
