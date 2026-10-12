import { handle, readJson } from "@/lib/api/http";
import { getStore } from "@/lib/api/env";
import { revokeRefreshToken } from "@/lib/auth/sessions";

// POST /api/v1/auth/logout — { refreshToken } を無効にする。アクセストークンは期限（1時間）まで残る
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    if (typeof body.refreshToken === "string" && body.refreshToken) {
      await revokeRefreshToken(getStore(), body.refreshToken);
    }
    return new Response(null, { status: 204 });
  });
}
