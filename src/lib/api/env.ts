/**
 * Cloudflare のバインディング（D1・secret）を取り出す。
 * `next dev` では next.config.ts の initOpenNextCloudflareForDev がローカルの D1 を用意する。
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createStore, type Store } from "@/lib/db/store";
import { ApiError } from "./http";

export function getEnv(): CloudflareEnv {
  return getCloudflareContext().env;
}

export function getStore(): Store {
  const { DB } = getEnv();
  if (!DB) throw new ApiError("not_configured", "D1 (DB) がバインドされていません");
  return createStore(DB);
}

export function authSecret(): string {
  const secret = getEnv().AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiError("not_configured", "AUTH_SECRET（32文字以上）が設定されていません");
  }
  return secret;
}

export function appleConfig() {
  const env = getEnv();
  if (!env.APPLE_CLIENT_ID) {
    throw new ApiError("not_configured", "APPLE_CLIENT_ID が設定されていません");
  }
  return {
    clientId: env.APPLE_CLIENT_ID,
    teamId: env.APPLE_TEAM_ID,
    keyId: env.APPLE_KEY_ID,
    privateKey: env.APPLE_PRIVATE_KEY,
  };
}

/** Google ログインで受け付ける OAuth クライアントID（iOS 用・Web 用などをカンマ区切りで） */
export function googleClientIds(): string[] {
  const ids = (getEnv().GOOGLE_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new ApiError("not_configured", "GOOGLE_CLIENT_IDS が設定されていません");
  return ids;
}

export function passkeyConfig() {
  const env = getEnv();
  if (!env.PASSKEY_RP_ID) throw new ApiError("not_configured", "PASSKEY_RP_ID が設定されていません");
  return {
    rpId: env.PASSKEY_RP_ID,
    rpName: env.PASSKEY_RP_NAME ?? "Shadowing",
    origins: (env.PASSKEY_ORIGINS ?? `https://${env.PASSKEY_RP_ID}`)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
