import { ApiError, handle, readJson } from "@/lib/api/http";
import { authSecret, getStore } from "@/lib/api/env";
import { rateLimitAuth } from "@/lib/api/auth";
import { rotateRefreshToken } from "@/lib/auth/sessions";
import { REFRESH_COOKIE, assertSameOrigin, readCookie, respondTokens } from "@/lib/api/web-session";

/**
 * POST /api/v1/auth/refresh — { refreshToken } を新しいトークンのペアと交換する（古いものは無効になる）。
 * Web版は本文を空にして呼べば、Cookie のリフレッシュトークンを使う。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    let refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    if (!refreshToken) {
      refreshToken = readCookie(request, REFRESH_COOKIE) ?? "";
      if (refreshToken) assertSameOrigin(request);
    }
    if (!refreshToken) throw new ApiError("bad_request", "refreshToken が必要です");
    const tokens = await rotateRefreshToken(getStore(), authSecret(), refreshToken);
    if (!tokens) throw new ApiError("unauthorized", "リフレッシュトークンが無効です。サインインし直してください");
    return respondTokens(request, tokens);
  });
}
