import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";
import {
  buildTodayPlan,
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
    const [practicedMaterialIds, streak] = await Promise.all([
      store.listPracticedMaterialIds(user.id),
      store.getStreak(user.id, now, tz),
    ]);
    let attempts = assignment
      ? await store.listAttempts(user.id, { materialId: assignment.materialId })
      : [];

    const decision = decideAssignment({
      current: assignment,
      level: profile.level,
      attempts,
      practicedMaterialIds,
      materials: await store.listMaterialLevels(),
      now,
      timeZone: tz,
    });

    let levelChanged = false;
    if (decision.action === "advance") {
      assignment = { materialId: decision.materialId, startedOn: localDate(now, tz) };
      await store.setAssignment(user.id, assignment);
      attempts = await store.listAttempts(user.id, { materialId: assignment.materialId });
      if (decision.level !== profile.level) {
        await store.upsertProfile(user.id, { level: decision.level });
        levelChanged = true;
      }
    }

    if (!assignment || decision.action === "exhausted") {
      return ok({
        status: "exhausted",
        message: "練習できる新しい教材がありません。自分の文章を取り込むか、新着をお待ちください。",
        streak,
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
      streak,
      goalMinutes,
    });
  });
}
