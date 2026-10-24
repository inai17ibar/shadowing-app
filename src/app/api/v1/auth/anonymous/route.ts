import { handle } from "@/lib/api/http";
import { respondTokens } from "@/lib/api/web-session";
import { authSecret, getStore } from "@/lib/api/env";
import { rateLimitAuth } from "@/lib/api/auth";
import { issueTokens } from "@/lib/auth/sessions";

/**
 * POST /api/v1/auth/anonymous — 匿名アカウントを作ってトークンを返す。
 * 初回起動でこれを呼べば、ログインなしで練習を始められる（審査員もすぐ試せる。Guideline 2.1 / 5.1.1）。
 */
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimitAuth(request);
    const store = getStore();
    const user = await store.createUser();
    return respondTokens(request, await issueTokens(store, authSecret(), user), {}, 201);
  });
}
