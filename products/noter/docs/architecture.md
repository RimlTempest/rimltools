# アーキテクチャ

noter は「Markdown（Mermaid）/ YAML / TOML / JSON を複数人で同時に編集する」
1 機能に絞った Web アプリ。設計の決定は [adr/](adr/) に 1 決定 1 ファイルで記録する。
ここは全体像と、境界の**なぜ**だけを書く。

## 1. 全体像

```
ブラウザ (SPA/SSR)                        Cloudflare (Workers Free)
┌───────────────────────────┐            ┌───────────────────────────────────────────┐
│ TanStack Start (React 19) │  HTTPS     │ noter-web  (TS Worker, custom domain)     │
│ CodeMirror 6 + Yjs        │───────────▶│  ├ SSR / server functions / Better Auth   │
│ markdown-it + Mermaid     │            │  ├ D1 "noter": user, session, document,   │
│ yaml / smol-toml / jsonc  │            │  │           document_member, share_link  │
│ (解析・整形・描画は全部ここ)│            │  └ /ws/:documentId → 認可 → DO binding    │
│                           │  WSS       │                    │                      │
│ features/sync/client      │◀──────────▶│ noter-sync (TS Worker, 非公開)            │
│  (y-websocket 互換)        │            │  └ DocumentRoom (Durable Object, SQLite)  │
└───────────────────────────┘            │      ├ WebSocket Hibernation              │
                                         │      ├ Yjs doc (in-memory, 消えてよい)     │
                                         │      └ state BLOB 1 行 (alarm で集約保存) │
                                         └───────────────────────────────────────────┘
```

- **計算はブラウザ**: 構文解析・診断・整形・Markdown → HTML・Mermaid → SVG は
  すべてクライアントの JS。Worker はこれらに一切関与しない（無料枠を消費しない）。
- **web Worker は「誰が・どの文書に・どの権限で」**: Better Auth のセッションと D1 を
  持つ唯一の場所。WebSocket の Upgrade もここで認可してから DO へ渡す。
- **DO は「同じ文書を開いている全員に届ける」だけ**: 1 文書 = 1 `DocumentRoom`。
  シングルスレッドなので並行編集の順序問題が消える。CRDT（Yjs）が収束を保証するので
  DO は更新をそのまま中継し、たまに SQLite に状態を書く。

## 2. なぜ TypeScript 一本か（Rust を使わない）

- Durable Object は V8 上で動く。Rust は wasm 経由になり、Yjs（JS）との橋渡しが
  ボトルネックになる。
- リアルタイム同期の難しさは「並行処理」ではなく「収束」で、Yjs が解決済み。
  1 文書 1 DO のシングルスレッドで並行性の問題自体が存在しない。
- ツールチェーンが 1 つ減る（cargo / clippy / wasm-pack が不要）。

[ADR-0001](adr/0001-stack.md)。

## 3. Worker の分割と非公開 DO

| Worker       | 公開           | 役割                                                       |
| ------------ | -------------- | ---------------------------------------------------------- |
| `noter-web`  | custom domain  | SSR、server function、認証、認可、`/ws/` の Upgrade 受付   |
| `noter-sync` | **非公開**     | `DocumentRoom` DO を export するだけ。`fetch` は 404       |

`noter-web` は `durable_objects.bindings` に `script_name: "noter-sync"` で DO を参照する。
`noter-sync` に `routes` も `workers_dev` も無いため、DO へ到達する経路は
`noter-web` の認可済みコードだけ。だから **DO は認可しない**（役割をヘッダで受け取り信じる）。
この前提が崩れると権限昇格になるので、`routes` 追加は CI の `guard` が落とす。

[ADR-0002](adr/0002-auxiliary-worker-and-private-durable-object.md)。

## 4. リアルタイム同期

- CRDT: **Yjs**。文書本文は `Y.Text('content')` 1 本。
- ワイヤ: **y-websocket 互換**（sync = 0, awareness = 1, queryAwareness = 3）。
  クライアントは `y-websocket` の `WebsocketProvider` をそのまま使う
  （再接続・backoff・awareness 更新の実績を借りる）。
- サーバ: DO の Hibernation API（`ctx.acceptWebSocket`、`webSocketMessage` ハンドラ）。
  ping/pong は `setWebSocketAutoResponse` で DO を起こさない。
- 権限: 接続時に web Worker が `X-Noter-Role: owner|editor|viewer` を付ける。
  DO は `ws.serializeAttachment({ role, actorId })` に保存し、`viewer` からの
  sync update / awareness を無視する（受信はできる）。

詳細は [realtime-protocol.md](realtime-protocol.md)、[ADR-0003](adr/0003-realtime-yjs-on-durable-objects.md)、
[ADR-0013](adr/0013-y-websocket-wire-compatibility.md)。

## 5. 永続化

- DO の SQLite に `document_state(id INTEGER PRIMARY KEY CHECK(id = 1), state BLOB, updated_at INTEGER)` の **1 行だけ**。
- 更新はメモリの `Y.Doc` に適用して即ブロードキャスト。dirty フラグを立て、
  alarm が無ければ `setAlarm(now + 5s)`。alarm で `encodeStateAsUpdate` を 1 行 UPDATE。
- 最後のソケットが閉じたら即 flush。hibernation から起きたら SQLite から復元。
- 損失窓は最大 5 秒（Worker 落ち・デプロイ時）。クライアント側 Yjs が未送信分を
  再接続後に再送するため、**実際にはクライアントが生きている限り失われない**。

[ADR-0005](adr/0005-persistence-alarm-coalescing.md)。

## 6. 認証・共有

- Better Auth: ゲスト（anonymous plugin）+ Google。ゲストは Google 連携で昇格し、
  文書・メンバーシップは冪等に移譲される（qrcc と同じ設計、[ADR-0010](adr/0010-auth-guest-and-google.md)）。
- 共有はリンク単位: `share_link(token, document_id, role: viewer|editor, expires_at, revoked_at)`。
  リンクを開いた人は（ゲスト含め）`document_member` に自動登録され、以後 `/ws/` の
  認可はメンバーシップで判定する。リンク失効後も既存メンバーは残る（明示的に外す）。

[ADR-0011](adr/0011-sharing-model.md)。

## 7. コードの置き場所（feature 縦割り）

```
shared/contract      @noter/contract   Result / Brand / ID / base32 / text（実装依存ゼロ）
shared/ui            @noter/ui         トークン・テーマ・共通部品・CSS レイヤ
shared/webmcp        @noter/webmcp     WebMCP 登録（ADR-0012）
features/shell       @noter/shell      ルート文書・AppShell・ホーム
features/auth        @noter/auth       contract / core / server / ui
features/documents   @noter/documents  contract / core / server / ui  … D1: 文書・メンバー・共有リンク
features/sync        @noter/sync       contract / core / worker / client … DO Room ロジックと provider
features/editor      @noter/editor     core / ui … CodeMirror・presence・状態表示
features/formats     @noter/formats    core / ui … 解析・診断・整形・プレビュー（Mermaid）
apps/web             @noter/web        TanStack Start エントリ、`src/server.ts`（/ws 横取り）、migrations
apps/sync            @noter/sync-worker Worker エントリ（DO class を re-export するだけ）
e2e                  @noter/e2e        Playwright（同時編集・a11y・smoke）
tools/               oxlint plugin / markuplint（TS 6 隔離）
scripts/             wt.sh / lanes.tsv / smoke.ts
```

依存の向き: `ui → server/client → core → contract → shared/contract`。
feature 間は `@noter/<name>/<subpath>` のみ（[ADR-0007](adr/0007-feature-colocation.md)）。

## 8. ルート一覧

| パス                 | 種別            | 所有 feature | 内容                                              |
| -------------------- | --------------- | ------------ | ------------------------------------------------- |
| `/`                  | page            | shell        | 未ログイン: 説明 + 新規作成 / ログイン済: 最近の文書 |
| `/new`               | server function | documents    | 種別を受けて作成 → `/d/:id` へ redirect           |
| `/d/:documentId`     | page            | editor       | エディタ（役割に応じて read-only）                |
| `/d/:documentId/raw` | server route    | documents    | 本文を `text/plain` で返す（curl / 外部ツール向け）|
| `/s/:token`          | page            | documents    | 共有リンク入口 → メンバー登録 → `/d/:id`          |
| `/sign-in`           | page            | auth         | Google ログイン / ゲストのまま続ける              |
| `/settings/account`  | page            | auth         | アカウント連携・表示名                            |
| `/api/auth/*`        | handler         | auth         | Better Auth                                       |
| `/ws/:documentId`    | **server entry**| apps/web     | WebSocket Upgrade。ルータを通さず `src/server.ts` で処理 |

## 9. 変更するときの入口

| やりたいこと                     | 読むもの                                             |
| -------------------------------- | ---------------------------------------------------- |
| 文書種別を足す                   | `noter-architecture` スキル §3、`features/formats`   |
| 同期メッセージを足す             | `realtime-protocol.md`、ADR-0013                     |
| 権限を足す・変える               | `domain-model.md` §権限、ADR-0011                    |
| 無料枠に効く変更                 | `free-tier-budget.md`                                |
| 画面を足す                       | `design/ux.md`、`DESIGN.md`、`accessibility.md`      |
| デプロイ                         | `deployment.md`                                      |
