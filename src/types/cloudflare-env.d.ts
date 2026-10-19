import type { D1Database } from "@/lib/db/d1";
import type { R2Bucket } from "@/lib/media";

// wrangler.jsonc のバインディングと `wrangler secret` の型。
// OpenNext が宣言している CloudflareEnv に足す。
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    /** 教材の収録音声（R2）。scripts/import-voa.ts で入れ、/media/... で配信する */
    MEDIA?: R2Bucket;
    /** アクセストークン(HS256)の署名鍵。32バイト以上のランダム値 */
    AUTH_SECRET?: string;
    /** iOSアプリの Bundle ID（Sign in with Apple の aud） */
    APPLE_CLIENT_ID?: string;
    APPLE_TEAM_ID?: string;
    APPLE_KEY_ID?: string;
    /** Sign in with Apple 用の .p8 キー（PEM） */
    APPLE_PRIVATE_KEY?: string;
    /** Google ログインの OAuth クライアントID（カンマ区切り） */
    GOOGLE_CLIENT_IDS?: string;
    /** Web版のログイン画面で使う Google のクライアントID（GOOGLE_CLIENT_IDS にも含めること） */
    GOOGLE_WEB_CLIENT_ID?: string;
    /** パスキーの RP ID（ドメイン）・表示名・許可する origin（カンマ区切り） */
    PASSKEY_RP_ID?: string;
    PASSKEY_RP_NAME?: string;
    PASSKEY_ORIGINS?: string;
    /** メールのワンタイムコードの送信（Cloudflare Email Service） */
    EMAIL?: {
      send(message: {
        to: string;
        from: { email: string; name?: string };
        subject: string;
        text: string;
        html?: string;
      }): Promise<{ messageId?: string }>;
    };
    /** 送信元アドレス（Email Sending を有効にしたドメインのもの） */
    EMAIL_FROM?: string;
    /** App Store 審査用のメールアドレスと固定コード（審査員はコードを受信できないため） */
    AUTH_REVIEW_EMAIL?: string;
    AUTH_REVIEW_CODE?: string;
    CRON_SECRET?: string;
    MIN_IOS_APP_VERSION?: string;
    /** 認証エンドポイントのレート制限（Workers Rate Limiting） */
    AUTH_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  }
}

export {};
