# ADR-0011: 共有はメンバー（owner/editor/viewer）と期限つきリンクで表す

- 状態: Accepted
- 日付: 2026-09-06
- 関連: [ADR-0010](0010-auth-guest-and-google.md) / [ADR-0002](0002-auxiliary-worker-and-private-durable-object.md)

## 文脈

「URL を渡せば一緒に編集できる」が共同編集ツールの基本体験。しかし
URL だけで権限を表すと、リンクの失効・権限の降格・「誰がいるか」の把握が
できない。逆にメンバー招待だけにすると、相手のアカウントを知らないと共有できない。

## 決定

- 権限の実体は **`document_member(document_id, user_id, role)`**。role は
  `owner` / `editor` / `viewer` の 3 つ。`owner` は 1 文書 1 人（`document.owner_id`）
- **共有リンク `share_link(token, document_id, role, expires_at, revoked_at)`** は
  「開いた人をその role でメンバーに登録する入口」であって、権限そのものではない
  - `/s/:token` を開く → セッションが無ければゲストを発行 → `document_member` に
    upsert（**既存の role を下げない**）→ `302 /d/:id`
  - リンクを失効しても、すでに登録されたメンバーは残る。外すなら owner が
    「メンバーを削除」する
- リンクの role は `viewer` / `editor` の 2 択（`owner` リンクは無い）。
  ゲスト（匿名）の owner は `viewer` リンクしか作れない
- 既定の有効期限は 90 日（`SHARE_LINK_MAX_AGE`）。無期限は owner が明示的に選ぶ
- 権限判定は `features/documents/core/permission.ts` の **`can(role, action)` 1 枚**。
  web Worker の server function / `/ws/` 認可と DO の受信フィルタが同じ関数を使う
- 権限変更は既存の WebSocket に即時反映しない。owner の操作時に web が DO の
  `/kick` を呼び、該当 actor を `4403` で閉じる（次の接続で新しい role になる）

## 理由

- 「リンク = 入口、メンバー = 権限」に分けると、リンクを失効しても協力者を
  失わず、逆に協力者を外してもリンクは生きている、という**直交する操作**になる
- `can` を 1 枚にすることで、web と DO で判断がずれる余地が無い。DO は
  role をヘッダで受け取るだけで、権限表を持たない（[ADR-0002](0002-auxiliary-worker-and-private-durable-object.md)）
- token は 120 bit で推測不能。`DocumentId` は URL に出るが、メンバーでなければ
  404 で存在も分からない

## 帰結

- D1: `document_member` は `(document_id, user_id)` 主キー。`share_link.token` に
  ユニークインデックス。`MAX_MEMBERS = 50` を超える upsert は失敗させ、
  「参加者の上限」を表示する
- 共有リンクを開くたびに `document_member` への書き込み（1 行）が発生する。
  既存メンバーの再訪は `INSERT … ON CONFLICT DO NOTHING` で行書き込みを避ける
  （role を上げる場合だけ UPDATE）
- viewer の presence は送信しない（覗き見感の抑止、`docs/domain-model.md`）
- 「一般公開（誰でも閲覧）」は v1 に無い。必要なら `share_link` に
  `anonymous_read` を足す新 ADR で決める
