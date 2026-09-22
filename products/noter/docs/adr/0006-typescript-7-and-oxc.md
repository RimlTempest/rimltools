# ADR-0006: TypeScript 7 + oxlint/oxfmt を採用し ESLint/Prettier を使わない

- 状態: Accepted → **ルートの [ADR-0010](../../../../docs/adr/0010-typescript-7-and-oxc.md) に統合**（2026-09-22、plan 001 段階 3）
- 日付: 2026-09-06

qrcc と noter で同じ決定をしていたため、本文はルートの ADR にまとめた。この番号は欠番にせず残す
（既存の参照を壊さないため）。以下はこのプロダクトに固有の補足だけ。

## noter 固有の補足

- `no-class` の例外は `features/sync/worker/document-room.ts` だけ（Durable Object は `class` でしか書けない。[ADR-0004](0004-durable-object-class-exception.md)）
