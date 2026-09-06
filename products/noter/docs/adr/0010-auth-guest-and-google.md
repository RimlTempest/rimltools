# ADR-0010: Better Auth で匿名ゲスト + Google、後からアカウント昇格

- 状態: Accepted
- 日付: 2026-09-06
- 関連: qrcc ADR-0004 を移植・改訂 / [ADR-0011](0011-sharing-model.md)

## 文脈

共有リンクを開いた人が**サインインなしで即座に編集に参加できる**ことが
共同編集の体験の要。一方で文書には所有者が要り、ゲストで作った文書を後から
Google アカウントに引き継げないと困る。

## 決定

- **Better Auth** を `noter-web` に置く。ストレージは D1 + Drizzle アダプタ
- プラグイン: `anonymous`（ゲスト）+ Google OAuth
- **共有リンクを開いた visitor には自動でゲストセッションを発行**し、表示名を
  訊いてから文書へ入れる（`docs/design/ux.md` §共有リンクの入口）
- ゲストが Google でログインすると、`onLinkAccount` で **ゲスト所有の `document` と
  `document_member` を新アカウントに移譲**する（冪等、1 トランザクション）
- ユーザー ID は `usr_` + Crockford base32 24 文字。qrcc と同じ生成器
- `noter-sync`（DO）は認証を持たない。web が検証済みの actorId / role をヘッダで渡す
  （[ADR-0002](0002-auxiliary-worker-and-private-durable-object.md)）

## セキュリティ上の決め事

- セッション Cookie は `HttpOnly` / `Secure` / `SameSite=Lax`
- `cookieCache` は使わない
- ゲストセッションの有効期限は 30 日。操作で延長される。期限切れは Cron で削除（未実装）
- ゲストは以下を行えない:
  - `editor` 権限の共有リンク作成（`viewer` リンクのみ）
  - 文書の所有権移転
- Google の client secret は Wrangler secret。`.dev.vars` はコミットしない
- Google の資格情報が未設定の環境では Google ボタンを出さない（ゲストのみ）

## 帰結

- D1 に `user` / `session` / `account` / `verification` が増える（`apps/web/migrations/0001_auth.sql`）
- 移譲は `document.owner_id` と `document_member.user_id` の両方を書き換える。
  移譲済みかどうかは `user.promoted_from` 列で判定し、二重移譲を防ぐ
- 共有リンク経由のゲストは 1 端末 1 ユーザー。別端末で開くと別ゲストになる
  （Google でログインすれば統合される）
