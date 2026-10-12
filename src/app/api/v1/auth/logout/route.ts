import { handle, readJson } from "@/lib/api/http";
import { getStore } from "@/lib/api/env";
import { revokeRefreshToken } from "@/lib/auth/sessions";
import { REFRESH_COOKIE, assertSameOrigin, clearSessionCookies, readCookie } from "@/lib/api/web-session";

/**
 * POST /api/v1/auth/logout — { refreshToken } を無効にする。アクセストークンは期限（1時間）まで残る。
 * Web版は Cookie のリフレッシュトークンを無効にし、Cookie を消す。
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    let refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    const fromCookie = !refreshToken && readCookie(request, REFRESH_COOKIE);
    if (fromCookie) {
      assertSameOrigin(request);
      refreshToken = fromCookie;
    }
    if (refreshToken) await revokeRefreshToken(getStore(), refreshToken);
    return clearSessionCookies(new Response(null, { status: 204 }), request);
  });
}
