import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { authSecret, getEnv, getStore } from "@/lib/api/env";
import { rateLimitAuth } from "@/lib/api/auth";
import { issueCode, normalizeEmail, CODE_TTL_SEC } from "@/lib/auth/email-code";

/**
 * POST /api/v1/auth/email/start — { email } にワンタイムコードを送る。
 *
 * アドレスが登録済みかどうかは返さない（登録の有無を探られないようにする）。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    const email = normalizeEmail((await readJson(request)).email);
    if (!email) throw new ApiError("bad_request", "メールアドレスの形式が正しくありません");

    const env = getEnv();
    // 審査用アドレスには送らない（固定コードで検証する）
    if (env.AUTH_REVIEW_EMAIL && email === env.AUTH_REVIEW_EMAIL.toLowerCase()) {
      return ok({ sent: true, expiresIn: CODE_TTL_SEC }, { status: 202 });
    }

    const issued = await issueCode(getStore(), email, authSecret());
    if (issued.status === "too_soon") {
      throw new ApiError("rate_limited", `${issued.retryAfterSec}秒後にもう一度お試しください`);
    }
    await sendCode(env, email, issued.code);
    return ok({ sent: true, expiresIn: CODE_TTL_SEC }, { status: 202 });
  });
}

async function sendCode(env: CloudflareEnv, to: string, code: string) {
  if (!env.EMAIL || !env.EMAIL_FROM) {
    // ローカル開発ではメールを送らず、コードをサーバーのログに出す
    if (env.NEXTJS_ENV === "development") {
      console.log(`[auth/email] ${to} のコード: ${code}`);
      return;
    }
    throw new ApiError("not_configured", "メール送信（EMAIL / EMAIL_FROM）が設定されていません");
  }
  const text = [
    `ログインコード: ${code}`,
    "",
    "アプリの画面にこのコードを入力してください。10分間有効です。",
    "心当たりがない場合は、このメールを無視してください。",
  ].join("\n");
  await env.EMAIL.send({
    to,
    from: { email: env.EMAIL_FROM, name: "Shadowing" },
    subject: `ログインコード ${code}`,
    text,
    html: `<p>ログインコード: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p>
<p>アプリの画面にこのコードを入力してください。10分間有効です。</p>
<p>心当たりがない場合は、このメールを無視してください。</p>`,
  });
}
