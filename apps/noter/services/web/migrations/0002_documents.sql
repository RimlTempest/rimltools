-- 文書・参加者・共有リンク（ADR-0011 / docs/domain-model.md）。
--
-- 本文はここに無い。テキストは DocumentRoom(DO) の SQLite が持ち、D1 に置くのは
-- 「誰が・どの文書に・どの権限で」を決めるためのメタ情報だけ。
-- ロールバックは書かない。D1 は前方移行のみで運用する。
--
-- 日時はすべて Unix 秒（INTEGER）。0001 の user テーブルと揃える。

CREATE TABLE document (
  id         TEXT    PRIMARY KEY NOT NULL,
  owner_id   TEXT    NOT NULL REFERENCES "user" (id),
  kind       TEXT    NOT NULL CHECK (kind IN ('markdown', 'yaml', 'toml', 'json')),
  title      TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  -- soft delete。入っている間は一覧に出ず、/d/:id は 404、WS は 4404。
  deleted_at INTEGER
);

-- ホームの一覧（所有者 + 更新順）。
CREATE INDEX document_owner_updated ON document (owner_id, updated_at DESC);
-- 30 日後の purge が全行を読まずに済むようにする（未実装 / docs/deployment.md）。
CREATE INDEX document_deleted_at ON document (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE document_member (
  document_id TEXT    NOT NULL REFERENCES document (id),
  user_id     TEXT    NOT NULL REFERENCES "user" (id),
  role        TEXT    NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (document_id, user_id)
);

-- 一覧は document_member から引くので、user_id 側の索引が要る。
CREATE INDEX document_member_user ON document_member (user_id);

CREATE TABLE share_link (
  token       TEXT    PRIMARY KEY NOT NULL,
  document_id TEXT    NOT NULL REFERENCES document (id),
  -- owner リンクは無い（ADR-0011）。
  role        TEXT    NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by  TEXT    NOT NULL REFERENCES "user" (id),
  created_at  INTEGER NOT NULL,
  -- NULL は無期限。owner が明示的に選んだときだけ。
  expires_at  INTEGER,
  revoked_at  INTEGER
);

CREATE INDEX share_link_document ON share_link (document_id);
