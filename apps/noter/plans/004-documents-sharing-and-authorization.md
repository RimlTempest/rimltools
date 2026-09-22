# Plan 004: 文書・メンバー・共有リンク（D1）と `/ws/` の本認可

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <plan-003 のマージコミット>..HEAD -- features/documents features/auth features/sync/contract apps/web shared/contract`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: 002, 003
- **Category**: direction
- **Planned at**: commit `b110c53`, 2026-09-06

## Why this matters

「誰が・どの文書に・どの権限で」を決める唯一の場所。これが入ると
plan 002 の開発フラグ（`NOTER_DEV_OPEN_WS`）を消して本番相当の認可経路になり、
ホームの一覧・新規作成・共有リンク・raw 出力が揃う。エディタ本体（plan 005）は
この上に載るだけになる。

## Current state

- 設計: `docs/domain-model.md`（用語・権限表・状態遷移・上限）、`docs/adr/0011-sharing-model.md`、
  `docs/design/ux.md` §3, §4.1, §4.3, §4.4, §6.1, §6.2、`docs/realtime-protocol.md` §1（認可の順序）§5（`/kick`）§6（`/snapshot`）。
- 権限表（`docs/domain-model.md`）を `features/documents/core/permission.ts` の `can(role, action)` に 1 枚で持つ:
  action = `read | edit | presence | rename | share | remove_member | delete | export_raw`。
  owner: 全部、editor: read/edit/presence/rename/export_raw、viewer: read/export_raw。
- 共有リンク: `share_link(token, document_id, role: viewer|editor, expires_at, revoked_at, created_by)`。
  `/s/:token` → セッション無ければゲスト発行 → `document_member` upsert（`higherRole` で下げない）→ `302 /d/:id`。
  失効・不明・期限切れは画面（「このリンクは無効です…」）。ゲスト owner は viewer リンクのみ（`allowedShareRoles`、plan 003）。
  既定期限 90 日（`SHARE_LINK_MAX_AGE_MS`）、無期限は owner の明示選択。
- 文書: `document(id, owner_id, kind, title, created_at, updated_at, deleted_at)`。soft delete → 一覧非表示・`/d/` 404・WS 4404。
  1 ユーザー `MAX_DOCUMENTS_PER_USER`(200)、メンバー `MAX_MEMBERS`(50)。
- plan 002 で作った `apps/web/src/server/ws-authorize.ts` は開発フラグで通すスタブ。**この plan で本物に置き換え、
  `NOTER_DEV_OPEN_WS` を全て削除する**（`.dev.vars.example`、`e2e/playwright.config.ts`、CI guard の検査は残してよい）。
- plan 003 の `promoteAccount` の `transfer` は no-op。**この plan で `document.owner_id` / `document_member.user_id` の移譲に置き換える**。
- plan 001 の `features/shell/ui/home-screen.tsx` はプレースホルダ。**ホームの本体は `features/documents/ui/home-screen.tsx`**
  に置き、`apps/web/src/routes.ts` の index を `documents/ui/home.route.tsx` に差し替える（shell のプレースホルダは削除）。
- `apps/web/src/server/container.ts` は plan 003 で `{ auth, currentActor }`。ここに `documents` リポジトリを足す。
- D1 の書き込みは無料枠の制約（`docs/free-tier-budget.md`）。**一覧の読み取りは 1 クエリ、作成は 2 行（document + member）**。

## Commands you will need

| Purpose | Command                                     | Expected  |
| ------- | ------------------------------------------- | --------- |
| Tests   | `bun test features/documents features/auth` | pass      |
| Migrate | `bun run --filter '@noter/web' db:local`    | 0002 適用 |
| Check   | `bun run check`                             | exit 0    |
| e2e     | `bun run e2e`                               | pass      |

## Suggested executor toolkit

- `.claude/skills/noter-typescript`, `noter-tdd`, `noter-html-a11y`, `noter-architecture`
- `docs/domain-model.md`, `docs/adr/0011-*.md`, `docs/design/ux.md` §4.1 §4.3 §4.4
- qrcc の `features/codes/server/*`（D1 + Drizzle のリポジトリ・server function の書き方の手本。読むだけ）

## Scope

**In scope**: `features/documents/**`, `apps/web/migrations/0002_documents.sql`, `apps/web/src/server/{container,ws-authorize,ws-gate}.ts`,
`apps/web/src/routes.ts`（index 差し替え + `/new` `/d/$documentId` `/d/$documentId/raw` `/s/$token` 追加）,
`apps/web/src/styles/app.css`（1 行）, `apps/web/package.json`, `apps/web/tsconfig.json`, ルート `tsconfig.json`,
`features/auth/core/promote-account.ts` の deps 配線（`container.ts` 側のみ）, `features/shell/ui/home-screen*.tsx`（削除）,
`features/shell/ui/home.route.tsx`（削除）, `e2e/tests/{sync,share}.spec.ts`, `e2e/playwright.config.ts`, `.dev.vars.example`, `plans/README.md`

**Out of scope**: `docs/**`、`features/{editor,formats}/**`、`features/sync/{core,worker}/**`、`apps/sync/**`

## Git workflow

- Branch: `feat/documents`
- Commits: `feat(documents): add permission table and contracts`, `feat(documents): add d1 schema and repository`,
  `feat(documents): create, list, rename, delete server functions`, `feat(documents): share links and member join`,
  `feat(web): authorize websocket by membership`, `feat(documents): home list and share dialog`, `feat(auth): transfer documents on promotion`

## Steps

### Step 1: contract / core

- `features/documents/contract/src/`: `Document`, `DocumentMember`, `ShareLink` の型（`docs/domain-model.md`）、
  `DocumentSummary`（一覧用: id / title / kind / role / updatedAt）、`ShareRole`（`@noter/auth/contract` から）。
- `features/documents/core/permission.ts`: `ACTIONS`、`can(role: Role, action: Action): boolean` を Mapped Type の表 1 枚で。
  `roleForActor(document, member): Role | null`。
- `features/documents/core/share-link.ts`: `isShareLinkUsable(link, now): Result<void, 'revoked' | 'expired' | 'not_found'>`、
  `defaultExpiry(now) = now + SHARE_LINK_MAX_AGE_MS`。
- `features/documents/core/join.ts`: `resolveJoinedRole(existing: Role | null, linkRole: ShareRole): Role` = `existing ? higherRole(existing, linkRole) : linkRole`。
- `features/documents/core/title.ts`: `normalizeTitle(raw): Result<string, 'empty' | 'too_long'>`（trim、`MAX_TITLE_LENGTH`、既定「無題」は UI 側）。

テスト: `permission.test.ts`（表の全セル = 8 action × 3 role を `test.each`）、`share-link.test.ts`、`join.test.ts`（下げない）、`title.test.ts`。

**Verify**: `bun test features/documents` → pass。`grep -rn 'throw' features/documents/core features/documents/contract` → なし。

### Step 2: D1 スキーマ

`apps/web/migrations/0002_documents.sql`:

```sql
CREATE TABLE document (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id),
  kind TEXT NOT NULL CHECK (kind IN ('markdown','yaml','toml','json')),
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX document_owner_updated ON document(owner_id, updated_at DESC);
CREATE INDEX document_deleted_at ON document(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE TABLE document_member (
  document_id TEXT NOT NULL REFERENCES document(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX document_member_user ON document_member(user_id);
CREATE TABLE share_link (
  token TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES document(id),
  role TEXT NOT NULL CHECK (role IN ('editor','viewer')),
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX share_link_document ON share_link(document_id);
```

`features/documents/server/schema.ts` に Drizzle 定義を一致させる。`features/documents/server/repository.ts`:
`makeDocumentRepository(db)` → `create`, `findForActor(documentId, userId)`（document + member を 1 JOIN）, `listForUser(userId)`（member JOIN document、`deleted_at IS NULL`、`updated_at DESC`、上限 200）,
`rename`, `softDelete`, `upsertMember(documentId, userId, role)`（`ON CONFLICT DO UPDATE SET role = ?` は**上げる時だけ**: SQL で `CASE` か、読んでから `higherRole`）,
`removeMember`, `listMembers`, `createShareLink`, `findShareLink(token)`, `revokeShareLink`, `listShareLinks(documentId)`,
`transferOwnership(from, to)`（`UPDATE document SET owner_id`、`UPDATE document_member SET user_id`、既に to が member の行は `higherRole` で統合。1 `batch`）。

**Verify**: `bun run --filter '@noter/web' db:local` → 0002 適用。`bun run typecheck` → exit 0。

### Step 3: server functions と server routes

`features/documents/server/functions.ts`（TanStack `createServerFn`、qrcc の `features/codes/server` と同じ書き方）:

- `createDocument({ kind })`: visitor なら anonymous sign-in を先に行い（`auth.api.signInAnonymous` + Cookie を応答に載せる。qrcc の同等コードを参照）、
  上限 200 判定 → `newDocumentId(random)` → document + member(owner) → `redirect('/d/:id')`。タイトル既定は「無題」。
- `listDocuments()`: visitor は `[]`。
- `renameDocument({ id, title })`: `can(role,'rename')`。
- `deleteDocument({ id })`: `can(role,'delete')` → soft delete → `DOCUMENT_ROOM.getByName(id).fetch('https://do/kick', …)` は**しない**（削除後の接続は次回再接続で 4404。v1 はこれで十分）。
- `createShareLink({ id, role, expiresInDays: 7 | 30 | 90 | null })`: `can(role,'share')` かつ `allowedShareRoles(actor)` に `role` が含まれる。
- `revokeShareLink({ token })`、`listShareLinks({ id })`、`listMembers({ id })`
- `removeMember({ id, userId })`: `can(role,'remove_member')`、owner 自身は不可 → `removeMember` → `DOCUMENT_ROOM.getByName(id).fetch('https://do/kick', { method: 'POST', body: JSON.stringify({ actorId }) })`（失敗は無視）。
- `changeMemberRole({ id, userId, role: 'viewer' })`（「閲覧のみにする」）→ 更新後 `/kick`（再接続で新 role になる）。
- `leaveDocument({ id })`: member（owner 以外）が自分を外す。
- `getDocumentForEditor({ id })`: `{ document, role, members }` を返す（plan 005 のエディタ画面が使う）。deleted / 非 member は `notFound()`。

server routes（`features/documents/ui/*.route.ts`）:

- `/d/$documentId/raw`（GET）: 認可（`can(role,'export_raw')`）→ `DOCUMENT_ROOM.getByName(id).fetch('https://do/snapshot')` → `text/plain; charset=utf-8`、
  `Content-Disposition: inline; filename="<title>.<ext>"`（`FILE_EXTENSION`）。visitor は 401、非 member は 404。
- `/s/$token`（page、`beforeLoad` で処理）: `findShareLink` → `isShareLinkUsable` → visitor ならゲスト発行 → `upsertMember(resolveJoinedRole)` → `redirect('/d/:id')`。
  不正時はコンポーネントで「このリンクは無効です。作成者に新しいリンクを依頼してください」+ ホームへのリンク。

`apps/web/src/server/ws-authorize.ts` を本物に置き換える:

```ts
export const authorizeWs = async (request, env, documentId) => {
  const actor = await currentActor(request, env) // plan 003 の関数
  if (actor.kind === 'visitor') return err('unauthorized')
  const found = await repo.findForActor(documentId, actor.id)
  if (!found || found.document.deletedAt !== null || !can(found.role, 'read'))
    return err('not_found')
  return ok({ role: found.role, actorId: actor.id, name: actor.displayName })
}
```

`NOTER_DEV_OPEN_WS` を削除（`grep -rn NOTER_DEV_OPEN_WS . --exclude-dir=node_modules` が CI guard の行だけになる）。

**Verify**: `bun run check` → exit 0。`bun run dev` 起動後、Cookie 無しで `curl -s -o /dev/null -w '%{http_code}' -H 'Upgrade: websocket' http://localhost:5173/ws/doc_0000000000000000000000000` → `401`。

### Step 4: UI

- `features/documents/ui/home-screen.tsx` + `home.route.tsx`: `docs/design/ux.md` §4.1 のとおり。
  新規作成は種別 4 つの `<button>`（`<form>` + server function）。一覧は `<table>`（タイトルリンク / 種別バッジ / 権限 / `<time datetime>` + 絶対時刻 / 操作）。
  空状態文言。ゲスト向け注意（`localStorage` キー `noter-guest-notice-dismissed`、try/catch で読む）。
  visitor には説明文 + 4 ボタン + 「Google でログイン」リンク（`/sign-in`）。
- `features/documents/ui/share-dialog.tsx`: `docs/design/ux.md` §4.4 のとおり `<dialog>` + `showModal()`、`<fieldset><legend>権限</legend>` にラジオ、
  期限 `<select>`（7 / 30 / 90 日 / 無期限）、リンク一覧（`<output>` にコピー結果）、参加者一覧（「閲覧のみにする」「外す」+ Undo トースト 20 秒）。
  ゲスト owner にはラジオの「編集できる」を出さず説明文を出す。**plan 005 のエディタ画面が mount する**ので、この plan では
  `features/documents/ui/document.route.tsx` に**暫定のエディタ画面**（タイトル `<h1>`、種別、役割、共有ボタン + ダイアログ、
  「エディタは準備中です」）を置く。plan 005 が `features/editor/ui/editor.route.tsx` に置き換える。
- `features/documents/ui/documents.css`。
- `apps/web/src/routes.ts`: index を `documents/ui/home.route.tsx`、`route('/new', …)` は不要（server function で redirect するため。`ux.md` の `/new` は server function の呼称）。
  `route('/d/$documentId', 'documents/ui/document.route.tsx')`, `route('/d/$documentId/raw', 'documents/ui/raw.route.ts')`, `route('/s/$token', 'documents/ui/share-entry.route.tsx')`。
- `features/shell/ui/nav-items.ts`: 「新規作成」はホームのボタンで代替するので項目を足さない。

**Verify**: `bun run check && bun run test && bun run a11y`（`/` を visitor / guest 両方で検査するよう `a11y.spec.ts` を更新）。

### Step 5: 昇格時の移譲

`apps/web/src/server/container.ts` で `promoteAccount` の `transfer` に `repo.transferOwnership` を渡す。
`features/documents/server/repository.test.ts`（Miniflare 不要: Drizzle のクエリ生成のみ検証するか、`bun:sqlite` に同じ DDL を流してテスト）で
「to が既に viewer の文書で from が editor なら editor になる」を確認。

**Verify**: `bun test features/documents/server` → pass。

### Step 6: e2e

- `e2e/tests/share.spec.ts`: コンテキスト A がゲストで Markdown 文書を作成 → 共有（viewer）リンク作成 → コンテキスト B がリンクを開く → `/d/:id` に 302 → 「閲覧のみ」の表示。
  A がリンクを失効 → 新規コンテキスト C が開く → 「このリンクは無効です」。
- `e2e/tests/sync.spec.ts`: plan 002 の生 WS テストを「A が作成 → B が editor リンクで参加 → 両方の WS が 101」で書き直す（Cookie 付き `WebSocket` は `page.evaluate` で開く）。

**Verify**: `bun run e2e` → pass。

## Test plan

Step 1・5・6 のとおり。加えて `features/documents/ui/share-dialog.test.tsx`（ゲスト owner で「編集できる」が無い、`<dialog>` に `aria-labelledby`）。

## Done criteria

- [ ] `bun run check` / `bun run test` / `bun run a11y` / `bun run e2e` exit 0
- [ ] `grep -rn NOTER_DEV_OPEN_WS . --exclude-dir=node_modules --exclude-dir=plans` → `.github/workflows/ci.yml` の guard 行のみ
- [ ] `can` の表テストが 24 ケース全て通る
- [ ] Cookie 無しの `/ws/` Upgrade が 401、非 member が 404
- [ ] `features/shell/ui/home-screen.tsx` が削除され、`documents/ui/home.route.tsx` が index
- [ ] `git diff --name-only` が Scope 内のみ

## STOP conditions

- server function から `Set-Cookie` を返せない（visitor の作成フローでゲスト発行ができない）。qrcc の同等コードで解決方法を確認してから報告
- `ws-gate.ts` から `currentActor` を呼ぶと Better Auth が `Request` を消費して DO への転送ができない（`request.clone()` で解決しなければ STOP）
- D1 の `batch` が `transferOwnership` の 2 UPDATE を原子的にできない
- `docs/domain-model.md` の権限表と矛盾する要件が出た

## Maintenance notes

- 権限を足すときは `permission.ts` の表と `docs/domain-model.md` の表を同時に更新し、`permission.test.ts` の `test.each` が全セルを覆う
- 文書の purge（30 日後の物理削除 + DO `deleteAll`）は未実装（`docs/deployment.md` §未実装）。`document_deleted_at` インデックスはそのために張ってある
- `document.route.tsx` は plan 005 が置き換える暫定画面
