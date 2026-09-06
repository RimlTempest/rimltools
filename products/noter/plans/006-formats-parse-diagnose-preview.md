# Plan 006: フォーマット層（解析・診断・整形・変換・Markdown/Mermaid プレビュー）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <plan-005 のマージコミット>..HEAD -- features/formats features/editor/ui shared/contract/src/document-kind.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: LOW（全てブラウザ内・純粋関数。Mermaid のバンドルサイズだけ注意）
- **Depends on**: 001（core は独立で先行可）、005（UI の差し込み）
- **Category**: direction
- **Planned at**: commit `b110c53`, 2026-09-06

## Why this matters

「設定の管理者」ペルソナの決定的要件は**構文エラーがその場で分かる**こと、
「書き手」は**図が即座に更新される**こと（`docs/design/ux.md` §1）。
全部ブラウザで計算するので Worker を消費しない（`docs/architecture.md` §1）。

## Current state

- 設計: `docs/design/ux.md` §4.2（整形・問題パネル・取り込み・書き出し・変換・プレビューの仕様）、
  `docs/accessibility.md` §2（1.1.1 mermaid `role="img"` + `<details>` ソース、3.3.1 診断は行番号 + 何が悪いか + 直し方）§3（mermaid の `aria-label`）。
  `.claude/skills/noter-architecture/SKILL.md` §3「文書種別を足す」。
- `shared/contract/src/document-kind.ts`（plan 001）: `DOCUMENT_KINDS`, `FILE_EXTENSION`, `MIME_TYPE`。
- plan 005 の `features/editor/ui/editor-screen.tsx` に `formatAction` / `preview` / `diagnostics` の差し込み口がある。
- npm: `markdown-it 15.0.1`, `dompurify 3.4.14`, `mermaid 11.17.2`, `yaml 2.9.0`, `smol-toml 1.8.0`, `jsonc-parser 3.3.1`。
  Mermaid は **`import('mermaid')` の動的 import** で遅延ロード（初期バンドルに入れない）。
- Diagnostic の形は `docs/domain-model.md`: 「構文エラーなど、本文に対する指摘。ブラウザで算出」。

## Commands you will need

| Purpose | Command                                  | Expected |
| ------- | ---------------------------------------- | -------- |
| Tests   | `bun test features/formats`              | pass     |
| Check   | `bun run check`                          | exit 0   |
| Build   | `bun run build` → `du -sh apps/web/dist/client/assets` | mermaid が別チャンク |

## Suggested executor toolkit

- `.claude/skills/noter-typescript`, `noter-tdd`, `noter-html-a11y`, `noter-architecture`
- `bunx modern-web-guidance@latest search "sanitize html"` など（CLAUDE.md のとおり `bunx`）

## Scope

**In scope**: `features/formats/**`, `features/editor/ui/editor-screen.tsx`（差し込みのみ）, `features/editor/ui/problems-panel.tsx`（新規）,
`apps/web/package.json`, `apps/web/tsconfig.json`, ルート `tsconfig.json`, `apps/web/src/styles/app.css`（1 行）, `e2e/tests/{formats,a11y}.spec.ts`, `plans/README.md`

**Out of scope**: `docs/**`、`features/{sync,documents,auth}/**`、`shared/**`（`document-kind.ts` に種別を足さない）

## Git workflow

- Branch: `feat/formats`
- Commits: `feat(formats): add parse and diagnose for yaml, toml, json`, `feat(formats): add format and convert`,
  `feat(formats): markdown preview with sanitizer`, `feat(formats): lazy mermaid blocks`, `feat(editor): wire problems panel and preview`

## Steps

### Step 1: core — 解析と診断

`features/formats/core/src/`:

- `diagnostic.ts`: `type Diagnostic = { readonly severity: 'error' | 'warning'; readonly line: number; readonly column: number; readonly message: string; readonly hint?: string; readonly source: DocumentKind | 'mermaid' }`（1 始まり）。
- `parse.ts`: `parseDocument(kind, text): Result<ParsedDocument, readonly Diagnostic[]>`。
  `ParsedDocument = { kind: 'markdown' } | { kind: 'data'; value: JsonValue }`（yaml / toml / json は `JsonValue` に正規化）。
  yaml: `yaml.parseDocument(text)` の `errors` を Diagnostic に（`linePos`）。toml: `smol-toml` の `TomlError` の `line/column`（**`throw` するライブラリは `try/catch` で受けて Result に変換する。それはこの関数の役目で、ドメイン層の `throw` 禁止に反しない**）。
  json: `jsonc-parser.parseTree` + `ParseError[]`（offset → line/column は `text` から計算）。markdown: 常に ok。
- `diagnose.ts`: `diagnose(kind, text): readonly Diagnostic[]`（parse の err をそのまま、ok なら `[]`）。
- `format.ts`: `formatDocument(kind, text): Result<string, readonly Diagnostic[]>`。yaml: `yaml.stringify(value, { indent: 2 })`、toml: `smol-toml.stringify`、json: `JSON.stringify(value, null, 2) + '\n'`、markdown: `err([])` は不自然なので `Result<string, 'unsupported' | readonly Diagnostic[]>`。
- `convert.ts`: `convertDocument(from, to, text): Result<string, ConvertError>`（yaml ⇄ json ⇄ toml。toml へは「トップレベルが object でない」「null を含む」を `ConvertError = { reason: 'not_object' | 'null_value' | 'parse'; diagnostics? }` で返す）。
- `mermaid-blocks.ts`: `extractMermaidBlocks(markdown): readonly { index: number; source: string; line: number }[]`（fence ```` ```mermaid ```` を抜く純粋関数）。

テスト: 4 種別の正常・異常（行番号が合う）、整形の冪等、変換の往復（yaml → json → yaml で値一致）、toml 変換不能。

**Verify**: `bun test features/formats/core` → pass。`grep -rn 'throw' features/formats/core` → なし（`try/catch` はあってよい）。

### Step 2: core — Markdown レンダリング

- `render-markdown.ts`: `renderMarkdown(text, { renderMermaidPlaceholder }): string`。`markdown-it({ html: false, linkify: true })`、
  見出しに id（`slug` は自前の純粋関数）、`mermaid` fence は `<div class="noter-mermaid" data-index="N"><details><summary>mermaid のソース</summary><pre><code>…</code></pre></details></div>` に置換（SVG は UI 側で差し込む）。
  結果は **`DOMPurify.sanitize` を通す**（`ui/` 側で。core は DOM を触らない）。`html: false` なので生 HTML は既にエスケープされる。
- テスト: 見出し id、リンクの `rel="noopener"`（`linkify` の出力に付与）、mermaid fence の置換、`<script>` がエスケープされる。

**Verify**: `bun test features/formats/core` → pass。

### Step 3: ui

`features/formats/ui/`:

- `markdown-preview.tsx`: `renderMarkdown` → `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })` → `dangerouslySetInnerHTML`
  （**唯一の使用箇所**。`.oxlintrc.json` に override を足すのは devops レーンなので、`react/no-danger` が有効なら STOP せず
  `// oxlint-disable-next-line react/no-danger -- sanitized by DOMPurify` を 1 行）。`max-inline-size: var(--noter-measure)`。
- `mermaid-block.tsx`: `IntersectionObserver` で可視になったら `import('mermaid')` → `mermaid.render(id, source)` → `<svg role="img" aria-label="mermaid 図（N 個のノード）">`
  （ノード数は `svg.querySelectorAll('.node').length`）。失敗時は赤枠 + メッセージ + ソースは `<details>` のまま。
  `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: DESIGN.md の色 })`。
- `data-preview.tsx`: yaml / toml / json の「整形済み `<pre>`」と「ツリー（`<details>` 入れ子）」の 2 モード。JSON は既定ツリー。
- `formats.css`。
- `features/editor/ui/problems-panel.tsx`: `<button aria-expanded>問題 (N)</button>` + `<ul>` の各 `<li>` に `<button>` で該当行へ `EditorView.dispatch({ selection, scrollIntoView })`。
  0 件でも押せて「問題はありません」。`Cmd/Ctrl+Shift+P` で開閉。
- `features/editor/ui/editor-screen.tsx` に差し込み: `diagnostics = useMemo(() => diagnose(kind, text), [text])`（`text` は `ytext.observe` で更新、150 ms debounce）、
  `formatAction`（`formatDocument` の ok なら `ytext` を 1 トランザクションで置換、err なら問題パネルへ。`Cmd/Ctrl+Shift+F`）、
  `preview`（kind で `MarkdownPreview` / `DataPreview`）、書き出しメニューに「変換して新規作成」（`convertDocument` → plan 004 の `createDocument` に初期本文を渡す。
  `createDocument` が初期本文を受け取れなければ、作成後に `/d/:id` で `ytext.insert` する形にし、STOP しない）。
- `CodeMirror` の `@codemirror/lint` に `diagnostics` を流し、`.cm-lintRange-error` の波線（`DESIGN.md`）。

**Verify**: `bun run check` → exit 0。`bun run dev` で YAML 文書に `a: [` を入力 → 問題 (1) → クリックで行へ移動。Markdown に mermaid fence → 図が出る。

### Step 4: e2e と a11y

- `e2e/tests/formats.spec.ts`: JSON 文書で `{"a":1` → 問題 1 件、`}` を足すと 0 件、整形で 2 スペースインデントになる。Markdown で mermaid が `svg[role="img"]` になる。
- `e2e/tests/a11y.spec.ts`: Markdown（mermaid 含む）と JSON の `/d/:id` を検査。

**Verify**: `bun run e2e -- --grep formats` / `bun run a11y` → pass。`bun run build` 後、`/bin/ls apps/web/dist/client/assets | grep -i mermaid` → 別チャンクがある。

## Test plan

Step 1・2 のユニット（行番号の精度を最重視）、`markdown-preview.test.tsx`（`<script>` が残らない、`<a>` に `rel`）、`problems-panel.test.tsx`、e2e。

## Done criteria

- [ ] `bun run check` / `bun run test` / `bun run e2e` / `bun run a11y` exit 0
- [ ] `grep -rn "from 'mermaid'" features/formats` → なし（動的 import のみ）
- [ ] `grep -rn 'dangerouslySetInnerHTML' features shared` → `markdown-preview.tsx` の 1 箇所のみ
- [ ] mermaid が初期チャンクに含まれない
- [ ] `git diff --name-only` が Scope 内のみ

## STOP conditions

- `mermaid 11.17` が `securityLevel: 'strict'` で `render` を Worker 無しの SSR 環境で評価しようとしてビルドが落ちる（`ssr.noExternal` 等の設定が必要なら報告）
- `smol-toml` / `yaml` の位置情報が取れず行番号が出せない
- `DOMPurify` が SSR（happy-dom 無し）で import 時に落ちる → `ui/` を `ssr: false` の画面でのみ import する構成で解決できなければ STOP

## Maintenance notes

- 種別を足す手順は `.claude/skills/noter-architecture` §3。`parse.ts` / `format.ts` / `convert.ts` / `language.ts`（editor）/ `FILE_EXTENSION` の 5 箇所
- Mermaid のバージョン更新はバンドルサイズ（`du`）を見る。1 MB を超えたら遅延ロードが効いているか確認
- `renderMarkdown` に `html: true` を入れない（XSS）。入れたくなったら ADR
