# qrcc2

QR・バーコードの **生成 / 読み取り / 管理 / 印刷** を行う Web アプリ。
本番: `https://qrcc.riml4i.com` — **無料枠内で運用しきることが絶対条件**。

TanStack Start (React 19 + RSC) + Rust (workers-rs) + Cloudflare Workers。
Bun workspaces の monorepo。

## 作業を始める前に読むもの

| 状況                             | 読むスキル                     |
| -------------------------------- | ------------------------------ |
| TS/TSX を書く・直す              | `qrcc-typescript`              |
| 画面・マークアップ・CSS を書く   | `qrcc-html-a11y`               |
| 機能追加・バグ修正               | `qrcc-tdd`（必ず red → green） |
| どこに置くか迷う・機能を拡張する | `qrcc-architecture`            |
| 並行作業・worktree・コンフリクト | `qrcc-worktree`                |

設計の背景は `docs/architecture.md` と `docs/adr/`。

## 絶対に守ること

- **`any` / `as` / `!` / `class` / `enum` を書かない。** `.oxlintrc.json` の
  `qrcc/*` ルールが落とす。回避せず設計を直す。
- **ドメイン層（`packages/contracts`, `packages/core`, `crates/qrcc-*`）で
  `throw` しない。** 失敗は `Result<T, E>` で返す。
- **依存（時計・乱数・fetch・D1・R2・KV）は関数引数で受け取る。**
  配線は composition root だけ。
- **`apps/api` の `wrangler.jsonc` に `routes` を足さない。**
  公開すると認可が二重化して権限昇格の穴になる（ADR-0002）。
- **`crates/qrcc-core|render|decode|print` は `worker` crate に依存しない。**
  ブラウザ向け wasm ビルドが壊れる（ADR-0003）。
- **実装より先に失敗するテストを書く。**
- **自分のレーンが所有していないファイルを編集しない**（`scripts/lanes.tsv`）。

## 無料枠の制約（機能を足すたびに確認する）

先に枯れるのは **Workers 100k req/日** と **KV 書き込み 1,000/日**。

- 生成・読み取りは既定でブラウザの wasm で実行する（Worker を消費しない）
- KV に書き込む設計にしない。D1 か Cache API を先に検討する
- 生成物は `SpecHash` をキーに R2 でキャッシュする

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
