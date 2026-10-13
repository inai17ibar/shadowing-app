import { handle, ok } from "@/lib/api/http";
import { getStore, passkeyConfig } from "@/lib/api/env";
import { rateLimitAuth } from "@/lib/api/auth";
import { startLogin } from "@/lib/auth/passkey";

// POST /api/v1/auth/passkey/login/options — パスキーでのサインインの準備
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    return ok(await startLogin(getStore(), passkeyConfig()));
  });
}
