# ADR-0007: 機能単位の co-location でディレクトリを構成する

- 状態: Accepted → **ルートの [ADR-0012](../../../../docs/adr/0012-feature-colocation.md) に統合**（2026-09-22、plan 001 段階 3）
- 日付: 2026-09-06
- 関連: [ADR-0002](0002-auxiliary-worker-and-private-durable-object.md)

qrcc と noter で同じ決定をしていたため、本文はルートの ADR にまとめた。この番号は欠番にせず残す
（既存の参照を壊さないため）。以下はこのプロダクトに固有の補足だけ。

## noter 固有の補足

noter のレイヤ（Rust は無く、代わりに Durable Object とブラウザ側の同期アダプタがある）:

```
features/<name>/
├─ contract/    型・API 契約
├─ core/        純粋ロジック（I/O なし、throw しない）
├─ ui/          React・CSS・テスト・<name>.route.tsx・<name>-wiring.route.ts
├─ server/      TanStack server functions / server routes（noter-web で動く）
├─ worker/      Durable Object の殻（features/sync のみ。ADR-0004）
└─ client/      ブラウザ側 I/O アダプタ（features/sync のみ。WebsocketProvider の包み）

shared/
├─ contract/    Result・Brand・共通 ID・DocumentKind・Role・上限値
├─ ui/          デザインシステム（トークン・基本コンポーネント）
└─ webmcp/      WebMCP ツール登録（ADR-0012）

apps/
├─ web/         薄いシェル。Vite/Wrangler 設定、router、URL 構成、src/server.ts（WS 中継）
└─ sync/        薄いシェル。DocumentRoom を re-export するだけ
```

- `features/<name>/ui/<name>-wiring.route.ts` が composition root（依存の配線）
- 同期の「DO 側」と「ブラウザ側」が `features/sync/worker` と `features/sync/client` で隣り合い、プロトコルの契約（`features/sync/contract`）を共有する
- `features/sync/core` は Yjs に依存してよい（Yjs は I/O を持たない純粋ライブラリ）が、`cloudflare:workers` に依存してはならない
