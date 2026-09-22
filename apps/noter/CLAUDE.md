# noter

Markdown（Mermaid 対応）/ YAML / TOML / JSON を **複数人でリアルタイムに作成・編集・閲覧** する
Web アプリ。本番: `https://noter.riml4i.com` — **無料枠内で運用しきることが絶対条件**。

TanStack Start (React 19) + Cloudflare Workers + Durable Objects (TypeScript) + D1。
Rust は使わない。Bun workspaces の monorepo。

## 作業を始める前に読むもの

`rimltools-*` と外部の skill（`better-interface` など）はリポジトリ直下の `.claude/skills/` に、
noter 固有の skill（`noter-architecture` / `noter-conventions`）は `apps/noter/.claude/skills/` にある。
共通の規約とプロダクト固有の差分は必ず両方読む。ルートの `CLAUDE.md` も参照。

| 状況                             | 読むスキル                                                |
| -------------------------------- | --------------------------------------------------------- |
| TS/TSX を書く・直す              | `rimltools-typescript` + `noter-conventions`              |
| 画面・マークアップ・CSS を書く   | `rimltools-html-a11y` + `noter-conventions`               |
| 機能追加・バグ修正               | `rimltools-tdd` + `noter-conventions`（必ず red → green） |
| どこに置くか迷う・機能を拡張する | `noter-architecture`                                      |
| 並行作業・worktree・コンフリクト | `rimltools-worktree` + `noter-conventions`                |
| UI・UX を見直す                  | `better-interface`                                        |
| HTML/CSS/クライアント JS を書く  | `modern-web-guidance`                                     |
| Workers / DO / D1 に触る         | `workers-best-practices`                                  |

設計の背景は `docs/architecture.md`、`docs/realtime-protocol.md`、`docs/adr/`。
UX は `docs/design/ux.md`、デザインシステムは `DESIGN.md`。

`modern-web-guidance`（Google Chrome 公式）は、書く前に「いま標準で何ができるか」を
引きにいくスキル。**スキル本文は `npx` を指示しているが、このリポジトリでは
`bunx` を使うこと**:

```bash
bunx modern-web-guidance@latest search "<やりたいこと>"
bunx modern-web-guidance@latest retrieve "<id>"
```

> **検索語は Google に送られる。** 止めるなら `export DISABLE_TELEMETRY=1`。

`better-interface` は `better-accessibility` / `better-layout` / `better-writing` /
`better-typography` / `better-colors` / `better-ui` を順に当てて 1 つの表にまとめる。
**このリポジトリのスタックはプレーン CSS + 独自トークン**なので、Tailwind 前提の項目は
読み替えるか無視すること。

## 絶対に守ること

- **`any` / `as` / `!` / `class` / `enum` を書かない。** ルートの `.oxlintrc.json` の
  `rimltools/*` ルール（`tools/oxlint-plugin-rimltools`）が落とす。回避せず設計を直す。
  唯一の例外は `features/sync/worker/document-room.ts` の Durable Object class（ADR-0004）。
  そこにロジックを書かない（1〜3 行の委譲だけ）。
- **ドメイン層（`shared/contract` / `features/*/contract` / `features/*/core`）で
  `throw` しない。** 失敗は `Result<T, E>` で返す。
- **依存（時計・乱数・fetch・D1・DO storage・WebSocket）は関数引数で受け取る。**
  配線は composition root（`*-wiring.route.ts` と `services/sync/src/index.ts`）だけ。
- **`services/sync` の `wrangler.jsonc` に `routes` を足さない。`workers_dev` を `true` にしない。**
  DO が web Worker の binding 以外から届くと、認可が二重化して権限昇格の穴になる（ADR-0002）。
- **Durable Object の中で `setTimeout` / `setInterval` / 標準 `WebSocket` API を使わない。**
  hibernation が効かなくなり duration 枠を食い潰す。遅延は `ctx.storage.setAlarm`（ADR-0003）。
- **DO の in-memory 状態は消える前提で書く。** 消えて困るものは `ctx.storage` へ（ADR-0005）。
- **feature 同士は `@noter/<name>/<subpath>` の公開サブパス経由でのみ依存する。**
  相対パスで他 feature の内部に手を伸ばさない（ADR-0007）。
- **R2 / KV を使わない。** D1 と DO の SQLite だけ（ADR-0009）。
- **実装より先に失敗するテストを書く。**
- **自分のレーンが所有していないファイルを編集しない**（`scripts/lanes.tsv`）。

## 無料枠の制約（機能を足すたびに確認する）

**Workers Free プランに留まる。** 上限に達しても課金されず、エラーになって止まるだけ。
先に枯れる順: **DO リクエスト 100k/日（WS 受信 20 通 = 1 リクエスト）** →
**DO SQLite 行書き込み 100k/日** → Workers 100k req/日 → D1 行書き込み 100k/日。

- 文書の解析・整形・プレビュー・Mermaid 描画は**すべてブラウザ**で行う
- DO は「同じ文書を開いている全員に更新を配る」ことだけをする
- 永続化は alarm で集約し、**1 更新 = 1 行書き込みにしない**
- キャッシュが要るなら Cache API か D1。KV は使わない

詳細と縮退動作は `docs/free-tier-budget.md`。

## コマンド

```bash
bun run dev          # vite dev（web + sync の両 Worker が Miniflare で起動）
bun run check        # fmt + lint + typecheck + markuplint
bun run test         # Small/Medium テスト
bun run e2e          # Playwright（同時編集の結合テスト込み）
bun run a11y         # Playwright + axe-core（AAA タグ込み）
bun run wt list      # 並行作業レーン一覧
```

コミット前に `bun run check`。lefthook が staged ファイル単位で自動実行する。

## コミット規約

Conventional Commits（lefthook の `commit-msg` が検証する）。
細かい単位で頻繁にコミットする。

```
feat(sync): persist document state on alarm instead of every update
fix(editor): keep remote cursors hidden from assistive technology
docs(adr): record durable object class exception
```

## ツールチェーン

`mise.toml` で node / bun を固定している。新しい環境では:

```bash
mise install && bun install && bunx lefthook install
```

Lint は oxlint、フォーマットは oxfmt（ESLint / Prettier は使わない — ADR-0006）。
TypeScript は 7.0（Go 実装）。
