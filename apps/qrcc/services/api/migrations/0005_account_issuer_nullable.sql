-- contract: account を作り直して issuer を NULL 可にする（表の作り直しに DROP / RENAME を使うため guard の注記が要る）。
-- 列も既存の行も消さないので、新旧どちらの版とも動く。中身は expand で、次の説明のとおり。
--
-- better-auth 1.7.3 は、1.7.0〜1.7.2 が足した account.issuer（NOT NULL）と (issuer, account_id) の一意 index をやめ、
-- 1.6 と同じ (provider_id, account_id) で account を識別するように戻した
-- （https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-keeps-the-provider-key）。
-- 1.7.5 は issuer を書かないので、NOT NULL のままだと Google の新規サインインとゲストの昇格が失敗する。
--
-- ただし段階リリース中は 1.7.2 の旧版も同じ D1 を使い、issuer を読み書きする。そこで:
--   - 0005（これ、expand）: issuer を NULL 可にし、(provider_id, account_id) の一意 index を足す。列と行は消さない
--   - 0006（次のリリース、contract）: 全版が 1.7.5 以降になってから、issuer 列と (issuer, account_id) の index を消す
-- SQLite は列の NOT NULL を外せないので、表を作り直して行をそのまま写す（D1 の migration はファイルごとに 1 トランザクション）。
PRAGMA defer_foreign_keys = true;

CREATE TABLE account_new (
  id                       TEXT    PRIMARY KEY NOT NULL,
  -- 1.7.2 の旧版だけが書く。1.7.5 以降は書かない（0006 で消す）
  issuer                   TEXT,
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

INSERT INTO account_new (
  id, issuer, account_id, provider_id, user_id, access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at
)
SELECT
  id, issuer, account_id, provider_id, user_id, access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at
FROM account;

DROP TABLE account;
ALTER TABLE account_new RENAME TO account;

-- 1.7.2 の旧版が書く issuer の一意性は、0006 までそのまま保つ（NULL どうしは衝突しない）
CREATE UNIQUE INDEX account_issuer_account_id_unique ON account (issuer, account_id);
-- 1.7.3 以降の識別子（noter の 0001_auth.sql と同じ）
CREATE UNIQUE INDEX account_provider_account_id_unique ON account (provider_id, account_id);
CREATE INDEX account_user_id_idx ON account (user_id);
