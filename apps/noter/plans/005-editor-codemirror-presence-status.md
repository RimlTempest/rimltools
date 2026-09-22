# Plan 005: エディタ画面（CodeMirror 6 + Yjs、参加者、ステータスピル、表示切替）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <plan-004 のマージコミット>..HEAD -- features/editor features/sync/client features/documents/ui services/web/src/routes.ts shared/ui`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: 004（006 とは並行可。プレビュー・診断は 006 が差し込む）
- **Category**: direction
- **Planned at**: commit `b110c53`, 2026-09-06

## Why this matters

ユーザーが触る本体。ここまでの plan は全部この画面のため。
「開いた瞬間に書ける」「同期を意識させない」「他人の存在は静かに」
（`docs/design/ux.md` §2）をこの画面が体現する。

## Current state

- 設計: `docs/design/ux.md` §4.2（画面レイアウト図・各部品の仕様）、§5（ステータスピルの文言表 — **そのまま使う**）、
  §6.3 / 6.4 / 6.5（オフライン・デプロイ・上限）、§7（ショートカット）、§8（文言）。`DESIGN.md` §CodeMirror テーマ
  （`EditorView.theme` のトークン割当）、§presence。`docs/accessibility.md` §2（2.1.2 Esc→Tab、2.5.7 表示ボタン、4.1.3 単一 `role="status"`）§3（リモートカーソルは `aria-hidden`）。
- plan 004 の `features/documents/ui/document.route.tsx` は暫定画面。**この plan で `features/editor/ui/editor.route.tsx` に置き換え**、
  `services/web/src/routes.ts` の `/d/$documentId` の参照先を差し替える（documents 側の暫定ファイルは削除。`share-dialog.tsx` は残して import）。
- plan 002 の `features/sync/client` に `makeDocumentProvider(deps)` と `ConnectionState`。
- `@noter/ui` に `LiveRegion`（qrcc 由来）がある。ステータスの読み上げはこれ 1 つに集約する。
- npm: `@codemirror/state 6.7.4`, `view 6.43.11`, `commands 6.11.0`, `language 6.12.4`, `lint 6.9.7`, `search 6.7.2`,
  `lang-markdown 6.5.2`, `lang-yaml 6.1.3`, `lang-json 6.0.2`, `legacy-modes 6.5.4`（TOML）, `y-codemirror.next 0.3.6`, `yjs 13.6.32`。
- 上限: `MAX_DOCUMENT_BYTES`（1 MiB）。超える貼り付けは**拒否して理由を出す**（`ux.md` §4.2 取り込み）。
- SSR: CodeMirror は DOM 必須。`editor.route.tsx` は `ssr: false` でクライアント描画にする（TanStack Start の route option）。
  サーバ側では `getDocumentForEditor` の結果（タイトル・種別・役割）だけを SSR して骨組みを出す。

## Commands you will need

| Purpose | Command                        | Expected |
| ------- | ------------------------------ | -------- |
| Tests   | `bun test features/editor`     | pass     |
| Check   | `bun run check`                | exit 0   |
| e2e     | `bun run e2e -- --grep editor` | pass     |
| a11y    | `bun run a11y`                 | pass     |

## Suggested executor toolkit

- `.claude/skills/noter-typescript`, `noter-tdd`, `noter-html-a11y`, `better-interface`
- `docs/design/ux.md` §4.2 §5 §7、`DESIGN.md`、`docs/accessibility.md`
- `node_modules/y-codemirror.next/README.md`（`yCollab(ytext, awareness, { undoManager })`）

## Scope

**In scope**: `features/editor/**`, `features/sync/client/src/**`（presence 色の関数追加）, `features/documents/ui/document.route.tsx`（削除）,
`services/web/src/routes.ts`（1 行差し替え）, `services/web/src/styles/app.css`（1 行）, `services/web/package.json`, `services/web/tsconfig.json`, ルート `tsconfig.json`,
`shared/ui/src/components/avatar.tsx`（新規、`DESIGN.md` の `.noter-avatar`）, `e2e/tests/{editor,sync,a11y}.spec.ts`, `plans/README.md`

**Out of scope**: `docs/**`、`features/formats/**`（プレビュー・診断は plan 006）、`features/sync/{core,worker}`、`features/documents/{core,server}`

## Git workflow

- Branch: `feat/editor`
- Commits: `feat(editor): mount codemirror with yjs collab`, `feat(editor): status pill from connection state`,
  `feat(editor): presence avatars and name prompt`, `feat(editor): view mode toggle and shortcuts`, `feat(editor): title editing and import`

## Steps

### Step 1: core（純粋ロジック）

`features/editor/core/src/`:

- `status-text.ts`: `statusText(conn: ConnectionState, save: SaveState, now): { label: string; announce: string | null; tone: 'muted'|'success'|'warning'|'danger' }`
  — `docs/design/ux.md` §5 の表を**そのまま**。`SaveState = { kind: 'saved'; at: number } | { kind: 'dirty' }`。
  「初回のみ接続しました」は呼び出し側で前回値と比較して抑制（`announce` が同じなら読まない）。
- `presence-color.ts`: `presenceIndex(actorId: string): 0..7`（FNV-1a 32bit → `% 8`。同じ id は常に同じ）。
- `view-mode.ts`: `type ViewMode = 'editor' | 'split' | 'preview'`, `defaultViewMode(widthPx) = width >= 768 ? 'split' : 'editor'`, `nextViewMode(m)`（`Cmd+\` の巡回）。
- `import-guard.ts`: `checkImportSize(bytes): Result<void, 'too_large'>`。
- `language.ts`: `kind → LanguageSupport` の対応（markdown: `@codemirror/lang-markdown`、yaml、json、toml: `StreamLanguage.define(toml)` from legacy-modes）。
  これは CodeMirror に依存するので `core` ではなく `ui/language.ts` に置く。

テスト: `status-text.test.ts`（表の全行）、`presence-color.test.ts`（決定性・0..7）、`view-mode.test.ts`、`import-guard.test.ts`。

**Verify**: `bun test features/editor/core` → pass。

### Step 2: エディタ本体

`features/editor/ui/`:

- `editor.route.tsx`: `createFileRoute('/d/$documentId')({ ssr: false 相当, loader: getDocumentForEditor, component: EditorScreen })`。
- `editor-screen.tsx`: `ux.md` §4.2 のレイアウト。ヘッダ（タイトル `<input aria-label="文書のタイトル">` / viewer は `<h1>`、種別バッジ、
  ステータスピル、参加者、共有ボタン（owner のみ、plan 004 の `ShareDialog`）、⋯ メニュー）、ツールバー（表示切替 3 `<button aria-pressed>`、
  整形・問題・取り込み・書き出しは **plan 006 が中身を入れる**ので、この plan では「表示切替」「取り込み」「書き出し（ダウンロード / コピー / raw URL コピー）」のみ）、
  エディタ領域、プレビュー領域（この plan では `<section aria-label="プレビュー">` に「プレビューは準備中です」。plan 006 が差し替える）。
- `code-editor.tsx`: `useEffect` で `EditorView` を作る。拡張: `basicSetup` 相当の最小（`lineNumbers`, `history`, `drawSelection`,
  `highlightActiveLine`, `keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap])`）、`language(kind)`、
  `yCollab(ytext, provider.awareness, { undoManager })`、`EditorView.lineWrapping`、`EditorView.contentAttributes.of({ 'aria-label': '本文', 'aria-multiline': 'true' })`、
  `DESIGN.md` の `EditorView.theme`、viewer は `EditorState.readOnly.of(true)` + `EditorView.editable.of(false)`。
  **`indentWithTab` は入れない**（2.1.2。Esc → Tab で抜ける規約はそれで満たす）。
  貼り付け（`EditorView.domEventHandlers({ paste })`）で `checkImportSize` → 超過は `preventDefault` + 通知。
  `Cmd/Ctrl+S` は `preventDefault` + 「自動で同期されています」を `LiveRegion` へ。
- `use-document-sync.ts`: `Y.Doc` + `makeDocumentProvider` を `useEffect` で 1 回作り、`ConnectionState` と `SaveState`
  （`doc.on('update', origin)` で自分の更新なら dirty、`PERSIST_DELAY_MS` 後に saved と**みなす**。サーバ通知は v1 で無い）を state に。
  awareness のローカル state: `{ name, color: presenceIndex(actorId), cursor }`（cursor は yCollab が管理）。
- `status-pill.tsx`: `statusText` の結果を `<span class="noter-status-pill" data-tone>` に。読み上げは**唯一の** `LiveRegion`
  （`role="status"`）へ `announce` を渡す。同じ `announce` の連続は出さない。
- `presence.tsx`: `provider.awareness.on('change')` で自分以外を集め、`Avatar`（`shared/ui`、イニシャル + `--noter-presence-N`、`aria-hidden`）最大 3 + `+N`。
  クリックで `<ul aria-label="参加者">`（`popover` 属性。`DESIGN.md` の Presence）。参加・離脱は `LiveRegion` に「〇〇さんが参加しました」（1 回のみ）。
- `name-prompt.tsx`: ゲストで表示名未設定なら初回に `<dialog>`（既定「ゲスト-<4 文字>」、スキップ可）。`localStorage` `noter-display-name`（try/catch）。
  決定したら plan 003 の表示名更新 server function を呼ぶ（無ければ awareness のみに使い、STOP しない）。
- `view-mode.tsx`: 3 ボタン、`localStorage` `noter-view-mode`、320px で縦積み（container query は CSS で）。
- `editor.css`: `DESIGN.md` のトークンのみ。印刷は `@media print` でエディタ・ツールバー・参加者を隠す（`accessibility.md` §5）。
- `services/web/src/routes.ts`: `/d/$documentId` を `editor/ui/editor.route.tsx` に。`services/web/src/styles/app.css` に `@import '@noter/editor/ui/editor.css' layer(components);`。

**Verify**: `bun run check` → exit 0。`bun run dev` で 2 つのブラウザプロファイル（または通常 + シークレット）で同じ文書を開き、片方の入力が
もう片方に出る、カーソルと名前が見える、ピルが「同期済み · hh:mm」になる。

### Step 3: e2e

- `e2e/tests/editor.spec.ts`: A が作成 → editor リンクで B 参加 → A が「hello」を入力 → B の `.cm-content` に「hello」が現れる（`expect.poll`）
  → B の入力が A に現れる → A のピルが「同期済み」を含む。plan 004 の `sync.spec.ts` はこれで置き換え（削除）。
- `e2e/tests/a11y.spec.ts`: `/d/:id` を `connected` 状態で検査（`docs/accessibility.md` §4 の 3 状態のうち `connecting` / `rejected` は plan 008）。

**Verify**: `bun run e2e` → pass。`bun run a11y` → pass。

## Test plan

Step 1 のユニット、`status-pill.test.tsx`（同じ文言を 2 回 announce しない）、`presence.test.tsx`（4 人で `+1`）、
`view-mode.test.tsx`（`aria-pressed` が 1 つだけ true）、e2e。

## Done criteria

- [ ] `bun run check` / `bun run test` / `bun run e2e` / `bun run a11y` exit 0
- [ ] `grep -rn 'indentWithTab' features/editor` → なし
- [ ] `grep -rn 'role="status"' features/editor shared/ui/src` → `LiveRegion` の 1 箇所のみ
- [ ] `grep -rn '保存' features/editor/ui` → 「端末に保存」以外に無い（`ux.md` §5 の語彙規則）
- [ ] `features/documents/ui/document.route.tsx` が削除されている
- [ ] `git diff --name-only` が Scope 内のみ

## STOP conditions

- `y-codemirror.next 0.3.6` が `@codemirror/view 6.43` と peer 不整合で動かない
- `ssr: false` 相当の指定が `@tanstack/react-start 1.168` に無い（`loader` だけ SSR してコンポーネントを `lazy` にする代替が使えなければ STOP）
- `provider.awareness` の `change` が viewer でも自分の state を送ってしまい DO で drop される以外の副作用がある（DO は捨てるだけなので通常は問題なし。問題があれば報告）
- `docs/design/ux.md` §5 の文言表と実装が一致させられない

## Maintenance notes

- ツールバーの「整形」「問題」とプレビューは plan 006 が `features/formats` から差し込む。`editor-screen.tsx` に
  `formatAction?: …` / `preview?: ReactNode` / `diagnostics?: …` の口を用意しておく（未指定なら描画しない）
- WebMCP の `propose-edit`（plan 007）は `features/editor/ui/proposal-panel.tsx` を使う。この plan では作らない
- `SaveState` の saved はクライアント側の推定（ADR-0005）。サーバ通知を入れるときは `docs/realtime-protocol.md` §8 の手順
