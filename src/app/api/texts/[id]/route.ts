import { NextResponse } from "next/server";
import { supabase, supabaseEnabled } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Shared in-memory store (imported indirectly via the module-level array in
// the parent route).  We re-declare a reference here so the fallback works
// within the same process.  In production Supabase is the source of truth.
// ---------------------------------------------------------------------------
interface SavedText {
  id: number;
  title: string;
  source_url: string;
  paragraphs: string[];
  created_at: string;
}

// We need the *same* array instance used by ../route.ts.  Because Next.js
// bundles each route independently we cannot simply import it.  Instead we
// stash the store on `globalThis` so every route in this process shares it.
const g = globalThis as unknown as { __memoryStore?: SavedText[] };
if (!g.__memoryStore) {
  g.__memoryStore = [];
}
const memoryStore = g.__memoryStore;

// ---------------------------------------------------------------------------
// GET /api/texts/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = Number(rawId);

  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (supabaseEnabled()) {
    const { data, error } = await supabase
      .from("saved_texts")
      .select("title, source_url, paragraphs, created_at")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  // In-memory fallback
  const item = memoryStore.find((t) => t.id === id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { title, source_url, paragraphs, created_at } = item;
  return NextResponse.json({ title, source_url, paragraphs, created_at });
}

// ---------------------------------------------------------------------------
// DELETE /api/texts/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = Number(rawId);

  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (supabaseEnabled()) {
    const { error, count } = await supabase
      .from("saved_texts")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  // In-memory fallback
  const idx = memoryStore.findIndex((t) => t.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  memoryStore.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
