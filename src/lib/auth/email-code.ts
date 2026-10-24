/**
 * メールのワンタイムコード（6桁・10分・5回まで）。
 *
 * コードは鍵付きハッシュ（AUTH_SECRET を混ぜた SHA-256）でだけ保存する。
 * DB が漏れても、鍵が無ければ 100万通りの総当たりで元のコードを割り出せない。
 */
import type { Store } from "../db/store.ts";
import { sha256Hex } from "./jwt.ts";

export const CODE_TTL_SEC = 10 * 60;
export const MAX_ATTEMPTS = 5;
/** 同じアドレスへの再送はこの間隔を空ける */
export const RESEND_INTERVAL_SEC = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/** 偏りのない6桁のコード */
export function generateCode(): string {
  const buf = new Uint32Array(1);
  // 2^32 を 10^6 で割った余りが偏らない範囲だけを使う
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

export async function hashCode(email: string, code: string, secret: string) {
  return sha256Hex(`${secret}:${email}:${code}`);
}

export type IssueResult = { status: "issued"; code: string } | { status: "too_soon"; retryAfterSec: number };

export async function issueCode(
  store: Store,
  email: string,
  secret: string,
  { now = new Date(), code = generateCode() } = {},
): Promise<IssueResult> {
  const existing = await store.getEmailCode(email);
  if (existing) {
    const elapsed = (now.getTime() - Date.parse(existing.createdAt)) / 1000;
    if (elapsed < RESEND_INTERVAL_SEC) {
      return { status: "too_soon", retryAfterSec: Math.ceil(RESEND_INTERVAL_SEC - elapsed) };
    }
  }
  await store.putEmailCode(email, await hashCode(email, code, secret), CODE_TTL_SEC);
  return { status: "issued", code };
}

export type VerifyResult = "ok" | "invalid" | "expired" | "too_many_attempts";

export async function verifyCode(
  store: Store,
  email: string,
  code: string,
  secret: string,
  now = new Date(),
): Promise<VerifyResult> {
  const row = await store.getEmailCode(email);
  if (!row) return "invalid";
  if (row.expiresAt <= now.toISOString()) {
    await store.deleteEmailCode(email);
    return "expired";
  }
  if (row.attempts >= MAX_ATTEMPTS) return "too_many_attempts";
  if ((await hashCode(email, code.trim(), secret)) !== row.codeHash) {
    await store.incrementEmailCodeAttempts(email);
    return row.attempts + 1 >= MAX_ATTEMPTS ? "too_many_attempts" : "invalid";
  }
  await store.deleteEmailCode(email);
  return "ok";
}
