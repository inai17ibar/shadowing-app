/**
 * Cloudflare Workers のエントリ。
 *
 * OpenNext が生成した Next.js の fetch ハンドラをそのまま使い、Cron Trigger 用の scheduled を足す。
 * 定期収集の中身は /api/v1/cron/collect のルートハンドラにあるので、ここではそれを内部的に呼ぶだけ
 * （Vercel Cron と同じく Authorization: Bearer $CRON_SECRET を付ける）。
 */
// `.open-next/worker.js` はビルド時に生成される。このファイルは wrangler が直接バンドルするので
// Next.js の型チェック対象からは外している（tsconfig.json の exclude）
import handler from "./.open-next/worker.js";

interface Env {
  CRON_SECRET?: string;
}

// Workers ランタイムの型（wrangler types）は Next.js 側の型と衝突するので、使う分だけ書く
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

const worker = {
  fetch: handler.fetch,

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const request = new Request("https://internal/api/v1/cron/collect", {
      headers: { Authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
    });
    const res: Response = await handler.fetch(request, env, ctx);
    console.log("[cron] collect", res.status, await res.text());
  },
};

export default worker;
