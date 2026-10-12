import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { appleConfig, authSecret, getStore } from "@/lib/api/env";
import { optionalUser, rateLimitAuth } from "@/lib/api/auth";
import { AppleTokenError, exchangeAuthorizationCode, verifyAppleIdentityToken } from "@/lib/auth/apple";
import { issueTokens } from "@/lib/auth/sessions";
import type { User } from "@/lib/db/store";

/**
 * POST /api/v1/auth/apple — Sign in with Apple。
 *   { identityToken, authorizationCode?, nonce? }
 *
 * - 匿名ユーザーのトークンを付けて呼ぶと、その匿名アカウントを本登録に切り替える（練習記録を引き継ぐ）
 * - その Apple ID が既に別アカウントに結び付いていれば、そちらにサインインする
 *   （匿名側の記録は引き継がない。iOS 側で「以前のアカウントに切り替わります」と伝えること）
 */
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    const body = await readJson(request);
    if (typeof body.identityToken !== "string" || !body.identityToken) {
      throw new ApiError("bad_request", "identityToken が必要です");
    }
    const config = appleConfig();

    let sub: string;
    try {
      ({ sub } = await verifyAppleIdentityToken(body.identityToken, {
        clientId: config.clientId,
        nonce: typeof body.nonce === "string" ? body.nonce : undefined,
      }));
    } catch (err) {
      if (err instanceof AppleTokenError) throw new ApiError("unauthorized", err.message);
      throw new ApiError("upstream_error", "Apple の公開鍵を取得できませんでした");
    }

    const store = getStore();
    const appleRefreshToken =
      typeof body.authorizationCode === "string" && body.authorizationCode
        ? await exchangeAuthorizationCode(config, body.authorizationCode)
        : null;

    const existing = await store.findUserByAppleSub(sub);
    const current = await optionalUser(request);
    let user: User;
    let linked = false;

    if (existing) {
      user = existing;
      if (appleRefreshToken) await store.linkApple(existing.id, sub, appleRefreshToken);
    } else if (current?.isAnonymous) {
      await store.linkApple(current.id, sub, appleRefreshToken);
      user = (await store.getUser(current.id))!;
      linked = true;
    } else {
      user = await store.createUser({ appleSub: sub });
      if (appleRefreshToken) await store.linkApple(user.id, sub, appleRefreshToken);
    }

    const tokens = await issueTokens(store, authSecret(), user);
    return ok({ ...tokens, linkedAnonymousAccount: linked });
  });
}
