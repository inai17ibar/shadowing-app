import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";
import type { Report } from "@/lib/db/store";

const TARGET_TYPES: Report["targetType"][] = ["material", "user_text", "app"];
const REASONS = ["inappropriate", "copyright", "incorrect", "audio_problem", "other"];

/**
 * POST /api/v1/reports — 教材やアプリの問題を通報する。
 * 誤り・不適切な内容・著作権の申し立てを受け付ける窓口（Guideline 1.2 / 5.2）。
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const body = await readJson(request);

    if (!TARGET_TYPES.includes(body.targetType as Report["targetType"])) {
      throw new ApiError("bad_request", `targetType は ${TARGET_TYPES.join(" / ")} のいずれかです`);
    }
    if (!REASONS.includes(body.reason as string)) {
      throw new ApiError("bad_request", `reason は ${REASONS.join(" / ")} のいずれかです`);
    }
    await getStore().insertReport(user.id, {
      targetType: body.targetType as Report["targetType"],
      targetId: typeof body.targetId === "string" ? body.targetId.slice(0, 200) : null,
      reason: body.reason as string,
      detail: typeof body.detail === "string" ? body.detail.slice(0, 2000) : "",
    });
    return ok({ received: true }, { status: 201 });
  });
}
