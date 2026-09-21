# ADR-0006: TypeScript 7 + oxlint/oxfmt を採用し ESLint/Prettier を使わない

- 状態: Accepted
- 日付: 2026-09-06
- 関連: qrcc ADR-0006 を移植

## 文脈

qrcc で TypeScript 7.0（Go 実装）+ oxlint / oxfmt の構成を確立した。
TypeScript 7.0 は **安定した programmatic API がまだない**（7.1 予定）ため、
`typescript-eslint` をはじめコンパイラ API に依存するツールが動かない。

## 決定

- TypeScript **7.0.2** を使う
- Lint は **oxlint**、フォーマットは **oxfmt**。ESLint / Prettier は入れない
- 型認識 lint は `oxlint --type-aware`（`oxlint-tsgolint`）
- プロジェクト固有の規約は **oxlint の JS プラグイン**（`tools/oxlint-plugin-rimltools`（リポジトリ直下。統合前は `tools/oxlint-plugin-noter`））で
  機械的に強制する: `no-class`（例外は [ADR-0004](0004-durable-object-class-exception.md)）/
  `no-type-assertion` / `no-enum` / `no-throw-in-domain`
- `no-throw-in-domain` の対象パスは `shared/contract/src/**`、`features/*/contract/**`、
  `features/*/core/**`

## 理由

- oxlint は Rust 実装で TypeScript の programmatic API に依存しないため、
  TS 7 の API 不在問題の影響を受けない
- oxlint の JS プラグイン API は ESLint v9 互換で、独自ルールを短く書ける。
  規約をドキュメントではなく **CI で落ちる形**にできる
- qrcc のプラグインはプロジェクト名以外に依存が無く、そのまま移植できる

## 帰結

- `tsconfig.base.json` は `erasableSyntaxOnly` を有効にする（`enum` / `namespace` /
  パラメータプロパティは構文レベルで禁止）
- **markuplint は TypeScript 7 では動かない**（JSX パーサが
  `@typescript-eslint/typescript-estree` 経由で `typescript <6.1` を要求）。
  `tools/markuplint` に TypeScript 6.0.3 固定で隔離して実行する。
  TypeScript 7.1 で API が安定したら統合し直す
- Bun の `linker` は `hoisted`（isolated だと markuplint のプラグイン解決が失敗する）
- エディタ連携は oxlint / oxfmt の LSP
