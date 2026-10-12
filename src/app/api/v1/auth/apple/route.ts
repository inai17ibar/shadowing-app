import { ApiError, handle, readJson } from "@/lib/api/http";
import { appleConfig, getStore } from "@/lib/api/env";
import { optionalUser, rateLimitAuth } from "@/lib/api/auth";
import { respondSignIn } from "@/lib/api/signin";
import { exchangeAuthorizationCode, verifyAppleIdentityToken } from "@/lib/auth/apple";
import { IdTokenError } from "@/lib/auth/oidc";
import { signInWithIdentity } from "@/lib/auth/identity";

/**
 * POST /api/v1/auth/apple — Sign in with Apple。
 *   { identityToken, authorizationCode?, nonce? }
 *
 * サインイン中のトークンを付けて呼ぶと、そのアカウントのログイン方法として追加する。
 * 結び付け・匿名記録の統合の規則は src/lib/auth/identity.ts。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    const body = await readJson(request);
    if (typeof body.identityToken !== "string" || !body.identityToken) {
      throw new ApiError("bad_request", "identityToken が必要です");
    }
    const config = appleConfig();

    let claims: { sub: string; email: string | null };
    try {
      claims = await verifyAppleIdentityToken(body.identityToken, {
        clientId: config.clientId,
        nonce: typeof body.nonce === "string" ? body.nonce : undefined,
      });
    } catch (err) {
      if (err instanceof IdTokenError) throw new ApiError("unauthorized", err.message);
      throw new ApiError("upstream_error", "Apple の公開鍵を取得できませんでした");
    }

    // 退会時に Apple 側の連携を失効させるため、refresh_token に交換して持っておく
    const providerRefreshToken =
      typeof body.authorizationCode === "string" && body.authorizationCode
        ? await exchangeAuthorizationCode(config, body.authorizationCode)
        : null;

    return respondSignIn(
      await signInWithIdentity(getStore(), {
        provider: "apple",
        subject: claims.sub,
        email: claims.email,
        providerRefreshToken,
        current: await optionalUser(request),
      }),
    );
  });
}
