import type { D1Database } from "@/lib/db/d1";

// wrangler.jsonc のバインディングと `wrangler secret` の型。
// OpenNext が宣言している CloudflareEnv に足す。
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    /** アクセストークン(HS256)の署名鍵。32バイト以上のランダム値 */
    AUTH_SECRET?: string;
    /** iOSアプリの Bundle ID（Sign in with Apple の aud） */
    APPLE_CLIENT_ID?: string;
    APPLE_TEAM_ID?: string;
    APPLE_KEY_ID?: string;
    /** Sign in with Apple 用の .p8 キー（PEM） */
    APPLE_PRIVATE_KEY?: string;
    CRON_SECRET?: string;
    MIN_IOS_APP_VERSION?: string;
    /** 認証エンドポイントのレート制限（Workers Rate Limiting） */
    AUTH_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  }
}

export {};
