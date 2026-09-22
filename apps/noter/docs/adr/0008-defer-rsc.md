# ADR-0008: React Server Components を当面無効にする

- 状態: Accepted → **ルートの [ADR-0011](../../../../docs/adr/0011-defer-rsc.md) に統合**（2026-09-22、plan 001 段階 3）
- 日付: 2026-09-06

qrcc と noter で同じ決定をしていたため、本文はルートの ADR にまとめた。この番号は欠番にせず残す
（既存の参照を壊さないため）。以下はこのプロダクトに固有の補足だけ。

## noter 固有の補足

- エディタ画面は SSR の後にクライアントが WebSocket を張って初めて意味を持つ。サーバでレンダリングする価値があるのはシェルとホーム一覧だけ
- `apps/web/src/server.ts` のカスタム server entry（WS 中継）は RSC と無関係に動く
