-- /api/v1（iOSアプリ向け）のスキーマ（Cloudflare D1 / SQLite）。
--
-- D1 には Postgres の RLS が無い。利用者のデータへのアクセスは src/lib/db/store.ts で
-- 必ず user_id を条件に入れて絞る（test/store.test.ts で他人の行が見えないことを確認している）。
-- 利用者の行はすべて users に紐付け、アカウント削除で CASCADE で消える（Guideline 5.1.1(v)）。
-- 日時はすべて ISO 8601 の文字列（UTC）。

-- ---------------------------------------------------------------------------
-- 認証
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT     PRIMARY KEY,
  -- 1 = ログイン方法をまだ持たない匿名アカウント
  is_anonymous  INTEGER  NOT NULL DEFAULT 1,
  created_at    TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ログイン方法（1人が複数持てる）。provider + subject がその方法での利用者ID
--   apple:  identity token の sub
--   google: ID token の sub
--   email:  小文字化したメールアドレス
CREATE TABLE user_identities (
  provider               TEXT  NOT NULL CHECK (provider IN ('apple', 'google', 'email')),
  subject                TEXT  NOT NULL,
  user_id                TEXT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email                  TEXT,
  -- Apple: 退会時に連携を失効させるための refresh_token（Apple の要件）
  provider_refresh_token TEXT,
  created_at             TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX user_identities_user_idx ON user_identities (user_id);

-- パスキー（WebAuthn）。id は credential ID（base64url）
CREATE TABLE passkeys (
  id            TEXT     PRIMARY KEY,
  user_id       TEXT     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  public_key    TEXT     NOT NULL,  -- COSE 公開鍵（base64url）
  counter       INTEGER  NOT NULL DEFAULT 0,
  transports    TEXT     NOT NULL DEFAULT '[]',  -- JSON配列
  name          TEXT     NOT NULL DEFAULT '',
  created_at    TEXT     NOT NULL,
  last_used_at  TEXT
);
CREATE INDEX passkeys_user_idx ON passkeys (user_id);

-- パスキーの登録・認証で一度だけ使うチャレンジ
CREATE TABLE auth_challenges (
  id          TEXT  PRIMARY KEY,
  challenge   TEXT  NOT NULL,
  purpose     TEXT  NOT NULL CHECK (purpose IN ('passkey_register', 'passkey_login')),
  user_id     TEXT  REFERENCES users (id) ON DELETE CASCADE,
  expires_at  TEXT  NOT NULL
);

-- メールのワンタイムコード。コードそのものは保存せず、鍵付きハッシュだけを持つ
CREATE TABLE email_codes (
  email       TEXT     PRIMARY KEY,
  code_hash   TEXT     NOT NULL,
  attempts    INTEGER  NOT NULL DEFAULT 0,
  expires_at  TEXT     NOT NULL,
  created_at  TEXT     NOT NULL
);

-- リフレッシュトークン。値そのものは保存せず SHA-256 だけを持つ
CREATE TABLE sessions (
  token_hash  TEXT  PRIMARY KEY,
  user_id     TEXT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  TEXT  NOT NULL,
  created_at  TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- ---------------------------------------------------------------------------
-- 教材カタログ（全利用者で共有）
-- ---------------------------------------------------------------------------
CREATE TABLE materials (
  id             TEXT  PRIMARY KEY,
  title          TEXT  NOT NULL,
  level          TEXT  NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  description    TEXT  NOT NULL DEFAULT '',
  tags           TEXT  NOT NULL DEFAULT '[]',  -- JSON配列
  -- 出典とライセンスは必須。content-policy.ts の判定を通ったものだけ published にする
  source_name    TEXT  NOT NULL,
  source_url     TEXT  NOT NULL DEFAULT '',
  license        TEXT  NOT NULL CHECK (license IN (
                   'original', 'public-domain', 'cc0', 'cc-by', 'cc-by-sa',
                   'cc-by-nc', 'cc-by-nd', 'cc-by-nc-nd', 'licensed', 'unknown')),
  attribution    TEXT,
  license_ref    TEXT,
  audio_url      TEXT,
  -- [{ "text": "...", "translation": "...", "startMs": 0, "endMs": 1200 }]
  sentences      TEXT  NOT NULL,
  sentence_count INTEGER GENERATED ALWAYS AS (json_array_length(sentences)) VIRTUAL,
  status         TEXT  NOT NULL DEFAULT 'pending_review'
                   CHECK (status IN ('pending_review', 'published', 'rejected')),
  review_notes   TEXT  NOT NULL DEFAULT '[]',  -- JSON配列
  created_at     TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published_at   TEXT,
  -- 配信できないライセンスは公開状態にできない（アプリ側の判定が漏れても DB で止める）
  CHECK (status <> 'published' OR license IN ('original', 'public-domain', 'cc0', 'cc-by', 'cc-by-sa', 'licensed')),
  CHECK (license NOT IN ('cc-by', 'cc-by-sa') OR coalesce(attribution, '') <> '')
);
CREATE INDEX materials_published_idx ON materials (status, published_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- 利用者ごとのデータ
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  user_id            TEXT     PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  level              TEXT     NOT NULL DEFAULT 'beginner'
                       CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  daily_goal_minutes INTEGER  NOT NULL DEFAULT 30 CHECK (daily_goal_minutes BETWEEN 5 AND 180),
  time_zone          TEXT     NOT NULL DEFAULT 'Asia/Tokyo',
  created_at         TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 練習1回ぶんの記録。音声そのものは保存しない（採点は端末で行い、指標だけ送る）
-- id は端末が作る UUID。オフラインで記録したものを再送しても二重にならない（冪等キー）
CREATE TABLE attempts (
  id             TEXT     PRIMARY KEY,
  user_id        TEXT     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  material_id    TEXT     NOT NULL,
  step           TEXT     NOT NULL CHECK (step IN (
                   'listen', 'script', 'mumbling', 'overlapping', 'shadowing', 'record')),
  sentence_index INTEGER,
  score          INTEGER  CHECK (score BETWEEN 0 AND 100),
  lag_ms         INTEGER,
  rhythm         REAL,
  rate_ratio     REAL,
  coverage       REAL,
  duration_ms    INTEGER,
  -- 練習した時刻（オフライン時は端末の時刻）。連続日数や今日の課題はこちらで数える
  created_at     TEXT     NOT NULL,
  -- サーバーが受け取った時刻。別の端末への同期（GET /me/attempts）はこちらの順で返す
  received_at    TEXT     NOT NULL
);
CREATE INDEX attempts_user_created_idx ON attempts (user_id, created_at);
CREATE INDEX attempts_user_received_idx ON attempts (user_id, received_at, id);

-- 今取り組んでいる教材（シャドテン式に、習得するか7日経つまで同じ教材）
CREATE TABLE assignments (
  user_id     TEXT  PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  material_id TEXT  NOT NULL,
  started_on  TEXT  NOT NULL  -- YYYY-MM-DD
);

-- 利用者が自分で取り込んだ文章。本人だけが見られる（共有カタログには載せない）
CREATE TABLE user_texts (
  id          TEXT  PRIMARY KEY,
  user_id     TEXT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       TEXT  NOT NULL DEFAULT '',
  source_url  TEXT  NOT NULL DEFAULT '',
  sentences   TEXT  NOT NULL,  -- JSON配列
  created_at  TEXT  NOT NULL
);
CREATE INDEX user_texts_user_idx ON user_texts (user_id, created_at DESC);

-- 教材・アプリへの通報（Guideline 1.2 の通報手段）
CREATE TABLE reports (
  id          TEXT  PRIMARY KEY,
  -- 退会しても通報の記録は残すが、本人との紐付けは外す
  user_id     TEXT  REFERENCES users (id) ON DELETE SET NULL,
  target_type TEXT  NOT NULL CHECK (target_type IN ('material', 'user_text', 'app')),
  target_id   TEXT,
  reason      TEXT  NOT NULL,
  detail      TEXT  NOT NULL DEFAULT '',
  created_at  TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
