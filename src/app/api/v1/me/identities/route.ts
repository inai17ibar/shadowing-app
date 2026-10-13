import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";

// GET /api/v1/me/identities — 登録済みのログイン方法（設定画面の「ログイン方法」に出す）
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const store = getStore();
    const [identities, passkeys] = await Promise.all([
      store.listIdentities(user.id),
      store.listPasskeys(user.id),
    ]);
    return ok({
      isAnonymous: user.isAnonymous,
      identities: identities.map((i) => ({ provider: i.provider, email: i.email, createdAt: i.createdAt })),
      passkeys: passkeys.map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt,
      })),
    });
  });
}
