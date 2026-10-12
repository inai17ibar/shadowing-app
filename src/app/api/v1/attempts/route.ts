import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";
import { parseAttempt } from "@/lib/api/attempt-input";

/**
 * POST /api/v1/attempts — 練習1回ぶんを記録する。
 *
 * 音声そのものは受け取らない。端末で作ったエネルギー包絡（envelopes）か、
 * 端末で計算済みの指標（metrics）を受け取り、点数はサーバーで同じ式から出す。
 * 採点しないステップ（聞き取り等）は、どちらも省略して「やった」記録だけ残す。
 *
 * 端末が id（UUID）を付けて送れば、通信が切れて再送しても二重に記録されない。
 * 既に受け取っていた場合は 200 で保存済みの記録を返す（新規は 201）。
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const store = getStore();
    const { input, feedback } = await parseAttempt(store, user.id, await readJson(request));
    const result = await store.insertAttempt(user.id, input);
    if (result.status === "conflict") throw new ApiError("conflict", "この id は使えません。別の UUID で送ってください");
    return ok(
      { attempt: result.attempt, feedback, duplicate: result.status === "duplicate" },
      { status: result.status === "created" ? 201 : 200 },
    );
  });
}
