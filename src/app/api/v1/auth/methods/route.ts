import { handle, ok } from "@/lib/api/http";
import { getEnv } from "@/lib/api/env";

/**
 * GET /api/v1/auth/methods — このサーバーで使えるログイン方法（Web版のログイン画面が使う）。
 * Google の Web 用クライアントIDは公開してよい値（ブラウザの Google Identity Services に渡す）。
 */
export async function GET() {
  return handle(async () => {
    const env = getEnv();
    const googleIds = (env.GOOGLE_CLIENT_IDS ?? "").split(",").map((s) => s.trim());
    const googleWeb = env.GOOGLE_WEB_CLIENT_ID && googleIds.includes(env.GOOGLE_WEB_CLIENT_ID) ? env.GOOGLE_WEB_CLIENT_ID : null;
    return ok(
      {
        email: Boolean((env.EMAIL && env.EMAIL_FROM) || env.NEXTJS_ENV === "development"),
        google: googleWeb ? { webClientId: googleWeb } : null,
        passkey: Boolean(env.PASSKEY_RP_ID),
        // Sign in with Apple の Web 版は Services ID とドメイン検証が別に要るので、今は iOS だけ
        apple: false,
      },
      { maxAge: 300 },
    );
  });
}
