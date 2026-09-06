# ドメインモデル

語彙はコード・UI 文言・テストで統一する。**太字**が正式名。

## 用語

| 用語（コード）           | UI 文言       | 意味                                                                 |
| ------------------------ | ------------- | -------------------------------------------------------------------- |
| **Document**             | 文書          | 1 本のテキスト。`kind` で解釈が変わる。本文は DO、メタは D1          |
| **DocumentKind**         | 種別          | `markdown` / `yaml` / `toml` / `json`                                |
| **Actor**                | —             | リクエストの主体。`visitor`（未ログイン）/ `guest` / `user`          |
| **MemberRole**           | 権限          | `owner` / `editor` / `viewer`                                        |
| **DocumentMember**       | 参加者        | 文書とアカウントの結び付き + 権限。共有リンクを開くと自動で作られる |
| **ShareLink**            | 共有リンク    | `token` で文書に入る入口。権限・有効期限・失効を持つ                 |
| **Room**                 | —             | 文書 1 本ぶんの Durable Object。接続中ソケットと Yjs doc を持つ      |
| **Presence**             | 参加中        | awareness（名前・色・カーソル）。永続化しない                        |
| **Diagnostic**           | 問題          | 構文エラーなど、本文に対する指摘。ブラウザで算出                     |
| **ConnectionState**      | 接続状態      | `connecting` / `connected` / `reconnecting` / `offline` / `rejected` |

## 識別子

すべて `<prefix>_` + Crockford base32 24 文字（`shared/contract` の `newId`）。

| 型             | prefix | 例                              |
| -------------- | ------ | ------------------------------- |
| `UserId`       | `usr_` | `usr_01j8x9q2k3m4n5p6r7s8t9v0` |
| `DocumentId`   | `doc_` | `doc_…`                         |
| `ShareToken`   | `shr_` | `shr_…`（推測不能。base32 24 文字 = 120 bit） |

`DocumentId` は URL に出る。**推測されても中身は見えない**（メンバーでなければ 404）。

## 権限表（`features/documents/core/permission.ts` の `can`）

| action           | owner | editor | viewer | 非メンバー |
| ---------------- | :---: | :----: | :----: | :--------: |
| read             |  ○    |   ○    |   ○    |     ×      |
| edit（sync update）|  ○  |   ○    |   ×    |     ×      |
| presence 送信    |  ○    |   ○    |   ×    |     ×      |
| rename           |  ○    |   ○    |   ×    |     ×      |
| share（リンク発行/失効）| ○ |  ×    |   ×    |     ×      |
| remove member    |  ○    |   ×    |   ×    |     ×      |
| delete           |  ○    |   ×    |   ×    |     ×      |
| export raw       |  ○    |   ○    |   ○    |     ×      |

- `visitor` は文書を作れない（作成時にゲストセッションを自動発行してから作る）。
- `viewer` の presence は**受信のみ**。閲覧者のカーソルは他人に見えない（意図: 覗き見感を出さない）。
- 権限はこの表 1 枚を Mapped Type で持ち、web Worker（server function / `/ws/`）と
  DO（inbound フィルタ）が同じ関数を使う。

## 状態遷移

### Document

```
(なし) ─create→ active ─delete→ deleted(soft, deleted_at) ─[30 日]→ purge（D1 行削除 + DO storage deleteAll）
```

- soft delete 中は一覧に出ず、`/d/:id` は 404、WS は `4404`。
- purge は当面手動（`bun run purge` を将来追加）。無料枠の行削除も書き込みに数える。

### ConnectionState（クライアント）

```
connecting ─open→ connected ─close(≠4xxx)→ reconnecting(attempt n, backoff) ─open→ connected
                            ─close(4403/4404/4429)→ rejected(reason)      ← 再接続しない
                            ─navigator.onLine=false→ offline ─online→ reconnecting
```

- `rejected` はユーザー操作（再読み込み・ログイン）なしに回復しない。理由を表示する。
- `offline` 中の編集はローカル Y.Doc に溜まり、復帰後に自動で送られる。

## 上限（`shared/contract/src/limits.ts`）

| 名前                  | 値        | 理由                                                   |
| --------------------- | --------- | ------------------------------------------------------ |
| `MAX_DOCUMENT_BYTES`  | 1 MiB     | DO 1 行 BLOB の実用上限。Yjs の state はテキストの ~1.5 倍 |
| `MAX_TITLE_LENGTH`    | 120       | 一覧のレイアウト                                       |
| `MAX_DISPLAY_NAME`    | 32        | presence ラベル                                        |
| `MAX_WS_MESSAGE_BYTES`| 256 KiB   | 1 メッセージ。貼り付けは分割送信（provider 側）        |
| `MAX_MEMBERS`         | 50        | presence 表示と DO のソケット数                        |
| `MAX_DOCUMENTS_PER_USER` | 200    | D1 行数と一覧の読み取り                                |
| `SHARE_LINK_MAX_AGE`  | 90 日     | 既定の有効期限（無期限は owner が明示選択）            |

上限に達したときの振る舞いは `free-tier-budget.md` の縮退表。
