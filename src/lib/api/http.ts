/**
 * /api/v1 の共通レスポンス。
 *
 * iOSクライアントがエラーを機械的に扱えるよう、失敗はすべて
 * `{ error: { code, message } }` の形で返す（docs/openapi.yaml の Error）。
 */
import { NextResponse } from "next/server";

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "rate_limited"
  | "not_configured"
  | "upstream_error"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  not_configured: 501,
  upstream_error: 502,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function ok<T>(body: T, init?: { status?: number; maxAge?: number }) {
  const headers: Record<string, string> = {};
  if (init?.maxAge) headers["Cache-Control"] = `public, max-age=${init.maxAge}`;
  return NextResponse.json(body, { status: init?.status ?? 200, headers });
}

export function fail(code: ErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] });
}

/** ハンドラ本体を包み、ApiError を所定の形に、それ以外を 500 にする */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message);
    console.error("[api/v1]", err);
    return fail("internal", "サーバーでエラーが発生しました");
  }
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    if (body === null || typeof body !== "object") throw new Error();
    return body as T;
  } catch {
    throw new ApiError("bad_request", "JSONのオブジェクトを送ってください");
  }
}

export function parseLimit(raw: string | null, { fallback = 20, max = 50 } = {}): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new ApiError("bad_request", "limit は1以上の整数です");
  return Math.min(n, max);
}
