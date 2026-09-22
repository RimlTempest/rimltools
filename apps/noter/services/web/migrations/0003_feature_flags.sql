-- feature flag の定義（ルートの ADR-0004 / docs/flags.md）。
--
-- 正本はリポジトリの flags/<tool>.json。CI（.github/workflows/flags.yml）がこの表へ同期し、
-- @rimltools/flags が読む（Cache API に 60 秒キャッシュ）。手で書き換えるのは kill switch だけ。
--
-- IF NOT EXISTS なのは、flags の同期が migration より先に走っても壊れないようにするため。
-- expand のみ。ロールバックは書かない。D1 は前方移行のみで運用する。
--
-- definition は検証済みの FlagDefinition の JSON。日時は Unix 秒（他のテーブルと揃える）。

CREATE TABLE IF NOT EXISTS feature_flags (
  key        TEXT    PRIMARY KEY NOT NULL,
  definition TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
