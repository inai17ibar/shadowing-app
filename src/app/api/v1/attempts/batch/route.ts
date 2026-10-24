import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";
import { parseAttempt } from "@/lib/api/attempt-input";

const MAX_BATCH = 100;

/**
 * POST /api/v1/attempts/batch — オフラインで溜めた練習記録をまとめて送る。
 *   { "attempts": [{ id, practicedAt, materialId, step, ... }, ...] }  最大100件
 *
 * 1件ずつ独立に処理し、件ごとの結果を返す（一部が不正でも残りは保存する）。
 *   created   新しく保存した
 *   duplicate 既に受け取っていた（再送）。端末は送信済みとして消してよい
 *   rejected  内容が不正。端末で直せないものなので、送信待ちから外してよい
 *   conflict  id が他人の記録と衝突した。別の UUID を振り直して送る
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const body = await readJson(request);
    if (!Array.isArray(body.attempts) || body.attempts.length === 0 || body.attempts.length > MAX_BATCH) {
      throw new ApiError("bad_request", `attempts は1〜${MAX_BATCH}件の配列です`);
    }

    const store = getStore();
    const results = [];
    for (const [index, raw] of (body.attempts as unknown[]).entries()) {
      const clientId = (raw as { id?: unknown })?.id ?? null;
      try {
        if (!raw || typeof raw !== "object") throw new ApiError("bad_request", "記録はオブジェクトです");
        if (clientId === null) throw new ApiError("bad_request", "一括送信では id（UUID）が必須です");
        const { input, feedback } = await parseAttempt(store, user.id, raw as Record<string, unknown>);
        const r = await store.insertAttempt(user.id, input);
        results.push(
          r.status === "conflict"
            ? { index, id: clientId, status: "conflict" }
            : { index, id: input.id, status: r.status, attempt: r.attempt, feedback },
        );
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        results.push({ index, id: clientId, status: "rejected", error: { code: err.code, message: err.message } });
      }
    }
    return ok({ results });
  });
}
