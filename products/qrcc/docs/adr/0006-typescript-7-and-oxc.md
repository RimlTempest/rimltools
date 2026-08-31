# ADR-0006: TypeScript 7 + oxlint/oxfmt を採用し ESLint/Prettier を使わない

- 状態: Accepted
- 日付: 2026-09-01

## 文脈

「TypeScript 最新」「oxlint / oxfmt」が要件。
TypeScript 7.0 は Go で書き直されたネイティブコンパイラで 2026-07-08 に GA。
ただし **安定した programmatic API がまだない**（7.1 予定）ため、
`typescript-eslint` をはじめコンパイラ API に依存するツールが動かない。

## 決定

- TypeScript **7.0.2** を使う。
- Lint は **oxlint**、フォーマットは **oxfmt**。ESLint / Prettier は入れない。
- 型認識 lint は `oxlint --type-aware`（`oxlint-tsgolint`）を使う。
- プロジェクト固有の規約は **oxlint の JS プラグイン**（`tools/oxlint-plugin-qrcc`）で
  機械的に強制する。

## 理由

- oxlint は Rust 実装で TypeScript の programmatic API に依存しないため、
  **TS 7 の API 不在問題の影響を受けない**。要件（oxlint / oxfmt）と
  要件（TS 最新）が偶然きれいに噛み合う。
- oxfmt は Prettier の 30 倍速で、Prettier 互換の出力。
- oxlint の JS プラグイン API は ESLint v9 互換なので、
  「`class` 禁止」「`as` 禁止」のような独自ルールを短いコードで書ける。
  規約をドキュメントではなく **CI で落ちる形**にできる。

## 帰結

- TS 6 → 7 の破壊的変更（6 で deprecated だったものが 7 でエラー）を前提に
  `tsconfig.base.json` を書く。`erasableSyntaxOnly` を有効にしているため
  `enum`・`namespace`・パラメータプロパティは元々使えない。
- `typescript-eslint` の型認識ルール（`no-floating-promises` 等）は
  oxlint の type-aware 版を使う。動かないルールがあれば ADR を追加して代替を決める。
- **markuplint は TypeScript 7 では動かない。** JSX パーサが
  `@typescript-eslint/typescript-estree` に依存しており、これは
  `typescript >=4.8.4 <6.1.0` を要求する。そのため markuplint だけを
  `tools/markuplint`（ワークスペース外の独立インストール、TypeScript 6.0.3 固定）に
  隔離して実行する。ルートの型検査は TS 7、マークアップ検査は TS 6 という
  分離で、どちらも最新の状態を保つ。TypeScript 7.1 で programmatic API が
  安定したら統合し直す。
- Bun の `linker` は `hoisted` にしている。isolated レイアウトだと
  markuplint のように「自分の位置からプラグインを解決する」ツールが失敗するため。
- エディタ連携は oxlint / oxfmt の LSP（`--lsp`）を使う。
- Prettier 前提のプラグイン（Tailwind のクラス並べ替え等）は使えない。
  必要になったら oxfmt のプラグイン対応状況を確認してから判断する。
