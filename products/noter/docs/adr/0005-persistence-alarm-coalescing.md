# ADR-0005: 永続化は alarm で集約し 1 文書 1 行に書く

- 状態: Accepted
- 日付: 2026-09-06
- 関連: [ADR-0003](0003-realtime-yjs-on-durable-objects.md) / [ADR-0009](0009-free-tier-d1-and-do-only.md)

## 文脈

Workers Free で **最初に枯れる**のは DO SQLite の行書き込み（100,000 行/日）。
1 キーストロークごとに書くと 1 人が数分で 1 日分を使い切る。
一方で、DO のメモリは休止・再デプロイで消えるので、書かないわけにもいかない。

## 決定

- DO の SQLite に **`document_state(id=1, state BLOB, updated_at)` の 1 行だけ**を持つ。
  更新ログ（Yjs の update を追記する方式）は採らない
- 更新を受けたら `markDirty()`。alarm が未設定なら `setAlarm(now + PERSIST_DELAY_MS)`
  （`PERSIST_DELAY_MS = 5000`）。alarm が来たら `Y.encodeStateAsUpdate(doc)` を
  `INSERT OR REPLACE` で 1 行書き、dirty を落とす
- **最後のソケットが閉じたら即 flush** する（alarm を待たない）
- D1 の `document.updated_at` は alarm 内で **60 秒スロットル**して touch する。
  `noter-sync` に同じ D1 を binding し、失敗しても編集を止めない
- 損失窓は最大 5 秒。クライアント側の `Y.Doc` が差分を保持しているので、
  クライアントが 1 人でも生きていれば再接続で復元される

## 理由

- 活発に編集している 1 時間の書き込みは 3600 / 5 = 720 行。DO SQLite の
  1 行書き込みは実際には内部で複数行（インデックス等）に数えられるため
  概算 2 行/回として 1,440 行/時。**1 日あたり約 69 文書・時間ぶん**が上限
  （`docs/free-tier-budget.md`）。`PERSIST_DELAY_MS` が唯一のレバーで、
  上限に近づいたら 15 秒・30 秒と伸ばせる
- 更新ログ方式は行数が更新数に比例して増え、この制約と正面衝突する
- Yjs の `encodeStateAsUpdate` は文書全体の状態（履歴込み）を 1 つの
  バイト列にするので、1 行で足りる。1 MiB の文書でも BLOB に入る

## 帰結

- DO の `alarm()` は Free の DO リクエストとして数えられる（720 req/時/文書）。
  `docs/free-tier-budget.md` に計上済み
- DO のスキーマは `features/sync/core/src/schema.ts` の `SCHEMA_VERSION` と
  `migrate(sql)` で管理し、wake 時に `blockConcurrencyWhile` で当てる
- 文書サイズ上限（`MAX_DOCUMENT_BYTES` = 1 MiB）は**クライアント**が
  `changeFilter` で守る。DO は 1 メッセージのサイズ（256 KiB）だけ見る
- 縮退時（行書き込み枯渇）は alarm の書き込みが失敗する。DO は dirty を
  保ったまま次の alarm を張り直す（指数バックオフ、最大 60 秒）。
  v1 ではクライアントに通知しない（`docs/design/ux.md` §5、`docs/free-tier-budget.md` §4）。
  通知するならプロトコルのメッセージ型 ≥100 を追加し ADR を足す
