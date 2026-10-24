import { ApiError, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";

// GET /api/v1/me/texts/:id
export async function GET(request: Request, ctx: RouteContext<"/api/v1/me/texts/[id]">) {
  return handle(async () => {
    const user = await requireUser(request);
    const { id } = await ctx.params;
    const text = await getStore().getText(user.id, id);
    if (!text) throw new ApiError("not_found", "文章が見つかりません");
    return ok(text);
  });
}

// DELETE /api/v1/me/texts/:id
export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/me/texts/[id]">) {
  return handle(async () => {
    const user = await requireUser(request);
    const { id } = await ctx.params;
    if (!(await getStore().deleteText(user.id, id))) {
      throw new ApiError("not_found", "文章が見つかりません");
    }
    return new Response(null, { status: 204 });
  });
}
