/**
 * データ層（Cloudflare D1）。
 *
 * D1 には RLS が無いので、利用者のデータを扱うメソッドは必ず userId を受け取り、
 * すべての SQL で `user_id = ?` を条件に入れる。ここ以外から利用者のテーブルを触らないこと。
 *
 * Next.js にも Workers にも依存しない（D1 の形をしたものを渡せば Node のテストでも動く）。
 */
import type { D1Database } from "./d1.ts";
import type { Level, StepId } from "../practice-plan.ts";
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
  appleSub: string | null;
  appleRefreshToken: string | null;
  createdAt: string;
}

export interface Profile {
  level: Level;
  dailyGoalMinutes: number;
  timeZone: string;
  createdAt: string;
}

export interface Attempt {
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
  createdAt: string;
}

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
    appleSub: str(r.apple_sub),
    appleRefreshToken: str(r.apple_refresh_token),
    createdAt: String(r.created_at),
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
        where.push("(published_at < ? OR (published_at = ? AND id < ?))");
        params.push(publishedAt, publishedAt, id);
      }
      const { results } = await db
        .prepare(
          `SELECT id, title, level, description, tags, source_name, source_url, license,
                  attribution, audio_url, published_at, sentence_count
             FROM materials WHERE ${where.join(" AND ")}
            ORDER BY published_at DESC, id DESC LIMIT ?`,
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

    async createUser({ appleSub = null }: { appleSub?: string | null } = {}): Promise<User> {
      const id = crypto.randomUUID();
      await db
        .prepare("INSERT INTO users (id, is_anonymous, apple_sub, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, appleSub ? 0 : 1, appleSub, iso())
        .run();
      return (await this.getUser(id))!;
    },

    async getUser(id: string): Promise<User | null> {
      const r = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<Row>();
      return r ? userFromRow(r) : null;
    },

    async findUserByAppleSub(sub: string): Promise<User | null> {
      const r = await db.prepare("SELECT * FROM users WHERE apple_sub = ?").bind(sub).first<Row>();
      return r ? userFromRow(r) : null;
    },

    /** 匿名ユーザーに Apple ID を結び付けて本登録にする（練習記録はそのまま残る） */
    async linkApple(userId: string, appleSub: string, appleRefreshToken: string | null) {
      await db
        .prepare(
          `UPDATE users SET is_anonymous = 0, apple_sub = ?,
                  apple_refresh_token = coalesce(?, apple_refresh_token)
            WHERE id = ?`,
        )
        .bind(appleSub, appleRefreshToken, userId)
        .run();
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
      const { results } = await db
        .prepare(`SELECT * FROM attempts WHERE ${where.join(" AND ")} ORDER BY created_at ASC LIMIT 5000`)
        .bind(...params)
        .all<Row>();
      return results.map(attemptFromRow);
    },

    async insertAttempt(userId: string, a: Omit<Attempt, "id" | "createdAt">): Promise<Attempt> {
      const row: Attempt = { ...a, id: crypto.randomUUID(), createdAt: iso() };
      await db
        .prepare(
          `INSERT INTO attempts (id, user_id, material_id, step, sentence_index, score,
                                 lag_ms, rhythm, rate_ratio, coverage, duration_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        )
        .run();
      return row;
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
