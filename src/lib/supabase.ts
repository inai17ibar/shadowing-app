import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function supabaseEnabled(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Lazy-initialise the client so the module can be imported even when the
// env vars are not set (local dev without Supabase).
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase env vars are not set. Check supabaseEnabled() before calling getSupabase().",
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

/** @deprecated Use getSupabase() inside a supabaseEnabled() guard instead. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase(), prop, receiver);
  },
});
