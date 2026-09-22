-- rimltools-tfstate: OpenTofu http backend の保存先（docs/adr/0009-state-and-secrets.md）。
-- 本文は OpenTofu が暗号化した JSON。Worker は中身を読まない。
-- D1 の 1 値の上限（2 MB）を超えないよう、本文は state_chunks に分割して置く。

-- パスごとの「いまの版」
CREATE TABLE IF NOT EXISTS states (
  path TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 版の一覧（直近 N 版だけ残す）。serial / lineage は暗号化されていない OpenTofu のメタデータ
CREATE TABLE IF NOT EXISTS state_versions (
  path TEXT NOT NULL,
  version INTEGER NOT NULL,
  serial INTEGER NOT NULL,
  lineage TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (path, version)
);

CREATE TABLE IF NOT EXISTS state_chunks (
  path TEXT NOT NULL,
  version INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (path, version, idx)
);

CREATE TABLE IF NOT EXISTS locks (
  path TEXT PRIMARY KEY,
  lock_id TEXT NOT NULL,
  info TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
