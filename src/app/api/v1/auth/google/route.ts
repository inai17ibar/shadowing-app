import { ApiError, handle, readJson } from "@/lib/api/http";
import { getStore, googleClientIds } from "@/lib/api/env";
import { optionalUser, rateLimitAuth } from "@/lib/api/auth";
import { respondSignIn } from "@/lib/api/signin";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { IdTokenError } from "@/lib/auth/oidc";
import { signInWithIdentity } from "@/lib/auth/identity";

/**
 * POST /api/v1/auth/google — Google ログイン。
 *   { idToken, nonce? }  idToken は iOS の Google Sign-In SDK（GIDGoogleUser.idToken）
 *
 * 他社ログインを提供するので、Guideline 4.8 により Sign in with Apple も併設している。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    const body = await readJson(request);
    if (typeof body.idToken !== "string" || !body.idToken) {
      throw new ApiError("bad_request", "idToken が必要です");
    }

    let claims: { sub: string; email: string | null };
    try {
      claims = await verifyGoogleIdToken(body.idToken, {
        clientIds: googleClientIds(),
        nonce: typeof body.nonce === "string" ? body.nonce : undefined,
      });
    } catch (err) {
      if (err instanceof IdTokenError) throw new ApiError("unauthorized", err.message);
      if (err instanceof ApiError) throw err;
      throw new ApiError("upstream_error", "Google の公開鍵を取得できませんでした");
    }

    return respondSignIn(
      await signInWithIdentity(getStore(), {
        provider: "google",
        subject: claims.sub,
        email: claims.email,
        current: await optionalUser(request),
      }),
    );
  });
}
