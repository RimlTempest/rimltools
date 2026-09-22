# ADR-0012: 機能単位の co-location でディレクトリを構成する

- 状態: 採用（2026-09-22。qrcc ADR-0007・noter ADR-0007 を統合）
- 関連: [ADR-0001](0001-monorepo.md)

## 背景

qrcc の当初の構成は技術レイヤ別（`packages/contracts`・`packages/core`・`packages/ui`・`crates/*`・`apps/web/src/features/*`）で、
「生成」という 1 つの機能を触るのに 5 か所を横断する必要があった。

- 変更の影響範囲が読めない
- 並行レーンの所有ディレクトリが衝突しやすい
- Rust とフロントの対応関係がディレクトリから読めない

qrcc を機能別に組み替えて「1 機能 = 1 ディレクトリ = 1 並行レーン」が成立し、noter も同じ構成を採った。

## 決定

**各プロダクトのトップレベルを機能で割り、1 機能に必要なものを 1 ディレクトリへ集める。**

```
products/<tool>/
├─ features/<name>/
│  ├─ contract/   型・API 契約（I/O なし、throw しない）
│  ├─ core/       純粋ロジック（I/O なし、throw しない）
│  ├─ ui/         React・CSS・テスト・<name>.route.tsx
│  └─ server/     TanStack server functions / server routes
├─ shared/        プロダクト内の共有物（プロダクト固有の型・UI）
└─ apps/          薄いシェル（Vite / Wrangler 設定、router、URL 構成）
packages/         プロダクト横断の共有物（@rimltools/*）
```

- 各 feature は Bun workspace パッケージ（`@<tool>/<name>`）。**公開面は `exports` に列挙したサブパスだけ**で、
  feature 同士は公開サブパス経由でのみ依存する。相対パスで他 feature の内部に手を伸ばさない（CI の guard が落とす）
- プロダクト固有のレイヤ（qrcc の `engine/`・`worker/`、noter の `worker/`・`client/`）は各プロダクトの ADR-0007 に書く

## ルートの co-location

TanStack Router の **virtual file routes** を使い、ルートの実体を feature 内に置く。

- `apps/web/tsr.config.json` … `routesDirectory` をプロダクトの `features/` に向ける
- `apps/web/src/routes.ts` … URL 構造だけを宣言する唯一の横断ファイル
- `features/<name>/ui/<name>.route.tsx` … ルート定義（`createFileRoute`）
- `features/<name>/ui/<name>-screen.tsx` … 画面コンポーネント（feature 所有・テスト対象）

`*.route.tsx` は **apps/web の TypeScript プログラムに属する**（`routeTree.gen.ts` の `Register` 型拡張が必要なため）。
feature 側の `tsconfig.json` は `*.route.tsx` を `exclude` し、apps/web が `../../features/*/ui/*.route.tsx` を `include` する。
物理配置は feature の中、型の所有はアプリ側、という分担になる。

## 理由

- **変更が 1 ディレクトリに閉じる**（「生成に DataMatrix を足す」は `features/generate/` の中だけで完結する）
- **レーンと所有ディレクトリが 1:1 になる。** worktree 並行作業で衝突が起きない（各プロダクトの `docs/parallel-lanes.md`）
- **対になる実装が隣り合う**（qrcc の `ui` と `engine`、noter の同期の `worker` と `client`）
- **削除しやすい。** 機能をやめるときディレクトリごと消せる

## 帰結

- feature を足す = ディレクトリを足す + `apps/web/src/routes.ts` に 1 行。消すときはその逆
- 共有したくなったものは、プロダクト内なら `shared/`、プロダクト横断なら `packages/` に上げる。**上げる前に 2 回重複させる**
- `routesDirectory` の相対パス基準が Vite プラグイン（`srcDirectory` 基準）と `tsr generate` CLI（プロジェクトルート基準）で
  異なるため、`vite.config.ts` では絶対パスに解決して渡す。定義元は `tsr.config.json` 1 つ
- レイヤ別の共通ルール（contract / core は I/O 禁止）はディレクトリ名で判定できるので、CI の guard とルートの oxlint が全 feature に一括で適用する
