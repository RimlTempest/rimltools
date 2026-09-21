# ADR-0007: 機能単位の co-location（縦割り）でディレクトリを構成する

- 状態: Accepted
- 日付: 2026-09-01
- 影響: [ADR-0002](0002-auxiliary-worker-split.md) / [ADR-0003](0003-rust-core-dual-target.md) の
  境界規約はそのまま維持する

## 文脈

当初の構成は技術レイヤ別だった。

```
packages/contracts   型
packages/core        ロジック
packages/ui          UI
crates/qrcc-render   生成エンジン (Rust)
crates/qrcc-decode   デコーダ (Rust)
apps/web/src/routes  ルート
apps/web/src/features/<name>  画面
```

「生成」という 1 つの機能を触るのに 5 箇所を横断する必要があり、

- 変更の影響範囲が読めない
- 並行レーンの所有ディレクトリが features/ の下で衝突しやすい
- Rust とフロントの対応関係がディレクトリから読めない

という問題があった。

## 決定

**トップレベルを機能で割り、1 機能に必要なものを 1 ディレクトリへ集める。**

```
features/<name>/
├─ contract/    型・API 契約（TS）        ※Rust 側の対応は engine/src/contract.rs
├─ core/        純粋ロジック（TS。I/O なし）
├─ ui/          React・CSS・テスト・<name>.route.tsx
├─ server/      TanStack server functions（qrcc-web で動く）
├─ engine/      純粋 Rust。`worker` 非依存。ブラウザ wasm にも載る
└─ worker/      Rust の I/O アダプタ。`worker` 依存可。apps/api からのみ使う

shared/
├─ contract/    Result・Brand・共通 ID・エラー（TS）
├─ kernel/engine/  Rust 共有プリミティブ
├─ ui/          デザインシステム
└─ wasm/        ブラウザ向け wasm 束ね（engine/ + TS ラッパ）

apps/
├─ web/         薄いシェル。Vite/Wrangler 設定、router、URL 構成
└─ api/         薄いシェル。features/*/engine と worker を束ねる
```

各 feature は Bun workspace パッケージ (`@qrcc/<name>`) であり、
**公開面は `exports` に列挙したサブパスだけ**。

## ルートの co-location

TanStack Router の **virtual file routes** を使い、ルートの実体を feature 内に置く。

- `apps/web/tsr.config.json` … `routesDirectory` を リポジトリルートの `features/` に向ける
- `apps/web/src/routes.ts` … URL 構造だけを宣言する唯一の横断ファイル
- `features/<name>/ui/<name>.route.tsx` … ルート定義（`createFileRoute`）
- `features/<name>/ui/<name>-screen.tsx` … 画面コンポーネント（feature 所有・テスト対象）

`*.route.tsx` は **apps/web の TypeScript プログラムに属する**
（`routeTree.gen.ts` による `Register` 型拡張が必要なため）。
feature 側の `tsconfig.json` は `*.route.tsx` を `exclude` し、
apps/web が `../../features/*/ui/*.route.tsx` を `include` する。
物理配置は feature の中、型の所有はアプリ側、という分担になる。

## 理由

- **変更が 1 ディレクトリに閉じる。** 「生成に DataMatrix を足す」は
  `features/generate/` の中だけで完結する
- **レーンと所有ディレクトリが 1:1 になる。** worktree 並行作業で衝突が起きない
  （`docs/parallel-lanes.md`）
- **フロントとバックエンドの対応が目で見える。** `features/generate/ui` と
  `features/generate/engine` が隣にある
- **削除しやすい。** 機能をやめるときディレクトリごと消せる

## 帰結・注意点

- feature 同士は `@qrcc/<name>` の公開サブパス経由でのみ依存する。
  相対パスで他 feature の内部に手を伸ばすと CI の `guard` が落ちる
- 共有したくなったものは `shared/` に上げる。**上げる前に 2 回重複させる**（DRY の運用）
- `routesDirectory` の相対パス基準が Vite プラグイン（`srcDirectory` 基準）と
  `tsr generate` CLI（プロジェクトルート基準）で異なるため、
  `vite.config.ts` では絶対パスに解決して渡す。定義元は `tsr.config.json` 1 つ
- Cargo は一致しない glob メンバーをエラーにするため、`features/*/worker` は
  最初の 1 つを作るときにルート `Cargo.toml` へ追加する
- レイヤ別の共通ルール（contract/core は I/O 禁止、engine は `worker` 非依存）は
  ディレクトリ名で判定できるため、CI の `guard` が全 feature に一括で適用する
