import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { appleConfig, getStore } from "@/lib/api/env";
import { revokeAppleToken } from "@/lib/auth/apple";
import type { Profile } from "@/lib/db/store";
import { isLevel } from "@/lib/practice-plan";

// GET /api/v1/me — プロフィール。初回アクセスで既定値を作る
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const store = getStore();
    const profile = (await store.getProfile(user.id)) ?? (await store.upsertProfile(user.id, {}));
    return ok({ id: user.id, isAnonymous: user.isAnonymous, profile });
  });
}

// PATCH /api/v1/me — レベル・1日の目標・タイムゾーンを変える
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const body = await readJson(request);
    const patch: Partial<Profile> = {};

    if ("level" in body) {
      if (!isLevel(body.level)) throw new ApiError("bad_request", "level が不正です");
      patch.level = body.level;
    }
    if ("dailyGoalMinutes" in body) {
      const n = body.dailyGoalMinutes;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 5 || n > 180) {
        throw new ApiError("bad_request", "dailyGoalMinutes は5〜180の整数です");
      }
      patch.dailyGoalMinutes = n;
    }
    if ("timeZone" in body) {
      const tz = body.timeZone;
      if (typeof tz !== "string" || !isValidTimeZone(tz)) {
        throw new ApiError("bad_request", "timeZone は IANA 名（例: Asia/Tokyo）です");
      }
      patch.timeZone = tz;
    }

    const profile = await getStore().upsertProfile(user.id, patch);
    return ok({ id: user.id, isAnonymous: user.isAnonymous, profile });
  });
}

// DELETE /api/v1/me — アカウントと全データの削除（App Store Review Guideline 5.1.1(v)）
export async function DELETE(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const store = getStore();
    // Sign in with Apple の連携を Apple 側でも失効させる（Apple の要件）。失敗しても削除は進める
    const apple = (await store.listIdentities(user.id)).find((i) => i.provider === "apple");
    if (apple?.providerRefreshToken) {
      await revokeAppleToken(appleConfig(), apple.providerRefreshToken).catch((err) =>
        console.error("[me] apple revoke", err),
      );
    }
    await store.deleteUser(user.id);
    return new Response(null, { status: 204 });
  });
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

