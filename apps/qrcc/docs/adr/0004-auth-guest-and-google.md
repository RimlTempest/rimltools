# ADR-0004: Better Auth で匿名ゲスト + Google、後からアカウント昇格

- 状態: Accepted
- 日付: 2026-09-01

## 文脈

要件は「ゲストログイン」と「Google ログイン」。
生成と読み取りはログインなしでも使えるべきだが、保存・一覧・共有には
所有者が必要になる。ゲストで使い始めたユーザーのデータを、後から Google
アカウントに引き継げないと体験が悪い。

## 決定

- **Better Auth** を `qrcc-web`（TypeScript Worker）に置く。
- ストレージは **D1 + Drizzle アダプタ**。
- プラグイン: `anonymous`（ゲスト）+ Google OAuth（social provider）。
- ゲストが Google でログインすると、`anonymous` プラグインの
  `onLinkAccount` で **ゲスト所有の `Code` / `Folder` を新アカウントに移譲**する。
- `qrcc-api`（Rust）は認証を持たず、service binding の引数で
  検証済み `UserId` を受け取る（[ADR-0002](0002-auxiliary-worker-split.md)）。

## 理由

- 認証は Google OAuth のリダイレクト、state 管理、セッション更新、CSRF など
  細部が多い。Rust で自作するのは費用対効果が悪い。
- Better Auth は D1 / Workers での動作実績があり、匿名プラグインと
  アカウントリンクが標準機能として揃っている。
- 認可を TS 側に集約することで、Rust 側は純粋な計算と永続化に集中できる。

## セキュリティ上の決め事

- セッション Cookie は `HttpOnly` / `Secure` / `SameSite=Lax`。
- `cookieCache` は使わない（secondaryStorage 併用時のフォールバック不具合を回避）。
- ゲストセッションの有効期限は 30 日。期限切れデータは Cron で削除する。
- ゲストは以下を行えない:
  - `edit` 権限の共有リンク作成
  - 無期限の共有リンク作成（既定 30 日、最長 90 日）
- Google の client secret は Wrangler secret。`.dev.vars` はコミットしない
  （lefthook の secret スキャンで防ぐ）。

## 帰結

- D1 に `user` / `session` / `account` / `verification` テーブルが増える。
  マイグレーションは Better Auth の CLI 生成物をレビューして取り込む。
- ゲスト → Google の移譲は**冪等**でなければならない（リトライで二重移譲しない）。
  移譲は 1 トランザクションで行い、移譲済みフラグを立てる。
- 将来ログイン方法を増やす場合はプラグイン追加 + マイグレーションのみで済む。
