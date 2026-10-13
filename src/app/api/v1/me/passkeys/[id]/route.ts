import { ApiError, handle } from "@/lib/api/http";
import { requireUser } from "@/lib/api/auth";
import { getStore } from "@/lib/api/env";

// DELETE /api/v1/me/passkeys/:id — パスキーを外す（最後のログイン方法は外せない）
export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/me/passkeys/[id]">) {
  return handle(async () => {
    const user = await requireUser(request);
    const { id } = await ctx.params;
    const store = getStore();
    if (!(await store.listPasskeys(user.id)).some((p) => p.id === id)) {
      throw new ApiError("not_found", "このパスキーは登録されていません");
    }
    if ((await store.countLoginMethods(user.id)) <= 1) {
      throw new ApiError("conflict", "最後のログイン方法は外せません。先に別の方法を追加してください");
    }
    await store.removePasskey(user.id, id);
    return new Response(null, { status: 204 });
  });
}
