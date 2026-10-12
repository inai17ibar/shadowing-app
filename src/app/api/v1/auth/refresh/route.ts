import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { authSecret, getStore } from "@/lib/api/env";
import { rateLimitAuth } from "@/lib/api/auth";
import { rotateRefreshToken } from "@/lib/auth/sessions";

// POST /api/v1/auth/refresh — { refreshToken } を新しいトークンのペアと交換する（古いものは無効になる）
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    const body = await readJson(request);
    if (typeof body.refreshToken !== "string" || !body.refreshToken) {
      throw new ApiError("bad_request", "refreshToken が必要です");
    }
    const tokens = await rotateRefreshToken(getStore(), authSecret(), body.refreshToken);
    if (!tokens) throw new ApiError("unauthorized", "リフレッシュトークンが無効です。サインインし直してください");
    return ok(tokens);
  });
}
