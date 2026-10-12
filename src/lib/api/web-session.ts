/**
 * Web版のセッション（Cookie）。
 *
 * iOS はトークンを Keychain に入れて `Authorization: Bearer` で送る。Web は JavaScript から
 * トークンを読めないよう、httpOnly の Cookie に入れる（XSS でトークンを盗まれない）。
 *
 * - 認証系のエンドポイントに `X-Client: web` を付けて呼ぶと、トークンを本文ではなく Cookie で返す
 * - アクセストークン（1時間）は /api/v1 全体に、リフレッシュトークン（90日）は /api/v1/auth にだけ送られる
 * - SameSite=Strict に加え、Cookie で認証した書き込み系のリクエストは Origin が同じか確かめる（CSRF 対策）
 */
import { NextResponse } from "next/server";
import { ApiError } from "./http";
import type { TokenPair } from "@/lib/auth/sessions";

export const ACCESS_COOKIE = "sa_access";
export const REFRESH_COOKIE = "sa_refresh";
const REFRESH_MAX_AGE_SEC = 90 * 86_400;

export function isWebClient(request: Request): boolean {
  return request.headers.get("x-client") === "web";
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function cookie(request: Request, name: string, value: string, path: string, maxAge: number) {
  // ローカル開発（http://localhost）でも動くよう、https のときだけ Secure を付ける
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}

function setSessionCookies(res: NextResponse, request: Request, tokens: TokenPair) {
  res.headers.append("Set-Cookie", cookie(request, ACCESS_COOKIE, tokens.accessToken, "/api/v1", tokens.expiresIn));
  res.headers.append("Set-Cookie", cookie(request, REFRESH_COOKIE, tokens.refreshToken, "/api/v1/auth", REFRESH_MAX_AGE_SEC));
}

export function clearSessionCookies(res: Response, request: Request) {
  res.headers.append("Set-Cookie", cookie(request, ACCESS_COOKIE, "", "/api/v1", 0));
  res.headers.append("Set-Cookie", cookie(request, REFRESH_COOKIE, "", "/api/v1/auth", 0));
  return res;
}

/**
 * 発行したトークンを返す。Web には Cookie で渡し、本文にはトークンを入れない。
 */
export function respondTokens(
  request: Request,
  tokens: TokenPair,
  extra: Record<string, unknown> = {},
  status = 200,
) {
  if (!isWebClient(request)) return NextResponse.json({ ...tokens, ...extra }, { status });
  const res = NextResponse.json({ expiresIn: tokens.expiresIn, user: tokens.user, ...extra }, { status });
  setSessionCookies(res, request, tokens);
  return res;
}

/**
 * Cookie で認証した書き込み系のリクエストが、同じオリジンのページから来たか確かめる。
 * SameSite=Strict で他サイトからは Cookie が送られないが、古いブラウザ等への二重の備え。
 */
export function assertSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === new URL(request.url).origin) return;
  } else if (request.headers.get("sec-fetch-site") === "same-origin") {
    return;
  }
  throw new ApiError("forbidden", "別のサイトからのリクエストは受け付けません");
}
