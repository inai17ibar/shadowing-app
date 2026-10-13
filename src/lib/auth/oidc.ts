/**
 * OpenID Connect の ID トークン検証（Sign in with Apple / Google 共通）。
 * 署名を提供元の公開鍵(JWKS)で確かめ、発行者・宛先アプリ・期限・nonce を検証する。
 */
import { decodeJwt, verifyRs256 } from "./jwt.ts";

export type Jwks = { keys: Array<JsonWebKey & { kid?: string }> };
export type JwksFetcher = () => Promise<Jwks>;

export class IdTokenError extends Error {}

/** JWKS を isolate 内で1時間キャッシュする。未知の kid が来たら取り直す（鍵のローテーション対策） */
export function cachedJwks(url: string, ttlMs = 3_600_000): JwksFetcher & { refresh: JwksFetcher } {
  let cache: { at: number; jwks: Jwks } | null = null;
  const refresh = async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`JWKS ${url}: ${res.status}`);
    cache = { at: Date.now(), jwks: (await res.json()) as Jwks };
    return cache.jwks;
  };
  const get = async () => (cache && Date.now() - cache.at < ttlMs ? cache.jwks : refresh());
  return Object.assign(get, { refresh });
}

export interface VerifyIdTokenOptions {
  issuers: string[];
  /** 受け付ける aud（自分のアプリのクライアントID） */
  audiences: string[];
  fetchJwks: JwksFetcher & { refresh?: JwksFetcher };
  /** トークンの nonce と比較する値（提供元ごとに生の値かハッシュかが違うので、呼び出し側で揃える） */
  expectedNonce?: string;
  nowSec?: number;
}

export async function verifyIdToken(token: string, opts: VerifyIdTokenOptions): Promise<Record<string, unknown>> {
  const jwt = decodeJwt(token);
  if (!jwt || jwt.header.alg !== "RS256" || !jwt.header.kid) {
    throw new IdTokenError("ID トークンの形式が不正です");
  }
  let jwk = (await opts.fetchJwks()).keys.find((k) => k.kid === jwt.header.kid);
  if (!jwk && opts.fetchJwks.refresh) {
    jwk = (await opts.fetchJwks.refresh()).keys.find((k) => k.kid === jwt.header.kid);
  }
  if (!jwk || !(await verifyRs256(jwt, jwk))) throw new IdTokenError("ID トークンの署名を検証できません");

  const p = jwt.payload;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (!opts.issuers.includes(String(p.iss))) throw new IdTokenError("発行者が正しくありません");
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.some((a) => opts.audiences.includes(String(a)))) {
    throw new IdTokenError("このアプリ向けのトークンではありません");
  }
  // 端末の時計のずれを60秒まで許す
  if (typeof p.exp !== "number" || p.exp + 60 <= now) throw new IdTokenError("ID トークンの期限切れです");
  if (typeof p.sub !== "string" || !p.sub) throw new IdTokenError("sub がありません");
  if (opts.expectedNonce !== undefined && p.nonce !== opts.expectedNonce) {
    throw new IdTokenError("nonce が一致しません");
  }
  return p;
}
