import { NextResponse } from "next/server";
import { getStore } from "@/lib/api/env";

// ---------------------------------------------------------------------------
// GET /api/texts  –  list saved texts
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    return NextResponse.json(await getStore().listSavedTexts());
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/texts  –  save a new text
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  let body: { title?: string; source_url?: string; paragraphs?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { title = "", source_url = "", paragraphs } = body;

  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return NextResponse.json(
      { error: "paragraphs must be a non-empty array" },
      { status: 400 },
    );
  }

  try {
    const id = await getStore().insertSavedText({ title, source_url, paragraphs });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}
