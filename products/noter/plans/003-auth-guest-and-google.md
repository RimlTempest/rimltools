# Plan 003: Better Auth（ゲスト + Google）の移植と `/sign-in` `/settings/account`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <plan-002 のマージコミット>..HEAD -- features/auth features/shell apps/web shared/contract`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001（002 とは独立。並行可）
- **Category**: direction
- **Planned at**: commit `b110c53`, 2026-09-06

## Why this matters

「共有リンクを開いた人がサインインなしで即座に編集できる」体験の土台。
qrcc に同じ設計（anonymous + Google、昇格）の実装があり、そのまま移植できる。
ここが無いと plan 004 の認可（`/ws/` と server function）が書けない。

## Current state

- 設計: `docs/adr/0010-auth-guest-and-google.md`（全文を読む）。要点:
  Better Auth + D1/Drizzle、`anonymous` + Google、Cookie `HttpOnly/Secure/SameSite=Lax`、`cookieCache` 不使用、
  ゲストセッション 30 日、ゲストは editor リンクを作れない、Google 未設定なら Google ボタンを出さない、
  昇格は `user.promoted_from` で冪等。
- UX: `docs/design/ux.md` §4.5（`/sign-in`）、`docs/accessibility.md` §5「サインイン」。
- 移植元（読むだけ、書かない）: `/Users/riml/orca/projects/qrcc2/features/auth/`
  ```
  contract/  actor-wire.ts actor.ts share-policy.ts (+ tests)
  core/      promote-account.ts (+ test)
  server/    api-actor.ts auth-options.ts auth.ts current-actor.ts (+ tests)
  ui/        sign-in 画面・設定画面・auth.css・auth-env
  package.json  exports: ./contract ./server ./ui ./ui/auth.css ./ui/auth-env
  ```
  および `apps/api/migrations/0001_auth.sql`（qrcc の auth テーブル定義）、`apps/web/src/server/container.ts`
  （`makeAuth(env)` の配線）、`features/shell/ui/root.route.tsx`（`beforeLoad` で actor を取る部分）。
  qrcc の `Actor` は `visitor | guest | user` の判別共用体。noter でもそのまま。
- **qrcc の `.dev.vars` は読まない。** キー名は `BETTER_AUTH_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  で、`.dev.vars.example` に既にある。
- npm: `better-auth 1.7.3`、`@better-auth/drizzle-adapter 1.7.3`（qrcc は 1.7.2）、`drizzle-orm 0.45.2`、`drizzle-kit 0.31.10`。
  1.7.2 → 1.7.3 で API 変更が無いことを changelog で確認し、あれば 1.7.2 に揃える。
- plan 001 の `features/shell/ui/root.route.tsx` は認証を持たない。この plan で `beforeLoad` に actor 取得を足す。
- plan 001 の `features/shell/ui/settings.route.tsx` はプレースホルダ。**この plan で `features/auth/ui/settings.route.tsx` に移し**、
  `apps/web/src/routes.ts` の `/settings/account` の参照先を差し替える（shell 側のファイルは削除）。
- D1 スキーマ: `apps/web/migrations/0001_auth.sql`。qrcc の `0001_auth.sql` を元に `user` に
  `promoted_from TEXT NULL` を足す。**この plan では document 系テーブルを作らない**（plan 004 の `0002`）。

## Commands you will need

| Purpose   | Command                                                   | Expected             |
| --------- | --------------------------------------------------------- | -------------------- |
| Tests     | `bun test features/auth`                                  | pass                 |
| Migrate   | `bun run --filter '@noter/web' db:local`                  | `0001_auth.sql` 適用 |
| Check     | `bun run check`                                           | exit 0               |
| a11y      | `bun run a11y`                                            | pass                 |

## Suggested executor toolkit

- `.claude/skills/noter-typescript`, `noter-tdd`, `noter-html-a11y`
- `.claude/skills/better-auth-best-practices/`（存在すれば）
- `docs/adr/0010-*.md`, `docs/design/ux.md` §4.5

## Scope

**In scope**: `features/auth/**`, `apps/web/migrations/0001_auth.sql`, `apps/web/src/server/container.ts`,
`apps/web/src/routes.ts`（2 行: `/sign-in` 追加、`/settings/account` 差し替え）、`apps/web/src/styles/app.css`（1 行）、
`apps/web/package.json`（依存）、`apps/web/tsconfig.json` + ルート `tsconfig.json`（reference 1 行）、
`features/shell/ui/root.route.tsx`（`beforeLoad` と `AppShell` への actor 受け渡し）、`features/shell/ui/settings.route.tsx`（削除）、
`features/shell/ui/nav-items.ts`（文言のみ）、`e2e/tests/a11y.spec.ts`（`/sign-in` を追加）、`plans/README.md`

**Out of scope**: `docs/**`、`features/{sync,documents,editor,formats}/**`、`apps/sync/**`、`.oxlintrc.json`

## Git workflow

- Branch: `feat/auth`
- Commits: `feat(auth): port actor contract and share policy`, `feat(auth): add better-auth server with anonymous and google`,
  `feat(auth): add sign-in and account settings screens`, `feat(auth): promote guest on google link`

## Steps

### Step 1: contract / core を移植

`features/auth/{contract,core}` を qrcc からコピーし `@qrcc` → `@noter`。`share-policy.ts` は
**noter の規則に書き換える**（ADR-0010 / 0011）:

```ts
/** ゲスト owner が発行できる共有リンクの role。editor リンクは Google 連携後のみ */
export const allowedShareRoles = (actor: Actor): readonly ShareRole[] =>
  actor.kind === 'user' ? ['viewer', 'editor'] : actor.kind === 'guest' ? ['viewer'] : []
```

`ShareRole = Exclude<Role, 'owner'>` は `@noter/contract` の `Role` から派生させる。
`promote-account.ts` は `docs/adr/0010` の「移譲は `document.owner_id` と `document_member.user_id`」を
**plan 004 が足せるよう** `transfer: (from: UserId, to: UserId) => Promise<Result<void, …>>` を deps で受け取り、
この plan では `container.ts` で no-op を渡す。`promoted_from` の書き込みはこの plan で行う。

**Verify**: `bun test features/auth/contract features/auth/core` → pass。

### Step 2: server

qrcc `features/auth/server/*` を移植。`auth-options.ts` の `baseURL` は `env.APP_ORIGIN`、`basePath: '/api/auth'`、
`trustedOrigins: [env.APP_ORIGIN]`、anonymous の `emailDomainName: 'guest.noter.invalid'`、
`onLinkAccount` で `promoteAccount`。Google は `env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET` があるときだけ
`socialProviders.google` を入れ、`isGoogleConfigured(env)` を export（UI と共有）。

`features/auth/server/schema.ts`（Drizzle）は `0001_auth.sql` と一致させる。`drizzle-kit` は使わず SQL を手書きする
（qrcc と同じ）。

`apps/web/src/server/container.ts`: `makeContainer(env)` → `{ auth, currentActor }`。qrcc の形をそのまま。

`features/auth/ui/api.route.ts`（`/api/auth/$`）: qrcc と同じく server route で `auth.handler(request)`。

**Verify**: `bun run --filter '@noter/web' db:local` → `0001_auth.sql` が適用される（`wrangler d1 migrations list noter --local` で確認）。
`bun run dev` 起動後 `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:5173/api/auth/sign-in/anonymous` → `200`、
`Set-Cookie` に `better-auth.session_token` と `HttpOnly; SameSite=Lax` が含まれる（`curl -si … | grep -i set-cookie`）。

### Step 3: UI

- `features/auth/ui/sign-in.route.tsx` + `sign-in-screen.tsx`: `docs/design/ux.md` §4.5。
  「Google でログイン」`<button>`（`isGoogleConfigured` が false なら描画せず、
  「この環境では Google ログインを利用できません。ゲストのまま続けられます。」の `<p>`）、
  「ゲストのまま続ける」`<button>`（anonymous sign-in → `/` へ）。ゲストからの Google ログインは
  「文書はそのまま引き継がれます」と明記。
- `features/auth/ui/settings.route.tsx` + `account-settings-screen.tsx`: 表示名（`<input maxLength={32}>`、
  `MAX_DISPLAY_NAME`）、Google 連携状態、ゲストなら連携ボタン、サインアウト。**アカウント削除は v1 でボタンのみ無効**にせず
  **置かない**（`ux.md` §3 に「削除」とあるが、文書の扱いが plan 004 に依存するため。`docs/design/ux.md` へのメモは advisor が行う）。
- `features/auth/ui/auth.css`: `--noter-` トークンのみ使う。
- `features/shell/ui/root.route.tsx`: `beforeLoad` で `currentActor` server function を呼び `context.actor` に。
  `AppShell` に `actor` を渡し、ヘッダ右に「ゲスト」/表示名 + `/settings/account` リンクを出す
  （qrcc の `app-shell.tsx` の対応部分を参考に）。
- `apps/web/src/routes.ts`: `route('/sign-in', 'auth/ui/sign-in.route.tsx')`、`/settings/account` を `auth/ui/settings.route.tsx` に、
  `route('/api/auth/$', 'auth/ui/api.route.ts')`。
- `apps/web/src/styles/app.css`: `@import '@noter/auth/ui/auth.css' layer(components);`
- `e2e/tests/a11y.spec.ts`: `/sign-in` を対象に追加。

**Verify**: `bun run check && bun run test && bun run a11y` → exit 0。ブラウザ手動: `/sign-in` → ゲストで続ける → ヘッダに「ゲスト」。

### Step 4: 昇格の冪等性

`features/auth/core/promote-account.test.ts` に「`promoted_from` が既に立っていれば transfer を呼ばない」
「同じ from/to で 2 回呼んでも transfer は 1 回」を追加。

**Verify**: `bun test features/auth` → pass。

## Test plan

- `share-policy.test.ts`: visitor `[]`、guest `['viewer']`、user `['viewer','editor']`
- `promote-account.test.ts`: 冪等性
- `current-actor.test.ts`: セッション無し → visitor、anonymous → guest、それ以外 → user（qrcc のテストを流用）
- `sign-in-screen.test.tsx`: Google 未設定で Google ボタンが無く説明文がある
- a11y: `/sign-in` 違反 0

## Done criteria

- [ ] `bun run check` / `bun run test` / `bun run a11y` exit 0
- [ ] `grep -rn 'cookieCache' features/auth` → なし
- [ ] `apps/web/migrations/0001_auth.sql` に `promoted_from` がある
- [ ] `curl` で anonymous sign-in が 200 かつ `HttpOnly; SameSite=Lax`
- [ ] `git diff --name-only` が Scope 内のみ

## STOP conditions

- `better-auth 1.7.3` / `@better-auth/drizzle-adapter` が `bun install` で解決できない、または anonymous plugin の API が qrcc 1.7.2 と違う
- TanStack Start の server route（`/api/auth/$`）が `apps/web/src/server.ts`（plan 002 のカスタム entry）と共存できない
- D1 ローカルで `0001_auth.sql` が失敗する

## Maintenance notes

- `promoteAccount` の `transfer` は plan 004 が本物（document / document_member の移譲）に差し替える
- `allowedShareRoles` は plan 004 の共有ダイアログとリンク発行 server function の両方が使う
- `isGoogleConfigured` は server / ui の両方から参照される。`features/auth/ui/auth-env.ts` の形（qrcc）を守る
