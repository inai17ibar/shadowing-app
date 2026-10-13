import { ok } from "@/lib/api/http";
import { getEnv } from "@/lib/api/env";

// GET /api/v1/health — 疎通確認。iOS が最低限必要なバージョンもここで返す
export async function GET() {
  const env = getEnv();
  return ok({
    status: "ok",
    apiVersion: 1,
    minIosAppVersion: env.MIN_IOS_APP_VERSION ?? "1.0.0",
    database: env.DB ? "d1" : "unbound",
  });
}
