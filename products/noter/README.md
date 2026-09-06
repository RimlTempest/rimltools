# noter

markdown（mermaid 対応）・yaml・toml・json を**複数人でリアルタイムに**
作成・編集・読み込みする Web アプリ。

本番: <https://noter.riml4i.com>（Cloudflare Workers Free、**課金されない構成**）

## 何ができるか

- 文書を作って URL を渡すだけで共同編集。相手はサインイン不要（ゲスト）
- カーソルと選択範囲がリアルタイムで見える。オフラインでも編集でき、復帰後に同期
- markdown はプレビュー（mermaid 図を含む）、yaml / toml / json は構文診断と整形
- 形式の相互変換（yaml ⇄ toml ⇄ json）とエクスポート / インポート
- WCAG 2.2 AAA を目標にしたキーボード操作・読み上げ・コントラスト

## スタック

TanStack Start（React 19）+ Cloudflare Workers + Durable Objects（TypeScript）+ D1。
同期は Yjs（CRDT）。詳細は [`docs/architecture.md`](docs/architecture.md)。

## 開発

```bash
mise install && bun install && bunx lefthook install
bun run dev          # web + sync の両 Worker が Miniflare で起動
bun run check        # fmt + lint + typecheck + markuplint
bun run test         # Small/Medium テスト
bun run a11y         # Playwright + axe-core（AAA タグ込み）
```

AI エージェント向けの入口は [`CLAUDE.md`](CLAUDE.md)。設計の背景は
[`docs/adr/`](docs/adr/README.md)。

## ドキュメント

| 文書                                                   | 内容                                   |
| ------------------------------------------------------ | -------------------------------------- |
| [docs/architecture.md](docs/architecture.md)           | 全体構成・Worker 分割・パッケージ配置  |
| [docs/domain-model.md](docs/domain-model.md)           | 用語・ID・権限表・状態遷移・上限       |
| [docs/realtime-protocol.md](docs/realtime-protocol.md) | WebSocket プロトコル・永続化           |
| [docs/free-tier-budget.md](docs/free-tier-budget.md)   | 無料枠の予算と縮退動作                 |
| [docs/design/ux.md](docs/design/ux.md)                 | UX 設計（画面・フロー・文言）          |
| [DESIGN.md](DESIGN.md)                                 | デザインシステム（トークン・部品）     |
| [docs/accessibility.md](docs/accessibility.md)         | WCAG AAA 達成計画                      |
| [docs/deployment.md](docs/deployment.md)               | デプロイ・運用                         |
| [docs/parallel-lanes.md](docs/parallel-lanes.md)       | 並行作業レーン                         |
| [plans/README.md](plans/README.md)                     | 実装計画                               |
