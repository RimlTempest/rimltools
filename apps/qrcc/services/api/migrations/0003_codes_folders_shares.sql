-- 保存されたコード・フォルダ・共有リンク（docs/domain-model.md 3・7・9 節）。
--
-- 方針:
--   * 正規化しすぎない。`payload` / `symbology` / `style` は **JSON 1 列**に入れ、
--     検索に使う列（kind / name / updated_at / folder_id / owner_id）だけを実列に出す。
--     一覧 1 行あたりの読み取り量を減らし、無料枠の row read を節約するため。
--   * 一覧は `OFFSET` を使わず (並べ替えキー, id) のカーソルで進む。
--     そのため索引も同じ並びで張る。
--   * ロールバックは書かない。D1 は前方移行のみで運用する。
--
-- 日時はすべて Unix 秒（他のテーブルと揃える）。
--
-- **所有者列の名前を `owner_id` から変えてはならない。**
-- features/auth の promotion-store（OWNED_TABLES）がこの名前で所有権を
-- 付け替えるため、変えるとゲスト → Google の移譲が静かに壊れる。
--
-- `owner_id` に "user" への外部キーは張らない。Better Auth は連携後にゲストの
-- ユーザー行を削除するので、外部キーがあると移譲前のコードまで連鎖削除される。

CREATE TABLE folder (
  id         TEXT    PRIMARY KEY NOT NULL,
  owner_id   TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- フォルダ一覧は名前順に出す。所有者で絞ってそのまま並べられるようにする。
CREATE INDEX folder_owner_name_idx ON folder (owner_id, name, id);

CREATE TABLE code (
  id         TEXT    PRIMARY KEY NOT NULL,
  owner_id   TEXT    NOT NULL,
  -- フォルダを消してもコードは残す。入れ物が消えただけで中身は消さない。
  folder_id  TEXT    REFERENCES folder (id) ON DELETE SET NULL,
  name       TEXT    NOT NULL,
  -- symbology の種類。絞り込みと一覧表示に使うので JSON から実列に出す。
  kind       TEXT    NOT NULL,
  payload    TEXT    NOT NULL,
  symbology  TEXT    NOT NULL,
  style      TEXT    NOT NULL,
  -- Idempotency-Key。同じキーの再送で 2 件目を作らせない（docs/api-contract.md 5 節）。
  idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 既定の並び（更新が新しい順）のカーソルページング用。
CREATE INDEX code_owner_updated_idx ON code (owner_id, updated_at DESC, id DESC);
-- 名前順のカーソルページング用。
CREATE INDEX code_owner_name_idx ON code (owner_id, name, id);
-- フォルダ絞り込みと、フォルダ削除時の付け替え用。
CREATE INDEX code_folder_idx ON code (folder_id);
-- 部分索引にすることで、キーなしの作成（NULL）は何件でも通る。
CREATE UNIQUE INDEX code_idempotency_unique
  ON code (owner_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE share_link (
  token      TEXT    PRIMARY KEY NOT NULL,
  code_id    TEXT    NOT NULL REFERENCES code (id) ON DELETE CASCADE,
  -- ゲストは edit を作れない。判定は qrcc-web の share-policy が行う（ADR-0002 / ADR-0004）。
  -- ここでは値が壊れていないことだけを保証する。
  permission TEXT    NOT NULL CHECK (permission IN ('view', 'edit')),
  -- NULL は無期限。ゲストは選べない。
  expires_at INTEGER,
  created_by TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  -- 取り消しは行を消さずに印を付ける。いつ取り消したかを残すため。
  revoked_at INTEGER,
  idempotency_key TEXT
);

CREATE INDEX share_link_code_idx ON share_link (code_id);
CREATE UNIQUE INDEX share_link_idempotency_unique
  ON share_link (created_by, idempotency_key) WHERE idempotency_key IS NOT NULL;
