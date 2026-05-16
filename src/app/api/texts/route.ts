import { NextResponse } from "next/server";
import { supabase, supabaseEnabled } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// In-memory fallback for local dev (when Supabase is not configured)
// We stash the store on globalThis so every route in this process shares it.
// ---------------------------------------------------------------------------
interface SavedText {
  id: number;
  title: string;
  source_url: string;
  paragraphs: string[];
  created_at: string;
}

const g = globalThis as unknown as {
  __memoryStore?: SavedText[];
  __memoryNextId?: number;
};
if (!g.__memoryStore) {
  g.__memoryStore = [];
}
if (!g.__memoryNextId) {
  g.__memoryNextId = 1;
}
const memoryStore = g.__memoryStore;

// ---------------------------------------------------------------------------
// GET /api/texts  –  list saved texts
// ---------------------------------------------------------------------------
export async function GET() {
  if (supabaseEnabled()) {
    const { data, error } = await supabase
      .from("saved_texts")
      .select("id, title, source_url, created_at")
      .order("id", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  // In-memory fallback
  const list = memoryStore
    .map(({ id, title, source_url, created_at }) => ({
      id,
      title,
      source_url,
      created_at,
    }))
    .sort((a, b) => b.id - a.id);

  return NextResponse.json(list);
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

  if (supabaseEnabled()) {
    const { data, error } = await supabase
      .from("saved_texts")
      .insert({ title, source_url, paragraphs })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ id: data.id }, { status: 201 });
  }

  // In-memory fallback
  const id = g.__memoryNextId!++;

  memoryStore.push({
    id,
    title,
    source_url,
    paragraphs,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ id }, { status: 201 });
}
