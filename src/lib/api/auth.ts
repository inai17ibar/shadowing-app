/**
 * /api/v1 の認証。
 *
 * iOSアプリは /api/v1/auth/* でアクセストークンを得て `Authorization: Bearer <token>` で送る
 * （匿名サインイン → 必要になったら Sign in with Apple で本登録）。
 * Web版は同じトークンを httpOnly の Cookie で送る（src/lib/api/web-session.ts）。
 * トークンは自前の HS256 JWT（src/lib/auth/sessions.ts）。
 */
import { ApiError } from "./http";
import { authSecret, getEnv, getStore } from "./env";
import { verifyAccessToken } from "@/lib/auth/sessions";
import type { User } from "@/lib/db/store";
import { ACCESS_COOKIE, assertSameOrigin, readCookie } from "./web-session";

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/**
 * アクセストークンを検証し、利用者を返す。
 * トークン自体は1時間有効だが、退会済みの利用者は弾くため毎回 users を引く。
 */
export async function requireUser(request: Request): Promise<User> {
  let token = bearer(request);
  if (!token) {
    token = readCookie(request, ACCESS_COOKIE);
    if (!token) throw new ApiError("unauthorized", "サインインしていません");
    assertSameOrigin(request);
  }
  const verified = await verifyAccessToken(token, authSecret());
  if (!verified) throw new ApiError("unauthorized", "トークンが無効か期限切れです");
  const user = await getStore().getUser(verified.userId);
  if (!user) throw new ApiError("unauthorized", "アカウントが存在しません");
  return user;
}

/** Authorization があれば利用者を返し、無ければ null（無効なトークンはエラー） */
export async function optionalUser(request: Request): Promise<User | null> {
  return bearer(request) || readCookie(request, ACCESS_COOKIE) ? requireUser(request) : null;
}

/** 定期実行（Cloudflare Cron Trigger）からの呼び出しを確認する */
export function requireCron(request: Request): void {
  const secret = getEnv().CRON_SECRET;
  if (!secret) throw new ApiError("not_configured", "CRON_SECRET が設定されていません");
  if (bearer(request) !== secret) throw new ApiError("unauthorized", "CRON_SECRET が一致しません");
}

/** 認証エンドポイントの連打（匿名アカウントの大量作成など）を IP 単位で抑える */
export async function rateLimitAuth(request: Request): Promise<void> {
  const limiter = getEnv().AUTH_RATE_LIMITER;
  if (!limiter) return;
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await limiter.limit({ key });
  if (!success) throw new ApiError("rate_limited", "リクエストが多すぎます。しばらくしてからお試しください");
}
