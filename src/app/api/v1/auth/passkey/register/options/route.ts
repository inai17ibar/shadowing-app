import { handle, ok } from "@/lib/api/http";
import { getStore, passkeyConfig } from "@/lib/api/env";
import { requireUser } from "@/lib/api/auth";
import { startRegistration } from "@/lib/auth/passkey";

/**
 * POST /api/v1/auth/passkey/register/options — パスキー登録の準備（サインイン中の利用者に追加する）。
 * 返した options を iOS の ASAuthorizationPlatformPublicKeyCredentialProvider に渡す。
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const store = getStore();
    const email = (await store.listIdentities(user.id)).find((i) => i.email)?.email;
    return ok(await startRegistration(store, passkeyConfig(), user, email ?? "Shadowing user"));
  });
}
