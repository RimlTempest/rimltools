# ADR-0007: 機能単位の co-location（縦割り）でディレクトリを構成する

- 状態: Accepted → **ルートの [ADR-0012](../../../../docs/adr/0012-feature-colocation.md) に統合**（2026-09-22、plan 001 段階 3）
- 日付: 2026-09-01
- 影響: [ADR-0002](0002-auxiliary-worker-split.md) / [ADR-0003](0003-rust-core-dual-target.md) の境界規約はそのまま維持する

qrcc と noter で同じ決定をしていたため、本文はルートの ADR にまとめた。この番号は欠番にせず残す
（既存の参照を壊さないため）。以下はこのプロダクトに固有の補足だけ。

## qrcc 固有の補足

qrcc のレイヤ（Rust を含む）:

```
features/<name>/
├─ contract/    型・API 契約（TS）        ※Rust 側の対応は engine/src/contract.rs
├─ core/        純粋ロジック（TS。I/O なし）
├─ ui/          React・CSS・テスト・<name>.route.tsx
├─ server/      TanStack server functions（qrcc-web で動く）
├─ engine/      純粋 Rust。`worker` 非依存。ブラウザ wasm にも載る
└─ worker/      Rust の I/O アダプタ。`worker` 依存可。services/api からのみ使う

shared/
├─ contract/    Result・Brand・共通 ID・エラー（TS）
├─ kernel/engine/  Rust 共有プリミティブ
├─ ui/          デザインシステム
└─ wasm/        ブラウザ向け wasm 束ね（engine/ + TS ラッパ）

services/
├─ web/         薄いシェル。Vite/Wrangler 設定、router、URL 構成
└─ api/         薄いシェル。features/*/engine と worker を束ねる
```

- `engine/` は純粋 Rust で `worker` crate に依存しない（ブラウザの wasm に載る。ADR-0003）。I/O は `worker/` に置き、services/api からのみ使う
- Cargo は一致しない glob メンバーをエラーにするため、`features/*/worker` は最初の 1 つを作るときにルート `Cargo.toml` へ追加する
- engine が `worker` に依存していないことは CI の guard（`scripts/guard.sh`）が全 feature に一括で検査する
