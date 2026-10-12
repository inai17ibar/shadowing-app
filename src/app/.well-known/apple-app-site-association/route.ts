import { getEnv } from "@/lib/api/env";

/**
 * GET /.well-known/apple-app-site-association
 * iOSアプリがこのドメインのパスキーを使えるようにする（Associated Domains の webcredentials）。
 */
export async function GET() {
  const env = getEnv();
  const apps = env.APPLE_TEAM_ID && env.APPLE_CLIENT_ID ? [`${env.APPLE_TEAM_ID}.${env.APPLE_CLIENT_ID}`] : [];
  return Response.json({ webcredentials: { apps } }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
