/**
 * 自前のセッション。
 *
 *   アクセストークン   HS256 の JWT（1時間）。毎リクエストの Authorization: Bearer
 *   リフレッシュトークン ランダム値（90日）。DBには SHA-256 だけを保存し、使うたびに新しいものと交換する
 */
import type { Store } from "../db/store.ts";
import { randomToken, sha256Hex, signHs256, verifyHs256 } from "./jwt.ts";

export const ACCESS_TOKEN_TTL_SEC = 60 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 90;
const AUDIENCE = "shadowing-app";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** アクセストークンの有効秒数 */
  expiresIn: number;
  user: { id: string; isAnonymous: boolean };
}

export async function issueTokens(
  store: Store,
  secret: string,
  user: { id: string; isAnonymous: boolean },
  now = new Date(),
): Promise<TokenPair> {
  const nowSec = Math.floor(now.getTime() / 1000);
  const accessToken = await signHs256(
    { sub: user.id, aud: AUDIENCE, iat: nowSec, exp: nowSec + ACCESS_TOKEN_TTL_SEC, anon: user.isAnonymous },
    secret,
  );
  const refreshToken = randomToken();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 86_400_000).toISOString();
  await store.createSession(user.id, await sha256Hex(refreshToken), expiresAt);
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SEC, user };
}

/** アクセストークンを検証して userId を返す。無効なら null */
export async function verifyAccessToken(token: string, secret: string, nowSec?: number) {
  const payload = await verifyHs256(token, secret, nowSec);
  if (!payload || payload.aud !== AUDIENCE || typeof payload.sub !== "string") return null;
  return { userId: payload.sub };
}

/** リフレッシュトークンを新しいペアと交換する。無効・使用済みなら null */
export async function rotateRefreshToken(store: Store, secret: string, refreshToken: string, now = new Date()) {
  const userId = await store.consumeSession(await sha256Hex(refreshToken));
  if (!userId) return null;
  const user = await store.getUser(userId);
  if (!user) return null;
  return issueTokens(store, secret, user, now);
}

export async function revokeRefreshToken(store: Store, refreshToken: string) {
  await store.deleteSession(await sha256Hex(refreshToken));
}
