# qrcc2

QR・バーコードの **生成 / 読み取り / 管理 / 印刷** を行う Web アプリ。
本番: `https://qrcc.riml4i.com` — **無料枠内で運用しきることが絶対条件**。

TanStack Start (React 19 + RSC) + Rust (workers-rs) + Cloudflare Workers。
Bun workspaces の monorepo。

## 作業を始める前に読むもの

`rimltools-*` と外部の skill（`better-interface` など）はリポジトリ直下の `.claude/skills/` に、
qrcc 固有の skill（`qrcc-architecture` / `qrcc-conventions`）は `products/qrcc/.claude/skills/` にある。
共通の規約とプロダクト固有の差分は必ず両方読む。ルートの `CLAUDE.md` も参照。

| 状況                             | 読むスキル                                               |
| -------------------------------- | -------------------------------------------------------- |
| TS/TSX を書く・直す              | `rimltools-typescript` + `qrcc-conventions`              |
| 画面・マークアップ・CSS を書く   | `rimltools-html-a11y` + `qrcc-conventions`               |
| 機能追加・バグ修正               | `rimltools-tdd` + `qrcc-conventions`（必ず red → green） |
| どこに置くか迷う・機能を拡張する | `qrcc-architecture`                                      |
| 並行作業・worktree・コンフリクト | `rimltools-worktree` + `qrcc-conventions`                |
| UI・UX を見直す                  | `better-interface`                                       |
| HTML/CSS/クライアント JS を書く  | `modern-web-guidance`                                    |

設計の背景は `docs/architecture.md` と `docs/adr/`。

`modern-web-guidance`（Google Chrome 公式）は、書く前に「いま標準で何ができるか」を
引きにいくスキル。**スキル本文は `npx` を指示しているが、このリポジトリでは
`bunx` を使うこと**（`npx` は環境によって解決できない）:

```bash
bunx modern-web-guidance@latest search "<やりたいこと>"
bunx modern-web-guidance@latest retrieve "<id>"
```

> **検索語は Google に送られる。** 収集されるのは導入回数・取得したガイドの ID・
> エージェントが生成した検索語で、生のプロンプトは含まれない。止めるなら
> シェルの設定に `export DISABLE_TELEMETRY=1` を書くか、コマンドの前に付ける。

`better-interface` は `better-accessibility` / `better-layout` / `better-writing` /
`better-typography` / `better-colors` / `better-ui` を順に当てて 1 つの表にまとめる。
個別の観点だけ見たいときはその 1 本を直接使う。**このリポジトリのスタックは
プレーン CSS + 独自トークン**なので、Tailwind 前提の項目（`baseline-ui` の
Stack / Components 節など）は読み替えるか無視すること。

## 絶対に守ること

- **`any` / `as` / `!` / `class` / `enum` を書かない。** `.oxlintrc.json` の
  `qrcc/*` ルールが落とす。回避せず設計を直す。
- **ドメイン層（`shared/contract` / `features/*/contract` / `features/*/core` /
  `*/engine`）で `throw` しない。** 失敗は `Result<T, E>` で返す。
- **依存（時計・乱数・fetch・D1）は関数引数で受け取る。**
  配線は composition root だけ。
- **`apps/api` の `wrangler.jsonc` に `routes` を足さない。**
  公開すると認可が二重化して権限昇格の穴になる（ADR-0002）。
- **`*/engine`（Rust）は `worker` crate に依存しない。** ブラウザ向け wasm が壊れる。
  I/O が要るなら `features/<name>/worker` を作る（ADR-0003 / ADR-0007）。
- **feature 同士は `@qrcc/<name>` の公開サブパス経由でのみ依存する。**
  相対パスで他 feature の内部に手を伸ばさない（ADR-0007）。
- **実装より先に失敗するテストを書く。**
- **自分のレーンが所有していないファイルを編集しない**（`scripts/lanes.tsv`）。

## 無料枠の制約（機能を足すたびに確認する）

**Workers Free プランに留まる。R2 も KV も使わない**（ADR-0009）。
Workers Free は上限に達しても課金されず、エラーになって止まるだけ。
先に枯れるのは **Workers 100k req/日**、次が **D1 行書き込み 100k/日**。

- 生成・読み取りは既定でブラウザの wasm で実行する（Worker を消費しない）
- **R2 を使う設計にしない。** R2 は利用上限を設定できず、従量課金が止められない
- キャッシュが要るなら Cache API か D1。KV は使わない

詳細と縮退動作は `docs/free-tier-budget.md`。

## コマンド

```bash
bun run dev          # vite dev（web + api の両 Worker が Miniflare で起動）
bun run check        # fmt + lint + typecheck + markuplint + rust fmt/clippy
bun run test         # Small/Medium テスト
bun run a11y         # Playwright + axe-core（AAA タグ込み）
bun run wt list      # 並行作業レーン一覧
```

コミット前に `bun run check`。lefthook が staged ファイル単位で自動実行する。

## コミット規約

Conventional Commits（lefthook の `commit-msg` が検証する）。
細かい単位で頻繁にコミットする。

```
feat(render): add DataMatrix rectangular sizes
fix(scan): fall back to wasm decoder when BarcodeDetector is unavailable
docs(adr): record label printing decision
```

## ツールチェーン

`mise.toml` で node / bun / rust を固定している。新しい環境では:

```bash
mise install && bun install && bunx lefthook install
```

Lint は oxlint、フォーマットは oxfmt（ESLint / Prettier は使わない — ADR-0006）。
TypeScript は 7.0（Go 実装）。
