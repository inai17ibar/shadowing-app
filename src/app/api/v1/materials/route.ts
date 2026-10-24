import { ApiError, handle, ok, parseLimit } from "@/lib/api/http";
import { getStore } from "@/lib/api/env";
import { isLevel } from "@/lib/practice-plan";

// GET /api/v1/materials?level=&tag=&cursor=&limit= — 公開済み教材の一覧（認証不要）
export async function GET(request: Request) {
  return handle(async () => {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level");
    if (level !== null && !isLevel(level)) {
      throw new ApiError("bad_request", "level は beginner / intermediate / advanced のいずれかです");
    }
    const page = await getStore().listMaterials({
      level: level ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: parseLimit(searchParams.get("limit")),
    });
    return ok(page, { maxAge: 300 });
  });
}
