import { ok } from "@/lib/api/http";
import { PRACTICE_STEPS, MASTERY_SCORE, MAX_DAYS_PER_MATERIAL } from "@/lib/practice-plan";

// GET /api/v1/steps — 練習ステップの定義。文言をアプリ更新なしで直せるようにサーバーから配る
export async function GET() {
  return ok(
    { steps: PRACTICE_STEPS, masteryScore: MASTERY_SCORE, maxDaysPerMaterial: MAX_DAYS_PER_MATERIAL },
    { maxAge: 3600 },
  );
}
