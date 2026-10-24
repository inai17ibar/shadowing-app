import { ApiError, handle, readJson } from "@/lib/api/http";
import { getStore, passkeyConfig } from "@/lib/api/env";
import { optionalUser, rateLimitAuth } from "@/lib/api/auth";
import { respondSignIn } from "@/lib/api/signin";
import { finishLogin, PasskeyError } from "@/lib/auth/passkey";

/**
 * POST /api/v1/auth/passkey/login/verify — { challengeId, response } でサインインする。
 * 匿名のトークンを付けて呼ぶと、匿名の記録をパスキーの持ち主のアカウントに統合する。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    const body = await readJson(request);
    if (typeof body.challengeId !== "string" || !body.response || typeof body.response !== "object") {
      throw new ApiError("bad_request", "challengeId と response が必要です");
    }
    try {
      return await respondSignIn(
        request,
        await finishLogin(getStore(), passkeyConfig(), {
          challengeId: body.challengeId,
          response: body.response as Parameters<typeof finishLogin>[2]["response"],
          current: await optionalUser(request),
        }),
      );
    } catch (err) {
      if (err instanceof PasskeyError) throw new ApiError("unauthorized", err.message);
      throw err;
    }
  });
}
