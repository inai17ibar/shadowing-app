/**
 * データ層（Cloudflare D1）。
 *
 * D1 には RLS が無いので、利用者のデータを扱うメソッドは必ず userId を受け取り、
 * すべての SQL で `user_id = ?` を条件に入れる。ここ以外から利用者のテーブルを触らないこと。
 *
 * Next.js にも Workers にも依存しない（D1 の形をしたものを渡せば Node のテストでも動く）。
 */
import type { D1Database } from "./d1.ts";
import { localDate, type Level, type StepId } from "../practice-plan.ts";
import type { License } from "../content-policy.ts";

// ---------------------------------------------------------------------------
// Types（APIのレスポンスと同じ camelCase）
// ---------------------------------------------------------------------------

export interface Sentence {
  text: string;
  translation?: string;
  /** お手本音声の中での開始・終了（ミリ秒）。音声が無い教材では省略 */
  startMs?: number;
  endMs?: number;
}

export type MaterialStatus = "pending_review" | "published" | "rejected";

export interface Material {
  id: string;
  title: string;
  level: Level;
  description: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  license: License;
  attribution: string | null;
  /** 収録済みのお手本音声。無ければ端末の TTS で読み上げる */
  audioUrl: string | null;
  sentences: Sentence[];
  publishedAt: string | null;
}

export type MaterialSummary = Omit<Material, "sentences"> & { sentenceCount: number };

export interface MaterialCandidate {
  id: string;
  title: string;
  level: Level;
  description: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  license: License;
  attribution: string | null;
  sentences: Sentence[];
  status: MaterialStatus;
  reviewNotes: string[];
}

export interface User {
  id: string;
  isAnonymous: boolean;
  createdAt: string;
}

export type Provider = "apple" | "google" | "email";

export interface Identity {
  provider: Provider;
  subject: string;
  userId: string;
  email: string | null;
  providerRefreshToken: string | null;
  createdAt: string;
}

export interface Passkey {
  id: string;
  userId: string;
  /** COSE 公開鍵（base64url） */
  publicKey: string;
  counter: number;
  transports: string[];
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export type ChallengePurpose = "passkey_register" | "passkey_login";

export interface Profile {
  level: Level;
  dailyGoalMinutes: number;
  timeZone: string;
  createdAt: string;
}

export interface Attempt {
  /** 端末が作る UUID（冪等キー） */
  id: string;
  materialId: string;
  step: StepId;
  sentenceIndex: number | null;
  score: number | null;
  lagMs: number | null;
  rhythm: number | null;
  rateRatio: number | null;
  coverage: number | null;
  durationMs: number | null;
  /** 練習した時刻（オフライン時は端末の時刻） */
  createdAt: string;
  /** サーバーが受け取った時刻 */
  receivedAt: string;
}

export type AttemptInput = Omit<Attempt, "receivedAt">;

export type InsertAttemptResult =
  | { status: "created"; attempt: Attempt }
  /** 同じ id を既に受け取っている（オフラインからの再送）。保存済みの内容を返す */
  | { status: "duplicate"; attempt: Attempt }
  /** 同じ id が他人の記録として存在する */
  | { status: "conflict" };

export interface Assignment {
  materialId: string;
  startedOn: string;
}

export interface UserText {
  id: string;
  title: string;
  sourceUrl: string;
  sentences: string[];
  createdAt: string;
}

export interface Report {
  targetType: "material" | "user_text" | "app";
  targetId: string | null;
  reason: string;
  detail: string;
}

export interface SavedText {
  id: number;
  title: string;
  source_url: string;
  paragraphs: string[];
  created_at: string;
}

export interface MaterialQuery {
  level?: Level;
  tag?: string;
  /** 前ページ最後の publishedAt|id */
  cursor?: string;
  limit: number;
}

export const DEFAULT_PROFILE: Omit<Profile, "createdAt"> = {
  level: "beginner",
  dailyGoalMinutes: 30,
  timeZone: "Asia/Tokyo",
};

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== "string") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function materialFromRow(r: Row): Omit<Material, "sentences"> {
  return {
    id: String(r.id),
    title: String(r.title),
    level: r.level as Level,
    description: String(r.description),
    tags: json<string[]>(r.tags, []),
    sourceName: String(r.source_name),
    sourceUrl: String(r.source_url),
    license: r.license as License,
    attribution: str(r.attribution),
    audioUrl: str(r.audio_url),
    publishedAt: str(r.published_at),
  };
}

function userFromRow(r: Row): User {
  return {
    id: String(r.id),
    isAnonymous: Number(r.is_anonymous) === 1,
    createdAt: String(r.created_at),
  };
}

function identityFromRow(r: Row): Identity {
  return {
    provider: r.provider as Provider,
    subject: String(r.subject),
    userId: String(r.user_id),
    email: str(r.email),
    providerRefreshToken: str(r.provider_refresh_token),
    createdAt: String(r.created_at),
  };
}

function passkeyFromRow(r: Row): Passkey {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    publicKey: String(r.public_key),
    counter: Number(r.counter),
    transports: json<string[]>(r.transports, []),
    name: String(r.name),
    createdAt: String(r.created_at),
    lastUsedAt: str(r.last_used_at),
  };
}

function profileFromRow(r: Row): Profile {
  return {
    level: r.level as Level,
    dailyGoalMinutes: Number(r.daily_goal_minutes),
    timeZone: String(r.time_zone),
    createdAt: String(r.created_at),
  };
}

function attemptFromRow(r: Row): Attempt {
  return {
    id: String(r.id),
    materialId: String(r.material_id),
    step: r.step as StepId,
    sentenceIndex: num(r.sentence_index),
    score: num(r.score),
    lagMs: num(r.lag_ms),
    rhythm: num(r.rhythm),
    rateRatio: num(r.rate_ratio),
    coverage: num(r.coverage),
    durationMs: num(r.duration_ms),
    createdAt: String(r.created_at),
    receivedAt: String(r.received_at),
  };
}

function textFromRow(r: Row): UserText {
  return {
    id: String(r.id),
    title: String(r.title),
    sourceUrl: String(r.source_url),
    sentences: json<string[]>(r.sentences, []),
    createdAt: String(r.created_at),
  };
}

const cursorOf = (m: { publishedAt: string | null; id: string }) => `${m.publishedAt ?? ""}|${m.id}`;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type Store = ReturnType<typeof createStore>;

export function createStore(db: D1Database, { now = () => new Date() } = {}) {
  const iso = () => now().toISOString();

  return {
    // ----- 教材（共有） -----------------------------------------------------

    async listMaterials({ level, tag, cursor, limit }: MaterialQuery) {
      const where = ["status = 'published'"];
      const params: unknown[] = [];
      if (level) {
        where.push("level = ?");
        params.push(level);
      }
      if (tag) {
        where.push("EXISTS (SELECT 1 FROM json_each(materials.tags) WHERE value = ?)");
        params.push(tag);
      }
      if (cursor) {
        const [publishedAt, id] = cursor.split("|");
        // 同じ時刻に公開したもの（1つの記事のパートなど）は id の昇順で、(1/4) から並べる
        where.push("(published_at < ? OR (published_at = ? AND id > ?))");
        params.push(publishedAt, publishedAt, id);
      }
      const { results } = await db
        .prepare(
          `SELECT id, title, level, description, tags, source_name, source_url, license,
                  attribution, audio_url, published_at, sentence_count
             FROM materials WHERE ${where.join(" AND ")}
            ORDER BY published_at DESC, id ASC LIMIT ?`,
        )
        .bind(...params, limit + 1)
        .all<Row>();
      const page = results.slice(0, limit).map((r) => ({
        ...materialFromRow(r),
        sentenceCount: Number(r.sentence_count),
      }));
      return {
        items: page as MaterialSummary[],
        nextCursor: results.length > limit ? cursorOf(page[page.length - 1]) : null,
      };
    },

    /** 割り当ての計算用。公開済み教材の id とレベルだけを公開順に返す */
    async listMaterialLevels() {
      const { results } = await db
        .prepare(
          "SELECT id, level FROM materials WHERE status = 'published' ORDER BY published_at ASC, id ASC",
        )
        .all<{ id: string; level: Level }>();
      return results;
    },

    async getMaterial(id: string): Promise<Material | null> {
      const r = await db
        .prepare("SELECT * FROM materials WHERE id = ? AND status = 'published'")
        .bind(id)
        .first<Row>();
      return r ? { ...materialFromRow(r), sentences: json<Sentence[]>(r.sentences, []) } : null;
    },

    /** 自動収集した候補を保存する。既にある id は上書きしない。保存した件数を返す */
    async insertMaterialCandidates(rows: MaterialCandidate[]) {
      if (rows.length === 0) return 0;
      const stmt = db.prepare(
        // OR IGNORE は CHECK 違反まで黙って捨てるので使わない。重複 id だけを無視する
        `INSERT INTO materials
           (id, title, level, description, tags, source_name, source_url, license,
            attribution, sentences, status, review_notes, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
      );
      const results = await db.batch(
        rows.map((r) =>
          stmt.bind(
            r.id,
            r.title,
            r.level,
            r.description,
            JSON.stringify(r.tags),
            r.sourceName,
            r.sourceUrl,
            r.license,
            r.attribution,
            JSON.stringify(r.sentences),
            r.status,
            JSON.stringify(r.reviewNotes),
            r.status === "published" ? iso() : null,
          ),
        ),
      );
      return results.reduce((n, r) => n + r.meta.changes, 0);
    },

    // ----- 利用者・セッション ----------------------------------------------

    async createUser({ anonymous = true }: { anonymous?: boolean } = {}): Promise<User> {
      const id = crypto.randomUUID();
      await db
        .prepare("INSERT INTO users (id, is_anonymous, created_at) VALUES (?, ?, ?)")
        .bind(id, anonymous ? 1 : 0, iso())
        .run();
      return (await this.getUser(id))!;
    },

    async getUser(id: string): Promise<User | null> {
      const r = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<Row>();
      return r ? userFromRow(r) : null;
    },

    /** ログイン方法を1つ以上持ったので本登録扱いにする */
    async markRegistered(userId: string) {
      await db.prepare("UPDATE users SET is_anonymous = 0 WHERE id = ?").bind(userId).run();
    },

    // ----- ログイン方法 ------------------------------------------------------

    async findIdentity(provider: Provider, subject: string): Promise<Identity | null> {
      const r = await db
        .prepare("SELECT * FROM user_identities WHERE provider = ? AND subject = ?")
        .bind(provider, subject)
        .first<Row>();
      return r ? identityFromRow(r) : null;
    },

    async listIdentities(userId: string): Promise<Identity[]> {
      const { results } = await db
        .prepare("SELECT * FROM user_identities WHERE user_id = ? ORDER BY created_at ASC")
        .bind(userId)
        .all<Row>();
      return results.map(identityFromRow);
    },

    async addIdentity(
      userId: string,
      i: { provider: Provider; subject: string; email?: string | null; providerRefreshToken?: string | null },
    ) {
      await db
        .prepare(
          `INSERT INTO user_identities (provider, subject, user_id, email, provider_refresh_token, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(i.provider, i.subject, userId, i.email ?? null, i.providerRefreshToken ?? null, iso())
        .run();
    },

    /** 再サインイン時に、メールアドレスや Apple の refresh_token が新しくなっていれば更新する */
    async updateIdentity(
      provider: Provider,
      subject: string,
      patch: { email?: string | null; providerRefreshToken?: string | null },
    ) {
      await db
        .prepare(
          `UPDATE user_identities
              SET email = coalesce(?, email), provider_refresh_token = coalesce(?, provider_refresh_token)
            WHERE provider = ? AND subject = ?`,
        )
        .bind(patch.email ?? null, patch.providerRefreshToken ?? null, provider, subject)
        .run();
    },

    async removeIdentity(userId: string, provider: Provider): Promise<boolean> {
      const r = await db
        .prepare("DELETE FROM user_identities WHERE user_id = ? AND provider = ?")
        .bind(userId, provider)
        .run();
      return r.meta.changes > 0;
    },

    /** ログイン方法（外部ID＋パスキー）の数。最後の1つは外させない */
    async countLoginMethods(userId: string): Promise<number> {
      const r = await db
        .prepare(
          `SELECT (SELECT count(*) FROM user_identities WHERE user_id = ?)
                + (SELECT count(*) FROM passkeys WHERE user_id = ?) AS n`,
        )
        .bind(userId, userId)
        .first<{ n: number }>();
      return Number(r?.n ?? 0);
    },

    // ----- パスキー ----------------------------------------------------------

    async addPasskey(userId: string, p: Pick<Passkey, "id" | "publicKey" | "counter" | "transports" | "name">) {
      await db
        .prepare(
          `INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(p.id, userId, p.publicKey, p.counter, JSON.stringify(p.transports), p.name, iso())
        .run();
    },

    async getPasskey(id: string): Promise<Passkey | null> {
      const r = await db.prepare("SELECT * FROM passkeys WHERE id = ?").bind(id).first<Row>();
      return r ? passkeyFromRow(r) : null;
    },

    async listPasskeys(userId: string): Promise<Passkey[]> {
      const { results } = await db
        .prepare("SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at ASC")
        .bind(userId)
        .all<Row>();
      return results.map(passkeyFromRow);
    },

    async touchPasskey(id: string, counter: number) {
      await db
        .prepare("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?")
        .bind(counter, iso(), id)
        .run();
    },

    async removePasskey(userId: string, id: string): Promise<boolean> {
      const r = await db.prepare("DELETE FROM passkeys WHERE id = ? AND user_id = ?").bind(id, userId).run();
      return r.meta.changes > 0;
    },

    async createChallenge(c: { challenge: string; purpose: ChallengePurpose; userId: string | null; ttlSec: number }) {
      const id = crypto.randomUUID();
      const expiresAt = new Date(now().getTime() + c.ttlSec * 1000).toISOString();
      await db
        .prepare("INSERT INTO auth_challenges (id, challenge, purpose, user_id, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(id, c.challenge, c.purpose, c.userId, expiresAt)
        .run();
      return id;
    },

    /** チャレンジを使い切る。期限切れ・目的違い・別人のものなら null */
    async consumeChallenge(id: string, purpose: ChallengePurpose, userId: string | null) {
      const r = await db
        .prepare("DELETE FROM auth_challenges WHERE id = ? RETURNING challenge, purpose, user_id, expires_at")
        .bind(id)
        .first<Row>();
      if (!r || r.purpose !== purpose || String(r.expires_at) <= iso()) return null;
      if ((r.user_id ?? null) !== userId) return null;
      return String(r.challenge);
    },

    // ----- メールのワンタイムコード ---------------------------------------------

    async getEmailCode(email: string) {
      const r = await db.prepare("SELECT * FROM email_codes WHERE email = ?").bind(email).first<Row>();
      return r
        ? {
            codeHash: String(r.code_hash),
            attempts: Number(r.attempts),
            expiresAt: String(r.expires_at),
            createdAt: String(r.created_at),
          }
        : null;
    },

    /** コードを発行し直す（試行回数もリセット） */
    async putEmailCode(email: string, codeHash: string, ttlSec: number) {
      const expiresAt = new Date(now().getTime() + ttlSec * 1000).toISOString();
      await db
        .prepare(
          `INSERT INTO email_codes (email, code_hash, attempts, expires_at, created_at) VALUES (?, ?, 0, ?, ?)
           ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0,
             expires_at = excluded.expires_at, created_at = excluded.created_at`,
        )
        .bind(email, codeHash, expiresAt, iso())
        .run();
    },

    async incrementEmailCodeAttempts(email: string) {
      await db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    },

    async deleteEmailCode(email: string) {
      await db.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
    },

    /**
     * 匿名アカウントの記録を、既存のアカウントに移して匿名アカウントを消す。
     * 匿名で練習してから、以前作ったアカウントでサインインした場合に記録を失わないため。
     *
     * プロフィールと今の教材は、移し先に既にあればそちらを優先する（本登録側の設定を壊さない）。
     */
    async mergeAnonymousUser(fromId: string, toId: string) {
      const from = await this.getUser(fromId);
      if (!from || !from.isAnonymous) throw new Error("匿名アカウント以外は統合できません");
      if (fromId === toId) return;
      await db.batch([
        db.prepare("UPDATE attempts SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
        db.prepare("UPDATE user_texts SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
        db.prepare("UPDATE reports SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
        db
          .prepare(
            "UPDATE profiles SET user_id = ? WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = ?)",
          )
          .bind(toId, fromId, toId),
        db
          .prepare(
            "UPDATE assignments SET user_id = ? WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM assignments WHERE user_id = ?)",
          )
          .bind(toId, fromId, toId),
        // 残った行（移し先にあったプロフィール等・セッション）は CASCADE で消える
        db.prepare("DELETE FROM users WHERE id = ? AND is_anonymous = 1").bind(fromId),
      ]);
    },

    async createSession(userId: string, tokenHash: string, expiresAt: string) {
      await db
        .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .bind(tokenHash, userId, expiresAt, iso())
        .run();
    },

    /**
     * リフレッシュトークンを使い切る（ローテーション）。有効なら持ち主の userId を返す。
     * 同じトークンで2回呼ぶと2回目は null（DELETE ... RETURNING で一度きりにしている）。
     */
    async consumeSession(tokenHash: string): Promise<string | null> {
      const r = await db
        .prepare("DELETE FROM sessions WHERE token_hash = ? RETURNING user_id, expires_at")
        .bind(tokenHash)
        .first<{ user_id: string; expires_at: string }>();
      if (!r || r.expires_at <= iso()) return null;
      return r.user_id;
    },

    async deleteSession(tokenHash: string) {
      await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    },

    /** アカウント削除（Guideline 5.1.1(v)）。関連する行は外部キーの CASCADE で消える */
    async deleteUser(userId: string) {
      await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    },

    // ----- プロフィール ----------------------------------------------------

    async getProfile(userId: string): Promise<Profile | null> {
      const r = await db.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(userId).first<Row>();
      return r ? profileFromRow(r) : null;
    },

    async upsertProfile(userId: string, patch: Partial<Omit<Profile, "createdAt">>): Promise<Profile> {
      const current = await this.getProfile(userId);
      const next = { ...DEFAULT_PROFILE, ...current, ...patch };
      await db
        .prepare(
          `INSERT INTO profiles (user_id, level, daily_goal_minutes, time_zone, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             level = excluded.level,
             daily_goal_minutes = excluded.daily_goal_minutes,
             time_zone = excluded.time_zone`,
        )
        .bind(userId, next.level, next.dailyGoalMinutes, next.timeZone, iso())
        .run();
      return (await this.getProfile(userId))!;
    },

    // ----- 練習記録 --------------------------------------------------------

    async listAttempts(userId: string, opts: { sinceIso?: string; materialId?: string } = {}) {
      const where = ["user_id = ?"];
      const params: unknown[] = [userId];
      if (opts.sinceIso) {
        where.push("created_at >= ?");
        params.push(opts.sinceIso);
      }
      if (opts.materialId) {
        where.push("material_id = ?");
        params.push(opts.materialId);
      }
      // 全件をキーセットで読む。固定上限で最新記録を黙って落とさない。
      const attempts: Attempt[] = [];
      let cursor: { createdAt: string; id: string } | undefined;
      for (;;) {
        const after = cursor ? " AND (created_at > ? OR (created_at = ? AND id > ?))" : "";
        const { results } = await db
          .prepare(`SELECT * FROM attempts WHERE ${where.join(" AND ")}${after}
                    ORDER BY created_at ASC, id ASC LIMIT 1000`)
          .bind(...params, ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : []))
          .all<Row>();
        attempts.push(...results.map(attemptFromRow));
        if (results.length < 1000) return attempts;
        const last = attempts[attempts.length - 1];
        cursor = { createdAt: last.createdAt, id: last.id };
      }
    },

    /** 全期間を教材IDだけに集約。日々の計画で過去の詳細記録を読む必要はない。 */
    async listPracticedMaterialIds(userId: string): Promise<string[]> {
      const { results } = await db
        .prepare("SELECT DISTINCT material_id FROM attempts WHERE user_id = ?")
        .bind(userId)
        .all<{ material_id: string }>();
      return results.map((r) => r.material_id);
    },

    /** 直近から途切れる日まで読む。60日上限なし、過去の全詳細も読み込まない。 */
    async getStreak(userId: string, at: Date, timeZone: string): Promise<number> {
      const previousDay = (day: string) =>
        new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      const today = localDate(at, timeZone);
      let expected = today;
      let streak = 0;
      let cursor: { createdAt: string; id: string } | undefined;
      for (;;) {
        const before = cursor ? " AND (created_at < ? OR (created_at = ? AND id < ?))" : "";
        const { results } = await db
          .prepare(`SELECT id, created_at FROM attempts WHERE user_id = ?${before}
                    ORDER BY created_at DESC, id DESC LIMIT 512`)
          .bind(userId, ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : []))
          .all<{ id: string; created_at: string }>();
        for (const row of results) {
          const day = localDate(row.created_at, timeZone);
          if (day > expected) continue; // 重複した日・未来の記録
          if (streak === 0 && expected === today && day < today) expected = previousDay(today);
          if (day < expected) return streak;
          streak++;
          expected = previousDay(expected);
        }
        if (results.length < 512) return streak;
        const last = results[results.length - 1];
        cursor = { createdAt: last.created_at, id: last.id };
      }
    },

    async getAttempt(userId: string, id: string): Promise<Attempt | null> {
      const r = await db
        .prepare("SELECT * FROM attempts WHERE id = ? AND user_id = ?")
        .bind(id, userId)
        .first<Row>();
      return r ? attemptFromRow(r) : null;
    },

    /**
     * 練習記録を保存する。同じ id を2回送っても1件にしかならない（オフラインからの再送対策）。
     */
    async insertAttempt(userId: string, a: AttemptInput): Promise<InsertAttemptResult> {
      const row: Attempt = { ...a, receivedAt: iso() };
      const r = await db
        .prepare(
          `INSERT INTO attempts (id, user_id, material_id, step, sentence_index, score,
                                 lag_ms, rhythm, rate_ratio, coverage, duration_ms, created_at, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO NOTHING`,
        )
        .bind(
          row.id,
          userId,
          row.materialId,
          row.step,
          row.sentenceIndex,
          row.score,
          row.lagMs,
          row.rhythm,
          row.rateRatio,
          row.coverage,
          row.durationMs,
          row.createdAt,
          row.receivedAt,
        )
        .run();
      if (r.meta.changes > 0) return { status: "created", attempt: row };
      const existing = await this.getAttempt(userId, row.id);
      return existing ? { status: "duplicate", attempt: existing } : { status: "conflict" };
    },

    /** 別の端末への同期用。サーバーが受け取った順に返す */
    async listAttemptsReceivedAfter(userId: string, cursor: string | null, limit: number) {
      const params: unknown[] = [userId];
      let where = "user_id = ?";
      if (cursor) {
        const [receivedAt, id] = cursor.split("|");
        where += " AND (received_at > ? OR (received_at = ? AND id > ?))";
        params.push(receivedAt, receivedAt, id);
      }
      const { results } = await db
        .prepare(`SELECT * FROM attempts WHERE ${where} ORDER BY received_at ASC, id ASC LIMIT ?`)
        .bind(...params, limit + 1)
        .all<Row>();
      const items = results.slice(0, limit).map(attemptFromRow);
      const last = items[items.length - 1];
      return {
        items,
        nextCursor: last ? `${last.receivedAt}|${last.id}` : cursor,
        hasMore: results.length > limit,
      };
    },

    // ----- 割り当て --------------------------------------------------------

    async getAssignment(userId: string): Promise<Assignment | null> {
      const r = await db
        .prepare("SELECT material_id, started_on FROM assignments WHERE user_id = ?")
        .bind(userId)
        .first<Row>();
      return r ? { materialId: String(r.material_id), startedOn: String(r.started_on) } : null;
    },

    async setAssignment(userId: string, a: Assignment) {
      await db
        .prepare(
          `INSERT INTO assignments (user_id, material_id, started_on) VALUES (?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET material_id = excluded.material_id, started_on = excluded.started_on`,
        )
        .bind(userId, a.materialId, a.startedOn)
        .run();
    },

    // ----- 自分の文章 ------------------------------------------------------

    async listTexts(userId: string) {
      const { results } = await db
        .prepare(
          "SELECT id, title, source_url, created_at FROM user_texts WHERE user_id = ? ORDER BY created_at DESC",
        )
        .bind(userId)
        .all<Row>();
      return results.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        sourceUrl: String(r.source_url),
        createdAt: String(r.created_at),
      }));
    },

    async getText(userId: string, id: string): Promise<UserText | null> {
      const r = await db
        .prepare("SELECT * FROM user_texts WHERE id = ? AND user_id = ?")
        .bind(id, userId)
        .first<Row>();
      return r ? textFromRow(r) : null;
    },

    async insertText(userId: string, t: Omit<UserText, "id" | "createdAt">): Promise<UserText> {
      const row: UserText = { ...t, id: crypto.randomUUID(), createdAt: iso() };
      await db
        .prepare(
          "INSERT INTO user_texts (id, user_id, title, source_url, sentences, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(row.id, userId, row.title, row.sourceUrl, JSON.stringify(row.sentences), row.createdAt)
        .run();
      return row;
    },

    async deleteText(userId: string, id: string): Promise<boolean> {
      const r = await db
        .prepare("DELETE FROM user_texts WHERE id = ? AND user_id = ?")
        .bind(id, userId)
        .run();
      return r.meta.changes > 0;
    },

    // ----- 通報 ------------------------------------------------------------

    async insertReport(userId: string, r: Report) {
      await db
        .prepare(
          "INSERT INTO reports (id, user_id, target_type, target_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), userId, r.targetType, r.targetId, r.reason, r.detail, iso())
        .run();
    },

    // ----- Web版の保存テキスト（/api/texts。全員で共有） ---------------------

    async listSavedTexts() {
      const { results } = await db
        .prepare("SELECT id, title, source_url, created_at FROM saved_texts ORDER BY id DESC")
        .all<Omit<SavedText, "paragraphs">>();
      return results;
    },

    async getSavedText(id: number) {
      const r = await db
        .prepare("SELECT title, source_url, paragraphs, created_at FROM saved_texts WHERE id = ?")
        .bind(id)
        .first<Row>();
      return r
        ? {
            title: String(r.title),
            source_url: String(r.source_url),
            paragraphs: json<string[]>(r.paragraphs, []),
            created_at: String(r.created_at),
          }
        : null;
    },

    async insertSavedText(t: { title: string; source_url: string; paragraphs: string[] }) {
      const r = await db
        .prepare(
          "INSERT INTO saved_texts (title, source_url, paragraphs, created_at) VALUES (?, ?, ?, ?) RETURNING id",
        )
        .bind(t.title, t.source_url, JSON.stringify(t.paragraphs), iso())
        .first<{ id: number }>();
      return Number(r!.id);
    },

    async deleteSavedText(id: number): Promise<boolean> {
      const r = await db.prepare("DELETE FROM saved_texts WHERE id = ?").bind(id).run();
      return r.meta.changes > 0;
    },
  };
}
