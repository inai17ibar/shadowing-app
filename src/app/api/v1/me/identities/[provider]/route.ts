import { ApiError, handle } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { appleConfig, getStore } from "@/lib/api/env";
import { revokeAppleToken } from "@/lib/auth/apple";
import type { Provider } from "@/lib/db/store";

const PROVIDERS: Provider[] = ["apple", "google", "email"];

// DELETE /api/v1/me/identities/:provider — ログイン方法を外す（最後の1つは外せない）
export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/me/identities/[provider]">) {
  return handle(async () => {
    const user = await requireUser(request);
    const { provider } = await ctx.params;
    if (!PROVIDERS.includes(provider as Provider)) throw new ApiError("bad_request", "provider が不正です");

    const store = getStore();
    const identity = (await store.listIdentities(user.id)).find((i) => i.provider === provider);
    if (!identity) throw new ApiError("not_found", "このログイン方法は登録されていません");
    if ((await store.countLoginMethods(user.id)) <= 1) {
      throw new ApiError("conflict", "最後のログイン方法は外せません。先に別の方法を追加してください");
    }
    if (identity.provider === "apple" && identity.providerRefreshToken) {
      await revokeAppleToken(appleConfig(), identity.providerRefreshToken).catch((err) =>
        console.error("[identities] apple revoke", err),
      );
    }
    await store.removeIdentity(user.id, identity.provider);
    return new Response(null, { status: 204 });
  });
}
