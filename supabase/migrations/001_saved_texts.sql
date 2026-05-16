CREATE TABLE saved_texts (
  id         bigserial    PRIMARY KEY,
  title      text         NOT NULL DEFAULT '',
  source_url text         NOT NULL DEFAULT '',
  paragraphs jsonb        NOT NULL,
  created_at timestamptz  DEFAULT now()
);
