# Plan 007: WebMCP（読み取り・診断・提案）、PWA、Deploy ワークフローと本番 smoke

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <plan-006 のマージコミット>..HEAD -- shared/webmcp features/editor/ui features/shell/ui services/web/public .github scripts e2e`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED（デプロイ手順は本番に触る。**この plan の executor は `wrangler deploy` / `wrangler secret` を実行しない**。ワークフローを書くだけ）
- **Depends on**: 005, 006
- **Category**: direction
- **Planned at**: commit `b110c53`, 2026-09-06

## Why this matters

qrcc の「AI Native な部分」（WebMCP）を noter に合わせた形で移植し、
本番に出すための Deploy ワークフローと疎通確認を揃える。デプロイの実行は
人（operator）が `docs/deployment.md` に従って行う。

## Current state

- WebMCP: `docs/adr/0012-webmcp.md`（全文を読む）。ツールは `read-document` / `diagnose-document` / `list-documents` / `propose-edit`。
  Origin Trial トークンは登録しない。API が無ければ何もしない（テストで固定）。`exposedTo` 不使用。Worker を呼ばない。
  `propose-edit` は `features/editor/ui/proposal-panel.tsx` に差分プレビュー、ユーザーが「適用」を押すまで文書に触れない。
- 移植元: `/Users/riml/orca/projects/qrcc2/shared/webmcp/src/{index.ts,index.test.ts}`（`document.modelContext` の有無判定・`registerTool` の書き方・
  API 無しで no-op のテスト）。qrcc の `features/shell/ui/root.route.tsx` でクライアント側 `useEffect` から登録している箇所も参照。
- PWA: qrcc の `services/web/public/{manifest.webmanifest,sw.js,icon-192.png,icon-512.png,icon-maskable-512.png,apple-touch-icon.png}` と
  `features/shell/ui/register-sw.ts`、`root-document.tsx` の `<link rel="manifest">` / `apple-touch-icon`。**noter の SW は「アプリシェルのみキャッシュ、
  `/ws/` `/api/` `/d/` `/s/` はネットワーク直行」**。文書本文は Yjs がメモリ/再送で持つのでキャッシュしない。
- Deploy: qrcc `.github/workflows/deploy.yml`（上に転記済みの要点）: `jdx/mise-action@v3`、`bun install --frozen-lockfile`、build、
  D1 migrations `--remote`、**デプロイはビルドが生成した `services/web/dist/<aux>/wrangler.json` → `services/web/dist/server/wrangler.json` の順**
  （元の `wrangler.jsonc` を直接渡すと "entry-point file was not found"。auxiliary は entry に同梱されないので先に上げる）、
  `bun run smoke <origin>` → `install-browsers` → `bun run smoke:browser`。
- `docs/deployment.md` は「entry の 1 回で両方が上がる」と書いているが、**qrcc の実績では auxiliary を先に個別デプロイする必要がある**。
  advisor が docs を直す（executor は docs を触らない）。ワークフローは qrcc の実績に従う。
- plan 001 の `scripts/smoke.ts` は移植済み（`/ws/doc_…` → 426 の検査は**未実装**。この plan で足す）。
- `e2e/playwright.prod.config.ts` と `e2e/smoke/production.spec.ts` は未作成（qrcc から移植し内容を noter に変える）。
- `.claude/settings.json` の deny に `wrangler deploy` / `wrangler secret` がある。**executor が実行しようとしても拒否される。試みないこと。**

## Commands you will need

| Purpose       | Command                                                                         | Expected                                                                           |
| ------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Tests         | `bun test shared/webmcp features/editor`                                        | pass                                                                               |
| Build         | `bun run build`                                                                 | `services/web/dist/noter_sync/wrangler.json` と `dist/server/wrangler.json` がある |
| Smoke         | `bun run smoke http://localhost:5173/`（dev 起動中）                            | exit 0、`/ws/` 426 を含む                                                          |
| Browser smoke | `NOTER_SMOKE_URL=http://localhost:5173 bun run smoke:browser`                   | pass                                                                               |
| YAML          | `python3 -c 'import yaml;yaml.safe_load(open(".github/workflows/deploy.yml"))'` | exit 0                                                                             |

## Scope

**In scope**: `shared/webmcp/**`, `features/editor/ui/proposal-panel.tsx`(+test), `features/editor/ui/editor-screen.tsx`（`propose-edit` の口と WebMCP 登録）,
`features/shell/ui/{register-sw.ts,root-document.tsx,root.route.tsx}`, `services/web/public/**`, `scripts/smoke.ts`(+test), `e2e/playwright.prod.config.ts`,
`e2e/smoke/production.spec.ts`, `e2e/package.json`（`smoke` script）, `.github/workflows/deploy.yml`, ルート `package.json`（`smoke:browser` は既存）, `plans/README.md`

**Out of scope**: `docs/**`（deployment.md の修正は advisor）、`apps/*/wrangler.jsonc`、`features/{sync,documents,auth,formats}/**`、**本番環境への一切の操作**

## Git workflow

- Branch: `feat/webmcp`（WebMCP + proposal）と `chore/devops`（PWA・deploy・smoke）の 2 本に分けてもよい。1 本なら `feat/webmcp`
- Commits: `feat(webmcp): register read, diagnose, list and propose tools`, `feat(editor): proposal panel with diff preview`,
  `feat(shell): pwa manifest and app-shell service worker`, `ci: add deploy workflow with aux-first order`, `feat(smoke): check websocket route`

## Steps

### Step 1: WebMCP

`shared/webmcp/src/index.ts`: qrcc の形（`hasModelContext(): boolean`、`registerTools(deps)`）。deps は
`{ readDocument: () => { kind, text } | null; diagnose: () => readonly Diagnostic[]; listDocuments: () => readonly DocumentSummary[]; proposeEdit: (text: string) => void }`。
`features/editor/ui/editor-screen.tsx` の `useEffect` で登録・アンマウントで解除。`list-documents` はホームでロード済みの一覧を `sessionStorage`
（try/catch）に置いておき、それを返す（追加リクエストを出さない）。

テスト: `index.test.ts`（`document.modelContext` 無し → 何も登録しない、あり → 4 ツールが `registerTool` される、`propose-edit` は deps を呼ぶだけで `Y.Doc` を触らない）。

**Verify**: `bun test shared/webmcp` → pass。

### Step 2: proposal panel

`features/editor/ui/proposal-panel.tsx`: 提案テキストと現在本文の行 diff（`core/diff-lines.ts` に LCS ベースの純粋関数、依存追加なし）を
`<ins>` / `<del>` で表示。「適用」`<button>` で `ytext` を 1 トランザクションで置換、「破棄」で閉じる。`<dialog>` ではなく側面パネル（`<aside aria-label="編集の提案">`）。

**Verify**: `bun test features/editor` → pass（`diff-lines.test.ts`、`proposal-panel.test.tsx`：適用前に `onApply` が呼ばれない）。

### Step 3: PWA

- `services/web/public/manifest.webmanifest`: `name: "noter"`, `short_name: "noter"`, `start_url: "/"`, `display: "standalone"`,
  `theme_color` / `background_color` は `DESIGN.md` の `--noter-surface` ライト値を hex 近似、icons は plan 001 の `icon.svg` から
  生成した PNG（`bunx sharp-cli` 等が無ければ **SVG を `icons` に `type: image/svg+xml` で 1 つ**登録し、PNG は STOP せず省略して報告）。
- `services/web/public/sw.js`: qrcc の `sw.js` を元に、キャッシュ名 `noter-shell-v1`、プリキャッシュは `/icon.svg` のみ（**`/` は入れない** — サインイン中の一覧を含む HTML が共有端末に残る）、
  `fetch` は `GET` かつ `same-origin` かつ `mode !== 'navigate'` かつ `pathname` が `/_serverFn/` `/ws/` `/api/` `/d/` `/s/` で**始まらない**ときだけ stale-while-revalidate、それ以外は素通し
  （`/_serverFn/` は GET の server function があり、キャッシュすると一覧の失効反映が壊れる。実装時に e2e で発覚 — 事後修正済み）。
- `features/shell/ui/register-sw.ts`（qrcc から）、`root.route.tsx` で `useEffect` 登録、`root-document.tsx` に `manifest` / `apple-touch-icon` の `<link>` を戻す。

**Verify**: `bun run build` → `dist/client/sw.js` がある。`bun run a11y` → pass。

### Step 4: smoke と本番 spec

- `scripts/smoke.ts`: `GET <origin>/ws/doc_0000000000000000000000000`（`Upgrade` 無し）が `426` でなければ失敗、を追加。`smoke.test.ts` に対応するケース。
- `e2e/playwright.prod.config.ts`: qrcc をコピーし `QRCC_SMOKE_URL` → `NOTER_SMOKE_URL`、既定 `https://noter.riml4i.com`。
- `e2e/smoke/production.spec.ts`: サインインしない読み取り専用で 3 本:
  1. `/` がハイドレーションする（種別ボタンが `<button>` としてクリック可能になる = `aria-disabled` / hydration マーカーで判定。**押さない**）
  2. `/sign-in` に「ゲストのまま続ける」がある（押さない）
  3. `/ws/doc_…` を `page.request.get` で叩き 426。加えて `https://noter-sync.<account>.workers.dev` が**解決しない/404 である**ことは
     account 名が要るのでテストしない（`docs/deployment.md` の手動確認に任せる）
- `e2e/package.json` の `smoke` script（qrcc と同じ）。

**Verify**: dev 起動中に `bun run smoke http://localhost:5173/` → exit 0、`NOTER_SMOKE_URL=http://localhost:5173 bun run smoke:browser` → pass。

### Step 5: deploy.yml

qrcc の `deploy.yml` を元に:

- `Swatinem/rust-cache` と `cargo install` を削除、`build` は `bun run build` のみ
- migrations: `bunx wrangler d1 migrations apply noter --remote --config services/web/wrangler.jsonc`
- deploy: `bunx wrangler deploy -c services/web/dist/noter_sync/wrangler.json` → `bunx wrangler deploy -c services/web/dist/server/wrangler.json`
  （生成ディレクトリ名は `bun run build` の出力で確認し、違えばそれに合わせる）
- smoke: `bun run smoke https://noter.riml4i.com/` → `bun run --filter '@noter/e2e' install-browsers` → `bun run smoke:browser`
- `push` トリガーはコメントアウトのまま（Secrets 登録後に人が外す）
- **executor はこのワークフローを実行しない**

**Verify**: YAML が parse できる。`grep -c cargo .github/workflows/deploy.yml` → 0。`grep -n 'noter_sync' .github/workflows/deploy.yml` → 1 行。

## Test plan

Step 1・2・4 のとおり。`register-sw` はテストしない（qrcc も同様）。

## Done criteria

- [ ] `bun run check` / `bun run test` / `bun run a11y` exit 0
- [ ] `bun run build` の出力に aux と server の `wrangler.json` がある
- [ ] `bun run smoke http://localhost:5173/` が `/ws/` 426 を検査して exit 0
- [ ] `grep -rn 'exposedTo\|origin-trial' shared/webmcp features/shell` → なし
- [ ] `services/web/public/sw.js` に `/ws/` の除外がある
- [ ] `git log` に `wrangler deploy` を実行した形跡が無い（executor の報告で明示）

## STOP conditions

- `bun run build` が auxiliary の `wrangler.json` を生成しない（`@cloudflare/vite-plugin 1.54` の出力構造を報告）
- `document.modelContext` の `registerTool` のシグネチャが qrcc の実装と異なりテストが書けない
- SW の登録が `/d/:id` の WebSocket に干渉する（fetch ハンドラで `Upgrade` を扱ってしまう）
- **`wrangler deploy` / `wrangler secret` を実行する必要が生じた** — 実行せず報告

## Maintenance notes

- ツールを足す・変えるときは ADR-0012 の「編集は提案まで」を守る。削除・共有・メンバー操作はツールにしない
- SW のキャッシュ名 `noter-shell-v1` はシェルの破壊的変更で `v2` に上げる
- `deploy.yml` の順序（aux → entry）は `script_name` binding の解決に必要。入れ替えると初回デプロイが落ちる
