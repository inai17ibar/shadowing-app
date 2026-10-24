import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// ISR/データキャッシュは使っていないので、R2 のインクリメンタルキャッシュは設定しない
export default defineCloudflareConfig({});
