/**
 * Google ログイン。
 * iOS の Google Sign-In SDK が返す ID トークンを、Google の公開鍵で検証する。
 */
import { cachedJwks, verifyIdToken, type JwksFetcher } from "./oidc.ts";

const googleJwks = cachedJwks("https://www.googleapis.com/oauth2/v3/certs");

export async function verifyGoogleIdToken(
  token: string,
  opts: {
    /** iOS・Web など、受け付ける OAuth クライアントID */
    clientIds: string[];
    nonce?: string;
    fetchJwks?: JwksFetcher;
    nowSec?: number;
  },
): Promise<{ sub: string; email: string | null }> {
  const p = await verifyIdToken(token, {
    issuers: ["https://accounts.google.com", "accounts.google.com"],
    audiences: opts.clientIds,
    fetchJwks: opts.fetchJwks ?? googleJwks,
    // Google は nonce を生のまま入れる
    expectedNonce: opts.nonce,
    nowSec: opts.nowSec,
  });
  // 確認済みのメールアドレスだけを記録する（アカウントの結び付けには使わない）
  const email = typeof p.email === "string" && p.email_verified === true ? p.email : null;
  return { sub: String(p.sub), email };
}
