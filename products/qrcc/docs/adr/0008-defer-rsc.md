# ADR-0008: React Server Components を当面無効にする

- 状態: Accepted → **ルートの [ADR-0011](../../../../docs/adr/0011-defer-rsc.md) に統合**（2026-09-22、plan 001 段階 3）
- 日付: 2026-09-01

qrcc と noter で同じ決定をしていたため、本文はルートの ADR にまとめた。この番号は欠番にせず残す
（既存の参照を壊さないため）。以下はこのプロダクトに固有の補足だけ。

## qrcc 固有の補足

- 不具合が出たのは qrcc の最初の server function（`feat/generate`、service binding 越しに qrcc-api を呼ぶもの）。経緯はルートの ADR-0011
- `@vitejs/plugin-rsc` は依存に残すが未使用（再開時にすぐ戻せるように）
- 生成・読み取りは端末側の wasm で完結する（[ADR-0003](0003-rust-core-dual-target.md)）ので、RSC で得るものが少ない
