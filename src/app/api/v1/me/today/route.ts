import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";
import {
  buildTodayPlan,
  computeStreak,
  decideAssignment,
  localDate,
  weakSentences,
} from "@/lib/practice-plan";

/**
 * GET /api/v1/me/today — 今日の課題。
 *
 * シャドテンの「今日の課題」に相当する。必要ならここで次の教材に進め、
 * 6ステップの進み具合と、前回までに弱かった文を返す。
 */
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const store = getStore();
    const now = new Date();

    const profile = (await store.getProfile(user.id)) ?? (await store.upsertProfile(user.id, {}));
    const tz = profile.timeZone;
    let assignment = await store.getAssignment(user.id);
    // 割り当てと連続日数の計算には直近60日あれば足りる
    const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
    const attempts = await store.listAttempts(user.id, { sinceIso: since });

    const decision = decideAssignment({
      current: assignment,
      level: profile.level,
      attempts,
      materials: await store.listMaterialLevels(),
      now,
      timeZone: tz,
    });

    let levelChanged = false;
    if (decision.action === "advance") {
      assignment = { materialId: decision.materialId, startedOn: localDate(now, tz) };
      await store.setAssignment(user.id, assignment);
      if (decision.level !== profile.level) {
        await store.upsertProfile(user.id, { level: decision.level });
        levelChanged = true;
      }
    }

    if (!assignment || decision.action === "exhausted") {
      return ok({
        status: "exhausted",
        message: "練習できる新しい教材がありません。自分の文章を取り込むか、新着をお待ちください。",
        streak: computeStreak(attempts, now, tz),
      });
    }

    const material = await store.getMaterial(assignment.materialId);
    const plan = buildTodayPlan(assignment, attempts, now, tz);
    const goalMinutes = profile.dailyGoalMinutes;

    return ok({
      status: "active",
      date: localDate(now, tz),
      material: material && {
        id: material.id,
        title: material.title,
        level: material.level,
        sentenceCount: material.sentences.length,
        audioUrl: material.audioUrl,
      },
      advancedReason: decision.action === "advance" ? decision.reason : null,
      levelChanged,
      level: decision.action === "advance" ? decision.level : profile.level,
      ...plan,
      weakSentences: weakSentences(assignment.materialId, attempts),
      streak: computeStreak(attempts, now, tz),
      goalMinutes,
    });
  });
}
