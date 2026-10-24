import { getEnv } from "@/lib/api/env";
import { serveMedia } from "@/lib/media";

// GET /media/voa/123.mp3 — 教材の収録音声（認証不要。教材一覧と同じく公開済みの教材のもの）
export async function GET(request: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key } = await ctx.params;
  const { MEDIA } = getEnv();
  if (!MEDIA) return new Response("Media storage is not configured", { status: 503 });
  return serveMedia(MEDIA, key.join("/"), request);
}

export const HEAD = GET;
