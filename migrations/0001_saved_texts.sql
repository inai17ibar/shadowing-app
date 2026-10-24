-- Web版リーダーの保存テキスト（全員で共有。/api/texts）
CREATE TABLE saved_texts (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  title      TEXT     NOT NULL DEFAULT '',
  source_url TEXT     NOT NULL DEFAULT '',
  paragraphs TEXT     NOT NULL,  -- JSON配列
  created_at TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
