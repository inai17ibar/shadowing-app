/**
 * Sign in with Apple。
 *
 * iOSアプリは AuthenticationServices で得た identityToken（と authorizationCode）を送ってくる。
 * サーバーは Apple の公開鍵で identityToken を検証し、sub を利用者IDとして使う。
 *
 * authorizationCode を Apple のトークンと交換して refresh_token を保持しておくのは、
 * 退会時に Apple 側の連携を失効（/auth/revoke）させるため。Apple はアカウント削除時に
 * これを行うよう求めている。キー（APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY）が
 * 未設定なら交換・失効はせず、サインインだけを行う。
 */
import { decodeJwt, sha256Hex, signEs256, verifyRs256 } from "./jwt.ts";

const APPLE_ISSUER = "https://appleid.apple.com";
const JWKS_URL = "https://appleid.apple.com/auth/keys";

export interface AppleConfig {
  /** iOSアプリの Bundle ID（identity token の aud） */
  clientId: string;
  teamId?: string;
  keyId?: string;
  /** .p8 の中身（PEM） */
  privateKey?: string;
}

export type JwksFetcher = () => Promise<{ keys: Array<JsonWebKey & { kid?: string }> }>;

export const fetchAppleJwks: JwksFetcher = async () => {
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Apple JWKS: ${res.status}`);
  return res.json();
};

export class AppleTokenError extends Error {}

/**
 * identity token を検証して sub を返す。
 * nonce を渡した場合、トークンの nonce（iOS側で SHA-256 したもの）と一致するかも確かめる
 * （盗まれたトークンの使い回し対策）。
 */
export async function verifyAppleIdentityToken(
  token: string,
  opts: { clientId: string; nonce?: string; fetchJwks?: JwksFetcher; nowSec?: number },
): Promise<{ sub: string; email: string | null }> {
  const jwt = decodeJwt(token);
  if (!jwt || jwt.header.alg !== "RS256" || !jwt.header.kid) {
    throw new AppleTokenError("identity token の形式が不正です");
  }
  const { keys } = await (opts.fetchJwks ?? fetchAppleJwks)();
  const jwk = keys.find((k) => k.kid === jwt.header.kid);
  if (!jwk || !(await verifyRs256(jwt, jwk))) {
    throw new AppleTokenError("identity token の署名を検証できません");
  }

  const p = jwt.payload;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (p.iss !== APPLE_ISSUER) throw new AppleTokenError("発行者が Apple ではありません");
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.includes(opts.clientId)) throw new AppleTokenError("このアプリ向けのトークンではありません");
  if (typeof p.exp !== "number" || p.exp <= now) throw new AppleTokenError("identity token の期限切れです");
  if (typeof p.sub !== "string" || !p.sub) throw new AppleTokenError("sub がありません");
  if (opts.nonce !== undefined && p.nonce !== (await sha256Hex(opts.nonce))) {
    throw new AppleTokenError("nonce が一致しません");
  }
  return { sub: p.sub, email: typeof p.email === "string" ? p.email : null };
}

function canCallAppleApi(c: AppleConfig): c is Required<AppleConfig> {
  return !!(c.teamId && c.keyId && c.privateKey);
}

/** Apple の REST API 用の client_secret（ES256 の JWT、最長6か月） */
export async function makeClientSecret(c: Required<AppleConfig>, nowSec = Math.floor(Date.now() / 1000)) {
  return signEs256(
    { kid: c.keyId },
    { iss: c.teamId, iat: nowSec, exp: nowSec + 300, aud: APPLE_ISSUER, sub: c.clientId },
    c.privateKey,
  );
}

/** authorizationCode を refresh_token に交換する。キー未設定・失敗時は null（サインイン自体は続ける） */
export async function exchangeAuthorizationCode(c: AppleConfig, code: string): Promise<string | null> {
  if (!canCallAppleApi(c)) return null;
  const res = await fetch(`${APPLE_ISSUER}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: await makeClientSecret(c),
      code,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("[apple] token exchange failed", res.status, await res.text());
    return null;
  }
  const body = (await res.json()) as { refresh_token?: string };
  return body.refresh_token ?? null;
}

/** 退会時に Apple 側の連携を失効させる */
export async function revokeAppleToken(c: AppleConfig, refreshToken: string): Promise<boolean> {
  if (!canCallAppleApi(c)) return false;
  const res = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: await makeClientSecret(c),
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) console.error("[apple] revoke failed", res.status, await res.text());
  return res.ok;
}
