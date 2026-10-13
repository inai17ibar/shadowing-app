import { ApiError, handle, ok } from "@/lib/api/http";
import { getStore } from "@/lib/api/env";

// GET /api/v1/materials/:id — 教材の本文（文ごと）と出典
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/materials/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const material = await getStore().getMaterial(id);
    if (!material) throw new ApiError("not_found", "教材が見つかりません");
    return ok(material, { maxAge: 300 });
  });
}
