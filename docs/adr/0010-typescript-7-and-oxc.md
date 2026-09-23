# ADR-0010: TypeScript 7 + oxlint / oxfmt を使い、ESLint / Prettier を使わない

- 状態: 採用（2026-09-22。qrcc ADR-0006・noter ADR-0006 を統合）
- 関連: [ADR-0001](0001-monorepo.md)

## 背景

TypeScript 7.0（Go 実装のネイティブコンパイラ、2026-07-08 GA）には**安定した programmatic API がまだない**（7.1 予定）。
`typescript-eslint` をはじめ、コンパイラ API に依存するツールは動かない。
qrcc で確立した構成を noter が移植し、モノレポ化（ADR-0001）で 1 つにまとめた。

## 決定

- TypeScript **7.0.2** を使う。設定の基底はリポジトリ直下の `tsconfig.base.json` 1 つ
- Lint は **oxlint**（型認識は `oxlint --type-aware` / `oxlint-tsgolint`）、フォーマットは **oxfmt**。ESLint / Prettier は入れない
- 設定はリポジトリ直下の `.oxlintrc.json` / `.oxfmtrc.json` 1 つ。プロダクト固有の規則は `overrides` で書く
- 規約は **oxlint の JS プラグイン** `tools/oxlint-plugin-rimltools` で機械的に強制する:
  `rimltools/no-class` / `no-type-assertion` / `no-enum` / `no-throw-in-domain`
  （`no-throw-in-domain` の対象はドメイン層: `*/contract`・`*/core`・`packages/*/src/core`）

## 理由

- oxlint は Rust 実装で TypeScript の programmatic API に依存しないため、TS 7 の API 不在の影響を受けない
- oxfmt は Prettier の約 30 倍速で、Prettier 互換の出力
- oxlint の JS プラグイン API は ESLint v9 互換で、「`class` 禁止」「`as` 禁止」のような独自ルールを短く書ける。
  規約をドキュメントではなく **CI で落ちる形**にできる

## 帰結

- `tsconfig.base.json` は `erasableSyntaxOnly` を有効にする（`enum` / `namespace` / パラメータプロパティは構文レベルで禁止）
- `typescript-eslint` の型認識ルール（`no-floating-promises` 等）は oxlint の type-aware 版を使う。
  動かないルールがあれば ADR を追加して代替を決める
- **markuplint は TypeScript 7 では動かない**（JSX パーサが `@typescript-eslint/typescript-estree` 経由で `typescript <6.1` を要求）。
  `tools/markuplint` に TypeScript 6.0.3 固定で隔離し、`tools/markuplint/run.ts`（API で実行し、対象ファイルが
  すべて検査されたことを確かめる）から動かす。設定は直下の `.markuplintrc.json` 1 つ（`overrideMode: "merge"`）。
  TypeScript 7.1 で API が安定したら統合し直す。経緯は `docs/security.md`（markuplint が 0 ファイルしか検査していなかった件）
- Bun の `linker` は `hoisted`（isolated だと markuplint のように自分の位置からプラグインを解決するツールが失敗する）
- エディタ連携は oxlint / oxfmt の LSP（`--lsp`）を使う
- Prettier 前提のプラグイン（Tailwind のクラス並べ替え等）は使えない。必要になったら oxfmt の対応状況を確認してから判断する

## プロダクト固有の例外

- noter: Durable Object は `class` でしか書けないため、`features/sync/worker/document-room.ts` だけ `no-class` の例外（noter ADR-0004）
