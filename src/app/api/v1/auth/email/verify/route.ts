import { ApiError, handle, readJson } from "@/lib/api/http";
import { authSecret, getEnv, getStore } from "@/lib/api/env";
import { optionalUser, rateLimitAuth } from "@/lib/api/auth";
import { respondSignIn } from "@/lib/api/signin";
import { normalizeEmail, verifyCode } from "@/lib/auth/email-code";
import { signInWithIdentity } from "@/lib/auth/identity";

const MESSAGES = {
  invalid: "コードが正しくありません",
  expired: "コードの有効期限が切れました。もう一度送信してください",
  too_many_attempts: "入力の回数が上限に達しました。もう一度送信してください",
} as const;

// POST /api/v1/auth/email/verify — { email, code } でサインインする（サインイン中なら方法を追加）
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (!email || typeof body.code !== "string" || !/^\d{6}$/.test(body.code.trim())) {
      throw new ApiError("bad_request", "email と6桁の code が必要です");
    }

    const env = getEnv();
    const isReviewer =
      !!env.AUTH_REVIEW_EMAIL &&
      !!env.AUTH_REVIEW_CODE &&
      email === env.AUTH_REVIEW_EMAIL.toLowerCase() &&
      body.code.trim() === env.AUTH_REVIEW_CODE;

    const store = getStore();
    if (!isReviewer) {
      const result = await verifyCode(store, email, body.code, authSecret());
      if (result !== "ok") throw new ApiError("unauthorized", MESSAGES[result]);
    }

    return respondSignIn(
      await signInWithIdentity(store, {
        provider: "email",
        subject: email,
        email,
        current: await optionalUser(request),
      }),
    );
  });
}
