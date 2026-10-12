import { ApiError, handle, ok, parseLimit } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";

/**
 * GET /api/v1/me/attempts?cursor=&limit= — 練習記録を、サーバーが受け取った順に返す。
 *
 * 別の端末で記録した分を取り込むための差分同期。前回の nextCursor を保存しておき、
 * 次回はそれを渡せば新しく届いた分だけが返る。hasMore が true の間は続けて取得する。
 */
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    if (cursor !== null && !/^[^|]+\|[^|]+$/.test(cursor)) {
      throw new ApiError("bad_request", "cursor が不正です");
    }
    const limit = parseLimit(searchParams.get("limit"), { fallback: 200, max: 500 });
    return ok(await getStore().listAttemptsReceivedAfter(user.id, cursor, limit));
  });
}
