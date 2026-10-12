import { ApiError, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";
import { computeStreak, dailyHistory, localDate } from "@/lib/practice-plan";

// GET /api/v1/me/progress?days=14 — 連続日数・日別の練習量と本番スコアの推移
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const days = Number(new URL(request.url).searchParams.get("days") ?? 14);
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new ApiError("bad_request", "days は1〜90の整数です");
    }

    const store = getStore();
    const now = new Date();
    const profile = (await store.getProfile(user.id)) ?? (await store.upsertProfile(user.id, {}));
    const since = new Date(now.getTime() - Math.max(days, 60) * 86_400_000).toISOString();
    const attempts = await store.listAttempts(user.id, { sinceIso: since });
    const history = dailyHistory(attempts, now, profile.timeZone, days);
    const inRange = attempts.filter(
      (a) => localDate(a.createdAt, profile.timeZone) >= history[0].date,
    );

    return ok({
      level: profile.level,
      streak: computeStreak(attempts, now, profile.timeZone),
      totals: {
        attempts: inRange.length,
        practiceMinutes: Math.round(
          inRange.reduce((s, a) => s + (a.durationMs ?? 0), 0) / 60_000,
        ),
        materials: new Set(inRange.map((a) => a.materialId)).size,
      },
      history,
    });
  });
}
