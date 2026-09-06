# Plan 001: Bun monorepo の足場・ツールチェーン・`@noter/contract`・`@noter/ui`・シェルを立ち上げる

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b110c53..HEAD -- package.json apps shared features tools scripts e2e .github .oxlintrc.json lefthook.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `b110c53`, 2026-09-06

## Why this matters

noter リポジトリにはまだ設計文書とスキルしか無い。この plan で
**qrcc（同じマシンの `/Users/riml/orca/projects/qrcc2`）の足場を TypeScript
のみの構成に移植**し、`bun run check` / `bun run test` / `bun run build` /
`bun run dev` が通る状態を作る。以降の全 plan（同期 DO・認証・文書・エディタ）
はこの足場の上に載る。ここで規約（`.oxlintrc.json` の `noter/*` ルール、
lefthook、CI の `guard`）を機械的に効かせておくことが、後続の executor の
品質を決める。

## Current state

- リポジトリ: `/Users/riml/orca/projects/noter`（git、`main`、コミット `84bcc81`）。
  存在するのは `CLAUDE.md` / `DESIGN.md` / `README.md` / `docs/**` / `.agents/skills/**` /
  `.claude/**` / `scripts/lanes.tsv` / `.gitignore` / `plans/**` のみ。**コードは無い**。
- 移植元: `/Users/riml/orca/projects/qrcc2`（読み取り専用。**絶対に書き込まない**）。
  qrcc2 には `apps/web/.dev.vars` などシークレットがある。**`.dev.vars` / `.env` は
  読まない・コピーしない**。
- 設計上の決定（この plan が従うもの）:
  - `docs/adr/0001-stack.md`: TS のみ。Rust / cargo / wasm を入れない
  - `docs/adr/0002-auxiliary-worker-and-private-durable-object.md`: `apps/sync` は
    auxiliary Worker。`routes` を書かず `workers_dev: false`
  - `docs/adr/0004-durable-object-class-exception.md`: `class` は
    `features/sync/worker/document-room.ts` のみ許可
  - `docs/adr/0006-typescript-7-and-oxc.md`: TS 7.0.2、oxlint 1.80.0、oxfmt 0.65.0、
    markuplint は `tools/markuplint` に TS 6.0.3 で隔離
  - `docs/adr/0007-feature-colocation.md`: `features/<name>/{contract,core,ui,server}`、
    ルートは `features/<name>/ui/<name>.route.tsx`、URL は `apps/web/src/routes.ts`
  - `docs/adr/0009-free-tier-d1-and-do-only.md`: `r2_buckets` / `kv_namespaces` を書かない。
    DO は `new_sqlite_classes`
  - `DESIGN.md` §トークン: CSS 変数の接頭辞は `--noter-`、テーマの保存キーは `noter-theme`、
    presence 色 `--noter-presence-0` 〜 `--noter-presence-7`（値は `DESIGN.md` の表）
  - `docs/domain-model.md` §識別子: `usr_` / `doc_` / `shr_` + Crockford base32 24 文字
  - `docs/domain-model.md` §上限: `MAX_DOCUMENT_BYTES = 1_048_576`, `MAX_TITLE_LENGTH = 120`,
    `MAX_DISPLAY_NAME = 32`, `MAX_WS_MESSAGE_BYTES = 262_144`, `MAX_MEMBERS = 50`,
    `MAX_DOCUMENTS_PER_USER = 200`, `SHARE_LINK_MAX_AGE_MS = 90 日`
  - `docs/architecture.md` §ルート: `/`, `/new`, `/d/:documentId`, `/d/:documentId/raw`,
    `/s/:token`, `/sign-in`, `/settings/account`, `/api/auth/*`, `/ws/:documentId`。
    **この plan で作るのは `/` と `/settings/account` だけ**（他は後続 plan）
- qrcc2 の足場のうち移植するもの（パスは qrcc2 基準）:
  - ルート: `package.json`, `bunfig.toml`, `mise.toml`, `tsconfig.base.json`, `tsconfig.json`,
    `.oxlintrc.json`, `.oxfmtrc.json`, `.markuplintrc.json`, `lefthook.yml`
  - `tools/oxlint-plugin-qrcc/index.js`（→ `tools/oxlint-plugin-noter/index.js`）、
    `tools/markuplint/package.json`
  - `scripts/wt.sh`, `scripts/smoke.ts`, `scripts/smoke.test.ts`, `scripts/smoke-cli.ts`
  - `shared/contract/src/{base32,base32.test,brand,result,result.test,text,text.test}.ts`,
    `shared/contract/{package.json,tsconfig.json}`
  - `shared/ui/**`（全部）
  - `features/shell/ui/{app-shell,breadcrumbs,global-nav,link-renderer,router-link,root-document,settings-screen}.tsx|ts`
    とそのテスト、`features/shell/ui/css.d.ts`, `shell.css`
  - `apps/web/{vite.config.ts,tsr.config.json,tsconfig.json}`, `apps/web/src/{router.tsx,routes.ts}`,
    `apps/web/src/styles/app.css`
  - `e2e/{package.json,tsconfig.json,playwright.config.ts}`, `e2e/tests/a11y.spec.ts`
  - `.github/workflows/ci.yml`
- qrcc2 の `package.json` (root) の要点:

```json
"workspaces": ["apps/*", "features/*", "shared/*", "e2e"],
"scripts": {
  "dev": "bun run --filter '@qrcc/web' dev",
  "test": "bun test shared/ features/ apps/ scripts/",
  "typecheck": "bun run --filter '@qrcc/wasm' build:types && bun run --filter '@qrcc/web' gen && tsc --build && tsc -p apps/web --noEmit",
  "lint": "oxlint --type-aware",
  "fmt": "oxfmt .", "fmt:check": "oxfmt --check .",
  "lint:html": "node tools/markuplint/node_modules/markuplint/bin/markuplint.mjs --config .markuplintrc.json 'features/**/ui/**/*.tsx' 'shared/ui/src/**/*.tsx'",
  "check": "bun run fmt:check && bun run lint && bun run typecheck && bun run lint:html && bun run rust:fmt:check && bun run rust:lint",
  "postinstall": "bun install --cwd tools/markuplint --frozen-lockfile || bun install --cwd tools/markuplint",
  ...
},
"devDependencies": { "@types/bun": "1.4.0", "lefthook": "2.1.12", "oxfmt": "0.65.0", "oxlint": "1.80.0", "oxlint-tsgolint": "7.0.2001", "typescript": "7.0.2", "wrangler": "4.127.1" }
```

- qrcc2 `apps/web/wrangler.jsonc` の要点（`services` と D1 が noter では変わる）:

```jsonc
"name": "qrcc-web", "main": "@tanstack/react-start/server-entry",
"compatibility_date": "2026-08-31", "compatibility_flags": ["nodejs_compat"],
"observability": { "enabled": true }, "workers_dev": false,
"routes": [{ "pattern": "qrcc.riml4i.com", "custom_domain": true }],
"services": [{ "binding": "API", "service": "qrcc-api" }],
"d1_databases": [{ "binding": "DB", "database_name": "qrcc", "database_id": "…", "migrations_dir": "../api/migrations" }],
"vars": { "APP_ORIGIN": "https://qrcc.riml4i.com" }
```

- qrcc2 `apps/web/vite.config.ts` の要点: `cloudflare({ viteEnvironment: { name: 'ssr' }, auxiliaryWorkers: [{ configPath: '../api/wrangler.jsonc' }] })` → `tanstackStart({ router: { routesDirectory, virtualRouteConfig } })` → `viteReact()`、`build.rollupOptions.external: [/^cloudflare:/]`。
- qrcc2 `.oxlintrc.json` の要点: `"jsPlugins": ["./tools/oxlint-plugin-qrcc/index.js"]`、
  ルール `qrcc/no-class`, `qrcc/no-type-assertion`, `qrcc/no-enum`、override で
  `shared/contract/src/**/*.ts`, `shared/kernel/conformance/**/*.ts`, `features/*/contract/**/*.ts`,
  `features/*/core/**/*.ts` に `qrcc/no-throw-in-domain`。
- qrcc2 `features/shell/ui/root.route.tsx` は `@qrcc/auth` と service worker 登録に依存する。
  **noter では auth と SW を持たない簡略版を書く**（後続 plan 003 / 007 が足す）。
- qrcc2 `features/shell/ui/home.route.tsx` は generate/scan/wasm/webmcp に依存する。
  **noter では新規に書く**（プレースホルダのホーム画面）。

## Commands you will need

| Purpose      | Command                                                    | Expected on success                          |
| ------------ | ---------------------------------------------------------- | -------------------------------------------- |
| Toolchain    | `cd /Users/riml/orca/projects/noter && mise install`       | exit 0                                       |
| Install      | `bun install`                                              | exit 0、`bun.lock` 生成                      |
| Check        | `bun run check`                                            | exit 0                                       |
| Tests        | `bun run test`                                             | exit 0、全 pass                              |
| Build        | `bun run build`                                            | exit 0、`apps/web/dist/` 生成                |
| Dev smoke    | `bun run dev` を background で起動し `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/` | `200` |

## Suggested executor toolkit

- `.claude/skills/noter-typescript/SKILL.md` — `any` / `as` / `!` / `class` / `enum` 禁止、Result、関数 DI
- `.claude/skills/noter-html-a11y/SKILL.md` — シェルの UI を書くとき
- `.claude/skills/noter-architecture/SKILL.md` — どこに置くか
- `.claude/skills/workers-best-practices/` — wrangler.jsonc と DO 宣言

## Scope

**In scope** (the only paths you should create/modify; all under `/Users/riml/orca/projects/noter`):

- `package.json`, `bunfig.toml`, `mise.toml`, `tsconfig.base.json`, `tsconfig.json`,
  `.oxlintrc.json`, `.oxfmtrc.json`, `.markuplintrc.json`, `lefthook.yml`, `bun.lock`
- `tools/oxlint-plugin-noter/index.js`, `tools/markuplint/package.json`
- `scripts/wt.sh`, `scripts/smoke.ts`, `scripts/smoke.test.ts`, `scripts/smoke-cli.ts`
- `shared/contract/**`, `shared/ui/**`
- `features/shell/**`
- `features/sync/worker/document-room.ts`, `features/sync/package.json`, `features/sync/tsconfig.json`（**スタブのみ**）
- `apps/web/**`, `apps/sync/**`
- `e2e/**`
- `.github/workflows/ci.yml`
- `.dev.vars.example`（ルート。キー名のみ、値は空）
- `plans/README.md`（status 行のみ）

**Out of scope** (do NOT touch):

- `/Users/riml/orca/projects/qrcc2/**` — 移植元。読むだけ。**書かない・`git` 操作しない**
- `docs/**`, `CLAUDE.md`, `DESIGN.md`, `README.md`, `.agents/**`, `.claude/**` — 設計文書。変更が必要だと思ったら STOP
- `features/{auth,documents,editor,formats}/**`, `shared/webmcp/**` — 後続 plan
- `.github/workflows/deploy.yml` — plan 007
- qrcc2 の `apps/web/.dev.vars`、`.env` 系 — **読まない**

## Git workflow

- Branch: `feat/scaffold`（`main` から）
- Conventional Commits（lefthook の `commit-msg` が検証する）。ステップごとにコミット:
  `chore(tooling): port root toolchain from qrcc`, `feat(contract): add ids, kinds, roles and limits`,
  `feat(ui): port design system with noter tokens`, `feat(shell): add app shell and placeholder home`,
  `chore(web): wire vite, wrangler and virtual routes`, `chore(sync): add auxiliary worker stub`,
  `ci: add guard and check jobs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: ルートのツールチェーンを移植する

qrcc2 から次をコピーし、書き換える。コピーは `cp`、置換は `sed -i ''`（macOS）でよい。

1. `mise.toml`: qrcc2 のものをコピーし、**`rust = …` の行を削除**。コメントの `qrcc2` → `noter`。
2. `bunfig.toml`: そのままコピー。コメントの `@qrcc/ui` → `@noter/ui`。
3. `tsconfig.base.json`: そのままコピー。
4. `tsconfig.json`: 次の内容で新規作成（後続 plan が references を足す）。

```json
{
  "files": [],
  "references": [
    { "path": "./shared/contract" },
    { "path": "./shared/ui" },
    { "path": "./features/shell" },
    { "path": "./features/sync" }
  ]
}
```

5. `.oxfmtrc.json`: そのままコピー。`ignorePatterns` から `**/target/**` を消す。
6. `.markuplintrc.json`: そのままコピー（変更なし）。
7. `tools/oxlint-plugin-noter/index.js`: qrcc2 `tools/oxlint-plugin-qrcc/index.js` をコピーし、
   `qrcc` → `noter`（コメント・`meta: { name: 'noter' }` を含む全箇所）。
8. `tools/markuplint/package.json`: コピーし `@qrcc/markuplint-runner` → `@noter/markuplint-runner`。
   `lint:html` スクリプトのグロブは使っていない（ルートの `lint:html` が本体）ので変更不要。
9. `.oxlintrc.json`: コピーし、
   - `"jsPlugins": ["./tools/oxlint-plugin-noter/index.js"]`
   - ルール名 `qrcc/` → `noter/`（4 箇所 + overrides 内）
   - `no-throw-in-domain` の override の `files` を
     `["shared/contract/src/**/*.ts", "features/*/contract/**/*.ts", "features/*/core/**/*.ts"]` にする（`shared/kernel/...` を消す）
   - **override を 1 つ追加**（ADR-0004）:
     ```json
     { "files": ["features/sync/worker/document-room.ts"], "rules": { "noter/no-class": "off" } }
     ```
   - `ignorePatterns` から `**/target/**` を消す
10. `lefthook.yml`: コピーし、`cargo-fmt` と `cargo-clippy` の 2 ジョブを削除。他はそのまま。
11. `package.json`（ルート）: qrcc2 のものを元に次のように書く。

```json
{
  "name": "noter",
  "private": true,
  "workspaces": ["apps/*", "features/*", "shared/*", "e2e"],
  "type": "module",
  "scripts": {
    "dev": "bun run --filter '@noter/web' dev",
    "build": "bun run --filter '@noter/web' build",
    "test": "bun test shared/ features/ apps/ scripts/",
    "typecheck": "bun run --filter '@noter/web' gen && tsc --build && tsc -p apps/web --noEmit",
    "lint": "oxlint --type-aware",
    "lint:fix": "oxlint --type-aware --fix",
    "fmt": "oxfmt .",
    "fmt:check": "oxfmt --check .",
    "lint:html": "node tools/markuplint/node_modules/markuplint/bin/markuplint.mjs --config .markuplintrc.json 'features/**/ui/**/*.tsx' 'shared/ui/src/**/*.tsx'",
    "a11y": "bun run --filter '@noter/e2e' a11y",
    "check": "bun run fmt:check && bun run lint && bun run typecheck && bun run lint:html",
    "wt": "./scripts/wt.sh",
    "prepare": "lefthook install",
    "postinstall": "bun install --cwd tools/markuplint --frozen-lockfile || bun install --cwd tools/markuplint",
    "e2e": "bun run --filter '@noter/e2e' test",
    "smoke": "bun run scripts/smoke-cli.ts",
    "smoke:browser": "bun run --filter '@noter/e2e' smoke",
    "test:all": "bun run test && bun run e2e",
    "clean": "find . -maxdepth 3 -name node_modules -type d -prune -exec rm -rf {} + && bun install"
  },
  "devDependencies": {
    "@types/bun": "1.4.0",
    "lefthook": "2.1.12",
    "oxfmt": "0.65.0",
    "oxlint": "1.80.0",
    "oxlint-tsgolint": "7.0.2001",
    "typescript": "7.0.2",
    "wrangler": "4.127.1"
  },
  "engines": { "bun": ">=1.4.0", "node": ">=26" },
  "packageManager": "bun@1.4.0"
}
```

12. `scripts/wt.sh`: コピーし、`qrcc-` → `noter-`、`cargo fetch` の行（`[ -f "$ROOT/Cargo.toml" ] && …`）と
    `Cargo.lock -> cargo update -w …` の行を削除。
13. `scripts/smoke.ts`, `scripts/smoke.test.ts`, `scripts/smoke-cli.ts`: コピーし、
    `https://qrcc.riml4i.com/` → `https://noter.riml4i.com/`、`qrcc-smoke` → `noter-smoke`。
14. `.dev.vars.example`（ルート）を作る。値は空:

```
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

**Verify**: `cd /Users/riml/orca/projects/noter && mise install && grep -c 'rust' mise.toml` → `0`（exit 1 でよい）。
`grep -c 'qrcc' .oxlintrc.json lefthook.yml tools/oxlint-plugin-noter/index.js package.json` → 各 `0`。
`grep -n 'document-room' .oxlintrc.json` → 1 行ヒット。

### Step 2: `@noter/contract` を作る

`shared/contract/package.json`（`@qrcc/contract` → `@noter/contract`、`exports: { ".": "./src/index.ts" }`）と
`shared/contract/tsconfig.json`（qrcc2 のものをコピー）を置き、qrcc2 から
`base32.ts`, `base32.test.ts`, `brand.ts`, `result.ts`, `result.test.ts`, `text.ts`, `text.test.ts` を
`shared/contract/src/` にコピーする（コメントの `@qrcc/` → `@noter/`）。`rpc.ts` / `rpc.test.ts` は**コピーしない**。

新規に書くファイル（**`throw` 禁止、`as` 禁止**。qrcc2 の `id.ts` の書き方を踏襲）:

- `shared/contract/src/id.ts`: `UserId`(`usr`) / `DocumentId`(`doc`) / `ShareToken`(`shr`) の
  `Brand` 型、`parseUserId` / `parseDocumentId` / `parseShareToken`、`newUserId` / `newDocumentId` /
  `newShareToken`（`RandomBytes` を引数に取る）、`IdParseError`。**3 つとも「prefix_ + Crockford base32 24 文字」**
  （qrcc2 の `ShareToken` は 32 文字・prefix 無しだが、noter は `docs/domain-model.md` に従い `shr_` + 24 文字）。
  `SpecHash` / `CodeId` / `FolderId` は作らない。
- `shared/contract/src/document-kind.ts`:
  ```ts
  export const DOCUMENT_KINDS = ['markdown', 'yaml', 'toml', 'json'] as const
  export type DocumentKind = (typeof DOCUMENT_KINDS)[number]
  export const parseDocumentKind: (value: string) => Result<DocumentKind, DocumentKindParseError>
  export const FILE_EXTENSION: { readonly [K in DocumentKind]: string }  // md / yaml / toml / json
  export const MIME_TYPE: { readonly [K in DocumentKind]: string }       // text/markdown, application/yaml, application/toml, application/json
  ```
- `shared/contract/src/role.ts`:
  ```ts
  export const ROLES = ['owner', 'editor', 'viewer'] as const
  export type Role = (typeof ROLES)[number]
  export const parseRole: (value: string) => Result<Role, RoleParseError>
  /** 高い方を返す。共有リンクの upsert で既存ロールを下げないために使う */
  export const higherRole: (a: Role, b: Role) => Role   // owner > editor > viewer
  ```
- `shared/contract/src/limits.ts`: 上記「Current state」の値を `export const` で。全て `number`（ミリ秒は `_MS` 接尾辞）。
- `shared/contract/src/index.ts`: 上記を全て re-export（qrcc2 の `index.ts` の書き方に合わせる）。

テスト: `id.test.ts`（qrcc2 を元に 3 種へ）、`document-kind.test.ts`（4 種の parse 成功、`'csv'` の失敗、
`FILE_EXTENSION` の網羅）、`role.test.ts`（parse、`higherRole` の 6 通り）。

**Verify**: `bun install && bun test shared/contract` → 全 pass。`bunx oxlint --type-aware shared/contract` → 0 errors。

### Step 3: `@noter/ui` を移植する

qrcc2 `shared/ui/**`（`dist/` と `tsconfig.tsbuildinfo` を除く）を `shared/ui/` にコピーし、

- `package.json`: `@qrcc/ui` → `@noter/ui`、依存 `@qrcc/contract` → `@noter/contract`
- 全ファイルで `--qrcc-` → `--noter-`、`.qrcc-` → `.noter-`、`qrcc-theme` → `noter-theme`、`@qrcc/` → `@noter/`
  （`grep -rl qrcc shared/ui | xargs sed -i '' …`）
- `src/styles/tokens.css`: `DESIGN.md` §トークンの表に合わせて値を確認し、**presence 色**
  `--noter-presence-0` 〜 `--noter-presence-7` と `--noter-on-presence`、
  `--noter-text-code`, `--noter-header-h`, `--noter-toolbar-h` をライト/ダーク両方に追加する。
  `DESIGN.md` に書かれた値をそのまま使う（推測しない）。
- `test-setup.ts` は `bunfig.toml` の `preload` が参照する。パスは `./shared/ui/test-setup.ts` のまま。

**Verify**: `bun test shared/ui` → 全 pass。`grep -rc 'qrcc' shared/ui/src | grep -v ':0'` → 出力なし。
`grep -c 'presence-7' shared/ui/src/styles/tokens.css` → `2` 以上。

### Step 4: `features/shell` を作る

`features/shell/package.json`:

```json
{
  "name": "@noter/shell", "version": "0.1.0", "private": true, "type": "module",
  "exports": { "./ui": "./ui/index.ts", "./ui/shell.css": "./ui/shell.css" },
  "scripts": { "build": "tsc --build", "test": "bun test" },
  "dependencies": { "@noter/contract": "workspace:*", "@noter/ui": "workspace:*" }
}
```

`features/shell/tsconfig.json`: qrcc2 のものをコピー（references は `shared/contract` と `shared/ui`）。

qrcc2 `features/shell/ui/` から `app-shell.tsx`, `app-shell.test.tsx`, `breadcrumbs.tsx`, `breadcrumbs.test.tsx`,
`global-nav.tsx`, `global-nav.test.tsx`, `link-renderer.ts`, `router-link.tsx`, `css.d.ts`, `shell.css`,
`settings-screen.tsx`, `settings-screen.test.tsx`, `settings.route.tsx`, `root-document.tsx`, `root-document.test.tsx`
をコピーし `@qrcc/` → `@noter/`、`qrcc` → `noter`（CSS クラス・文言）。

書き換え・新規:

- `ui/nav-items.ts`: 項目を `[{ to: '/', label: '文書一覧' }, { to: '/settings/account', label: 'アカウント設定' }]` に。
- `ui/root-document.tsx`: `<title>` を `noter — 共同編集ノート`、description を
  「markdown・yaml・toml・json を複数人で同時に編集できるノート。共有リンクを開くだけで参加できます。」に。
  `theme-color` の値は `DESIGN.md` の `--noter-surface` ライト/ダークの値にする。
  `manifest` / `apple-touch-icon` の `<link>` は**外す**（plan 007 で戻す）。`icon` は `/icon.svg` のまま残し、
  `apps/web/public/icon.svg` に簡単な SVG（丸 + "n"）を置く。
- `ui/root.route.tsx`: 認証と service worker を含まない版。

```tsx
import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { AppShell } from './app-shell.tsx'
import { RootDocument, documentHead } from './root-document.tsx'
import { routerLink } from './router-link.tsx'
import appCss from '../../../apps/web/src/styles/app.css?url'

const Shell = ({ children }: { readonly children: React.ReactNode }) => (
  <RootDocument><HeadContent />{children}<Scripts /></RootDocument>
)
const Layout = () => {
  const currentPath = useRouterState({ select: (state) => state.location.pathname })
  return <AppShell currentPath={currentPath} renderLink={routerLink} status={null}><Outlet /></AppShell>
}
export const Route = createRootRoute({ head: documentHead(appCss), shellComponent: Shell, component: Layout })
```

  （`AppShell` の `status` prop が必須なら `null` を許す型にする。qrcc2 の `app-shell.tsx` を見て合わせる。）
- `ui/home-screen.tsx` + `ui/home-screen.test.tsx`: `<h1>文書一覧</h1>` と
  「まだ文書がありません。」の `<p>`、`renderLink` で `/new` への「新しい文書を作る」リンクを出すだけの
  プレースホルダ。テストは見出しとリンクの存在。
- `ui/home.route.tsx`: `createFileRoute('/')({ component: () => <HomeScreen renderLink={…} /> })`。
- `ui/settings.route.tsx`: パスを `/settings/account` に（`createFileRoute('/settings/account')`）。
- `ui/index.ts`: qrcc2 と同じ形で export。

**Verify**: `bun test features/shell` → 全 pass。`bunx oxlint --type-aware features/shell` → 0 errors。

### Step 5: `apps/web` を配線する

- `apps/web/package.json`: qrcc2 を元に `@qrcc/*` を消し、`@noter/contract`, `@noter/shell`, `@noter/ui`
  のみ依存に。`@tanstack/react-router 1.170.32`, `@tanstack/react-start 1.168.49`, `react 19.2.8`,
  `react-dom 19.2.8`; devDependencies は `@cloudflare/vite-plugin 1.54.4`, `@tanstack/router-cli 1.167.33`,
  `@tanstack/virtual-file-routes 1.162.0`, `@types/react 19.2.7`, `@types/react-dom 19.2.4`,
  `@vitejs/plugin-react 6.1.1`, `vite 8.2.2`, `wrangler 4.127.1`。**`@vitejs/plugin-rsc` は入れない**。
  scripts は qrcc2 と同じ。`db:local` は `wrangler d1 migrations apply noter --local`。
- `apps/web/tsr.config.json`: そのままコピー。
- `apps/web/tsconfig.json`: コピーし references を `shared/contract`, `shared/ui`, `features/shell` に。
- `apps/web/vite.config.ts`: コピーし `auxiliaryWorkers: [{ configPath: '../sync/wrangler.jsonc' }]`、コメントの Rust 言及を書き換える。
- `apps/web/wrangler.jsonc`:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "noter-web",
  "main": "@tanstack/react-start/server-entry",
  "compatibility_date": "2026-08-31",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "workers_dev": false,
  "routes": [{ "pattern": "noter.riml4i.com", "custom_domain": true }],
  // DocumentRoom は noter-sync（auxiliary Worker）が持つ。routes を持たないので web からしか届かない（ADR-0002）
  "durable_objects": {
    "bindings": [{ "name": "DOCUMENT_ROOM", "class_name": "DocumentRoom", "script_name": "noter-sync" }]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "noter", "database_id": "REPLACE_ME", "migrations_dir": "./migrations" }
  ],
  "vars": { "APP_ORIGIN": "https://noter.riml4i.com" },
  // BETTER_AUTH_SECRET / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET は wrangler secret put で設定する
}
```

  `apps/web/migrations/` は空ディレクトリだと git に入らないので `apps/web/migrations/.gitkeep` を置く。
- `apps/web/src/routes.ts`:

```ts
import { index, rootRoute, route } from '@tanstack/virtual-file-routes'
export const routes = rootRoute('shell/ui/root.route.tsx', [
  index('shell/ui/home.route.tsx'),
  route('/settings/account', 'shell/ui/settings.route.tsx'),
])
```

- `apps/web/src/router.tsx`: そのままコピー。
- `apps/web/src/styles/app.css`: `@import '@noter/ui/styles.css'; @import '@noter/shell/ui/shell.css' layer(components);` の 2 行 + qrcc2 のコメント。
- `apps/web/src/server/container.ts`: qrcc2 のものをコピー（`Record<never, never>` のプレースホルダ）。
- `apps/web/public/icon.svg`: Step 4 のとおり。

**Verify**: `bun install && bun run --filter '@noter/web' gen` → exit 0、`apps/web/src/routeTree.gen.ts` と
`apps/web/src/worker-configuration.d.ts` が生成される。

### Step 6: `apps/sync` と DO のスタブを置く

- `features/sync/package.json`:

```json
{
  "name": "@noter/sync", "version": "0.1.0", "private": true, "type": "module",
  "exports": { "./worker": "./worker/index.ts" },
  "scripts": { "build": "tsc --build", "test": "bun test" },
  "dependencies": { "@noter/contract": "workspace:*" }
}
```

- `features/sync/tsconfig.json`: `features/shell` のものを元に `include: ["contract/**/*", "core/**/*", "worker/**/*", "client/**/*"]`、
  `lib: ["es2024"]`、`types: ["bun", "./worker-configuration"]` は使わず、代わりに
  `apps/sync/src/worker-configuration.d.ts`（`wrangler types` 生成物）を `include` に足す方法は
  複雑なので、**この plan では `worker/` を `apps/sync` の tsconfig に含めて型検査する**
  （qrcc2 が `*.route.tsx` を apps/web 側で検査するのと同じ分担）。
  `features/sync/tsconfig.json` の `include` は `["contract/**/*", "core/**/*", "client/**/*"]`、
  `exclude` に `worker` を足す。
- `features/sync/worker/document-room.ts`（**唯一 `class` を許すファイル**）:

```ts
import { DurableObject } from 'cloudflare:workers'

/** plan 002 で features/sync/core の makeRoom に委譲する。今は 501 を返すだけ。 */
export class DocumentRoom extends DurableObject<CloudflareEnv> {
  fetch(): Response {
    return new Response('not implemented', { status: 501 })
  }
}
```

- `features/sync/worker/index.ts`: `export { DocumentRoom } from './document-room.ts'`
- `apps/sync/package.json`: `@noter/sync-worker`、依存 `@noter/sync: workspace:*`、devDependencies `wrangler 4.127.1`、
  scripts `{ "gen": "wrangler types --env-interface CloudflareEnv ./src/worker-configuration.d.ts", "typecheck": "bun run gen && tsc -p . --noEmit" }`。
- `apps/sync/tsconfig.json`: `tsconfig.base.json` を extends、`lib: ["es2024"]`, `types: ["bun"]`, `composite: false`,
  `emitDeclarationOnly: false`, `noEmit: true`、`include: ["src/**/*", "../../features/sync/worker/**/*"]`、
  references `../../shared/contract`, `../../features/sync`。
- `apps/sync/src/index.ts`:

```ts
export { DocumentRoom } from '@noter/sync/worker'
// routes も workers_dev も持たない。DO binding 越しにしか到達できない（ADR-0002）
export default { fetch: (): Response => new Response('not found', { status: 404 }) }
```

  （`import/no-default-export` は `apps/sync/src/index.ts` に対して `.oxlintrc.json` の overrides に
  `{ "files": ["apps/sync/src/index.ts"], "rules": { "import/no-default-export": "off" } }` を足して許可する。）
- `apps/sync/wrangler.jsonc`:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "noter-sync",
  "main": "./src/index.ts",
  "compatibility_date": "2026-08-31",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  // routes を書かない。workers_dev も false。DO は noter-web の binding からのみ届く（ADR-0002）
  "workers_dev": false,
  "durable_objects": { "bindings": [{ "name": "DOCUMENT_ROOM", "class_name": "DocumentRoom" }] },
  // Free プランでは new_sqlite_classes のみ使える（new_classes は Paid 限定、ADR-0009）
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["DocumentRoom"] }],
  "d1_databases": [
    { "binding": "DB", "database_name": "noter", "database_id": "REPLACE_ME" }
  ]
}
```

- ルート `package.json` の `typecheck` に `bun run --filter '@noter/sync-worker' typecheck &&` を `tsc --build` の前に足す。

**Verify**: `bun install && bun run typecheck` → exit 0。`bun run build` → exit 0 で `apps/web/dist/` に
`noter_sync`（または同名の auxiliary 出力）と `client/` が生成される。
`grep -nE '"routes"|"workers_dev": true' apps/sync/wrangler.jsonc` → ヒットなし。

### Step 7: e2e と a11y

- `e2e/package.json`: qrcc2 をコピーし `@qrcc/e2e` → `@noter/e2e`。
- `e2e/tsconfig.json`: コピー。
- `e2e/playwright.config.ts`: コピーし `@qrcc/web` → `@noter/web`。`db:local` の行は D1 マイグレーションが
  無い間も `wrangler d1 migrations apply noter --local` は exit 0 なので残してよい。
- `e2e/tests/a11y.spec.ts`: qrcc2 をコピーし、対象 URL を `['/', '/settings/account']` の 2 つに絞る。
  axe のタグ（`wcag2a`, `wcag2aa`, `wcag2aaa`, `wcag21aa`, `wcag22aa`, `best-practice`）はそのまま。
- `e2e/playwright.prod.config.ts` と `e2e/smoke/production.spec.ts` は plan 007 で（今回はコピーしない）。

**Verify**: `bun run --filter '@noter/e2e' install-browsers && bun run a11y` → 全 pass（2 画面 × 違反 0）。

### Step 8: CI

`.github/workflows/ci.yml` を qrcc2 から移植し:

- `env.CARGO_TERM_COLOR`、`rust` フィルタ、`rust` ジョブ、`Swatinem/rust-cache`、`cargo install …`、
  wasm サイズ検査を**すべて削除**
- `guard` ジョブ:
  - 「qrcc-api は公開されていないこと」→ 対象を `apps/sync/wrangler.jsonc`、文言を `noter-sync` に
  - 「従量課金されるバインディング」→ 対象 `apps/web/wrangler.jsonc apps/sync/wrangler.jsonc`
  - 「engine crate …」→ **削除**し、代わりに 2 つ追加:
    ```bash
    # DO は SQLite backed のみ (ADR-0009)
    if grep -qE '"new_classes"' apps/sync/wrangler.jsonc; then echo "::error::use new_sqlite_classes (ADR-0009)"; exit 1; fi
    # class は DO の殻だけ (ADR-0004)
    hits=$(grep -rlE '^\s*(export\s+)?(abstract\s+)?class\s' --include='*.ts' --include='*.tsx' shared features apps scripts | grep -v 'features/sync/worker/document-room.ts' || true)
    if [ -n "$hits" ]; then echo "$hits"; echo "::error::class is only allowed in features/sync/worker/document-room.ts (ADR-0004)"; exit 1; fi
    ```
  - 「ドメイン層に I/O が漏れていないこと」「feature 同士が内部を直接 import していないこと」はそのまま（`@qrcc/` → `@noter/`）
- `build-and-a11y`: `bun run build` → `install-browsers` → `bun run a11y` のみ

**Verify**: `bunx --bun yaml-lint .github/workflows/ci.yml` が無ければ `python3 -c 'import yaml,sys;yaml.safe_load(open(".github/workflows/ci.yml"))'` → exit 0。
`grep -c cargo .github/workflows/ci.yml` → `0`。

### Step 9: 全体確認

`bun run check && bun run test && bun run build` → すべて exit 0。
`bun run dev` を background で起動 → `curl -s http://localhost:5173/ | grep -c '文書一覧'` → `1` 以上 →
`curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/settings/account` → `200` → dev を止める。

## Test plan

- `shared/contract/src/id.test.ts`（3 種の parse/new、不正 prefix、長さ違い、決定的 `RandomBytes` で再現性）
- `shared/contract/src/document-kind.test.ts`, `role.test.ts`（Step 2 のとおり）
- `shared/ui` と `features/shell` は移植したテストがそのまま通ること
- `features/shell/ui/home-screen.test.tsx`（見出し・リンク）
- `e2e/tests/a11y.spec.ts`（2 画面で axe 違反 0）
- 構造パターン: `shared/contract/src/result.test.ts`（`bun:test` の `describe/test/expect`）、
  `shared/ui/src/components/button.test.tsx`（`@testing-library/react`）

## Done criteria

- [ ] `bun run check` exits 0（fmt / lint / typecheck / markuplint）
- [ ] `bun run test` exits 0; `shared/contract` に id / document-kind / role のテストがある
- [ ] `bun run build` exits 0
- [ ] `bun run a11y` exits 0
- [ ] `grep -rn 'qrcc' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.jsonc' --include='*.css' --include='*.yml' --include='*.toml' --include='*.sh' . | grep -v node_modules | grep -v '^./plans/' | grep -v '^./docs/' | grep -v '^./.agents/' | grep -v '^./.claude/'` → 出力なし
- [ ] `grep -rln 'cargo\|rustc\|wasm-pack' --include='*.json' --include='*.yml' --include='*.toml' --include='*.sh' . | grep -v node_modules | grep -v '^./.agents' | grep -v '^./plans'` → 出力なし
- [ ] `grep -nE '"(routes|r2_buckets|kv_namespaces)"' apps/sync/wrangler.jsonc` → なし; `grep -c '"workers_dev": false' apps/sync/wrangler.jsonc` → 1
- [ ] `grep -c new_sqlite_classes apps/sync/wrangler.jsonc` → 1
- [ ] `git status --porcelain` に Scope 外のファイルが無い; `/Users/riml/orca/projects/qrcc2` で `git status --porcelain` が**この作業の前後で変わっていない**
- [ ] `plans/README.md` の 001 の行が DONE

## STOP conditions

- `/Users/riml/orca/projects/qrcc2` が読めない、または列挙したファイルが無い
- `mise install` で node 26.8.1 / bun 1.4.0 が入らない
- `@cloudflare/vite-plugin 1.54.4` の `auxiliaryWorkers` が `script_name` の DO binding をローカルで
  解決できず `bun run dev` が起動しない（エラー全文を報告。plan 002 で service binding に切り替える判断は advisor が行う）
- `wrangler types` が `DurableObject` の型を出さず `DocumentRoom extends DurableObject<CloudflareEnv>` が型エラーになる
- oxlint の override で `noter/no-class` を切っても `features/sync/worker/document-room.ts` がエラーになる
- markuplint（TS 6 隔離）が `postinstall` で入らない
- 設計文書（`docs/**`, `DESIGN.md`）と矛盾する値・名前が必要になった

## Maintenance notes

- `tsconfig.json`（ルート）と `apps/web/tsconfig.json` の references、`apps/web/src/routes.ts`、
  `apps/web/src/styles/app.css` は後続 plan が 1 行ずつ足す append-only ファイル
- `features/sync/worker/document-room.ts` はスタブ。plan 002 が中身を書く。**このファイル以外に `class` を書いてはならない**
- `apps/web/wrangler.jsonc` と `apps/sync/wrangler.jsonc` の `database_id: "REPLACE_ME"` は
  デプロイ時に人が書く（`docs/deployment.md`）。ローカル dev は `REPLACE_ME` のままで動く
- レビュー観点: `.oxlintrc.json` に `noter/*` 4 ルールと `no-class` の override があるか、
  `ci.yml` の `guard` に 5 つの検査（非公開・R2/KV・new_classes・class・I/O・相対 import）があるか
- 見送り: PWA manifest / service worker（plan 007）、deploy.yml（plan 007）、本番 smoke spec（plan 007）
