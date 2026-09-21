-- ゲスト（匿名）から Google アカウントへの移譲記録（ADR-0004）。
--
-- 「移譲済みフラグ」そのもの。ゲスト 1 人につき 1 行しか作れないので、
-- リトライしても 2 回目の INSERT が主キー制約で落ち、二重移譲にならない。
-- 所有権の付け替えとこの行の INSERT は 1 トランザクション（D1 の batch）で行う。
--
-- user への外部キーは**張らない**。Better Auth は連携後にゲストのユーザー行を
-- 削除するため、外部キーを張ると記録まで連鎖削除され、リトライで二重に移譲できてしまう。

CREATE TABLE account_promotion (
  from_user_id  TEXT    PRIMARY KEY NOT NULL,
  to_user_id    TEXT    NOT NULL,
  moved_codes   INTEGER NOT NULL DEFAULT 0,
  moved_folders INTEGER NOT NULL DEFAULT 0,
  completed_at  INTEGER NOT NULL
);

CREATE INDEX account_promotion_to_user_id_idx ON account_promotion (to_user_id);
