/**
 * サインイン系エンドポイント共通のレスポンス。
 */
import { ApiError, ok } from "./http";
import { authSecret, getStore } from "./env";
import { issueTokens } from "@/lib/auth/sessions";
import type { SignInOutcome } from "@/lib/auth/identity";

export async function respondSignIn(outcome: SignInOutcome) {
  if (outcome.status === "conflict") {
    throw new ApiError(
      "conflict",
      "このログイン方法は別のアカウントで使われています。いったんサインアウトしてから、その方法でサインインしてください",
    );
  }
  const tokens = await issueTokens(getStore(), authSecret(), outcome.user);
  return ok(
    {
      ...tokens,
      created: outcome.created,
      linked: outcome.linked,
      // 匿名で練習した記録を、このアカウントに引き継いだ
      mergedAnonymous: outcome.mergedAnonymous,
    },
    { status: outcome.created ? 201 : 200 },
  );
}
