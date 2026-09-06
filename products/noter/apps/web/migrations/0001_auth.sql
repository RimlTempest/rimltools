-- Better Auth のコアテーブル（ADR-0010）。
--
-- 列は snake_case で、Drizzle スキーマ（features/auth/server/schema.ts）が
-- Better Auth の camelCase フィールド名と対応づける。
-- ロールバックは書かない。D1 は前方移行のみで運用する（docs/domain-model.md）。
--
-- 日時はすべて Unix 秒（Drizzle の integer timestamp モード）。
-- 真偽値は 0/1 の INTEGER。
--
-- 文書まわり（document / document_member / share_link）は 0002 で足す（plan 004）。

CREATE TABLE "user" (
  id             TEXT    PRIMARY KEY NOT NULL,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image          TEXT,
  -- ゲスト（匿名）ユーザーかどうか。anonymous プラグインが立てる。
  is_anonymous   INTEGER DEFAULT 0,
  -- どのゲストから昇格したか（ADR-0010）。二重移譲を防ぐ唯一の判定材料で、
  -- Better Auth の管理外。Drizzle アダプタには渡さず、生 SQL でだけ触る。
  promoted_from  TEXT    REFERENCES "user" (id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE UNIQUE INDEX user_email_unique ON "user" (email);
-- 1 人のゲストを 2 つのアカウントが取り合えないようにする。
-- 移譲の記録はこの制約に当てて判定する（例外メッセージを読まない）。
CREATE UNIQUE INDEX user_promoted_from_unique
  ON "user" (promoted_from) WHERE promoted_from IS NOT NULL;

CREATE TABLE session (
  id         TEXT    PRIMARY KEY NOT NULL,
  user_id    TEXT    NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  token      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX session_token_unique ON session (token);
CREATE INDEX session_user_id_idx ON session (user_id);
-- 期限切れセッションの掃除（Cron）が全行を読まずに済むようにする。
CREATE INDEX session_expires_at_idx ON session (expires_at);

CREATE TABLE account (
  id                       TEXT    PRIMARY KEY NOT NULL,
  -- OAuth 側の識別子。発行者は provider_id で表す（better-auth 1.7.3 で
  -- issuer 列は廃止された。1.7.2 の schema をそのまま持ってくると、
  -- 「Better Auth が書かない NOT NULL 列」として起動時に弾かれる）。
  account_id               TEXT    NOT NULL,
  provider_id              TEXT    NOT NULL,
  user_id                  TEXT    NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  access_token             TEXT,
  refresh_token            TEXT,
  id_token                 TEXT,
  access_token_expires_at  INTEGER,
  refresh_token_expires_at INTEGER,
  scope                    TEXT,
  password                 TEXT,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL
);

CREATE UNIQUE INDEX account_provider_account_id_unique ON account (provider_id, account_id);
CREATE INDEX account_user_id_idx ON account (user_id);

CREATE TABLE verification (
  id         TEXT    PRIMARY KEY NOT NULL,
  identifier TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX verification_identifier_idx ON verification (identifier);
CREATE INDEX verification_expires_at_idx ON verification (expires_at);
