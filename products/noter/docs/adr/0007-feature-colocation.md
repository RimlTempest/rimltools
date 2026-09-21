# ADR-0007: 機能単位の co-location でディレクトリを構成する

- 状態: Accepted
- 日付: 2026-09-06
- 関連: qrcc ADR-0007 を移植・改訂 / [ADR-0002](0002-auxiliary-worker-and-private-durable-object.md)

## 文脈

qrcc でレイヤ別構成（`packages/contracts`, `packages/core`, `packages/ui`, …）を
機能別に組み替え、「1 機能 = 1 ディレクトリ = 1 並行レーン」が成立した。
noter も同じ構成を採る。ただし Rust（`engine/` / `worker/`）が無く、代わりに
Durable Object とブラウザ側の同期アダプタがある。

## 決定

**トップレベルを機能で割り、1 機能に必要なものを 1 ディレクトリへ集める。**

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

各 feature は Bun workspace パッケージ（`@noter/<name>`）で、
**公開面は `exports` に列挙したサブパスだけ**。feature 同士は
`@noter/<name>/<subpath>` 経由でのみ依存し、相対パスで他 feature に手を伸ばさない。

## ルートの co-location

TanStack Router の virtual file routes を使い、ルートの実体を feature 内に置く。

- `apps/web/tsr.config.json` … `routesDirectory` をリポジトリルートの `features/` に向ける
- `apps/web/src/routes.ts` … URL 構造だけを宣言する唯一の横断ファイル
- `features/<name>/ui/<name>.route.tsx` … ルート定義（`createFileRoute`）
- `features/<name>/ui/<name>-screen.tsx` … 画面コンポーネント（feature 所有・テスト対象）
- `features/<name>/ui/<name>-wiring.route.ts` … composition root（依存の配線）

`*.route.tsx` は **apps/web の TypeScript プログラムに属する**（`routeTree.gen.ts` の
`Register` 型拡張が必要なため）。feature 側の `tsconfig.json` は `*.route.tsx` を
`exclude` し、apps/web が `../../features/*/ui/*.route.tsx` を `include` する。

## 理由

- 変更が 1 ディレクトリに閉じる。「TOML の診断を直す」は `features/formats/` の中だけ
- レーンと所有ディレクトリが 1:1（`docs/parallel-lanes.md`）
- 同期の「DO 側」と「ブラウザ側」が `features/sync/worker` と `features/sync/client` で
  隣り合い、プロトコルの契約（`features/sync/contract`）を共有する

## 帰結

- feature を足す = ディレクトリを足す + `apps/web/src/routes.ts` に 1 行
- feature を消す = ディレクトリを消す + その 1 行を消す
- `features/sync/core` は Yjs に依存してよい（Yjs は I/O を持たない純粋ライブラリ）が、
  `cloudflare:workers` に依存してはならない
