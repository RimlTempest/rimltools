# @rimltools/flags

RimlTools の feature flag 評価器（ADR-0004）。使い方は `docs/flags.md`。

| エントリ                       | 中身                                                                          | 実行時の依存                            |
| ------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------- |
| `@rimltools/flags/core`        | `evaluateFlag`（純関数）、`parseFlagDefinition` / `parseFlagFile`、`bucketOf` | なし                                    |
| `@rimltools/flags`             | core + `createD1FlagStore`（D1 + Cache API）+ `createFlagClient`              | なし                                    |
| `@rimltools/flags/openfeature` | `createD1FlagProvider`（OpenFeature server Provider）                         | `@openfeature/core`（`ErrorCode` だけ） |

## OpenFeature SDK を実行時の依存にしない理由

`@openfeature/server-sdk` は `node:async_hooks` と `events` を読み込むため、ブラウザ向けに
バンドルできず、Worker でも `nodejs_compat` が必須になる。評価そのものに SDK は要らないので、

- 評価は依存ゼロの core で行う（ブラウザ・Workers・Bun で同じ結果）
- OpenFeature とは **Provider の形（型）で互換**にする。型は `import type` なのでバンドルに入らない
- SDK 経由で使いたいプロダクトだけが `@openfeature/server-sdk`（optional peer）を入れる

Cloudflare Flagship が GA になり Free で使えるようになったら、OpenFeature の Provider を
差し替えるだけで移れる（評価コードは OpenFeature の client API のまま）。

## 設計メモ

- 失敗は例外にしない。D1 障害・未定義・型不一致は呼び出し側の既定値 + `errorCode` を返す。
- 1 つの flag の定義が壊れていても、他の flag は評価できる（壊れた行はログに出して無視）。
- 振り分けは FNV-1a 32bit の 0..9999 バケット。`rollout` と `distribution` は別のバケットを使う
  （同じにすると rollout 対象者が distribution の先頭 variant に偏る）。
- rollout を上げても既に対象の人は外れない（バケットが固定で、閾値だけが動く）。
