# qrcc2

QR コード・バーコードの **生成 / 読み取り / 管理 / 印刷** を行う Web アプリ。

- 本番: https://qrcc.riml4i.com
- 前身: [RimlTempest/QRCC](https://github.com/RimlTempest/QRCC)（2021 / Gatsby）
- **Cloudflare の無料枠内で運用しきることが絶対条件**

## 機能

| 機能     | 内容                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生成     | QR / Micro QR / rMQR / DataMatrix / Aztec / PDF417 / Code128 / Code39 / EAN / UPC ほか。誤り訂正・バージョン・マスク・配色・モジュール形状・ロゴ・静寂域まで細かく設定できる |
| 読み取り | カメラ（`BarcodeDetector` / wasm フォールバック）と画像ファイル。既定で画像はサーバに送らない                                                                                |
| 管理     | ログイン後にコードを保存・一覧・検索・編集・フォルダ分け・共有（要ログイン）                                                                                                 |
| 印刷     | ラベル台紙への面付け印刷（ブラウザ印刷）と PDF ダウンロード                                                                                                                  |
| ログイン | ゲスト（匿名）と Google。ゲストのデータは Google ログイン時に引き継がれる                                                                                                    |

## 技術構成

```
qrcc.riml4i.com
 ├─ Worker (TypeScript): TanStack Start SSR/RSC + Better Auth + 認可
 │    └─ service binding（追加のリクエスト課金なし）
 └─ Worker (Rust→WASM):  生成 / デコード / PDF / D1 CRUD ※非公開
       └─ D1 (メタデータ) / KV (短命キャッシュ) / R2 (生成物)
```

- **TypeScript 7.0**（Go 実装のネイティブコンパイラ）
- **oxlint / oxfmt**（ESLint / Prettier は使わない）+ プロジェクト固有の lint プラグイン
- **markuplint** による HTML / アクセシビリティ検査
- **Playwright + axe-core** による WCAG 2.2 AAA 相当の自動チェック
- **Bun workspaces** + **Cargo workspace** の monorepo
- **機能単位の co-location**: 1 機能の型・ロジック・UI・ルート・Rust エンジンが
  `features/<name>/` に集まる（[ADR-0007](docs/adr/0007-feature-colocation.md)）
- **lefthook** による staged ファイル単位のフック

同一の Rust コードが Worker とブラウザの両方で動く。生成と読み取りは既定で
ブラウザ側の wasm が処理するため、Workers のリクエスト無料枠を消費しない。

## セットアップ

```bash
mise install          # node / bun / rust (wasm32 ターゲット込み)
bun install
cargo install worker-build --locked
cp apps/web/.dev.vars.example apps/web/.dev.vars   # 値を埋める

bun run dev           # web + api の両 Worker が Miniflare で起動
```

## よく使うコマンド

```bash
bun run check         # fmt + lint + typecheck + markuplint + rust fmt/clippy
bun run test          # Small / Medium テスト
bun run e2e           # Large テスト (Playwright)
bun run a11y          # アクセシビリティ自動チェック (axe, WCAG AAA タグ)
bun run build         # 本番ビルド
bun run wt list       # 並行作業レーン一覧
```

## 困ったとき

| 症状                                                     | 対処                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ENOENT reading ".../node_modules/react"` などリンク切れ | `bun run clean`（node_modules を消して入れ直す）。ブランチ間の移動で入れ子の symlink が古くなることがある |
| `routeTree.gen.ts` が無いと言われる                      | `bun run --filter '@qrcc/web' gen`（git 管理外の生成物）                                                  |
| `worker-build` が見つからない                            | `cargo install worker-build --locked`                                                                     |

## 並行開発

機能は 12 のレーンに分かれ、**1 レーン = 1 トップレベルディレクトリ**。
co-location により所有範囲がディレクトリ境界と一致するため、競合が起きない。

```bash
bun run wt list                # レーンと依存関係を表示
bun run wt new feat/generate   # worktree を作成（依存インストール・フックまで）
bun run wt sync                # main を rebase で取り込む
bun run wt pr                  # check を通してから PR
```

詳細は [docs/parallel-lanes.md](docs/parallel-lanes.md)。

## ドキュメント

|                                              |                                            |
| -------------------------------------------- | ------------------------------------------ |
| [アーキテクチャ](docs/architecture.md)       | 全体像・ディレクトリ・データフロー・拡張点 |
| [ドメインモデル](docs/domain-model.md)       | 型定義と不変条件                           |
| [API 契約](docs/api-contract.md)             | Worker 間 RPC の唯一の定義                 |
| [ADR](docs/adr/)                             | 技術選定の理由と帰結                       |
| [アクセシビリティ](docs/accessibility.md)    | WCAG 2.2 AAA の達成計画と例外              |
| [無料枠の予算設計](docs/free-tier-budget.md) | 消費見積もりと超過時の縮退                 |
| [並行作業レーン](docs/parallel-lanes.md)     | 所有境界・依存順・競合回避                 |

## エージェント向け

`.claude/skills/` にプロジェクト固有のスキルを置いている
（`.agents/skills/` の実体への symlink）。

| スキル              | 内容                                                 |
| ------------------- | ---------------------------------------------------- |
| `qrcc-typescript`   | any/as/class/enum 禁止、Result・Branded 型・関数DI   |
| `qrcc-html-a11y`    | WCAG AAA、セマンティクス優先、最新 CSS、ダークモード |
| `qrcc-tdd`          | red→green→refactor、テストサイズ                     |
| `qrcc-architecture` | 置き場所の判断・境界・拡張レシピ                     |
| `qrcc-worktree`     | レーン所有境界・依存順・競合回避                     |

規約の多くは `.oxlintrc.json` の `qrcc/*` ルールと CI の `guard` ジョブで
機械的に強制される。ドキュメントを読まなくても違反すればビルドが落ちる。

## ライセンス

MIT
